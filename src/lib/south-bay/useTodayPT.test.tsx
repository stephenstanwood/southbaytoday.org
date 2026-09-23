import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { calendarDaysAgo, todayPT, useTodayPT } from "./useTodayPT";

function Probe({ buildDayPt }: { buildDayPt: string }) {
  return <span>{useTodayPT(buildDayPt)}</span>;
}

test("static markup carries the build's day, not the clock", () => {
  // A day the clock can't be on, so a clock read would show up here.
  assert.equal(renderToStaticMarkup(<Probe buildDayPt="2001-02-03" />), "<span>2001-02-03</span>");
});

test("calendarDaysAgo counts whole days between two calendar dates", () => {
  assert.equal(calendarDaysAgo("2026-08-26", "2026-08-28"), 2);
  assert.equal(calendarDaysAgo("2026-08-28", "2026-08-28"), 0);
  assert.equal(calendarDaysAgo("2026-08-29", "2026-08-28"), -1);
  // Across a DST change (Nov 1) and a month end.
  assert.equal(calendarDaysAgo("2026-10-31", "2026-11-02"), 2);
});

test("today follows Pacific time across a UTC date boundary", () => {
  assert.equal(todayPT(new Date("2026-09-24T06:30:00Z")), "2026-09-23");
  assert.equal(todayPT(new Date("2026-09-24T07:30:00Z")), "2026-09-24");
});
