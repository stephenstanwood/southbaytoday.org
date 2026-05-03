// Test harness for the Google Calendar URL builder.
// Run: node --import tsx --test src/lib/south-bay/calendarLink.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildGoogleCalendarUrl, parseClockTime, compactDate } from "./calendarLink.ts";

test("parseClockTime: AM/PM variants", () => {
  assert.deepEqual(parseClockTime("8:00 PM"), { h: 20, m: 0 });
  assert.deepEqual(parseClockTime("12:00 AM"), { h: 0, m: 0 });
  assert.deepEqual(parseClockTime("12:00 PM"), { h: 12, m: 0 });
  assert.deepEqual(parseClockTime("10:30 AM"), { h: 10, m: 30 });
  assert.deepEqual(parseClockTime("9PM"), { h: 21, m: 0 });
});

test("parseClockTime: invalid inputs", () => {
  assert.equal(parseClockTime(null), null);
  assert.equal(parseClockTime(""), null);
  assert.equal(parseClockTime("TBD"), null);
  assert.equal(parseClockTime("noon"), null);
});

test("compactDate: ISO → YYYYMMDD", () => {
  assert.equal(compactDate("2026-05-03"), "20260503");
  assert.equal(compactDate("2026-12-31"), "20261231");
  assert.equal(compactDate("bad"), null);
});

test("buildGoogleCalendarUrl: timed event with end", () => {
  const url = buildGoogleCalendarUrl({
    title: "Jazz Night",
    date: "2026-05-03",
    time: "8:00 PM",
    endTime: "10:00 PM",
    venue: "Cafe Stritch",
    city: "san-jose",
  });
  assert.ok(url);
  const params = new URL(url!).searchParams;
  assert.equal(params.get("action"), "TEMPLATE");
  assert.equal(params.get("text"), "Jazz Night");
  assert.equal(params.get("dates"), "20260503T200000/20260503T220000");
  assert.equal(params.get("ctz"), "America/Los_Angeles");
  // venue + city (no address) → both joined for cleaner Maps lookup
  assert.equal(params.get("location"), "Cafe Stritch, San Jose");
});

test("buildGoogleCalendarUrl: timed event without end → +1h default", () => {
  const url = buildGoogleCalendarUrl({
    title: "Story Time",
    date: "2026-05-04",
    time: "10:30 AM",
  });
  const params = new URL(url!).searchParams;
  assert.equal(params.get("dates"), "20260504T103000/20260504T113000");
});

test("buildGoogleCalendarUrl: ongoing → all-day with exclusive end", () => {
  const url = buildGoogleCalendarUrl({
    title: "CHM Exhibit",
    date: "2026-05-03",
    ongoing: true,
    venue: "Computer History Museum",
    city: "mountain-view",
  });
  const params = new URL(url!).searchParams;
  assert.equal(params.get("dates"), "20260503/20260504");
});

test("buildGoogleCalendarUrl: no time → all-day", () => {
  const url = buildGoogleCalendarUrl({
    title: "Some Event",
    date: "2026-05-03",
    time: null,
  });
  const params = new URL(url!).searchParams;
  assert.equal(params.get("dates"), "20260503/20260504");
});

test("buildGoogleCalendarUrl: includes blurb + URL in details", () => {
  const url = buildGoogleCalendarUrl({
    title: "Author Talk",
    date: "2026-05-03",
    time: "7:00 PM",
    blurb: "An evening conversation with the author.",
    url: "https://example.com/event",
  });
  const params = new URL(url!).searchParams;
  const details = params.get("details") ?? "";
  assert.ok(details.includes("An evening conversation"));
  assert.ok(details.includes("https://example.com/event"));
});

test("buildGoogleCalendarUrl: location prefers venue+address", () => {
  const url = buildGoogleCalendarUrl({
    title: "X",
    date: "2026-05-03",
    venue: "Public Library",
    address: "123 Main St",
    city: "campbell",
  });
  const params = new URL(url!).searchParams;
  assert.equal(params.get("location"), "Public Library, 123 Main St");
});

test("buildGoogleCalendarUrl: falls back to city when no venue/address", () => {
  const url = buildGoogleCalendarUrl({
    title: "X",
    date: "2026-05-03",
    city: "san-jose",
  });
  const params = new URL(url!).searchParams;
  assert.equal(params.get("location"), "San Jose");
});

test("buildGoogleCalendarUrl: returns null on bad date", () => {
  const url = buildGoogleCalendarUrl({
    title: "X",
    date: "not-a-date",
  });
  assert.equal(url, null);
});

test("buildGoogleCalendarUrl: endTime <= startTime falls back to +1h", () => {
  const url = buildGoogleCalendarUrl({
    title: "Glitch",
    date: "2026-05-03",
    time: "8:00 PM",
    endTime: "7:00 PM",
  });
  const params = new URL(url!).searchParams;
  assert.equal(params.get("dates"), "20260503T200000/20260503T210000");
});
