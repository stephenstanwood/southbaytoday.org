import assert from "node:assert/strict";
import test from "node:test";
import { scrapeCupertinoOpenCities, yearAwareDate } from "../playwright-scrapers.mjs";

test("dated calendar labels retain their explicit year beside a time range", () => {
  for (const [label, expected] of [
    ["Saturday, January 31, 2026 | 11:00 AM - 03:00 PM", "2026-01-31"],
    ["Friday, October 17, 2025 | 6:00 PM - 07:00 PM", "2025-10-17"],
    ["Saturday, January 30, 2027 | 11:00 AM - 03:00 PM", "2027-01-30"],
    ["February 29, 2028 | 11:00 AM - 03:00 PM", "2028-02-29"],
  ]) {
    assert.equal(yearAwareDate(label), expected, label);
  }
  assert.equal(yearAwareDate("February 30, 2027 | 11:00 AM - 03:00 PM"), null);
});

test("Cupertino drops past dated slots instead of republishing them next year", async () => {
  const url = "https://www.cupertino.gov/Parks-Recreation/Events/McClellan-Events/Baer-Blacksmith-Shop-Demonstrations";
  const detail = {
    title: "Baer Blacksmith Shop Demonstrations",
    slots: [
      "Saturday, January 31, 2026 | 11:00 AM - 03:00 PM",
      "Saturday, February 28, 2026 | 11:00 AM - 03:00 PM",
      "Saturday, October 31, 2026 | 11:00 AM - 03:00 PM",
      "Saturday, November 28, 2026 | 11:00 AM - 03:00 PM",
      "Saturday, January 30, 2027 | 11:00 AM - 03:00 PM",
    ],
    description: "Blacksmith demonstrations.",
    location: "McClellan Ranch Preserve, 22221 McClellan Road, 95014",
    cost: "Free",
  };
  let evaluations = 0;
  const page = {
    goto: async () => {},
    waitForTimeout: async () => {},
    evaluate: async () => evaluations++ === 0 ? [{ href: url }] : detail,
    locator: () => ({ first: () => ({ count: async () => 0 }) }),
  };
  const events = await scrapeCupertinoOpenCities(page, { today: "2026-10-16" });
  assert.deepEqual(events.map((event) => event.date), ["2026-10-31", "2026-11-28", "2027-01-30"]);
  assert.ok(events.every((event) => event.time === "11:00 AM" && event.endTime === "03:00 PM"));
});

test("Cupertino recognizes mandatory child signup without registering accompanying adults", async () => {
  const url = "https://www.cupertino.gov/Parks-Recreation/Events/Monster-Mash/Monster-Mash-Event";
  for (const [instructions, required] of [
    ["Children must register and be accompanied by an adult. Adults do not need to register.", true],
    ["Children must be registered and accompanied by an adult. Adults do not need to register separately.", true],
    ["Registration is not required. Children can register online.", false],
  ]) {
    let evaluations = 0;
    const page = {
      goto: async () => {}, waitForTimeout: async () => {},
      evaluate: async () => evaluations++ === 0 ? [{ href: url }] : {
        title: "Monster Mash", slots: ["Saturday, October 24, 2026 | 05:00 PM - 08:00 PM"],
        description: "A Halloween party.", location: "Quinlan Community Center, Cupertino",
        cost: `$22 residents; $26 nonresidents. ${instructions}`,
      },
      locator: () => ({ first: () => ({ count: async () => 0 }) }),
    };
    const [event] = await scrapeCupertinoOpenCities(page, { today: "2026-10-24" });
    assert.equal(event.registration, required ? "required" : undefined, instructions);
  }
});

test("Cupertino preserves all resident pricing and the required attendee registration", async () => {
  const url = "https://www.cupertino.gov/Parks-Recreation/Events/Signing-Santa/Signing-Santa-Event";
  const pricing = "Resident Rate: $5 Non-Resident Rate: $6 Pre-registration is required and all attending children and adults must be registered.";
  let evaluations = 0;
  const page = {
    goto: async () => {},
    waitForTimeout: async () => {},
    evaluate: async () => evaluations++ === 0 ? [{ href: url }] : {
      title: "Signing Santa", slots: ["Saturday, December 12, 2026 | 10:00 AM - 12:00 PM"],
      description: "Meet a Santa who understands sign language.",
      location: "Quinlan Community Center, 10185 North Stelling Road, 95014",
      cost: pricing,
    },
    locator: () => ({ first: () => ({ count: async () => 0 }) }),
  };
  const events = (await scrapeCupertinoOpenCities(page, { today: "2026-10-24" }))
    .map(normalizePlaywrightEvent);
  assert.equal(events.length, 1);
  assert.equal(events[0].cost, "low");
  assert.equal(events[0].costNote, pricing, "preserve both prices and their eligibility");
  assert.equal(events[0].registration, "required");
});

import {
  isStudentOnlyEvent,
  isPublicEvent,
  inferCategory,
  isEventTimeBackfillCandidate,
  fetchSvlgEvents,
  fetchSjsuEvents,
  fetchScuEvents,
  fetchMexicanHeritagePlazaEvents,
  fetchMontalvoEvents,
  fetchHistorySanJoseEvents,
  fetchSouthBayMusicalTheatreEvents,
  fetchSantaCruzWarriorsSchedule,
  fetchSharksSchedule,
  fetchEarthquakesSchedule,
  fetchBayFCSchedule,
  fetchSquarespaceEvents,
  squarespaceKidFriendly,
  isCampusOnlyLocalistAudience,
  mapTicketmasterEvent,
} from "../generate-events.mjs";

import {
  extractAddressLocality,
  extractSanJoseJazzDayUrls,
  extractVboSession,
  normalizeMidpenOccurrenceUrl,
  normalizeMountainWineryCard,
  normalizeSapCenterTitle,
  parseIcaExhibitionWindow,
  parseCivicPlusEventCost,
  parseCivicPlusEventDetail,
  parseCivicPlusEventTimes,
  parseHappyHollowSchedules,
  parseCivicPlusCalendarPage,
  parseJazzOnThePlazzSchedule,
  parseLosAltosHistoryEventFacts,
  parseMusicInParkSchedule,
  parseSanJoseJazzLineup,
  parseSvlgCalendar,
  parseSantanaRowOccurrences,
} from "./official-event-sources.mjs";
import { parseHistorySjDateRange } from "./history-sj.mjs";
import { scrapeSapCenter, normalizePlaywrightEvent } from "../playwright-scrapers.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";

test("SAP Center's listed same-day performances survive normalization and deduplication", async () => {
  // Dates and clocks from the venue's Disney on Ice page, October 22, 2026.
  const url = "https://www.sapcenter.com/events/detail/disney-on-ice-4";
  let currentUrl;
  const page = {
    goto: async (value) => { currentUrl = value; },
    waitForTimeout: async () => {},
    evaluate: async () => currentUrl.endsWith("/events/") ? [url] : {
      title: "Disney On Ice", subtitle: "Find Your Hero", venue: "SAP Center",
      dateLine: "Oct 22 - 25, 2026", eventStarts: null, description: "Disney on Ice presents Find Your Hero.",
      schedules: [
        { dateText: "October 23, 2026", time: "7:00 PM" },
        { dateText: "October 24, 2026", time: "11:00 AM" },
        { dateText: "October 24, 2026", time: "3:00 PM" },
        { dateText: "October 24, 2026", time: "7:00 PM" },
        { dateText: "October 25, 2026", time: "1:00 PM" },
        { dateText: "October 25, 2026", time: "5:00 PM" },
      ],
    },
  };
  const events = (await scrapeSapCenter(page, { today: "2026-10-22" })).map(normalizePlaywrightEvent);
  assert.equal(events.length, 6);
  assert.equal(new Set(events.map((event) => event.id)).size, 6);
  for (const event of events) {
    assert.equal(event.occurrenceEvidence.sourceUrl, url);
    assert.equal(event.occurrenceEvidence.date, event.date);
    assert.equal(event.occurrenceEvidence.time, event.time);
  }
  assert.equal(fuzzyDedupEvents(events).kept.length, 6);
});

test("History San Jose date paragraphs preserve ranges and reject impossible dates", () => {
  const card = (date) => `<div class="event-content"><p>${date}</p><h2>Event</h2></div>`;
  assert.deepEqual(parseHistorySjDateRange(card("11/22/2026 &#8211; 12/21/2026")), {
    startDate: "2026-11-22", endDate: "2026-12-21",
  });
  assert.deepEqual(parseHistorySjDateRange(card("2/29/2028")), { startDate: "2028-02-29", endDate: null });
  for (const date of ["24/10/2025", "2/29/2027", "4/31/2027", "12/21/2026 – 11/22/2026", "Date TBD"]) {
    assert.equal(parseHistorySjDateRange(card(date)), null, date);
  }
  assert.equal(parseHistorySjDateRange('<div style="background:url(/2024/10/2025-art.png)"><h2>No published date</h2></div>'), null);
});

test("History San Jose uses the displayed date, never dates inside an image URL", async () => {
  // The real tea card's image path contains /2024/10/2025-Website-Graphics.
  // Scanning the entire block reads 24/10/2025 and Date silently rolls that
  // invalid month into December 10, 2026 instead of the displayed December 5.
  const year = new Date().getFullYear() + 1;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/historysanjose\.org\/programs-events\//);
    return new Response(String(url).includes("/page/") ? "" : `
      <div class="event-box event_all_box">
        <div class="event-inner" style="background-image:url('/2024/10/2025-Website-Graphics-3.png')"></div>
        <div class="event-content">
          <p>12/05/${year}</p>
          <h2>History Park Heritage Holiday Tea</h2>
          <span class="eventlocation">History Park, Empire Fire House</span>
          <span class="eventtime">11:00 am</span><span class="eventtime">3:30 pm</span>
          <a class="backend-button" href="https://fareharbor.com/embeds/book/historysanjose/items/314593/calendar/2024/12/">Book Now</a>
        </div>
      </div>`);
  };
  try {
    const events = await fetchHistorySanJoseEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].date, `${year}-12-05`);
    assert.equal(events[0].time.replace(/\s+/g, ""), "11:00AM");
    assert.equal(events[0].endTime.replace(/\s+/g, ""), "3:30PM");
    assert.equal(events[0].url, "https://historysanjose.org/programs-events/");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("History San Jose preserves multiline downtown locations without inventing a park fallback", async () => {
  const year = new Date().getFullYear() + 1;
  const originalFetch = globalThis.fetch;
  const card = (title, location) => `
    <div class="event-box event_all_box"><div class="event-content">
      <p>10/23/${year}</p><h2>${title}</h2>
      ${location === null ? "" : `<span class="eventlocation">${location}</span>`}
      <span class="eventtime">7:00 pm</span><span class="eventtime">9:00 pm</span>
    </div></div>`;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/historysanjose\.org\/programs-events\//);
    return new Response(String(url).includes("/page/") ? "" : [
      card("Slash and Sip: Adult Pumpkin Carving at San Pedro Square Market",
        "Gonzales/Peralta Adobe | 87 N San Pedro St., San Jos&eacute;\n<br>Pumpkin and carving supplies included in ticket price"),
      card("San José Roots", "Gonzales/Peralta Adobe | 87 N San Pedro St., San José\n<br>Cost: FREE"),
      card("History Park Heritage Holiday Tea", "History Park, Empire Fire House\n<br>635 Phelan Ave., San José\n<br>Cost: $55 General Admission $50 Members"),
      card("An event without a published location", null),
    ].join(""));
  };
  try {
    const events = await fetchHistorySanJoseEvents();
    assert.equal(events.length, 3, "an absent location must not become an invented History Park occurrence");
    for (const event of events.slice(0, 2)) {
      assert.equal(event.venue, "Gonzales/Peralta Adobe");
      assert.equal(event.address, "87 N San Pedro St., San José");
      assert.equal(event.city, "san-jose");
      assert.equal(event.date, `${year}-10-23`);
      assert.equal(event.time.replace(/\s+/g, ""), "7:00PM");
      assert.doesNotMatch(event.address, /Cost:|Pumpkin|Phelan/);
    }
    assert.equal(events[0].cost, "paid");
    assert.equal(events[1].cost, "free");
    assert.equal(events[2].venue, "History Park, Empire Fire House");
    assert.equal(events[2].address, "635 Phelan Ave., San José");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("South Bay Musical Theatre never invents a shared ticket floor for different productions", async () => {
  const date = new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles", month: "long", day: "numeric", year: "numeric",
  });
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const page = String(url);
    requested.push(page);
    assert.match(page, /^https:\/\/southbaymt\.com\/shows\/ticket-sales\//);
    // The current production tables charge $37+, while the importer used to
    // stamp every show $30. Missing or unrelated prices cannot supply a floor.
    const prices = page.includes("come-from-away")
      ? "<h2>TICKET PRICES</h2><table><tr><th>Adult</th><th>Child</th></tr><tr><td>$45-60</td><td>$37</td></tr></table>"
      : page.includes("ouam") ? "<p>Support the theatre with a $30 donation.</p>" : "";
    return new Response(`<title>Musical — South Bay Musical Theatre</title>
      <h2>SHOW DATES &amp; TIMES</h2><p>${date} at 8:00 pm</p>${prices}`);
  };
  try {
    const events = await fetchSouthBayMusicalTheatreEvents();
    assert.equal(requested.length, 7);
    assert.equal(events.length, 7);
    assert.ok(events.every((event) => event.cost === "paid" && event.time === "8:00 PM"));
    assert.ok(events.every((event) => !Object.hasOwn(event, "costNote")),
      "an unparsed ticket table must not become an assumed $30 minimum");
    assert.deepEqual(events.map((event) => event.url), requested);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sports schedules without ticket prices cannot publish estimated admission floors", async () => {
  const start = new Date(Date.now() + 14 * 86400000).toISOString();
  const date = new Date(start).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const cases = [
    [fetchSantaCruzWarriorsSchedule, "https://stats.gleague.nba.com/", {
      leagueSchedule: { gameDates: [{ games: [{
        gameId: "1", gameDateTimeUTC: start,
        homeTeam: { teamCity: "Santa Cruz", teamName: "Warriors" },
        awayTeam: { teamCity: "San Diego", teamName: "Clippers" },
      }] }] },
    }],
    [fetchSharksSchedule, "https://api-web.nhle.com/", {
      games: [{ id: 1, gameType: 2, gameDate: date, startTimeUTC: start,
        homeTeam: { abbrev: "SJS" }, awayTeam: { commonName: { default: "Ducks" } } }],
    }],
    ...[
      [fetchEarthquakesSchedule, "San Jose Earthquakes"],
      [fetchBayFCSchedule, "Bay FC"],
    ].map(([adapter, team]) => [adapter, "https://site.api.espn.com/", {
      events: [{ id: "1", date: start, competitions: [{ competitors: [
        { homeAway: "home", team: { displayName: team } },
        { homeAway: "away", team: { displayName: "Visitors" } },
      ] }] }],
    }]),
  ];
  const originalFetch = globalThis.fetch;
  try {
    for (const [adapter, origin, schedule] of cases) {
      const requested = [];
      globalThis.fetch = async (url) => {
        requested.push(String(url));
        assert.ok(String(url).startsWith(origin));
        return Response.json(schedule);
      };
      const events = await adapter();
      assert.equal(requested.length, 1);
      assert.equal(events.length, 1);
      assert.equal(events[0].date, date);
      assert.equal(events[0].category, "sports");
      assert.equal(events[0].cost, "paid");
      assert.equal(Object.hasOwn(events[0], "costNote"), false, adapter.name);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("book plots, author biographies and minimum ages do not promise family admission", () => {
  for (const [title, copy] of [
    ["Nathaniel Philbrick with John Markoff", "The origin story of America's contradictions."],
    ["Douglas Stuart with Karen Joy Fowler", "A story of childhood, family and faith."],
    ["Kelly McGonigal", "Weaving personal storytelling with psychology."],
    ["Jen Murphy Parker with Irena Smith", "A memoir about raising four children."],
    ["Story Is the Thing", "Fiction authors read from their novels."],
    ["Psychic Readings", "For ages 18 and older."],
    ["Full Immersion Comfort Sound Bath Saturday", "For ages 18 and older."],
    ["Existence Beyond Death", "For ages 15 and older."],
    ["Family Concert", "Adults only. No minors."],
    ["Annual Benefit", "Celebrating 70 years of storytelling, supporting our mission to bring people of all ages and backgrounds together."],
  ]) assert.equal(squarespaceKidFriendly(title, copy), false, title);
  assert.equal(squarespaceKidFriendly("Storytime: Home Is a Door We Carry", "A reading with the author."), true);
  assert.equal(squarespaceKidFriendly("Festival Por La Paz", "Family-friendly event. Kids under 12 enter FREE."), true);
  assert.equal(squarespaceKidFriendly("Museum Halloween", "Bring the whole family."), true);
  assert.equal(squarespaceKidFriendly("Science Workshop", "Designed for children ages 5–10."), true);
  assert.equal(squarespaceKidFriendly("Mercadito", "Pick up fresh food and support your family."), true);
  assert.equal(squarespaceKidFriendly("Collage Capsules", "Best suited for teens and adults."), true);
  assert.equal(squarespaceKidFriendly("Monument Dedication", "Relatives, and friends are warmly invited to attend."), true);
});

test("Squarespace admission uses the full body without treating free perks as free entry", async (t) => {
  const startDate = Date.now() + 14 * 86400000;
  const items = [
    {
      title: "Halloween Night at the Museum",
      excerpt: "Grab your costumes for a night of eerie vibes and spine-tingling fun.",
      body: "<p>A spooky night of <strong>FREE</strong> family fun!</p>",
    },
    {
      title: "Collage Capsules: Build a Mini Bookshelf or Exhibit",
      excerpt: "An afternoon of crafting and imaginative making. Supplies included.",
      body: "<p>Join us for an afternoon of FREE community crafting with the library!</p>",
    },
    {
      title: "Museum Workshop",
      excerpt: "An evening workshop.",
      body: "<p>Tickets $20. Free food and refreshments are included.</p>",
    },
    {
      title: "Evening Workshop",
      excerpt: "An evening workshop with refreshments.",
      body: "<p>Free food will be served.</p>",
    },
    {
      title: "Family Museum Night",
      excerpt: "Bring the family.",
      body: "<p>Adult admission: $20. Free admission for children.</p>",
    },
    {
      title: "Mercadito",
      excerpt: "Walk-up community food distribution.",
      body: "<p>FREE FOOD DISTRIBUTION. Line starts at 11 AM.</p>",
    },
    {
      title: "Community Dedication",
      excerpt: "Relatives and friends are warmly invited.",
      body: "<p>Free with RSVP.</p>",
    },
    {
      title: "Annual Holiday Party",
      excerpt: "Enjoy cookies and a cocktail. Members receive 10% off purchases.",
      body: "<p>RSVP on Eventbrite.</p>",
    },
    {
      title: "Evening Talk",
      excerpt: "Meet the author.",
      body: "<p>Admission fee: $15.</p>",
    },
    {
      title: "Bookstore Celebration",
      excerpt: "Meet our booksellers.",
      body: "<p>Book price: $25. Free refreshments. RSVP on Eventbrite.</p>",
    },
  ].map((item, index) => ({ ...item, startDate, fullUrl: `/events/${index}` }));
  t.mock.method(globalThis, "fetch", async () => Response.json({ upcoming: items }));
  const events = await fetchSquarespaceEvents(
    "https://museum.example/events", "Museum", "palo-alto", "Museum", "Palo Alto, CA",
  );
  assert.deepEqual(events.map((event) => event.cost), ["free", "free", "paid", null, "paid", "free", "free", null, "paid", null]);
  assert.equal(events[0].description, items[0].excerpt);
  assert.equal(events[0].kidFriendly, true);
});

test("library social-service referrals remain community programming despite food assistance", () => {
  assert.equal(inferCategory("Social Workers in the Library Drop-In Hours", "Find shelter, food, showers, mental health services and legal help.", "", "Tully Library"), "community");
  assert.equal(inferCategory("Social Worker in the Library", "Food assistance referrals.", ""), "community");
  assert.equal(inferCategory("Wine Tasting", "Taste local wine.", ""), "food");
});

test("a campus reading-program omnibus cannot publish daily placeholder hours", () => {
  assert.equal(isPublicEvent("Campus Reading Program October Events!", "SJSU Events", "See flyer for locations", ""), false);
  assert.equal(isPublicEvent("Campus Reading Program November Events", "SJSU Events", "", ""), false);
  assert.equal(isPublicEvent("Campus Reading Program: I, Robot discussion", "SJSU Events", "Open to the public", "King Library"), true);
});

test("Montalvo uses ticket-page admission and audience while null and blank calendar prices stay unknown", async () => {
  const date = new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const offers = [{ price: 0 }, { price: null }, { price: "" }, undefined, { price: "0" }];
  const graph = offers.map((offer, index) => ({
    "@type": "Event", name: `Program ${index}`, startDate: `${date}T11:00:00+00:00`,
    url: `https://my.montalvoarts.org/program-${index}`, offers: offer,
  }));
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).endsWith("/events-calendar/")) {
      return new Response(`<script type="application/ld+json">${JSON.stringify({ "@graph": graph })}</script>`);
    }
    const index = Number(String(url).match(/program-(\d+)$/)[1]);
    return new Response(`<h1 id="tn-page-heading">Program ${index}</h1>${index === 0 ? `
      <p class="tn-event-detail__description"><p>Bring the whole family.</p></p>
      <div data-tn-price-amount="20.0000"></div>` : ""}`);
  };
  try {
    const events = await fetchMontalvoEvents();
    assert.equal(events.length, 5);
    assert.equal(requested.length, 6);
    assert.deepEqual(events.map((event) => event.cost), ["paid", null, null, null, "free"]);
    assert.equal(events[0].kidFriendly, true);
    assert.equal(events[1].kidFriendly, false);
    assert.ok(events.every((event) => event.date === date && event.time === "11:00 AM"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed Montalvo detail reads retain verified admission and audience only for the same occurrence", async (t) => {
  const date = new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const url = "https://my.montalvoarts.org/verified-community-showcase";
  const graph = { "@type": "Event", name: "Community Showcase", startDate: `${date}T13:00:00+00:00`, url };
  let unavailable = false;
  t.mock.method(globalThis, "fetch", async (target) => {
    if (String(target).endsWith("/events-calendar/")) {
      return new Response(`<script type="application/ld+json">${JSON.stringify(graph)}</script>`);
    }
    assert.equal(String(target), url);
    return unavailable ? new Response("Unavailable", { status: 403 }) : new Response(`
      <h1 id="tn-page-heading">Community Showcase</h1>
      <p class="tn-event-detail__description">A free, family-friendly afternoon.</p>
      <div data-tn-price-amount="0.0000"></div>`);
  });
  const [verified] = await fetchMontalvoEvents({ previousEvents: [] });
  assert.equal(verified.cost, "free");
  assert.equal(verified.kidFriendly, true);
  verified.registration = "full";
  verified.blurb = "Cached copy must not be carried into source ingestion.";
  unavailable = true;
  const [retained] = await fetchMontalvoEvents({ previousEvents: [verified] });
  assert.equal(retained.cost, "free");
  assert.equal(retained.kidFriendly, true);
  assert.deepEqual(retained.occurrenceEvidence, verified.occurrenceEvidence, "retain the original verification timestamp");
  assert.equal(retained.registration, undefined, "do not copy old availability");
  assert.equal(retained.blurb, undefined);
  assert.equal(retained.date, date);
  assert.equal(retained.time, "1:00 PM");
  for (const prior of [
    { ...verified, id: "another-occurrence" },
    { ...verified, url: `${url}-different` },
    { ...verified, date: "2025-01-01" },
    { ...verified, occurrenceEvidence: undefined },
    { ...verified, occurrenceEvidence: { ...verified.occurrenceEvidence, sourceUrl: `${url}-different` } },
  ]) {
    const [unverified] = await fetchMontalvoEvents({ previousEvents: [prior] });
    assert.equal(unverified.cost, null, "an unverified price cannot default to paid");
    assert.equal(unverified.kidFriendly, false);
    assert.equal(unverified.occurrenceEvidence, undefined);
  }
});

test("Squarespace family admission survives excerpts and truncated descriptions without making paid admission free", async () => {
  const excerpt = "A community celebration of art and culture.";
  const startDate = Date.now() + 7 * 86400000;
  const item = {
    title: "Festival Por La Paz",
    startDate, endDate: startDate + 6 * 3600000,
    fullUrl: "/allevents/festival-por-la-paz",
    excerpt: `<p>${excerpt}</p>`,
    body: "<p>Enjoy over 20 live artists on stage.</p><p>Family-friendly event. Kids under 12 enter FREE. Tickets: $20.</p>",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://example.org/events?format=json");
    return Response.json({ upcoming: [item, {
      ...item, title: "Community Festival", fullUrl: "/allevents/community-festival", excerpt: "",
      body: `<p>${excerpt}</p><p>${"Local artists share their work. ".repeat(12)}</p>${item.body}`,
    }, {
      ...item, title: "Evening Concert", fullUrl: "/allevents/evening-concert", body: "<p>A concert for adults, 21+ only. Tickets: $20.</p>",
    }] });
  };
  try {
    const [family, fromBody, adult] = await fetchSquarespaceEvents(
      "https://example.org/events", "Arts Calendar Fixture", "san-jose", "Arts Center", "1700 Alum Rock Ave, San Jose",
    );
    assert.equal(family.kidFriendly, true);
    assert.equal(family.description, excerpt);
    assert.equal(family.cost, "paid");
    assert.equal(family.url, "https://example.org/allevents/festival-por-la-paz");
    assert.equal(fromBody.kidFriendly, true);
    assert.doesNotMatch(fromBody.description, /family|kids/i);
    assert.equal(fromBody.cost, "paid");
    assert.equal(adult.kidFriendly, false);
    assert.equal(adult.description, excerpt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SVLG uses the calendar occurrence, preserving unknown hours and refusing malformed cards", () => {
  const card = `<article class="mec-event-article mec-toggle-202611-996">
    <h3 class="mec-event-title"><a href="https://svlg.org/events/example/">Public talk</a></h3>
    <div class="mec-event-description">A public conversation.</div>
    <span class="mec-start-date-label">18 Nov</span>
    <span class="mec-start-time">11:00 am</span><span class="mec-end-time">12:00 pm</span>
    <div class="mec-venue-details"><span>Conference Room</span><address>2480 N First St, San Jose</address></div>
  </article>`;
  assert.deepEqual(parseSvlgCalendar(card), [{title: "Public talk", url: "https://svlg.org/events/example/",
    date: "2026-11-18", time: "11:00 AM", endTime: "12:00 PM", venue: "Conference Room",
    address: "2480 N First St, San Jose", description: "A public conversation."}]);
  assert.equal(parseSvlgCalendar(card.replace('11:00 am', ''))[0].time, null);
  assert.throws(() => parseSvlgCalendar(card.replace('18 Nov', '31 Nov')), /valid/);
  assert.throws(() => parseSvlgCalendar(card.replace('18 Nov', '18 Dec')), /valid/);
  assert.throws(() => parseSvlgCalendar('<html>upstream error</html>'), /no recognizable/);
});

test("SVLG preserves an address in its venue span rather than a speaker's city", async () => {
  const html = `<article class="mec-event-article mec-toggle-202612-57124">
    <h3 class="mec-event-title"><a href="https://www.eventbrite.com/e/coffee-conversation-larry-klein-tickets-1998017392807">Coffee &amp; Conversation: Larry Klein</a></h3>
    <div class="mec-event-description">A conversation with Sunnyvale Mayor Larry Klein.</div>
    <span class="mec-start-date-label">10 Dec</span>
    <span class="mec-start-time">10:00 am</span><span class="mec-end-time">11:00 am</span>
    <div class="mec-venue-details"><span>2480 N First St San Jose, CA</span></div>
  </article>`;
  const [event] = parseSvlgCalendar(html);
  assert.equal(event.venue, "");
  assert.equal(event.address, "2480 N First St San Jose, CA");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(html, { status: 200 });
  try {
    const generated = await fetchSvlgEvents({ today: "2026-10-14" });
    assert.equal(generated[0].city, "san-jose");
    assert.equal(generated[0].address, "2480 N First St San Jose, CA");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ICA's published exhibition run ignores the post date and reception clocks", async () => {
  const text = "October 14, 2026 by SJICA. On view: October 16 — November 14, 2026. Opening during the Artists’ Mixer on Friday, October 16, 5-8pm.";
  const future = parseIcaExhibitionWindow(text, "2026-10-14");
  assert.deepEqual(future, {
    date: "2026-10-16", startDate: "2026-10-16", endDate: "2026-11-14",
    ongoing: true, time: null, endTime: null,
  });
  const { normalizePlaywrightEvent } = await import("../playwright-scrapers.mjs");
  const event = normalizePlaywrightEvent({
    title: "We Are California Artists: Wanxin Zhang and Diane Ding", source: "ICA San José",
    venue: "ICA San José", city: "san-jose", url: "https://www.icasanjose.org/current-exhibitions/wearecaliforniaartists/",
    ...future,
  });
  assert.equal(event.ongoing, true);
  assert.equal(event.startDate, "2026-10-16");
  assert.equal(event.endDate, "2026-11-14");
  assert.equal(event.time, null);
  assert.equal(isEventTimeBackfillCandidate(event), false);
  assert.equal(parseIcaExhibitionWindow(text, "2026-10-20").date, "2026-10-20");
  assert.equal(parseIcaExhibitionWindow(text, "2026-11-15"), null);
  assert.equal(parseIcaExhibitionWindow("October 14, 2026. Artists’ Mixer Friday, 5-8pm.", "2026-10-14"), null);
  assert.equal(parseIcaExhibitionWindow("On view: October 16 — November 31, 2026", "2026-10-14"), null);
  assert.equal(parseIcaExhibitionWindow("On view: December 16 — January 14, 2027", "2026-12-01").startDate, "2026-12-16");
});

test("SAP theme nights retain the hockey matchup and sports category", () => {
  const title = normalizeSapCenterTitle({ title: "Military Appreciation", subtitle: "Sharks vs Penguins" });
  assert.equal(title, "Sharks vs Penguins — Military Appreciation");
  assert.equal(inferCategory(title, "", "", "SAP Center"), "sports");
  assert.equal(normalizeSapCenterTitle({ title: "Sharks vs Penguins", subtitle: "Sharks vs Penguins" }), "Sharks vs Penguins");
  assert.equal(normalizeSapCenterTitle({ title: "Concert", subtitle: "With special guests" }), "Concert");
});

test("invitation-only coffee chats do not become public calendar destinations", () => {
  assert.equal(isPublicEvent("Service Now (Invite Only) Coffee Chat", "Santa Clara University", "", "Career Center"), false);
  assert.equal(isPublicEvent("Public Coffee Chat", "Santa Clara University", "Open to the public", "Community Center"), true);
});

test("Santana Row keeps each festival day's published hours", () => {
  // The October 2026 card header starts Saturday, but the daily schedule
  // includes Friday's preview. The first clock must not migrate to Saturday.
  const occurrences = parseSantanaRowOccurrences(
    "October 3 - October 4, 2026",
    "Friday, October 2nd from 3 pm – 9 pm" +
      "Saturday, October 3rd from 10 am – 9 pm" +
      "Sunday, October 4th from 10 am – 5 pm",
  );
  assert.deepEqual(occurrences, [
    { date: "2026-10-02", time: "3:00 PM", endTime: "9:00 PM" },
    { date: "2026-10-03", time: "10:00 AM", endTime: "9:00 PM" },
    { date: "2026-10-04", time: "10:00 AM", endTime: "5:00 PM" },
  ]);
});

test("Santana Row preserves different carving demonstration hours and noon", () => {
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 24 - October 25, 2026",
    "Saturday, October 24 | 10:00 AM – 1:00 PMSunday, October 25 | 12:00 PM – 2:00 PM",
  ), [
    { date: "2026-10-24", time: "10:00 AM", endTime: "1:00 PM" },
    { date: "2026-10-25", time: "12:00 PM", endTime: "2:00 PM" },
  ]);
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 27, 2026", "Tuesday, October 27th from 10 AM – noon!",
  ), [{ date: "2026-10-27", time: "10:00 AM", endTime: "12:00 PM" }]);
});

test("Santana Row keeps single-date markets and rejects unsupported ranges", () => {
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 10, 2026", "Every second Saturday from 11am-6pm",
  ), [{ date: "2026-10-10", time: "11:00 AM", endTime: "6:00 PM" }]);
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 22 - October 25, 2026", "See the film schedule for showtimes.",
  ), []);
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 3 - October 4, 2026", "Doors at 3 PM. Various hours each day.",
  ), []);
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 3, 2027", "Saturday, October 3 from 10 AM – 9 PM",
  ), []);
});

test("Santana Row keeps both clocks when a range supplies one meridiem", () => {
  assert.deepEqual(parseSantanaRowOccurrences(
    "November 27, 2026",
    "Beginning November 27, join us Tuesday through Saturday from 5:00–9:00 pm. Closed Sundays and Mondays.",
  ), [{ date: "2026-11-27", time: "5:00 PM", endTime: "9:00 PM" }]);
  assert.deepEqual(parseSantanaRowOccurrences(
    "November 27 - November 28, 2026",
    "Friday, November 27 from 5–9 pm. Saturday, November 28 from 12 to 2 pm.",
  ), [
    { date: "2026-11-27", time: "5:00 PM", endTime: "9:00 PM" },
    { date: "2026-11-28", time: "12:00 PM", endTime: "2:00 PM" },
  ]);
  for (const hours of ["11–1 pm", "25:00–9:00 pm", "5:70–9:00 pm"]) {
    assert.deepEqual(parseSantanaRowOccurrences("November 27, 2026", hours), [], hours);
  }
});

test("extracts the public locality from Squarespace address fields", () => {
  assert.equal(extractAddressLocality("Menlo Park, CA, 94025"), "Menlo Park");
  assert.equal(extractAddressLocality("1010 El Camino Real, Menlo Park, CA 94025"), "Menlo Park");
});

test("keeps exact Midpen occurrence URLs and rejects the generic calendar", () => {
  assert.equal(
    normalizeMidpenOccurrenceUrl("/events/guided-activities/ramble-rancho-15?utm_source=test"),
    "https://www.openspace.org/events/guided-activities/ramble-rancho-15",
  );
  assert.equal(
    normalizeMidpenOccurrenceUrl("https://www.openspace.org/events/volunteer-projects/habitat-restoration-thistle-removal-23"),
    "https://www.openspace.org/events/volunteer-projects/habitat-restoration-thistle-removal-23",
  );
  assert.equal(normalizeMidpenOccurrenceUrl("https://www.openspace.org/where-to-go/events-activities"), null);
  assert.equal(normalizeMidpenOccurrenceUrl("https://example.com/events/guided-activities/ramble-rancho-15"), null);
});

test("keeps Mountain Winery occurrence art tied to its exact event page", () => {
  assert.deepEqual(normalizeMountainWineryCard({
    title: "Gladys Knight",
    supporting: "Patrick McDermott",
    date: "Wed, Jul 22, 2026",
    time: "7:30 PM",
    link: "/events/detail?event_id=1350103",
    image: "https://images.discovery-prod.axs.com/2026/03/uploadedimage_69cb07b32dcb7.jpg",
    imageAlt: "Gladys Knight",
  }), {
    title: "Gladys Knight with Patrick McDermott",
    date: "Wed, Jul 22, 2026",
    time: "7:30 PM",
    link: "https://www.mountainwinery.com/events/detail?event_id=1350103",
    image: "https://images.discovery-prod.axs.com/2026/03/uploadedimage_69cb07b32dcb7.jpg",
    imageAlt: "Gladys Knight",
    imageSourceUrl: "https://www.mountainwinery.com/events/detail?event_id=1350103",
  });
  assert.equal(normalizeMountainWineryCard({
    title: "Gladys Knight",
    date: "Wed, Jul 22, 2026",
    link: "https://www.mountainwinery.com/concert-series",
  }), null);
});

test("does not double the connector when the supporting act carries its own", () => {
  const card = (supporting) => normalizeMountainWineryCard({
    title: "Switchfoot",
    supporting,
    date: "Wed, Jul 22, 2026",
    link: "/events/detail?event_id=1383144",
  }).title;
  assert.equal(card("with Anberlin"), "Switchfoot with Anberlin");
  assert.equal(card("w/ Anberlin"), "Switchfoot with Anberlin");
  assert.equal(card("Anberlin"), "Switchfoot with Anberlin");
  // "special guest" reads correctly after the connector and carries real
  // billing info, so only the connector itself is stripped.
  assert.equal(
    card("with special guest Anberlin"),
    "Switchfoot with special guest Anberlin",
  );
  // A supporting line that is only a connector adds nothing — no dangling "with".
  assert.equal(card("with"), "Switchfoot");
});

test("extracts the current VBO event.asp session redirect", () => {
  assert.equal(
    extractVboSession('window.location.href = "https://plugin.vbotickets.com/v5.0/event.asp?s=dad2e075-98fa-4855-951d-f2e41fe6f1d6";'),
    "dad2e075-98fa-4855-951d-f2e41fe6f1d6",
  );
});

test("parses the official Music in the Park schedule", () => {
  const html = `
    <strong>2026 Concert Schedule:</strong>
    <p>July 19 - The Houserockers &nbsp;</p>
    <p>August 23 - Harry and the Hitmen</p>
  `;
  assert.deepEqual(parseMusicInParkSchedule(html), [
    { date: "2026-07-19", performer: "The Houserockers" },
    { date: "2026-08-23", performer: "Harry and the Hitmen" },
  ]);
});

test("parses the official Jazz on the Plazz schedule", () => {
  const html = `
    <p>Summer Concerts 2026</p>
    <h3>July 22nd</h3><h3>Tony Lindsay &amp; The Soul Soldiers</h3>
    <p>The longtime Santana vocalist returns.</p>
    <h3>Aug 26th</h3><h3>Gunhild Carling<br />Season Finale</h3>
    <p>Classic jazz and swing.</p>
  `;
  assert.deepEqual(parseJazzOnThePlazzSchedule(html), [
    {
      date: "2026-07-22",
      performer: "Tony Lindsay & The Soul Soldiers",
      description: "The longtime Santana vocalist returns.",
    },
    {
      date: "2026-08-26",
      performer: "Gunhild Carling",
      description: "Classic jazz and swing.",
    },
  ]);
});

test("parses one artist occurrence from the official San Jose Jazz lineup", () => {
  const html = `
    <title>San Jose Jazz Summer Fest 2026</title>
    <div class="artist col-sm-12 col-md-6 col-lg-4 ">
      <div class="artist-overlay content-lineup">
        <span class="month-date">Aug 7</span>
        <span class="time">5:45pm</span>
        <span class="stage-name 2">Jay Paul Company Main Stage</span>
        <div class="quicklook-text"><p>French Caribbean singer and bassist.</p></div>
      </div>
      <img src="https://example.com/adi.jpg">
      <h3><a href="https://summerfest.sanjosejazz.org/artists/adi-oasis">Adi Oasis</a></h3>
    </div>
  `;
  assert.deepEqual(parseSanJoseJazzLineup(html), [
    {
      title: "Adi Oasis",
      date: "2026-08-07",
      time: "5:45 PM",
      stage: "Jay Paul Company Main Stage",
      url: "https://summerfest.sanjosejazz.org/artists/adi-oasis",
      image: "https://example.com/adi.jpg",
      description: "French Caribbean singer and bassist.",
    },
  ]);
});

test("discovers current San Jose Jazz day pages without hardcoded year slugs", () => {
  const html = `
    <a href="/filters/chronological/friday-aug-7">Friday</a>
    <a href="https://summerfest.sanjosejazz.org/filters/chronological/saturday-aug-8?view=all">Saturday</a>
    <a href="/filters/chronological/friday-aug-7">Friday mobile duplicate</a>
    <a href="https://example.com/filters/chronological/sunday-aug-9">Wrong host</a>
  `;
  assert.deepEqual(extractSanJoseJazzDayUrls(html), [
    "https://summerfest.sanjosejazz.org/filters/chronological/friday-aug-7",
    "https://summerfest.sanjosejazz.org/filters/chronological/saturday-aug-8",
  ]);
});

test("parses CivicPlus schema events that its incomplete RSS feed omits", () => {
  const html = `
    <li><h3><a id="eventTitle_2023" href="/Calendar.aspx?EID=2023"><span>Downtown Park Outreach - Farmers' Markets</span></a></h3>
      <div class="subHeader"><div class="date">July&nbsp;23,&nbsp;2026,&nbsp;4:00 PM&thinsp;-&thinsp;7:00 PM</div></div>
      <div class="hidden" itemscope itemtype="http://schema.org/Event"><span itemprop="name">Downtown Park Outreach - Farmers' Markets</span><span itemprop="startDate" class="hidden">2026-07-23T16:00:00</span><p itemprop="description">Tell us what you think.</p>
      <span itemprop="location" itemscope itemtype="http://schema.org/Place"><span itemprop="name"><p>State St &amp; Third St.</p></span><span class="hidden" itemprop="address" itemscope itemtype="http://schema.org/PostalAddress"><span itemprop="addressLocality">Los Altos</span><span itemprop="addressRegion">CA</span><span itemprop="postalCode">94022</span></span></span></div>
    </li>`;
  assert.deepEqual(parseCivicPlusCalendarPage(html), [{
    id: "2023",
    title: "Downtown Park Outreach - Farmers' Markets",
    startsAt: "2026-07-23T16:00:00",
    time: "4:00 PM",
    endTime: "7:00 PM",
    description: "Tell us what you think.",
    venue: "State St & Third St.",
    address: "Los Altos, CA 94022",
    href: "/Calendar.aspx?EID=2023",
  }]);
});

test("splits CivicPlus start and end clocks without inventing all-day times", () => {
  assert.deepEqual(parseCivicPlusEventTimes("07:30 PM - 09:30 PM"), {
    time: "7:30 PM",
    endTime: "9:30 PM",
  });
  assert.deepEqual(parseCivicPlusEventTimes("12:00 AM - 11:59 PM"), {
    time: null,
    endTime: null,
  });
});

test("reads venue, address, time, and ticket floor from a CivicPlus detail page", () => {
  const detail = parseCivicPlusEventDetail(`
    <span itemprop="startDate">2026-09-04T19:30:00</span>
    <div class="specificDetailHeader">Time:</div>
    <div class="specificDetailItem">7:30 PM&thinsp;-&thinsp;9:30 PM</div>
    <div id="ctl00_MainContent_ModuleContent_ctl00_ctl04_location_name">
      <div itemprop="name">The Heritage Theatre</div>
    </div>
    <span itemprop="streetAddress">1 W Campbell Ave</span>
    <span itemprop="addressLocality">Campbell</span>
    <span itemprop="addressRegion">CA</span>
    <span itemprop="postalCode">95008</span>
    <div itemprop="price">$30.50/$43.50/$55.50 + $4 FF and $5 processing fee</div>
  `);

  assert.deepEqual(detail, {
    startsAt: "2026-09-04T19:30:00",
    time: "7:30 PM",
    endTime: "9:30 PM",
    venue: "The Heritage Theatre",
    address: "1 W Campbell Ave, Campbell, CA 95008",
    costText: "$30.50/$43.50/$55.50 + $4 FF and $5 processing fee",
    cost: "paid",
    costNote: "From $30.50",
  });
});

test("does not let a limited free offer erase a paid CivicPlus ticket floor", () => {
  assert.deepEqual(parseCivicPlusEventCost("Free"), { cost: "free", costNote: null });
  assert.deepEqual(parseCivicPlusEventCost("$20; children free"), {
    cost: "low",
    costNote: "From $20",
  });
});

test("reads Los Altos History Museum prices and blocks closed sessions", () => {
  assert.deepEqual(
    parseLosAltosHistoryEventFacts("Cost: $15 per person\\; $10 for Museum members."),
    { unavailable: false, cost: "low", costNote: "$15; $10 members" },
  );
  assert.deepEqual(
    parseLosAltosHistoryEventFacts("Cost: $15 per person\\; $10 for Museum members. This session is closed."),
    { unavailable: true, cost: null, costNote: null },
  );
});

test("museum attendance notices survive biography copy without closing the Zoom option", () => {
  const facts = parseLosAltosHistoryEventFacts(
    `${"Speaker biography. ".repeat(25)}The in-person event is full. To attend via Zoom register below.`,
  );
  assert.equal(facts.unavailable, false);
  assert.equal(facts.registration, "full");
  assert.match(facts.attendanceNote, /In-person attendance is full/);
  assert.match(facts.attendanceNote, /Register.*via Zoom/);
  assert.equal(facts.virtual, undefined);
  assert.equal(facts.cost, null);
  assert.equal(parseLosAltosHistoryEventFacts("A full program of lectures.").registration, undefined);
  assert.equal(
    parseLosAltosHistoryEventFacts("The in-person attendance is full. Cost: $15 per person; $10 for Museum members.").registration,
    "full",
  );
});

test("derives Happy Hollow's published recurring and dated events", () => {
  const entries = parseHappyHollowSchedules({
    seniorHtml: "<p>The 2026 season is here! Join us the fourth Thursday of the month from May through October from 9-10 a.m.</p>",
    hoorayHtml: "<p>Hooray for you! The Hooray for Happy Hollow benefit event is Saturday, Sept. 12, 2026.</p>",
  });
  assert.equal(entries.length, 7);
  assert.deepEqual(entries.slice(0, 2).map((entry) => entry.date), ["2026-05-28", "2026-06-25"]);
  assert.equal(entries.at(-1).date, "2026-09-12");
});

function ticketmasterEvent(overrides = {}) {
  return {
    id: "example",
    name: "Example Show",
    dates: {
      start: { localDate: "2026-08-21", localTime: "19:30:00" },
      status: { code: "onsale" },
    },
    priceRanges: [{ type: "standard", currency: "USD", min: 0, max: 0 }],
    url: "https://www.ticketmaster.com/example/event/example",
    classifications: [{ segment: { name: "Arts & Theatre" }, genre: { name: "Comedy" } }],
    _embedded: {
      venues: [{
        name: "Example Venue",
        city: { name: "San Jose" },
        address: { line1: "1 Example St" },
      }],
    },
    ...overrides,
  };
}

test("keeps credible Ticketmaster zero-price events free", () => {
  assert.equal(mapTicketmasterEvent(ticketmasterEvent()).cost, "free");
});

test("Ticketmaster ice shows are performances despite Tech CU Arena's sponsor name", () => {
  const event = mapTicketmasterEvent(ticketmasterEvent({
    name: "Holly Jolly Holiday Ice Premier (featuring Alyssa Liu)",
    classifications: [{ segment: { name: "Miscellaneous" }, genre: { name: "Ice Shows" } }],
    _embedded: { venues: [{ name: "Tech CU Arena", city: { name: "San Jose" } }] },
  }));
  assert.equal(event.category, "arts");
});

test("TicketWeb's explicit sold-out title reaches the existing attendance gate", () => {
  for (const name of [
    "SOLD OUT Tauren Wells: Air1 Worship Now Tour - San Jose, CA",
    "[Sold Out] Example Show",
    "(SOLD-OUT) Example Show",
  ]) {
    const mapped = mapTicketmasterEvent(ticketmasterEvent({ name }));
    assert.equal(mapped.registration, "full");
    assert.match(mapped.attendanceNote, /Tickets are sold out/);
    assert.equal(mapped.time, "7:30 PM");
    assert.equal(mapped.venue, "Example Venue");
  }
});

test("Ticketmaster offsale status and past sold-out biography do not imply a full event", () => {
  const mapped = mapTicketmasterEvent(ticketmasterEvent({
    name: "Example Show",
    info: "Following a sold-out tour last year, the band returns.",
    dates: { start: { localDate: "2026-11-12", localTime: "19:00:00" }, status: { code: "offsale" } },
  }));
  assert.equal(mapped.registration, undefined);
  assert.equal(mapped.attendanceNote, undefined);
  for (const code of ["cancelled", "postponed"]) {
    assert.equal(mapTicketmasterEvent(ticketmasterEvent({
      name: "SOLD OUT Example Show",
      dates: { start: { localDate: "2026-11-12", localTime: "19:00:00" }, status: { code } },
    })), null);
  }
});

test("does not call paid TicketWeb Improv shows free", () => {
  const mapped = mapTicketmasterEvent(ticketmasterEvent({
    url: "https://www.ticketweb.com/event/desi-banks-san-jose-improv-tickets/14880633",
    _embedded: {
      venues: [{
        name: "San Jose Improv",
        city: { name: "San Jose" },
        address: { line1: "62 S Second St" },
      }],
    },
  }));

  assert.equal(mapped.cost, "paid");
  assert.equal(mapped.costNote, undefined);
});

test("maps Ticketmaster local times with the Pacific offset in effect that day", () => {
  const mapped = mapTicketmasterEvent(ticketmasterEvent({
    dates: {
      start: { localDate: "2026-11-02", localTime: "18:00:00" },
      status: { code: "onsale" },
    },
  }));
  assert.equal(mapped.displayDate, "Mon, Nov 2");
  assert.equal(mapped.time, "6:00 PM");
});

test("restores Bay FC's full San Diego Wave FC opponent name", () => {
  const mapped = mapTicketmasterEvent(ticketmasterEvent({
    name: "Bay FC vs. San Diego FC",
    dates: {
      start: { localDate: "2026-11-01", localTime: "14:00:00" },
      status: { code: "onsale" },
    },
  }));
  assert.equal(mapped.title, "Bay FC vs. San Diego Wave FC");
  assert.equal(mapped.time, "2:00 PM");
});

test("drops Stanford events restricted to known campus audiences, preserving public access", () => {
  assert.equal(isCampusOnlyLocalistAudience({
    event_audience: [{ name: "Students" }],
  }), true);
  // Actual DAAAS Alumni Homecoming audience tags, October 15, 2026.
  const campus = ["Students", "Students - Undergraduates", "Students - Graduates",
    "Postdocs", "Faculty", "Staff", "Staff - Academic", "Staff - Managers", "Alumni"];
  assert.equal(isCampusOnlyLocalistAudience({
    event_audience: campus.map((name) => ({ name })),
  }), true);
  assert.equal(isCampusOnlyLocalistAudience({
    event_audience: [{ name: "Students" }, { name: "General Public" }],
  }), false);
  assert.equal(isCampusOnlyLocalistAudience({
    event_audience: [...campus, "General Public"],
  }), false);
  assert.equal(isCampusOnlyLocalistAudience({ event_audience: ["Affiliates"] }), true);
  assert.equal(isCampusOnlyLocalistAudience({ event_audience: ["Affiliates", "Everyone"] }), false);
  assert.equal(isCampusOnlyLocalistAudience({ event_audience: ["Community Members"] }), false);
  assert.equal(isCampusOnlyLocalistAudience({}), false);
  assert.equal(isCampusOnlyLocalistAudience({
    event_target_audience: ["Students", "Current Students", "SJSU Employees", "Undergraduate Students", "Graduate Students"],
  }), true);
  assert.equal(isCampusOnlyLocalistAudience({
    event_target_audience: ["Students", "General Public"],
  }), false);
  assert.equal(isCampusOnlyLocalistAudience({
    event_audience: ["General Public"], event_target_audience: ["Students"],
  }), false);
});

test("SJSU applies source audience filters even without an attendance-mode field", async () => {
  const origin = "https://events.sjsu.edu";
  const rows = [
    ["FSL PNME #2", "private", { event_target_audience: [{ name: "Students" }] }],
    ["Public art workshop", "public", { event_target_audience: [{ name: "Students" }, { name: "General Public" }] }],
    ["Unspecified audience", "unspecified", {}],
  ];
  const xml = `<rss><channel>${rows.map(([title, slug]) => `<item><title>${title}</title><link>${origin}/event/${slug}</link><description>Program details.</description><pubDate>2026-10-15T12:00:00-07:00</pubDate></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === `${origin}/calendar.xml`) return new Response(xml);
    assert.match(String(url), /^https:\/\/events\.sjsu\.edu\/api\/2\/events\?/);
    return Response.json({ page: { total: 1 }, events: rows.map(([, slug, filters]) => ({ event: {
      localist_url: `${origin}/event/${slug}`, filters,
      ...(slug === "public" ? { experience: "virtual" } : {}),
    } })) });
  };
  try {
    const events = await fetchSjsuEvents();
    assert.deepEqual(events.map((event) => event.title), ["Public art workshop", "Unspecified audience"]);
    assert.equal(events[0].virtual, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SJSU keeps source addresses and rejects off-site conferences without extra requests", async () => {
  const origin = "https://events.sjsu.edu";
  const rows = [
    ["Visiting conference", "remote", "1 International Dr, Savannah, GA 31421", "inperson"],
    ["Campus lecture", "local", "150 E San Fernando St, San Jose, CA 95112", "inperson"],
    ["Remote webinar", "virtual", "1 International Dr, Savannah, GA 31421", "virtual"],
    ["Public workshop", "no-address", null, "inperson"],
  ];
  const xml = `<rss><channel>${rows.map(([title, slug]) => `<item><title>${title}</title><link>${origin}/event/${slug}</link><description>Public program.</description><pubDate>2026-10-25T12:00:00-07:00</pubDate></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url) === `${origin}/calendar.xml`) return new Response(xml);
    assert.match(String(url), /^https:\/\/events\.sjsu\.edu\/api\/2\/events\?/);
    return Response.json({ page: { total: 1 }, events: rows.map(([, slug, address, experience]) => ({ event: {
      localist_url: `${origin}/event/${slug}`, address, experience,
    } })) });
  };
  try {
    const events = await fetchSjsuEvents();
    assert.deepEqual(events.map((event) => event.title), ["Campus lecture", "Remote webinar", "Public workshop"]);
    assert.equal(events[0].address, rows[1][2]);
    assert.equal(events[1].virtual, true);
    assert.equal(events[2].address, "");
    assert.equal(requested.length, 2, "reuse existing RSS and metadata reads");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SJSU reads Localist admission instead of assuming campus events are free", async () => {
  const origin = "https://events.sjsu.edu";
  const rows = [
    ["Sanctuary City", "sanctuary-city", { free: false, ticket_cost: "$16 - $27" }, "paid"],
    ["Public recital", "recital", { free: true, ticket_cost: "Free" }, "free"],
    ["Free RSVP lecture", "lecture", { free: false, ticket_cost: "Free RSVP", ticket_url: "https://example.org/rsvp" }, "free"],
    ["Unpriced workshop", "workshop", { free: false, ticket_cost: "", ticket_url: "https://example.org/register" }, null],
    ["Softball vs. Visitors", "softball", { free: false, ticket_cost: null }, null],
    ["Missing metadata", "missing", null, null],
  ];
  const xml = `<rss><channel>${rows.map(([title, slug]) => `<item><title>${title}</title><link>${origin}/event/${slug}</link><description>Public program.</description><pubDate>2026-10-22T19:30:00-07:00</pubDate></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url) === `${origin}/calendar.xml`) return new Response(xml);
    assert.match(String(url), /^https:\/\/events\.sjsu\.edu\/api\/2\/events\?/);
    return Response.json({ page: { total: 1 }, events: rows.filter(([, , admission]) => admission).map(([title, slug, admission]) => ({ event: {
      title, localist_url: `${origin}/event/${slug}`, ...admission,
    } })) });
  };
  try {
    const events = await fetchSjsuEvents();
    assert.deepEqual(events.map((event) => [event.title, event.cost]), rows.map(([title, , , cost]) => [title, cost]));
    assert.equal(requested.length, 2, "reuse the existing metadata fetch, with no per-event request");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SCU aliases retain canonical department filtering and online attendance", async () => {
  const origin = "https://events.scu.edu";
  const rows = [
    ["Career appointment", "510473", "accounting", null],
    ["Writing retreat", "507131", "faculty-development", null],
    ["Public faculty recital", "469690", "arts-and-sciences", null],
    ["Public online talk", "517594", "arts-and-sciences", "Online only"],
    ["LSB CASH", "511538", "live", null],
  ];
  const xml = `<rss><channel>${rows.map(([title, id]) => `<item><title>${title}</title><link>${origin}/live/events/${id}-program</link><description>Program details.</description><pubDate>2026-10-15T12:00:00-07:00</pubDate>${id === "511538" ? "<livewhale:categories>Career &amp; Employer Events,Leavey School of Business</livewhale:categories>" : ""}</item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === `${origin}/live/rss/events`) return new Response(xml);
    assert.equal(String(url), `${origin}/live/json/events?page=1`);
    return Response.json({ meta: { total_pages: 1 }, data: rows.map(([, id, department, online_type]) => ({
      id: `${id}9`, parent: id, url: `${origin}/${department}/event/${id}-program`, online_type,
    })) });
  };
  try {
    const events = await fetchScuEvents();
    assert.deepEqual(events.map((event) => event.title), ["Public faculty recital", "Public online talk"]);
    assert.equal(events[1].virtual, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SCU online events ignore physical RSS venues and geocodes", async () => {
  const origin = "https://events.scu.edu";
  const rows = [
    ["UC Santa Cruz Grad Fair", "517795", "University of California Santa Cruz", "37.0000 -122.0500", "Online only"],
    ["Public faculty recital", "recital", "Music Recital Hall", "37.3541 -121.9552", null],
  ];
  const xml = `<rss><channel>${rows.map(([title, id, venue, point]) => `<item><title>${title}</title><link>${origin}/arts-and-sciences/event/${id}-program</link><description>Public program.</description><pubDate>2026-10-28T11:00:00-07:00</pubDate><georss:featurename>${venue}</georss:featurename><georss:point>${point}</georss:point></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url) === `${origin}/live/rss/events`) return new Response(xml);
    assert.equal(String(url), `${origin}/live/json/events?page=1`);
    return Response.json({ meta: { total_pages: 1 }, data: rows.map(([, id, , , online_type]) => ({ id, online_type })) });
  };
  try {
    const events = await fetchScuEvents();
    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map(({ venue, address, city, virtual }) => ({ venue, address, city, virtual })),
      [
        { venue: "Online", address: "", city: "santa-clara", virtual: true },
        { venue: "Music Recital Hall", address: "", city: "santa-clara", virtual: undefined },
      ],
    );
    assert.equal(requested.length, 2, "reuse the source attendance field without per-event requests");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SCU's public Music@Noon concert stays music despite its class boilerplate", async () => {
  // https://events.scu.edu/arts-and-sciences/event/510144-musicnoon-all-that-jazz
  const origin = "https://events.scu.edu";
  const description = "Carl Schultz and guests perform favorite jazz standards. Wildly diverse and enriching concerts are presented as a part of the Music@Noon class, which is also open to the public.";
  const rows = [
    ["Music@Noon – All That Jazz", "510144", "music"],
    ["Music@Noon Lecture: Jazz History", "test-lecture", "education"],
  ];
  const xml = `<rss><channel>${rows.map(([title, id]) => `<item><title>${title}</title><link>${origin}/arts-and-sciences/event/${id}-program</link><description>${description}</description><pubDate>2026-10-21T12:00:00-07:00</pubDate><georss:featurename>Music Recital Hall</georss:featurename></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url) === `${origin}/live/rss/events`) return new Response(xml);
    assert.equal(String(url), `${origin}/live/json/events?page=1`);
    return Response.json({ meta: { total_pages: 1 }, data: [] });
  };
  try {
    const events = await fetchScuEvents();
    assert.deepEqual(events.map((event) => [event.title, event.category]), rows.map(([title, , category]) => [title, category]));
    assert.equal(events[0].time, "12:00 PM");
    assert.equal(events[0].venue, "Music Recital Hall");
    assert.equal(requested.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SCU fireside chats remain educational despite a music venue or baby in the title", async () => {
  const origin = "https://events.scu.edu";
  const rows = [
    ["The Black Womb, Ontological Absence, and Social Death: A Fireside Chat with Patrice D. Douglass", "A public conversation on Black reproduction, social life, and the enduring legacies of anti-blackness.", "Music Recital Hall"],
    ["Scam, Baby, Scam: How Fraud Can Impact All of Us at Any Age", "Protect yourself from scams and cybercrime. In this fireside chat, hear a story of a life altered by fraud.", ""],
  ];
  const xml = `<rss><channel>${rows.map(([title, description, venue], i) => `<item><title>${title}</title><link>${origin}/arts-and-sciences/event/${i + 1}-chat</link><description>${description}</description><pubDate>Tue, 27 Oct 2026 18:00:00 -0700</pubDate><georss:featurename>${venue}</georss:featurename></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === `${origin}/live/rss/events`) return new Response(xml);
    assert.equal(String(url), `${origin}/live/json/events?page=1`);
    return Response.json({ meta: { total_pages: 1 }, data: [] });
  };
  try {
    const events = await fetchScuEvents();
    assert.deepEqual(events.map((event) => event.category), ["education", "education"]);
    assert.ok(events.every((event) => event.kidFriendly === false));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("internal SCU training and new-major welcomes do not exclude public faculty art", () => {
  assert.equal(isStudentOnlyEvent({ title: "AIM Faculty Portal Training" }), true);
  assert.equal(isStudentOnlyEvent({ title: "SCU COMM New Major Welcome" }), true);
  assert.equal(isStudentOnlyEvent({ title: "Connor Group Coffee Chat", description: "Register in Handshake." }), true);
  assert.equal(isStudentOnlyEvent({ title: "Faculty Recital Series", link: "https://events.scu.edu/arts-and-sciences/event/1-recital" }), false);
});

test("SCU new-major group advising is internal while public community workshops remain eligible", () => {
  assert.equal(isStudentOnlyEvent({
    title: "New Major: Winter Group Advising - Comm Department",
    link: "https://events.scu.edu/arts-and-sciences/event/521795-new-major-winter-group-advising-comm-department",
    description: "Join us for an interactive group advising session designed specifically for first-year and new transfer students.",
  }), true);
  assert.equal(isStudentOnlyEvent({ title: "Community STEM Workshop", description: "All ages welcome." }), false);
});

test("drops SCU technology training and Handshake registration listings", () => {
  assert.equal(isStudentOnlyEvent({
    link: "https://events.scu.edu/technology-training/event/453288-excel-essentials-training",
    title: "Excel: Essentials Training",
    description: "Hands-on training.",
  }), true);
  assert.equal(isStudentOnlyEvent({
    link: "https://events.scu.edu/live/events/506201-fall-bash-career-fair",
    title: "Fall Bash Career Fair",
    description: "Register for the Bash Career Fair on Handshake!",
  }), true);
});

test("drops SJSU's internal door competition while keeping public student art", () => {
  assert.equal(isStudentOnlyEvent({
    link: "https://events.sjsu.edu/event/departemnt-door-decorating-competition",
    title: "Department Door Decorating Competition",
    description: "We are seeking departments across campus to transform their office doors into Spartan showcases.",
  }), true);
  assert.equal(isStudentOnlyEvent({
    link: "https://events.sjsu.edu/event/student-art-exhibition",
    title: "Student Art Exhibition",
    description: "Student artists share their work in an exhibition open to the public.",
  }), false);
});
