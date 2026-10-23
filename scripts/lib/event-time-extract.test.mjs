import assert from "node:assert/strict";
import test from "node:test";

import { extractTimeFromHtml, isEventTimeBackfillCandidate, parseIcalDate } from "../generate-events.mjs";
import { displayTime, isoDate } from "./dates.mjs";

const page = (body) => `<html><body>${body}</body></html>`;

test("venue overviews and calendars cannot supply another event's cached start", () => {
  for (const url of [
    "https://live.stanford.edu/your-visit/venues/frost-amphitheater/",
    "https://example.org/venues/main-hall?date=2026-10-18",
    "https://example.org/events/?category=music",
    "https://example.org/",
  ]) assert.equal(isEventTimeBackfillCandidate({ url }), false);
  const event = { url: "https://live.stanford.edu/events/26-frost/muna/" };
  assert.equal(isEventTimeBackfillCandidate(event), true);
  assert.equal(isEventTimeBackfillCandidate({ ...event, time: "7:00 PM" }), false);
  assert.equal(isEventTimeBackfillCandidate({ ...event, ongoing: true }), false);
});

test("JSON-LD start time wins over anything in the body copy", () => {
  const html = page(`
    <script type="application/ld+json">
      {"@type":"Event","name":"Recital","startDate":"2026-09-17T19:30:00-07:00"}
    </script>
    <p>City Hall hours: Open 9 am-12 pm</p>
  `);
  assert.equal(extractTimeFromHtml(html, "2026-09-17"), "7:30 PM");
});

test("structured event instants use the occurrence's Pacific clock and calendar date", () => {
  // Stanford's Nov 1 Notre Dame ticket page prints 1 PM; its JSON-LD is UTC.
  // NC State's Oct 29 evening match has an Oct 30 UTC date.
  for (const [start, date, expected] of [
    ["2026-11-01T21:00:00.000Z", "2026-11-01", "1:00 PM"],
    ["2026-10-30T02:00:00.000Z", "2026-10-29", "7:00 PM"],
    ["2026-10-30T02:00:00.000Z", "2026-10-30", null],
    ["2026-10-29T19:00:00-07:00", "2026-10-29", "7:00 PM"],
    ["2026-11-01T13:00:00-0800", "2026-11-01", "1:00 PM"],
    ["2026-11-01T13:00:00", "2026-11-01", "1:00 PM"],
    ["2026-11-01", "2026-11-01", null],
  ]) {
    for (const markup of [
      `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", startDate: start })}</script>`,
      `<time datetime="${start}"></time>`,
      `<meta property="event:start_time" content="${start}">`,
    ]) assert.equal(extractTimeFromHtml(page(markup), date), expected, markup);
  }
});

test("city hall footer hours do not become an event start time", () => {
  // The real shape of Monte Sereno's CivicPlus page, which turned an eight-week
  // police academy into a 9:00 AM event.
  const html = page(`
    <h1>Community Police Academy</h1>
    <p>The Los Gatos-Monte Sereno Police Department is proud to offer a
       Community Police Academy to residents and businesses.</p>
    <footer>Monte Sereno, CA 95030 Phone: (408) 354-7635
      Monday, Wednesday, Friday: Open 9 am-12 pm; Closed for lunch 12 pm-1 pm;
      Open 1 pm-4 pm</footer>
  `);
  assert.equal(extractTimeFromHtml(html, "2026-09-17"), null);
});

test("a real doors time still comes through", () => {
  const html = page("<p>Doors open at 7 PM, music at 8.</p>");
  assert.equal(extractTimeFromHtml(html, "2026-09-17"), "7:00 PM");
});

test("performance starts outrank parking, box office, and gates opening times", () => {
  const html = page("<p>Parking opens at 4:00 PM</p><p>Gates open at 5:00 PM</p><p>Event starts at 6:00 PM</p>");
  assert.equal(extractTimeFromHtml(html, "2026-10-10"), "6:00 PM");
  assert.equal(extractTimeFromHtml(page("<p>Box office opens at 3 PM. Doors open at 7 PM. Show at 8 PM.</p>")), "8:00 PM");
  assert.equal(extractTimeFromHtml(page("<p>Parking opens at 4:00 PM</p>")), null);
  assert.equal(extractTimeFromHtml(page("<p>Box office opens at 3 PM</p>")), null);
});

test("an hours block is skipped in favor of the event time further down", () => {
  const html = page(`
    <p>Gallery hours: 10 am-5 pm daily.</p>
    <p>The lecture begins at 6:30 pm in the courtyard.</p>
  `);
  assert.equal(extractTimeFromHtml(html, "2026-09-17"), "6:30 PM");
});

test("a page with nothing but opening hours yields no time", () => {
  const html = page("<p>Front counter hours: 10 am-12 pm. Walk-ins welcome.</p>");
  assert.equal(extractTimeFromHtml(html, "2026-09-17"), null);
});

test("abbreviated ranges use their opening time rather than their closing time", () => {
  for (const [copy, expected] of [
    ["OCTOBER 31: 2 - 10 PM", "2:00 PM"],
    ["Program: 2–10:30 PM", "2:00 PM"],
    ["Program: 12–4 PM", "12:00 PM"],
    ["Program: 7:15—10 PM", "7:15 PM"],
    ["Program: 2 PM–10:30 PM", "2:00 PM"],
    ["Program: 10–2 PM", null],
    ["Program: 25–30 PM", null],
    ["Gallery hours: 2–10 PM daily.", null],
  ]) assert.equal(extractTimeFromHtml(page(`<p>${copy}</p>`), "2026-10-31"), expected, copy);
});

test("date-only iCal values stay on their Pacific calendar date in winter", () => {
  const date = parseIcalDate("20261104");
  assert.equal(isoDate(date), "2026-11-04");
  assert.equal(displayTime(date), null);
});

test("timed iCal values use the event date's Pacific offset and retain seconds", () => {
  for (const [raw, expected] of [
    ["20261021T173015", "2026-10-22T00:30:15.000Z"],
    ["20261127T173000", "2026-11-28T01:30:00.000Z"],
    ["20261114T090000", "2026-11-14T17:00:00.000Z"],
    ["20261212T090000", "2026-12-12T17:00:00.000Z"],
    ["20261101T013000", "2026-11-01T08:30:00.000Z"],
    ["20261101T023000", "2026-11-01T10:30:00.000Z"],
    ["20260308T090000", "2026-03-08T16:00:00.000Z"],
  ]) assert.equal(parseIcalDate(raw).toISOString(), expected);
  assert.equal(parseIcalDate("20260308T023000"), null, "the spring-forward gap is not an invented time");
});

test("UTC iCal values remain instants instead of being relabeled Pacific", () => {
  const winter = parseIcalDate("20261128T013015Z");
  assert.equal(winter.toISOString(), "2026-11-28T01:30:15.000Z");
  assert.equal(isoDate(winter), "2026-11-27");
  assert.equal(displayTime(winter), "5:30 PM");
  assert.equal(parseIcalDate("20261022T003000Z").toISOString(), "2026-10-22T00:30:00.000Z");
});
