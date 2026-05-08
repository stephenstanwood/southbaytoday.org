#!/usr/bin/env node
// One-shot place blurb generator. Produces place-blurb-cache.json keyed by
// place id with one venue-specific sentence each.
//
// Two-tier strategy:
//   1. If place-research-cache.json has a Google editorialSummary for this
//      id, use it verbatim — it's Google's own one-liner, ground truth.
//   2. Otherwise fall back to data-driven templates that combine
//      displayType + city + street + priceLevel into honest, specific copy.
//
// No LLM calls. Deterministic. Templates vary by category cluster + hash
// the place id so 50 Italian restaurants don't all read the same.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLACES = join(__dirname, "..", "src", "data", "south-bay", "places.json");
const RESEARCH = join(__dirname, "..", "src", "data", "south-bay", "place-research-cache.json");
const OUT = join(__dirname, "..", "src", "data", "south-bay", "place-blurb-cache.json");

const places = JSON.parse(readFileSync(PLACES, "utf8")).places;
const research = existsSync(RESEARCH) ? JSON.parse(readFileSync(RESEARCH, "utf8")) : {};

const CITY_NAMES = {
  "campbell": "Campbell", "cupertino": "Cupertino", "los-gatos": "Los Gatos",
  "mountain-view": "Mountain View", "saratoga": "Saratoga", "sunnyvale": "Sunnyvale",
  "palo-alto": "Palo Alto", "san-jose": "San Jose", "santa-clara": "Santa Clara",
  "los-altos": "Los Altos", "milpitas": "Milpitas", "santa-cruz": "Santa Cruz",
};

function extractStreet(address) {
  if (!address) return null;
  const firstSeg = address.split(",")[0]?.trim();
  if (!firstSeg) return null;
  const cleaned = firstSeg
    .replace(/^\d+\s*-?\s*\d*\s*/, "")
    .replace(/\s+(Suite|Ste|Unit|Apt|#)\s*[\w-]+\s*$/i, "")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (/^\d+$/.test(cleaned) || /^P\.?O\.?\s*Box/i.test(cleaned)) return null;
  return cleaned;
}

function hashIdx(s, mod) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

function pickTemplate(templates, id) {
  return templates[hashIdx(id, templates.length)];
}

function lowerType(displayType) {
  if (!displayType) return "spot";
  const NATIONALITY_RE = /^(Vietnamese|Italian|Chinese|Japanese|Korean|Mexican|Indian|Thai|French|Spanish|Greek|American|Mediterranean|German|Persian|Cuban|Brazilian|Ethiopian|Filipino|Cambodian|Burmese|Lebanese|Turkish|Pakistani|Caribbean|Peruvian|Argentine|Russian|Egyptian|Moroccan|Polish|Portuguese|Hawaiian|Asian|African|European|Latin)\b/;
  if (NATIONALITY_RE.test(displayType)) return displayType;
  return displayType.charAt(0).toLowerCase() + displayType.slice(1);
}

// Trim editorial summary if it has marketing fluff or runs too long.
function cleanEditorial(text) {
  if (!text) return null;
  let t = text.trim();
  // Strip leading "We're..." / "Our..." marketing voice that sometimes appears.
  t = t.replace(/^(We are|We're|Our|Welcome to)\b/i, "").trim();
  if (t.length > 220) {
    // Take first sentence
    const first = t.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (first && first.length >= 40 && first.length <= 220) t = first;
    else t = t.slice(0, 200).replace(/\s+\S*$/, "") + ".";
  }
  if (t.length < 20) return null;
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}

// FOOD ----------------------------------------------------------------------
function blurbForFood(p, ctx) {
  const { cityName, street, priceLevel, types } = ctx;
  const type = lowerType(p.displayType || "restaurant");
  const isCoffee = /coffee|cafe|tea house/i.test(p.displayType || "");
  const isBakery = /bakery|patisserie|donut|pastry/i.test(p.displayType || "");
  const isIceCream = /ice cream|gelato|frozen yogurt|dessert/i.test(p.displayType || "");
  const isQuickBite = /sandwich|deli|bagel|breakfast restaurant/i.test(p.displayType || "");
  const isFastCasual = (types || []).includes("fast_food_restaurant") || (types || []).includes("meal_takeaway");

  if (isCoffee) {
    const t = [
      street ? `${cityName} coffee stop on ${street}.` : `${cityName} coffee stop.`,
      street ? `${street} cafe in ${cityName} for an espresso and a sit.` : `Cafe in ${cityName} for an espresso and a sit.`,
      `Quick coffee in ${cityName}${street ? ` on ${street}` : ""}.`,
      `${cityName} cafe — order at the counter and post up.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isBakery) {
    const t = [
      street ? `${cityName} bakery on ${street} for pastries and grab-and-go pulls.` : `${cityName} bakery for pastries and grab-and-go pulls.`,
      `Pastry stop in ${cityName}${street ? ` on ${street}` : ""}.`,
      `${cityName} bakery — slice of cake or a croissant for the road.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isIceCream) {
    const t = [
      street ? `${cityName} ${type} on ${street} for a quick scoop walk.` : `${cityName} ${type} for a quick scoop walk.`,
      `Dessert stop in ${cityName}${street ? ` on ${street}` : ""}.`,
      `${cityName} sweet stop — grab a cone and wander.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isQuickBite) {
    const tier = priceLevel ? `, ${priceLevel}` : "";
    return street ? `${cityName} ${type} on ${street}${tier}.` : `${cityName} ${type}${tier}.`;
  }
  if (isFastCasual) {
    return street
      ? `${cityName} ${type} on ${street}${priceLevel ? `, ${priceLevel}` : ""} — counter-service.`
      : `${cityName} ${type}${priceLevel ? `, ${priceLevel}` : ""}, counter-service.`;
  }
  if (priceLevel === "$$$$") {
    const t = [
      street ? `Upscale ${type} on ${street} in ${cityName}, $$$$ — worth dressing up for.` : `Upscale ${type} in ${cityName}, $$$$.`,
      `${cityName} fine-dining ${type}${street ? ` on ${street}` : ""}, $$$$.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (priceLevel === "$$$") {
    const t = [
      street ? `${cityName} ${type} on ${street}, $$$ for a sit-down dinner.` : `${cityName} ${type}, $$$.`,
      `Sit-down ${type} in ${cityName}${street ? ` on ${street}` : ""}, $$$ range.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (priceLevel === "$$") {
    const t = [
      street ? `${cityName} ${type} on ${street}, $$ sit-down.` : `${cityName} ${type}, $$.`,
      `Sit-down ${type} in ${cityName}${street ? ` on ${street}` : ""}, mid-tier prices.`,
      `${cityName} ${type}${street ? ` on ${street}` : ""} — $$ and worth a table.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (priceLevel === "$") {
    const t = [
      street ? `${cityName} ${type} on ${street}, $ and casual.` : `${cityName} ${type}, $ and casual.`,
      `Cheap ${type} in ${cityName}${street ? ` on ${street}` : ""}.`,
    ];
    return pickTemplate(t, p.id);
  }
  return street ? `${cityName} ${type} on ${street}.` : `${cityName} ${type}.`;
}

// OUTDOOR -------------------------------------------------------------------
function blurbForOutdoor(p, ctx) {
  const { cityName, types } = ctx;
  const type = lowerType(p.displayType || "park");
  const isPark = /park\b/i.test(p.displayType || "") || (types || []).includes("park");
  const isHike = /hiking|trail|preserve|open space|nature/i.test(p.displayType || "");
  const isGarden = /garden|botanical/i.test(p.displayType || "");
  const isBeach = /beach|waterfront/i.test(p.displayType || "");
  const isPlayground = /playground/i.test((p.types || []).join(",")) || /playground/i.test(p.displayType || "");

  if (isPlayground) {
    const t = [
      `${cityName} playground — slides, swings, climbing structures.`,
      `${cityName} park with playground equipment for the kids.`,
      `Open green space and a playground in ${cityName}.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isHike) {
    const t = [
      `${cityName} ${type} with shaded trails and open-space stretches.`,
      `Hiking spot in the ${cityName} hills — ${type}.`,
      `${cityName} trail loop, easy to medium effort.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isGarden) {
    return `${cityName} ${type} for a slow stroll through plantings.`;
  }
  if (isBeach) {
    return `${cityName} waterfront — bring a layer for the wind.`;
  }
  if (isPark) {
    const t = [
      `${cityName} park with green space, paths, and picnic spots.`,
      `Open ${cityName} park — easy walk, room to spread out.`,
      `${cityName} neighborhood park, free to drop in.`,
      `${cityName} park for a quick outdoor reset.`,
    ];
    return pickTemplate(t, p.id);
  }
  return `${cityName} ${type} for an outdoor stretch.`;
}

function blurbForMuseum(p, ctx) {
  const { cityName, street } = ctx;
  const type = lowerType(p.displayType || "museum");
  return street ? `${cityName} ${type} on ${street}.` : `${cityName} ${type}.`;
}

function blurbForShopping(p, ctx) {
  const { cityName, street, types } = ctx;
  const type = lowerType(p.displayType || "shop");
  const isBookstore = /book/i.test(p.displayType || "") || (types || []).includes("book_store");
  const isRecord = /record|music store/i.test(p.displayType || "");
  const isFarmers = /farmers/i.test(p.displayType || "");

  if (isBookstore) return street ? `${cityName} bookstore on ${street}, good for a slow browse.` : `${cityName} bookstore.`;
  if (isRecord) return street ? `${cityName} record shop on ${street} — bins to dig through.` : `${cityName} record shop.`;
  if (isFarmers) return `${cityName} farmers market — local produce, baked goods, samples.`;
  return street ? `${cityName} ${type} on ${street} — pick something up or just browse.` : `${cityName} ${type}.`;
}

function blurbForEntertainment(p, ctx) {
  const { cityName, street } = ctx;
  const type = lowerType(p.displayType || "venue");
  const isClimb = /climbing|bouldering/i.test(p.displayType || "");
  const isArcade = /arcade|bowling|laser tag|escape/i.test(p.displayType || "");

  if (isClimb) return street ? `${cityName} ${type} on ${street} — bring shoes or rent at the desk.` : `${cityName} ${type}.`;
  if (isArcade) return street ? `${cityName} ${type} on ${street} — solid rainy-day option.` : `${cityName} ${type}.`;
  return street ? `${cityName} ${type} on ${street}.` : `${cityName} ${type}.`;
}

function blurbForWellness(p, ctx) {
  const { cityName, street } = ctx;
  const type = lowerType(p.displayType || "wellness");
  return street ? `${cityName} ${type} on ${street}.` : `${cityName} ${type}.`;
}

// MAIN --------------------------------------------------------------------
const cache = {};
let researchHits = 0, templateHits = 0;

for (const p of places) {
  const cityName = CITY_NAMES[p.city] || p.city;
  const street = extractStreet(p.address);
  const ctx = {
    cityName,
    street,
    priceLevel: p.priceLevel,
    indoorOutdoor: p.indoorOutdoor,
    types: p.types,
  };

  // Research-first: use Google's editorialSummary verbatim if present.
  const r = research[p.id];
  const summary = cleanEditorial(r?.editorialSummary);
  if (summary) {
    cache[p.id] = { blurb: summary, source: "editorial", category: p.category };
    researchHits++;
    continue;
  }

  // Template fallback.
  let blurb;
  switch (p.category) {
    case "food": blurb = blurbForFood(p, ctx); break;
    case "outdoor": blurb = blurbForOutdoor(p, ctx); break;
    case "museum": blurb = blurbForMuseum(p, ctx); break;
    case "shopping": blurb = blurbForShopping(p, ctx); break;
    case "entertainment": blurb = blurbForEntertainment(p, ctx); break;
    case "wellness": blurb = blurbForWellness(p, ctx); break;
    case "arts": blurb = blurbForMuseum(p, ctx); break;
    case "neighborhood": blurb = `${cityName} neighborhood${street ? ` along ${street}` : ""}.`; break;
    default:
      blurb = street
        ? `${p.displayType || "Spot"} in ${cityName} on ${street}.`
        : `${p.displayType || "Spot"} in ${cityName}.`;
  }
  cache[p.id] = { blurb, source: "template", category: p.category };
  templateHits++;
}

const out = {
  _meta: {
    generatedAt: new Date().toISOString(),
    placeCount: places.length,
    blurbCount: Object.keys(cache).length,
    sources: { editorial: researchHits, template: templateHits },
  },
  blurbs: cache,
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT}`);
console.log(`  ${out._meta.blurbCount} blurbs (${researchHits} from Google editorialSummary, ${templateHits} from templates)`);
console.log(`\nSample editorial (5):`);
const editorialSamples = Object.entries(cache).filter(([, v]) => v.source === "editorial").slice(0, 5);
for (const [id, v] of editorialSamples) {
  const p = places.find((x) => x.id === id);
  console.log(`  ${p?.name} → ${v.blurb}`);
}
console.log(`\nSample template (one per category):`);
const cats = new Map();
for (const p of places) {
  if (cats.size >= 8) break;
  if (cache[p.id].source !== "template") continue;
  if (cats.has(p.category)) continue;
  cats.set(p.category, { name: p.name, blurb: cache[p.id].blurb });
}
for (const [cat, x] of cats) console.log(`  [${cat}] ${x.name} → ${x.blurb}`);
