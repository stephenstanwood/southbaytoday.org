import assert from "node:assert/strict";
import test from "node:test";
import { assessFoodSourceFreshness, fetchSccFoodPage, generateFoodBlurbMap,
  isNeutralInspectionBlurb, hasSourceBackedFoodType } from "./scc-food-generation.mjs";

const items = [{ id: "inspection-a", name: "Same Cafe" }, { id: "inspection-b", name: "Same Cafe" }];
const rows = [{ id: items[0].id, blurb: "Cafe on Ellis Street in Mountain View." },
  { id: items[1].id, blurb: "Coffee shop on Main Street in San Jose." }];
function response(blurbs = rows, extra = {}) {
  return { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "private" },
    { type: "text", text: JSON.stringify({ blurbs }) }], usage: { output_tokens: 700 }, ...extra };
}
async function run(replies, input = items) {
  const requests = [], diagnostics = [];
  const map = await generateFoodBlurbMap({ items: input, prompt: "source facts", label: "Test blurbs",
    createMessage: async (request) => {
      requests.push(request);
      const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
      if (reply instanceof Error) throw reply;
      return reply;
    }, onDiagnostic: (value) => diagnostics.push(value) });
  return { map, requests, diagnostics };
}

test("structured responses skip thinking and bind same-name branches by exact ID", async () => {
  const { map, requests, diagnostics } = await run([response()]);
  assert.deepEqual(map, Object.fromEntries(rows.map((row) => [row.id, row.blurb])));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].output_config.format.type, "json_schema");
  assert.equal(requests[0].output_config.effort, "low");
  assert.equal(diagnostics[0].stopReason, "end_turn");
  assert.equal(diagnostics[0].response, undefined);
});

test("truncation retains exact rejected response, retries once with a larger budget", async () => {
  const truncated = response([], { stop_reason: "max_tokens", content: [{ type: "text", text: '{"blurbs":[{"id":"inspection-a","blurb":"Cafe' }] });
  const { map, requests, diagnostics } = await run([truncated, response()]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].max_tokens, 3072);
  assert.equal(requests[1].max_tokens, 4608);
  assert.deepEqual(diagnostics[0].response, truncated);
  assert.equal(diagnostics[0].accepted, 0);
  assert.equal(Object.keys(map).length, 2);
});

test("even syntactically complete max_tokens responses are not salvaged", async () => {
  const { map, requests } = await run([response(rows, { stop_reason: "max_tokens" })]);
  assert.deepEqual(map, {});
  assert.equal(requests.length, 2);
});

test("malformed JSON and wrong shapes exhaust only two attempts and preserve null fallback", async () => {
  for (const text of ['{"blurbs":[', "null", "[]", '{"blurbs":{}}', '{"blurbs":[],"unexpected":1}']) {
    const { map, requests, diagnostics } = await run([response([], { content: [{ type: "text", text }] })]);
    assert.deepEqual(map, {});
    assert.equal(requests.length, 2);
    assert.ok(diagnostics.every((diagnostic) => diagnostic.error));
  }
});

test("partial valid rows survive a retry without being overwritten", async () => {
  const { map, requests } = await run([response([rows[0]]), response([
    { ...rows[0], blurb: "Different line." }, rows[1],
  ])]);
  assert.equal(requests.length, 2);
  assert.equal(map[rows[0].id], rows[0].blurb);
  assert.equal(map[rows[1].id], rows[1].blurb);
});

test("unknown IDs, duplicate IDs, extra properties and invalid values cannot attach blurbs", async () => {
  const invalid = [
    [{ id: "not-requested", blurb: "Cafe." }],
    [rows[0], { ...rows[0], blurb: "Conflicting cafe." }],
    [{ ...rows[0], name: "Extra property" }],
    [{ id: rows[0].id, blurb: {} }], [{ id: rows[0].id, blurb: 42 }],
    [{ id: rows[0].id, blurb: " " }], [{ id: rows[0].id, blurb: "x".repeat(201) }],
    [{ id: rows[0].id, blurb: "word ".repeat(13) }], [null],
  ];
  for (const blurbs of invalid) {
    const { map } = await run([response(blurbs)]);
    assert.deepEqual(map, {});
  }
});

test("intentional null descriptions satisfy coverage without a retry", async () => {
  const { map, requests } = await run([response(rows.map((row) => ({ id: row.id, blurb: null })))]);
  assert.deepEqual(map, { "inspection-a": null, "inspection-b": null });
  assert.equal(requests.length, 1);
});

test("valid JSON with unsupported type detail uses null without a generation retry", async () => {
  for (const blurb of ["Flower shop or eatery on Santana Row.", "Possibly a cafe on Main Street."]) {
    const { map, requests, diagnostics } = await run([response([{ id: rows[0].id, blurb }])], [items[0]]);
    assert.equal(map[items[0].id], blurb);
    assert.equal(requests.length, 1);
    assert.equal(diagnostics[0].error, null);
    const publishedBlurb = hasSourceBackedFoodType(map[items[0].id], items[0].name) ? map[items[0].id] : null;
    assert.equal(publishedBlurb, null);
  }
});

test("request failures are bounded and auth errors/refusals do not repeat", async () => {
  assert.equal((await run([new Error("timeout")])).requests.length, 2);
  for (const status of [400, 401, 403, 404]) {
    const { map, requests } = await run([Object.assign(new Error("request failed"), { status })]);
    assert.deepEqual(map, {});
    assert.equal(requests.length, 1);
  }
  const { map, requests } = await run([response([], { stop_reason: "refusal" })]);
  assert.deepEqual(map, {});
  assert.equal(requests.length, 1);
});

test("empty lists make no request and published slice bounds are enforced", async () => {
  assert.equal((await run([], [])).requests.length, 0);
  await assert.rejects(run([], [...items, items[0]]), /unique source IDs/);
  await assert.rejects(run([], Array.from({ length: 13 }, (_, id) => ({ id: String(id) }))), /at most 12/);
});

const now = Date.parse("2026-10-22T04:00:00Z");
const freshSource = {
  now, updatedAt: "Mon, 12 Oct 2026 13:35:45 GMT",
  rawInspections: [{ final_inspection: "2026-10-12T00:00:00.000" }],
  inspections: [{ inspectionDate: "2026-10-07" }],
};

test("October's excluded newer rows leave a current source and a quiet eligible list", () => {
  const health = assessFoodSourceFreshness(freshSource);
  assert.equal(health.status, "current");
  assert.equal(health.updatedAt, "2026-10-12T13:35:45.000Z");
  assert.equal(health.newestRawInspection, "2026-10-12");
  assert.equal(health.newestEligibleInspection, "2026-10-07");
  assert.equal(health.eligibleStatus, "quiet");
});

test("empty eligible output is not a source failure", () => {
  const health = assessFoodSourceFreshness({ ...freshSource, inspections: [] });
  assert.equal(health.status, "current");
  assert.equal(health.eligibleStatus, "empty");
});

test("a stale source is detected even with empty or recent eligible records", () => {
  for (const inspections of [[], [{ inspectionDate: "2026-10-21" }]]) {
    assert.equal(assessFoodSourceFreshness({ ...freshSource, updatedAt: "2026-10-01T00:00:00Z", inspections }).status, "stale");
  }
});

test("missing, invalid or future source timestamps remain unknown", () => {
  for (const updatedAt of [null, undefined, "invalid", "2027-01-01T00:00:00Z"]) {
    const health = assessFoodSourceFreshness({ ...freshSource, updatedAt });
    assert.equal(health.status, "unknown");
    assert.equal(health.ageDays, null);
  }
});

test("source alert starts only after the full 14-day threshold", () => {
  const updatedAt = "2026-10-01T00:00:00Z";
  assert.equal(assessFoodSourceFreshness({ updatedAt, now: Date.parse("2026-10-15T00:00:00Z") }).status, "current");
  assert.equal(assessFoodSourceFreshness({ updatedAt, now: Date.parse("2026-10-15T00:00:01Z") }).status, "stale");
});

test("SODA source metadata is independent of the row dates and request time", async () => {
  const result = await fetchSccFoodPage("https://example.test/records", { fetchImpl: async (_url, options) => {
    assert.ok(options.signal);
    return new Response(JSON.stringify(freshSource.rawInspections), {
      headers: { "x-soda2-truth-last-modified": freshSource.updatedAt, "last-modified": "Wed, 21 Oct 2026 00:00:00 GMT" },
    });
  } });
  assert.equal(result.updatedAt, freshSource.updatedAt);
  assert.deepEqual(result.rows, freshSource.rawInspections);
});

test("last-modified fallback and genuinely missing metadata stay distinct", async () => {
  for (const headers of [{ "last-modified": freshSource.updatedAt }, {}]) {
    const result = await fetchSccFoodPage("https://example.test/records", {
      fetchImpl: async () => new Response("[]", { headers }),
    });
    assert.equal(result.updatedAt, headers["last-modified"] ?? null);
    assert.deepEqual(result.rows, []);
  }
});

test("HTTP, timeout, malformed JSON and wrong-shape failures never return a replacement array", async () => {
  for (const fetchImpl of [
    async () => new Response("unavailable", { status: 503 }),
    async () => { throw new Error("timeout"); },
    async () => new Response("<html>not JSON"),
    async () => new Response('{"error":"not rows"}'),
  ]) {
    await assert.rejects(fetchSccFoodPage("https://example.test/records", { fetchImpl }),
      (error) => error.code === "SCC_SOURCE_REQUEST_FAILED");
  }
});

test("inspection blurbs cannot turn inspections into opening or operating claims", () => {
  for (const blurb of ["New cafe on Main Street.", "Cafe now operating on Main Street.",
    "Recently opened bakery.", "Coffee shop opening soon.", "Open for coffee."]) {
    assert.equal(isNeutralInspectionBlurb(blurb), false);
  }
  assert.equal(isNeutralInspectionBlurb("Cafe on Main Street in San Jose."), true);
  assert.equal(isNeutralInspectionBlurb(null), false);
});

test("unstated brand/type modifiers fall back instead of becoming permit facts", () => {
  for (const [name, blurb] of [["Flora", "Flower shop on Santana Row."],
    ["More Yogurt", "Frozen yogurt shop planned on Vallco Parkway."],
    ["Blendid #5 City Sports", "Vending-style food business planned on Saratoga Avenue."],
    ["IHOP Restaurant", "IHOP pancake restaurant planned on Story Road."],
    ["Hashtag India", "Indian restaurant planned on Serra Way."]]) {
    assert.equal(hasSourceBackedFoodType(blurb, name), false);
  }
  for (const [name, blurb] of [["Flora", "Food business planned at Santana Row."],
    ["Golden Pin Donuts", "Donut shop on South Winchester Boulevard."],
    ["Xom Cafe -Coffee Bar", "Coffee bar on East Santa Clara Street."],
    ["More Yogurt", "Yogurt shop planned on Vallco Parkway."]]) {
    assert.equal(hasSourceBackedFoodType(blurb, name), true);
  }
});
