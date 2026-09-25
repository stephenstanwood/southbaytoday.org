#!/usr/bin/env node
// Rebuild events-archive.json's full window from git history.
//
//   node scripts/backfill-event-archive.mjs [--days 90]
//
// Walks every committed upcoming-events.json snapshot in the window, oldest
// first. An event still listed when its date arrived happened, so it belongs
// in the archive — including the ones the evening refresh dropped
// once they started, which the nightly step missed until 2026-09-25. Rows
// already in the archive win, so the backfill never undoes a later copy edit
// or fact check. Used on 2026-09-25: the archive only reached back to Aug 15
// and held under half of each day's events, and URLs Google still held for
// them were 404ing.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARCHIVE_DAYS, archiveKey, mergeArchive } from "./lib/event-archive.mjs";
import { writeFileAtomic } from "./lib/io.mjs";
import { pacificToday } from "./lib/event-slug-ledger-io.mjs";
import { shiftDate } from "../src/lib/south-bay/eventSlugLedger.mjs";
import { DATA_DIR, REPO_ROOT } from "./lib/paths.mjs";

const REL_EVENTS = "src/data/south-bay/upcoming-events.json";
const ARCHIVE_PATH = join(DATA_DIR, "events-archive.json");
const i = process.argv.indexOf("--days");
const days = i === -1 ? ARCHIVE_DAYS : Number(process.argv[i + 1]);

const todayPt = pacificToday();
const cutoffPt = shiftDate(todayPt, -ARCHIVE_DAYS);
const log = execFileSync(
  "git",
  ["log", `--since=${days + 1} days ago`, "--format=%H %ct", "--", REL_EVENTS],
  { cwd: REPO_ROOT, encoding: "utf8" },
);
const commits = log.trim().split("\n").filter(Boolean).map((line) => {
  const [sha, ct] = line.split(" ");
  return { sha, day: pacificToday(new Date(Number(ct) * 1000)) };
}).reverse();

const archive = JSON.parse(readFileSync(ARCHIVE_PATH, "utf8"));
const existing = new Set((archive.events ?? []).map(archiveKey));
const replayed = new Map();
commits.forEach(({ sha }, i) => {
  // Listed up to the day of the next snapshot: it passed while this file was
  // live (the history has multi-day gaps, e.g. Jul 29 – Aug 2).
  const through = commits[i + 1]?.day ?? todayPt;
  const snapshot = JSON.parse(execFileSync("git", ["show", `${sha}:${REL_EVENTS}`], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  for (const e of snapshot.events ?? []) {
    if (typeof e?.date !== "string" || e.date > through) continue;
    const key = archiveKey(e);
    if (!existing.has(key)) replayed.set(key, e); // later snapshots win
  }
});
const before = (archive.events ?? []).length;
const events = mergeArchive(archive.events, [...replayed.values()], todayPt, cutoffPt, { preferExisting: true }).kept
  .filter((e) => e.date < todayPt);

writeFileAtomic(ARCHIVE_PATH, `${JSON.stringify({ updatedAt: archive.updatedAt ?? new Date().toISOString(), eventCount: events.length, events }, null, 2)}\n`);
console.log(`replayed ${commits.length} snapshots: archive ${before} → ${events.length} events, ${events[0]?.date ?? "-"} … ${events.at(-1)?.date ?? "-"}`);
