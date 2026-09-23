import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertIcalCalendar,
  fetchSanJoseTheatersEvents,
} from "../generate-events.mjs";
import {
  SAN_JOSE_THEATERS_LISTINGS_URL,
  isTheaterListing,
  parsePerformanceLines,
  parseTheaterEventPage,
  parseTheaterListings,
  resolveTheaterVenue,
  theaterPerformances,
} from "./san-jose-theaters-events.mjs";
import {
  buildSourceHealth,
  sourceProblems,
  sourceRegressionProblems,
} from "./event-source-health.mjs";

// sanjosetheaters.org folded into sanjose.org (Visit San Jose) in September
// 2026. The old All-in-One Event Calendar iCal export started answering HTTP
// 200 with the ~166 KB theaters landing page, the adapter parsed zero VEVENTs
// as a healthy empty season, and the per-source regression guard blocked the
// 2026-09-22 refresh: "fetchSanJoseTheatersEvents lost 59 still-upcoming
// source records". The fixtures below are the real shapes sanjose.org serves:
// the `/event-listings` JSON its theaters page loads, and the Drupal detail
// page each listing links to.

const dayPT = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
const TODAY = dayPT(0);

function mdy(iso) {
  const [y, m, d] = iso.split("-");
  return `${m}/${Number(d)}/${y}`;
}

function longDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function listing({ title, slug, start, end = start, dates = [start], venue, categories = "Stage &amp; Theater", flag = "On" }) {
  return {
    title,
    start_date: mdy(start),
    end_date: mdy(end),
    image: `/sites/default/files/styles/grid_listing/public/${slug}.jpg.webp?itok=x`,
    categories,
    venue,
    city: "San Jose",
    neighborhood: "Downtown",
    link: `/theaters/events/${slug}`,
    events_date: dates.join("|"),
    field_mcenery_convention_center: "Off",
    field_team_san_jose_theater: flag,
    field_hide_event_from_search: "Off",
    field_show_as_virtaul: "Off",
    field_vir: "",
    field_event_organization: "",
    field_event_description: "",
  };
}

function detailPage({ focus, time = "", venue, street, copy }) {
  return `<!DOCTYPE html><html><body><div role="main">
<div class="listing-detail--primary">
  <img loading="lazy" src="/sites/default/files/styles/listing_detail_image/public/show.jpg.webp?itok=Ge8D01bL" width="767" height="767" />
  <div class="listing-detail--content">
    <div class="listing-detail--content--block">
      ${copy}
    </div>
    <div class="listing-detail--content--block content-disclaimer">
      <p>PLEASE CONFIRM DETAILS DIRECTLY WITH EVENT ORGANIZER OR BOX OFFICE FOR UPDATES</p>
    </div>
  </div>
</div>
<div class="listing-detail--secondary">
  <div class="listing-detail--secondary--details">
    <div class="listing-detail--secondary--section">
      <h3>When</h3>
      <ul class="listing-detail--secondary--section--toolbar">
        <script type="text/javascript">cal_single = ics(); cal_single.addEvent('Show', '', '${venue}    ', 'x', 'y');</script>
      </ul>
      <div class="listing-detail--secondary--section--focus">${focus}
      </div>
      <div class="listing-detail--secondary--ticket-info">
        ${time ? `<p>${time}</p>` : ""}
      </div>
      <div class="listing-detail--secondary--ticket-info"></div>
    </div>
    <a href="https://sanjosetheaters.org/event/show/" target="_blank" id="event-btn--visitwebsite" class="btn event-btn">Website</a>
    <a href="https://www.ticketmaster.com/event/1C00649EF9B8E336" target="_blank" id="event-btn--booknow" class="btn event-btn">Ticket</a>
    <div class="listing-detail--secondary--section" itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
      <h3>Where</h3>
      <div class="listing-detail--secondary--section--focus">${venue}</div>
      <span itemprop="streetAddress">${street}, </span>
      <span itemprop="addressLocality">San Jose</span>, <span itemprop="addressRegion">CA</span> <span itemprop="postalCode">95113</span>
    </div>
    <div class="listing-detail--secondary--section"><h3>Neighborhood</h3>Downtown</div>
  </div>
</div>
</div></body></html>`;
}

const LANDING_PAGE = `<!DOCTYPE html>
<html lang="en" dir="ltr"><head><meta charset="utf-8" />
<link rel="canonical" href="https://www.sanjose.org/theaters" />
<title>San Jose Theaters | Visit San Jose</title></head>
<body><div ng-app="TheaterEventListingApp"></div></body></html>`;

async function runWith(routes) {
  const original = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    const key = String(url);
    requested.push(key);
    const body = routes[key];
    if (body === undefined) return new Response("not found", { status: 404 });
    if (body instanceof Error) throw body;
    const json = key === SAN_JOSE_THEATERS_LISTINGS_URL && String(body).startsWith("[");
    return new Response(body, {
      status: 200,
      headers: { "content-type": json ? "application/json" : "text/html; charset=UTF-8" },
    });
  };
  try {
    return { events: await fetchSanJoseTheatersEvents(), requested };
  } finally {
    globalThis.fetch = original;
  }
}

test("the landing page served in place of the feed is an error, never an empty season", async () => {
  assert.throws(
    () => parseTheaterListings(LANDING_PAGE),
    /returned an HTML page titled "San Jose Theaters \| Visit San Jose", not the JSON event listing/,
  );
  await assert.rejects(
    runWith({ [SAN_JOSE_THEATERS_LISTINGS_URL]: LANDING_PAGE }),
    /HTML page/,
  );
});

test("a thrown adapter is skipped by the regression guard; an empty one blocks the refresh", () => {
  // This is the whole reason the adapter throws. Yesterday's healthy run had
  // 59 upcoming shows; an empty success reads as all of them vanishing.
  const previous = [{
    id: "fetchSanJoseTheatersEvents",
    label: "fetchSanJoseTheatersEvents",
    critical: false,
    status: "ok",
    count: 59,
    dateCounts: { [dayPT(3)]: 30, [dayPT(40)]: 29 },
    error: null,
  }];
  const definitions = [{ id: "fetchSanJoseTheatersEvents", label: "fetchSanJoseTheatersEvents", critical: false }];

  const empty = buildSourceHealth(definitions, [{ status: "fulfilled", value: [] }]);
  assert.deepEqual(
    sourceRegressionProblems({ previousSourceHealth: previous, nextSourceHealth: empty, today: TODAY }),
    ["fetchSanJoseTheatersEvents lost 59 still-upcoming source records"],
  );

  const thrown = buildSourceHealth(definitions, [{
    status: "rejected",
    reason: new Error("sanjose.org /event-listings returned an HTML page, not the JSON event listing"),
  }]);
  assert.deepEqual(
    sourceRegressionProblems({ previousSourceHealth: previous, nextSourceHealth: thrown, today: TODAY }),
    [],
  );
  const { blocking, tolerated } = sourceProblems(thrown);
  assert.deepEqual(blocking, []);
  assert.equal(tolerated.length, 1);
});

test("the listing filter is the one the sanjose.org theaters page applies", () => {
  const start = dayPT(10);
  const civic = listing({ title: "Bronco", slug: "bronco", start, venue: "San Jose Civic" });
  assert.equal(isTheaterListing(civic), true);
  // Flagged theater shows count even when the venue field names the presenter.
  assert.equal(isTheaterListing({ ...civic, venue: "Symphony San Jose" }), true);
  // Unflagged listings count only at one of the four houses.
  assert.equal(isTheaterListing({ ...civic, field_team_san_jose_theater: "Off" }), true);
  assert.equal(
    isTheaterListing({ ...civic, field_team_san_jose_theater: "Off", venue: "San Jose City Hall Plaza" }),
    false,
  );
  assert.equal(isTheaterListing({ ...civic, field_hide_event_from_search: "On" }), false);
  assert.equal(isTheaterListing({ ...civic, field_show_as_virtaul: "On" }), false);

  assert.throws(() => parseTheaterListings("[{oops"), /malformed JSON/);
  assert.throws(
    () => parseTheaterListings(JSON.stringify([{ ...civic, field_team_san_jose_theater: "Off", venue: "Sonic Runway" }])),
    /returned 1 listings but none at the four city theaters/,
  );
});

test("performance lists parse in every shape the presenters publish", () => {
  const range = { start: "2026-10-07", end: "2026-10-18" };
  const phantom = `<p><strong>Performances:</strong><br>Weds., October 7, 2026 @ 7:30pm<br>
Thurs., October 8, 2026 @ 1pm, 7:30pm<br>Sun., October 18, 2026 @ 1pm, 6:30pm</p>`;
  assert.deepEqual(parsePerformanceLines(phantom, range), [
    { date: "2026-10-07", time: "7:30 PM" },
    { date: "2026-10-08", time: "1:00 PM" },
    { date: "2026-10-08", time: "7:30 PM" },
    { date: "2026-10-18", time: "1:00 PM" },
    { date: "2026-10-18", time: "6:30 PM" },
  ]);

  // Symphony / ballet copy: "at 2 p.m. & 7 p.m."
  assert.deepEqual(
    parsePerformanceLines("<p>Saturday, December 19, 2026 at 2 p.m. &amp; 7 p.m.</p>", {
      start: "2026-12-19",
      end: "2026-12-27",
    }),
    [
      { date: "2026-12-19", time: "2:00 PM" },
      { date: "2026-12-19", time: "7:00 PM" },
    ],
  );

  // No year: taken from the listing's own run.
  assert.deepEqual(
    parsePerformanceLines("<p>Saturday, December 12th @ 2:00 PM<br>Sunday, December 13th @ 6:00 PM</p>", {
      start: "2026-12-12",
      end: "2026-12-13",
    }),
    [
      { date: "2026-12-12", time: "2:00 PM" },
      { date: "2026-12-13", time: "6:00 PM" },
    ],
  );

  // An on-sale sentence right above the list, and a doors time, are not shows.
  // stripHtml collapses newlines, so the split has to happen on the markup.
  assert.deepEqual(
    parsePerformanceLines(
      "<p><em>Tickets are on sale as of September 15, 2026.</em></p>"
        + "<p><strong>Performances</strong><br>Sat., December 26, 2026 @ 7:30pm (doors 6:30pm)"
        + "<br>Mon., December 28, 2026 @ 2pm</p>"
        + "<p>Season announced March 3, 2026 at 10am.</p>",
      { start: "2026-12-26", end: "2026-12-28" },
    ),
    [
      { date: "2026-12-26", time: "7:30 PM" },
      { date: "2026-12-28", time: "2:00 PM" },
    ],
  );
});

test("presenter mailing addresses never become venues", () => {
  // Symphony San Jose listings name the orchestra and its P.O. box as the venue.
  assert.equal(
    resolveTheaterVenue({
      whereVenue: "Symphony San Jose",
      whereAddress: "P.O. Box 790, San Jose , CA 95106",
      listingVenue: "Symphony San Jose",
      description: "Celebrate the holidays by seeing the Holiday Spectacular at the California Theatre!",
    }),
    "California Theatre",
  );
  // Broadway San Jose listings carry the CPA's street without the house name.
  assert.equal(
    resolveTheaterVenue({
      whereVenue: "Broadway San Jose",
      whereAddress: "255 Almaden Boulevard, San Jose , CA 95113",
      listingVenue: "Broadway San Jose",
      description: "",
    }),
    "Center for the Performing Arts",
  );
  assert.equal(
    resolveTheaterVenue({
      whereVenue: "Symphony San Jose",
      whereAddress: "P.O. Box 790, San Jose , CA 95106",
      listingVenue: "Symphony San Jose",
      description: "A concert somewhere downtown.",
    }),
    null,
  );
});

test("single nights take the structured show time; runs take the presenter's list", () => {
  const night = dayPT(12);
  const single = listing({ title: "Bronco", slug: "bronco", start: night, venue: "San Jose Civic" });
  const detail = parseTheaterEventPage(detailPage({
    focus: longDate(night),
    time: "08:00 PM",
    venue: "San Jose Civic",
    street: "135 West San Carlos Street",
    copy: "<p>After 35 years of playing and touring the world together…</p>",
  }));
  assert.equal(detail.whereVenue, "San Jose Civic");
  assert.deepEqual(detail.whenTimes, ["8:00 PM"]);
  assert.match(detail.image, /^https:\/\/www\.sanjose\.org\/sites\/default\/files\/styles\/listing_detail_image\//);
  assert.deepEqual(theaterPerformances(single, detail), {
    performances: [{ date: night, time: "8:00 PM" }],
    skip: null,
  });

  // A doors time in the structured block is not the curtain time.
  const withDoors = parseTheaterEventPage(detailPage({
    focus: longDate(night), time: "Doors 6:30 PM / Show 7:30 PM", venue: "San Jose Civic",
    street: "135 West San Carlos Street", copy: "<p>Bronco.</p>",
  }));
  assert.deepEqual(withDoors.whenTimes, ["7:30 PM"]);

  const noTime = parseTheaterEventPage(detailPage({
    focus: longDate(night), venue: "Center for the Performing Arts",
    street: "255 South Almaden Boulevard", copy: "<p>Regresa el fenómeno de la comedia.</p>",
  }));
  assert.deepEqual(theaterPerformances(single, noTime), {
    performances: [],
    skip: "no published show time",
  });

  // Opera San José and Broadway San Jose runs come from their own feeds.
  const run = listing({
    title: "Phantom of The Opera – Broadway San Jose",
    slug: "phantom-opera-broadway-san-jose",
    start: dayPT(20),
    end: dayPT(22),
    dates: [dayPT(20), dayPT(21), dayPT(22)],
    venue: "Center for the Performing Arts",
    categories: "Broadway San Jose, Stage &amp; Theater: Musicals",
  });
  assert.deepEqual(theaterPerformances(run, detail).skip, "presenter-owned run (dedicated source)");
});

test("upcoming shows publish in the event shape the refresh expects", async () => {
  const night = dayPT(5);
  const runStart = dayPT(30);
  const runEnd = dayPT(31);
  const listings = [
    listing({ title: "Bronco", slug: "bronco", start: night, venue: "San Jose Civic", categories: "Music, Stage &amp; Theater" }),
    listing({
      title: "Matilda The Musical",
      slug: "matilda-musical",
      start: runStart,
      end: runEnd,
      dates: [runStart, runEnd],
      venue: "Montgomery Theater",
      categories: "Children&#039;s Musical Theater (CMT), Kids &amp; Family, Stage &amp; Theater",
    }),
    listing({
      title: "Fiddler on the Roof – Opera San José",
      slug: "fiddler-roof-opera-san-jose",
      start: runStart,
      end: runEnd,
      dates: [runStart, runEnd],
      venue: "California Theatre",
    }),
    listing({ title: "Last Season's Show", slug: "old-show", start: dayPT(-30), venue: "San Jose Civic" }),
    { ...listing({ title: "Sonic Runway", slug: "sonic-runway", start: night, venue: "San Jose City Hall Plaza" }), field_team_san_jose_theater: "Off" },
  ];
  const { events, requested } = await runWith({
    [SAN_JOSE_THEATERS_LISTINGS_URL]: JSON.stringify(listings),
    "https://www.sanjose.org/theaters/events/bronco": detailPage({
      focus: longDate(night),
      time: "08:00 PM",
      venue: "San Jose Civic",
      street: "135 West San Carlos Street",
      copy: "<p>After 35 years of playing and touring the world together, Bronco is one of the most legendary groups in Mexican music history.</p>",
    }),
    "https://www.sanjose.org/theaters/events/matilda-musical": detailPage({
      focus: `${longDate(runStart)} to ${longDate(runEnd)}`,
      venue: "Montgomery Theater",
      street: "271 South Market Street",
      copy: `<p>CMT San Jose presents Matilda.</p><p>${longDate(runStart)} @ 7pm<br>${longDate(runEnd)} @ 2pm, 7pm</p>`,
    }),
  });

  // Past and non-theater listings are never fetched, and neither is the opera
  // run, which fetchOperaSanJoseEvents reads from operasj.org itself.
  assert.deepEqual(requested.sort(), [
    SAN_JOSE_THEATERS_LISTINGS_URL,
    "https://www.sanjose.org/theaters/events/bronco",
    "https://www.sanjose.org/theaters/events/matilda-musical",
  ].sort());

  assert.deepEqual(
    events.map((e) => `${e.date} ${e.time} ${e.title}`),
    [
      `${night} 8:00 PM Bronco`,
      `${runStart} 7:00 PM Matilda The Musical`,
      `${runEnd} 2:00 PM Matilda The Musical`,
      `${runEnd} 7:00 PM Matilda The Musical`,
    ],
  );
  const [bronco, matilda] = events;
  assert.equal(bronco.source, "San Jose Theaters");
  assert.equal(bronco.city, "san-jose");
  assert.equal(bronco.venue, "San Jose Civic");
  assert.equal(bronco.address, "135 West San Carlos Street, San Jose, CA 95113");
  assert.equal(bronco.url, "https://www.sanjose.org/theaters/events/bronco");
  assert.equal(bronco.cost, "paid");
  assert.equal(bronco.endTime, null);
  assert.match(bronco.id, /^sanjosetheaters-[0-9a-f]{16}$/);
  assert.match(bronco.description, /^After 35 years/);
  assert.equal(bronco.occurrenceEvidence.kind, "first-party-occurrence-page");
  assert.equal(bronco.occurrenceEvidence.sourceUrl, bronco.url);
  assert.equal(bronco.occurrenceEvidence.date, night);
  assert.equal(bronco.kidFriendly, false);
  // Visit San Jose tags nearly every booking "Stage & Theater"; a concert is
  // still music, the way the old sanjosetheaters.org rows were filed.
  assert.equal(bronco.category, "music");
  assert.equal(matilda.venue, "Montgomery Theater");
  assert.equal(matilda.address, "271 South Market Street, San Jose, CA 95113");
  assert.equal(matilda.kidFriendly, true);
  assert.equal(new Set(events.map((e) => e.id)).size, events.length);
});

test("a site change that breaks most detail pages is an error, not a short season", async () => {
  const listings = [1, 2, 3, 4, 5].map((n) =>
    listing({ title: `Show ${n}`, slug: `show-${n}`, start: dayPT(n + 3), venue: "San Jose Civic" }));
  await assert.rejects(
    runWith({
      [SAN_JOSE_THEATERS_LISTINGS_URL]: JSON.stringify(listings),
      "https://www.sanjose.org/theaters/events/show-1": detailPage({
        focus: longDate(dayPT(4)), time: "07:00 PM", venue: "San Jose Civic",
        street: "135 West San Carlos Street", copy: "<p>Show one.</p>",
      }),
    }),
    /4\/5 sanjose\.org theater pages failed/,
  );
});

test("iCal adapters reject a non-calendar body instead of parsing it as empty", () => {
  assert.throws(
    () => assertIcalCalendar(LANDING_PAGE, "San Jose Theaters"),
    /San Jose Theaters iCal feed returned an HTML page titled "San Jose Theaters \| Visit San Jose", not a calendar/,
  );
  assert.throws(() => assertIcalCalendar("", "Town of Los Gatos"), /0 bytes that do not open a VCALENDAR/);
  const empty = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
  assert.equal(assertIcalCalendar(empty, "Town of Los Gatos"), empty);
  assert.equal(assertIcalCalendar(`\uFEFF${empty}`, "Town of Los Gatos"), `\uFEFF${empty}`);
});
