#!/usr/bin/env node
/**
 * dedup-existing-events.mjs
 *
 * Applies the fuzzy cross-source dedup to the existing
 * upcoming-events.json file in-place. Use after introducing or tightening
 * fuzzyDedupEvents — lets the live site reflect the change before the next
 * nightly regen on the Mini.
 *
 * Run: node scripts/dedup-existing-events.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fuzzyDedupEvents } from "../src/lib/south-bay/eventFuzzyDedup.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_PATH = join(__dirname, "..", "src", "data", "south-bay", "upcoming-events.json");

const raw = JSON.parse(readFileSync(EVENTS_PATH, "utf8"));
const events = Array.isArray(raw.events) ? raw.events : [];
const before = events.length;

const { kept, droppedCount } = fuzzyDedupEvents(events);

if (droppedCount === 0) {
  console.log(`No fuzzy duplicates found in ${before} events.`);
  process.exit(0);
}

raw.events = kept;
raw.eventCount = kept.length;
writeFileSync(EVENTS_PATH, JSON.stringify(raw, null, 2));
console.log(`Dropped ${droppedCount} fuzzy duplicates: ${before} → ${kept.length}`);
