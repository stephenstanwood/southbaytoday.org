import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchBiblioEvents } from "../generate-events.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";

const capture = JSON.parse(readFileSync(new URL("../lib/fixtures/sjpl-tinkercad-2026-11-07.json", import.meta.url)));

test("Almaden's captured workshop retains its real booking deadline and qualifies conflicting access", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(capture.retrievedAt) });
  const before = structuredClone(capture);
  t.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://gateway.bibliocommons.com");
    return Response.json({ entities: { ...capture.entities,
      events: request.searchParams.get("page") === "1" ? { [capture.event.id]: capture.event } : {},
    } });
  });
  const [ingested] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.equal(capture.event.registrationWindow.windowEnd, "2026-11-07T16:00:00");
  assert.match(capture.event.definition.description, /no registration is required/);
  assert.equal(ingested.registration, "required", "preserve the active booking provider");

  for (const raw of [ingested, capture.publishedBefore]) {
    const fixed = applyVerifiedEventFacts(structuredClone(raw));
    assert.equal(fixed.registrationClosesBy, "2026-11-08T00:00:00.000Z");
    assert.equal(fixed.registration, "required");
    assert.equal(requiresAttendanceConfirmation(fixed), true);
    assert.match(fixed.attendanceNote, /booking panel requires registration/);
    assert.match(fixed.attendanceNote, /description says no registration is required/);
    assert.match(fixed.attendanceNote, /Ages 8–14/);
    assert.equal(isBriefingEventAvailable(fixed), false, "unresolved access cannot become a confirmed highlight");
    for (const field of Object.keys(raw).filter(key => !["registrationClosesBy", "attendanceNote"].includes(key))) {
      assert.deepEqual(fixed[field], raw[field], field);
    }
    const events = [structuredClone(raw)];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].registrationClosesBy, fixed.registrationClosesBy);
    assert.equal(events[0].attendanceStatus, fixed.attendanceStatus);
    assert.equal(events[0].attendanceNote, fixed.attendanceNote);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  }
  assert.deepEqual(capture, before, "captured source data stays immutable");
});

test("the workshop correction preserves provider closures and stays within the verified occurrence", () => {
  const raw = capture.publishedBefore;
  for (const registration of ["required", "closed", "full", "appointment-only"]) {
    for (const url of [raw.url, capture.sourceUrl]) {
      assert.equal(applyVerifiedEventFacts({ ...raw, url, registration }).registration, registration);
    }
  }
  for (const other of [
    { ...raw, date: "2026-12-05" },
    { ...raw, date: "2027-11-07" },
    { ...raw, url: "https://sjpl.bibliocommons.com/events/another-workshop" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});
