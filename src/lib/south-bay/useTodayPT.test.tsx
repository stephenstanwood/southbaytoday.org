import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { todayPT, useClockValue, useTodayPT } from "./useTodayPT";

function Probe({ buildDayPt }: { buildDayPt: string }) {
  return <span>{useTodayPT(buildDayPt)}</span>;
}

function ClockProbe({ buildTimeMs }: { buildTimeMs: number }) {
  return <span>{useClockValue((now) => new Date(now).toISOString(), buildTimeMs)}</span>;
}

test("static markup carries the build's day, not the clock", () => {
  // A day the clock can't be on, so a clock read would show up here.
  assert.equal(renderToStaticMarkup(<Probe buildDayPt="2001-02-03" />), "<span>2001-02-03</span>");
});

test("static markup reads the build's moment, not the clock", () => {
  assert.equal(
    renderToStaticMarkup(<ClockProbe buildTimeMs={Date.UTC(2001, 1, 3, 4, 5)} />),
    "<span>2001-02-03T04:05:00.000Z</span>",
  );
});

test("today follows Pacific time across a UTC date boundary", () => {
  assert.equal(todayPT(new Date("2026-09-24T06:30:00Z")), "2026-09-23");
  assert.equal(todayPT(new Date("2026-09-24T07:30:00Z")), "2026-09-24");
});
