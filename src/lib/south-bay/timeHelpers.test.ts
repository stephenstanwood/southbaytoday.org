import assert from "node:assert/strict";
import test from "node:test";

import { addDaysIso, hasNotStarted, ptMinutesNow, weekendIsosFrom } from "./timeHelpers";

test("hasNotStarted checks against the minute it's given", () => {
  assert.equal(hasNotStarted("9:00 AM", 8 * 60 + 59), true);
  assert.equal(hasNotStarted("9:00 AM", 9 * 60), false);
  assert.equal(hasNotStarted("7:30 PM", 20 * 60), false);
  assert.equal(hasNotStarted("7:30 PM", 9 * 60), true);
  // No usable start time never counts as started.
  assert.equal(hasNotStarted(null, 23 * 60), true);
  assert.equal(hasNotStarted("TBA", 23 * 60), true);
});

test("ptMinutesNow reads the Pacific clock across a UTC date boundary", () => {
  assert.equal(ptMinutesNow(new Date("2026-09-24T16:00:00Z")), 9 * 60); // 9:00 AM PDT, Sep 24
  assert.equal(ptMinutesNow(new Date("2026-09-24T06:59:00Z")), 23 * 60 + 59); // 11:59 PM PDT, Sep 23
  assert.equal(ptMinutesNow(new Date("2026-12-01T08:05:00Z")), 5); // 12:05 AM PST
});

test("addDaysIso crosses month, year, and DST boundaries", () => {
  assert.equal(addDaysIso("2026-09-23", 1), "2026-09-24");
  assert.equal(addDaysIso("2026-09-30", 1), "2026-10-01");
  assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysIso("2026-03-07", 1), "2026-03-08"); // DST starts Mar 8
  assert.equal(addDaysIso("2026-10-31", 1), "2026-11-01"); // DST ends Nov 1
  assert.equal(addDaysIso("2026-11-01", 6), "2026-11-07");
});

test("weekendIsosFrom: this weekend from today on", () => {
  assert.deepEqual(weekendIsosFrom("2026-09-21"), ["2026-09-26", "2026-09-27"]); // Mon
  assert.deepEqual(weekendIsosFrom("2026-09-23"), ["2026-09-26", "2026-09-27"]); // Wed
  assert.deepEqual(weekendIsosFrom("2026-09-25"), ["2026-09-26", "2026-09-27"]); // Fri
  assert.deepEqual(weekendIsosFrom("2026-09-26"), ["2026-09-26", "2026-09-27"]); // Sat
  // Sunday: Saturday is over, and next Saturday is next weekend.
  assert.deepEqual(weekendIsosFrom("2026-09-27"), ["2026-09-27"]);
  assert.deepEqual(weekendIsosFrom("2026-10-30"), ["2026-10-31", "2026-11-01"]); // across the DST change
});
