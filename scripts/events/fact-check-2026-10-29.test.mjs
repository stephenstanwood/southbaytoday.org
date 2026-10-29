import test from "node:test";
import assert from "node:assert/strict";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { classify } from "../audit-events.mjs";
import { hasOutOfAreaDestination, requiresAttendanceConfirmation, REGISTRATION_APPOINTMENT } from "../../src/lib/south-bay/eventFilters.mjs";
import { mapTicketmasterEvent } from "../generate-events.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";
import { normalizeInboundEventPresentation } from "../lib/inbound-event-normalize.mjs";
import { fetchInboundEvents } from "../generate-events.mjs";

// Original museum newsletter and first-party occurrence pages:
// docs/qa/2026-10-29-1807-fact-check.md.
test("museum event clocks come from their own schedules and unknown clocks survive ingestion and cached blurbs", async () => {
  const venue = "Children's Discovery Museum of San Jose";
  const rows = [
    ["2026-11-01", "Día de los Muertos Celebration", "10:00 AM", "3:30 PM", "https://www.cdm.org/event/dia-de-los-muertos/"],
    ["2026-12-06", "Menorahs & Miracles Hanukkah Celebration", "10:00 AM", "2:00 PM", "https://www.cdm.org/event/menorahs-miracles/"],
    ["2026-11-08", "Orbital Escape Robotics Demonstration", null, null],
    ["2026-11-11", "Deck the Tree ornament-making", null, null],
    ["2026-11-15", "Drone Programming with Python", null, null],
    ["2026-11-21", "Daisy Day: Design with Nature", null, null],
  ];
  for (const [date, title, time, endTime, url] of rows) {
    const raw = {
      id: title, cityKey: "san-jose", title,
      startsAt: `${date}T09:30:00-08:00`,
      endsAt: title.startsWith("Deck") ? `${date}T16:30:00-08:00` : null,
      location: `${title.startsWith("Deck") ? "Art Studio, " : ""}${venue}, 180 Woz Way, San Jose, CA 95110`,
      sourceUrl: "https://secure2.convio.net/cdm/site/R?i=source-email-link",
      description: "A museum activity. The newsletter gives no event time, so the start is the museum's weekend opening time.",
    };
    const original = structuredClone(raw);
    const presented = normalizeInboundEventPresentation(raw);
    assert.equal(presented.time, time);
    assert.equal(presented.endTime, endTime);
    const [ingested] = fetchInboundEvents({ today: "2026-10-29", events: [raw] });
    const events = [{ ...ingested, blurb: "Join the museum activity." }];
    await resolveEventBlurbs(events, { enabled: false });
    const [actual] = events;
    assert.equal(actual.time, time);
    assert.equal(actual.endTime, endTime);
    assert.equal(actual.date, date);
    assert.equal(actual.cost, null, "opening hours do not establish admission");
    assert.doesNotMatch(actual.description, /start is the museum's weekend opening time/);
    if (url) assert.equal(actual.url, url);
    else {
      assert.equal(actual.attendanceStatus, "needs-confirmation");
      assert.match(actual.attendanceNote, /gives no activity time/);
      assert.equal(requiresAttendanceConfirmation(actual), true);
    }
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    assert.deepEqual(raw, original);
    for (const other of [
      { ...actual, date: date.replace("2026", "2027") },
      { ...actual, title: "Another activity", url: "https://example.org/event", venue: "Another museum" },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
  const [halloween] = fetchInboundEvents({ today: "2026-10-29", events: [{
    id: "halloween", cityKey: "san-jose", title: "Halloween at the Purple Museum",
    startsAt: "2026-10-31T09:30:00-07:00", endsAt: "2026-10-31T16:30:00-07:00",
    location: venue, description: "Costume party during regular museum hours.",
    sourceUrl: "https://www.cdm.org/event/halloween-at-the-purple-museum/",
  }] });
  assert.equal(halloween.time, "9:30 AM", "explicit all-day activity hours remain valid");
  assert.equal(halloween.endTime, "4:30 PM");
});

// Source and access limits: docs/qa/2026-10-29-1007-fact-check.md.
test("AI Center open labs retain the library-card access condition through sparse source refreshes", async () => {
  const raw = {
    title: "Open Lab Hours at AI Center for Civic and Social Good",
    date: "2026-11-04", time: "2:00 PM", endTime: null,
    venue: "King Library", city: "san-jose", cost: null,
    url: "https://events.sjsu.edu/event/open-lab-ai-center",
    description: "Drop in, explore, and create!",
    blurb: "Drop into King Library's open lab to explore AI tools and work on your own projects.",
  };
  const dates = ["2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04"];
  const events = dates.map((date) => ({ ...raw, date }));
  await resolveEventBlurbs(events, { enabled: false });
  for (const event of events) {
    assert.match(event.attendanceNote, /valid SJSU Tower Card or SJPL library card/);
    assert.equal(event.registration, undefined, "a library card is not an event reservation");
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    for (const field of ["title", "time", "endTime", "venue", "city", "url", "cost", "description", "blurb"]) {
      assert.equal(event[field], raw[field]);
    }
  }
  for (const registration of ["full", "closed", REGISTRATION_APPOINTMENT]) {
    const event = applyVerifiedEventFacts({ ...raw, registration, attendanceNote: "Contact the organizer about availability." });
    assert.equal(event.registration, registration);
    assert.match(event.attendanceNote, /^Contact the organizer about availability\./);
    assert.match(event.attendanceNote, /valid SJSU Tower Card or SJPL library card/);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  for (const other of [
    { ...raw, date: "2027-11-04" },
    { ...raw, date: "2026-11-07" },
    { ...raw, url: "https://events.sjsu.edu/event/another-open-lab" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

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

test("Ticketmaster age restrictions survive policy cleanup and cached blurbs", async () => {
  // Exact Discovery records: docs/qa/2026-10-29-0407-fact-check.md.
  const raw = {
    id: "rZ7HnEZ1AfGgj0", name: "Trevor Wallace",
    dates: { start: { localDate: "2026-12-31", localTime: "19:00:00" }, status: { code: "onsale" } },
    url: "https://www.ticketweb.com/event/trevor-wallace-san-jose-improv-tickets/14335724",
    priceRanges: [{ min: 49.22, max: 101.65 }],
    info: "There is a ticket delivery delay in place until two days prior to the event. Tickets will not be emailed until then.",
    pleaseNote: "This event is 21 and over. Any ticket holder unable to present valid identification will not be admitted.",
    _embedded: { venues: [{ name: "San Jose Improv", city: { name: "San Jose" }, address: { line1: "62 S Second St" } }] },
  };
  const mapped = mapTicketmasterEvent(raw);
  assert.equal(classifyAudienceAge(mapped), "adult");
  assert.deepEqual(mapped.sourceAudiences, ["Adults, ages 21+"]);
  assert.equal(mapped.kidFriendly, false);
  assert.match(mapped.attendanceNote, /Ages 21\+/);
  const events = [mapped];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(classifyAudienceAge(events[0]), "adult");
  assert.equal(events[0].time, "7:00 PM");
  assert.equal(events[0].costNote, "From $49");
  assert.match(events[0].attendanceNote, /Ages 21\+/);

  const soldOut = mapTicketmasterEvent({ ...raw, name: "SOLD OUT Trevor Wallace" });
  assert.equal(soldOut.registration, "full");
  assert.match(soldOut.attendanceNote, /sold out/);
  assert.match(soldOut.attendanceNote, /Ages 21\+/);
  assert.equal(classifyAudienceAge(mapTicketmasterEvent({ ...raw, name: "Family Comedy", pleaseNote: raw.pleaseNote })), "adult");
  for (const pleaseNote of ["This event is 18 and over.", "Ages 18+ only."]) {
    assert.deepEqual(mapTicketmasterEvent({ ...raw, pleaseNote }).sourceAudiences, ["Adults, ages 18+"]);
  }
  for (const pleaseNote of ["", "Children age 3 and older require a ticket.", "All ages welcome."]) {
    const unrestricted = mapTicketmasterEvent({ ...raw, pleaseNote, ageRestrictions: { legalAgeEnforced: true } });
    assert.equal(unrestricted.sourceAudiences, undefined, "neither a venue nor an age-check boolean establishes a minimum age");
    assert.equal(classifyAudienceAge(unrestricted), "all");
    assert.equal(unrestricted.attendanceNote, undefined);
  }
});
