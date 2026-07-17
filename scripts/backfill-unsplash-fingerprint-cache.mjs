#!/usr/bin/env node
// One-off backfill for D09: the event-image resolver used to skip events
// that already carried an Unsplash-search `image` (treated as "preexisting"
// and never re-checked against event-image-cache.json byFingerprint), so a
// richer Recraft entry that landed in the cache after the fact (backfill
// run, manual override) never got picked up. The resolver itself is fixed
// in src/lib/south-bay/eventImages.mjs; this script is the one-time surgery
// on the 149 events already carrying an Unsplash-search image.
//
// Pure JSON — no network calls, cache lookup only.
//
// Usage:
//   node scripts/backfill-unsplash-fingerprint-cache.mjs --dry     # report only
//   node scripts/backfill-unsplash-fingerprint-cache.mjs           # write back

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/io.mjs";
import { fingerprint, isUnsplashSearchImage } from "../src/lib/south-bay/eventImages.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_PATH = join(__dirname, "..", "src", "data", "south-bay", "upcoming-events.json");
const CACHE_PATH = join(__dirname, "..", "src", "data", "south-bay", "event-image-cache.json");
const dryRun = process.argv.includes("--dry");

const data = JSON.parse(readFileSync(EVENTS_PATH, "utf8"));
const cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
const events = data.events;

let swapped = 0;
let noCacheEntry = 0;
let notUnsplash = 0;
const swappedTitles = [];

for (const e of events) {
  if (e.photoRef || !isUnsplashSearchImage(e.image)) { notUnsplash++; continue; }
  const cached = cache.byFingerprint?.[fingerprint(e)];
  if (cached?.image) {
    swapped++;
    swappedTitles.push(`${e.title} @ ${e.venue}`);
    if (!dryRun) e.image = cached.image;
  } else {
    noCacheEntry++;
  }
}

console.log(`Unsplash-search events: ${events.length - notUnsplash}`);
console.log(`  swapped to cached Recraft image: ${swapped}`);
console.log(`  no cache entry (left as-is):     ${noCacheEntry}`);
if (swapped > 0) {
  console.log(`\nSwapped:`);
  for (const t of swappedTitles) console.log(`  - ${t}`);
}

if (!dryRun && swapped > 0) {
  data.events = events;
  writeFileAtomic(EVENTS_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n✓ Wrote upcoming-events.json`);
} else if (dryRun) {
  console.log(`\n(dry run — no write)`);
}
