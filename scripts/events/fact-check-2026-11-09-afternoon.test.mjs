import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchInboundEvents, inferCategory, isPublicEvent, mapTicketmasterEvent } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { retireSlugs, resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const { events } = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-09-afternoon.json", import.meta.url)));
const row = id => structuredClone(events.find(e => e.id === id));

test("a local team's away-at-home playoff matchup beats the academic conference heuristic", () => {
  const game = row("tm-Z7r9jZ1AA7ff6");
  assert.equal(inferCategory(game.title, "Soccer", "Sports", game.venue), "sports");
  const actual = mapTicketmasterEvent({
    id: "Z7r9jZ1AA7ff6", name: game.title, url: game.url,
    dates: { start: { localDate: game.date, localTime: "19:00:00" }, status: { code: "onsale" } },
    classifications: [{ segment: { name: "Sports" }, genre: { name: "Soccer" } }],
    _embedded: { venues: [{ name: game.venue, city: { name: "San Jose" }, address: { line1: game.address } }] },
  });
  assert.equal(actual.category, "sports");
  assert.equal(actual.date, game.date); assert.equal(actual.time, game.time);
  assert.equal(inferCategory("Earthquakes research conference at Stanford", "", "", "Stanford University"), "education");
  assert.equal(inferCategory("Regional planning at City Hall: Western Conference Round One", "", "", "City Hall"), "education");
  assert.equal(inferCategory("Community 5K Fun Run", "Sports and games", "Sports", "Community Park"), "community");
});

test("the faculty research-services workshop is withheld at publication and from retained recommendation pools", () => {
  const event = row("scu-b5d2f3ac5abd5590");
  assert.equal(isPublicEvent(event.title, event.source, event.description, event.venue), false);
  assert.equal(isEventPublishable(event), false);
  assert.equal(isPublicEvent("Faculty Recital", event.source, "A public performance open to everyone.", event.venue), true);
  assert.equal(isEventPublishable({ ...event, title: "Public Research Lecture" }), true);
  const ledger = retireSlugs({ entries: [] }, [event], [], "2026-11-09");
  const retired = resolveRetired(ledger, [], [], "2026-11-09");
  assert.equal(retired.orphans.length, 1, "the existing URL remains a notice instead of disappearing");
  assert.equal(isEventPublishable(retired.orphans[0].event), false);
});

test("newsletter ingestion and publication preserve the museum's afternoon workshop price and minimum age", async () => {
  const event = row("inbound-cbe7bf12fd0834c1");
  const [actual] = fetchInboundEvents({ today: "2026-11-09", events: [{
    id: "museum-afternoon", title: event.title, startsAt: "2027-01-30T13:00:00-08:00",
    endsAt: "2027-01-30T15:00:00-08:00", sourceUrl: event.url,
    cityKey: event.city, location: event.address, description: event.description,
  }] });
  assert.ok(actual);
  await resolveEventBlurbs([actual], { enabled: false });
  assert.equal(actual.time, "1:00 PM"); assert.equal(actual.endTime, "3:00 PM");
  assert.equal(actual.cost, "paid"); assert.equal(actual.costNote, "$30 per person; materials included");
  assert.match(actual.attendanceNote, /Ages 13\+/);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("cached publication keeps the verified admission and category corrections without reopening booking", async () => {
  const raw = events.filter(e => e.id !== "scu-b5d2f3ac5abd5590");
  const source = structuredClone(raw);
  const published = structuredClone(raw);
  await resolveEventBlurbs(published, { enabled: false });
  const byId = id => published.find(e => e.id === id);
  assert.equal(byId("tm-Z7r9jZ1AA7ff6").category, "sports");
  const openHouse = byId("inbound-5cd25b1bb64ca793");
  assert.equal(openHouse.category, "community");
  assert.equal(openHouse.cost, null, "a suggested donation is not mandatory admission");
  assert.match(openHouse.costNote, /\$15 suggested donation/);
  assert.match(openHouse.attendanceNote, /\$15 suggested donation/);
  assert.match(openHouse.attendanceNote, /walk-ins are welcome/);
  assert.equal(requiresAdvanceRegistration(openHouse), false);
  const ribbon = byId("inbound-3f957926e4277ef7");
  assert.equal(ribbon.cost, "free"); assert.equal(ribbon.time, "5:00 PM"); assert.equal(ribbon.endTime, "6:30 PM");
  for (const id of ["stanford-54004138575427-2026-11-10", "stanford-53879694289980-2026-11-10"]) {
    assert.equal(byId(id).cost, "free");
  }
  for (const e of published) {
    assert.deepEqual(applyVerifiedEventFacts(e), e);
    const before = source.find(s => s.id === e.id);
    for (const k of ["id", "date", "title", "time", "venue", "description", "blurb"]) assert.deepEqual(e[k], before[k], e.id + " " + k);
    for (const registration of ["full", "closed", "appointment-only"]) {
      const later = applyVerifiedEventFacts({ ...before, registration, attendanceNote: "Current organizer booking notice." });
      assert.equal(later.registration, registration);
      assert.match(later.attendanceNote, /^Current organizer booking notice\./);
    }
  }
  assert.deepEqual(raw, source, "source objects are not mutated");
});

test("the Veterans Day source-link recovery respects later organizer URLs", () => {
  const event = row("inbound-7fd4ce145689ef0f");
  const actual = applyVerifiedEventFacts(event);
  assert.equal(actual.url, "https://events.stanford.edu/event/stanford-university-palo-alto-veterans-day-celebration");
  assert.equal(actual.time, "3:00 PM"); assert.equal(actual.endTime, "5:00 PM");
  const later = { ...event, url: "https://community.stanford.edu/events/veterans-day-2026" };
  assert.deepEqual(applyVerifiedEventFacts(later), later);
});

test("source corrections cannot leak to other dates, URLs or venues", () => {
  for (const event of events.filter(e => e.id !== "scu-b5d2f3ac5abd5590")) {
    for (const other of [
      { ...event, date: "2028-11-10" }, { ...event, venue: "Another venue" },
      { ...event, url: "https://example.org/another-occurrence" },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other, event.id);
  }
});
