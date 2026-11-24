import test from "node:test";
import assert from "node:assert/strict";
import { capUpcomingEventSources, fetchScuEvents, isStudentOnlyEvent } from "../generate-events.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";
import { buildEventSlugs } from "../../src/lib/south-bay/eventSlug.ts";

const showcaseUrl = "https://events.scu.edu/arts-and-sciences/event/525021-archaeology-student-showcase";
const basketballUrl = "https://events.scu.edu/bronco-athletics/event/525252-santa-clara-university-womens-basketball-vs-uc";

test("SCU publishes the archaeology talk and basketball tip-off with verified attendance facts", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    if (String(input) === "https://events.scu.edu/live/rss/events") {
      return new Response(`<rss><channel>
        <item>
          <title>Archaeology Student Showcase</title><link>${showcaseUrl}</link>
          <pubDate>Tue, 08 Dec 2026 01:00:00 +0000</pubDate>
          <description>Hosted by the Department of Classics and Ancient Studies and the Department of Anthropology</description>
          <georss:featurename>Parlors B/C, Benson Memorial Center</georss:featurename>
          <livewhale:categories>College of Arts &amp; Sciences</livewhale:categories>
        </item>
        <item>
          <title>Santa Clara University Women's Basketball vs UC Santa Cruz</title><link>${basketballUrl}</link>
          <pubDate>Sun, 06 Dec 2026 21:00:00 +0000</pubDate>
          <livewhale:ends>Sun, 06 Dec 2026 23:00:00 +0000</livewhale:ends>
          <georss:featurename>Leavey Event Center</georss:featurename>
          <livewhale:categories>Open to the Public,Athletics</livewhale:categories>
        </item>
        <item>
          <title>Student Art Showcase</title><link>https://events.scu.edu/art-gallery/event/1-student-art-showcase</link>
          <pubDate>Tue, 08 Dec 2026 01:00:00 +0000</pubDate>
          <description>An exhibition of student artworks.</description>
        </item>
      </channel></rss>`);
    }
    assert.equal(String(input), "https://events.scu.edu/live/json/events?page=1");
    return Response.json({ meta: { total_pages: 1 }, data: [] });
  });
  const events = await fetchScuEvents();
  await resolveEventBlurbs(events, { enabled: false });
  const [showcase, basketball, art] = events;
  assert.deepEqual(
    events.map(({ date, time, endTime, category, cost }) => [date, time, endTime, category, cost]),
    [
      ["2026-12-07", "5:00 PM", "7:00 PM", "education", ""],
      ["2026-12-06", "1:00 PM", null, "sports", "low"],
      ["2026-12-07", "5:00 PM", null, "arts", ""],
    ],
  );
  assert.equal(showcase.venue, "Parlors B/C, Benson Memorial Center");
  assert.equal(basketball.venue, "Leavey Event Center");
  assert.match(basketball.attendanceNote, /\$12/);
  assert.equal(art.attendanceNote, undefined);
});

test("SCU's verified fallback clocks and ticket price respect changed source facts", () => {
  const rescheduled = { url: showcaseUrl, date: "2026-12-07", time: "6:00 PM", endTime: null };
  const revisedFinish = { ...rescheduled, time: "5:00 PM", endTime: "7:30 PM" };
  const newTicketPrice = { url: basketballUrl, date: "2026-12-06", time: "1:00 PM", endTime: null, cost: "paid" };
  const otherDate = { ...newTicketPrice, date: "2026-12-21", endTime: "3:00 PM", cost: "" };
  for (const row of [rescheduled, revisedFinish, newTicketPrice, otherDate]) {
    assert.deepEqual(applyVerifiedEventFacts(row), row);
  }
});

// The first page's Event schema is September 23. SCU's November 11 RSS
// occurrence and its own Event schema both identify 454604, at 8 PM Pacific.
// Evidence: docs/qa/2026-11-08-1907z-fact-check.md.
const seriesUrl = "https://events.scu.edu/live/events/454597-student-candlelight-mass";
const occurrenceUrl = "https://events.scu.edu/center-for-spirituality-and-faith/event/454604-student-candlelight-mass";
const occurrence = {
  id: "scu-531372024bc5152a",
  title: "Student Candlelight Mass",
  date: "2026-11-11", displayDate: "Wed, Nov 11", time: "8:00 PM", endTime: null,
  venue: "Mission Santa Clara de Asis", address: "", city: "santa-clara",
  category: "community", cost: "", source: "Santa Clara University",
  description: "Wednesday Student Mass at 8 PM at Mission Santa Clara.",
  blurb: "Attend Wednesday evening Student Candlelight Mass at Mission Santa Clara de Asis.",
  url: seriesUrl, firstSeenAt: "2026-11-07T04:50:07.476Z",
};

test("SCU ingestion and retained copy keep the verified November Mass occurrence link", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    if (String(input) === "https://events.scu.edu/live/rss/events") {
      return new Response(`<rss><channel><item>
        <title>Student Candlelight Mass</title><link>${seriesUrl}</link>
        <pubDate>Thu, 12 Nov 2026 04:00:00 +0000</pubDate>
        <description>Wednesday Student Mass 8PM Mass at Mission Santa Clara</description>
        <livewhale:id>454604</livewhale:id>
        <georss:point>37.349235 -121.94156</georss:point>
        <georss:featurename>Mission Santa Clara de Asis</georss:featurename>
      </item></channel></rss>`);
    }
    assert.equal(String(input), "https://events.scu.edu/live/json/events?page=1");
    return Response.json({ meta: { total_pages: 1 }, data: [] });
  });
  const imported = await fetchScuEvents();
  assert.equal(imported.length, 1);
  const before = structuredClone(imported[0]);
  await resolveEventBlurbs(imported, { enabled: false });
  assert.equal(imported[0].url, occurrenceUrl);
  for (const key of ["id", "date", "time", "endTime", "venue", "city", "cost", "description"]) {
    assert.deepEqual(imported[0][key], before[key], `preserve ${key}`);
  }
  const retained = structuredClone(occurrence);
  await resolveEventBlurbs([retained], { enabled: false });
  assert.deepEqual(retained, { ...occurrence, url: occurrenceUrl });
  assert.deepEqual(applyVerifiedEventFacts(retained), retained);
});

test("the Mass link repair requires the exact date, clock, title, venue and source identity", () => {
  for (const url of [seriesUrl, seriesUrl.replace("live/events", "center-for-spirituality-and-faith/event"), occurrenceUrl, occurrenceUrl.replace("center-for-spirituality-and-faith/event", "live/events")]) {
    const event = { ...occurrence, url };
    assert.deepEqual(applyVerifiedEventFacts(event), { ...event, url: occurrenceUrl });
  }
  for (const patch of [
    { date: "2026-09-23" }, { date: "2026-11-18" }, { time: "7:00 PM" },
    { title: "Another Mass" }, { venue: "Another Church" },
    { url: seriesUrl.replace("events.scu.edu", "example.org") },
    { url: seriesUrl.replace("454597", "454605") },
  ]) {
    const event = { ...occurrence, ...patch };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  for (const registration of ["required", "full", "closed", "appointment-only"]) {
    const event = { ...occurrence, registration, attendanceNote: "Current organizer access conditions." };
    assert.deepEqual(applyVerifiedEventFacts(event), { ...event, url: occurrenceUrl });
  }
});

test("SCU keeps explicit RSS finish times for the matching timed occurrences", async (t) => {
  const origin = "https://events.scu.edu";
  const rows = [
    ["517362", "Tue, 24 Nov 2026 22:30:00 +0000", "Wed, 25 Nov 2026 00:00:00 +0000"],
    ["517363", "Tue, 01 Dec 2026 22:30:00 +0000", "Wed, 02 Dec 2026 00:00:00 +0000"],
    ["517364", "Wed, 02 Dec 2026 22:30:00 +0000", ""],
    ["517365", "Thu, 03 Dec 2026 22:30:00 +0000", "Thu, 03 Dec 2026 21:00:00 +0000"],
    ["517366", "Fri, 04 Dec 2026 08:01:00 +0000", "Fri, 04 Dec 2026 20:00:00 +0000"],
    ["517367", "Sat, 05 Dec 2026 22:30:00 +0000", "2026-12-06"],
  ];
  const xml = `<rss><channel>${rows.map(([id, start, end]) => `<item>
    <title>Forge Volunteer Hours</title>
    <link>${origin}/sustainability/event/${id}-forge-volunteer-hours</link>
    <pubDate>${start}</pubDate>
    <livewhale:ends>${end}</livewhale:ends>
    <georss:featurename>The Forge Garden</georss:featurename>
  </item>`).join("")}</channel></rss>`;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url) === `${origin}/live/rss/events`) return new Response(xml);
    assert.equal(String(url), `${origin}/live/json/events?page=1`);
    return Response.json({ meta: { total_pages: 1 }, data: [] });
  });
  const events = await fetchScuEvents();
  assert.deepEqual(events.map(({ date, time, endTime }) => [date, time, endTime]), [
    ["2026-11-24", "2:30 PM", "4:00 PM"],
    ["2026-12-01", "2:30 PM", "4:00 PM"],
    ["2026-12-02", "2:30 PM", null],
    ["2026-12-03", "2:30 PM", null],
    ["2026-12-04", null, null],
    ["2026-12-05", "2:30 PM", null],
  ]);
});

test("SCU shared copies and campus programs leave room for the two ticketed festival dates", async (t) => {
  const origin = "https://events.scu.edu";
  const match = "505793-santa-clara-university-mens-water-polo-vs-first";
  const friday = "Sat, 05 Dec 2026 03:30:00 +0000";
  const saturday = "Sun, 06 Dec 2026 03:30:00 +0000";
  const otherListings = Array.from({ length: 22 }, (_, index) => [
    `community/event/${10000 + index}-public-event`, `Public event ${index}`, "Fri, 20 Nov 2026 18:00:00 +0000",
  ]);
  const rows = [
    ...otherListings,
    [`live/events/${match}`, "Santa Clara University Men's Water Polo vs Pepperdine", "Fri, 20 Nov 2026 19:30:00 +0000", "507102"],
    [`bronco-athletics/event/${match}`, "Santa Clara University Men's Water Polo vs Pepperdine", "Fri, 20 Nov 2026 19:30:00 +0000", "505793"],
    ["library/event/513402-manage-your-research-presence-online", "Manage your Research Presence Online", "Tue, 01 Dec 2026 23:00:00 +0000"],
    ["arts-and-sciences/event/534032-coherence-auditions", "Coherence Auditions", "Wed, 02 Dec 2026 22:15:00 +0000"],
    ["arts-and-sciences/event/478083-27th-annual-festival-of-lights", "27th Annual Festival of Lights", friday],
    ["arts-and-sciences/event/478516-27th-annual-festival-of-lights", "27th Annual Festival of Lights", saturday],
    [`bronco-athletics/event/${match}`, "Santa Clara University Men's Water Polo vs Pepperdine", "Mon, 07 Dec 2026 19:30:00 +0000", "505793"],
  ];
  const xml = `<rss><channel>${rows.map(([path, title, start, id]) => `<item>
    <title>${title}</title><link>${origin}/${path}</link><pubDate>${start}</pubDate>
    ${id ? `<livewhale:id>${id}</livewhale:id>` : ""}
  </item>`).join("")}</channel></rss>`;
  t.mock.method(globalThis, "fetch", async (input) => {
    if (String(input) === `${origin}/live/rss/events`) return new Response(xml);
    assert.equal(String(input), `${origin}/live/json/events?page=1`);
    return Response.json({ meta: { total_pages: 1 }, data: [] });
  });
  const imported = await fetchScuEvents();
  assert.deepEqual(imported.filter(event => event.title.includes("Pepperdine"))
    .map(event => [event.date, event.url]), [
    ["2026-11-20", `${origin}/bronco-athletics/event/${match}`],
    ["2026-12-07", `${origin}/bronco-athletics/event/${match}`],
  ]);
  const capped = capUpcomingEventSources(imported.map(applyVerifiedEventFacts).filter(isEventPublishable));
  assert.equal(capped.length, 25);
  assert.deepEqual(capped.slice(-2).map(({ date, url }) => [date, url]), [
    ["2026-12-04", "https://scupresents.scu.edu/event/27th-annual-festival-of-lights-82x73c"],
    ["2026-12-05", "https://scupresents.scu.edu/event/27th-annual-festival-of-lights-23qkn0"],
  ]);
});

test("BVA Café is a separate public meetup with required registration", () => {
  assert.equal(isStudentOnlyEvent({ title: "Bronco Ventures Accelerator" }), true);
  for (const [date, sourceId] of [["2026-11-19", "517570"], ["2026-12-17", "517571"]]) {
    const listing = {
      title: "BVA Café", date,
      url: `https://events.scu.edu/ciocca-center/event/${sourceId}-bva-cafe`,
    };
    assert.equal(isStudentOnlyEvent({ title: listing.title, link: listing.url }), false);
    const corrected = applyVerifiedEventFacts(listing);
    assert.equal(corrected.cost, "free");
    assert.equal(corrected.registration, "required");
    assert.equal(corrected.url, sourceId === "517571"
      ? "https://www.scu.edu/cioccacenter/bronco-ventures/bronco-venture-accelerator/bva-cafe/"
      : listing.url);
    assert.equal(applyVerifiedEventFacts({ ...listing, registration: "closed" }).registration, "closed");
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    const otherDate = { ...listing, date: "2027-01-21" };
    assert.deepEqual(applyVerifiedEventFacts(otherDate), otherDate);
  }
});

test("restoring the 9 PM Choreographers' Gallery show preserves the existing 7 PM event URL", () => {
  const listings = [
    ["scu-bc102b41a08b784f", "7:00 PM", "507180", "2e0c31"],
    ["scu-9a7a71e4e4ec0e00", "9:00 PM", "507181", "kq9bav"],
  ].map(([id, time, calendarId, ticket]) => {
    const event = applyVerifiedEventFacts({
      id, city: "santa-clara", venue: "Louis B. Mayer Theatre", source: "Santa Clara University",
      title: "Choreographers' Gallery 2026", date: "2026-12-04", time,
      url: `https://events.scu.edu/arts-and-sciences/event/${calendarId}-choreographers-gallery-2026`,
    });
    assert.equal(event.url, "https://scupresents.scu.edu/section/choreographers-gallery-gni8");
    assert.equal(event.occurrenceEvidence.sourceOccurrenceId, ticket);
    assert.equal(event.cost, "paid");
    assert.equal(event.time, time);
    return event;
  });
  const { kept } = fuzzyDedupEvents(listings);
  assert.deepEqual(kept, listings);
  assert.deepEqual([...buildEventSlugs(kept)].map(([slug, event]) => [slug, event.time]), [
    ["2026-12-04-choreographers-gallery-2026", "7:00 PM"],
    ["2026-12-04-choreographers-gallery-2026-2", "9:00 PM"],
  ]);
});
