#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Add `copy.email` to existing social-schedule entries that pre-date the
// email-variant change. Idempotent: skips entries that already have it.
//
// Usage: node scripts/newsletter/backfill-email-copy.mjs
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../lib/paths.mjs";
import { rewriteForEmail } from "./lib.mjs";

const path = join(DATA_DIR, "social-schedule.json");
const schedule = JSON.parse(readFileSync(path, "utf8"));

let updated = 0;
let skipped = 0;
const errors = [];

for (const date of Object.keys(schedule.days).sort()) {
  for (const slotType of ["day-plan", "tonight-pick"]) {
    const entry = schedule.days[date]?.[slotType];
    if (!entry?.copy) continue;
    if (entry.copy.email) { skipped++; continue; }
    const source = entry.copy.facebook || entry.copy.threads || entry.copy.bluesky || "";
    if (!source) { skipped++; continue; }
    const kind = slotType === "tonight-pick" ? "pick" : "plan";
    process.stdout.write(`[${date} ${slotType}] rewriting… `);
    try {
      entry.copy.email = await rewriteForEmail(source, kind);
      console.log(`✓ ${entry.copy.email.length} chars`);
      updated++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      errors.push({ date, slotType, error: err.message });
    }
  }
}

writeFileSync(path, JSON.stringify(schedule, null, 2) + "\n");
console.log(`\nupdated: ${updated}, skipped: ${skipped}, errors: ${errors.length}`);
if (errors.length) {
  console.log("errors:");
  for (const e of errors) console.log(`  ${e.date} ${e.slotType}: ${e.error}`);
}
