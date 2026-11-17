import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchInboundEvents, polishDescription } from "../generate-events.mjs";
import { weekendPickCandidates } from "../generate-weekend-picks.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-15-tea.json", import.meta.url)));
const description = "Holiday tea with tea sandwiches, scones and petite sweets in the decorated historic Villa. Online tickets for the 11:30 AM seating are unavailable.";
const blurb = "Montalvo lists Yuletide Tea at 11:30 AM. Check with the box office about tickets.";

test("the real newsletter adapter preserves the tea's current unavailable booking state", async () => {
  const [event] = fetchInboundEvents({ today: "2026-11-15", events: [fixture.incoming] });
  assert(event);
  event.description = polishDescription(event.description);
  event.blurb = fixture.published.blurb;
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "none");
  assert.equal(event.attendanceStatus, "needs-confirmation");
  assert.equal(event.description, description);
  assert.equal(event.blurb, blurb);
  assert.match(event.attendanceNote, /Online tickets are not currently available/);
  assert.equal(event.date, "2026-11-22");
  assert.equal(event.time, "11:30 AM");
  assert.equal(event.endTime, null);
  assert.equal(event.costNote, fixture.published.costNote);
  assert.equal(event.url, fixture.incoming.sourceUrl);
});

test("cached publication repairs only the stale availability clauses and is stable on repeat", async () => {
  const event = structuredClone(fixture.published);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.description, description);
  assert.equal(event.blurb, blurb);
  assert.equal(event.registration, "none");
  assert.equal(event.attendanceStatus, "needs-confirmation");
  assert.match(event.attendanceNote, /Online tickets are not currently available/);
  for (const key of Object.keys(fixture.published).filter(key => !["description", "blurb", "registration", "attendanceNote"].includes(key)))
    assert.deepEqual(event[key], fixture.published[key], key);
  const first = structuredClone(event);
  await resolveEventBlurbs([event], { enabled: false });
  assert.deepEqual(event, first);
});

test("revised seating facts and fresh exact-performance evidence supersede the dated copy repair", () => {
  for (const change of [
    { date: "2027-11-22" }, { time: "2:30 PM" },
    { url: "https://my.montalvoarts.org/3253/3255" },
    { costNote: "$90 per person." }, { registration: "appointment-only" },
    { occurrenceEvidence: { admissionSourceUrl: fixture.sourceUrl },
      registration: "required", attendanceNote: "Tickets available again." },
  ]) {
    const event = { ...fixture.published, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  const revised = { ...fixture.published, description: "The organizer has changed the menu.", blurb: "Read the organizer's current menu." };
  const actual = applyVerifiedEventFacts(revised);
  assert.equal(actual.description, revised.description);
  assert.equal(actual.blurb, revised.blurb);
  assert.equal(applyVerifiedEventFacts({ ...fixture.published, registration: "closed" }).registration, "closed");
});

test("a calendar listing with unconfirmed attendance is ineligible for weekend picks", () => {
  const unavailable = applyVerifiedEventFacts(fixture.published);
  assert.equal(unavailable.attendanceStatus, "needs-confirmation");
  assert.equal(isEventPublishable(unavailable), true);

  const bookable = { ...unavailable, attendanceStatus: undefined, attendanceNote: undefined, registration: "required" };
  const closed = { ...bookable, registration: "closed" };
  const full = { ...bookable, registration: "full" };
  const friday = { ...bookable, date: "2026-11-20" };
  assert.deepEqual(
    weekendPickCandidates([unavailable, closed, full, bookable, friday], "2026-11-20", "2026-11-22"),
    [bookable],
  );
});
