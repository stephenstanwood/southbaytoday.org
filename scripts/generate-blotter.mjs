#!/usr/bin/env node
/**
 * generate-blotter.mjs
 *
 * Fetches recent police calls-for-service data from public open data APIs
 * and writes them to src/data/south-bay/blotter.json.
 *
 * Currently supports:
 *   - San Jose (data.sanjoseca.gov CKAN API)
 *
 * Usage:
 *   node scripts/generate-blotter.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "blotter.json");

// ── San Jose Open Data (CKAN API) ──
// https://data.sanjoseca.gov/dataset/police-calls-for-service

async function fetchSanJoseBlotter() {
  console.log("  ⏳ San José (CKAN API)...");

  // First find the correct resource ID for the current year's data
  let records;
  try {
    const searchUrl = `https://data.sanjoseca.gov/api/3/action/package_show?id=police-calls-for-service`;
    const pkgRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15_000) });
    if (!pkgRes.ok) throw new Error(`Package API returned ${pkgRes.status}`);
    const pkg = await pkgRes.json();
    if (!pkg.success) throw new Error("Package not found");

    const resources = pkg.result?.resources ?? [];
    // Find the current year's datastore resource
    const currentYear = new Date().getFullYear().toString();
    const resource = resources.find(
      (r) => r.name?.includes(currentYear) && r.datastore_active,
    ) ?? resources.find((r) => r.datastore_active);

    if (resource) {
      console.log(`     Using resource: ${resource.name} (${resource.id})`);
      const apiUrl =
        `https://data.sanjoseca.gov/api/3/action/datastore_search` +
        `?resource_id=${resource.id}` +
        `&sort=REPORT_DATE desc` +
        `&limit=50`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.result?.records) {
          records = data.result.records;
        }
      }
    }

    if (!records) {
      console.log("     Datastore not available, trying CSV...");
      records = await fetchSanJoseCsvFallback();
    }
  } catch (err) {
    console.log(`  ⚠️  San José API failed: ${err.message}`);
    console.log("     Trying CSV fallback...");
    records = await fetchSanJoseCsvFallback();
  }

  if (!records || records.length === 0) {
    console.log("  ⚠️  San José: no records found");
    return null;
  }

  // Map to blotter entries, filtering out canceled/unfounded
  const skipDispositions = ["canceled", "unfounded", "duplicate", "disregard"];
  const entries = records
    .filter((r) => {
      if (!r.CALL_TYPE) return false;
      const addr = (r.ADDRESS || "").toLowerCase();
      const dispo = (r.FINAL_DISPO || "").toLowerCase();
      // Skip entries with no real location or canceled dispositions
      if (skipDispositions.some((s) => addr.includes(s) || dispo.includes(s))) return false;
      if (!r.ADDRESS || r.ADDRESS.trim().length < 5) return false;
      return true;
    })
    .slice(0, 30)
    .map((r) => ({
      date: formatDate(r.REPORT_DATE || r.OFFENSE_DATE),
      time: (r.OFFENSE_TIME || "").substring(0, 5),
      type: normalizeCallType(r.CALL_TYPE),
      location: cleanAddress(r.ADDRESS),
      priority: r.PRIORITY || undefined,
    }));

  console.log(`  ✅ San José: ${entries.length} entries`);

  return {
    city: "san-jose",
    cityName: "San José",
    entries,
    source: "SJ Open Data",
    sourceUrl: "https://data.sanjoseca.gov/dataset/police-calls-for-service",
    generatedAt: new Date().toISOString(),
  };
}

async function fetchSanJoseCsvFallback() {
  // The dataset page lists CSV resources — try to fetch the most recent year
  const searchUrl =
    `https://data.sanjoseca.gov/api/3/action/package_show?id=police-calls-for-service`;

  try {
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const pkg = await res.json();
    if (!pkg.success) return null;

    // Find the 2026 (or most recent) resource
    const resources = pkg.result?.resources ?? [];
    const csvResource = resources.find(
      (r) => r.format === "CSV" && r.name?.includes("2026"),
    ) ?? resources.find((r) => r.format === "CSV");

    if (!csvResource?.url) return null;

    // Fetch just the first ~50 lines
    const csvRes = await fetch(csvResource.url, {
      headers: { Range: "bytes=0-50000" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!csvRes.ok) return null;

    const text = await csvRes.text();
    return parseCsvToRecords(text);
  } catch {
    return null;
  }
}

function parseCsvToRecords(csv) {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  return lines.slice(1, 51).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
    const record = {};
    headers.forEach((h, i) => {
      record[h] = values[i] ?? "";
    });
    return record;
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "America/Los_Angeles",
    });
  } catch {
    return dateStr;
  }
}

function cleanAddress(addr) {
  if (!addr) return "Unknown";
  // Clean up address formatting: "[200]-[300] S 22ND ST" → "200 block S 22nd St"
  return addr
    .replace(/\[(\d+)\]-\[\d+\]\s*/g, "$1 block ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCallType(type) {
  if (!type) return "Other";
  const t = type.toLowerCase();
  if (t.includes("theft") || t.includes("larceny")) return "Theft";
  if (t.includes("burglary")) return "Burglary";
  if (t.includes("robbery")) return "Robbery";
  if (t.includes("assault") || t.includes("battery")) return "Assault";
  if (t.includes("vandal")) return "Vandalism";
  if (t.includes("disturb") || t.includes("dispute")) return "Disturbance";
  if (t.includes("trespass")) return "Trespass";
  if (t.includes("fraud") || t.includes("forgery")) return "Fraud";
  if (t.includes("dui") || t.includes("dwi")) return "DUI";
  if (t.includes("traffic")) return "Traffic";
  if (t.includes("noise")) return "Noise";
  if (t.includes("missing")) return "Missing Person";
  if (t.includes("warrant")) return "Warrant";
  if (t.includes("drug") || t.includes("narcotic")) return "Drugs";
  if (t.includes("weapon") || t.includes("shots")) return "Weapons";
  // Return cleaned-up original if no match
  return type.split(" ").slice(0, 3).map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// ── Main ──

async function main() {
  console.log("Generating police blotter data...\n");

  const blotters = {};

  const sj = await fetchSanJoseBlotter();
  if (sj) blotters[sj.city] = sj;

  // Future: add Mountain View (ArcGIS), Campbell (PDF), etc.

  writeFileSync(OUT_PATH, JSON.stringify(blotters, null, 2) + "\n");
  console.log(`\nDone — ${Object.keys(blotters).length} cities written to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
