import assert from "node:assert/strict";
import test from "node:test";
import { eventSourceDefinitions, fetchBiblioEvents, fetchScclEvents } from "../generate-events.mjs";
import { buildSourceHealth, eventsForSourceResult, retainFailedOptionalSources, sourceProblems } from "../lib/event-source-health.mjs";

for (const [name, fetchEvents] of [
  ["SJPL/Palo Alto", () => fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose")],
  ["SCCL", fetchScclEvents],
]) {
  test(`${name} pagination failures remain failures outside strict mode`, async (t) => {
    const original = globalThis.fetch;
    t.after(() => { globalThis.fetch = original; });
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response("Forbidden", { status: 403 });
    };
    await assert.rejects(fetchEvents(), /403/);
    assert.equal(calls, 1, "an access refusal must not trigger retries or alternate routes");
  });
}

test("the registered library adapters retain future listings without hiding failed fetches", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response("Forbidden", { status: 403 });
  const libraries = eventSourceDefinitions().filter(source => [
    "fetchSjplEvents", "fetchScclEvents", "fetchPaloAltoLibraryEvents",
  ].includes(source.id));
  assert.equal(libraries.length, 3);
  const failure = await Promise.allSettled(libraries.map(source => source.fn()));
  const observedAt = "2026-10-31T04:00:00.000Z";
  const previous = {
    generatedAt: observedAt,
    events: libraries.flatMap((source, index) => [
      { id: `library-${index}`, source: source.label, title: "Previously verified library program",
        date: "2026-11-03", time: "11:00 AM", registration: "required",
        attendanceNote: "By appointment only. One appointment per week.", virtual: index === 0 },
      { id: `expired-${index}`, source: source.label, date: "2026-10-31", time: "11:00 AM" },
    ]),
  };
  const results = retainFailedOptionalSources(libraries, failure, previous, { today: "2026-11-01" });
  const retained = results.flatMap(eventsForSourceResult);
  assert.deepEqual(retained, previous.events.filter(event => !event.id.startsWith("expired-")));
  const health = buildSourceHealth(libraries, results);
  assert.deepEqual(health.map(source => [source.status, source.count, source.retainedCount, source.retainedFrom]),
    libraries.map(() => ["error", 0, 1, observedAt]));
  assert.equal(sourceProblems(health).tolerated.length, 3);
  const repeated = retainFailedOptionalSources(libraries, failure, {
    generatedAt: "2026-11-01T08:00:00.000Z", events: retained, sourceHealth: health,
  }, { today: "2026-11-02" });
  assert.ok(repeated.every(result => result.retained.from === observedAt));
  const success = libraries.map(() => ({ status: "fulfilled", value: [] }));
  assert.deepEqual(retainFailedOptionalSources(libraries, success, previous, { today: "2026-11-01" })
    .flatMap(eventsForSourceResult), [], "an actual empty calendar replaces old rows");
});

test("a later failed page cannot publish a partial library calendar as success", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const fetchEvents of [
    () => fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose"), fetchScclEvents,
  ]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls > 1) return new Response("Forbidden", { status: 403 });
      // A past record still establishes a non-empty first page. The next
      // page's refusal must not be converted into successful empty output.
      return Response.json({ entities: { events: { past: { id: "past", definition: {
        title: "Past library program", start: "2000-01-01T10:00", end: "2000-01-01T11:00",
        branchLocationId: "CA",
      } } } } });
    };
    await assert.rejects(fetchEvents(), /403/);
    assert.equal(calls, 2);
  }
});
