import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { backfillVerifiedEventTimes, fetchInboundEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-15-workshops.json", import.meta.url)));

function assertSession(event, session) {
  assert.equal(event.attendanceStatus, "needs-confirmation");
  assert(requiresAttendanceConfirmation(event));
  assert.equal(event.audienceAge, "kids");
  assert.deepEqual(event.sourceAudiences, [session.sourceFacts.audience]);
  assert(event.attendanceNote.includes(`Ages ${session.ageRange}.`));
  assert.match(event.attendanceNote, /Online tickets are not currently available/);
  assert.match(event.attendanceNote, /408-961-5858/);
  assert.equal(event.url, session.sourceUrl);
  assert.equal(event.registration, undefined, "unavailable online sales do not establish a sellout or cancellation");
  for (const key of ["title", "date", "time", "endTime", "venue", "address", "description", "cost"])
    assert.equal(event[key], session.published[key], key);
}

test("newsletter publication after clock recovery retains each workshop's attendance terms", async () => {
  for (const session of fixture.events) {
    const [event] = fetchInboundEvents({ today: "2026-11-15", events: [session.incoming] });
    // The morning email has an unknown-clock sentinel. The real pipeline
    // recovers 10 AM before applying occurrence corrections and deduplicating.
    await backfillVerifiedEventTimes([event], { backfill: async events => {
      for (const row of events) row.time ||= session.sourceFacts.time;
    } });
    await resolveEventBlurbs([event], { enabled: false });
    assertSession(event, session);
  }
});

test("cached workshop publication repairs missing attendance terms and remains stable", async () => {
  for (const session of fixture.events) {
    const event = structuredClone(session.published);
    await resolveEventBlurbs([event], { enabled: false });
    assertSession(event, session);
    const corrected = structuredClone(event);
    await resolveEventBlurbs([event], { enabled: false });
    assert.deepEqual(event, corrected);
  }
});

test("fresh performance evidence and revised source facts supersede the dated workshop correction", () => {
  for (const session of fixture.events) {
    for (const change of [
      { date: "2027-11-15" }, { source: "Another organizer" }, { virtual: true },
      { time: "1:00 PM" }, { endTime: "6:00 PM" }, { city: "campbell" },
      { url: "https://my.montalvoarts.org/3280/9999" },
      { description: "Tickets are available again for a revised workshop." },
      { occurrenceEvidence: { admissionSourceUrl: session.sourceUrl }, attendanceNote: "Tickets available again." },
    ]) {
      const event = { ...session.published, ...change };
      assert.deepEqual(applyVerifiedEventFacts(event), event);
    }
    for (const registration of ["full", "closed", "appointment-only"]) {
      const event = { ...session.published, registration, attendanceNote: "Current organizer notice." };
      const corrected = applyVerifiedEventFacts(event);
      assert.equal(corrected.registration, registration);
      assert(corrected.attendanceNote.startsWith(event.attendanceNote));
    }
  }
});
