#!/usr/bin/env node
/**
 * generate-default-plans.mjs
 *
 * Pre-generates day plans consumed by the homepage + social scheduler.
 *
 * Two keyspaces live in default-plans.json:
 *
 *   Hero plans  — "adults:h9" / "kids:h13" / etc. One per (kids × anchor)
 *   = 6 plans. Homepage first-paint uses these so users never see a
 *   loading bar on landing.
 *
 *   Per-city plans — "sunnyvale:adults:h9" / etc. Consumed by the social
 *   scheduler (generate-schedule.mjs) for day rotation variety.
 *
 * Run: node scripts/generate-default-plans.mjs
 * Schedule: 2:00 AM PT daily on Mini
 */

import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "default-plans.json");
const CITIES_PATH = join(__dirname, "..", "src", "lib", "south-bay", "cities.ts");

const API_BASE = process.env.SBT_API_BASE || "https://southbaytoday.org";

const ANCHOR_HOURS = [9, 13, 17];
const DELAY_MS = 3000;

function loadFeaturedCities() {
  try {
    const src = readFileSync(CITIES_PATH, "utf8");
    const ids = [];
    for (const m of src.matchAll(/id:\s*"([^"]+)"/g)) {
      if (m[1] !== "santa-cruz") ids.push(m[1]);
    }
    if (ids.length === 0) throw new Error("no city ids parsed");
    return ids;
  } catch (err) {
    console.warn(`  ⚠️  falling back to hardcoded city list: ${err.message}`);
    return ["campbell", "cupertino", "los-altos", "los-gatos", "milpitas", "mountain-view", "palo-alto", "san-jose", "santa-clara", "saratoga", "sunnyvale"];
  }
}

const FEATURED_CITIES = loadFeaturedCities();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function fetchPlan(city, kids, anchorHour) {
  const url = `${API_BASE}/api/plan-day`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city,
      kids,
      lockedIds: [],
      dismissedIds: [],
      currentHour: anchorHour,
      currentMinute: 0,
      noCache: true,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} for ${city}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function buildPlanEntry(data, city, kids, anchor) {
  return {
    cards: data.cards || [],
    weather: data.weather || null,
    city,
    kids,
    anchorHour: anchor,
    generatedAt: new Date().toISOString(),
    poolSize: data.poolSize || 0,
  };
}

async function main() {
  const perCity = FEATURED_CITIES.length * 2 * ANCHOR_HOURS.length;
  const heroCount = 2 * ANCHOR_HOURS.length;
  console.log(`generate-default-plans: ${perCity} per-city + ${heroCount} hero = ${perCity + heroCount} plans`);
  console.log(`  API: ${API_BASE}`);

  const plans = {};
  let errors = 0;

  // --- Per-city plans (consumed by social scheduler) ---
  for (const city of FEATURED_CITIES) {
    for (const kids of [false, true]) {
      for (const anchor of ANCHOR_HOURS) {
        const key = `${city}:${kids ? "kids" : "adults"}:h${anchor}`;
        console.log(`  → ${key}`);
        try {
          const data = await fetchPlan(city, kids, anchor);
          plans[key] = buildPlanEntry(data, city, kids, anchor);
          console.log(`  ✓ ${key}: ${plans[key].cards.length} cards`);
        } catch (err) {
          console.error(`  ✗ ${key}: ${err.message}`);
          errors++;
        }
        await sleep(DELAY_MS);
      }
    }
  }

  // --- Hero plans (consumed by homepage first-paint) ---
  // Anchor city is picked randomly per slot so each of the 6 heroes is
  // anchored somewhere different. Shuffle handles long-term variety; this
  // just keeps first-paint interesting and non-identical across kids/anchor.
  for (const kids of [false, true]) {
    for (const anchor of ANCHOR_HOURS) {
      const heroKey = `${kids ? "kids" : "adults"}:h${anchor}`;
      const city = pickRandom(FEATURED_CITIES);
      // If we already generated a per-city plan for the same (city, kids,
      // anchor), just alias it — no extra API call needed.
      const cityKey = `${city}:${kids ? "kids" : "adults"}:h${anchor}`;
      if (plans[cityKey]?.cards?.length) {
        plans[heroKey] = plans[cityKey];
        console.log(`  ⚲ ${heroKey} aliased to ${cityKey} (${plans[heroKey].cards.length} cards)`);
        continue;
      }
      // Otherwise fetch fresh.
      console.log(`  → ${heroKey} (fresh, anchor=${city})`);
      try {
        const data = await fetchPlan(city, kids, anchor);
        plans[heroKey] = buildPlanEntry(data, city, kids, anchor);
        console.log(`  ✓ ${heroKey}: ${plans[heroKey].cards.length} cards`);
      } catch (err) {
        console.error(`  ✗ ${heroKey}: ${err.message}`);
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
      anchorHours: ANCHOR_HOURS,
      planCount: Object.keys(plans).length,
      errors,
    },
    plans,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${Object.keys(plans).length} plans to default-plans.json`);
  if (errors > 0) console.warn(`  (${errors} errors — some slots may be missing)`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
