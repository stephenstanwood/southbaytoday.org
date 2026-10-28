import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs, eventBlurbCacheKey } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration, requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";
import { fetchScuEvents, cleanTitle } from "../generate-events.mjs";
import { fetchMeetupEvents } from "../generate-events.mjs";
import { generateKeyPairSync } from "node:crypto";
import { libraryEventDetails } from "../lib/library-event-details.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { applyVerifiedMeetupEventOverride } from "../lib/meetup-event-overrides.mjs";

test("Meetup retains a named trailhead or parking destination while discarding wayfinding notes", async (t) => {
  // The October 29 TNGR occurrence names Saratoga Gap Parking at this address.
  // The old parking-note guard discarded it and substituted the biking club.
  const source = {
    id: "317147539", title: "Thursday Night Gap Ride (TNGR) potluck (B–/INT/10mi/1.4k ft)",
    dateTime: "2026-10-29T16:30:00-07:00", endTime: "2026-10-29T18:30:00-07:00",
    eventUrl: "https://www.meetup.com/westcoastmtb/events/317147539/",
    eventType: "PHYSICAL", status: "ACTIVE",
    venue: { name: "Saratoga Gap Parking", address: "17301 Skyline Blvd", city: "Saratoga" },
    group: { name: "West Coast Mountain Bikers", urlname: "westcoastmtb", stats: { memberCounts: { all: 3484 } } },
    rsvps: { yesCount: 6 },
  };
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const credentials = { MEETUP_CLIENT_ID: "offline-client", MEETUP_MEMBER_ID: "offline-member",
    MEETUP_KID: "offline-key", MEETUP_PRIVATE_KEY: privateKey };
  const previous = Object.fromEntries(Object.keys(credentials).map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, credentials);
  const names = ["Saratoga Gap Parking", "Hacienda Trailhead", "Saratoga Gap Parking Area",
    "Rustic Lands Parking Free lot and bathrooms", "Parking lot", "Free Parking", "Meet at the trailhead"];
  const nodes = names.map((name, index) => ({ ...source, id: index ? `control-${index}` : source.id,
    venue: { ...source.venue, name } }));
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url) === "https://secure.meetup.com/oauth2/access") return Response.json({ access_token: "offline-token" });
    assert.equal(String(url), "https://api.meetup.com/gql-ext");
    return Response.json({ data: { eventSearch: { edges: nodes.map((node) => ({ node })) } } });
  });
  const events = await fetchMeetupEvents({ now: new Date("2026-10-28T20:15:45Z") });
  assert.equal(events.length, names.length);
  assert.deepEqual(events.slice(0, 3).map((event) => event.venue), names.slice(0, 3));
  assert(events.slice(3).every((event) => !/parking|bathrooms?|trailhead|meet at/i.test(event.venue)));
  assert.equal(events[0].address, "17301 Skyline Blvd, Saratoga");
  assert.equal(events[0].time, "4:30 PM");
  assert.equal(events[0].endTime, "6:30 PM");
  assert.equal(events[0].url, source.eventUrl);
});

test("Stanford's KEDO organization acronym survives title normalization", () => {
  const title = "Korea's Nuclear Odyssey Beyond Borders: From KEDO to the Age of AI";
  assert.equal(cleanTitle(title), title);
  assert.equal(cleanTitle(cleanTitle(title)), title);
  assert.equal(cleanTitle("Kedo, a fictional character"), "Kedo, a fictional character");
});

test("Cambrian's Halloween listing discloses conflicting ticket instructions through blurb resolution", async () => {
  const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/cambrian-halloween-2026-10-29.json", import.meta.url)));
  const raw = {
    id: `sjpl-${fixture.event.id}`, title: fixture.event.definition.title,
    date: "2026-10-29", time: "11:00 AM", endTime: "12:00 PM",
    venue: "Cambrian Library", cost: "free",
    url: `https://sjpl.bibliocommons.com/events/${fixture.event.id}`,
    ...libraryEventDetails(fixture.event, fixture.entities),
    blurb: "Join a library Halloween festival for families, sponsored by the Friends of the Cambrian Branch Library.",
  };
  assert.match(raw.description, /tickets are not required/i);
  assert.match(raw.attendanceNote, /tickets will be distributed.*30 minutes/i);
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.equal(requiresAttendanceConfirmation(actual), true);
  assert.equal(requiresAdvanceRegistration(actual), false, "a source conflict does not establish a reservation requirement");
  assert.match(actual.attendanceNote, /description says tickets are not required.*signup instructions.*30 minutes.*Confirm.*Cambrian/i);
  assert.match(actual.description, /description and signup instructions disagree/i);
  assert.doesNotMatch(actual.description, /tickets are not required/i, "do not independently assert one side of an unresolved conflict");
  for (const field of ["id", "title", "date", "time", "endTime", "venue", "url", "cost", "blurb"]) assert.equal(actual[field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  assert.deepEqual(raw, original);

  for (const other of [
    { ...raw, date: "2027-10-29" },
    { ...raw, url: "https://sjpl.bibliocommons.com/events/another" },
    { ...raw, attendanceNote: "Storytime tickets are not required for this storytime." },
    { ...raw, description: "Tickets will be distributed 30 minutes before storytime." },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "different occurrences and resolved source copy keep their own terms");
});

test("the two dated Song of the Week sessions retain their verified music category", async () => {
  for (const [date, id, title] of [
    ["2026-11-21", "317153723", "Song of the Week - Cherub Rock by Smashing Pumpkins"],
    ["2026-11-28", "317153732", "Song of the Week - Choosin' Texas by Ella Langley"],
  ]) {
    const raw = { date, title, url: `https://www.meetup.com/bay-area-musicians-meetup/events/${id}/`,
      category: "community", time: "3:00 PM", endTime: "5:00 PM", venue: "", description: "Meetup event by Bay Area Musicians Meetup.",
      blurb: "Join fellow musicians for the weekly song session." };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.deepEqual(events[0], { ...raw, category: "music" });
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    const otherDate = { ...raw, date: "2027-11-21" };
    const otherUrl = { ...raw, url: "https://www.meetup.com/bay-area-musicians-meetup/events/another/" };
    assert.deepEqual(applyVerifiedEventFacts(otherDate), otherDate);
    assert.deepEqual(applyVerifiedEventFacts(otherUrl), otherUrl);
  }
});

test("Almaden Quicksilver keeps the source title and discloses its conflicting route lengths and required waiver", async () => {
  const raw = { date: "2026-11-14", title: "Almaden Quicksilver: 7.3 Mile Moderate Hike",
    url: "https://www.meetup.com/sleeplateandhike/events/317099274/", category: "community",
    time: "12:00 PM", endTime: "4:00 PM", venue: "Almaden Quicksilver - Hacienda", registration: "none",
    description: "Meetup event by Sleep Late and Hike.",
    blurb: "Hike a 7.3-mile route at Almaden Quicksilver starting from the Hacienda area with the Sleep Late and Hike group." };
  const before = structuredClone(raw);
  const sourceDescription = "Please sign this waiver for each event. Please do so online prior to arriving (works on mobile)\n**Total Distance:** 7.6 miles, loop";
  const fixed = applyVerifiedMeetupEventOverride(raw, { sourceDescription });
  const events = [fixed];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(fixed.category, "outdoor");
  assert.match(fixed.attendanceNote, /title says 7\.3 miles.*description says 7\.6 miles/);
  assert.match(fixed.attendanceNote, /waiver online before arriving/);
  assert.doesNotMatch(fixed.blurb, /7\.[36]/);
  for (const field of ["title", "date", "time", "endTime", "url", "venue", "registration"]) assert.equal(fixed[field], raw[field]);
  assert.deepEqual(raw, before);
});

test("the hike warning follows the fresh source body without carrying a resolved disagreement forward", () => {
  const raw = { date: "2026-11-14", title: "Almaden Quicksilver: 7.3 Mile Moderate Hike",
    url: "https://www.meetup.com/sleeplateandhike/events/317099274/", category: "community" };
  const revised = applyVerifiedMeetupEventOverride(raw, { sourceDescription: "**Total Distance:** 7.3 miles, loop" });
  assert.deepEqual(revised, { ...raw, category: "outdoor" });
  for (const other of [{ ...raw, date: "2027-11-14" }, { ...raw, url: "https://www.meetup.com/sleeplateandhike/events/another/" }]) {
    assert.deepEqual(applyVerifiedMeetupEventOverride(other, { sourceDescription: "**Total Distance:** 7.6 miles, loop" }), other);
  }
});

test("Stanford's ETL series acronym survives the first source title-cleaning pass", () => {
  const title = "Carina Hong @ Entrepreneurial Thought Leaders Speaker Series (ETL)";
  assert.equal(cleanTitle(title), title);
  assert.equal(cleanTitle(cleanTitle(title)), title);
  const event = { title, venue: "Nvidia Auditorium", description: "A talk on mathematical reasoning." };
  assert.equal(eventBlurbCacheKey(event), eventBlurbCacheKey({ ...event, title: title.replace("(ETL)", "(Etl)") }));
});

test("SCU's explicit lecture category survives an image-only RSS description", async (t) => {
  // The current RSS and occurrence JSON-LD both identify this as a public lecture.
  // Evidence: docs/qa/2026-10-28-0607-fact-check.md.
  const OriginalDate = globalThis.Date;
  t.mock.method(globalThis, "Date", class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : ["2026-10-28T05:39:07Z"])); }
    static now() { return new OriginalDate("2026-10-28T05:39:07Z").getTime(); }
  });
  const url = "https://events.scu.edu/arts-and-sciences/event/524769-discrete-wedge-product-associativity-and-a-infinity-a";
  const rss = `<rss><channel><item>
    <title>Discrete Wedge Product, Associativity, and A-infinity Algebras</title>
    <link>${url}</link><pubDate>Tue, 03 Nov 2026 23:50:00 +0000</pubDate>
    <description><![CDATA[<picture><img src="https://events.scu.edu/live/image/11128.jpg" alt=""/></picture>]]></description>
    <livewhale:id>524769</livewhale:id>
    <livewhale:categories>Open to the Public,College of Arts &amp; Sciences,Lectures</livewhale:categories>
    <georss:featurename>O’Connor Hall, Room 205</georss:featurename>
    </item><item>
    <title>Campus Community Gathering</title>
    <link>https://events.scu.edu/event/1-community-gathering</link>
    <pubDate>Sun, 01 Nov 2026 01:00:00 +0000</pubDate><description></description>
    <livewhale:id>1</livewhale:id><livewhale:categories>Open to the Public,College of Arts &amp; Sciences</livewhale:categories>
    <georss:featurename>Santa Clara University</georss:featurename>
    </item></channel></rss>`;
  t.mock.method(globalThis, "fetch", async (input) => {
    if (String(input) === "https://events.scu.edu/live/rss/events") return new Response(rss);
    assert.match(String(input), /^https:\/\/events\.scu\.edu\/live\/json\/events\?page=1$/);
    return Response.json({ meta: { total_pages: 1 }, data: [{ id: 524769, url, online_type: null, cost: "" }] });
  });
  const [event, communityEvent] = await fetchScuEvents();
  assert.ok(event);
  assert.equal(event.category, "education");
  assert.equal(event.date, "2026-11-03");
  assert.equal(event.time, "3:50 PM");
  assert.equal(event.description, "", "an image-only feed must not invent talk details");
  assert.equal(event.url, url);
  assert.equal(event.virtual, undefined);
  assert.equal(communityEvent.category, "community", "a college's name is not an arts genre");
});

test("the sparse Three Days Grace venue replacement keeps the seller's music category", async () => {
  const raw = {
    title: "Three Days Grace", date: "2026-11-18", time: "7:00 PM",
    venue: "SAP Center", url: "https://www.sapcenter.com/events/detail/three-days-grace",
    category: "community", cost: "paid", description: "",
    blurb: "Catch Three Days Grace live at SAP Center on Wednesday evening.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], { ...raw, category: "music" });
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [{ ...raw, date: "2027-11-18" }, { ...raw, url: "https://www.sapcenter.com/events/detail/another-show" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("unconfirmed Zavior Phillips showtimes stay withheld without declaring cancellation", () => {
  const event = {
    title: "Hysterical: Zavior Phillips (7:00 PM show)", date: "2027-04-02",
    venue: "The Studio", time: "7:00 PM",
    url: "https://live.stanford.edu/events/26-27season/studio/hysterical-zavior-phillips",
  };
  assert.equal(isEventPublishable(event), false);
  assert.equal(isEventPublishable({ ...event, title: "Hysterical: Zavior Phillips (9:00 PM show)", time: "9:00 PM" }), false);
  assert.equal(isEventPublishable({ ...event, title: "Hysterical: Zavior Phillips" }), false);
  assert.equal(isEventPublishable({ ...event, title: "Another comedian" }), true);
  assert.equal(isEventPublishable({ ...event, date: "2027-04-03" }), true);
});

test("Solar Sunday's rescheduled November 8 occurrence retains free public walk-in access", async () => {
  const raw = {
    id: "meetup-6b6657a0f25625c8", date: "2026-11-08",
    url: "https://www.meetup.com/sj-astronomy/events/312677419/",
    title: "Solar Sunday – See Our Sun Up Close", venue: "Houge Park",
    time: "1:30 PM", endTime: "3:30 PM", cost: null, registration: "required",
    registrationClosesBy: "2026-11-07T23:59:00Z",
    description: "Meetup event by SJ Astronomy.",
    blurb: "Look through telescopes at Houge Park to see the sun up close with SJ Astronomy.",
  };
  const before = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.equal(actual.cost, "free");
  assert.equal(requiresAdvanceRegistration(actual), false);
  assert.equal(actual.registrationClosesBy, null);
  assert.match(actual.attendanceNote, /Walk-ins welcome.*RSVP is optional/);
  for (const key of ["id", "date", "url", "title", "venue", "time", "endTime", "blurb"]) {
    assert.equal(actual[key], raw[key]);
  }
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  assert.deepEqual(raw, before);
  for (const other of [{ ...raw, date: "2026-11-15" }, { ...raw, date: "2027-11-08" }, { ...raw, url: "https://www.meetup.com/sj-astronomy/events/another/" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Bluey's opening performance uses the producer's actual run and ticket policy through blurb resolution", async () => {
  const aliases = [
    "https://www.ticketmaster.com/blueys-big-play-tickets/artist/2726558?venueId=229426&list_view=1",
    "https://broadwaysanjose.com/shows/blueys-big-play/",
  ];
  for (const url of aliases) {
    const raw = {
      id: "inbound-0c2fdee4143ab91c", title: "Bluey's Big Play", date: "2026-10-30", url,
      time: "6:00 PM", endTime: null, venue: "Center for the Performing Arts", cost: null,
      description: "Bluey, running Oct. 30 through Nov. 18. Showtimes are not given in the newsletter. Ticketed.",
      blurb: "See a puppet stage adaptation of the children's series Bluey at the Center for the Performing Arts.",
    };
    const before = structuredClone(raw);
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    const [actual] = events;
    assert.match(actual.description, /October 30 through November 1/);
    assert.doesNotMatch(actual.description, /Nov(?:ember)?\.? 18|Showtimes are not given/);
    assert.match(actual.description, /Every attendee needs a ticket, including children/);
    assert.equal(actual.cost, "paid");
    assert.equal(actual.url, aliases[1]);
    for (const key of ["id", "title", "date", "time", "endTime", "venue", "blurb"]) {
      assert.equal(actual[key], raw[key]);
    }
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    assert.deepEqual(raw, before);
    for (const other of [{ ...raw, date: "2027-10-30" }, { ...raw, url: "https://example.com/another-show" }]) {
      assert.equal(applyVerifiedEventFacts(other), other);
    }
  }
});
