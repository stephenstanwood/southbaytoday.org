// ---------------------------------------------------------------------------
// South Bay Signal — URL Enrichment
// Finds better, more specific URLs for candidates before URL validation.
// "We do the legwork so people don't have to."
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logStep, logSkip } from "./logger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Sports URL patterns ────────────────────────────────────────────────────

const TEAM_URL_BUILDERS = {
  // Bay FC (NWSL) — generic /schedule → match-day page
  "NWSL": (item) => {
    // bayfc.com match pages follow: /competitions/.../matches/bayvsXXX-MM-DD-YYYY
    // But the slug format is unpredictable, so link to schedule filtered by date
    // Actually Ticketmaster has specific event pages — check if there's one
    if (item.url === "https://www.bayfc.com/schedule") {
      // Try to construct a SeatGeek or Ticketmaster search URL
      const opponent = extractOpponent(item.title, "Bay FC");
      if (opponent && item.date) {
        // Use bayfc.com/competitions page with date anchor — still better than bare /schedule
        return `https://www.bayfc.com/competitions/nwsl-regular-season-2026/matches`;
      }
    }
    return null;
  },

  // SJ Earthquakes (MLS) — generic /schedule → match page
  "MLS": (item) => {
    if (item.url === "https://www.sjearthquakes.com/schedule") {
      return `https://www.sjearthquakes.com/competitions/mls-regular-season-2026/matches`;
    }
    return null;
  },

  // SJ Giants (MiLB) — generic /san-jose → game-day page
  "MiLB": (item) => {
    if (item.url === "https://www.milb.com/san-jose" && item.date) {
      // MiLB has date-filtered schedule pages
      const d = item.date.replace(/-/g, "");
      return `https://www.milb.com/san-jose/schedule/${item.date.slice(0, 7)}`;
    }
    return null;
  },

  // SCU Athletics — calendar.aspx with game_id
  "Santa Clara University": (item) => {
    // Already has specific game URLs with game_id param — keep if it has one
    if (item.url?.includes("game_id=")) return null; // already specific
    // broncos athletic pages — keep as-is if it's an event page
    if (item.url?.includes("events.scu.edu")) return null;
    return null;
  },
};

function extractOpponent(title, teamName) {
  // "Bay FC vs. Washington Spirit" → "Washington Spirit"
  const vsMatch = title.match(/vs\.?\s+(.+)/i);
  return vsMatch ? vsMatch[1].trim() : null;
}

function enrichSportsUrl(item) {
  const builder = TEAM_URL_BUILDERS[item.source];
  if (builder) {
    const better = builder(item);
    if (better) return better;
  }
  return null;
}

// ── Restaurant URL enrichment ──────────────────────────────────────────────

// Cross-reference with places.json for instant URL lookups (no API call)
let _placesCache = null;
function getPlacesIndex() {
  if (_placesCache) return _placesCache;
  try {
    const path = join(__dirname, "..", "..", "..", "src", "data", "south-bay", "places.json");
    const data = JSON.parse(readFileSync(path, "utf8"));
    _placesCache = new Map();
    for (const p of data.places || []) {
      if (p.category === "food" && (p.url || p.mapsUrl)) {
        // Index by normalized name + city for fuzzy matching
        const key = (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "") + ":" + (p.city || "");
        _placesCache.set(key, { url: p.url, mapsUrl: p.mapsUrl, name: p.name });
      }
    }
    logStep("🔗", `Loaded ${_placesCache.size} food places for cross-reference`);
  } catch {
    _placesCache = new Map();
  }
  return _placesCache;
}

function crossRefPlacesUrl(item) {
  const index = getPlacesIndex();
  const venue = (item.venue || item.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const city = item.city || "";
  // Try exact match
  const exact = index.get(venue + ":" + city);
  if (exact) return exact.mapsUrl || exact.url;
  // Try partial match (venue name contained in places name)
  for (const [key, val] of index) {
    if (key.startsWith(venue + ":") || (venue.length > 5 && key.includes(venue))) {
      return val.mapsUrl || val.url;
    }
  }
  return null;
}

async function enrichRestaurantUrl(item) {
  // Use Google Places API to find the restaurant's Google Maps URL
  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey || !item.venue) return null;

  const query = `${item.venue} ${item.cityName || item.city || ""} CA`;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const place = data.candidates?.[0];
    if (!place?.place_id) return null;

    // Google Maps URL from place_id
    return `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;
  } catch {
    return null;
  }
}

// ── Civic URL enrichment ───────────────────────────────────────────────────

function enrichCivicUrl(item) {
  // Legistar calendar pages are rejected by URL validation.
  // Try to construct a more specific meeting detail page.
  if (!item.url) return null;

  // If the URL has an EID parameter, it's already a specific event page
  if (item.url.includes("EID=")) return null; // already specific

  // If it's a bare Legistar calendar page, we can't improve it without the meeting ID
  // The around-town data sometimes has a meetingId or sourceUrl — check for those
  if (item.meetingId && item.url?.includes("legistar.com")) {
    const base = item.url.split("/Calendar")[0];
    return `${base}/MeetingDetail.aspx?ID=${item.meetingId}`;
  }

  return null;
}

// ── Main enrichment function ───────────────────────────────────────────────

/**
 * Attempt to find better URLs for candidates that have generic or missing URLs.
 * Modifies candidates in-place, adding `enrichedUrl` and updating `url`.
 *
 * @param {Array} candidates - Items to enrich
 * @returns {Promise<Array>} Same array with URLs improved where possible
 */
export async function enrichUrls(candidates) {
  let enriched = 0;
  let attempted = 0;

  for (const item of candidates) {
    const originalUrl = item.url;

    // Skip items that already have specific, good URLs
    if (originalUrl?.includes("ticketmaster.com/")) continue;
    if (originalUrl?.includes("/event/")) continue;
    if (originalUrl?.includes("/events/")) continue;

    // Sports: try to get a better URL
    if (item.category === "sports" || item.source === "NWSL" || item.source === "MLS" || item.source === "MiLB") {
      const better = enrichSportsUrl(item);
      if (better) {
        item.originalUrl = originalUrl;
        item.url = better;
        enriched++;
        logStep("🔗", `URL enriched (sports): ${item.title} → ${better.slice(0, 60)}`);
        continue;
      }
    }

    // Restaurants: try places.json cross-reference first, then Google Places API
    if (item.sourceType === "restaurant" && (!originalUrl || originalUrl === "")) {
      attempted++;
      // Fast path: cross-reference with places.json
      const crossRef = crossRefPlacesUrl(item);
      if (crossRef) {
        item.originalUrl = originalUrl;
        item.url = crossRef;
        enriched++;
        logStep("🔗", `URL enriched (places.json): ${item.title} → ${crossRef.slice(0, 60)}`);
        continue;
      }
      // Slow path: Google Places API
      const better = await enrichRestaurantUrl(item);
      if (better) {
        item.originalUrl = originalUrl;
        item.url = better;
        enriched++;
        logStep("🔗", `URL enriched (restaurant): ${item.title} → ${better.slice(0, 60)}`);
      }
      // Rate limit Google API calls
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    // Civic: try to improve Legistar URLs
    if (item.sourceType === "around-town" || item.sourceType === "digest") {
      const better = enrichCivicUrl(item);
      if (better) {
        item.originalUrl = originalUrl;
        item.url = better;
        enriched++;
        logStep("🔗", `URL enriched (civic): ${item.title} → ${better.slice(0, 60)}`);
      }
    }
  }

  if (enriched > 0 || attempted > 0) {
    logStep("🔗", `URL enrichment: ${enriched} improved, ${attempted} restaurant lookups attempted`);
  }

  return candidates;
}
