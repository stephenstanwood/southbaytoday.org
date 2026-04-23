#!/usr/bin/env node
// One-shot backfill: re-query Google Places Text Search for entries in
// places.json that have no photoRef. Writes back in place.
// Usage: node scripts/backfill-places-photos.mjs [--dry-run]

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/env.mjs";

loadEnvLocal();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLACES_FILE = join(__dirname, "..", "src", "data", "south-bay", "places.json");
const dryRun = process.argv.includes("--dry-run");

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) { console.error("GOOGLE_PLACES_API_KEY not set"); process.exit(1); }

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

async function lookupPhotoRef(name, city) {
  const query = city ? `${name} ${city.replace(/-/g, " ")}` : name;
  try {
    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.photos",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.places?.[0]?.photos?.[0]?.name || null;
  } catch (err) {
    console.warn(`  ⚠️  ${name}: ${err.message}`);
    return null;
  }
}

const data = JSON.parse(readFileSync(PLACES_FILE, "utf8"));
const missing = data.places.filter((p) => !p.photoRef);
console.log(`places without photoRef: ${missing.length} / ${data.places.length}`);
if (!missing.length) process.exit(0);

let filled = 0, stillMissing = 0;
for (const p of missing) {
  const ref = await lookupPhotoRef(p.name, p.city);
  if (ref) {
    p.photoRef = ref;
    filled++;
    console.log(`  ✓ ${p.name} — ${ref.slice(0, 40)}`);
  } else {
    stillMissing++;
    console.log(`  · ${p.name} — no photo`);
  }
  await new Promise((r) => setTimeout(r, 300));
}

if (!dryRun) {
  writeFileSync(PLACES_FILE, JSON.stringify(data, null, 2));
  console.log(`\nwrote ${PLACES_FILE}: ${filled} filled, ${stillMissing} still missing`);
} else {
  console.log(`\n[dry run] would fill ${filled}, ${stillMissing} genuinely have no photos`);
}
