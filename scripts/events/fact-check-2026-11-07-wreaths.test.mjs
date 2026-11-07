import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchInboundEvents, fetchMontalvoEvents } from "../generate-events.mjs";
import { deduplicateEventUrls } from "../lib/event-url-dedup.mjs";
import { parseMontalvoOccurrencePage } from "../../src/lib/south-bay/montalvoOccurrence.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-07-wreaths.json", import.meta.url)));
const [morning, afternoon, youth] = fixture.occurrences;
const input = (title, startsAt, endsAt, sourceUrl = null) => ({
  id: title, title, startsAt, endsAt, sourceUrl,
  cityKey: "saratoga", fromEmail: "info@montalvoarts.org",
  location: "Montalvo Arts Center, 15400 Montalvo Rd, Saratoga, CA 95070",
  description: "Make a wreath with natural materials.",
});
const newsletters = [
  input("Wreathmaking Workshop (10am session)", "2026-11-15T10:00:00-08:00", "2026-11-15T12:00:00-08:00"),
  input("Wreathmaking Workshop (3pm session)", "2026-11-15T15:00:00-08:00", "2026-11-15T17:00:00-08:00"),
  input("Wild-Foraged Wreath-Making Workshop", "2026-11-15T10:00:00-08:00", null, "https://my.montalvoarts.org/overview/3275?promo="),
];

test("actual occurrence alerts close the two sessions without closing the available youth workshop", () => {
  for (const [source, time] of [[morning, "10:00 AM"], [afternoon, "3:00 PM"]]) {
    const event = parseMontalvoOccurrencePage(source.html);
    assert.equal(event.date, "2026-11-15");
    assert.equal(event.time, time);
    assert.equal(event.registration, "full");
    assert.match(event.attendanceNote, /Sold out.*waitlist/);
  }
  assert.match(youth.html, /Sold Out!/);
  assert.equal(parseMontalvoOccurrencePage(youth.html).registration, undefined,
    "the shared selector's sold-out heading is not an occurrence availability notice");
  const undated = morning.html.replace(/<p class="tn-event-detail__display-time">[\s\S]*?<\/p>/, "");
  assert.equal(parseMontalvoOccurrencePage(undated).registration, undefined,
    "an undated overview cannot close a particular occurrence");
});

test("Montalvo ingestion carries each exact ticket alert into published fields", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-07T14:07:05Z") });
  const calendar = '<script type="application/ld+json">' + JSON.stringify({ "@graph": [
    { "@type": "Event", name: "Wreath Making Workshop 10am", startDate: "2026-11-15T10:00:00", url: morning.url },
    { "@type": "Event", name: "Wreath Making Workshop 3pm", startDate: "2026-11-15T15:00:00", url: afternoon.url },
  ] }) + '</script>';
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("events-calendar")) return new Response(calendar);
    const page = fixture.occurrences.find(source => source.url === String(url));
    assert(page, `unexpected request: ${url}`);
    return new Response(page.html);
  });
  const events = await fetchMontalvoEvents({ previousEvents: [] });
  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.registration, "full");
    assert(requiresAdvanceRegistration(event));
    assert.match(event.attendanceNote, /Sold out.*waitlist/);
  }
});

test("real newsletter ingestion and cached copy retain sold-out sessions and one canonical morning identity", async () => {
  const events = fetchInboundEvents({ events: newsletters, today: "2026-11-07" }).map(applyVerifiedEventFacts);
  await resolveEventBlurbs(events, { enabled: false });
  const kept = deduplicateEventUrls(events);
  assert.equal(kept.length, 2, "overview and exact morning ticket are one occurrence; afternoon remains separate");
  assert.deepEqual(kept.map(event => event.url), [morning.url, afternoon.url]);
  for (const event of events) {
    assert.equal(event.registration, "full");
    assert.equal(event.cost, "paid");
    assert.equal(event.endTime, null, "the old extracted finish is not confirmed on the current occurrence");
    assert.equal(event.venue, "Creekside Studio at Montalvo Arts Center");
    assert.match(event.address, /95071$/);
    assert.equal(classifyAudienceAge(event), "adult");
    assert.match(event.blurb, /sold out.*waitlist/);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("availability repairs are bounded to the exact dated production and retain later closed states", () => {
  const [event] = fetchInboundEvents({ events: newsletters, today: "2026-11-07" });
  for (const other of [
    { ...event, date: "2027-11-15" },
    { ...event, url: "https://my.montalvoarts.org/3280/3281" },
    { ...event, url: "https://example.com/3275/3276" },
    { ...event, url: "https://my.montalvoarts.org/overview/3275?promo=", time: "6:00 PM" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  assert.equal(applyVerifiedEventFacts({ ...event, registration: "closed" }).registration, "closed");
});
