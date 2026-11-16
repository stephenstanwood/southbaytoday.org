import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchBiblioEvents, polishDescription } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-16-pearl.json", import.meta.url)));

test("the exact library occurrence discloses its conflicting start times through real intake and publication", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.checkedAt) });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    assert.equal(url.origin, "https://gateway.bibliocommons.com");
    assert.equal(url.pathname, "/v2/libraries/sjpl/events");
    return Response.json(calls++ === 0 ? fixture.response : { entities: { events: {} } });
  });
  const [event] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  event.description = polishDescription(event.description);
  event.blurb = fixture.published.blurb;
  assert.equal(event.time, "5:00 PM");
  assert.equal(event.endTime, "6:00 PM");
  assert.match(event.description, /socializing and fun at 4:00 pm\./);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(requiresAttendanceConfirmation(event), true);
  assert.match(event.attendanceNote, /schedule lists 5–6 PM, but its description says 4 PM/);
  assert.match(event.attendanceNote, /408-808-3053/);
  assert.doesNotMatch(event.description, /socializing and fun at 4:00 pm/);
  for (const field of ["id", "title", "date", "time", "endTime", "venue", "address", "url", "registration", "registrationClosesBy", "sourceAudiences", "cost", "blurb"])
    assert.deepEqual(event[field], fixture.published[field], field);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("cached publication preserves booking notices and never reopens full or closed registration", async () => {
  for (const registration of ["required", "full", "closed", "appointment-only"]) {
    const event = { ...fixture.published, registration, attendanceNote: "Later organizer booking notice." };
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.registration, registration);
    assert.match(event.attendanceNote, /^Later organizer booking notice\./);
    assert.equal(requiresAttendanceConfirmation(event), true);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("the timing safeguard leaves revised source facts and other occurrences untouched", () => {
  for (const change of [
    { date: "2026-12-17" }, { time: "4:00 PM" }, { endTime: "7:00 PM" },
    { source: "Another publisher" }, { title: "Another program" },
    { url: "https://sjpl.bibliocommons.com/events/another-occurrence" },
    { venue: "Another Library" }, { city: "palo-alto" },
    { description: fixture.published.description.replace("at 4:00 pm", "at 5:00 pm") },
    { description: "The revised program starts at 5 PM." },
  ]) {
    const event = { ...fixture.published, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event, JSON.stringify(change));
  }
});
