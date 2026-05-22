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
import { cleanDisplayCopy } from "../src/lib/south-bay/displayText.mjs";

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

function extractStreet(address, cityName) {
  if (!address) return null;
  const firstSeg = address.split(",")[0]?.trim();
  if (!firstSeg) return null;
  // Strip leading street number (single or hyphenated range), then trailing
  // unit/building/floor/suite blobs.
  // The leading-number strip must require a hyphen for the secondary digits —
  // otherwise "100 1st St" gets eaten as "100 1" → "st St".
  let cleaned = firstSeg
    .replace(/^\d+\s*(?:-\s*\d+\s*)?/, "")
    .replace(/\s+(Suites?|Ste|Unit|Apt|#|Bldg|Building|Floor|Fl|Lvl|Level)\b.*$/i, "")
    .trim();
  // Trailing unit designator after a street-type token: solo letter
  // ("Ave A"), letter-dash-number ("Ave C-31"), or solo number ("Blvd 200").
  // Constrained to known street types so we don't mangle real names.
  cleaned = cleaned.replace(
    /(\s+(?:Ave|St|Blvd|Rd|Dr|Ct|Ln|Way|Pl|Pkwy|Hwy|Ter|Cir))\s+(?:[A-Z]\-?\d*|[A-Z]?\d+[A-Z]?)$/i,
    "$1"
  ).trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (/^\d+$/.test(cleaned) || /^P\.?O\.?\s*Box/i.test(cleaned)) return null;
  // Drop streets named after the city — "Saratoga library on Saratoga Ave"
  // reads as redundant. The card already shows the city as a chip.
  if (cityName && new RegExp(`^${cityName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(cleaned)) return null;
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
  const NATIONALITY_RE = /^(Vietnamese|Italian|Chinese|Japanese|Korean|Taiwanese|Mexican|Indian|Thai|French|Spanish|Greek|American|Mediterranean|German|Persian|Cuban|Brazilian|Ethiopian|Filipino|Cambodian|Burmese|Lebanese|Turkish|Pakistani|Caribbean|Peruvian|Argentine|Russian|Egyptian|Moroccan|Polish|Portuguese|Hawaiian|Asian|African|European|Latin)\b/;
  if (NATIONALITY_RE.test(displayType)) return displayType;
  return displayType.charAt(0).toLowerCase() + displayType.slice(1);
}

// Google Places returns priceLevel as enum strings (PRICE_LEVEL_INEXPENSIVE,
// _MODERATE, _EXPENSIVE, _VERY_EXPENSIVE). Normalize to $/$$/$$$/$$$$.
function priceTier(priceLevel) {
  if (!priceLevel) return null;
  const map = {
    "PRICE_LEVEL_INEXPENSIVE": "$",
    "PRICE_LEVEL_MODERATE": "$$",
    "PRICE_LEVEL_EXPENSIVE": "$$$",
    "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
    "$": "$", "$$": "$$", "$$$": "$$$", "$$$$": "$$$$",
  };
  return map[priceLevel] || null;
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
  const { cityName, street, types } = ctx;
  const priceLevel = priceTier(ctx.priceLevel);
  const type = lowerType(p.displayType || "restaurant");
  const isCoffee = /coffee|cafe|tea house/i.test(p.displayType || "");
  const isBakery = /bakery|patisserie|donut|pastry/i.test(p.displayType || "");
  const isIceCream = /ice cream|gelato|frozen yogurt|dessert/i.test(p.displayType || "");
  const isQuickBite = /sandwich|deli|bagel|breakfast restaurant/i.test(p.displayType || "");
  const isFastCasual = (types || []).includes("fast_food_restaurant") || (types || []).includes("meal_takeaway");
  const isWineBar = /\bwine bar\b/i.test(p.displayType || "");
  const isCocktailBar = /\bcocktail bar\b/i.test(p.displayType || "");
  const isBrewery = /\bbrewery|taproom\b/i.test(p.displayType || "");
  const isWinery = /\bwinery|tasting room\b/i.test(p.displayType || "");
  const isPub = /\bpub|gastropub\b/i.test(p.displayType || "");
  const isBar = !isWineBar && !isCocktailBar && !isPub && /\bbar\b/i.test(p.displayType || "");
  const isGenericRestaurant = /^restaurant$/i.test(p.displayType || "");

  if (isWineBar) {
    const t = [
      street ? `Wine bar in ${cityName} on ${street} — by-the-glass pours and small plates.` : `${cityName} wine bar — by-the-glass pours and small plates.`,
      `${cityName} wine bar${street ? ` on ${street}` : ""} for an unhurried glass.`,
      `Sit-down wine bar in ${cityName}${street ? ` on ${street}` : ""}, bottles and flights.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isCocktailBar) {
    const t = [
      street ? `${cityName} cocktail bar on ${street} — built for sitting at the bar.` : `${cityName} cocktail bar.`,
      `Cocktails in ${cityName}${street ? ` on ${street}` : ""}, mixed with care.`,
      `${cityName} cocktail spot${street ? ` on ${street}` : ""} — low light, short menu.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isBrewery) {
    const t = [
      street ? `${cityName} brewery on ${street} — taps, flights, sometimes a food truck.` : `${cityName} brewery — taps, flights, sometimes a food truck.`,
      `Drink local in ${cityName}${street ? ` on ${street}` : ""} — brewery with rotating taps.`,
      `${cityName} taproom${street ? ` on ${street}` : ""}, pour a flight and post up.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isWinery) {
    const t = [
      `${cityName} tasting room${street ? ` on ${street}` : ""} — flights and bottle pours, no rush.`,
      street ? `Winery on ${street} in ${cityName} — short pour or stay for a flight.` : `${cityName} winery — short pour or stay for a flight.`,
      `Local wine in ${cityName}${street ? ` on ${street}` : ""}, low-key tasting room.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isPub) {
    const t = [
      `${cityName} pub${street ? ` on ${street}` : ""} — pints, a bite, easy to linger.`,
      street ? `Gastropub on ${street} in ${cityName} — beers and a real food menu.` : `${cityName} gastropub — beers and a real food menu.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isBar) {
    const t = [
      `Neighborhood bar in ${cityName}${street ? ` on ${street}` : ""} — easy stop for a pint.`,
      street ? `${cityName} bar on ${street}, casual and unfussy.` : `${cityName} bar, casual and unfussy.`,
      `${cityName} watering hole${street ? ` on ${street}` : ""}.`,
    ];
    return pickTemplate(t, p.id);
  }

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
  // No priceLevel + no special subtype. Mix three variants so a city full of
  // "Restaurant" displayType places doesn't read as one identical sentence.
  if (isGenericRestaurant) {
    const t = [
      street ? `${cityName} sit-down spot on ${street}, full menu.` : `${cityName} sit-down spot, full menu.`,
      street ? `Table-service eatery on ${street} in ${cityName}.` : `Table-service eatery in ${cityName}.`,
      `${cityName} restaurant${street ? ` on ${street}` : ""} — solid neighborhood pick.`,
    ];
    return pickTemplate(t, p.id);
  }
  const t = [
    street ? `${cityName} ${type} on ${street}.` : `${cityName} ${type}.`,
    street ? `${cityName} ${type}, sit-down on ${street}.` : `Sit-down ${type} in ${cityName}.`,
    street ? `${cityName}'s ${type} on ${street}, table service.` : `${cityName}'s ${type}, table service.`,
  ];
  return pickTemplate(t, p.id);
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
  const dt = (p.displayType || "").toLowerCase();
  const isLibrary = /library/.test(dt);
  const isGallery = /gallery|art museum/.test(dt);

  if (isLibrary) {
    const t = [
      street ? `Public library on ${street} — open stacks, study tables, and quiet rooms.` : `${cityName}'s public library — open stacks, study tables, and quiet rooms.`,
      `${cityName} library, two floors of books and a kids' corner.`,
      `Free public library — easy hour with the kids or a quiet hour with a book.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isGallery) {
    return street ? `${cityName} gallery on ${street}, low-key drop-in.` : `${cityName} gallery, low-key drop-in.`;
  }
  // Real museum
  return street ? `${cityName} museum on ${street}, plan an hour or two.` : `${cityName} museum, plan an hour or two.`;
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
  const dt = (p.displayType || "").toLowerCase();
  const type = lowerType(p.displayType || "venue");
  const isClimb = /climbing|bouldering/.test(dt);
  const isArcade = /arcade|bowling|laser tag|escape|amusement/.test(dt);
  const isCinema = /movie theater|cinema/.test(dt);
  const isStage = /performing arts|theater|theatre|opera|concert hall/.test(dt);
  const isCommunity = /community center|community hall|senior center|recreation center/.test(dt);
  const isEducational = /educational institution|art studio|art school|tutoring|learning center/.test(dt);
  const isSports = /sports activity|sports complex|sports club|fitness center|gym\b/.test(dt);
  const isStore = /\bstore\b/.test(dt);

  if (isClimb) return street ? `${cityName} climbing gym on ${street} — bring shoes or rent at the desk.` : `${cityName} climbing gym.`;
  if (isArcade) {
    const t = [
      street ? `${cityName} ${type} on ${street} — solid rainy-day option.` : `${cityName} ${type} — solid rainy-day option.`,
      `${cityName} indoor ${type}${street ? ` on ${street}` : ""}, easy with a group.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isCinema) {
    const t = [
      `${cityName} cinema${street ? ` on ${street}` : ""} — catch a screening.`,
      street ? `Movies on ${street} in ${cityName}.` : `Movie theater in ${cityName}.`,
      `${cityName} movie house${street ? ` on ${street}` : ""}, check the showtimes.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isStage) {
    const t = [
      `${cityName} stage${street ? ` on ${street}` : ""} — plays, music, and seasonal runs.`,
      `Live performance venue in ${cityName}${street ? ` on ${street}` : ""}.`,
      `${cityName} theater${street ? ` on ${street}` : ""}, check the season calendar.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isCommunity) {
    const t = [
      `${cityName} community center${street ? ` on ${street}` : ""} — classes, drop-in hours, public rooms.`,
      street ? `Community space on ${street} in ${cityName}.` : `${cityName} community space.`,
      `${cityName} rec hub${street ? ` on ${street}` : ""}, open to the public.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isEducational) {
    const t = [
      `${cityName} drop-in studio${street ? ` on ${street}` : ""} — workshops and classes.`,
      `${cityName} learning space${street ? ` on ${street}` : ""}, sign up or walk in.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isSports) {
    const t = [
      street ? `${cityName} sports facility on ${street}.` : `${cityName} sports facility.`,
      `${cityName} fitness spot${street ? ` on ${street}` : ""} — drop in for a session.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isStore) {
    return street ? `${cityName} ${type} on ${street}.` : `${cityName} ${type}.`;
  }
  const t = [
    street ? `${cityName} ${type} on ${street}.` : `${cityName} ${type}.`,
    `${cityName} stop${street ? ` on ${street}` : ""} — worth a look.`,
  ];
  return pickTemplate(t, p.id);
}

function blurbForWellness(p, ctx) {
  const { cityName, street } = ctx;
  const dt = (p.displayType || "").toLowerCase();
  const type = lowerType(p.displayType || "wellness");
  const isMassage = /massage/.test(dt);
  const isSpa = /\bspa\b/.test(dt) && !isMassage;
  const isYoga = /yoga|pilates|barre/.test(dt);
  const isSalon = /\b(beauty salon|hair salon|nail salon|salon|nail|barbershop)\b/.test(dt);
  const isSkin = /skin care|skincare|skin clinic|aesthetic|facial/.test(dt);
  const isChiro = /chiropract/.test(dt);

  if (isMassage) {
    const t = [
      street ? `${cityName} massage studio on ${street} — book ahead or walk in.` : `${cityName} massage studio — book ahead or walk in.`,
      `${cityName} massage spot${street ? ` on ${street}` : ""} for a quiet hour.`,
      `Massage in ${cityName}${street ? ` on ${street}` : ""}, full menu of styles.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isSpa) {
    const t = [
      `${cityName} day spa${street ? ` on ${street}` : ""} — facials, massage, the works.`,
      street ? `Spa on ${street} in ${cityName}, full menu of treatments.` : `${cityName} spa, full menu of treatments.`,
      `${cityName} treatment spa${street ? ` on ${street}` : ""}, book a slot and unwind.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isYoga) {
    const t = [
      street ? `${cityName} ${type} on ${street} — drop-in classes most days.` : `${cityName} ${type} — drop-in classes most days.`,
      `${cityName} ${type}${street ? ` on ${street}` : ""}, schedule online and grab a mat.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isSalon) {
    const t = [
      street ? `${cityName} ${type} on ${street}, walk-in or appointment.` : `${cityName} ${type}, walk-in or appointment.`,
      `${cityName} ${type}${street ? ` on ${street}` : ""} — book a chair.`,
    ];
    return pickTemplate(t, p.id);
  }
  if (isSkin) {
    return street ? `${cityName} skincare studio on ${street} — facials and treatments.` : `${cityName} skincare studio — facials and treatments.`;
  }
  if (isChiro) {
    return street ? `${cityName} chiropractor on ${street}.` : `${cityName} chiropractor.`;
  }
  return street ? `${cityName} ${type} on ${street}.` : `${cityName} ${type}.`;
}

// MAIN --------------------------------------------------------------------
const cache = {};
let researchHits = 0, templateHits = 0;

for (const p of places) {
  const cityName = CITY_NAMES[p.city] || p.city;
  const street = extractStreet(p.address, cityName);
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
    cache[p.id] = { blurb: cleanDisplayCopy(summary), source: "editorial", category: p.category };
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
    case "neighborhood": {
      const t = [
        `${cityName}'s walkable strip — shops, food, somewhere to sit.`,
        `Wandering distance of shops and restaurants in ${cityName}${street ? ` along ${street}` : ""}.`,
        `${cityName}'s downtown — a few blocks worth of stops.`,
        `Pocket of ${cityName} you can park once and explore on foot.`,
      ];
      blurb = pickTemplate(t, p.id);
      break;
    }
    default: {
      const t = [
        street ? `${p.displayType || "Spot"} in ${cityName} on ${street}.` : `${p.displayType || "Spot"} in ${cityName}.`,
        `${cityName} stop${street ? ` on ${street}` : ""} — worth a quick visit.`,
      ];
      blurb = pickTemplate(t, p.id);
    }
  }
  cache[p.id] = { blurb: cleanDisplayCopy(blurb), source: "template", category: p.category };
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
