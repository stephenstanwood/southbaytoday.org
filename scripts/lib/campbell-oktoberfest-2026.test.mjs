import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mergeCampbellOktoberfest } from "./campbell-oktoberfest-2026.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";

const sparse = {
  id: "inbound-db1a800a2b149cef", title: "Campbell Oktoberfest",
  date: "2026-10-17", time: "10:00 AM", endTime: null,
  url: "https://campbelloktoberfest.com", city: "campbell",
  kidFriendly: false, cost: null, photoRef: "venue-art", firstSeenAt: "2026-08-08T15:21:42.349Z",
};

test("one sparse newsletter date becomes the two published daily sessions", () => {
  const result = mergeCampbellOktoberfest([sparse], { fromDate: "2026-10-17" });
  assert.deepEqual(result.events.map(({ date, time, endTime, cost, kidFriendly }) =>
    ({ date, time, endTime, cost, kidFriendly })), [
    { date: "2026-10-17", time: "10:00 AM", endTime: "6:00 PM", cost: "free", kidFriendly: true },
    { date: "2026-10-18", time: "10:00 AM", endTime: "5:00 PM", cost: "free", kidFriendly: true },
  ]);
  assert.equal(result.events[0].id, sparse.id, "preserve Saturday's existing identity");
  assert.equal(result.events[0].firstSeenAt, sparse.firstSeenAt);
  assert.equal(result.events[1].firstSeenAt, undefined, "Sunday is newly observed");
  for (const event of result.events) {
    assert.equal(event.photoRef, "venue-art");
    assert.equal(event.occurrenceEvidence.date, event.date);
    assert.equal(event.occurrenceEvidence.sourceUrl, event.url);
  }
});

test("refresh is idempotent, replaces duplicate festival rows, and preserves social meetups", () => {
  const meetup = { ...sparse, id: "social", title: "Young Professional Social Mixer Festival Visit @ Oktoberfest, Campbell", url: "https://www.meetup.com/group/events/123" };
  const first = mergeCampbellOktoberfest([sparse, { ...sparse, id: "duplicate" }, meetup]).events;
  assert.equal(first.length, 3);
  assert.equal(first[0], meetup);
  assert.deepEqual(mergeCampbellOktoberfest(first).events, first);
});

test("Sunday survives after the newsletter's Saturday row expires; later years are never projected", () => {
  const sunday = mergeCampbellOktoberfest([], { fromDate: "2026-10-18" }).events;
  assert.equal(sunday.length, 1);
  assert.equal(sunday[0].date, "2026-10-18");
  assert.equal(sunday[0].endTime, "5:00 PM");
  assert.deepEqual(mergeCampbellOktoberfest([], { fromDate: "2026-10-19" }).events, []);
  assert.deepEqual(mergeCampbellOktoberfest([], { fromDate: "2027-10-17" }).events, []);
  const nextYear = { ...sparse, date: "2027-10-17" };
  assert.deepEqual(mergeCampbellOktoberfest([nextYear], { fromDate: "2027-10-17" }).events, [nextYear]);
});

test("publication and audience filters retain both family sessions and the independent meetup", () => {
  const meetup = {
    id: "social", date: "2026-10-17", time: "2:15 PM", city: "campbell",
    title: "Young Professional Social Mixer Festival Visit @ Oktoberfest, Campbell",
    venue: "Starbucks Coffee Company", url: "https://www.meetup.com/group/events/123",
  };
  const { events, canonicalEvents } = mergeCampbellOktoberfest([sparse, meetup]);
  const published = fuzzyDedupEvents(events.filter(isEventPublishable)).kept;
  assert.equal(published.length, 3);
  assert.ok(published.includes(meetup));
  for (const event of canonicalEvents) {
    assert.ok(published.includes(event));
    assert.equal(classifyAudienceAge(event), "all");
    assert.equal(event.kidFriendly, true);
  }
});

test("published feed retains both verified festival dates and their admission facts", () => {
  const feed = JSON.parse(readFileSync(new URL("../../src/data/south-bay/upcoming-events.json", import.meta.url)));
  const dates = feed.events.filter((event) => event.title === sparse.title && event.url === sparse.url)
    .sort((left, right) => left.date.localeCompare(right.date));
  const fromDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(feed.generatedAt));
  assert.deepEqual(dates.map((event) => [event.date, event.endTime, event.cost, event.kidFriendly]), [
    ["2026-10-17", "6:00 PM", "free", true], ["2026-10-18", "5:00 PM", "free", true],
  ].filter(([date]) => date >= fromDate));
});
