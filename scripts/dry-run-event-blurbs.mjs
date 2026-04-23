#!/usr/bin/env node
// Run the event-blurb resolver against the committed upcoming-events.json.
//
// Usage:
//   node scripts/dry-run-event-blurbs.mjs --dry                     # report only
//   RESOLVE_EVENT_BLURBS=1 node scripts/dry-run-event-blurbs.mjs    # resolve + write back
//
// Reads ANTHROPIC_API_KEY from .env.local (auto-loaded below) or the
// ambient env. On the Mini, .env.local has it. Haiku cost at 30 events/batch
// ≈ $0.05 per full ~530-event backfill.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

const { resolveEventBlurbs } = await import("../src/lib/south-bay/eventBlurbs.mjs");

const EVENTS_PATH = join(REPO_ROOT, "src", "data", "south-bay", "upcoming-events.json");
const dryRun = process.argv.includes("--dry");

const data = JSON.parse(readFileSync(EVENTS_PATH, "utf8"));
const events = data.events;
console.log(`Loaded ${events.length} events from upcoming-events.json${dryRun ? " (DRY RUN)" : ""}\n`);

const t0 = Date.now();
const stats = await resolveEventBlurbs(events, { dryRun });
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\nStats (${elapsed}s):`);
console.table(stats);

const blurbed = stats.preexisting + stats.cache_hits + stats.generated;
console.log(`\nBlurbed: ${blurbed} / ${events.length} (${((blurbed / events.length) * 100).toFixed(0)}%)`);

if (!dryRun) {
  data.events = events;
  writeFileSync(EVENTS_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n✓ Wrote upcoming-events.json with blurb fields`);
}
