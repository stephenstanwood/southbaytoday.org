import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchStanfordEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-11-midday.json", import.meta.url)));

test("a source-declared tour keeps its exact session despite months of art-collection series bounds", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.checkedAt) });
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    calls.push(String(url));
    return Response.json({ events: [{ event: fixture.stanford }] });
  });
  const [event] = await fetchStanfordEvents();
  assert.deepEqual(calls, ["https://events.stanford.edu/api/2/events?days=60&pp=200"], "reuse the existing source request");
  assert.equal(event.id, "stanford-52825303977410-2026-11-12");
  assert.equal(event.date, "2026-11-12");
  assert.equal(event.time, "4:00 PM");
  assert.equal(event.endTime, "4:30 PM");
  assert.equal(event.ongoing, false);
  assert.equal(event.registration, "required");
});

test("tour metadata cannot keep a past session alive, while a figurative exhibition title retains its run", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.checkedAt) });
  const source = fixture.stanford;
  const events = [
    { ...source, id: 1, title: "Exploring the Collection", last_date: "2026-12-01",
      event_instances: [{ event_instance: { start: "2026-11-10T16:00:00-08:00", end: "2026-11-10T16:30:00-08:00" } }] },
    { ...source, id: 2, title: "A Tour of Modern Art", last_date: "2026-12-01",
      description_text: "An exhibition of works from the collection.", filters: { event_types: [{ name: "Exhibition" }] } },
  ];
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: events.map(event => ({ event })) }));
  const result = await fetchStanfordEvents();
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "stanford-2");
  assert.equal(result[0].date, "2026-11-11");
  assert.equal(result[0].ongoing, true);
  assert.equal(result[0].time, null);
});

test("retained Denning and basketball cards recover verified facts through cached publication", async () => {
  const rows = structuredClone(fixture.events);
  await resolveEventBlurbs(rows, { enabled: false });
  const tour = rows.find(event => event.source === "Stanford Events");
  assert.equal(tour.date, "2026-11-12");
  assert.equal(tour.time, "4:00 PM");
  assert.equal(tour.endTime, "4:30 PM");
  assert.equal(tour.ongoing, false);
  assert.equal(tour.registration, "required");
  const game = rows.find(event => event.source === "City Newsletter");
  assert.equal(game.url, fixture.ticket.url);
  assert.equal(game.venue, fixture.ticket.location.name);
  assert.equal(game.address, "500 El Camino Real, Santa Clara, CA 95053");
  assert.equal(game.cost, "paid");
  assert.equal(game.date, "2026-11-13");
  assert.equal(game.time, "7:00 PM");
  assert.equal(game.endTime, null, "do not infer a finish from a ticketing window");
  for (const event of rows) assert.deepEqual(applyVerifiedEventFacts(event), event, "corrections are idempotent");
});

test("exact source corrections preserve later availability and leave other dates, links and venues alone", () => {
  const tour = fixture.events.find(event => event.source === "Stanford Events");
  for (const registration of ["full", "closed", "appointment-only"]) {
    const corrected = applyVerifiedEventFacts({ ...tour, registration });
    assert.equal(corrected.registration, registration);
  }
  for (const event of fixture.events) {
    for (const change of [{ date: "2028-11-13" }, { url: "https://example.org/another-event" }, { venue: "Another venue" }]) {
      const unrelated = { ...event, ...change };
      assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
    }
  }
});
