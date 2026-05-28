#!/usr/bin/env node
// Pulls Google Places `editorialSummary` (and a few cheap-tier extras) for
// the top-N venues by score, producing place-research-cache.json keyed by
// place id. The editorial summary is Google's own one-liner — ground truth,
// no LLM speculation. Coverage is partial (~30-50% of venues), so
// generate-place-blurbs.mjs falls back to data-driven templates for the
// rest.
//
// Cost: editorialSummary is in the Places API "Atmosphere" field tier
// (~$25/1k). At TOP_N=2400 this is ~$60, well under the $200/mo Maps
// Platform free credit. Scoped to top-rated venues — the long tail of
// 100-rating-count cafes doesn't need a Google blurb.
//
// Requires GOOGLE_PLACES_API_KEY in .env.local (Mini).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/env.mjs";
import { writeFileAtomic } from "./lib/io.mjs";

loadEnvLocal();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLACES = join(__dirname, "..", "src", "data", "south-bay", "places.json");
const OUT = join(__dirname, "..", "src", "data", "south-bay", "place-research-cache.json");

const TOP_N = Number(process.env.TOP_N || 2400);
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const TIMEOUT_MS = 8000;
const PER_REQ_DELAY_MS = Number(process.env.PER_REQ_DELAY_MS || 120);
const MAX_RETRIES = 5;

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_PLACES_API_KEY missing from .env.local");
  process.exit(1);
}

const places = JSON.parse(readFileSync(PLACES, "utf8")).places;

// Score = rating × log(1 + ratingCount). Wilson-ish proxy, favors places
// that are both well-rated AND well-known. Skips ones with no rating —
// those won't surface in plan-day either.
const scored = places
  .filter((p) => p.rating && p.ratingCount && p.id?.startsWith("ChIJ"))
  .map((p) => ({
    id: p.id,
    name: p.name,
    score: p.rating * Math.log(1 + p.ratingCount),
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, TOP_N);

console.log(`Fetching editorialSummary for ${scored.length} top venues (concurrency=${CONCURRENCY})…`);

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const cache = { ...existing };

async function fetchOne({ id, name }) {
  if (cache[id]?.editorialSummary !== undefined) return { id, status: "cached" };
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "editorialSummary,primaryTypeDisplayName",
        },
      });
      clearTimeout(t);
      // 429 → exponential backoff and retry. Places API throttles at ~10 QPS
      // on the Atmosphere tier; concurrency + delay should stay under, but
      // bursts still happen.
      if (res.status === 429) {
        attempt++;
        if (attempt > MAX_RETRIES) {
          cache[id] = { editorialSummary: null, status: "http-429-exhausted", name };
          return { id, status: "http-429-exhausted" };
        }
        const waitMs = Math.min(60000, 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500));
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        cache[id] = { editorialSummary: null, status: `http-${res.status}`, name };
        return { id, status: `http-${res.status}${body ? `: ${body.slice(0, 80)}` : ""}` };
      }
      const data = await res.json();
      cache[id] = {
        editorialSummary: data.editorialSummary?.text || null,
        primaryTypeDisplayName: data.primaryTypeDisplayName?.text || null,
        name,
      };
      // Be polite — one small delay per successful call.
      if (PER_REQ_DELAY_MS > 0) await new Promise((r) => setTimeout(r, PER_REQ_DELAY_MS));
      return { id, status: data.editorialSummary?.text ? "ok" : "no-summary" };
    } catch (err) {
      return { id, status: `error: ${err.message?.slice(0, 80) || err}` };
    }
  }
  return { id, status: "exhausted" };
}

let done = 0, ok = 0, noSummary = 0, fail = 0;
const queue = [...scored];

async function worker() {
  while (queue.length) {
    const item = queue.shift();
    if (!item) break;
    const result = await fetchOne(item);
    done++;
    if (result.status === "ok" || result.status === "cached") ok++;
    else if (result.status === "no-summary") noSummary++;
    else fail++;
    if (done % 100 === 0) {
      process.stdout.write(`  ${done}/${scored.length} | summary=${ok} no-summary=${noSummary} fail=${fail}\n`);
      writeFileAtomic(OUT, JSON.stringify(cache, null, 2));
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

writeFileAtomic(OUT, JSON.stringify(cache, null, 2));
console.log(`\nDone. ${ok} with editorialSummary, ${noSummary} without, ${fail} failed. Output: ${OUT}`);
console.log(`Coverage: ${((ok / scored.length) * 100).toFixed(1)}% have a Google editorial summary.`);
