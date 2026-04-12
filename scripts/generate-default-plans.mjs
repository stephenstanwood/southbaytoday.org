#!/usr/bin/env node
/**
 * generate-default-plans.mjs
 *
 * Pre-generates day plans for featured cities using the production plan-day API.
 * These are served as the instant default plan on the homepage — no loading
 * spinner, no separate "lazy" algorithm. Same quality as the API.
 *
 * Run: node scripts/generate-default-plans.mjs
 * Schedule: 2:00 AM PT daily on Mini
 *
 * Generates two plans per city (kids=false, kids=true) and saves to
 * src/data/south-bay/default-plans.json.
 */

import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "default-plans.json");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.SBT_API_BASE || "https://southbaytoday.org";
const FEATURED_CITIES = ["campbell", "los-gatos", "mountain-view", "san-jose", "palo-alto"];
const DELAY_MS = 3000; // polite delay between API calls

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPlan(city, kids) {
  const url = `${API_BASE}/api/plan-day`;
  console.log(`  → ${city} (kids=${kids})...`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city,
      kids,
      lockedIds: [],
      dismissedIds: [],
      currentHour: 9, // generate plan starting at 9 AM
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} for ${city}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("generate-default-plans: building plans for", FEATURED_CITIES.length, "cities");
  console.log(`  API: ${API_BASE}`);

  const plans = {};
  let errors = 0;

  for (const city of FEATURED_CITIES) {
    for (const kids of [false, true]) {
      const key = `${city}:${kids ? "kids" : "adults"}`;
      try {
        const data = await fetchPlan(city, kids);
        plans[key] = {
          cards: data.cards || [],
          weather: data.weather || null,
          city,
          kids,
          generatedAt: new Date().toISOString(),
          poolSize: data.poolSize || 0,
        };
        console.log(`  ✓ ${key}: ${plans[key].cards.length} cards`);
      } catch (err) {
        console.error(`  ✗ ${key}: ${err.message}`);
        errors++;
      }
      await sleep(DELAY_MS);
    }
  }

  if (Object.keys(plans).length === 0) {
    console.error("ERROR: no plans generated, aborting");
    process.exit(1);
  }

  const output = {
    _meta: {
      generatedAt: new Date().toISOString(),
      generator: "generate-default-plans",
      cities: FEATURED_CITIES,
      planCount: Object.keys(plans).length,
      errors,
    },
    plans,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${Object.keys(plans).length} plans to default-plans.json`);
  if (errors > 0) console.warn(`  (${errors} errors — some cities may be missing)`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
