#!/usr/bin/env node
// One-time sweep: find blurbs in event-blurb-cache.json that are identical
// across DIFFERENT venues (Sonnet boilerplate collisions — e.g. every
// farmers market got "Shop for local produce, artisan goods, and
// ready-to-eat food weekly.") and regenerate each with a uniqueness nudge.
//
// Usage:
//   node scripts/dedupe-event-blurb-cache.mjs --dry     # report clusters only
//   node scripts/dedupe-event-blurb-cache.mjs           # regenerate + write cache
//
// Reads ANTHROPIC_API_KEY from .env.local (auto-loaded below) or the
// ambient env.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Auto-load .env.local — same pattern as generate-events.mjs.
const envLocalPath = join(REPO_ROOT, ".env.local");
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const { regenerateDuplicateCacheEntries } = await import("../src/lib/south-bay/eventBlurbs.mjs");

const dryRun = process.argv.includes("--dry");

const upcomingPath = join(REPO_ROOT, "src", "data", "south-bay", "upcoming-events.json");
const archivePath = join(REPO_ROOT, "src", "data", "south-bay", "events-archive.json");

const upcoming = JSON.parse(readFileSync(upcomingPath, "utf8")).events || [];
const archive = existsSync(archivePath)
  ? JSON.parse(readFileSync(archivePath, "utf8")).events || []
  : [];

// Upcoming events take precedence (fresher data); archive fills in context
// for events that have already expired out of upcoming-events.json.
const events = [...upcoming, ...archive];
console.log(`Loaded ${upcoming.length} upcoming + ${archive.length} archived events for context${dryRun ? " (DRY RUN)" : ""}\n`);

const t0 = Date.now();
const report = await regenerateDuplicateCacheEntries(events, { dryRun });
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const changed = report.filter((r) => r.changed);
const unchanged = report.filter((r) => !r.changed);

console.log(`\n${report.length} cache entries in cross-venue duplicate clusters (${elapsed}s):\n`);
for (const r of report) {
  console.log(`[${r.changed ? "✓" : "✗"}] ${r.key}`);
  console.log(`    before: ${r.before}`);
  if (r.changed) console.log(`    after:  ${r.after}`);
  console.log("");
}

console.log(`${changed.length} regenerated, ${unchanged.length} left unchanged.`);
if (dryRun) console.log("(dry run — cache not written)");
