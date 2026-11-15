import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration, requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";

const { events } = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-10-31-1307.json", import.meta.url)));
const storytime = events.find((event) => event.id.startsWith("sjpl-"));
const tea = events.find((event) => event.id.startsWith("inbound-"));

test("Pearl storytime publication qualifies its conflicting ticket pickup instructions", async () => {
  const input = structuredClone(storytime), published = [structuredClone(input)];
  await resolveEventBlurbs(published, { enabled: false });
  const actual = published[0];
  assert.equal(requiresAttendanceConfirmation(actual), true);
  assert.equal(requiresAdvanceRegistration(actual), false);
  assert.match(actual.attendanceNote, /description.*when it opens.*signup instructions.*30 minutes.*confirm.*Pearl Avenue Library/i);
  assert.match(actual.attendanceNote, /50 participants.*tickets are required/i);
  assert.doesNotMatch(actual.description, /tickets will be distributed.*when the library opens/i);
  assert.match(actual.description, /conflicting ticket pickup instructions.*confirm/i);
  for (const key of Object.keys(input)) if (!["description", "attendanceNote"].includes(key)) assert.deepEqual(actual[key], input[key], key);
  assert.deepEqual(storytime, input);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("Pearl ticket warning does not override a resolved source or another occurrence", () => {
  for (const other of [
    { ...storytime, date: "2026-11-11" },
    { ...storytime, url: "https://sjpl.bibliocommons.com/events/another-storytime" },
    { ...storytime, description: "Tickets are distributed 30 minutes before storytime." },
    { ...storytime, attendanceNote: "Tickets are distributed when the library opens." },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("Yuletide Tea publication retains paid seating and the subsequently verified sellout", async () => {
  const input = structuredClone(tea), published = [structuredClone(input)];
  await resolveEventBlurbs(published, { enabled: false });
  const actual = published[0];
  assert.equal(actual.cost, "paid");
  // The November 15 occurrence page now shows a visible sold-out alert and
  // waitlist, superseding the October 31 fixture's open reservation prompt.
  assert.equal(actual.registration, "full");
  assert.equal(requiresAdvanceRegistration(actual), true);
  assert.match(actual.costNote, /\$75.*\$70.*\$5/i);
  assert.match(actual.attendanceNote, /sold out.*waitlist.*11:30/i);
  assert.match(actual.description, /11:30 AM seating is sold out.*waitlist/);
  assert.doesNotMatch(actual.description, /seats remain/);
  assert.equal(actual.blurb, "The 11:30 AM holiday tea in Montalvo's historic Villa is sold out; the organizer offers a waitlist.");
  for (const key of Object.keys(input)) if (!["cost", "registration", "attendanceNote", "description", "blurb"].includes(key)) assert.deepEqual(actual[key], input[key], key);
  assert.deepEqual(tea, input);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("Yuletide Tea corrections preserve later booking restrictions and unrelated records", () => {
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...tea, registration }).registration, registration);
  }
  for (const other of [
    { ...tea, date: "2027-11-22" },
    { ...tea, time: "2:30 PM" },
    { ...tea, url: "https://my.montalvoarts.org/overview/3283?promo=" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});
