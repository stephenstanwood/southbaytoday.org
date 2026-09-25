import assert from "node:assert/strict";
import { test } from "node:test";

import { archiveKey, mergeArchive } from "./event-archive.mjs";

const ev = (id, date, title = "Show") => ({ id, date, title });

test("a run whose date advances each night keeps one row per performance", () => {
  let archive = [];
  archive = mergeArchive(archive, [ev("run", "2026-09-12")], "2026-09-13", "2026-06-15").kept;
  archive = mergeArchive(archive, [ev("run", "2026-09-13")], "2026-09-14", "2026-06-15").kept;
  assert.deepEqual(archive.map((e) => e.date), ["2026-09-12", "2026-09-13"]);
});

test("today's events the refresh dropped are archived; still-listed ones are not", () => {
  const previous = [ev("a", "2026-09-24"), ev("b", "2026-09-24"), ev("c", "2026-09-30")];
  const current = [ev("b", "2026-09-24"), ev("c", "2026-09-30")];
  const { kept } = mergeArchive([], previous, "2026-09-24", "2026-06-26", { currentEvents: current });
  assert.deepEqual(kept.map(archiveKey), ["a|2026-09-24"]);
});

test("without currentEvents only past-dated events age in", () => {
  const { kept } = mergeArchive([], [ev("a", "2026-09-23"), ev("b", "2026-09-24")], "2026-09-24", "2026-06-26");
  assert.deepEqual(kept.map(archiveKey), ["a|2026-09-23"]);
});

test("rows older than the cutoff expire; preferExisting keeps the stored row", () => {
  const stored = [{ ...ev("a", "2026-09-01"), title: "Edited" }, ev("old", "2026-06-01")];
  const { kept } = mergeArchive(stored, [ev("a", "2026-09-01", "Original")], "2026-09-24", "2026-06-26", { preferExisting: true });
  assert.deepEqual(kept.map((e) => e.title), ["Edited"]);
});
