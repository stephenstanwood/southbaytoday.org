// Tests for fuzzyDedupEvents — the fallback cross-source near-duplicate pass.
// This is load-bearing across 20+ event sources and had zero coverage; these
// pin the merge rules (subset/jaccard title match AND time-or-venue proximity),
// the sports skip, numeric-token distinction, and richness-based keep.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fuzzyDedupEvents } from "./eventFuzzyDedup.mjs";

let _id = 0;
const ev = (over = {}) => ({
  id: over.id ?? `e${_id++}`,
  date: "2026-06-01",
  city: "san-jose",
  title: "Untitled",
  time: null,
  venue: null,
  category: "community",
  ...over,
});

test("collapses subset-title duplicates that share a venue, keeping the richer", () => {
  const events = [
    ev({ id: "bare", title: "Big Truck Day", venue: "City Park" }),
    ev({ id: "rich", title: "LGPNS Big Truck Day", venue: "City Park", description: "A".repeat(300), url: "https://x" }),
  ];
  const { kept, droppedCount } = fuzzyDedupEvents(events);
  assert.equal(droppedCount, 1);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "rich");
});

test("keeps events on different dates", () => {
  const events = [
    ev({ title: "Big Truck Day", venue: "City Park", date: "2026-06-01" }),
    ev({ title: "Big Truck Day", venue: "City Park", date: "2026-06-02" }),
  ];
  assert.equal(fuzzyDedupEvents(events).droppedCount, 0);
});

test("keeps events in different cities", () => {
  const events = [
    ev({ title: "Big Truck Day", venue: "City Park", city: "san-jose" }),
    ev({ title: "Big Truck Day", venue: "City Park", city: "campbell" }),
  ];
  assert.equal(fuzzyDedupEvents(events).droppedCount, 0);
});

test("title match alone is not enough — needs time OR venue proximity", () => {
  const events = [
    ev({ title: "Big Truck Day", venue: "City Park" }),
    ev({ title: "LGPNS Big Truck Day", venue: "Downtown Library Plaza" }), // no shared venue tokens, no times
  ];
  assert.equal(fuzzyDedupEvents(events).droppedCount, 0);
});

test("collapses when start times are within 30 minutes", () => {
  const events = [
    ev({ id: "a", title: "Jazz Jam Ft. Trio", venue: "Break Room", time: "7:00 PM" }),
    ev({ id: "b", title: "SJZ Break Room Jazz Jam Ft. Trio", venue: "Hedley Club", time: "7:15 PM", url: "https://x" }),
  ];
  const { droppedCount } = fuzzyDedupEvents(events);
  assert.equal(droppedCount, 1);
});

test("does not collapse when times differ by more than 30 minutes", () => {
  const events = [
    ev({ title: "Jazz Jam", venue: "Break Room", time: "7:00 PM" }),
    ev({ title: "SJZ Jazz Jam", venue: "Hedley Club", time: "9:00 PM" }),
  ];
  assert.equal(fuzzyDedupEvents(events).droppedCount, 0);
});

test("skips sports events (deduped upstream)", () => {
  const events = [
    ev({ category: "sports", title: "Sharks vs Kings", venue: "SAP Center", time: "7:00 PM" }),
    ev({ category: "sports", title: "Sharks vs Kings", venue: "SAP Center", time: "7:00 PM" }),
  ];
  assert.equal(fuzzyDedupEvents(events).droppedCount, 0);
});

test("numeric tokens prevent merging distinct grade/age bands", () => {
  const events = [
    ev({ title: "Chess Club Grades 1 5", venue: "Library", time: "4:00 PM" }),
    ev({ title: "Chess Club Grades 6 8", venue: "Library", time: "4:00 PM" }),
  ];
  assert.equal(fuzzyDedupEvents(events).droppedCount, 0);
});

test("collapses exact (title,url) duplicates even when same-source times differ >30min and venues match", () => {
  // Two ingest paths for the same organizer feed (SJMA's direct scraper +
  // the Playwright mirror) can disagree on time — one resolves a real
  // detail-page time, the other defaults to noon — while sharing source,
  // venue, and canonical URL. D51.
  const events = [
    ev({
      id: "sjma-rich", title: "First Fridays: August 2026", venue: "San Jose Museum of Art",
      source: "San Jose Museum of Art", time: "6:00 PM", endTime: "9:00 PM",
      url: "https://sjmusart.org/event/first-fridays-august-2026",
    }),
    ev({
      id: "pw-bare", title: "First Fridays: August 2026", venue: "San Jose Museum of Art",
      source: "San Jose Museum of Art", time: "12:00 PM",
      url: "https://sjmusart.org/event/first-fridays-august-2026",
    }),
  ];
  const { kept, droppedCount } = fuzzyDedupEvents(events);
  assert.equal(droppedCount, 1);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "sjma-rich");
});

test("exact (title,url) dedup requires both title and url to match", () => {
  const events = [
    ev({ id: "a", title: "First Fridays: August 2026", url: "https://sjmusart.org/event/first-fridays-august-2026", time: "6:00 PM" }),
    ev({ id: "b", title: "First Fridays: September 2026", url: "https://sjmusart.org/event/first-fridays-august-2026", time: "6:15 PM" }),
  ];
  assert.equal(fuzzyDedupEvents(events).droppedCount, 0);
});

test("handles empty and malformed input without throwing", () => {
  assert.deepEqual(fuzzyDedupEvents([]), { kept: [], droppedCount: 0 });
  const messy = [null, { id: "x" }, ev({ title: "Solo Show", venue: "Hall" })];
  const { kept, droppedCount } = fuzzyDedupEvents(messy);
  assert.equal(droppedCount, 0);
  assert.equal(kept.length, 3);
});
