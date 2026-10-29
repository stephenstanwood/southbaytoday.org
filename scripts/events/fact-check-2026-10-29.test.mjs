import test from "node:test";
import assert from "node:assert/strict";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { classify } from "../audit-events.mjs";
import { hasOutOfAreaDestination, requiresAttendanceConfirmation, REGISTRATION_APPOINTMENT } from "../../src/lib/south-bay/eventFilters.mjs";

// Source evidence and access limits: docs/qa/2026-10-29-0207-fact-check.md.
test("the sparse Blippi theater listing retains its verified children's audience through blurb resolution", async () => {
  const raw = {
    title: "Be Like Blippi", date: "2026-10-28", time: "6:00 PM", endTime: null,
    venue: "San Jose Civic", url: "https://www.sanjose.org/theaters",
    category: "community", kidFriendly: false, audienceAge: "all", cost: "paid",
    description: "", blurb: "Catch Be Like Blippi, a community event.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.equal(actual.category, "family");
  assert.equal(actual.kidFriendly, true);
  assert.equal(actual.audienceAge, "kids");
  assert.equal(actual.url, "https://www.nederlanderconcerts.com/event/be-like-blippi-tour-2");
  assert.match(actual.description, /Blippi and Meekah/);
  assert.match(actual.blurb, /children ages 2–7/);
  assert.doesNotMatch(actual.blurb, /community event/);
  for (const field of ["title", "date", "time", "endTime", "venue", "cost"]) assert.equal(actual[field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const other of [{ ...raw, date: "2027-10-28" }, { ...raw, title: "Another show" }, { ...raw, url: "https://example.org/blippi" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("BFF Matchmaking discloses the elapsed matching-form deadline without inventing closed admission", async () => {
  const raw = {
    title: "BFF Matchmaking!", date: "2026-10-29", time: "5:00 PM", endTime: "7:00 PM",
    venue: "Fire Truck House", url: "https://events.stanford.edu/event/bff-matchmaking",
    category: "food", cost: null, description: "Are you looking for more friends?", blurb: "Meet your platonic soulmate.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.equal(actual.cost, "free");
  assert.equal(actual.category, "community", "refreshments do not make friend matching a food event");
  assert.match(actual.attendanceNote, /October 26 at noon/);
  assert.match(actual.attendanceNote, /confirm.*organizer/i);
  assert.equal(requiresAttendanceConfirmation(actual), true);
  assert.equal(actual.registration, undefined, "a matching-form deadline does not establish closed event admission");
  for (const field of ["title", "date", "time", "endTime", "venue", "url", "description", "blurb"]) assert.equal(actual[field], raw[field]);
  for (const registration of ["full", "closed", REGISTRATION_APPOINTMENT]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [{ ...raw, date: "2027-10-29" }, { ...raw, url: "https://events.stanford.edu/event/another" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("SCU's World Cup listing identifies its local departure trip and cannot become a San Francisco day-plan stop", async () => {
  const raw = {
    title: "Startup World Cup Grand Finale", date: "2026-11-06", time: "8:30 AM", endTime: null,
    city: "santa-clara", venue: "Hilton Union Square", address: "", cost: "free",
    url: "https://events.scu.edu/ciocca-center/event/517331-startup-world-cup-grand-finale",
    description: "It's our most anticipated experience of the year!",
    blurb: "Attend the Startup World Cup Grand Finale at Hilton Union Square starting in the morning.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.match(actual.title, /SCU day trip/);
  assert.match(actual.address, /San Francisco, CA 94102/);
  assert.match(actual.description, /transportation departs SCU at 8:30 AM/);
  assert.match(actual.attendanceNote, /October 5/);
  assert.match(actual.attendanceNote, /confirm.*departure/i);
  assert.equal(actual.registration, "required");
  assert.equal(requiresAttendanceConfirmation(actual), true);
  assert.equal(hasOutOfAreaDestination(actual), true);
  assert.ok(classify(actual).some((f) => f.reason === "local-departure-trip" && f.severity === "info"));
  assert.ok(!classify(actual).some((f) => f.reason === "out-of-area"));
  assert.doesNotMatch(actual.blurb, /at Hilton Union Square starting/);
  for (const field of ["date", "time", "endTime", "venue", "city", "cost", "url"]) assert.equal(actual[field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const registration of ["full", "closed", REGISTRATION_APPOINTMENT]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [{ ...raw, date: "2027-11-06" }, { ...raw, url: "https://events.scu.edu/event/another" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});
