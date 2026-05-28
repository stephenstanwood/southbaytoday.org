// Tests for the newsletter's pure date helpers. The npm "test" script (and
// `npm run check`) referenced this file before it existed, which aborted the
// whole suite. These cover the PT-safe date formatting that the newsletter's
// "today" selection and long-date headers depend on — the timezone-drift bug
// class this project keeps hitting.

import { test } from "node:test";
import assert from "node:assert/strict";

import { formatLongDate, todayPT } from "./lib.mjs";

test("todayPT returns a YYYY-MM-DD string", () => {
  const t = todayPT();
  assert.match(t, /^\d{4}-\d{2}-\d{2}$/);
  // Should agree with an independent PT formatting of "now".
  const expected = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  assert.equal(t, expected);
});

test("formatLongDate renders a full weekday/month/day/year string", () => {
  assert.match(formatLongDate("2026-05-06"), /^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}$/);
  assert.ok(formatLongDate("2026-05-06").includes("May 6, 2026"));
});

test("formatLongDate does NOT drift across the year boundary (PT, not UTC)", () => {
  // The whole reason the helper pins noon-UTC + PT: a naive new Date('2026-01-01')
  // formatted in PT would render as Dec 31, 2025. Lock the correct behavior.
  assert.ok(formatLongDate("2026-01-01").includes("January 1, 2026"));
  assert.ok(!formatLongDate("2026-01-01").includes("2025"));
});
