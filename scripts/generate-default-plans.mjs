#!/usr/bin/env node
/**
 * generate-default-plans.mjs
 *
 * Pre-generates the 6 "hero" plans consumed by the homepage on first
 * paint (so users never see a loading spinner). Keys:
 *
 *   adults:h9 / adults:h13 / adults:h17
 *   kids:h9   / kids:h13   / kids:h17
 *
 * Anchor hours let morning/afternoon/evening visitors each see a
 * plausibly-shaped day. Homepage's loadDefaultPlan picks the nearest-
 * but-not-future anchor based on wall time.
 *
 * Each hero slot picks a random anchor city at gen time so the 6 heroes
 * aren't identical. Shuffle handles long-term variety.
 *
 * The social scheduler (scripts/social/generate-schedule.mjs) calls the
 * live /api/plan-day directly and only falls back to these heroes if
 * the API fails — so 3 adult heroes + a day-of-year rotation is a fine
 * fallback even though it used to be 33 per-city plans.
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

// Category → Unsplash URL cache so we only call once per category per run.
// Cards whose photoRef + image are both null would otherwise flash the
// category emoji on load before the client-side Unsplash fallback resolves;
// pre-baking the URL means the browser renders the image immediately.
const unsplashByCategory = new Map();

async function unsplashForCategory(category) {
  if (!category) return null;
  if (unsplashByCategory.has(category)) return unsplashByCategory.get(category);
  try {
    const res = await fetch(`${API_BASE}/api/unsplash-photo?query=${encodeURIComponent(category)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { unsplashByCategory.set(category, null); return null; }
    const data = await res.json();
    const url = data?.url || null;
    unsplashByCategory.set(category, url);
    return url;
  } catch {
    unsplashByCategory.set(category, null);
    return null;
  }
}

async function enrichMissingImages(cards) {
  for (const c of cards) {
    if (c.photoRef || c.image) continue;
    const url = await unsplashForCategory(c.category);
    if (url) c.image = url;
  }
  return cards;
}

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

async function main() {
  const total = 2 * ANCHOR_HOURS.length;
  console.log(`generate-default-plans: 2 kids × ${ANCHOR_HOURS.length} anchors = ${total} hero plans`);
  console.log(`  API: ${API_BASE}`);

  const plans = {};
  let errors = 0;

  for (const kids of [false, true]) {
    for (const anchor of ANCHOR_HOURS) {
      const key = `${kids ? "kids" : "adults"}:h${anchor}`;
      const city = pickRandom(FEATURED_CITIES);
      console.log(`  → ${key} (anchored in ${city})`);
      try {
        const data = await fetchPlan(city, kids, anchor);
        const cards = await enrichMissingImages(data.cards || []);
        plans[key] = {
          cards,
          weather: data.weather || null,
          city,
          kids,
          anchorHour: anchor,
          generatedAt: new Date().toISOString(),
          poolSize: data.poolSize || 0,
        };
        const withImg = cards.filter((c) => c.photoRef || c.image).length;
        console.log(`  ✓ ${key}: ${cards.length} cards (${withImg} with image)`);
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
      anchorHours: ANCHOR_HOURS,
      planCount: Object.keys(plans).length,
      errors,
    },
    plans,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${Object.keys(plans).length} hero plans to default-plans.json`);
  if (errors > 0) console.warn(`  (${errors} errors — some slots may be missing)`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
