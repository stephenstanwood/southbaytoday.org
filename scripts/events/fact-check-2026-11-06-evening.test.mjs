import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchSquarespaceEvents, inferCategory, cleanTitle, resolveRunWindow, fetchMontalvoEvents } from "../generate-events.mjs";
import { fetchSquarespacePublicItems, parseSquarespacePublicCalendar, parseSquarespacePublicDetail } from "../lib/squarespace-public-events.mjs";
import { parseMontalvoOccurrencePage } from "../../src/lib/south-bay/montalvoOccurrence.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-06-evening.json", import.meta.url)));
const moah = fixture.details[0];

test("permitted public calendars identify the same dated museum and bookshop events", () => {
  assert.deepEqual(fixture.calendars.map(c => parseSquarespacePublicCalendar(c.html, c.url).length), [3, 10, 2]);
  for (const detail of fixture.details) {
    const calendar = fixture.calendars.find(c => c.url === detail.calendarUrl);
    const listing = parseSquarespacePublicCalendar(calendar.html, calendar.url).find(e => e.url === detail.url);
    const event = parseSquarespacePublicDetail(detail.html, listing);
    assert.equal(event.fullUrl, detail.url);
    assert(event.body.length > 100);
    assert.equal(event.location.addressTitle, detail === moah ? "Downtown Library" : detail.url.includes("eastwestbooks") ? "East West Bookshop" : "Kepler's Books");
    assert.throws(() => parseSquarespacePublicDetail(detail.html, { ...listing, date: "2027-11-06" }), /identity mismatch/);
    assert.throws(() => parseSquarespacePublicDetail(detail.html, { ...listing, title: "Another event" }), /identity mismatch/);
  }
  assert.throws(() => parseSquarespacePublicCalendar("<p>Access denied</p>", moah.calendarUrl), /not recognized/);
  const card = '<div class="eventlist--upcoming"><article class="eventlist-event--upcoming"><a href="https://example.com/event" class="eventlist-title-link">Other event</a><time class="event-date" datetime="2026-11-06"></time></article></div>';
  assert.throws(() => parseSquarespacePublicCalendar(card, moah.calendarUrl), /not a public detail page/);
});

test("Squarespace public ingestion never requests the excluded JSON feed", async () => {
  const calendar = fixture.calendars[0];
  const listing = parseSquarespacePublicCalendar(calendar.html, calendar.url).find(e => e.url === moah.url);
  const oneCard = calendar.html.match(/<article\b[\s\S]*?<\/article>/)[0];
  const requests = [], waits = [];
  const [event] = await fetchSquarespacePublicItems(calendar.url, {
    wait: async ms => waits.push(ms),
    fetchImpl: async url => {
      requests.push(url);
      if (url === calendar.url) return new Response('<div class="eventlist--upcoming">' + oneCard + '</div>');
      assert.equal(url, listing.url);
      return new Response(moah.html);
    },
  });
  assert.equal(event.title, listing.title);
  assert.deepEqual(requests, [calendar.url, moah.url]);
  assert.deepEqual(waits, [1100]);
});

test("a started craft session cannot return as a clock-free exhibit", async (t) => {
  const calendar = fixture.calendars[0];
  const card = calendar.html.match(/<article\b[\s\S]*?<\/article>/)[0];
  t.mock.method(globalThis, "setTimeout", fn => { queueMicrotask(fn); return 0; });
  t.mock.method(globalThis, "fetch", async url => {
    assert(!String(url).includes("format=json"));
    return new Response(url === calendar.url ? '<div class="eventlist--upcoming">' + card + '</div>' : moah.html);
  });
  const start = new Date("2026-11-06T15:30:00-08:00"), end = new Date("2026-11-06T17:30:00-08:00");
  const before = await fetchSquarespaceEvents(calendar.url, "Museum of American Heritage", "palo-alto", "Museum", "", { now: new Date("2026-11-06T15:00:00-08:00") });
  assert.equal(before[0].time, "3:30 PM");
  assert.equal(before[0].endTime, "5:30 PM");
  assert.equal(before[0].cost, "free");
  assert.equal(before[0].ongoing, undefined);
  assert.equal(resolveRunWindow(start, end, new Date("2026-11-06T16:00:00-08:00"), { title: before[0].title }), null);
  const during = await fetchSquarespaceEvents(calendar.url, "Museum of American Heritage", "palo-alto", "Museum", "", { now: new Date("2026-11-06T16:00:00-08:00") });
  assert.equal(during.length, 0);
  assert.equal(resolveRunWindow(new Date("2026-10-01T12:00:00-07:00"), new Date("2026-12-01T12:00:00-08:00"), start, { title: "New Works Exhibition" }).ongoing, true);
});

test("youth workshop audience survives overview, ticket parsing, ingestion and retained admission", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-07T01:07:05Z") });
  const title = "Super-Secret Holiday Gift-Making Workshop for Youth";
  for (const html of [fixture.montalvo.overview, fixture.montalvo.occurrence]) {
    const detail = parseMontalvoOccurrencePage(html);
    assert.equal(detail.kidFriendly, true);
    assert.deepEqual(detail.sourceAudiences, ["Children"]);
    assert.equal(classifyAudienceAge(detail), "kids");
  }
  const calendar = '<script type="application/ld+json">' + JSON.stringify({ "@type": "Event", name: title, startDate: "2026-11-15T10:00:00", url: "https://my.montalvoarts.org/overview/3280" }) + '</script>';
  t.mock.method(globalThis, "fetch", async url => new Response(String(url).includes('events-calendar') ? calendar : fixture.montalvo.overview));
  const [event] = await fetchMontalvoEvents({ previousEvents: [] });
  assert.equal(event.kidFriendly, true);
  assert.equal(classifyAudienceAge(event), "kids");
  t.mock.method(globalThis, "fetch", async url => {
    if (String(url).includes('events-calendar')) return new Response(calendar);
    throw Error("unavailable");
  });
  const [retained] = await fetchMontalvoEvents({ previousEvents: [event] });
  assert.equal(classifyAudienceAge(retained), "kids");
  assert.deepEqual(retained.occurrenceEvidence, event.occurrenceEvidence);
});

test("a parenting talk's subject does not make it toddler programming", () => {
  const talk = { title: "Janet Lansbury with Ruth Whippman", description: "The go-to parenting expert discusses caring for infants and toddlers.", kidFriendly: false };
  assert.equal(classifyAudienceAge(talk), "all");
  assert.equal(classifyAudienceAge({ ...talk, sourceAudiences: ["Children"] }), "kids");
  assert.equal(classifyAudienceAge({ ...talk, title: "Toddler Storytime" }), "kids");
  assert.equal(classifyAudienceAge({ ...talk, description: talk.description + " Adults only." }), "adult");
});

test("optional Fan Pass upgrades are ineligible even when cached copy is sparse", () => {
  const title = "Ultimate Fan Pass: 30-min Exclusive On-Court Access from 1:30PM-2:00PM";
  assert.equal(isEventPublishable({ source: "Ticketmaster", title }), false);
  assert.equal(isEventPublishable({ source: "Ticketmaster", title: "Harlem Globetrotters: Rivalry Tour Presented by Sprite" }), true);
  assert.equal(isEventPublishable({ source: "Library", title: "Ultimate Fan Pass book talk" }), true);
});

test("Veterans Day observances keep their civic category and MOAA initials", () => {
  assert.equal(inferCategory("Stanford Palo Alto Veterans Day Celebration", "", "", "MacArthur Park Restaurant & Bar"), "community");
  assert.equal(inferCategory("Veterans Day Hike", "", "", "Quarry Park"), "outdoor");
  assert.equal(cleanTitle("MOAA Silicon Valley Veterans Day Parade & Ceremony"), "MOAA Silicon Valley Veterans Day Parade & Ceremony");
  assert.equal(cleanTitle("Moaa reads at the library"), "Moaa reads at the library");
});

test("the dated teen writing group honors optional signup without opening a changed requirement", () => {
  const event = { date: "2026-11-10", url: "https://sjpl.bibliocommons.com/events/6a85eceebe14820029887e87", registration: "required", registrationClosesBy: "2026-11-11T00:30:00Z", description: "Registration recommended but not required." };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.registration, "none");
  assert.equal(fixed.registrationClosesBy, null);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.equal(applyVerifiedEventFacts({ ...event, description: "Registration is required." }).registration, "required");
  assert.equal(applyVerifiedEventFacts({ ...event, description: event.description + " Registration is required for the workshop." }).registration, "required");
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
  }
  assert.equal(applyVerifiedEventFacts({ ...event, date: "2027-11-10" }).registration, "required");
});

test("the county notice does not establish parade organizers or a marching roster", () => {
  const event = { source: "City Newsletter", city: "san-jose", date: "2026-11-11", title: "Moaa Silicon Valley Veterans Day Parade & Ceremony", description: "Veterans and local elected officials will march.", blurb: "Organized by the Military Officers Association chapter." };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.title, "MOAA Silicon Valley Veterans Day Parade & Ceremony");
  assert(!fixed.description.includes("will march"));
  assert(!fixed.blurb.includes("Organized by"));
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.deepEqual(applyVerifiedEventFacts({ ...event, date: "2027-11-11" }), { ...event, date: "2027-11-11" });
});
