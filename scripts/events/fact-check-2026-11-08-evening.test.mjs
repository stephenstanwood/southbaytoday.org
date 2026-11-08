import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchBiblioEvents, isPublicEvent, mapTicketmasterEvent } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { requiresAdvanceRegistration, registrationLabel } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-08-evening.json", import.meta.url)));

test("the actual Chinese-only library records retain the second-Thursday art session through ingestion and cached copy", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-08T02:07:04Z") });
  let page = 0;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(
    page++ === 0 ? fixture.library : { entities: { events: {} } },
  )));
  const events = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.date, "2026-11-12");
    const source = fixture.library.entities.events[event.id.slice(5)];
    assert.match(source.definition.description, /第二個星期四/);
    event.blurb = fixture.published.find(row => row.id === event.id).blurb;
  }
  const before = structuredClone(events);
  await resolveEventBlurbs(events, { enabled: false });
  for (const [i, event] of events.entries()) {
    assert.match(event.blurb, /art activity in Mandarin and English/);
    assert.doesNotMatch(event.blurb, /stories and songs/i);
    assert.match(event.attendanceNote, /Information Desk 30 minutes/);
    assert.match(event.description, /second-Thursday/);
    for (const key of ["id", "date", "time", "endTime", "venue", "cost", "registration", "sourceAudiences"]) {
      assert.deepEqual(event[key], before[i][key], key);
    }
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("the translated occurrence details stay on the verified date and exact library identities", () => {
  for (const event of fixture.published) {
    for (const other of [
      { ...event, date: "2026-11-19" },
      { ...event, url: event.url + "0" },
      { ...event, url: event.url.replace("sjpl.bibliocommons.com", "example.com") },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
    for (const registration of ["full", "closed", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
    }
  }
});

test("the exact organizer's sold-out offer outranks Discovery's on-sale flag through real ingestion", async () => {
  assert.equal(fixture.discovery.dates.status.code, "onsale");
  const event = mapTicketmasterEvent(fixture.discovery);
  assert(event);
  assert.equal(event.time, "6:00 PM");
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "full");
  assert.match(event.attendanceNote, /Sold out.*waitlist.*Ages 21\+.*Two-item minimum/);
  assert.equal(event.cost, "paid", "a zero-dollar Discovery placeholder does not establish free entry");
  assert.equal(requiresAdvanceRegistration(event), true);
  assert.equal(registrationLabel(event), "Registration full");
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("the verified ticket offers cannot close a different instance or reopen an explicitly closed window", () => {
  assert.equal(fixture.taylorOffers.length, 5);
  for (const offer of fixture.taylorOffers) {
    assert.equal(offer.offers.availability, "http://schema.org/SoldOut");
    const instant = new Date(offer.startDate);
    const event = {
      ...fixture.taylor,
      url: offer.offers.url,
      date: instant.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }),
      time: instant.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }),
    };
    assert.equal(applyVerifiedEventFacts(event).registration, "full");
    assert.equal(applyVerifiedEventFacts({ ...event, registration: "closed" }).registration, "closed");
    for (const other of [
      { ...event, date: "2027-01-29" },
      { ...event, time: "5:00 PM" },
      { ...event, url: event.url.replace(/(\d+)\?/, (_, id) => `${id}0?`) },
      { ...event, venue: "Another Improv" },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("the restricted Surgery M&M listing is withheld while public medical lectures remain eligible", () => {
  const event = fixture.surgery;
  assert.equal(isPublicEvent(event.title, event.source, event.description, event.venue), false);
  assert.equal(isEventPublishable(event), false);
  assert.equal(isPublicEvent("Pediatric Grand Rounds (CME): Beyond Blood", "Stanford Events", "Open to the general public.", "Center for Academic Medicine"), true);
  assert.equal(isEventPublishable({ ...event, title: "Public Surgery Lecture" }), true);
  assert.equal(isPublicEvent(event.title, "Community Organizer", "Public event", event.venue), true);
});
