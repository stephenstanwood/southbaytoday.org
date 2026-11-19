import assert from "node:assert/strict";
import test from "node:test";
import { fetchSjsuEvents } from "../generate-events.mjs";
import { deduplicateEventSlots } from "../lib/event-url-dedup.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";
import { buildEventSlugs } from "../../src/lib/south-bay/eventSlug.ts";

const origin = "https://events.sjsu.edu";
const url = origin + "/event/hammer-presents-merry-achi-christmas-2026";
const title = "Hammer Presents Merry-Achi Christmas 2026";
const [friday, matinee, evening] = [
  ["53826556657281", "Fri, 27 Nov 2026 19:30:00 -0800", "2026-11-27T19:30:00-08:00", "2026-11-27T21:30:00-08:00"],
  ["53826556658306", "Sat, 28 Nov 2026 14:00:00 -0800", "2026-11-28T14:00:00-08:00", "2026-11-28T16:00:00-08:00"],
  ["53826556659331", "Sat, 28 Nov 2026 19:30:00 -0800", "2026-11-29T03:30:00Z", "2026-11-29T05:30:00Z"],
].map(([id, pubDate, start, end]) => ({ id, pubDate, start, end, all_day: false }));

function mockCalendar(t, rssRows, instances) {
  const items = rssRows.map(({ id, pubDate }) => `<item>
    <title>${title}</title><link>${url}</link>
    <guid isPermaLink="false">tag:localist.com,2008:EventInstance_${id}</guid>
    <pubDate>${pubDate}</pubDate>
  </item>`).join("");
  t.mock.method(globalThis, "fetch", async input => {
    if (String(input) === origin + "/calendar.xml") {
      return new Response(`<rss><channel>${items}</channel></rss>`);
    }
    const request = new URL(input);
    assert.equal(request.origin + request.pathname, origin + "/api/2/events");
    const instance = instances[Number(request.searchParams.get("page")) - 1];
    return Response.json({
      page: { total: instances.length },
      events: [{
        event: {
          localist_url: url, location_name: "Hammer Theatre Center", free: false,
          event_instances: [{ event_instance: instance }],
        },
      }],
    });
  });
}

test("SJSU's separately listed Saturday performances survive both duplicate passes", async t => {
  mockCalendar(t, [friday, matinee, evening], [friday, matinee, evening]);
  const events = await fetchSjsuEvents();
  assert.deepEqual(events.map(({ date, time, endTime }) => [date, time, endTime]), [
    ["2026-11-27", "7:30 PM", "9:30 PM"],
    ["2026-11-28", "2:00 PM", "4:00 PM"],
    ["2026-11-28", "7:30 PM", "9:30 PM"],
  ]);
  assert.deepEqual(events.slice(0, 2).map(event => event.id), [
    "sjsu-45c5e8749a93e5e5", "sjsu-0d2083d9c2184167",
  ]);
  assert.equal(events[0].occurrenceEvidence, undefined);
  for (const [event, instance] of [[events[1], matinee], [events[2], evening]]) {
    assert.deepEqual(event.occurrenceEvidence, {
      kind: "first-party-localist-instance", sourceUrl: url, sourceOccurrenceId: instance.id,
      date: "2026-11-28", time: event.time,
    });
  }

  const mirror = { ...events[2], id: "mirror", source: "Calendar mirror", occurrenceEvidence: undefined };
  const { kept } = fuzzyDedupEvents(deduplicateEventSlots([...events, mirror]));
  assert.deepEqual(kept, events);
  const slugs = Object.fromEntries([...buildEventSlugs(kept)].map(([slug, event]) => [slug, event.time]));
  assert.deepEqual(slugs, {
    "2026-11-27-hammer-presents-merry-achi-christmas-2026": "7:30 PM",
    "2026-11-28-hammer-presents-merry-achi-christmas-2026": "2:00 PM",
    "2026-11-28-hammer-presents-merry-achi-christmas-2026-2": "7:30 PM",
  });
});

test("SJSU shared links still deduplicate without two matching timed instances", async t => {
  // Make a missing offset parse to the intended instant if a guard is lost,
  // independent of the machine running this fixture.
  const previousZone = process.env.TZ;
  process.env.TZ = "UTC";
  t.after(() => {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  });
  for (const [name, rssRow, apiRow] of [
    ["missing GUID", { ...evening, id: "" }, evening],
    ["wrong occurrence ID", evening, { ...evening, id: "53826556659332" }],
    ["different start instant", evening, { ...evening, start: "2026-11-29T03:45:00Z" }],
    ["all-day occurrence", evening, { ...evening, all_day: true }],
    ["RSS without a time zone", { ...evening, pubDate: "Sun, 29 Nov 2026 03:30:00" }, evening],
    ["API without a time zone", evening, { ...evening, start: "2026-11-29T03:30:00" }],
    ["same occurrence ID at both times", { ...evening, id: matinee.id }, { ...evening, id: matinee.id }],
  ]) {
    await t.test(name, async t => {
      mockCalendar(t, [matinee, rssRow], [matinee, apiRow]);
      const events = await fetchSjsuEvents();
      assert.equal(events.length, 2);
      assert.ok(events.every(event => !event.occurrenceEvidence));
      assert.equal(fuzzyDedupEvents(events).droppedCount, 1);
    });
  }
});
