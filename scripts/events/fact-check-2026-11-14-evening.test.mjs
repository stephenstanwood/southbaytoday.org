import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { backfillVerifiedEventTimes } from "../generate-events.mjs";
import { deduplicateEventSlots } from "../lib/event-url-dedup.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-14-evening.json", import.meta.url)));

test("the two verified newsletter concert aliases become one paid occurrence", () => {
  const corrected = fixture.marcAliases.map(applyVerifiedEventFacts);
  const [event] = deduplicateEventSlots(corrected);
  assert.equal(deduplicateEventSlots(corrected).length, 1);
  assert.equal(event.title, "Marc Broussard");
  assert.equal(event.venue, "Montalvo Arts Center");
  assert.equal(event.url, fixture.marcOfficial.url);
  assert.equal(event.cost, "paid");
  assert.equal(event.date, "2026-11-13");
  assert.equal(event.time, "7:30 PM");
  assert.equal(event.address, "15400 Montalvo Rd, Saratoga, CA 95070");
  assert.deepEqual(fixture.marcAliases.map(e => e.title), ["Bayou Soul with Marc Broussard", "Marc Broussard Concert"]);
});

test("a freshly returned organizer record wins over its longer newsletter copies", () => {
  const events = [...fixture.marcAliases, fixture.marcOfficial].map(applyVerifiedEventFacts);
  const kept = deduplicateEventSlots(events);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, fixture.marcOfficial.id);
  assert.deepEqual(kept[0].occurrenceEvidence, fixture.marcOfficial.occurrenceEvidence);
});

test("canonical concert identity is applied after unknown newsletter clocks are recovered", async () => {
  const events = fixture.marcAliases.map(e => ({ ...e, time: null }));
  await backfillVerifiedEventTimes(events, { backfill: async rows => rows.forEach(e => { e.time = "7:30 PM"; }) });
  assert.equal(deduplicateEventSlots(events).length, 1);
  assert(events.every(e => e.url === fixture.marcOfficial.url && e.title === "Marc Broussard"));
  for (const change of [{ date: "2027-11-13" }, { time: "8:00 PM" }, { city: "campbell" },
    { url: "https://my.montalvoarts.org/3232/9999" }, { title: "Another Concert" }, { cost: "free" }]) {
    const unrelated = { ...fixture.marcAliases[0], ...change };
    assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  }
});

test("the dated Quarry Park workday retains required signup and city confirmation through cached publication", async () => {
  const event = { ...fixture.quarry };
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "required");
  assert.match(event.attendanceNote, /Wednesday before the workday/);
  assert.match(event.attendanceNote, /City confirms your participation by email/);
  for (const key of ["id", "title", "date", "time", "endTime", "venue", "url", "description"])
    assert.equal(event[key], fixture.quarry[key], key);
  assert.deepEqual(applyVerifiedEventFacts(event), event, "repeated publication does not duplicate the notice");
});

test("later closed, full and appointment states retain their current access notes", () => {
  for (const registration of ["full", "closed", "appointment-only"]) {
    const event = applyVerifiedEventFacts({ ...fixture.quarry, registration, attendanceNote: "Current organizer notice." });
    assert.equal(event.registration, registration);
    assert(event.attendanceNote.startsWith("Current organizer notice."));
  }
});

test("the workday correction does not qualify another date or revised signup terms", () => {
  for (const change of [{ date: "2027-11-21" }, { time: "10:00 AM" }, { endTime: "1:00 PM" },
    { url: "https://saratoga.volunteerlocal.com/volunteer/?id=other" }, { description: "Registration is not required." }]) {
    const unrelated = { ...fixture.quarry, ...change };
    assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  }
});
