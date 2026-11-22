import assert from "node:assert/strict";
import test from "node:test";

import { fetchLosAltosStageEvents } from "../generate-events.mjs";
import { deduplicateEventSlots, deduplicateEventTitles } from "../lib/event-url-dedup.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";

test("Los Altos Stage Company keeps dated repeat performances after opening night", async () => {
  const pageUrl = "https://losaltosstage.org/events/joseph/";
  const feedUrl = "https://losaltosstage.org/?rhc_action=get_icalendar_events&ID=11179";
  const calendar = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART;TZID=America/Los_Angeles:20261127T200000",
    "SUMMARY:Joseph",
    "RDATE;TZID=America/Los_Angeles;VALUE=PERIOD:20261212T150000/20261212T150000,",
    " 20261212T200000/20261212T200000",
    "RDATE;TZID=America/Los_Angeles;VALUE=PERIOD:20261213T150000/20261213T150000",
    "EXDATE;TZID=America/Los_Angeles:20261213T150000",
    "RRULE:FREQ=DAILY",
    `URL:${pageUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const responses = new Map([
    ["https://losaltosstage.org/wp-json/wp/v2/events?per_page=50", JSON.stringify([
      { link: pageUrl, title: { rendered: "Joseph" } },
    ])],
    [pageUrl, `<textarea class="ical-url">${feedUrl.replace("&", "&amp;")}</textarea>`],
    [feedUrl, calendar],
  ]);
  const events = await fetchLosAltosStageEvents({
    today: "2026-11-29",
    fetchImpl: async (url) => {
      assert.ok(responses.has(url), `Unexpected fetch: ${url}`);
      return new Response(responses.get(url));
    },
  });

  assert.deepEqual(events.map(({ date, time }) => [date, time]), [
    ["2026-12-12", "3:00 PM"],
    ["2026-12-12", "8:00 PM"],
  ]);
  const bySlotAndTitle = deduplicateEventTitles(deduplicateEventSlots(events));
  assert.deepEqual(fuzzyDedupEvents(bySlotAndTitle).kept, events);
  const [matinee, evening] = events;
  const unverifiedEvening = {
    ...evening,
    occurrenceEvidence: { ...evening.occurrenceEvidence, sourceUrl: "https://losaltosstage.org/calendar/" },
  };
  assert.equal(fuzzyDedupEvents([matinee, unverifiedEvening]).kept.length, 1);
  for (const event of events) {
    assert.equal(event.venue, "Bus Barn Theater");
    assert.equal(event.endTime, null);
    assert.equal(event.url, pageUrl);
    assert.equal(event.occurrenceEvidence.sourceUrl, feedUrl);
    assert.equal(event.occurrenceEvidence.time, event.time);
  }
});
