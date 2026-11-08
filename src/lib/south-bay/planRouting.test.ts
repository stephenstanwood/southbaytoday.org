import test from "node:test";
import assert from "node:assert/strict";
import { generateDayPlan, pickPillarPairsWithClaude } from "../../pages/api/plan-day";
import { dayPlanPairingIssues } from "./dayPlanPairs";

test("public planner always requests Sonnet 5.5; identical input makes one paid call", async t => {
  const original = globalThis.fetch, oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test";
  let requests = 0;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.includes("api.anthropic.com")) throw Error("offline weather fixture");
    requests++;
    const body = JSON.parse(init.body);
    assert.equal(body.model, "claude-sonnet-5-5");
    assert.equal(body.max_tokens, 4096);
    assert.deepEqual(body.thinking, { type: "between_tools" });
    assert.equal(body.output_config.format.type, "json_schema");
    assert.deepEqual(body.output_config.format.schema.required, ["pairs"]);
    const prompt = body.messages[0].content;
    const pairs = ["morning", "afternoon", "evening"].map(bucket => {
      const section = prompt.split(`${bucket.toUpperCase()} PILLAR CANDIDATES\n`)[1];
      const ids = [...section.matchAll(/\[([^\]]+)\]/g)];
      return { pillarBucket: bucket, pillarId: ids[0][1], mealId: ids[1][1], pillarBlurb: "Supplied source fact.", mealBlurb: "Supplied source fact." };
    });
    return new Response(JSON.stringify({ id: "test-message", model: body.model, type: "message", role: "assistant", stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ pairs }) }], usage: { input_tokens: 20, output_tokens: 10 } }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey; });
  const request: any = { city: "campbell", scope: "regional", kids: false, planDate: "2026-10-29", model: "claude-opus-5-5" };
  const result = await generateDayPlan(request);
  assert.equal(result.status, 200, await result.clone().text());
  const plan = await result.json();
  assert.equal(plan.editorialModel, "claude-sonnet-5-5");
  assert.equal(plan.editorialProvider, "anthropic-api");
  assert.deepEqual(dayPlanPairingIssues(plan.cards), []);
  assert.deepEqual(await (await generateDayPlan(request)).json(), plan);
  assert.equal(requests, 1);
});

test("scheduled selector failure propagates without making a paid API call", async t => {
  const original = globalThis.fetch;
  let anthropicCalls = 0;
  globalThis.fetch = (async (input: any) => {
    if (String(input).includes("anthropic")) anthropicCalls++;
    throw Error("offline fixture");
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  const response = await generateDayPlan({ city: "campbell", kids: true, planDate: "2026-10-29" } as any,
    { provider: "codex-subscription", model: "gpt-6.1-sol", strict: true, select: async () => { throw Error("subscription capped"); } });
  assert.equal(response.status, 500);
  assert.match(await response.text(), /subscription capped/);
  assert.equal(anthropicCalls, 0);
});

test("different showtime IDs cannot repeat an activity or transfer its blurb to the replacement", async () => {
  const base = { source: "event", category: "arts", city: "campbell", address: "1 Main St", lat: 37.3, lng: -121.9,
    locationPrecision: "exact", kidFriendly: true, eventDate: "2026-11-08", score: 100 };
  const pool: any[] = [
    { ...base, id: "event:show-10am", name: "The Dragon Musical Jr.", eventTime: "10:00 AM" },
    { ...base, id: "event:show-2pm", name: "The Dragon Musical Jr.", eventTime: "2:00 PM" },
    { ...base, id: "event:exhibit", name: "Photography Exhibit", eventTime: "2:00 PM", score: 60 },
    { ...base, id: "event:jazz", name: "Jazz Concert", eventTime: "6:00 PM" },
    ...["Olive", "Maple", "Willow"].map((name, i) => ({ ...base, id: `place:meal-${i}`, name: `${name} Cafe`,
      source: "place", category: "food", primaryType: "restaurant", types: ["cafe", "restaurant"],
      hours: { sun: "8:00 AM - 10:00 PM" }, rating: 4.8, ratingCount: 500 })),
  ];
  const { cards } = await pickPillarPairsWithClaude(pool, [], null, "campbell", "regional", true,
    undefined, "2026-11-08", undefined, "sun", {
      provider: "codex-subscription", model: "gpt-6.1-sol", strict: true,
      select: async () => JSON.stringify([
        { pillarBucket: "morning", pillarId: "event:show-10am", mealId: "place:meal-0", pillarBlurb: "The morning show.", mealBlurb: "Olive cafe fact." },
        { pillarBucket: "afternoon", pillarId: "event:show-2pm", mealId: "place:meal-1", pillarBlurb: "WRONG_MUSICAL_COPY", mealBlurb: "Maple cafe fact." },
        { pillarBucket: "evening", pillarId: "event:jazz", mealId: "place:meal-2", pillarBlurb: "The jazz show.", mealBlurb: "Willow cafe fact." },
      ]),
    });
  assert.equal(cards.find(c => c.bucket === "morning")?.id, "event:show-10am");
  assert.equal(cards.find(c => c.bucket === "afternoon")?.id, "event:exhibit");
  assert.doesNotMatch(cards.find(c => c.bucket === "afternoon")!.blurb, /WRONG_MUSICAL_COPY/);
  assert.deepEqual(dayPlanPairingIssues(cards), []);
  const broken = structuredClone(cards);
  broken.find(c => c.bucket === "afternoon")!.name = "THE DRAGON MUSICAL JR!";
  assert.ok(dayPlanPairingIssues(broken).some(issue => issue.includes("duplicate pillar activity")));
});
