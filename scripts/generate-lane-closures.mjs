#!/usr/bin/env node
/**
 * generate-lane-closures.mjs
 *
 * Pulls scheduled lane and full-route closures from Caltrans District 4's
 * Lane Closure System feed (lcsStatusD04.json), filters to South Bay routes
 * starting in the next ~36 hours (overnight is the typical work window),
 * dedupes near-identical entries, and writes a compact summary for the
 * Lane Closures card.
 *
 * Run: node scripts/generate-lane-closures.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "lane-closures.json");

const SOURCE_URL = "https://cwwp2.dot.ca.gov/data/d4/lcs/lcsStatusD04.json";

// Same shortlist Freeway Pulse cares about, plus the El Camino / Skyline /
// Dumbarton / SR-92 surface arteries that residents recognize.
const SOUTH_BAY_ROUTES = new Set([
  "US-101", "I-280", "I-680", "I-880", "SR-17", "SR-85", "SR-87", "SR-237",
  "SR-84", "SR-92", "SR-82", "SR-35",
]);

// Counties that contain South-Bay-recognizable cities. Alameda is intentionally
// excluded — Oakland/Hayward closures aren't relevant to the audience.
const SOUTH_BAY_COUNTIES = new Set(["Santa Clara", "San Mateo"]);

// Far-south places we drop even when on a SB route — 101 SB through Gilroy
// matters for Salinas commuters, not San Jose readers.
const DROP_NEARBY = new Set(["Gilroy", "San Martin"]);

const WINDOW_HOURS = 36;

function pad(n) { return String(n).padStart(2, "0"); }

function fmtClock(ts) {
  // ts: { closureStartDate: "2026-05-01", closureStartTime: "21:00:00" }
  // Returned ISO is naive PT — Caltrans data is local time.
  if (!ts) return "";
  const d = ts.closureStartDate || "";
  const t = (ts.closureStartTime || "").slice(0, 5);
  return d && t ? `${d} ${t}` : "";
}

function fmtClockEnd(ts) {
  if (!ts) return "";
  const d = ts.closureEndDate || "";
  const t = (ts.closureEndTime || "").slice(0, 5);
  return d && t ? `${d} ${t}` : "";
}

function titleCase(s) {
  if (!s) return "";
  // Preserve case structure across slashes too — "RAY DR L/ROSEDALE AVE R"
  // should come out "Ray Dr L/Rosedale Ave R", not the lowercase-mid-word
  // mess that a single split-on-whitespace produces.
  return s
    .toLowerCase()
    .split(/(\s+|\/)/)
    .map((w) => {
      if (/^\s+$/.test(w) || w === "/") return w;
      if (w.length <= 2) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("")
    .replace(/\s+/g, " ");
}

function dirLabel(flow) {
  if (!flow) return "";
  // "North / South" → "Both"; "North" → "NB"; etc.
  if (/\//.test(flow)) return "Both";
  const ch = flow.trim().charAt(0).toUpperCase();
  if ("NSEW".includes(ch)) return `${ch}B`;
  return "";
}

function lanesText(lanes, total) {
  // Caltrans gives strings like "1, 2/4" or "All/1" or "Median, LShoulder, 1, 2/4".
  // We want a short "X of Y" or "Full" callout for the UI.
  if (!lanes) return "";
  if (/^all/i.test(lanes)) return "Full";
  // Strip everything after the slash and count distinct lane numbers.
  const left = lanes.split("/")[0];
  const items = left.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const numeric = items.filter((s) => /^\d+$/.test(s));
  const count = numeric.length || items.length;
  if (!count) return lanes;
  return total ? `${count} of ${total}` : `${count} lane${count === 1 ? "" : "s"}`;
}

function impactScore(c) {
  // Higher = surface higher in the list. Full closures + multi-lane on
  // major routes win.
  let s = 0;
  if (c.type === "Full") s += 100;
  const num = c.lanesClosed.match(/\d+/g);
  if (num) s += Math.min(num.length * 8, 32);
  if (/Major|Extended/i.test(c.duration)) s += 6;
  // Major route kicker — 101/280/880 outrank surface routes.
  if (/^US-101$|^I-280$|^I-880$/.test(c.route)) s += 4;
  return s;
}

async function main() {
  const res = await fetch(SOURCE_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const fallback = {
      generatedAt: new Date().toISOString(),
      source: "Caltrans District 4",
      sourceUrl: SOURCE_URL,
      windowHours: WINDOW_HOURS,
      stats: { total: 0, full: 0 },
      closures: [],
      error: `HTTP ${res.status}`,
    };
    writeFileSync(OUT_PATH, JSON.stringify(fallback, null, 2));
    console.warn(`[lane-closures] feed returned ${res.status} — wrote empty payload`);
    return;
  }
  const json = await res.json();
  const items = Array.isArray(json?.data) ? json.data : [];

  const nowEpoch = Math.floor(Date.now() / 1000);
  const windowEnd = nowEpoch + WINDOW_HOURS * 3600;

  /** @type {Array<any>} */
  const out = [];
  for (const entry of items) {
    const lcs = entry?.lcs;
    if (!lcs) continue;
    const beg = lcs.location?.begin ?? {};
    const route = beg.beginRoute;
    const county = beg.beginCounty;
    if (!route || !SOUTH_BAY_ROUTES.has(route)) continue;
    if (!SOUTH_BAY_COUNTIES.has(county)) continue;
    const place = beg.beginNearbyPlace || "";
    if (DROP_NEARBY.has(place)) continue;

    const cl = lcs.closure;
    const ts = cl?.closureTimestamp;
    const startEpoch = Number(ts?.closureStartEpoch || 0);
    const endEpoch = Number(ts?.closureEndEpoch || 0);
    if (!startEpoch || !endEpoch) continue;

    // Currently active OR starts within window.
    if (endEpoch < nowEpoch) continue;
    if (startEpoch > windowEnd) continue;

    // Long-Term construction zones (e.g. SR-82 Burlingame paving running for
    // months) aren't "tonight's news" — they're ambient. Drop closures whose
    // total span is >14 days unless they happen to be Full closures.
    const spanDays = (endEpoch - startEpoch) / 86400;
    const typeRaw0 = cl.typeOfClosure || "";
    if (spanDays > 14 && typeRaw0 !== "Full") continue;

    const lanesClosed = cl.lanesClosed || "";
    const totalLanes = Number(cl.totalExistingLanes || 0);
    const typeRaw = cl.typeOfClosure || "";

    out.push({
      id: lcs.index || `${route}-${place}-${startEpoch}`,
      route,
      direction: dirLabel(lcs.location?.travelFlowDirection || beg.beginDirection || ""),
      city: place,
      county,
      location: titleCase(beg.beginLocationName || ""),
      endLocation: titleCase(lcs.location?.end?.endLocationName || ""),
      lanesClosed,
      lanesText: lanesText(lanesClosed, totalLanes),
      totalLanes,
      type: typeRaw,
      isFull: typeRaw === "Full",
      work: cl.typeOfWork || "",
      duration: cl.durationOfClosure || "",
      delay: Number(cl.estimatedDelay || 0),
      facility: cl.facility || "",
      startEpoch,
      endEpoch,
      start: fmtClock(ts),
      end: fmtClockEnd(ts),
    });
  }

  // Dedupe near-identical closures: same route + city + start hour + work +
  // closure type. Caltrans often files multiple parallel records for left
  // shoulder + median + lanes 1-2, all reading the same to a driver.
  const dedup = new Map();
  for (const c of out) {
    const startHourKey = c.start.replace(/:\d{2}$/, "");
    const key = `${c.route}|${c.city}|${c.direction}|${startHourKey}|${c.work}|${c.type}`;
    const prev = dedup.get(key);
    if (!prev || impactScore(c) > impactScore(prev)) dedup.set(key, c);
  }
  const deduped = [...dedup.values()];

  deduped.sort((a, b) => {
    // Active-now first, then earliest start, with ties broken by impact.
    const aActive = a.startEpoch <= nowEpoch ? 0 : 1;
    const bActive = b.startEpoch <= nowEpoch ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    if (a.startEpoch !== b.startEpoch) return a.startEpoch - b.startEpoch;
    return impactScore(b) - impactScore(a);
  });

  // Cap to the most useful subset for the card. The full filtered list is
  // still ~150 entries, but a driver only needs the headline picture.
  const TOP_N = 12;
  const trimmed = deduped.slice(0, TOP_N);

  const stats = {
    total: deduped.length,
    full: deduped.filter((c) => c.isFull).length,
    activeNow: deduped.filter((c) => c.startEpoch <= nowEpoch).length,
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "Caltrans District 4",
    sourceUrl: SOURCE_URL,
    windowHours: WINDOW_HOURS,
    stats,
    closures: trimmed,
  };

  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(
    `[lane-closures] ${stats.total} closures (${stats.full} full, ${stats.activeNow} active) → top ${trimmed.length} written`,
  );
}

main().catch((err) => {
  console.error("[lane-closures] failed:", err);
  process.exit(1);
});
