import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { retireSlugs, resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/sjsu-source-conflicts-2026-11-05-evening.json", import.meta.url)));

test("the live SJSU discussion replaces combined-program copy and stays withheld until public access is confirmed", async () => {
  const before = structuredClone(fixture);
  const { reading } = fixture;
  assert.equal(reading.event.name, "I, Robot - Campus Reading Discussion");
  assert.equal(reading.event.startDate, "2026-11-09T15:30:00-08:00");
  assert.equal(reading.event.endDate, "2026-11-09T16:30:00-08:00");
  assert.deepEqual(reading.targetAudiences, ["SJSU Employees", "Students"]);

  for (const input of [reading.publishedBefore, {
    ...reading.publishedBefore, title: reading.event.name, endTime: "4:30 PM",
  }]) {
    const event = applyVerifiedEventFacts(input);
    assert.equal(event.id, input.id);
    assert.equal(event.date, "2026-11-09");
    assert.equal(event.title, reading.event.name);
    assert.equal(event.time, "3:30 PM");
    assert.equal(event.endTime, "4:30 PM");
    assert.equal(event.venue, "Campus Village B RAC (1st floor)");
    assert.doesNotMatch(event.description + event.blurb, /Uchida|5:30|screening/i);
    assert.match(event.attendanceNote, /SJSU employees and students.*Confirm public eligibility/);
    assert.equal(isEventPublishable(input), false, "protect stale and newly renamed copies");
    assert.equal(isEventPublishable(event), false);
    assert.equal(requiresAttendanceConfirmation(event), true);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  const events = [structuredClone(reading.publishedBefore)];
  await resolveEventBlurbs(events, { enabled: false });
  assert.doesNotMatch(events[0].blurb, /screening|Uchida|5:30/i);
  assert.equal(isEventPublishable(events[0]), false);
  for (const control of [
    { ...reading.publishedBefore, date: "2027-11-09" },
    { ...reading.publishedBefore, title: "Another public reading discussion", url: "https://example.org/reading" },
  ]) assert.equal(isEventPublishable(control), true);
  assert.deepEqual(fixture, before);
});

test("Metropolis preserves its confirmed start and room without selecting a conflicting finish", async () => {
  const before = structuredClone(fixture);
  const { metropolis } = fixture;
  assert.equal(metropolis.event.startDate, "2026-11-10T15:30:00-08:00");
  assert.equal(metropolis.event.endDate, "2026-11-10T18:00:00-08:00");
  assert.match(metropolis.poster.screening, /3:30–6:30 PM.*225/);

  for (const url of [metropolis.event.url,
    "https://events.sjsu.edu/event/silent-movie-classic-with-live-score-performance-dont-miss-it"]) {
    const event = applyVerifiedEventFacts({ ...metropolis.publishedBefore, url });
    assert.equal(event.id, metropolis.publishedBefore.id);
    assert.equal(event.time, "3:30 PM");
    assert.equal(event.endTime, null);
    assert.equal(event.cost, "free");
    assert.match(event.venue, /Room 225/);
    assert.match(event.attendanceNote, /6 PM.*6:30 PM.*Confirm the finish/);
    assert.doesNotMatch(event.description + event.blurb, /6:30|6:00/);
    assert.equal(requiresAttendanceConfirmation(event), true);
    assert.equal(isEventPublishable(event), true, "the screening itself is public and confirmed");
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  const events = [{ ...metropolis.publishedBefore, blurb: "Watch Metropolis until 6:30 PM." }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].endTime, null);
  assert.doesNotMatch(events[0].blurb, /6:30/);
  const control = { ...metropolis.publishedBefore, date: "2027-11-10" };
  assert.deepEqual(applyVerifiedEventFacts(control), control);
  assert.deepEqual(fixture, before);
});

test("the withdrawn combined-program URL remains a qualified retired leaf", () => {
  const ledger = retireSlugs({ entries: [] }, [fixture.reading.publishedBefore], [], "2026-11-05", fixture.retrievedAt);
  const { redirects, orphans } = resolveRetired(ledger, [], [], "2026-11-05");
  assert.equal(redirects.size, 0);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].event.title, fixture.reading.event.name);
  assert.match(orphans[0].event.attendanceNote, /Confirm public eligibility/);
  assert.equal(isEventPublishable(orphans[0].event), false);
});
