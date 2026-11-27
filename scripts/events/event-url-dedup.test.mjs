import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBooksIncEvents } from "../lib/booksinc-events.mjs";
import { deduplicateEventSlots, deduplicateEventTitles, deduplicateEventUrls } from "../lib/event-url-dedup.mjs";
import { capUpcomingEventSources, cleanTitle, deduplicateSameDaySports, fetchPlaywrightEvents, isEventTimeBackfillCandidate, stripRedundantVenueSuffix } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/booksinc-calendar-2026-11-17.json", import.meta.url)));
const books = () => parseBooksIncEvents([JSON.stringify(fixture.events)], { today: "2026-11-03" });

test("Books Inc.'s calendar retains simultaneous events at its Palo Alto and Mountain View stores", () => {
  const events = fetchPlaywrightEvents({ events: books(), today: "2026-11-03" })
    .map((event) => ({ ...event, title: cleanTitle(stripRedundantVenueSuffix(cleanTitle(event.title), event.venue)) }));
  assert.equal(events.length, 2);
  assert.equal(events[0].url, events[1].url);
  assert.equal(events[0].time, events[1].time);
  assert.deepEqual(deduplicateEventUrls(events), events);
  assert.deepEqual(events.map((event) => event.city), ["palo-alto", "mountain-view"]);
  assert.match(events[1].title, /^All Things Romance Book Club/);
});

test("calendar copies at one venue still deduplicate while a missing venue establishes no shared destination", () => {
  const [event] = books();
  const unknownVenue = { ...event, title: "Another calendar entry", venue: "", address: "" };
  const copy = { ...event, title: "Alternate title", venue: event.venue.toUpperCase(), time: "6:00PM" };
  assert.deepEqual(deduplicateEventUrls([event, copy, unknownVenue]), [event, unknownVenue]);
});

test("event detail URLs still collapse differently titled and venue-less copies", () => {
  const event = { title: "Community academy", url: "https://example.org/events/community-academy", date: "2026-11-17", time: "6:00 PM" };
  const copy = { ...event, title: "Police community academy", venue: "Town Hall", time: "6:00PM" };
  const later = { ...event, time: "7:00 PM" };
  const nextDay = { ...event, date: "2026-11-18" };
  assert.deepEqual(deduplicateEventUrls([event, copy, later, nextDay]), [event, later, nextDay]);
});

test("an event identifier in a calendar query remains an occurrence link", () => {
  const event = { title: "Workshop", url: "https://example.org/calendar.aspx?EID=123", date: "2026-11-17", time: "6:00 PM", venue: "Library" };
  assert.deepEqual(deduplicateEventUrls([event, { ...event, venue: "Community Room" }]), [event]);
});

test("URL matching leaves incomplete records and the original inputs intact", () => {
  const events = [{ title: "No clock", date: "2026-11-17", url: fixture.sourceUrl }, { title: "No URL", date: "2026-11-17", time: "6:00 PM" }];
  const original = structuredClone(events);
  assert.deepEqual(deduplicateEventUrls(events), original);
  assert.deepEqual(events, original);
});

test("a venue-less newsletter cannot displace the theater's dated performance", () => {
  const newsletter = {
    title: "Come From Away at CMT San Jose", source: "City Newsletter",
    date: "2026-12-04", time: "7:00 PM", city: "san-jose", venue: null,
    url: "https://cmt.vbotickets.com/event/Come_From_Away/198526",
  };
  const theater = {
    title: "Come From Away", source: "San Jose Theaters", date: newsletter.date, time: newsletter.time,
    venue: "Montgomery Theater", url: "https://www.sanjose.org/theaters/events/come-away",
    occurrenceEvidence: {
      kind: "first-party-occurrence-page", date: newsletter.date, time: newsletter.time,
      sourceUrl: "https://www.sanjose.org/theaters/events/come-away",
    },
  };
  assert.deepEqual(deduplicateEventTitles(deduplicateEventSlots([newsletter, theater])), [theater]);
  assert.deepEqual(deduplicateEventTitles([theater, newsletter]), [theater]);
  const corrected = applyVerifiedEventFacts(newsletter);
  assert.equal(corrected.venue, theater.venue);
  assert.equal(corrected.cost, "paid");
  assert.deepEqual(deduplicateEventSlots([corrected, theater]), [theater]);
  const oldSlug = "2026-12-04-come-from-away-at-cmt-san-jose";
  const retired = resolveRetired({ entries: [{ slug: oldSlug, event: newsletter }] },
    [theater], [], "2026-11-27");
  assert.equal(retired.redirects.get(oldSlug), "2026-12-04-come-from-away");

});

test("the Seahawks game keeps the stadium's exact event link and paid admission", () => {
  const newsletter = {
    title: "49ers vs. Seahawks", source: "City Newsletter", city: "santa-clara",
    date: "2026-11-29", time: "1:25 PM", venue: "Levi's Stadium", cost: null,
    url: "https://levisstadium.com/",
  };
  const corrected = applyVerifiedEventFacts(newsletter);
  assert.equal(corrected.cost, "paid");
  assert.equal(corrected.time, "1:25 PM");
  assert.equal(corrected.url, "https://levisstadium.com/event/seahawks-vs-49ers-week-12-2026/");
  assert.equal(corrected.occurrenceEvidence.sourceUrl, corrected.url);
  const rescheduled = { ...newsletter, time: "5:20 PM" };
  assert.deepEqual(applyVerifiedEventFacts(rescheduled), rescheduled);
});

test("Stanford's individual game links establish paid admission and their published tipoffs", () => {
  const game = {
    source: "City Newsletter", date: "2026-12-22", time: null, venue: "Maples Pavilion",
    title: "Stanford Men's Basketball vs. St. Thomas",
    url: "https://tickets.gostanford.com/events/mens-basketball-vs-saint-thomas-j5m8o2",
    description: "Stanford hosts St. Thomas. Start time not listed in the newsletter.",
  };
  const corrected = applyVerifiedEventFacts(game);
  assert.equal(corrected.cost, "paid");
  assert.equal(corrected.time, "5:00 PM");
  assert.equal(corrected.description, "Stanford hosts St. Thomas.");
  const otherGame = { ...game, date: "2027-01-09" };
  assert.deepEqual(applyVerifiedEventFacts(otherGame), otherGame);
});

test("reposted newsletters leave room for a later occurrence under the source cap", () => {
  const listing = { source: "City Newsletter", date: "2026-11-19", time: "7:30 PM", venue: "Bing Concert Hall" };
  const earlier = Array.from({ length: 199 }, (_, i) => ({
    ...listing, url: `https://example.edu/event/${i}`,
  }));
  const copy = { ...earlier[0], description: "The current bulletin has the performer details." };
  const later = { ...listing, date: "2027-03-13", url: "https://example.edu/event/march-concert" };
  const outsideCap = { ...later, date: "2027-04-01" };
  assert.deepEqual(capUpcomingEventSources([...earlier, copy, later, outsideCap]), [
    ...earlier.slice(1), copy, later,
  ]);
});

test("duplicate ticket listings with different links count as one venue slot", () => {
  const listing = { source: "Ticketmaster", date: "2027-01-27", time: "7:30 PM" };
  const earlier = Array.from({ length: 199 }, (_, i) => ({
    ...listing, venue: `Venue ${i}`, url: `https://example.com/event/${i}`,
  }));
  const copy = { ...earlier[0], url: "https://example.com/event/duplicate" };
  const later = { ...listing, date: "2027-01-28", venue: "San Jose Improv" };
  assert.deepEqual(capUpcomingEventSources([...earlier, copy, later]), [...earlier, later]);
});

test("timed-entry copies with a shared booking page leave room for later Ticketmaster events", () => {
  const shared = { source: "Ticketmaster", city: "san-jose", date: "2026-11-25", time: "7:30 PM" };
  const earlier = Array.from({ length: 198 }, (_, i) => ({
    ...shared, id: `earlier-${i}`, venue: `Venue ${i}`, url: `https://example.com/event/${i}`,
  }));
  const timedEntry = {
    ...shared, title: "Holiday pop-up", venue: "The Continental Bar",
    url: "https://www.universe.com/events/holiday-pop-up-tickets",
  };
  const slots = ["6:00 PM", "6:15 PM", "6:30 PM"].map((time, i) => ({ ...timedEntry, time, id: `holiday-${i}` }));
  const later = { ...shared, id: "later-show", title: "Standup", venue: "San Jose Improv", date: "2026-12-08" };
  const kept = capUpcomingEventSources([...earlier, ...slots, later]);
  assert.equal(kept.length, 200);
  assert.equal(kept.filter((event) => event.url === timedEntry.url).length, 1);
  assert.equal(kept.at(-1), later);
});

test("the Ticketmaster cap preserves verified shows and Barracuda home games", () => {
  const earlier = Array.from({ length: 200 }, (_, index) => ({
    source: "Ticketmaster", date: "2027-01-29", time: "7:30 PM", venue: `Venue ${index}`,
    url: `https://example.com/event/${index}`,
  }));
  const shows = [
    ["Kawaii Rave", "8:00 PM", "The Ritz", "kawaii-rave-the-ritz-tickets/14409774"],
    ["Godfrey", "7:00 PM", "San Jose Improv", "godfrey-san-jose-improv-tickets/14893773"],
    ["Godfrey", "9:30 PM", "San Jose Improv", "godfrey-san-jose-improv-tickets/14893783"],
  ].map(([title, time, venue, path]) => ({
    title, time, venue, source: "Ticketmaster", date: "2027-01-30", city: "san-jose",
    url: `https://www.ticketweb.com/event/${path}`,
  }));
  shows.push({
    title: "San Jose Barracuda vs. Ontario Reign", time: "6:00 PM", venue: "Tech CU Arena",
    source: "Ticketmaster", date: "2027-01-30", city: "san-jose", category: "sports",
    url: "https://www.ticketmaster.com/san-jose-barracuda-vs-ontario-reign-san-jose-california-01-30-2027/event/1C00650495EEB7B5",
  }, {
    title: "San Jose Barracuda vs. Chicago Wolves", time: "7:00 PM", venue: "Tech CU Arena",
    source: "Ticketmaster", date: "2027-02-05", city: "san-jose", category: "sports",
    url: "https://www.ticketmaster.com/san-jose-barracuda-vs-chicago-wolves-san-jose-california-02-05-2027/event/1C00650495F3B7C6",
  });

  assert.deepEqual(capUpcomingEventSources([...earlier, ...shows]), earlier);
  const verified = shows.map(applyVerifiedEventFacts);
  const changed = [
    { ...shows[2], time: "10:00 PM" },
    { ...shows.at(-1), time: "8:00 PM" },
  ].map(applyVerifiedEventFacts);
  assert.ok(changed.every(event => event.occurrenceEvidence === undefined));
  assert.deepEqual(capUpcomingEventSources([...earlier, ...verified, ...changed]), [...earlier, ...verified]);
});

test("the ticket cap preserves both verified Mojo Brookzz showtimes at San Jose Civic", () => {
  const earlier = Array.from({ length: 200 }, (_, i) => ({
    source: "Ticketmaster", date: "2027-02-04", time: "7:30 PM", venue: `Venue ${i}`,
    url: `https://example.com/event/${i}`,
  }));
  const shows = [["7:00 PM", "1C006553991FB623"], ["9:45 PM", "1C0065677CAD3FF8"]].map(([time, ticketId]) =>
    applyVerifiedEventFacts({
      source: "Ticketmaster", date: "2027-02-05", time, venue: "San Jose Civic",
      url: `https://www.ticketmaster.com/mojo-brookzz-outta-pocket-tour-san-jose-california-02-05-2027/event/${ticketId}`,
    }));
  const changedTime = { ...shows[1], time: "10:00 PM" };
  assert.deepEqual(capUpcomingEventSources([...earlier, ...shows, changedTime]), [...earlier, ...shows]);
  assert.equal(applyVerifiedEventFacts({ ...changedTime, occurrenceEvidence: undefined }).occurrenceEvidence, undefined);
});

test("the Ticketmaster cap keeps the confirmed February 6 Ritz and Improv shows", () => {
  const earlier = Array.from({ length: 200 }, (_, i) => ({
    source: "Ticketmaster", date: "2027-02-05", time: "7:30 PM", venue: `Venue ${i}`,
    url: `https://example.com/event/${i}`,
  }));
  const shows = [
    ["Shrek Rave", "9:00 PM", "The Ritz", "shrek-rave-the-ritz-tickets/15059553"],
    ["Danny Gonzalez & Friends", "7:00 PM", "San Jose Improv", "danny-gonzalez-friends-san-jose-improv-tickets/14294064"],
  ].map(([title, time, venue, path]) => ({
    title, time, venue, source: "Ticketmaster", date: "2027-02-06", city: "san-jose",
    url: `https://www.ticketweb.com/event/${path}`,
  }));
  assert.deepEqual(capUpcomingEventSources([...earlier, ...shows]), earlier);
  const verified = shows.map(applyVerifiedEventFacts);
  assert.deepEqual(capUpcomingEventSources([...earlier, ...verified]), [...earlier, ...verified]);
  assert.match(verified[1].attendanceNote, /Waitlist only when checked November 27/);
});

test("the Ticketmaster cap keeps both separately ticketed Bodyguard shows", () => {
  const earlier = Array.from({ length: 200 }, (_, i) => ({
    source: "Ticketmaster", date: "2027-02-05", time: "7:30 PM", venue: `Venue ${i}`,
    url: `https://example.com/event/${i}`,
  }));
  const shows = [["2:00 PM", "1C00651FC9B56977"], ["7:30 PM", "1C00651FC9BB6997"]]
    .map(([time, ticketId], index) => applyVerifiedEventFacts({
      id: `bodyguard-${index}`, title: "The Bodyguard (Touring)", city: "san-jose",
      category: "arts", source: "Ticketmaster", date: "2027-02-06", time,
      venue: "San Jose Center for the Performing Arts",
      url: `https://www.ticketmaster.com/the-bodyguard-touring-san-jose-california-02-06-2027/event/${ticketId}`,
    }));
  assert.deepEqual(capUpcomingEventSources([...earlier, ...shows]), [...earlier, ...shows]);
  const changed = applyVerifiedEventFacts({ ...shows[0], time: "3:00 PM", occurrenceEvidence: undefined });
  assert.equal(changed.occurrenceEvidence, undefined);
  assert.deepEqual(capUpcomingEventSources([...earlier, changed]), earlier);
});

test("Stanford ticket promotions cannot supply a start time for an individual game", () => {
  const event = { date: "2027-02-19", time: null, url: "https://tickets.gostanford.com/p/cardinal-friday" };
  assert.equal(isEventTimeBackfillCandidate(event), false);
  assert.equal(isEventTimeBackfillCandidate({
    ...event,
    url: "https://tickets.gostanford.com/events/baseball-vs-rhode-island-fri-p36ckn/6affa8fc3e1cc40f43713918",
  }), true);
});

test("same-day sports dedup retains both verified events at Maples Pavilion", () => {
  const shared = { category: "sports", source: "City Newsletter", date: "2026-11-22", venue: "Maples Pavilion" };
  const volleyball = {
    ...shared, time: "12:00 PM", title: "Stanford Women's Volleyball vs. Boston College & Cooler Bag Giveaway",
    url: "https://gostanford.com/promotions/womens-volleyball-promotions",
  };
  const wrestling = {
    ...shared, time: "5:00 PM", title: "No. 6 Stanford Wrestling vs. No. 2 Oklahoma State (California Combat Night)",
    url: "https://gostanford.com/news/2026/11/19/card-cowboys-clash-in-maples",
  };
  const verified = [volleyball, wrestling].map(applyVerifiedEventFacts);
  assert.deepEqual(deduplicateSameDaySports([...verified, { ...verified[0], title: "Fan Appreciation Day" }]), verified);
  assert.deepEqual(deduplicateSameDaySports([verified[0], wrestling]), verified.slice(0, 1));
});
