#!/usr/bin/env node
// Maintain src/data/south-bay/events-retired.json outside a full event refresh.
//
//   node scripts/sync-event-slug-ledger.mjs
//       Re-prune the ledger against the current upcoming-events.json (drops
//       slugs that are live again, expires old ones). Safe to run any time.
//
//   node scripts/sync-event-slug-ledger.mjs --previous path/to/older-upcoming.json
//       Retire the future slugs that snapshot published and the current file
//       no longer does — e.g. after a copy-edit pass that re-titled events.
//
//   node scripts/sync-event-slug-ledger.mjs --replay-git 30
//       Seed/backfill from git: walk one upcoming-events.json snapshot per day
//       for the last N days, oldest first, retiring across each step. Used
//       once on 2026-09-18 so URLs Google had already indexed got covered.
//
//   --quiet   Print nothing when the ledger did not change.
//   --report  Print how the ledger resolves against the live pool (redirects
//             vs stand-alone leaves) without writing anything.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveRetired } from "../src/lib/south-bay/eventSlugLedger.mjs";
import { advanceLedger, pacificToday, readLedger } from "./lib/event-slug-ledger-io.mjs";
import { DATA_DIR, REPO_ROOT } from "./lib/paths.mjs";

const EVENTS_PATH = join(DATA_DIR, "upcoming-events.json");
const ARCHIVE_PATH = join(DATA_DIR, "events-archive.json");
const REL_EVENTS = "src/data/south-bay/upcoming-events.json";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const current = readJson(EVENTS_PATH);
const todayPt = pacificToday();

if (flag("--report")) {
  const archive = readJson(ARCHIVE_PATH);
  const { redirects, orphans } = resolveRetired(readLedger(), current.events, archive.events, todayPt);
  console.log(`retired slugs: ${redirects.size} redirect, ${orphans.length} stand-alone`);
  for (const [from, to] of redirects) console.log(`  301 /event/${from} → /event/${to}`);
  for (const { slug, event } of orphans) console.log(`  leaf /event/${slug} (${event.source ?? "?"})`);
  process.exit(0);
}

const replayDays = Number(flag("--replay-git"));
if (Number.isFinite(replayDays) && replayDays > 0) {
  // One commit per calendar day (the last of that day), oldest first.
  const log = execFileSync(
    "git",
    ["log", `--since=${replayDays} days ago`, "--format=%H %cs", "--", REL_EVENTS],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  const byDay = new Map();
  for (const line of log.trim().split("\n").filter(Boolean)) {
    const [sha, day] = line.split(" ");
    if (!byDay.has(day)) byDay.set(day, sha); // log is newest-first; first hit = last commit of the day
  }
  const steps = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  let previous = null;
  let totalAdded = 0;
  for (const [day, sha] of steps) {
    const snapshot = JSON.parse(execFileSync("git", ["show", `${sha}:${REL_EVENTS}`], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
    if (previous) {
      const { added } = advanceLedger({ previousEvents: previous.events, currentEvents: snapshot.events, todayPt, now: `${day}T12:00:00.000Z` });
      totalAdded += added;
    }
    previous = snapshot;
  }
  const { added, ledger } = advanceLedger({ previousEvents: previous?.events ?? [], currentEvents: current.events, todayPt });
  console.log(`replayed ${steps.length} daily snapshots: ${totalAdded + added} retired, ${ledger.count} held after pruning`);
  process.exit(0);
}

const previousPath = flag("--previous");
const previous = typeof previousPath === "string" ? readJson(previousPath) : { events: [] };
const { added, removed, ledger, changed } = advanceLedger({ previousEvents: previous.events, currentEvents: current.events, todayPt });
// --quiet: print only when the ledger moved (the pre-commit hook echoes stdout).
if (changed || !flag("--quiet")) console.log(`retired slugs: +${added} retired, -${removed} back or expired, ${ledger.count} held`);
