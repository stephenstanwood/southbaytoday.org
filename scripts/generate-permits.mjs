/**
 * generate-permits.mjs
 * Fetches building permits issued in the last 7 days from:
 *   - San Jose (the city's published CC0 CSV download)
 * Palo Alto Permit View collection is retired: its user agreement prohibits
 * republication without written permission. See docs/qa/2026-10-24-0507-fact-check.md.
 * Outputs permit-pulse.json for the PermitPulseCard component.
 *
 * Cities investigated but blocked (as of April 2026):
 *   - Mountain View: developmentpermits.mountainview.gov → 403 (blocked by server)
 *                    epermits.mountainview.gov → React SPA for permit applications, no data API
 *                    data-mountainview.opendata.arcgis.com → 22 geographic datasets, no permit data
 *                    data.mountainview.gov → ECONNREFUSED (dead)
 *                    Mountain View uses an internal permit system with no public API.
 *   - Sunnyvale: data.sunnyvale.ca.gov, epermits.sunnyvale.ca.gov → all ECONNREFUSED/timeout
 *                No Socrata or ArcGIS public permit dataset found.
 */

import { readFileSync } from "fs";
import { writeFileAtomic } from "./lib/io.mjs";
import { fetchSanJosePermitRecords } from "./lib/san-jose-permits.mjs";
import { ARTIFACTS } from "./lib/paths.mjs";

const OUTPUT_PATH = ARTIFACTS.permits;

const WINDOW_DAYS = 7;

function parseDate(str) {
  if (!str) return null;
  // Format: "3/28/2026 12:00:00 AM"
  const match = str.match(/^(\d+)\/(\d+)\/(\d{4})/);
  if (!match) return null;
  const [, m, d, y] = match;
  return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00-08:00`);
}

function toIsoDate(d) {
  if (!d) return null;
  return d.toISOString().split("T")[0];
}

function formatAddress(raw) {
  if (!raw) return "";
  // "1234  MAIN ST  , SAN JOSE CA 95110-1234" -> "1234 Main St"
  const clean = raw.replace(/\s+/g, " ").trim();
  const parts = clean.split(",");
  const street = parts[0]?.trim() ?? clean;
  // Title-case
  return street
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .replace(/ (\d+)$/, " #$1") // trailing unit number: "1234 Main St 2" -> "1234 Main St #2"
    .trim();
}

export function cleanDescription(raw, workType, subtype) {
  if (!raw) return workType ?? "";
  let s = raw.trim();
  // Strip the below-market-rate flag San José appends to affordable filings.
  // The feed has used BEMP, BEPM, and the shortened BEM spelling for this
  // below-market-rate flag. Keep all three out of reader-facing project names.
  s = s.replace(/\((?:BEMP|BEPM|BEM)\s*\d+%\)\s*/gi, "");
  // Strip "(STAR)" flag
  s = s.replace(/\(STAR\)\s*/gi, "");
  // Strip "(B)" or "(E)" standalone flags
  s = s.replace(/^\([A-Z]\)\s*/, "");
  // Strip "UNOCCUPIED" standalone
  s = s.replace(/^UNOCCUPIED\s*/i, "");
  // San Jose sometimes truncates the redundant "Finish Interior" work-type
  // suffix to a bare "FI" at the end of FOLDERNAME. The structured workType
  // already carries that information, so do not publish the fragment.
  if (/^Finish Interior$/i.test(workType ?? "")) s = s.replace(/\s+FI$/i, "");
  // Clean up double spaces
  s = s.replace(/\s+/g, " ").trim();
  // If empty after stripping, fall back
  if (!s) return subtype || workType || "";
  // Title-case
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    // Keep small words lowercase in title-case
    .replace(/\b(Of|At|And|Or|The|A|In|To|For)\b/g, (m) => m.toLowerCase())
    // Uppercase permit-acronyms that title-case mangles (ADU = accessory
    // dwelling unit, TI = tenant improvement, SFR = single family residence,
    // ADUs as plural, PLD = Prologis project prefix common in San José
    // industrial filings).
    // SFD = single-family dwelling, MF = multi-family, DU = dwelling unit —
    // the same shape as ADU/SFR and just as unreadable title-cased ("Mf ADU
    // Unit 10", "Comm Hill 3.2 New Sfd").
    .replace(/\b(Adu|Adus|Jadu|Ti|Sfr|Sfd|Mf|Du|Hvac|Pld)\b/g, (m) => m.toUpperCase())
    .replace(/\bAdu's\b/g, "ADU's")
    // Restore the single-letter block/phase/building designation the small-word
    // rule above downcases. "Block A Family Affordable Apts" is a phase name,
    // not an article, and "Block a Family…" reads as a verb phrase.
    .replace(/\b(Block|Bldg|Building|Phase|Lot|Parcel|Tower|Unit|Area)\s+a\b/g, (_, w) => `${w} A`)
    // KB Home files hundreds of San José tract permits under its own name; the
    // generic title-case turns the brand into "Kb Home".
    .replace(/\bKb Home\b/g, "KB Home")
    .replace(/^(\w)/, (c) => c.toUpperCase());
}

function categorize(record) {
  const desc = (record.FOLDERDESC ?? "").toLowerCase();
  const work = (record.WORKDESCRIPTION ?? "").toLowerCase();
  const name = (record.FOLDERNAME ?? "").toLowerCase();
  const val = parseInt(record.PERMITVALUATION ?? "0", 10) || 0;
  const units = parseInt(record.DWELLINGUNITS ?? "0", 10) || 0;

  const isResidential =
    desc.includes("family") ||
    desc.includes("dwelling") ||
    desc.includes("residential") ||
    desc.includes("accessory");
  const isMultiFamily =
    desc.includes("multiple") || desc.includes("multi") || units > 2;
  const isCommercial = desc.includes("commercial") || desc.includes("industrial");
  const isNewConstruction =
    work.includes("new construction") || work.includes("new constr");
  const isAddition = work.includes("addition") || work.includes("alteration");

  // Skip boring residential maintenance — reroofs, HVAC, water heaters, etc.
  const isRoutineMaintenance =
    work.includes("reroof") ||
    work.includes("re-roof") ||
    work.includes("roofing") ||
    work.includes("roof replacement") ||
    work.includes("hvac") ||
    work.includes("water heater") ||
    work.includes("furnace") ||
    work.includes("solar panel") ||
    work.includes("electrical panel") ||
    work.includes("sewer") ||
    work.includes("plumbing");
  if (isResidential && isRoutineMaintenance) return null;

  if (isResidential && isNewConstruction) {
    return isMultiFamily ? "multi-family-new" : "residential-new";
  }
  if (isCommercial && val >= 200_000) {
    return "commercial-large";
  }
  if (isResidential && val >= 200_000) {
    return "residential-large";
  }
  if (isNewConstruction) {
    return "new-construction";
  }
  if (isCommercial && val >= 50_000) {
    return "commercial";
  }
  return null; // not interesting enough
}

const CATEGORY_LABELS = {
  "multi-family-new": "New Multi-Family",
  "residential-new": "New Home",
  "commercial-large": "Commercial Project",
  "residential-large": "Major Renovation",
  "new-construction": "New Construction",
  commercial: "Commercial",
};

function formatDateRange(cutoff, now) {
  const opts = { month: "short", day: "numeric", timeZone: "America/Los_Angeles" };
  const start = cutoff.toLocaleDateString("en-US", opts);
  const end = now.toLocaleDateString("en-US", opts);
  return `${start} – ${end}`;
}

export async function generatePermitPulse({ fetchImpl = fetch, sleep, outputPath = OUTPUT_PATH, now = new Date() } = {}) {
  console.log("🏗️  Fetching San Jose building permits...");

  const cutoffRaw = new Date(now);
  cutoffRaw.setDate(cutoffRaw.getDate() - WINDOW_DAYS);
  // Floor to the start of that Pacific day, in the same -08:00 frame parseDate
  // uses for ISSUEDATE. A raw now-minus-7d cutoff (e.g. Sep 15 8pm) dropped
  // every permit issued on Sep 15 while the label still read "Sep 15 – Sep 22"
  // (Trimble Summerhill 5-plex vanished from the 2026-09-22 run).
  const cutoffDay = cutoffRaw.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const cutoff = new Date(`${cutoffDay}T00:00:00-08:00`);

  let records;
  try {
    records = await fetchSanJosePermitRecords({ fetchImpl, sleep });
  } catch (err) {
    console.error("  ❌ Failed to fetch permits:", err.message);
    throw err;
  }

  console.log(`  📋 Fetched ${records.length} total records from last-30-days dataset`);

  // Filter to window
  const recent = records.filter((r) => {
    const d = parseDate(r.ISSUEDATE);
    return d && d >= cutoff;
  });

  console.log(`  📅 ${recent.length} permits issued in last ${WINDOW_DAYS} days`);

  // Categorize and filter for interesting permits
  const notable = [];
  let newUnits = 0;
  let totalValuation = 0;

  for (const r of recent) {
    const cat = categorize(r);
    const val = parseInt(r.PERMITVALUATION ?? "0", 10) || 0;
    const units = parseInt(r.DWELLINGUNITS ?? "0", 10) || 0;
    const work = (r.WORKDESCRIPTION ?? "").toLowerCase();
    const isNewConstr = work.includes("new construction") || work.includes("new constr");

    totalValuation += val;

    if (isNewConstr && units > 0) {
      newUnits += units;
    }

    if (cat) {
      notable.push({
        id: r.FOLDERNUMBER ?? r.FOLDERRSN,
        address: formatAddress(r.gx_location),
        category: cat,
        categoryLabel: CATEGORY_LABELS[cat] ?? cat,
        workType: r.WORKDESCRIPTION ?? "",
        description: cleanDescription(r.FOLDERNAME, r.WORKDESCRIPTION, r.SUBTYPEDESCRIPTION),
        valuation: val,
        units: parseInt(r.DWELLINGUNITS ?? "0", 10) || 0,
        issueDate: toIsoDate(parseDate(r.ISSUEDATE)),
        subtype: r.SUBTYPEDESCRIPTION ?? "",
      });
    }
  }

  // Sort: new construction first, then by valuation desc
  const CATEGORY_PRIORITY = {
    "multi-family-new": 0,
    "residential-new": 1,
    "new-construction": 2,
    "commercial-large": 3,
    "residential-large": 4,
    commercial: 5,
  };
  notable.sort((a, b) => {
    const pa = CATEGORY_PRIORITY[a.category] ?? 99;
    const pb = CATEGORY_PRIORITY[b.category] ?? 99;
    if (pa !== pb) return pa - pb;
    return b.valuation - a.valuation;
  });

  const top = notable.slice(0, 10);

  const cityEntry = {
    generatedAt: now.toISOString(),
    city: "San Jose",
    source: "data.sanjoseca.gov",
    sourceUrl: "https://data.sanjoseca.gov/dataset/last-30-days-building-permits",
    windowDays: WINDOW_DAYS,
    dateRange: formatDateRange(cutoff, now),
    stats: {
      total: recent.length,
      notable: notable.length,
      newUnits,
      totalValuation,
    },
    permits: top,
  };

  // Preserve other cities, but never carry the retired Permit View rows forward.
  let existing = { cities: {} };
  try {
    existing = JSON.parse(readFileSync(outputPath, "utf-8"));
  } catch {}
  const cities = { ...existing.cities };
  delete cities["palo-alto"];
  const output = { cities: { ...cities, "san-jose": cityEntry } };

  writeFileAtomic(outputPath, JSON.stringify(output, null, 2));
  console.log(
    `  ✅ Done — ${recent.length} permits this week, ${notable.length} notable, ${newUnits} new units → permit-pulse.json`
  );
  if (top.length > 0) {
    console.log("  Top permits:");
    for (const p of top.slice(0, 5)) {
      console.log(
        `    [${p.categoryLabel}] ${p.address} — $${(p.valuation / 1000).toFixed(0)}k ${p.workType}`
      );
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generatePermitPulse().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
