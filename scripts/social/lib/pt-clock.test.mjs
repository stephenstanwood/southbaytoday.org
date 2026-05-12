// ---------------------------------------------------------------------------
// pt-clock.test.mjs
//
// Validates the PT-zoned clock helpers across the UTC-rollover boundary.
// These tests must pass regardless of the system timezone where the test
// runner happens to live — the whole point of pt-clock.mjs is to remove the
// system-TZ dependency.
//
// Run: node --test scripts/social/lib/pt-clock.test.mjs
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { ptDateString, ptHour, ptDayOfWeek, ptClockString } from "./pt-clock.mjs";

// ── ptDateString ─────────────────────────────────────────────────────────

test("ptDateString: PT evening during PDT (after UTC rollover) returns PT date, not UTC", () => {
  // 2026-05-11 19:00 PT = 2026-05-12 02:00 UTC — the failure-mode case that
  // hit on 2026-05-11. UTC date is May 12; PT date is still May 11.
  const d = new Date("2026-05-11T19:00:00-07:00");
  assert.equal(ptDateString(d), "2026-05-11");
  // Sanity: the UTC representation IS the next day, confirming we're
  // dodging the trap the legacy code fell into.
  assert.equal(d.toISOString().split("T")[0], "2026-05-12");
});

test("ptDateString: PT morning (before UTC rollover) — UTC date and PT date agree", () => {
  const d = new Date("2026-05-11T06:00:00-07:00"); // 13:00 UTC same day
  assert.equal(ptDateString(d), "2026-05-11");
});

test("ptDateString: PT midnight boundary — minute before midnight stays on prev day", () => {
  const d = new Date("2026-05-11T23:59:00-07:00"); // 06:59 UTC next day
  assert.equal(ptDateString(d), "2026-05-11");
});

test("ptDateString: PT midnight boundary — minute after midnight is the new day", () => {
  const d = new Date("2026-05-12T00:01:00-07:00"); // 07:01 UTC same day
  assert.equal(ptDateString(d), "2026-05-12");
});

test("ptDateString: PST (winter) — rollover is 4pm PT, not 5pm", () => {
  // January is PST (UTC-8). 16:30 PST = 00:30 UTC next day. UTC date is
  // ahead; PT date should still be the prior day.
  const d = new Date("2026-01-15T16:30:00-08:00");
  assert.equal(ptDateString(d), "2026-01-15");
  assert.equal(d.toISOString().split("T")[0], "2026-01-16");
});

test("ptDateString: handles arbitrary instant from a UTC clock", () => {
  // 2026-05-12T02:30:00Z is PT 2026-05-11 19:30 (PDT).
  const d = new Date("2026-05-12T02:30:00Z");
  assert.equal(ptDateString(d), "2026-05-11");
});

// ── ptHour ───────────────────────────────────────────────────────────────

test("ptHour: PDT evening", () => {
  const d = new Date("2026-05-11T19:00:00-07:00");
  assert.equal(ptHour(d), 19);
});

test("ptHour: PST afternoon", () => {
  const d = new Date("2026-01-15T16:30:00-08:00");
  assert.equal(ptHour(d), 16);
});

test("ptHour: PT midnight is 0", () => {
  const d = new Date("2026-05-11T00:00:00-07:00");
  assert.equal(ptHour(d), 0);
});

test("ptHour: PT 11pm is 23", () => {
  const d = new Date("2026-05-11T23:00:00-07:00");
  assert.equal(ptHour(d), 23);
});

// ── ptDayOfWeek ──────────────────────────────────────────────────────────

test("ptDayOfWeek: Sunday=0", () => {
  // 2026-05-10 is a Sunday.
  const d = new Date("2026-05-10T12:00:00-07:00");
  assert.equal(ptDayOfWeek(d), 0);
});

test("ptDayOfWeek: Monday=1", () => {
  const d = new Date("2026-05-11T12:00:00-07:00");
  assert.equal(ptDayOfWeek(d), 1);
});

test("ptDayOfWeek: Saturday=6", () => {
  const d = new Date("2026-05-16T12:00:00-07:00");
  assert.equal(ptDayOfWeek(d), 6);
});

test("ptDayOfWeek: late-evening PT does NOT roll into tomorrow's weekday", () => {
  // 2026-05-11 23:30 PT — Monday in PT, but UTC is already Tuesday.
  // getDay() on Date would give Tuesday (2); ptDayOfWeek must give Monday (1).
  const d = new Date("2026-05-11T23:30:00-07:00");
  assert.equal(ptDayOfWeek(d), 1);
});

// ── ptClockString ────────────────────────────────────────────────────────

test("ptClockString: PDT evening reads as 7:14 PM", () => {
  const d = new Date("2026-05-11T19:14:00-07:00");
  assert.match(ptClockString(d), /^7:14\s*PM$/);
});

test("ptClockString: noon reads as 12:00 PM (not 0:00)", () => {
  const d = new Date("2026-05-11T12:00:00-07:00");
  assert.match(ptClockString(d), /^12:00\s*PM$/);
});

// ── Cross-cutting: independence from system TZ ────────────────────────────

test("results match across explicit-offset Dates whether system is UTC or PT", () => {
  // Two ways to express "2026-05-11 19:00 PDT":
  const explicit = new Date("2026-05-11T19:00:00-07:00");
  const fromUtc = new Date("2026-05-12T02:00:00Z");
  assert.equal(ptDateString(explicit), ptDateString(fromUtc));
  assert.equal(ptHour(explicit), ptHour(fromUtc));
  assert.equal(ptDayOfWeek(explicit), ptDayOfWeek(fromUtc));
});
