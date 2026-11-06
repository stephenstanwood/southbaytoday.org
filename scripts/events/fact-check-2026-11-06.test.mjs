import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inferCategory, mapTicketmasterEvent } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { snapshotEvent } from "../../src/lib/south-bay/eventSlugLedger.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-06.json", import.meta.url)));

test("the organizer's Globetrotters game stays sports at a sponsored Tech CU venue", () => {
  const { publishedBefore, organizer, minimalAdapterInput } = fixture.game;
  assert.equal(organizer.format, "basketball game");
  const actual = mapTicketmasterEvent(minimalAdapterInput);
  assert.equal(actual.category, "sports");
  for (const field of ["id", "title", "date", "time", "endTime", "venue", "url"]) {
    assert.equal(actual[field], publishedBefore[field], field);
  }
  assert.equal(actual.date, organizer.date);
  assert.equal(actual.time, organizer.time);
  assert.equal(isEventPublishable(actual), true);
  assert.equal(inferCategory("Harlem Globetrotters history lecture", "", "", "Tech CU Arena"), "education");
  assert.equal(isEventPublishable({ ...actual, title: "MVP Court Pass - Check in by 2:30PM" }), false);
  const iceShow = structuredClone(minimalAdapterInput);
  iceShow.name = "Disney On Ice";
  iceShow.classifications = [{ genre: { name: "Ice Shows" }, segment: { name: "Sports" } }];
  assert.equal(mapTicketmasterEvent(iceShow).category, "arts");
});

test("the newly published SCU library date retains its source's unresolved public eligibility", () => {
  const { schema, publishedBefore } = fixture.library;
  assert.match(schema.description, /As a commuter or transfer student/);
  assert.equal(schema.startDate, "2026-11-11T20:30:00+00:00");
  assert.equal(isEventPublishable(publishedBefore), false);
  const fixed = applyVerifiedEventFacts(publishedBefore);
  assert.equal(fixed.attendanceStatus, "needs-confirmation");
  assert.match(fixed.attendanceNote, /commuter and transfer students/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.equal(isEventPublishable({ ...publishedBefore, date: "2027-11-11" }), true);
  const retired = applyVerifiedEventFacts(snapshotEvent(publishedBefore));
  assert.match(retired.attendanceNote, /Confirm public eligibility/);
});

test("cached copy cannot restore the wrong sports category or hide the library restriction", async () => {
  const events = [fixture.game.publishedBefore, fixture.library.publishedBefore].map(e => ({ ...e }));
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].category, "sports");
  assert.equal(events[0].endTime, null);
  assert.equal(events[1].attendanceStatus, "needs-confirmation");
  assert.equal(isEventPublishable(events[1]), false);
  assert.equal(isEventPublishable({ ...events[1], description: "", blurb: "" }), false);
  assert.deepEqual(fixture.game.publishedBefore.category, "education", "the captured input stays immutable");
});

test("SCU's explicitly public Veterans Day ceremony remains eligible and unchanged", () => {
  const { schema, publishedBefore } = fixture.veterans;
  assert(schema.additionalProperty.some(p => p.value === "Open to the Public"));
  assert.equal(schema.startDate, "2026-11-11T23:00:00+00:00");
  assert.equal(isEventPublishable(publishedBefore), true);
  assert.deepEqual(applyVerifiedEventFacts(publishedBefore), publishedBefore);
});
