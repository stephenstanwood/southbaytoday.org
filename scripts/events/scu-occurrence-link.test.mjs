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
