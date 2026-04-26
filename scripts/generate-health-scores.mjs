#!/usr/bin/env node
/**
 * generate-health-scores.mjs
 *
 * Fetches recent restaurant inspection flags (yellow/red placards) from
 * Santa Clara County DEH open data (Socrata SODA API) and writes them
 * to src/data/south-bay/health-scores.json.
 *
 * Run: node scripts/generate-health-scores.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "health-scores.json");

const INSPECTIONS_URL = "https://data.sccgov.org/resource/2u2d-8jej.json";
const BUSINESSES_URL  = "https://data.sccgov.org/resource/vuw7-jmjk.json";
const VIOLATIONS_URL  = "https://data.sccgov.org/resource/wkaa-4ccv.json";

const SOUTH_BAY_CITIES = new Set([
  "CAMPBELL", "SAN JOSE", "MOUNTAIN VIEW", "SUNNYVALE", "CUPERTINO",
  "SANTA CLARA", "LOS GATOS", "SARATOGA", "LOS ALTOS", "PALO ALTO",
  "MILPITAS", "LOS ALTOS HILLS",
]);

// Last 60 days
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 60);
const cutoffDate = cutoff.toISOString().split("T")[0].replace(/-/g, ""); // YYYYMMDD

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "SouthBayToday/1.0 (southbaytoday.org; public data)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function titleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Extract a short summary from the inspection comment
function extractSummary(comment) {
  if (!comment) return null;
  // Take first sentence / line, capped at 160 chars
  const first = comment.split(/[.\n]/)[0].trim();
  if (first.length < 10) return null;
  return first.length <= 160 ? first : first.slice(0, 157) + "…";
}

async function main() {
  console.log(`Fetching Y/R inspections since ${cutoffDate}…`);

  // ── Inspections (non-green) ──
  // Note: SCC data has a typo — the field is "inpsection_id" (not "inspection_id")
  const inspQuery =
    `${INSPECTIONS_URL}?$where=result in('R','Y') AND date >= '${cutoffDate}'` +
    `&$order=date DESC&$limit=300&$select=business_id,inpsection_id,date,score,result,type,inspection_comment`;
  const rawInspections = await fetchJson(inspQuery);
  console.log(`  ${rawInspections.length} yellow/red inspections found`);

  if (rawInspections.length === 0) {
    writeFileSync(
      OUT_PATH,
      JSON.stringify({ flags: [], generatedAt: new Date().toISOString() }, null, 2) + "\n",
    );
    console.log("No flags — wrote empty file.");
    return;
  }

  // ── Businesses (batch) ──
  const businessIds = [...new Set(rawInspections.map((i) => i.business_id))];
  const businesses = new Map();
  const BATCH = 50;

  for (let i = 0; i < businessIds.length; i += BATCH) {
    const batch = businessIds.slice(i, i + BATCH);
    const inClause = batch.map((id) => `'${id}'`).join(",");
    const biz = await fetchJson(
      `${BUSINESSES_URL}?$where=business_id in(${inClause})&$limit=${BATCH}`,
    );
    for (const b of biz) businesses.set(b.business_id, b);
  }
  console.log(`  ${businesses.size} businesses fetched`);

  // ── Violations — top critical per inspection ──
  // The violations table uses "inspection_id" (correct spelling); matches "inpsection_id" values.
  const inspIds = rawInspections.map((i) => i.inpsection_id).filter(Boolean);
  const topViolation = new Map(); // inspection_id → description

  for (let i = 0; i < inspIds.length; i += BATCH) {
    const batch = inspIds.slice(i, i + BATCH);
    const inClause = batch.map((id) => `'${id}'`).join(",");
    const viols = await fetchJson(
      `${VIOLATIONS_URL}?$where=inspection_id in(${inClause}) AND critical=true&$limit=300`,
    );
    for (const v of viols) {
      if (!topViolation.has(v.inspection_id)) {
        topViolation.set(v.inspection_id, v.description);
      }
    }
  }

  // ── Build output ──
  const flags = rawInspections
    .map((insp) => {
      const biz = businesses.get(insp.business_id);
      if (!biz) return null;
      const cityUpper = (biz.city || "").toUpperCase().trim();
      if (!SOUTH_BAY_CITIES.has(cityUpper)) return null;

      // Parse date: "20260326" → "2026-03-26"
      const d = String(insp.date || "");
      const isoDate =
        d.length === 8
          ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
          : d;

      const inspId = insp.inpsection_id;
      const summary =
        extractSummary(insp.inspection_comment) ??
        topViolation.get(inspId) ??
        null;

      return {
        business_id: insp.business_id,
        name: titleCase(biz.name || "Unknown"),
        city: titleCase(cityUpper),
        address: titleCase(biz.address || ""),
        date: isoDate,
        score: insp.score ? parseInt(insp.score) : null,
        result: insp.result, // "R" or "Y"
        type: insp.type || null,
        summary,
      };
    })
    .filter(Boolean)
    .slice(0, 30);

  const output = {
    flags,
    generatedAt: new Date().toISOString(),
    source: "Santa Clara County Department of Environmental Health",
    sourceUrl: "https://data.sccgov.org/stories/s/SCC-DEH-Food-Facility-Inspections-Data/8ptb-6646/",
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n✅ ${flags.length} flags written to health-scores.json`);
  flags.slice(0, 10).forEach((f) =>
    console.log(`  • [${f.result}] ${f.name} — ${f.city} (${f.date}) score=${f.score ?? "?"}`)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
