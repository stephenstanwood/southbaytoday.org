#!/usr/bin/env node
// ---------------------------------------------------------------------------
// validate-schedule.mjs
//
// CI/pre-push gate for src/data/south-bay/social-schedule.json. Runs the same
// quality review the generator runs, then asserts NO hard-block flags remain.
// A hard-block is a ship-stopper like virtual/out-of-area/DOW-mismatch.
//
// Usage:
//   node scripts/validate-schedule.mjs             # validate committed file
//   node scripts/validate-schedule.mjs --soft      # warn-only (exit 0 always)
//
// Exit codes:
//   0 — no hard-blocks
//   1 — one or more hard-blocks found (fix before shipping)
//   2 — schedule file missing or unreadable
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runQualityReview } from "./social/lib/post-gen-review.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const SCHEDULE_PATH = resolve(ROOT, "src/data/south-bay/social-schedule.json");

const args = process.argv.slice(2);
const softMode = args.includes("--soft");

let schedule;
try {
  schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf8"));
} catch (err) {
  console.error(`[validate-schedule] failed to read ${SCHEDULE_PATH}: ${err.message}`);
  process.exit(2);
}

// Use resetFlaggedToDraft:false so we see every flag without mutating the file.
const { flagged, autoFixed } = runQualityReview(schedule, { resetFlaggedToDraft: false });

const hard = flagged.filter(f => f.hardBlock);
const soft = flagged.filter(f => !f.hardBlock);

console.log(`[validate-schedule] autoFixed: ${autoFixed.length}  soft flags: ${soft.length}  hard blocks: ${hard.length}`);

if (autoFixed.length) {
  console.log(`  Auto-fixes the next review pass would apply:`);
  for (const f of autoFixed.slice(0, 15)) {
    console.log(`    [${f.kind}] ${f.date} ${f.slotType} — ${f.details || ""}`);
  }
  if (autoFixed.length > 15) console.log(`    ... +${autoFixed.length - 15} more`);
}

if (soft.length) {
  console.log(`  Soft flags (caller would re-draft):`);
  for (const f of soft.slice(0, 15)) console.log(`    ${f.date} ${f.slotType} — ${f.reason}`);
  if (soft.length > 15) console.log(`    ... +${soft.length - 15} more`);
}

if (hard.length === 0) {
  console.log(`[validate-schedule] ok`);
  process.exit(0);
}

console.error(`\n[validate-schedule] HARD BLOCKS (${hard.length}) — do not ship:`);
for (const f of hard) {
  console.error(`  ${f.date} ${f.slotType} — ${f.reason}`);
}
process.exit(softMode ? 0 : 1);
