#!/usr/bin/env node
// One-off: patch places.json with hours for the 10 curated food POIs.
// Runs without hitting Google. Idempotent — safe to re-run.
//
// Future generate-places.mjs runs will pick up the same values via the
// updated parser (loadCuratedPOIs reads `hours: { ... }` blocks now).

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLACES_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "places.json");

// Map curatedId → hours, mirroring poi-data.ts as of 2026-05-07.
const CURATED_HOURS = {
  "san-pedro-square": { sun: "11:00-22:00", mon: "11:00-22:00", tue: "11:00-22:00", wed: "11:00-22:00", thu: "11:00-22:00", fri: "11:00-00:00", sat: "11:00-00:00" },
  "los-gatos-coffee-works": { sun: "07:00-17:00", mon: "07:00-18:00", tue: "07:00-18:00", wed: "07:00-18:00", thu: "07:00-21:00", fri: "07:00-21:00", sat: "07:00-21:00" },
  "chromatic-coffee": { sun: "08:00-17:00", mon: "08:00-15:00", tue: "08:00-15:00", wed: "08:00-15:00", thu: "08:00-15:00", fri: "08:00-17:00", sat: "08:00-17:00" },
  "bills-cafe": { sun: "07:00-15:00", mon: "07:00-14:00", tue: "07:00-14:00", wed: "07:00-14:00", thu: "07:00-14:00", fri: "07:00-14:00", sat: "07:00-15:00" },
  "back-a-yard": { sun: "11:00-20:00", mon: "11:00-20:00", tue: "11:00-20:00", wed: "11:00-20:00", thu: "11:00-20:00", fri: "11:00-20:00", sat: "11:00-20:00" },
  "orens-hummus": { sun: "11:00-21:00", mon: "11:00-21:00", tue: "11:00-21:00", wed: "11:00-21:00", thu: "11:00-21:00", fri: "11:00-21:00", sat: "11:00-21:00" },
  "smoking-pig-bbq": { sun: "11:00-20:00", mon: "11:00-20:00", tue: "11:00-20:00", wed: "11:00-20:00", thu: "11:00-20:00", fri: "11:00-21:00", sat: "11:00-21:00" },
  "luna-mexican-kitchen": { sun: "09:00-21:00", mon: "09:00-21:00", tue: "09:00-21:00", wed: "09:00-21:00", thu: "09:00-21:00", fri: "09:00-22:00", sat: "09:00-22:00" },
  "dio-deka": { sun: "17:00-21:00", wed: "17:00-21:00", thu: "17:00-21:00", fri: "17:00-21:00", sat: "17:00-21:00" },
  dishdash: { sun: "16:00-21:00", mon: "11:00-21:00", tue: "11:00-21:00", wed: "11:00-21:00", thu: "11:00-21:00", fri: "11:00-21:30", sat: "11:30-21:30" },
};

const data = JSON.parse(readFileSync(PLACES_FILE, "utf8"));
const places = Array.isArray(data) ? data : data.places;
let patched = 0;
let skipped = 0;
for (const p of places) {
  if (!p.curated) continue;
  const stripPrefix = (s) => (typeof s === "string" && s.startsWith("curated:") ? s.slice("curated:".length) : s);
  const id = stripPrefix(p.curatedId) || stripPrefix(p.id);
  if (!id || !CURATED_HOURS[id]) continue;
  if (JSON.stringify(p.hours) === JSON.stringify(CURATED_HOURS[id])) {
    skipped++;
    continue;
  }
  p.hours = CURATED_HOURS[id];
  patched++;
  console.log(`  ✅ ${id}: hours patched`);
}
writeFileSync(PLACES_FILE, JSON.stringify(data, null, 2) + "\n");
console.log(`\nPatched ${patched} entries, skipped ${skipped} (already correct).`);
