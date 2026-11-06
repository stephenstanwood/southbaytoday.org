import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanTitle } from "../generate-events.mjs";
import { shouldSkip } from "../generate-scc-food-openings.mjs";
import { deduplicateEventUrls } from "../lib/event-url-dedup.mjs";
import { parseMidpenVolunteerAvailability } from "../lib/midpen-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventPublishable, isNonEventOffer } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { snapshotEvent } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-05-late.json", import.meta.url)));

test("SCU's faculty AI workshop stays withheld while the two public programs remain eligible", () => {
  const [faculty, ...publicPrograms] = fixture.scu;
  assert.match(faculty.schema.description, /session for Leavey faculty/);
  assert.equal(isEventPublishable(faculty.publishedBefore), false);
  const corrected = applyVerifiedEventFacts(faculty.publishedBefore);
  assert.match(corrected.attendanceNote, /Leavey faculty/);
  assert.equal(corrected.attendanceStatus, "needs-confirmation");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  assert.equal(isEventPublishable({ ...faculty.publishedBefore, date: "2027-11-11" }), true);
  for (const { schema, publishedBefore } of publicPrograms) {
    assert(schema.additionalProperty.some(p => p.value === "Open to the Public"));
    assert.equal(isEventPublishable(publishedBefore), true);
  }
});

test("a court-pass upgrade cannot publish as an activity or replace the main game", () => {
  const upgrade = fixture.ticketUpgrade;
  assert.match(upgrade.description, /optional upgrade/i);
  assert.match(upgrade.description, /ticket to the main event is also required/i);
  assert.equal(isNonEventOffer(upgrade), true);
  assert.equal(isEventPublishable(upgrade), false);
  assert.equal(isEventPublishable({ ...upgrade, title: "Harlem Globetrotters: Rivalry Tour", category: "sports" }), true);
  assert.equal(isEventPublishable({ ...upgrade, description: "", blurb: "" }), false, "sparse retained copies remain offers");
  const retired = snapshotEvent(upgrade);
  assert.match(retired.description, /pregame upgrade.*separate Harlem Globetrotters game ticket/);
  assert(!retired.description.includes("membership"));
  assert.equal(retired.time, undefined);
  assert.equal(retired.cost, undefined);
});

test("Stanford's military community social retains its explicit audience and a social category", () => {
  const { event, publishedBefore } = fixture.stanford.find(r => r.event.title === "OMAC First Fridays");
  assert.match(event.description_text, /open to all military-affiliated community members/);
  const corrected = applyVerifiedEventFacts(publishedBefore);
  assert.equal(corrected.category, "community");
  assert.match(corrected.attendanceNote, /military-affiliated community members/);
  assert.equal(corrected.cost, publishedBefore.cost);
  assert.equal(isEventPublishable(corrected), true);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});

test("IDA's proper name survives title cleanup and dated cached copies", () => {
  const { event, publishedBefore } = fixture.stanford.find(r => r.event.title.startsWith("First Fridays at IDA"));
  assert.equal(cleanTitle(event.title), "First Fridays at IDA (Social)");
  const corrected = applyVerifiedEventFacts(publishedBefore);
  assert.deepEqual(corrected, { ...publishedBefore, title: event.title });
});

test("the teen crochet session preserves the organizer's required registration and conditional walk-ins", () => {
  const corrected = applyVerifiedEventFacts(fixture.crochet);
  assert.equal(corrected.registration, "required");
  assert.match(corrected.attendanceNote, /walk-ins.*space/i);
  assert.equal(corrected.cost, null, "materials provided does not establish free admission");
  for (const key of ["id", "title", "date", "time", "endTime", "venue"]) assert.equal(corrected[key], fixture.crochet[key]);
});

test("the two Santa Clara diya aliases retain one occurrence without merging another day", () => {
  const original = structuredClone(fixture.duplicateDiya);
  const normalized = fixture.duplicateDiya.map(applyVerifiedEventFacts);
  assert.equal(normalized[0].url, normalized[1].url);
  assert.deepEqual(deduplicateEventUrls(normalized), [normalized[0]]);
  const otherDay = { ...fixture.duplicateDiya[1], date: "2026-11-06" };
  assert.deepEqual(applyVerifiedEventFacts(otherDay), otherDay);
  assert.deepEqual(fixture.duplicateDiya, original);
});

test("a numbered front-of-house servery filing cannot become a restaurant name", () => {
  assert.equal(fixture.foodPlaceholder.record_id, "SR0868681");
  assert.equal(shouldSkip(fixture.foodPlaceholder), true);
  assert.equal(shouldSkip({ ...fixture.foodPlaceholder, business_name: "E-7 LEAVES CAFE" }), false);
});

test("Midpen's actual capacity section reports no available volunteer places", () => {
  assert.equal(parseMidpenVolunteerAvailability(fixture.midpenCapacity), "full");
  assert.equal(parseMidpenVolunteerAvailability(fixture.midpenCapacity.replace("0 open spots", "3 open spots")), "required");
});
