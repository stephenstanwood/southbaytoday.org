import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-12-late.json", import.meta.url)));
const keplers = fixture.events.find(event => event.source === "Kepler's Books");
const illumination = fixture.events.find(event => event.source === "San Jose Jazz");

test("cached Kepler's publication preserves Choo's name and distinguishes reception, conversation and signing", async () => {
  const event = structuredClone(keplers);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.title, "Karen Joy Fowler with Yangsze Choo");
  assert.match(event.blurb, /with Yangsze Choo\./);
  assert.equal(event.time, "6:30 PM");
  assert.equal(event.endTime, null, "the source's 8 PM signing start is not a finish");
  assert.match(event.attendanceNote, /reception at 6:30 PM; conversation at 7 PM; book signing at 8 PM/);
  for (const key of ["id", "date", "venue", "address", "city", "locality", "url", "cost", "description"])
    assert.deepEqual(event[key], keplers[key], key);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("Illumination's arts program, free admission and seat instructions survive cached publication", async () => {
  const event = structuredClone(illumination);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.category, "arts");
  assert.equal(event.cost, "free");
  assert.equal(event.address, "310 S. First Street, San Jose, CA 95113");
  assert.match(event.attendanceNote, /reserve seats.*up to four seats for additional family members/);
  assert.equal(event.registration, undefined, "a reservation link does not prove mandatory signup");
  for (const key of ["id", "title", "date", "time", "endTime", "venue", "city", "url", "description", "blurb"])
    assert.deepEqual(event[key], illumination[key], key);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("source-based safeguards cover regenerated identities without mutating the imported record", () => {
  for (const original of fixture.events) {
    const source = { ...original, id: "regenerated-source-id", blurb: undefined };
    const before = structuredClone(source);
    const event = applyVerifiedEventFacts(source);
    assert.deepEqual(source, before);
    assert.notDeepEqual(event, source);
    assert.equal(event.id, source.id);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("later availability and accessibility notices are preserved alongside the source program", () => {
  for (const original of fixture.events) for (const registration of ["full", "closed", "appointment-only"]) {
    const event = applyVerifiedEventFacts({ ...original, registration, attendanceNote: "Contact the organizer for accessibility." });
    assert.equal(event.registration, registration);
    assert.match(event.attendanceNote, /^Contact the organizer for accessibility\./);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("another date, source, venue, or revised program clock cannot inherit a dated correction", () => {
  for (const original of fixture.events) for (const change of [
    { date: "2028-12-12" }, { url: "https://example.org/another-event" },
    { venue: "Another Venue" }, { time: "4:00 PM" }, { virtual: true },
  ]) {
    const event = { ...original, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  const revised = { ...keplers, endTime: "9:00 PM" };
  assert.deepEqual(applyVerifiedEventFacts(revised), revised);
});

test("newer prices, locations or programs are not overwritten by the free arts-event reading", () => {
  for (const change of [
    { cost: "paid" }, { costNote: "$10 tickets" }, { address: "Another address" },
    { description: "Live music and a ticketed dance performance." },
  ]) {
    const event = { ...illumination, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});
