import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchStanfordEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-10-stream.json", import.meta.url)));

test("Stanford preserves stream registration instructions without guessing a price or gating hybrid attendance", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-11T05:07:05Z") });
  const source = fixture.stanford;
  const cases = [
    {},
    { stream_info: "<p>Registration is full.</p>" },
    { stream_info: "<p>Registration is closed.</p>" },
    { stream_info: "<p>Registration is optional.</p>" },
    { stream_info: "", ticket_url: source.ticket_url },
    { experience: "hybrid" },
  ];
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: cases.map((changes, index) => ({ event: {
      ...structuredClone(source), id: source.id + index,
      event_instances: [source.event_instances[0]], ...changes,
    } })) });
  });
  const events = await fetchStanfordEvents();
  assert.equal(events.length, cases.length);
  assert.equal(events[0].registration, "required");
  assert.equal(events[0].attendanceNote, "Register to receive a Zoom link via email.");
  assert.equal(events[0].cost, null, "an unset Localist free flag and a signup URL do not establish a price");
  assert.equal(events[0].virtual, true);
  assert.equal(events[0].date, "2026-11-12");
  assert.equal(events[0].time, "8:30 AM");
  assert.equal(events[0].endTime, "9:30 AM");
  assert.equal(events[1].registration, "full");
  assert.equal(events[2].registration, "closed");
  for (const event of events.slice(3)) assert.equal(event.registration, undefined);
  assert.equal(events[5].virtual, undefined);
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required");
  assert.equal(events[0].attendanceNote, "Register to receive a Zoom link via email.");
  assert.equal(events[1].registration, "full");
  assert.equal(events[2].registration, "closed");
});

test("the exact SCU basketball occurrence keeps its source finish through cached publication", async () => {
  const source = fixture.events.find(event => event.id === "scu-64af2bba1e9e8b22");
  assert.equal(fixture.scuSchema.endDate, "2026-11-18T05:00:00+00:00");
  const event = applyVerifiedEventFacts(source);
  assert.equal(event.endTime, "9:00 PM");
  assert.equal(event.time, "7:00 PM");
  assert.equal(event.date, "2026-11-17");
  assert.equal(event.cost, source.cost);
  assert.equal(event.registration, source.registration);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.endTime, "9:00 PM");
  assert.deepEqual(applyVerifiedEventFacts(event), event);
  for (const changes of [{ date: "2027-11-17" }, { url: "https://example.org/another-game" }, { venue: "Another venue" }, { time: "6:00 PM" }]) {
    const other = { ...source, ...changes };
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});
