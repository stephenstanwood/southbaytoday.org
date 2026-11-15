import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cleanTitle, cleanVenue, fetchSjsuEvents, polishDescription, stripRedundantVenueSuffix } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-15-reading.json", import.meta.url)));
const venue = "Dr. Martin Luther King, Jr. Library";

test("the captured SJSU reading retains its verified library and free public admission after source refresh", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.reviewedAt) });
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    assert.equal(url.origin, "https://events.sjsu.edu");
    if (url.pathname === "/calendar.xml") return new Response(fixture.rss);
    assert.equal(url.pathname, "/api/2/events");
    return Response.json({ page: { total: 1 }, events: [{ event: fixture.localist }] });
  });
  assert.equal(fixture.localist.free, false, "the opt-in flag is unset despite the explicit public-admission sentence");
  assert.match(fixture.localist.description_text, /This event is free and open to the public\./);
  const [event] = await fetchSjsuEvents();
  event.title = stripRedundantVenueSuffix(cleanTitle(event.title), cleanVenue(event.venue));
  event.description = polishDescription(event.description);
  assert.equal(event.description, "", "the clipped excerpt contains no complete sentence; do not invent one");
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.venue, venue);
  assert.equal(event.cost, "free");
  for (const field of ["id", "title", "date", "time", "endTime", "address", "url", "category"])
    assert.deepEqual(event[field], fixture.event[field], field);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("cached publication repairs the incomplete venue without changing the reading's other facts", async () => {
  const event = structuredClone(fixture.event);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.venue, venue);
  assert.equal(event.cost, "free");
  assert.equal(event.blurb, fixture.event.blurb.replace("at Martin Luther King Jr. in", `at ${venue} in`));
  for (const field of Object.keys(fixture.event).filter(key => !["venue", "cost", "blurb"].includes(key)))
    assert.deepEqual(event[field], fixture.event[field], field);
  await resolveEventBlurbs([event], { enabled: false });
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("the dated reading repair preserves later prices, source copy, attendance gates and changed occurrences", () => {
  for (const change of [
    { date: "2027-11-19" }, { time: "8:00 PM" }, { endTime: "8:00 PM" },
    { source: "Another publisher" }, { virtual: true }, { city: "palo-alto" },
    { url: "https://events.sjsu.edu/event/another-reading" },
    { venue: "Another venue" }, { address: "Another address" },
    { title: "Another reading" }, { cost: "paid" }, { costNote: "Tickets $10" },
    { description: "The organizer has published new attendance instructions." },
  ]) {
    const event = { ...fixture.event, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event, JSON.stringify(change));
  }
  for (const registration of ["required", "full", "closed", "appointment"]) {
    const event = { ...fixture.event, registration, attendanceNote: "Later organizer notice." };
    const actual = applyVerifiedEventFacts(event);
    assert.equal(actual.registration, registration);
    assert.equal(actual.attendanceNote, event.attendanceNote);
    assert.equal(actual.venue, venue);
    assert.equal(actual.cost, "free");
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  }
});
