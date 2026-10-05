import assert from "node:assert/strict";
import test from "node:test";
import { fetchInboundEvents } from "../generate-events.mjs";

import {
  inboundClock,
  JEREMY_FREY_EXHIBITION_URL,
  PAPAHUGS_OCCURRENCE_URL,
  SJ_GIANTS_JAPANESE_HERITAGE_2026_07_26_URL,
  SILICON_VALLEY_PRIDE_2026_URL,
  normalizeInboundEventPresentation,
} from "./inbound-event-normalize.mjs";

test("verified Sunnyvale online talks keep their format when the newsletter loses its location", () => {
  const talks = [
    ["Pasta with a Twist: A Fresh Take on Italian Classics with Joe Sasto", "2026-10-06"],
    ["Art in Flight: Reinventing Postmodernism with Carolyn Russo", "2026-10-08"],
  ];
  for (const [title, date] of talks) {
    const raw = {
      id: `fixture-${date}`, cityKey: "sunnyvale", title,
      startsAt: `${date}T11:00:00-07:00`, endsAt: `${date}T12:00:00-07:00`,
      location: null, sourceUrl: null,
    };
    const event = fetchInboundEvents({ events: [raw], today: "2026-10-04" })[0];
    assert.equal(event.virtual, true);
    assert.equal(event.venue, "Online");
    assert.equal(event.time, "11:00 AM");
    assert.match(event.url, /-curm-10\/-cury-2026/);
    assert.equal(normalizeInboundEventPresentation({ ...raw, cityKey: "campbell" }).virtual, undefined);
    assert.equal(normalizeInboundEventPresentation({ ...raw, startsAt: raw.startsAt.replace("2026", "2027") }).virtual, undefined);
  }
});

test("Campbell's verified Saturday date is applied before the past-occurrence filter", () => {
  const raw = {
    id: "inbound_mu62yvos_eogfnd", cityKey: "campbell",
    title: "Annual Citywide Garage Sale",
    startsAt: "2026-10-04T08:00:00-07:00",
    endsAt: "2026-10-04T16:00:00-07:00",
    sourceUrl: "http://www.campbellca.gov/597/Community-Garage-Sale",
  };
  const saturday = fetchInboundEvents({ events: [raw], today: "2026-10-03" });
  assert.equal(saturday.length, 1);
  assert.equal(saturday[0].date, "2026-10-03");
  assert.equal(saturday[0].displayDate, "Sat, Oct 3");
  assert.equal(saturday[0].time, "8:00 AM");
  assert.equal(saturday[0].endTime, "4:00 PM");
  assert.match(saturday[0].url, /^https:/);
  assert.deepEqual(fetchInboundEvents({ events: [raw], today: "2026-10-04" }), []);

  const otherYear = { ...raw, startsAt: "2027-10-04T08:00:00-07:00", endsAt: null };
  assert.equal(fetchInboundEvents({ events: [otherYear], today: "2027-10-03" })[0].date, "2027-10-04");
  const otherSource = { ...raw, sourceUrl: "https://example.org/garage-sale" };
  assert.equal(fetchInboundEvents({ events: [otherSource], today: "2026-10-03" })[0].date, "2026-10-04");
});

test("a play with kids in its title is not promoted as children's programming", () => {
  const event = fetchInboundEvents({ today: "2026-10-03", events: [{
    id: "fixture-hodge", fromEmail: "latest@email.live.stanford.edu",
    title: "All Gregs Kids Come Home - Staged Reading",
    startsAt: "2026-10-17T19:00:00-07:00", location: "The Studio, Stanford",
    description: "A staged reading of Chinaka Hodge's play about a family.",
  }] })[0];
  assert.equal(event.category, "arts");
  assert.equal(event.kidFriendly, false);
  assert.match(event.url, /\/studio\/chinaka-hodge\/$/);
});

test("inbound end-of-day and midnight sentinels are not visitor times", () => {
  assert.equal(inboundClock("2026-07-20T23:59:59-07:00"), null);
  assert.equal(inboundClock("2026-07-20T00:00:00-07:00"), null);
  // Nov. 1 is still PDT at midnight. The bad -08 source offset used to convert
  // this sentinel to 1 AM and publish it as a real event time.
  assert.equal(inboundClock("2026-11-01T00:00:00-08:00"), null);
  assert.equal(inboundClock("2026-07-20T18:30:00-07:00"), "6:30 PM");
});

test("seasonally inconsistent Pacific offsets stay unknown without first-party evidence", () => {
  assert.equal(inboundClock("2026-11-17T19:00:00-07:00"), null);
  assert.equal(inboundClock("2027-03-10T19:30:00-07:00"), null);
  assert.equal(inboundClock("2026-07-20T18:30:00-08:00"), null);
  assert.equal(inboundClock("2026-11-17T19:00:00-08:00"), "7:00 PM");
  assert.equal(inboundClock("2026-11-18T03:00:00Z"), "7:00 PM");
  assert.equal(normalizeInboundEventPresentation({
    title: "Unknown winter event", location: "Heritage Theatre",
    startsAt: "2026-11-17T19:00:00-07:00",
  }).time, null);
});

test("verified performance times survive bad newsletter offsets before deduplication", () => {
  const cases = [
    ["Taimane", "Heritage Theatre", "2027-02-07T19:30:00-07:00", "7:30 PM"],
    ["Jaemin Han Cello Recital", "Bing Concert Hall", "2027-03-10T19:30:00-07:00", "7:30 PM"],
    ["Toast - The Best of Bread", "Heritage Theatre", "2026-11-17T19:00:00-07:00", "7:00 PM"],
    ["World Ballet Company: Swan Lake", "Heritage Theatre", "2026-11-19T19:00:00-07:00", "7:00 PM"],
    ["Harriet: Trying to Get the Feeling Again", "Heritage Theatre", "2026-11-20T19:00:00-07:00", "7:00 PM"],
    ["World Ballet Company: The Nutcracker", "Heritage Theatre", "2026-12-16T19:00:00-07:00", "7:00 PM"],
  ];
  for (const [title, location, startsAt, time] of cases) {
    assert.equal(normalizeInboundEventPresentation({ title, location, startsAt }).time, time);
  }
  assert.match(normalizeInboundEventPresentation({
    title: "Jaemin Han Cello Recital", location: "Bing Concert Hall",
    startsAt: "2027-03-10T19:30:00-07:00",
  }).url, /jaemin-han-cello-recital\/$/);
});

test("Jeremy Frey closing day uses official museum hours and exhibition URL", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Jeremy Frey: Woven closing",
    startsAt: "2026-07-20T23:59:59-07:00",
    endsAt: null,
    location: "Cantor Arts Center, Stanford University",
    sourceUrl: "https://guides.bloombergconnects.org/example",
  }), {
    time: "11:00 AM",
    endTime: "6:00 PM",
    url: JEREMY_FREY_EXHIBITION_URL,
  });
});

test("PapaHugs uses the museum occurrence page and published end time", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "David PapaHugs Sharpe concert",
    startsAt: "2026-07-22T11:00:00-07:00",
    endsAt: null,
    location: "Children's Discovery Museum of San Jose Amphitheatre, 180 Woz Way, San Jose, CA 95110",
    sourceUrl: "https://14945.blackbaudhosting.com/14945/page.aspx?pid=196&tab=2&txobjid=generic-ticket",
  }), {
    time: "11:00 AM",
    endTime: "11:45 AM",
    url: PAPAHUGS_OCCURRENCE_URL,
  });
});

test("SJ Giants Japanese Heritage Night uses the official MiLB ticket sales group", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "San Jose Giants Japanese Heritage Game Night",
    startsAt: "2026-07-26T17:00:00-07:00",
    endsAt: null,
    location: "Excite Ballpark, 588 E Alma Ave, San Jose, CA 95112",
    sourceUrl: "https://www.eventbrite.com/e/3rd-annual-aapi-playwright-festival-sj-japantown-guided-tour-tickets-1989767460036",
  }), {
    time: "5:00 PM",
    endTime: null,
    url: SJ_GIANTS_JAPANESE_HERITAGE_2026_07_26_URL,
  });
});

test("Silicon Valley Pride uses the official parade time, route, and URL", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Silicon Valley Pride Parade",
    startsAt: "2026-08-30T10:30:00-07:00",
    endsAt: null,
    location: "Downtown San Jose",
    sourceUrl: "https://cmt.com/participant-check-in",
  }), {
    time: "11:00 AM",
    endTime: "12:30 PM",
    url: SILICON_VALLEY_PRIDE_2026_URL,
    venue: "Downtown San Jose — Julian Street & Market Street to Plaza Park",
  });
});

test("inbound events prefer an explicit canonical URL", () => {
  assert.equal(normalizeInboundEventPresentation({
    title: "Example",
    startsAt: "2026-07-20T18:30:00-07:00",
    canonicalUrl: "https://venue.example.com/events/example",
    sourceUrl: "https://tracker.example.com/example",
  }).url, "https://venue.example.com/events/example");
});

test("recovered newsletter links stay bound to their occurrence and session", () => {
  const citizenship = (date) => normalizeInboundEventPresentation({
    title: "U.S. Citizenship Test Preparation Class", startsAt: `${date}T11:00:00-07:00`,
  }).url;
  assert.match(citizenship("2026-10-05"), /\/114749\//);
  assert.match(citizenship("2026-10-19"), /\/114751\//);
  assert.equal(citizenship("2026-10-12"), "");
  const wreath = (session) => normalizeInboundEventPresentation({
    title: `Wreathmaking Workshop (${session} session)`, startsAt: "2026-11-15T10:00:00-08:00",
  }).url;
  assert.equal(wreath("10am"), "https://my.montalvoarts.org/3275/3276");
  assert.equal(wreath("3pm"), "https://my.montalvoarts.org/3275/3277");
});

test("Santa Clara doors-open and address copies normalize to one 6 PM event", () => {
  const copies = [
    { startsAt: "2026-09-30T17:00:00-07:00", location: "Mission City Center for Performing Arts, 3250 Monroe St., Santa Clara" },
    { startsAt: "2026-09-30T18:00:00-07:00", location: "Mission City Center for Performing Arts at Wilcox High School, 3250 Monroe St., Santa Clara" },
  ];
  const normalized = copies.map((copy) => normalizeInboundEventPresentation({
    title: "2026 State of the City Address", ...copy,
  }));
  assert.deepEqual(normalized[0], normalized[1]);
  assert.equal(normalized[0].time, "6:00 PM");
  assert.equal(normalized[0].venue, "Mission City Center for Performing Arts");
  assert.equal(normalized[0].url, "https://www.santaclaraca.gov/recreation-community/events/state-of-the-city");
  assert.equal(normalizeInboundEventPresentation({
    title: "2027 State of the City Address", startsAt: "2027-09-30T17:00:00-07:00",
    location: copies[0].location,
  }).time, "5:00 PM");
});

test("Stanford Athletics per-send redirects never reach public cards", () => {
  assert.equal(normalizeInboundEventPresentation({
    title: "Stanford Men's Soccer vs. Santa Clara",
    startsAt: "2026-09-15T19:00:00-07:00",
    sourceUrl:
      "https://app.mail.gostanford.com/e/er?s=1855418&lid=2442&elq=recipient-token",
  }).url, "");
});

test("a multi-week program's last date is not an end time", () => {
  // The real Monte Sereno record: an eight-week academy that starts Sep 17 and
  // graduates Nov 12. The extractor stamped the November date with July's
  // -07:00 offset, which lands at 11 PM Pacific on Nov 11 — past the midnight
  // sentinel — and the card read "9:00 AM – 11:00 PM".
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Community Police Academy",
    startsAt: "2026-09-17T00:00:00-07:00",
    endsAt: "2026-11-12T00:00:00-07:00",
    sourceUrl: "https://www.montesereno.org/civicalerts.aspx?AID=689",
  }), {
    time: null,
    endTime: null,
    url: "https://www.montesereno.org/civicalerts.aspx?AID=689",
  });
});

test("a same-evening end time survives, including one that crosses midnight", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Council study session",
    startsAt: "2026-09-17T18:00:00-07:00",
    endsAt: "2026-09-17T20:30:00-07:00",
    sourceUrl: "https://example.gov/agenda",
  }).endTime, "8:30 PM");
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Late set",
    startsAt: "2026-09-17T22:00:00-07:00",
    endsAt: "2026-09-18T01:00:00-07:00",
    sourceUrl: "https://example.com/show",
  }).endTime, "1:00 AM");
});
