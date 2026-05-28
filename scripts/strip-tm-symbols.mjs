#!/usr/bin/env node
// One-shot scrubber: strip trademark/copyright/service-mark symbols from
// runtime data files. Symbols render as visual noise on cards/badges and
// the underlying entities are still legally recognizable without them.
//
// Going forward, cleanTitle (scripts/generate-events.mjs) strips these at
// ingest time. This script handles legacy data that was scraped before the
// rule existed.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/io.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..", "src", "data", "south-bay");

const SYMBOL_RE = /[®©™℠℗]/g;
const TARGETS = [
  "upcoming-events.json",
  "inbound-events.json",
  "open-now-candidates.json",
  "places.json",
  "default-plans.json",
  "social-approved-queue.json",
  "event-blurb-cache.json",
  "place-research-cache.json",
  "place-blurb-cache.json",
];

let totalChanged = 0;
for (const file of TARGETS) {
  const path = join(ROOT, file);
  let raw;
  try { raw = readFileSync(path, "utf8"); } catch { continue; }
  if (!SYMBOL_RE.test(raw)) continue;
  // The replacement is on raw JSON text — safe because the symbols are not
  // syntactically meaningful in JSON.
  const cleaned = raw.replace(SYMBOL_RE, "").replace(/[ \t]{2,}(?![\w])/g, " ");
  if (cleaned === raw) continue;
  writeFileAtomic(path, cleaned);
  // Count visible symbols stripped.
  const before = (raw.match(SYMBOL_RE) || []).length;
  console.log(`  ${file}: stripped ${before} symbol(s)`);
  totalChanged++;
}

console.log(`\nDone. Touched ${totalChanged} file(s).`);
