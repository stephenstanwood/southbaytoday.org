import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatTodayLabel } from "./formatTodayLabel";
import { useLiveTodayLabel } from "./useLiveTodayLabel";

function Probe() {
  return <span>{useLiveTodayLabel()}</span>;
}

test("static masthead markup never freezes the build date", () => {
  assert.equal(renderToStaticMarkup(<Probe />), "<span>Today</span>");
});

test("the hydrated label follows Pacific time across a UTC date boundary", () => {
  assert.equal(formatTodayLabel(new Date("2026-07-21T06:30:00Z")), "Monday, July 20, 2026");
  assert.equal(formatTodayLabel(new Date("2026-07-21T07:30:00Z")), "Tuesday, July 21, 2026");
});
