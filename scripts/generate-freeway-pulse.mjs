#!/usr/bin/env node
/**
 * generate-freeway-pulse.mjs
 *
 * Pulls live travel times from Caltrans District 4's dynamic message
 * signs (cmsStatusD04.json), filters to Santa Clara County signs that
 * are currently in service, and writes a compact per-route+direction
 * snapshot for the Freeway Pulse card.
 *
 * Travel-time messages look like "SJ ARPT  19 MIN / MILPITAS  18 MIN".
 * If a sign is showing an incident or AMBER alert instead of travel
 * times we surface the raw lines as `alert: true` so the UI can flag it.
 *
 * Run: node scripts/generate-freeway-pulse.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "freeway-pulse.json");

const SOURCE_URL = "https://cwwp2.dot.ca.gov/data/d4/cms/cmsStatusD04.json";

// Routes we care about for South Bay residents. Anything else (US-101 in
// Marin, I-80 in SF, etc.) gets dropped even if it's in Santa Clara County.
const SOUTH_BAY_ROUTES = new Set([
  "US-101", "I-280", "I-680", "I-880", "SR-17", "SR-85", "SR-87", "SR-237",
]);

// Drop signs whose nearbyPlace is far enough south that Bay-area residents
// won't recognize the destinations. Gilroy signs mostly point at Salinas /
// Los Banos which isn't useful for the audience. Morgan Hill is borderline —
// its Metcalf-Rd sign points at Palo Alto so it stays.
const DROP_NEARBY = new Set(["Gilroy"]);

// Destinations no South Bay resident is checking commute times to. If a sign
// has nothing but these, we skip it entirely (e.g. "GILROY 14m / SALINAS 42m
// / LOS BANOS 58m" on US-101 SB).
const FAR_SOUTH_DESTINATIONS = new Set([
  "gilroy", "salinas", "los banos", "san juan bautista", "hollister",
]);

// Cities most readers actually drive through. When we have multiple signs for
// the same route+direction, prefer the one anchored at one of these.
const CENTRAL_NEARBY = new Set([
  "Palo Alto", "Mountain View", "Sunnyvale", "Santa Clara", "San Jose",
  "Cupertino", "Los Altos", "Campbell", "Los Gatos", "Milpitas", "Saratoga",
]);

// Map Caltrans abbreviations to friendly destination names.
const DEST_ALIASES = [
  [/^SJ ARPT$/i, "SJ Airport"],
  [/^SJC ARPT$/i, "SJ Airport"],
  [/^SJ STATE$/i, "SJ State"],
  [/^MTN VIEW$/i, "Mountain View"],
  [/^MORG HILL$/i, "Morgan Hill"],
  [/^SANTA CRZ$/i, "Santa Cruz"],
  [/^SCOTTS VY$/i, "Scotts Valley"],
  [/^LOS BANOS$/i, "Los Banos"],
  [/^JCT (\d+)$/i, "I-$1"],
  [/^S?(101|280|680|880|85|87|237|17)$/i, "Hwy $1"],
  [/^HWY (\d+)$/i, "Hwy $1"],
  [/^S?(\d+)\s*\/\s*(\d+)$/i, "Hwys $1/$2"],
  [/^(101|280|680|880|85|87|237|17)\s*\/\s*(\d+)$/i, "Hwys $1/$2"],
];

// Markers in Caltrans location strings that mean "the actual street name
// follows this token". e.g. "S/OF EMBARCADERO RD" -> "Embarcadero Rd".
// Handles separated ("N OF"), slashed ("N/OF"), and joined ("NOF") forms.
const STREET_MARKERS = /\b(?:[NSEW]\s?\/?\s?OF|JSO|JEO|JNO|JWO|AT|[NSEW]\/?O)\s+/i;

const STREET_TOKENS_UPPER = new Set([
  "US", "I", "SR", "HWY", "JCT", "RD", "AVE", "BLVD", "ST", "DR", "LN", "PKWY",
  "EXP", "EXPY",
]);

const ROUTE_RANK = { "US-101": 0, "I-280": 1, "I-880": 2, "I-680": 3, "SR-85": 4, "SR-17": 5, "SR-87": 6, "SR-237": 7 };
const DIR_RANK = { North: 0, South: 1, East: 2, West: 3 };

function titleCase(s) {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function friendlyDestination(raw) {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of DEST_ALIASES) {
    if (pattern.test(cleaned)) {
      return cleaned.replace(pattern, replacement);
    }
  }
  return titleCase(cleaned);
}

function cleanStreetSegment(s) {
  // Strip suffix noise (overcrossing/undercrossing tags, etc.) and tidy.
  let t = s
    .replace(/\b(OC|UC|PED OC|PED|OH|UH|MAINLINE|ML)\b/gi, "")
    .replace(/[\.\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Title-case while keeping route tokens upper and abbreviations sane.
  t = t
    .split(/\s+/)
    .map((w) => {
      const up = w.toUpperCase();
      if (STREET_TOKENS_UPPER.has(up)) {
        return up === "EXP" ? "EXPY" : up;
      }
      if (/^(EXPRSWAY|EXPRESSWAY)$/i.test(w)) return "EXPY";
      if (/^\d+$/.test(w)) return w; // route number
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
  return t;
}

function friendlyNear(locationName) {
  // "CM017-SCL 101 S/B S/OF EMBARCADERO RD OC" -> "Embarcadero Rd"
  // Caltrans encodes a CM index, an optional county prefix (SCL), and the
  // route, then a "marker word" that introduces the actual street name.
  // We grab everything after the marker.
  let s = locationName.replace(/^CMO?\d+[-\s]*/i, "");
  const markerMatch = s.match(STREET_MARKERS);
  if (markerMatch) {
    const tail = s.slice(markerMatch.index + markerMatch[0].length).trim();
    return cleanStreetSegment(tail) || cleanStreetSegment(s);
  }
  // No marker — strip leading county/route tokens and use what's left.
  s = s
    .replace(/^SCL\s*/i, "")
    .replace(/^[NSEW]B?\s*/, "")
    .replace(/^(?:US-?|I-?|SR-?|HWY\s*)?\d{2,3}\s*/i, "")
    .replace(/^[NSEW]\/?B\s*/i, "");
  return cleanStreetSegment(s) || locationName;
}

function normalizeRoute(route) {
  if (!route) return null;
  // Caltrans uses "US-101", "I-680", "SR-17". Normalize spacing.
  return route.replace(/\s+/g, "").toUpperCase().replace(/^([A-Z]+)(\d+)$/, "$1-$2");
}

function parseLine(line) {
  // Match "DEST  19 MIN" — destination is everything before the trailing
  // "<digits> MIN", which may have variable whitespace.
  const m = line.match(/^(.+?)\s+(\d+)\s*MIN\s*$/i);
  if (!m) return null;
  const minutes = parseInt(m[2], 10);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 240) return null;
  return { to: friendlyDestination(m[1]), minutes };
}

function pickSignForGroup(signs) {
  // Prefer (1) alerts so incidents always surface, (2) signs anchored in the
  // central South Bay so destinations are recognizable, (3) more parseable
  // travel-time lines, (4) most recently updated.
  return signs
    .slice()
    .sort((a, b) => {
      const aAlert = a.alert ? 1 : 0;
      const bAlert = b.alert ? 1 : 0;
      if (aAlert !== bAlert) return bAlert - aAlert;
      const aCentral = CENTRAL_NEARBY.has(a.city) ? 1 : 0;
      const bCentral = CENTRAL_NEARBY.has(b.city) ? 1 : 0;
      if (aCentral !== bCentral) return bCentral - aCentral;
      if (b.destinations.length !== a.destinations.length) {
        return b.destinations.length - a.destinations.length;
      }
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    })[0];
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "SouthBayToday/1.0 (southbaytoday.org; public Caltrans data)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function main() {
  console.log("Fetching Caltrans D4 dynamic message signs…");

  let raw;
  try {
    raw = await fetchJson(SOURCE_URL);
  } catch (err) {
    console.error("Caltrans CMS fetch failed:", err.message);
    writeFileSync(
      OUT_PATH,
      JSON.stringify(
        { signs: [], generatedAt: new Date().toISOString(), error: err.message, source: "Caltrans D4", sourceUrl: SOURCE_URL },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const items = raw.data ?? [];
  console.log(`  ${items.length} CMS records`);

  const groups = new Map();

  for (const it of items) {
    const cms = it.cms ?? {};
    const loc = cms.location ?? {};
    const msg = cms.message ?? {};
    if (loc.county !== "Santa Clara") continue;
    if (cms.inService !== "true") continue;
    const route = normalizeRoute(loc.route);
    if (!route || !SOUTH_BAY_ROUTES.has(route)) continue;
    if (DROP_NEARBY.has(loc.nearbyPlace)) continue;

    const phase = msg.phase1 ?? {};
    const lines = [phase.phase1Line1, phase.phase1Line2, phase.phase1Line3]
      .map((l) => (l ?? "").trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const destinations = [];
    const alertLines = [];
    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed) destinations.push(parsed);
      else alertLines.push(line);
    }
    // If we have travel times, treat unparsed lines as noise (often blank
    // suffixes). If we have NO travel times, the sign is broadcasting an
    // alert/incident/AMBER message — surface it as such.
    const isAlert = destinations.length === 0 && alertLines.length > 0;

    // Drop signs that only show destinations our audience doesn't drive to.
    if (
      !isAlert &&
      destinations.length > 0 &&
      destinations.every((d) => FAR_SOUTH_DESTINATIONS.has(d.to.toLowerCase()))
    ) {
      continue;
    }

    const ts = msg.messageTimestamp ?? {};
    const updatedAt = ts.messageDate && ts.messageTime
      ? `${ts.messageDate}T${ts.messageTime}`
      : null;

    const sign = {
      route,
      direction: loc.direction || "",
      near: friendlyNear(loc.locationName || ""),
      city: loc.nearbyPlace || "",
      lat: loc.latitude ? parseFloat(loc.latitude) : null,
      lng: loc.longitude ? parseFloat(loc.longitude) : null,
      destinations,
      alert: isAlert ? alertLines.join(" — ") : null,
      updatedAt,
    };

    const key = `${sign.route}|${sign.direction}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sign);
  }

  const signs = [];
  for (const [, group] of groups) {
    const pick = pickSignForGroup(group);
    if (pick) signs.push(pick);
  }

  signs.sort((a, b) => {
    const ra = ROUTE_RANK[a.route] ?? 99;
    const rb = ROUTE_RANK[b.route] ?? 99;
    if (ra !== rb) return ra - rb;
    return (DIR_RANK[a.direction] ?? 99) - (DIR_RANK[b.direction] ?? 99);
  });

  const alertCount = signs.filter((s) => s.alert).length;

  const output = {
    generatedAt: new Date().toISOString(),
    source: "Caltrans District 4",
    sourceUrl: SOURCE_URL,
    signs,
    stats: {
      totalSigns: signs.length,
      alerts: alertCount,
    },
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n✅ ${signs.length} freeway snapshot(s) written; ${alertCount} alert(s)`);
  for (const s of signs) {
    if (s.alert) {
      console.log(`  ⚠ ${s.route} ${s.direction} (${s.near}): ALERT — ${s.alert}`);
    } else {
      const summary = s.destinations.map((d) => `${d.to} ${d.minutes}m`).join(" · ");
      console.log(`  • ${s.route} ${s.direction} (${s.near}): ${summary}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
