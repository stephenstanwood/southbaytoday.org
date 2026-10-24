#!/usr/bin/env node
/**
 * generate-restaurant-radar.mjs
 *
 * Fetches recent restaurant-related building permits from:
 *   - San Jose (the city's published CC0 CSV download)
 * Palo Alto Permit View collection is retired: republication needs written
 * permission. See docs/qa/2026-10-24-0507-fact-check.md.
 * to surface new buildouts, openings, and closures.
 *
 * Run: node scripts/generate-restaurant-radar.mjs
 */

import { writeFileAtomic } from "./lib/io.mjs";
import { fetchSanJosePermitRecords } from "./lib/san-jose-permits.mjs";
import { ARTIFACTS } from "./lib/paths.mjs";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? "";

/**
 * Manual overrides — keyed by "city:address" (lowercase, normalized).
 * These survive regeneration and fill in name/blurb when permit text is ambiguous.
 * city: the city id (e.g. "san-jose", "palo-alto")
 * address: the formatted address string as it appears in the output
 */
/**
 * Addresses to exclude entirely — keyed by "city:address".
 * Use for non-food false positives that slip through the keyword filter.
 */
const SKIP_ADDRESSES = new Set([
  "palo-alto:220 Hamilton Av", // Palo Alto Eyes — eyewear store, not food
]);

const MANUAL_OVERRIDES = {
  // Palo Alto: name inside quotes in description, not caught by extractor
  "palo-alto:121 Lytton Av": { name: "Rikyu", blurb: "Japanese restaurant fitting out a new space on Lytton Ave" },
  // Palo Alto: name in all-caps before colon in description
  "palo-alto:338 University Av": { name: "Zhangling Malatang", blurb: "Sichuan-style malatang — customizable spicy hot pot — coming to University Ave" },
  // San Jose: known blurbs for named spots
  "san-jose:2855 Stevens Creek Bl": { blurb: "Korean BBQ chain known for tabletop charcoal grilling and premium cuts" },
  "san-jose:355 Santana Row": { blurb: "California seasonal cuisine with a botanical-inspired menu, opening on Santana Row" },
  "san-jose:233 W Santa Clara St": { blurb: "Historic cocktail lounge inside the Hotel De Anza, a downtown San Jose landmark since 1931" },
  "san-jose:22 N White Rd": { blurb: "Mexican tortilleria and taqueria on the east side" },
  "palo-alto:407 Lytton Av": { blurb: "Japanese bistro opening in downtown Palo Alto" },
  "palo-alto:401 Webster St": { blurb: "Neighborhood American kitchen undergoing a remodel on Webster St" },
  "palo-alto:388 Cambridge Av": { blurb: "SF-famous bakery known for its flaky croissants, fitting out 2,150 SF on Cambridge Ave in Palo Alto" },
  "palo-alto:552 Waverley St": { name: "Bon Broth SF", blurb: "San Francisco bone broth and Vietnamese soup restaurant fitting out a new space on Waverley St" },
  "san-jose:1725 Branham Ln": { name: "El Pollo Loco", blurb: "Mexican-style chicken chain on Branham Lane near Almaden Valley getting updated signage" },
  "san-jose:1200 El Paseo De Saratoga": { name: "Sweetgreen", blurb: "National salad chain adding signage at El Paseo de Saratoga shopping center near West San Jose" },
  "san-jose:2040 N 1st St": { blurb: "Longtime nightclub and restaurant near SAP Center filed a full demolition permit — may be permanently closing" },
  "san-jose:3062 Story Rd": { blurb: "New coffee shop fitting out a $350K space on Story Road in East San Jose" },
  "san-jose:2549 S King Rd": { blurb: "New restaurant fitting out a space on South King Road in East San Jose" },
  "san-jose:1080 Saratoga Av": { blurb: "BBQ joint on Saratoga Avenue in west San Jose renovating its interior" },
  "san-jose:3243 S White Rd": { blurb: "Round Table Pizza franchise fitting out a new location on South White Road in East San Jose" },
};

const OUT_PATH = ARTIFACTS.restaurantRadar;

// Match the permit's own work and business fields, rather than an unrelated
// owner/applicant name. Reading the full download also avoids API result caps.
const FOOD_TERMS = /\b(?:restaurant|caf[eé]|bakery|food\s+service|bar|brewery|winery|kitchen)\b/i;

// Work types that signal new/opening activity
const OPENING_WORK_TYPES = new Set([
  "tenant improvement",
  "finish interior",
  "new construction",
  "addition",
  "alteration",
  "change of occupancy",
]);

// Work types that signal closure/removal
const CLOSING_WORK_TYPES = new Set(["demolition"]);

function parseDate(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)\/(\d+)\/(\d{4})/);
  if (!match) return null;
  const [, m, d, y] = match;
  return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00-08:00`);
}

function formatAddress(raw) {
  if (!raw) return "";
  const clean = raw.replace(/\s+/g, " ").trim();
  const parts = clean.split(",");
  const street = parts[0]?.trim() ?? clean;
  return street
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .replace(/ (\d+)$/, " #$1")
    // Spanish prepositions in proper-noun South Bay place names stay lowercase
    // after the title-caser ("El Paseo de Saratoga"). Skip "De Anza" — that's a
    // surname (Juan Bautista de Anza) rendered as "De Anza" in local naming.
    .replace(/\bEl Paseo De\b/g, "El Paseo de")
    .trim();
}

// Permit-process boilerplate that survives the noise-stripping above and would
// otherwise be published as a restaurant name. Real examples that shipped to the
// Food tab: "Occupancy Certificate", "Permit To Final For 23-126633", "Code -",
// "Permit To Allow Completion -Kushinari". These describe the paperwork, not the
// business. Reject them so the item falls through to the Google Places lookup
// (which resolves the real tenant from the address) or drops at render time.
// Missing > wrong.
const PERMIT_PROCESS_PATTERNS = [
  /^permit\b/i,                       // "Permit To Final For …", "Permit To Allow Completion -…"
  /^code\b/i,                         // "Code - Demo Covered Patio" → "Code -"
  /\boccupancy\s+certificate\b/i,
  /^certificate\s+of\b/i,
  /^(re)?inspection\b/i,
  /^revision\b/i,
  /^temp(orary)?\s+(power|occupancy)\b/i,
  /^change\s+of\s+(use|occupancy|contractor)\b/i,
  /^(final|partial)\b/i,
];

// San Jose permit records and Google Places both return bilingual business names
// with a trailing CJK rendering ("Hearth BBQ炉边烧烤"). Drop the CJK half so the
// card reads as one name — same convention as cleanTitle() in generate-events.
function stripBilingualSuffix(name) {
  if (!name) return name;
  const stripped = name
    .replace(
      /[\s·・|/—–-]*[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]+\s*$/,
      "",
    )
    .trim();
  // Only take the strip if a Latin-script name survives — an entirely CJK name
  // is the real name, not a suffix.
  return /[A-Za-z]/.test(stripped) ? stripped : name;
}

/**
 * Try to extract a business name from a San Jose permit FOLDERNAME.
 * Permit names follow patterns like:
 *   "(Bepm100%) Flora Ti"
 *   "(Bepm100%) Srp La Victoria Ti"
 *   "Srp (Bemp100%) Fomo Ti #A16"
 *   "Jc'S Bbq (Bepm 100%) Interior Ti"
 *   "Taco Bell (E 100%) Sign"
 *   "(Bp100%) Demo Restaurant"  ← no real name, return null
 *   "(B) Occupancy Certificate" ← permit paperwork, return null
 */
function extractName(raw) {
  if (!raw) return null;
  let s = raw.trim();

  // Remove ALL parenthetical expressions (permit codes, completion %)
  s = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

  // Strip "Srp " prefix (placeholder owner code used by SJ)
  s = s.replace(/^Srp\s+/i, "").trim();

  // Strip trailing noise: "Ti", "#A16", "#1808 Restaurant Ti", "Interior", etc.
  s = s.replace(/\s+#\s*\d+.*$/, "").trim();
  // "Illuminated" and "Construction" are scope words, not name words: without them
  // "Scott'S Ballroom (E 100%) Illuminated Sign" shipped as "Scott's Ballroom Illuminated"
  // and "Chick-Fil-A (Bepm 100%) New Construction" shipped as "Chick-Fil-A New Construction".
  // The alternation matches leftmost, so " Illuminated Sign" goes in one pass; "Construction"
  // leaves a dangling "New" that the next replace clears.
  s = s.replace(/\s+(Interior|Restaurant|Tenant|Improvement|Ti|Demo|Sign|Illuminated|Construction|Tbd)\b.*$/i, "").trim();
  // Strip dangling permit words left after previous stripping (e.g. "Pollo Loco New" ← from "New Sign")
  s = s.replace(/\s+(New|Old|Existing|Remodel)\s*$/i, "").trim();

  // Strip trailing punctuation/spaces
  s = s.replace(/[,\s]+$/, "").trim();

  // Too short or too generic → no name
  if (!s || s.length < 3) return null;
  // Anchored ^…$ — only fires when the WHOLE extracted name is the generic word, so a
  // real "Halal Guys" or "Pizza My Heart" is untouched. The cuisine adjectives matter
  // because "Indian (Bepm100%) Restaurant Ti" strips down to a bare "Indian", which
  // shipped to the Food tab as a restaurant name. Missing > wrong: returning null sends
  // it to the Google Places lookup that resolves the real tenant from the address.
  const generic =
    /^(demo|demolition|n\/a|restaurant|kitchen|bar|cafe|bakery|food|deli|grill|market|coffee|boba|pizza|sushi|seafood|bbq|indian|chinese|mexican|thai|italian|japanese|korean|vietnamese|mediterranean|greek|american|asian|halal)$/i;
  if (generic.test(s)) return null;

  // Describes the permit paperwork rather than a business → no name
  if (PERMIT_PROCESS_PATTERNS.some((re) => re.test(s))) return null;

  // Title-case the result. The negative lookbehind keeps possessives lowercase —
  // a bare /\b\w/ capitalizes the S in "Jc'S Bbq" and shipped "JC'S BBQ".
  const titled = s
    .toLowerCase()
    .replace(/(?<!['’])\b\w/g, (c) => c.toUpperCase())
    .replace(/\bBbq\b/gi, "BBQ")
    .replace(/\bJc\b/gi, "JC")
    // The title-caser capitalizes after every hyphen, which misspells brands that
    // don't. Match the chain's own registered casing.
    .replace(/\bChick-Fil-A\b/gi, "Chick-fil-A");

  return stripBilingualSuffix(titled);
}

function signalFromWork(workType) {
  const w = workType.toLowerCase();
  if (CLOSING_WORK_TYPES.has(w)) return "closing";
  if (OPENING_WORK_TYPES.has(w)) return "opening";
  return "activity";
}

function labelFromSignal(signal, workType, valuation, folderName = "") {
  if (signal === "closing") return "Possible Closure";
  if (workType.toLowerCase().includes("finish interior") || workType.toLowerCase().includes("new construction")) {
    return "New Build";
  }
  if (workType.toLowerCase() === "tenant improvement") {
    // Signage-only TI: foldername ends in "Sign"/"Signs"/"Signage" with no other scope. Calling these
    // "Renovation" overstates what's happening — they're brand/concept refreshes at most.
    const fn = folderName.toLowerCase();
    if (/\bsign(s|age)?\s*$/.test(fn)) return "New Signage";
    if (valuation >= 500_000) return "Major Buildout";
    if (valuation >= 100_000) return "New Buildout";
    return "Renovation";
  }
  return "Permit Activity";
}

export async function generateRestaurantRadar({ fetchImpl = fetch, sleep, outputPath = OUT_PATH, placesApiKey = GOOGLE_PLACES_API_KEY, now = new Date() } = {}) {
  console.log("Fetching restaurant permit activity from San Jose open data…");

  const allRecords = (await fetchSanJosePermitRecords({ fetchImpl, sleep })).filter((record) =>
    FOOD_TERMS.test([record.FOLDERNAME, record.FOLDERDESC, record.SUBTYPEDESCRIPTION, record.WORKDESCRIPTION].join(" ")),
  );

  // Deduplicate by permit folder number
  const seen = new Set();
  const unique = allRecords.filter((r) => {
    const key = r.FOLDERNUMBER || r.FOLDERRSN;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`  ${unique.length} unique permits after dedup`);

  // Filter + enrich
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - 45);

  const items = unique
    .map((r) => {
      const date = parseDate(r.ISSUEDATE);
      if (!date || date < cutoffDate) return null;

      // Skip residential permits (kitchen remodel in houses, condos, etc.)
      const folderDesc = (r.FOLDERDESC ?? "").toLowerCase();
      const subDesc = (r.SUBTYPEDESCRIPTION ?? "").toLowerCase();
      const isResidential =
        folderDesc.includes("family") ||
        folderDesc.includes("dwelling") ||
        folderDesc.includes("residential") ||
        subDesc.includes("single-family") ||
        subDesc.includes("condo") ||
        subDesc.includes("duplex");
      if (isResidential) return null;

      const workType = (r.WORKDESCRIPTION ?? "").trim();
      const subtype = (r.SUBTYPEDESCRIPTION ?? r.FOLDERDESC ?? "").trim();
      const valuation = parseInt(r.PERMITVALUATION ?? "0", 10) || 0;
      const signal = signalFromWork(workType);
      const label = labelFromSignal(signal, workType, valuation, r.FOLDERNAME ?? "");

      // Skip very minor work (sub-trades, re-roofs, signage) unless demolition
      const workLower = workType.toLowerCase();
      if (
        signal !== "closing" &&
        (workLower.includes("sub-trade") ||
          workLower.includes("reroof") ||
          workLower.includes("re-roof") ||
          workLower.includes("sign") ||
          workLower.includes("temporary power") ||
          workLower === "plumbing only" ||
          workLower === "electrical only" ||
          workLower === "mechanical only")
      ) {
        return null;
      }

      // The WORKDESCRIPTION for equipment swaps is the generic "Tenant
      // Improvement", so the minor-work list above never sees them and they
      // land as "opening / New Buildout" — telling readers a restaurant is
      // coming when the permit replaces a rooftop unit at a business that has
      // been open for years. "Martha's Kitchen Hvac Replacement" (749 Story Rd,
      // an established nonprofit soup kitchen, subtype Commercial/Industrial)
      // shipped that way on 2026-08-29. The equipment detail only ever appears
      // in FOLDERNAME, so test that instead of the work type.
      const folderLower = String(r.FOLDERNAME ?? "").toLowerCase();
      const isEquipmentReplacement =
        /\b(hvac|rooftop unit|rtu|water heater|grease (?:interceptor|trap)|hood|ansul|fire sprinkler|fire alarm|boiler|condenser|compressor|walk-?in (?:cooler|freezer))\b/.test(folderLower) &&
        /\b(replacement|replace|repair|upgrade|retrofit|maintenance)\b/.test(folderLower);
      if (signal !== "closing" && isEquipmentReplacement) return null;

      const rawName = r.FOLDERNAME ?? null;
      const name = extractName(rawName);

      return {
        id: r.FOLDERNUMBER || r.FOLDERRSN,
        city: "san-jose",
        address: formatAddress(r.gx_location),
        name: name ?? null,
        description: rawName
          ? rawName.trim()
              .toLowerCase()
              .replace(/\b\w/g, (c) => c.toUpperCase())
          : workType,
        workType,
        subtype,
        signal,
        label,
        valuation,
        date: date.toISOString().slice(0, 10),
      };
    })
    .filter(Boolean);

  // Sort: closing first (most newsworthy), then by valuation desc, then date desc
  items.sort((a, b) => {
    if (a.signal === "closing" && b.signal !== "closing") return -1;
    if (b.signal === "closing" && a.signal !== "closing") return 1;
    if (b.valuation !== a.valuation) return b.valuation - a.valuation;
    return b.date.localeCompare(a.date);
  });

  // Enrich SJ items missing names using Google Places (best-effort)
  const topSjItems = items.slice(0, 15);
  if (placesApiKey) {
    const unnamed = topSjItems.filter((it) => !it.name);
    if (unnamed.length > 0) {
      console.log(`\n  🔍 Looking up ${unnamed.length} unnamed SJ permit locations via Google Places…`);
      for (const item of unnamed) {
        try {
          const query = `restaurant ${item.address}, San Jose, CA`;
          const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=name,formatted_address,business_status&key=${placesApiKey}`;
          const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) continue;
          const data = await res.json();
          const candidate = data.candidates?.[0];
          const placeName = stripBilingualSuffix(candidate?.name);
          if (placeName) {
            item.name = placeName;
            const status = candidate.business_status;
            if (status === "CLOSED_PERMANENTLY" || status === "CLOSED_TEMPORARILY") {
              item.description = `${placeName} (${status === "CLOSED_PERMANENTLY" ? "permanently closed" : "temporarily closed"})`;
            }
            console.log(`    ✓ ${item.address} → ${placeName}${status ? ` [${status}]` : ""}`);
          }
          await new Promise((r) => setTimeout(r, 200)); // rate limit
        } catch (err) {
          console.log(`    ⚠️ ${item.address}: ${err.message}`);
        }
      }
    }
  }

  // Combine and sort: opening/closure signals first, then by date desc
  const allItems = [...topSjItems];
  allItems.sort((a, b) => {
    if (a.signal === "closing" && b.signal !== "closing") return -1;
    if (b.signal === "closing" && a.signal !== "closing") return 1;
    if (a.signal === "opening" && b.signal !== "opening") return -1;
    if (b.signal === "opening" && a.signal !== "opening") return 1;
    if (b.valuation !== a.valuation) return b.valuation - a.valuation;
    return b.date.localeCompare(a.date);
  });

  // Filter out known non-food false positives
  const filtered = allItems.filter((item) => {
    const key = `${item.city ?? ""}:${item.address}`;
    return !SKIP_ADDRESSES.has(key);
  });

  // Apply manual overrides (name, blurb) keyed by "city:address"
  for (const item of filtered) {
    const key = `${item.city ?? ""}:${item.address}`;
    const override = MANUAL_OVERRIDES[key];
    if (override) {
      if (override.name) item.name = override.name;  // name override always wins
      if (override.blurb) item.blurb = item.blurb ?? override.blurb;
    }
  }

  const allItems_final = filtered;

  const output = {
    generatedAt: now.toISOString(),
    cities: ["San Jose"],
    windowDays: 60,
    items: allItems_final,
  };

  writeFileAtomic(outputPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n✅ ${allItems.length} restaurant permit signals (San José: ${topSjItems.length}) → restaurant-radar.json`);
  allItems.forEach((it) =>
    console.log(`  [${it.city}][${it.label}] ${it.address}${it.name ? ` — ${it.name}` : ""}${it.valuation ? ` ($${it.valuation.toLocaleString()})` : ""}`)
  );
}

// Only run the scrape when invoked directly — importing this module for tests
// must not fire network requests (same guard as generate-events.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  generateRestaurantRadar().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}

export { extractName, stripBilingualSuffix };
