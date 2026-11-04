import assert from "node:assert/strict";
import test from "node:test";
import { eventSourceDefinitions } from "../generate-events.mjs";
import { buildSourceHealth, eventsForSourceResult, retainFailedOptionalSources, sourceProblems } from "../lib/event-source-health.mjs";

const source = () => eventSourceDefinitions().find(item => item.id === "fetchStanfordEvents");
const observedAt = "2026-11-04T13:04:10.179Z";
const previous = {
  generatedAt: observedAt,
  events: [
    { id: "stanford-noon", source: "Stanford Events", title: "Noon concert",
      date: "2026-11-04", time: "12:30 PM", venue: "Braun Music Center", cost: "free" },
    { id: "stanford-online", source: "Stanford Events", title: "Public online talk",
      date: "2026-11-05", time: "4:00 PM", virtual: true, registration: "required",
      attendanceNote: "Public attendance is via Zoom." },
    { id: "stanford-expired", source: "Stanford Events", date: "2026-11-03", time: "12:00 PM" },
    { id: "other-calendar", source: "Other calendar", date: "2026-11-05", time: "12:00 PM" },
  ],
};

test("Stanford fetch failures stay rejected outside strict mode without retrying access refusals", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    requests++;
    return new Response("Forbidden", { status: 403 });
  });
  await assert.rejects(source().fn(), /403/);
  assert.equal(requests, 1);
});

test("the registered Stanford adapter retains verified future occurrences while its timeout remains visible", () => {
  const adapter = source();
  const failure = [{ status: "rejected", reason: new Error("The operation was aborted due to timeout") }];
  const results = retainFailedOptionalSources([adapter], failure, previous, { today: "2026-11-04" });
  assert.deepEqual(results.flatMap(eventsForSourceResult), previous.events.slice(0, 2));
  assert.notEqual(results[0].retained.events[0], previous.events[0]);
  const [health] = buildSourceHealth([adapter], results);
  assert.equal(health.status, "error");
  assert.equal(health.count, 0);
  assert.equal(health.retainedCount, 2);
  assert.equal(health.retainedFrom, observedAt);
  assert.match(health.error, /timeout/);
  assert.equal(sourceProblems([health]).tolerated.length, 1);
  const repeated = retainFailedOptionalSources([adapter], failure, {
    generatedAt: "2026-11-05T13:00:00.000Z", events: results.flatMap(eventsForSourceResult), sourceHealth: [health],
  }, { today: "2026-11-05" });
  assert.deepEqual(repeated.flatMap(eventsForSourceResult), [previous.events[1]]);
  assert.equal(repeated[0].retained.from, observedAt);
});

test("a successful empty Stanford calendar replaces prior listings", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [] }));
  const adapter = source();
  const settled = await Promise.allSettled([adapter.fn()]);
  const results = retainFailedOptionalSources([adapter], settled, previous, { today: "2026-11-04" });
  assert.deepEqual(results.flatMap(eventsForSourceResult), []);
  assert.equal(buildSourceHealth([adapter], results)[0].status, "empty");
});

test("a malformed Stanford response cannot masquerade as a successful empty calendar", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "Temporarily unavailable" }));
  await assert.rejects(source().fn(), /no events array/);
});
