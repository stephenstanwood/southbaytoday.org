import assert from "node:assert/strict";
import test from "node:test";
import { fetchInboundEvents } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";

// The organizer's January 14 occurrence reports full capacity on November 12.
// The replacement newsletter identity omits availability entirely.
const sourceUrl = "https://live.stanford.edu/events/26-27season/studio/poetry-live";
const source = {
  title: "Poetry Live! with Franny Choi and Cameron Awkward-Rich",
  startsAt: "2027-01-14T19:00:00-08:00",
  sourceUrl,
  location: "The Studio, 327 Lasuen St, Stanford, CA 94305",
  cityKey: "palo-alto",
  description: "Stanford Live presents the 5th annual Poetry Live!, an evening of spoken word poetry featuring Franny Choi and Cameron Awkward-Rich.",
};

test("sparse newsletter intake and cached publication keep the full performance out of briefing highlights", async () => {
  const [event] = fetchInboundEvents({ events: [source], today: "2026-11-12" });
  assert.ok(event);
  const original = { ...event };
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "full");
  assert.match(event.attendanceNote, /Currently at capacity.*notified when tickets are released/);
  assert.equal(isBriefingEventAvailable(event), false);
  assert.equal(event.category, "arts");
  for (const key of ["date", "time", "endTime", "cost", "title", "url", "venue", "description"]) {
    assert.equal(event[key], original[key], `preserve ${key}`);
  }
  assert.equal(event.cost, null, "a notification form does not establish a price");
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("retained newsletter identities preserve stronger closure notices and exact occurrence boundaries", async () => {
  const [event] = fetchInboundEvents({ events: [source], today: "2026-11-12" });
  for (const id of ["inbound-4a58cb3c46630ee0", "inbound-c389aaf467e3c51c"]) {
    const retained = { ...event, id, registration: "closed", attendanceNote: "Registration is now closed." };
    await resolveEventBlurbs([retained], { enabled: false });
    assert.equal(retained.registration, "closed");
    assert.ok(retained.attendanceNote.startsWith("Registration is now closed."));
    assert.equal(isBriefingEventAvailable(retained), false);
    assert.deepEqual(applyVerifiedEventFacts(retained), retained);
  }
  for (const change of [{ date: "2027-01-15" }, { url: "https://example.org/unrelated" }]) {
    const unrelated = { ...event, registration: undefined, attendanceNote: undefined, ...change };
    assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  }
});
