#!/usr/bin/env node
/**
 * generate-open-now-candidates.mjs
 *
 * Filters places.json down to a small per-city pool of top-rated spots with
 * usable hours data. The city page renders "Open Right Now in [city]" by
 * loading this pool client-side and matching against the user's current PT
 * weekday + time. Doing the cull at build time keeps places.json (3.8MB) out
 * of the bundle.
 *
 * Output: src/data/south-bay/open-now-candidates.json
 *   { generatedAt, cities: { [cityId]: Candidate[] } }
 *
 * Filter: rating >= 4.5, ratingCount >= 100, hours present.
 * Cap: 30 per city, sorted by rating desc, then ratingCount desc.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileAtomic } from "./lib/io.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLACES_PATH = join(__dirname, "..", "src", "data", "south-bay", "places.json");
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "open-now-candidates.json");

const MIN_RATING = 4.5;
const MIN_RATING_COUNT = 100;
const MAX_PER_CITY = 30;

const places = JSON.parse(readFileSync(PLACES_PATH, "utf8")).places ?? [];

const candidates = places.filter((p) => {
  if (!p.hours || typeof p.hours !== "object") return false;
  if (typeof p.rating !== "number" || p.rating < MIN_RATING) return false;
  if (typeof p.ratingCount !== "number" || p.ratingCount < MIN_RATING_COUNT) return false;
  if (!p.city) return false;
  if (!p.name) return false;
  // At least one valid day range
  const dayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
  const hasAny = dayKeys.some((k) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(p.hours[k] ?? ""));
  return hasAny;
});

const byCity = {};
for (const p of candidates) {
  (byCity[p.city] ??= []).push(p);
}

for (const cityId of Object.keys(byCity)) {
  byCity[cityId].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return b.ratingCount - a.ratingCount;
  });
  byCity[cityId] = byCity[cityId].slice(0, MAX_PER_CITY).map((p) => ({
    id: p.id,
    name: p.name,
    displayType: p.displayType ?? null,
    category: p.category ?? null,
    rating: p.rating,
    ratingCount: p.ratingCount,
    priceLevel: p.priceLevel ?? null,
    hours: p.hours,
    mapsUrl: p.mapsUrl ?? null,
    url: p.url ?? null,
  }));
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "generate-open-now-candidates",
  filter: { minRating: MIN_RATING, minRatingCount: MIN_RATING_COUNT, capPerCity: MAX_PER_CITY },
  stats: {
    totalCandidates: Object.values(byCity).reduce((n, arr) => n + arr.length, 0),
    cities: Object.fromEntries(Object.entries(byCity).map(([k, v]) => [k, v.length])),
  },
  cities: byCity,
};

writeFileAtomic(OUT_PATH, JSON.stringify(out));

console.log(`✓ Wrote ${out.stats.totalCandidates} candidates across ${Object.keys(byCity).length} cities → ${OUT_PATH}`);
for (const [c, n] of Object.entries(out.stats.cities).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c}: ${n}`);
}
