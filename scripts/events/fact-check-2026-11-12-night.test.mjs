import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchStanfordEvents } from "../generate-events.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-12-evening.json", import.meta.url)));
// Accepted performance fields after the preceding source review; the fixture
// also retains the earlier clock-free record that review corrected.
const published = {
  ...fixture.publishedPerformance,
  id: "stanford-53763766608135-2026-11-12", time: "8:00 PM", ongoing: false,
  attendanceNote: "The calendar lists a 9:30 PM finish; Stanford TAPS lists a 100-minute runtime. Confirm the finish with the box office.",
};

test("Our Town's sold-out notice survives cached publication alongside the disputed finish", async () => {
  const event = structuredClone(published);
  const original = structuredClone(event);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "full");
  assert.match(event.attendanceNote, /Tickets sold out when checked November 12/);
  assert.match(event.attendanceNote, /in-person waitlist numbers.*one hour before curtain/);
  assert.match(event.attendanceNote, /admission is not guaranteed/);
  assert.match(event.attendanceNote, /9:30 PM finish.*100-minute runtime/);
  assert.equal(isBriefingEventAvailable(event), false);
  for (const key of ["id", "title", "date", "time", "endTime", "venue", "address", "url", "cost", "description", "blurb"])
    assert.deepEqual(event[key], original[key], key);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("the actual Stanford adapter and cached publication retain both source warnings", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-13T01:07:06Z") });
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [{ event: fixture.performance }] }));
  const events = await fetchStanfordEvents();
  assert.equal(events.length, 1, "the repair must not manufacture the rest of the run");
  const [event] = events;
  event.blurb = fixture.publishedPerformance.blurb;
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(event.date, "2026-11-12");
  assert.equal(event.time, "8:00 PM");
  assert.equal(event.endTime, null);
  assert.equal(event.ongoing, false);
  assert.equal(event.registration, "full");
  assert.match(event.attendanceNote, /100-minute runtime/);
  assert.match(event.attendanceNote, /waitlist/);
});

test("later source admission changes are not replaced by the retained sold-out reading", () => {
  for (const change of [
    { description: published.description + " Tickets are now available." },
    { attendanceNote: "Registration has reopened." },
    { attendanceNote: "This show is no longer sold out." },
    { registration: "required" },
    { registration: "appointment-only" },
  ]) {
    const event = { ...published, ...change };
    const result = applyVerifiedEventFacts(event);
    assert.deepEqual(result, event);
  }
});

test("availability stays within the confirmed production, clocks and run", () => {
  for (const change of [
    { date: "2026-11-11" }, { date: "2026-11-15" },
    { time: "7:00 PM" }, { endTime: "9:40 PM" },
    { venue: "Another Theater" }, { title: "Another Production" },
    { url: "https://events.stanford.edu/event/another-production" },
    { virtual: true },
  ]) {
    const event = { ...published, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("an explicitly closed booking state and unrelated attendance notes survive", () => {
  const event = { ...published, registration: "closed", attendanceNote: "Contact the organizer for accessibility." };
  const result = applyVerifiedEventFacts(event);
  assert.equal(result.registration, "closed");
  assert.match(result.attendanceNote, /^Contact the organizer for accessibility\./);
  assert.match(result.attendanceNote, /Tickets sold out/);
  assert.deepEqual(applyVerifiedEventFacts(result), result);
  assert.deepEqual(event.attendanceNote, "Contact the organizer for accessibility.", "source object is not mutated");
});
