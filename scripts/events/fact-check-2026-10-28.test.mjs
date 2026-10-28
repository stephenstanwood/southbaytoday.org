import test from "node:test";
import assert from "node:assert/strict";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs, eventBlurbCacheKey } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";
import { fetchScuEvents, cleanTitle } from "../generate-events.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";

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
