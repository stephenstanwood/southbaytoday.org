import test from "node:test";
import assert from "node:assert/strict";
import { fetchScuEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

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
