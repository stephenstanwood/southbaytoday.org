import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

const { events } = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-10-31-midday.json", import.meta.url)));
const row = (id) => structuredClone(events.find((event) => event.id === id));

test("Cupertino's Santa breakfast retains its payment and preregistration conditions through publication", async () => {
  const raw = row("d8ae1f6e6a6d"), original = structuredClone(raw);
  const events = [structuredClone(raw)];
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.equal(actual.cost, "paid");
  assert.equal(actual.registration, "required");
  assert.equal(requiresAdvanceRegistration(actual), true);
  assert.match(actual.costNote, /\$18.*residents.*\$22.*nonresidents/i);
  assert.match(actual.attendanceNote, /preregistration is required/i);
  assert.match(actual.attendanceNote, /under 2.*free.*do not need to register/i);
  for (const key of Object.keys(raw)) if (key !== "cost") assert.deepEqual(actual[key], raw[key], key);
  assert.deepEqual(raw, original);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("the Santa breakfast correction cannot reopen booking or affect another occurrence", () => {
  const raw = row("d8ae1f6e6a6d");
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2027-12-05" },
    { ...raw, url: "https://www.cupertino.gov/another-event" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("Roots copy names historic homes without adding an unverified anniversary milestone", async () => {
  const raw = row("inbound-70200f67edf3456e"), original = structuredClone(raw);
  const events = [structuredClone(raw)];
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.equal(actual.description, raw.description.replace(", kicking off the city's 250th anniversary with", ", with"));
  assert.equal(actual.blurb, "Tour the historic homes, join in hands-on activities, and catch local art and cultural performances.");
  for (const key of Object.keys(raw)) if (!["description", "blurb"].includes(key)) assert.deepEqual(actual[key], raw[key], key);
  assert.deepEqual(raw, original);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("Roots copy repairs preserve changed source text and unrelated events", () => {
  const raw = row("inbound-70200f67edf3456e");
  const updated = { ...raw, description: "Updated organizer program with historic home tours.", blurb: "Enjoy the organizer's updated program." };
  assert.deepEqual(applyVerifiedEventFacts(updated), updated);
  for (const other of [
    { ...raw, date: "2027-11-07" },
    { ...raw, venue: "Another venue" },
    { ...raw, title: "Another Roots event" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});
