import assert from "node:assert/strict";
import test from "node:test";
import { eventPagePool } from "./eventPagePool";
import { buildEventSlugs } from "./eventSlug";

test("a morning rebuild preserves yesterday before the next refresh archives it", () => {
  const yesterday = { id: "concert", title: "Concert", date: "2026-10-01", time: "7:00 PM" };
  const current = [yesterday, { id: "today", title: "Talk", date: "2026-10-02", time: "1:00 PM" }];
  const beforeMidnight = buildEventSlugs(eventPagePool(current, [], "2026-10-01"));
  const afterMidnight = buildEventSlugs(eventPagePool(current, [], "2026-10-02"));
  assert.deepEqual([...afterMidnight.keys()], [...beforeMidnight.keys()]);
  assert.equal(afterMidnight.get("2026-10-01-concert"), yesterday);
  assert.ok(eventPagePool(current, [], "2026-10-02").some((e) => e.date === "2026-10-01"));
});

test("moving records into the archive preserves same-title sessions and their slugs", () => {
  const morning = { id: "a", title: "Storytime", date: "2026-10-01", time: "10:00 AM", venue: "Library" };
  const afternoon = { ...morning, id: "b", time: "2:00 PM" };
  const before = eventPagePool([afternoon, morning], [], "2026-10-02");
  const during = eventPagePool([morning], [morning, afternoon], "2026-10-02");
  const after = eventPagePool([], [morning, afternoon], "2026-10-02");
  for (const pool of [before, during, after]) {
    const slugs = buildEventSlugs(pool);
    assert.equal(slugs.size, 2);
    assert.equal(slugs.get("2026-10-01-storytime")?.time, "10:00 AM");
    assert.equal(slugs.get("2026-10-01-storytime-2")?.time, "2:00 PM");
  }
});

test("current facts win over an archived copy without losing repeated series dates", () => {
  const row = { id: "series", title: "Open Mic", date: "2026-10-01", time: "7:00 PM" };
  const updated = { ...row, time: "8:00 PM" };
  const earlier = { ...row, date: "2026-09-24" };
  assert.deepEqual(eventPagePool([updated], [row, earlier], "2026-10-02"), [updated, earlier]);
});

test("only timed public pages within the 90-day archive window are eligible", () => {
  const row = { title: "Concert", date: "2026-10-02", time: "7:00 PM" };
  assert.deepEqual(eventPagePool([
    { ...row, date: "2026-07-04" },
    { ...row, date: "2026-07-03" },
    { ...row, date: "not-a-date" },
    { ...row, title: "" },
    { ...row, time: null },
  ], [row], "2026-10-02"), [{ ...row, date: "2026-07-04" }]);
});
