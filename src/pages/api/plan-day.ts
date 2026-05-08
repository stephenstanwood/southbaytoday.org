export const prerender = false;

// ---------------------------------------------------------------------------
// South Bay Today — Day-Planning Engine (bucket version)
// ---------------------------------------------------------------------------
// POST /api/plan-day
// Input:  { city, kids, lockedCards, dismissedIds, planDate, ... }
// Output: { cards: [...], weather, ... }
//
// Each plan is six "idea sparks" — not an hour-by-hour schedule:
//   breakfast / lunch / dinner   (food)
//   morning   / afternoon / evening (activity)
//
// Pipeline:
// 1. Load places + today's events + weather
// 2. Score & filter a candidate pool (~35 items)
// 3. Call Claude Sonnet to fill the 6 buckets, one venue per bucket
// 4. Validate venue hours fit the bucket window; drop kids-mode evening
// ---------------------------------------------------------------------------

import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";
import { errJson, okJson } from "../../lib/apiHelpers";
import { rateLimit, rateLimitResponse } from "../../lib/rateLimit";
import { CLAUDE_SONNET, extractText, stripFences } from "../../lib/models";
import { CITY_MAP, getCityName } from "../../lib/south-bay/cities";
import { normalizeName } from "../../lib/south-bay/normalizeName";
import { logDecision } from "../../lib/south-bay/decisionLog.mjs";
import { isVirtualEvent } from "../../lib/south-bay/eventFilters.mjs";
import { canonicalCategory } from "../../lib/south-bay/categories.mjs";
import {
  type Bucket,
  BUCKET_ORDER,
  BUCKET_LABELS,
  BUCKET_TIME_WINDOWS,
  MEAL_BUCKETS,
  bucketForEvent,
  bucketOrderIndex,
  isBucket,
} from "../../lib/south-bay/buckets";
import type { City } from "../../lib/south-bay/types";

import placesData from "../../data/south-bay/places.json";
import eventsData from "../../data/south-bay/upcoming-events.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserPreferences {
  categoryScores: Record<string, number>;
  costBias: number;
  outdoorBias: number;
  totalInteractions: number;
}

interface PlanRequest {
  city: City;
  kids: boolean;
  lockedIds?: string[];
  /** Richer lock info: pairs an id with the bucket the user locked it into.
   *  Takes precedence over lockedIds when both are sent. timeBlock kept for
   *  back-compat with older clients that haven't picked up the bucket schema. */
  lockedCards?: Array<{ id: string; bucket?: Bucket | null; timeBlock?: string | null }>;
  dismissedIds?: string[];
  /** Names persisted alongside dismissedIds, normalized server-side and used
   *  to filter candidates whose ID may have changed since the user dismissed
   *  them. Pairs with dismissedIds. */
  dismissedNames?: string[];
  /** Plan date in YYYY-MM-DD (PT). Default: today. */
  planDate?: string;
  /** Bypass the in-memory plan cache — SHUFFLE sets this so each click gets a
   *  freshly generated plan. */
  noCache?: boolean;
  preferences?: UserPreferences;
  /** Lowercase POI/event names to hard-exclude from this plan. */
  blockedNames?: string[];
  /** Recently-shown ids/names. Score penalty fades over a two-week window. */
  recentlyShown?: Array<string | { id?: string; name?: string; daysAgo?: number }>;
  /** Anchors used on recent shuffles — informational, kept for future use. */
  recentAnchors?: string[];
  /** Week-level context so Claude can diversify across a 10-day batch.
   *  Only populated by generate-schedule.mjs when batching. */
  weekContext?: {
    anchorCities?: string[];
    categorySaturation?: Record<string, number>;
  };
  /** LEGACY (unused by bucket pipeline). Older callers may still send
   *  these — accepted for backwards compat but not interpreted. */
  currentHour?: number;
  currentMinute?: number;
}

interface Candidate {
  id: string;
  name: string;
  category: string;
  city: string;
  address: string;
  description?: string;
  /** Ingest-time blurb (events only) — preferred source for the card's blurb. */
  blurb?: string | null;
  why?: string;
  rating?: number | null;
  cost?: string | null;
  costNote?: string | null;
  kidsCostNote?: string | null;
  kidFriendly?: boolean | null;
  indoorOutdoor?: string | null;
  url?: string | null;
  mapsUrl?: string | null;
  hours?: Record<string, string> | null;
  venue?: string | null;
  photoRef?: string | null;
  image?: string | null;
  displayType?: string | null;
  source: "event" | "place";
  eventDate?: string;
  eventTime?: string | null;
  eventEndTime?: string | null;
  eventDurationMin?: number | null;
  ongoing?: boolean;
  score: number;
}

interface DayCard {
  id: string;
  name: string;
  category: string;
  city: string;
  address: string;
  venue?: string | null;
  /** Bucket slot for this card — the primary user-facing time signal. */
  bucket: Bucket;
  /** Real event time, only present when this card is an event with a fixed
   *  start (e.g. "7:30 PM"). Used as a small display hint; never required. */
  eventTime?: string | null;
  /** Legacy display label kept for back-compat with old shared plans + the
   *  /plan/<id> renderer. New cards put the bucket label here ("Breakfast")
   *  so existing renderers that look for `timeBlock` still see something. */
  timeBlock: string;
  blurb: string;
  why: string;
  url?: string | null;
  mapsUrl?: string | null;
  cost?: string | null;
  costNote?: string | null;
  kidsCostNote?: string | null;
  photoRef?: string | null;
  image?: string | null;
  source: "event" | "place";
  locked: boolean;
  rationale?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// santa-cruz is in CITY_MAP for POI/event display but excluded from plan-day
// (case-by-case picks only, not enough POIs to fill a plan).
const VALID_CITIES = new Set(Object.keys(CITY_MAP).filter((c) => c !== "santa-cruz"));

const PERMANENT_NAME_BLOCKLIST = new Set<string>([
  normalizeName("3Below Theaters"), // San Jose — closed
].filter(Boolean));

const CANDIDATE_POOL_SIZE = 35;

// 20 km covers the working radius (SJ ↔ Sunnyvale, Mountain View, Los Altos).
const NEARBY_KM = 20;

// Venue photo lookup — maps a normalized venue name to a photoRef from
// places.json so events inherit photos from their host venue.
const VENUE_PHOTO_LOOKUP: Map<string, string> = (() => {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const map = new Map<string, string>();
  const places = (placesData as any).places ?? [];
  for (const p of places) {
    if (!p?.photoRef || !p?.name) continue;
    map.set(norm(p.name), p.photoRef);
  }
  return map;
})();

function lookupVenuePhoto(venue: string | null | undefined): string | null {
  if (!venue) return null;
  const norm = venue.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!norm) return null;
  const exact = VENUE_PHOTO_LOOKUP.get(norm);
  if (exact) return exact;
  for (const [placeName, photoRef] of VENUE_PHOTO_LOOKUP) {
    if (placeName.length < 9) continue;
    if (norm.includes(placeName) || placeName.includes(norm)) return photoRef;
  }
  return null;
}

// In-memory plan cache: city:kids:date → { data, ts }
const planCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

const FALLBACK_BLURB_POOL: Record<string, string[]> = {
  "event.food": [
    "Food event — grab something to eat and post up.",
    "Local food happening — bring an appetite.",
    "Food pop-up worth stopping in for.",
  ],
  "event.arts": [
    "Art happening — step in and see the work.",
    "Gallery event — quick browse, easy stop.",
    "Arts event, low-key drop-in vibe.",
  ],
  "event.music": [
    "Live music — catch a set.",
    "Music night at this spot.",
    "Concert-style evening — stay for a song or two.",
  ],
  "event.entertainment": [
    "Live entertainment — worth a stop.",
    "Show on tonight — walk in and see what's playing.",
    "Performance slot — settle in and enjoy.",
  ],
  "event.sports": [
    "Game-time — good excuse to cheer.",
    "Sports event — quick stop for the action.",
  ],
  "event.outdoor": [
    "Outdoor event — get some fresh air.",
    "Outdoors thing — stretch the legs and poke around.",
  ],
  "event.shopping": [
    "Market/pop-up — browse the stalls.",
    "Shopping event — pick up something local.",
  ],
  "event.museum": [
    "Museum event — small-scale, easy visit.",
    "Exhibit-adjacent event — plan an hour.",
  ],
  "event.wellness": [
    "Low-key wellness drop-in.",
    "Wellness event — easy hour.",
  ],
  "event.events": [
    "Community event — free to drop in.",
    "Local gathering — everyone welcome.",
    "Free event, casual drop-in vibe.",
    "Neighborhood thing — stop by for a bit.",
  ],
  "place.food": [
    "Solid local pick for a meal.",
    "Go-to spot nearby — easy table.",
    "Good food, no fuss.",
  ],
  "place.outdoor": [
    "Good place to walk and clear your head.",
    "Nice spot to get some air.",
    "Easy outdoor stretch.",
  ],
  "place.arts": [
    "Worth a quick gallery browse.",
    "Low-key arts stop.",
  ],
  "place.museum": [
    "Short museum stop — worth an hour.",
    "Easy browse, rotating exhibits.",
  ],
  "place.shopping": [
    "Fun to poke around.",
    "Good browse — pick something up or don't.",
  ],
  "place.entertainment": [
    "Nice spot to unwind for an hour or two.",
  ],
  "place.wellness": [
    "Wind-down stop.",
  ],
  "place.sports": [
    "Good slot to stay active.",
  ],
};

export function fallbackBlurb(
  source: "event" | "place",
  category: string | null | undefined,
  name: string,
  venue: string | null | undefined,
): string {
  const cat = (category || "").toLowerCase();
  const key = `${source}.${cat}`;
  const pool = FALLBACK_BLURB_POOL[key] || FALLBACK_BLURB_POOL[`${source}.events`] || [];
  if (pool.length === 0) {
    const at = venue && venue !== name ? ` at ${venue}` : "";
    return `Quick stop${at}.`;
  }
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = typeof DAY_KEYS[number];

function dayKeyForDate(targetDate: string | null | undefined): DayKey {
  const d = targetDate ? new Date(`${targetDate}T12:00:00`) : new Date();
  return d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "short" })
    .toLowerCase()
    .slice(0, 3) as DayKey;
}

function isOpenOn(hours: Record<string, string> | null | undefined, dayKey: DayKey): boolean {
  if (!hours) return true;
  return dayKey in hours;
}

function openRangesOn(hours: Record<string, string> | null | undefined, dayKey: DayKey): Array<[number, number]> {
  if (!hours) return [];
  const range = hours[dayKey];
  if (!range) return [];
  const out: Array<[number, number]> = [];
  for (const seg of range.split(",")) {
    const [openStr, closeStr] = seg.split("-");
    if (!openStr || !closeStr) continue;
    const o = parseHour(openStr);
    const c = parseHour(closeStr);
    if (o !== null && c !== null) out.push([o, c]);
  }
  return out;
}

const TIME_SENSITIVE_TYPES = new Set([
  "restaurant", "cafe", "bakery", "bar", "meal_takeaway", "food", "meal_delivery",
  "museum", "art_gallery", "movie_theater", "performing_arts_theater",
  "shopping_mall", "spa", "gym", "bowling_alley", "amusement_park",
  "aquarium", "zoo", "library", "ice_cream_shop", "coffee_shop",
]);

const TIME_SENSITIVE_CATEGORIES = new Set(["food", "arts"]);

function isTimeSensitive(
  types: string[] | null | undefined,
  category?: string | null,
): boolean {
  if (types && types.some((t) => TIME_SENSITIVE_TYPES.has(t))) return true;
  if (category && TIME_SENSITIVE_CATEGORIES.has(category)) return true;
  return false;
}

/** True if the venue is open for at least 60 minutes within the bucket's
 *  time window. Time-sensitive venues with unknown hours fail (we don't
 *  guess); flexible venues (parks, trails) pass with a daylight default. */
function openDuringBucket(
  hours: Record<string, string> | null | undefined,
  dayKey: DayKey,
  bucket: Bucket,
  types?: string[] | null,
  category?: string | null,
): boolean {
  const [winStart, winEnd] = BUCKET_TIME_WINDOWS[bucket];
  if (!hours) {
    if (isTimeSensitive(types, category)) return false;
    // Outdoor/flexible: rough daylight band (6–21).
    return winStart >= 6 && winEnd <= 22;
  }
  const ranges = openRangesOn(hours, dayKey);
  if (ranges.length === 0) return false;
  for (const [o, c] of ranges) {
    const overlapStart = Math.max(o, winStart);
    const overlapEnd = Math.min(c, winEnd);
    if (overlapEnd - overlapStart >= 1) return true; // ≥1h overlap
  }
  return false;
}

export function parseHour(timeStr: string): number | null {
  const ampm = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    if (ampm[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (ampm[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h;
  }
  const mil = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (mil) return parseInt(mil[1], 10);
  return null;
}

function parseClockToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = (m[3] || "").toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  if (!ampm && h < 8) h += 12;
  return h * 60 + min;
}

function computeDurationMin(start: string | null | undefined, end: string | null | undefined): number | null {
  const a = parseClockToMinutes(start);
  const b = parseClockToMinutes(end);
  if (a === null || b === null) return null;
  const d = b - a;
  return d > 0 ? d : null;
}

// ---------------------------------------------------------------------------
// Weather fetch (internal, same-origin)
// ---------------------------------------------------------------------------

async function fetchWeather(city: City): Promise<{ weather: string | null; forecast: any[] | null }> {
  try {
    const cityConfig = CITY_MAP[city];
    if (!cityConfig) return { weather: null, forecast: null };

    const url = [
      `https://api.open-meteo.com/v1/forecast`,
      `?latitude=${cityConfig.lat}&longitude=${cityConfig.lon}`,
      `&current=temperature_2m,weather_code`,
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`,
      `&temperature_unit=fahrenheit`,
      `&timezone=America%2FLos_Angeles`,
      `&forecast_days=1`,
    ].join("");

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { weather: null, forecast: null };
    const data = await res.json();

    const temp = Math.round(data.current.temperature_2m);
    const high = Math.round(data.daily.temperature_2m_max[0]);
    const low = Math.round(data.daily.temperature_2m_min[0]);
    const rainPct = data.daily.precipitation_probability_max[0] ?? 0;
    const weatherCode = data.current.weather_code as number;

    const isRainy = rainPct >= 40 || [61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 99].includes(weatherCode);
    const isHot = high > 90;
    const isCold = high < 55;
    const isNice = !isRainy && !isHot && !isCold;

    return {
      weather: `${temp}°F, high ${high}°F${rainPct >= 5 ? `, ${rainPct}% chance of rain` : ""}`,
      forecast: [{ high, low, rainPct, isRainy, isHot, isCold, isNice, weatherCode }],
    };
  } catch {
    return { weather: null, forecast: null };
  }
}

// ---------------------------------------------------------------------------
// Candidate scoring
// ---------------------------------------------------------------------------

interface WeatherContext {
  isRainy: boolean;
  isHot: boolean;
  isCold: boolean;
  isNice: boolean;
}

interface RecentPenaltyInput {
  byId: Map<string, number>;
  byName: Map<string, number>;
}

function recentPenalty(daysAgo: number): number {
  if (daysAgo <= 0) return 50;
  if (daysAgo <= 2) return 30;
  if (daysAgo <= 7) return 18;
  if (daysAgo <= 14) return 8;
  return 0;
}

function weightedSample<T extends { score?: number }>(
  candidates: T[],
  n: number,
  temperature = 18,
): T[] {
  if (candidates.length <= n) return candidates.slice();
  const remaining = candidates.slice();
  const result: T[] = [];
  while (result.length < n && remaining.length > 0) {
    const maxScore = Math.max(...remaining.map((c) => c.score ?? 0));
    const weights = remaining.map((c) => Math.exp(((c.score ?? 0) - maxScore) / temperature));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    let chosen = remaining.length - 1;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen = i;
        break;
      }
    }
    result.push(remaining[chosen]);
    remaining.splice(chosen, 1);
  }
  return result;
}

function scoreCandidates(
  candidates: Candidate[],
  weather: WeatherContext | null,
  kids: boolean,
  prefs?: UserPreferences,
  recent?: RecentPenaltyInput,
): Candidate[] {
  for (const c of candidates) {
    let score = 0;

    if (c.source === "event") {
      score += 35;
      if (c.eventDate === todayStr()) score += 20;
      if (kids && (c.kidFriendly === true || (c as any).audienceAge === "kids")) score += 15;
    }

    if (c.rating && c.rating >= 4.5) score += 10;
    else if (c.rating && c.rating >= 4.0) score += 3;
    else if ((c as any).curated && (!c.rating || c.rating === 0)) score += 7;

    if ((c as any).curated) score += 10;

    if (c.category === "food") score += 10;

    if (kids && c.kidFriendly === true) score += 15;
    if (kids && c.kidFriendly === false) score -= 40;

    const INDOOR_RESCUE_CATS = new Set(["museum", "entertainment", "food", "shopping", "arts"]);
    if (weather) {
      if (weather.isRainy && c.indoorOutdoor === "outdoor") score -= 30;
      if (weather.isRainy && c.indoorOutdoor === "indoor") score += 15;
      if (weather.isRainy && !c.indoorOutdoor && INDOOR_RESCUE_CATS.has(c.category)) score += 10;
      if (weather.isCold && c.indoorOutdoor === "outdoor") score -= 15;
      if (weather.isCold && !c.indoorOutdoor && INDOOR_RESCUE_CATS.has(c.category)) score += 5;
      if (weather.isNice && c.indoorOutdoor === "outdoor") score += 15;
      if (weather.isHot && c.indoorOutdoor === "indoor") score += 10;
    }

    if (c.cost === "free") score += 5;

    if (kids) {
      const price = (c as any).priceLevel || c.costNote || "";
      if (price === "PRICE_LEVEL_VERY_EXPENSIVE" || price === "$$$$") score -= 50;
      if (price === "PRICE_LEVEL_EXPENSIVE" || price === "$$$") score -= 20;
    }

    if (c.category === "neighborhood") score -= 30;
    if (c.category === "wellness") score -= 60;

    if (prefs && prefs.totalInteractions >= 5) {
      const catScore = prefs.categoryScores[c.category];
      if (catScore !== undefined) score += catScore * 15;

      if (prefs.costBias !== 0) {
        const price = (c as any).priceLevel || c.costNote || "";
        const isExpensive = price === "PRICE_LEVEL_VERY_EXPENSIVE" || price === "$$$$" || price === "PRICE_LEVEL_EXPENSIVE" || price === "$$$";
        if (isExpensive) score += prefs.costBias * 10;
      }

      if (prefs.outdoorBias !== 0 && c.indoorOutdoor) {
        if (c.indoorOutdoor === "outdoor") score += prefs.outdoorBias * 10;
        else if (c.indoorOutdoor === "indoor") score -= prefs.outdoorBias * 10;
      }
    }

    if (recent) {
      const idPenalty = recent.byId.get(c.id) ?? 0;
      const nameKey = (c.name || "").toLowerCase().replace(/\s+/g, " ").trim();
      const namePenalty = nameKey ? (recent.byName.get(nameKey) ?? 0) : 0;
      score -= Math.max(idPenalty, namePenalty);
    }

    score += Math.random() * 25;

    c.score = score;
  }

  return candidates.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Build candidate pool
// ---------------------------------------------------------------------------

function buildCandidatePool(
  city: City,
  kids: boolean,
  dismissedIds: Set<string>,
  targetDate?: string,
  blockedNames?: Set<string>,
  dismissedNames?: Set<string>,
): Candidate[] {
  const candidates: Candidate[] = [];
  const cityConfig = CITY_MAP[city];
  const today = targetDate || todayStr();
  const planDayKey = dayKeyForDate(today);
  const isBlocked = (name: string | null | undefined) => {
    const n = normalizeName(name);
    if (!n) return false;
    if (PERMANENT_NAME_BLOCKLIST.has(n)) return true;
    if (!blockedNames || blockedNames.size === 0) return false;
    return blockedNames.has(n);
  };
  const isDismissedByName = (name: string | null | undefined) => {
    if (!dismissedNames || dismissedNames.size === 0) return false;
    const n = normalizeName(name);
    return n ? dismissedNames.has(n) : false;
  };

  const PLAN_TITLE_BLOCKLIST = [
    /\bpractice\b/i,
    /\brehearsal\b/i,
    /\bboard meeting\b/i,
    /\bstaff meeting\b/i,
    /\bcommittee meeting\b/i,
    /\bcommission\b.*\bmeeting\b/i,
    /\bregular meeting\b/i,
    /\bspecial meeting\b/i,
    /\bsubcommittee\b/i,
    /\bstudy session\b/i,
    /\bstorytime\b/i,
  ];
  const events = (eventsData as any).events ?? [];
  for (const evt of events) {
    if (dismissedIds.has(`event:${evt.id}`)) continue;
    if (isDismissedByName(evt.title) || isDismissedByName(evt.venue)) continue;
    if (evt.virtual === true) continue;
    if (isVirtualEvent(evt)) continue;
    if (evt.title && PLAN_TITLE_BLOCKLIST.some((re) => re.test(evt.title))) continue;
    if (isBlocked(evt.title) || isBlocked(evt.venue)) continue;

    const isToday = evt.date === today;
    const isOngoingExhibition = evt.ongoing && !evt.date;
    const isOngoingPastStart = evt.ongoing && evt.date && evt.date <= today;
    if (!isToday && !isOngoingExhibition && !isOngoingPastStart) continue;

    if (isOngoingPastStart && !isToday) {
      const origDow = new Date(`${evt.date}T12:00:00Z`).getUTCDay();
      const todayDow = new Date(`${today}T12:00:00Z`).getUTCDay();
      if (origDow !== todayDow) continue;
    }

    const evtCity = evt.city as City;
    if (evtCity !== city) {
      const evtCityConfig = CITY_MAP[evtCity];
      if (!evtCityConfig || !cityConfig) continue;
      const dist = haversineKm(cityConfig.lat, cityConfig.lon, evtCityConfig.lat, evtCityConfig.lon);
      if (dist > NEARBY_KM) continue;
    }

    // Hard skip: kids-mode events flagged kidFriendly:false.
    if (kids && evt.kidFriendly === false) continue;

    if (kids && evt.title && /\b(parents?|caregivers?|adults?\s+only|seniors?|memoir|estate planning|tax\s+(prep|help)|investing|retirement|widow|grief|alzheimer|dementia|book club for adults|esl)\b/i.test(evt.title)) {
      logDecision({
        script: "plan-day",
        action: "dropped",
        target: `${evt.title} (event:${evt.id})`,
        reason: `title indicates adult-only programming, ignoring kidFriendly flag`,
        meta: { city, targetDate: today, kidFriendly: evt.kidFriendly },
      });
      continue;
    }

    const aa = (evt as any).audienceAge as string | undefined;
    if (aa === "kids" && !kids) {
      logDecision({
        script: "plan-day",
        action: "dropped",
        target: `${evt.title} (event:${evt.id})`,
        reason: `kids-only event in adult plan`,
        meta: { city, targetDate: today, audienceAge: aa },
      });
      continue;
    }
    if (aa === "adult" && kids) {
      logDecision({
        script: "plan-day",
        action: "dropped",
        target: `${evt.title} (event:${evt.id})`,
        reason: `adult-only event in kids plan`,
        meta: { city, targetDate: today, audienceAge: aa },
      });
      continue;
    }

    candidates.push({
      id: `event:${evt.id}`,
      name: evt.title,
      category: canonicalCategory(evt.category || "events"),
      city: evt.city,
      address: evt.address || "",
      venue: evt.venue || null,
      description: evt.description?.slice(0, 200),
      blurb: (evt as any).blurb || null,
      cost: evt.cost,
      costNote: (evt as any).costNote || null,
      kidFriendly: evt.kidFriendly ?? null,
      url: evt.url,
      photoRef: (evt as any).photoRef || lookupVenuePhoto(evt.venue),
      image: (evt as any).image || null,
      source: "event",
      eventDate: evt.date,
      eventTime: evt.time,
      eventEndTime: evt.endTime,
      eventDurationMin: computeDurationMin(evt.time, evt.endTime),
      ongoing: evt.ongoing ?? false,
      score: 0,
    });
  }

  // --- Places ---
  const VENUE_ONLY_TYPES = new Set([
    "performing_arts_theater", "concert_hall", "amphitheatre",
    "auditorium", "opera_house", "philharmonic_hall",
    "event_venue", "banquet_hall", "convention_center",
    "stadium", "arena", "live_music_venue", "comedy_club",
  ]);

  const EXCLUDED_TYPES = new Set([
    "preschool", "child_care_agency", "day_care_center",
    "school", "primary_school", "secondary_school", "middle_school",
    "hospital", "doctor", "dentist", "pharmacy", "veterinary_care",
    "dental_clinic", "medical_lab", "urgent_care_clinic",
    "chiropractor", "physiotherapist", "psychologist",
    "insurance_agency", "lawyer", "accounting", "real_estate_agency",
    "car_dealer", "car_repair", "car_wash", "gas_station",
    "electric_vehicle_charging_station", "auto_parts_store",
    "funeral_home", "cemetery", "storage", "self_storage",
    "post_office", "bank", "atm", "laundry", "dry_cleaner",
    "locksmith", "plumber", "electrician", "roofing_contractor",
    "moving_company", "travel_agency",
  ]);

  const places = (placesData as any).places ?? [];
  for (const p of places) {
    if (dismissedIds.has(`place:${p.id}`)) continue;
    if (isDismissedByName(p.name)) continue;
    if (isBlocked(p.name)) continue;

    const primaryType = p.primaryType || "";
    const types: string[] = p.types || [];
    if (VENUE_ONLY_TYPES.has(primaryType) || types.some((t: string) => VENUE_ONLY_TYPES.has(t))) continue;
    if (EXCLUDED_TYPES.has(primaryType) || types.some((t: string) => EXCLUDED_TYPES.has(t))) continue;
    if (!isOpenOn(p.hours, planDayKey)) continue;
    if ((p.category || "").toLowerCase() === "neighborhood") continue;
    if (/^(main\s+street|downtown|the\s+district|uptown)\s+\w+/i.test(p.name || "")) continue;
    if (kids && (p.category || "").toLowerCase() === "wellness") continue;

    if (p.city !== city) {
      if (!p.lat || !p.lng || !cityConfig) continue;
      const dist = haversineKm(cityConfig.lat, cityConfig.lon, p.lat, p.lng);
      if (dist > NEARBY_KM) continue;
    }

    candidates.push({
      id: `place:${p.id}`,
      name: p.name,
      category: canonicalCategory(p.category || "food"),
      city: p.city,
      address: p.address || "",
      why: p.why || undefined,
      rating: p.rating,
      cost: p.cost || null,
      costNote: p.costNote || (p.priceLevel ? priceLevelLabel(p.priceLevel) : null),
      kidsCostNote: (p as any).kidsCostNote || null,
      kidFriendly: p.kidFriendly ?? null,
      indoorOutdoor: p.indoorOutdoor || null,
      url: p.url,
      mapsUrl: p.mapsUrl,
      photoRef: p.photoRef || lookupVenuePhoto(p.name) || null,
      hours: p.hours,
      displayType: p.displayType || null,
      source: "place",
      score: 0,
      ...(p.curated ? { curated: true, bestSlots: p.bestSlots } : {}),
    });
  }

  return candidates;
}

function priceLevelLabel(level: string): string | null {
  switch (level) {
    case "PRICE_LEVEL_FREE": return "Free";
    case "PRICE_LEVEL_INEXPENSIVE": return "Under $15/person";
    case "PRICE_LEVEL_MODERATE": return "$15–30/person";
    case "PRICE_LEVEL_EXPENSIVE": return "$30–60/person";
    case "PRICE_LEVEL_VERY_EXPENSIVE": return "$60+/person";
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Bucket sequencing — Claude picks one candidate per bucket
// ---------------------------------------------------------------------------

function describePreferences(prefs?: UserPreferences): string {
  if (!prefs || prefs.totalInteractions < 5) return "";
  const parts: string[] = [];
  const sorted = Object.entries(prefs.categoryScores).sort((a, b) => b[1] - a[1]);
  const liked = sorted.filter(([, v]) => v > 0.2).slice(0, 2).map(([k]) => k);
  const disliked = sorted.filter(([, v]) => v < -0.2).slice(0, 2).map(([k]) => k);
  if (liked.length) parts.push(`enjoys ${liked.join(" and ")}`);
  if (disliked.length) parts.push(`tends to skip ${disliked.join(" and ")}`);
  if (prefs.outdoorBias > 0.3) parts.push("prefers outdoor activities");
  else if (prefs.outdoorBias < -0.3) parts.push("prefers indoor activities");
  if (prefs.costBias < -0.3) parts.push("budget-conscious");
  else if (prefs.costBias > 0.3) parts.push("happy to splurge");
  return parts.length ? `USER PREFERENCES: This person ${parts.join(", ")}.` : "";
}

/** Format a candidate for the prompt's pool listing. Returns null when the
 *  candidate has hours data that says "closed today" — we never want Claude
 *  to consider those. */
function candidateLine(c: Candidate, dayKey: DayKey, index: number): string | null {
  const parts = [`${index + 1}. [${c.id}] ${c.name}`];
  parts.push(`category: ${c.category}`);
  if (c.displayType) parts.push(`type: ${c.displayType}`);
  parts.push(`city: ${c.city}`);
  if (c.address) parts.push(`address: ${c.address}`);
  if (c.source === "event" && !c.ongoing) parts.push(`EVENT TODAY`);
  if (c.source === "event" && c.ongoing) parts.push(`ongoing exhibition`);
  if (c.eventTime) {
    const timeStr = c.eventEndTime ? `${c.eventTime}–${c.eventEndTime}` : c.eventTime;
    parts.push(`time: ${timeStr}`);
    const evBucket = bucketForEvent(c.eventTime, c.category);
    if (evBucket) parts.push(`fits-bucket: ${evBucket}`);
  }
  if (c.rating) parts.push(`rating: ${c.rating}`);
  if (c.cost) parts.push(`cost: ${c.cost}`);
  if (c.costNote) parts.push(`price: ${c.costNote}`);
  if (c.kidFriendly === true) parts.push(`kid-friendly`);
  if (c.why) parts.push(`note: ${c.why}`);
  if (c.indoorOutdoor) parts.push(`setting: ${c.indoorOutdoor}`);
  if (c.blurb) parts.push(`blurb: ${c.blurb}`);

  const hoursObj = (c as any).hours as Record<string, string> | null | undefined;
  const placeTypes = (c as any).types as string[] | null | undefined;
  const fmt = (h: number) => (h > 12 ? `${h - 12} PM` : h === 12 ? "12 PM" : h === 0 ? "12 AM" : `${h} AM`);
  if (hoursObj) {
    const ranges = openRangesOn(hoursObj, dayKey);
    if (ranges.length === 0) return null; // closed on plan date — omit
    parts.push(`hours: ${ranges.map(([o, c2]) => `${fmt(o)}–${fmt(c2)}`).join(", ")}`);
  } else if (isTimeSensitive(placeTypes, c.category)) {
    return null; // time-sensitive with no hours data — drop
  } else {
    parts.push(`hours: daylight (no formal hours)`);
  }
  return parts.join(" | ");
}

interface BucketPick {
  bucket: Bucket;
  id: string;
  blurb: string;
  why: string;
}

async function pickBucketsWithClaude(
  pool: Candidate[],
  lockedCandidates: Array<{ candidate: Candidate; bucket: Bucket | null }>,
  weather: string | null,
  city: City,
  kids: boolean,
  prefs: UserPreferences | undefined,
  targetDate: string | undefined,
  weekContext: PlanRequest["weekContext"],
  dayKey: DayKey,
): Promise<DayCard[]> {
  const client = new Anthropic({ apiKey: import.meta.env.ANTHROPIC_API_KEY });
  const cityName = getCityName(city);
  const planDateObj = targetDate ? new Date(`${targetDate}T12:00:00`) : new Date();
  const todayLabel = planDateObj.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const lockedSection = lockedCandidates.length > 0
    ? `\n\nMUST-INCLUDE ITEMS (always include every one in the bucket noted):\n${lockedCandidates.map(({ candidate: c, bucket }) => {
        const slot = bucket ? ` — bucket: ${bucket}` : "";
        const evt = c.eventTime ? ` at ${c.eventTime}` : "";
        return `- ${c.name} (${c.category}, ${c.city})${slot}${evt}`;
      }).join("\n")}`
    : "";

  const topPool = pool.slice(0, CANDIDATE_POOL_SIZE);
  const poolText = topPool
    .map((c, i) => candidateLine(c, dayKey, i))
    .filter((line): line is string => line !== null)
    .join("\n");

  let weekContextSection = "";
  if (weekContext) {
    const parts: string[] = [];
    const anchors = (weekContext.anchorCities || []).filter(Boolean);
    if (anchors.length) {
      const counts: Record<string, number> = {};
      for (const a of anchors) counts[a] = (counts[a] || 0) + 1;
      const summary = Object.entries(counts)
        .map(([c, n]) => (n > 1 ? `${c} (${n}×)` : c))
        .join(", ");
      parts.push(`Anchor cities already picked this week: ${summary}. Prefer neighborhoods that complement.`);
    }
    const cats = weekContext.categorySaturation || {};
    const saturated = Object.entries(cats).filter(([, n]) => n >= 2);
    if (saturated.length) {
      parts.push(`Category saturation: ${saturated.map(([c, n]) => `${c} ×${n}`).join(", ")}. Lean away when alternatives exist.`);
    }
    if (parts.length) weekContextSection = `\n\nTHIS-WEEK CONTEXT:\n${parts.join("\n")}`;
  }

  const prompt = `You are the day-planning engine for South Bay Today, a local guide for the South Bay region of California. Build a SIX-BUCKET "idea spark" plan, not an hour-by-hour schedule.

Anchor city: ${cityName}. The candidate pool pulls from the whole South Bay — adjacent cities are fine when they cluster.

It's ${todayLabel}. ${weather ? `Weather: ${weather}.` : ""}
${kids ? "This plan is for a family WITH KIDS. Every pick must be kid-friendly — no bars, no 21+ events, no late-only spots. Evening for kids is low-key: an early show, a stroll through a lit-up downtown, an ice cream stop, a park visit, a library evening event. Aim for things that wrap by 8 PM." : "This plan is for adults WITHOUT KIDS."}
${describePreferences(prefs)}
${lockedSection}${weekContextSection}

CANDIDATE POOL:
${poolText}

TASK: Fill all SIX buckets — every plan should have something in every slot. The plan is a brainstorm, not a tour: a user might do all six, some, or none. Each bucket should hold a venue or event the user could realistically slot into that part of the day.

THE BUCKETS (breakfast, morning, lunch, afternoon, dinner, evening):
- breakfast — coffee shop, bakery, casual breakfast restaurant. Venue should be open ~7–11 AM.
- morning   — outdoor activity, museum, walk, market, gallery, library, playground. ~9 AM–1 PM.
- lunch     — restaurant or casual food spot. ~11 AM–3 PM.
- afternoon — outdoor activity, museum, shopping, gallery, library, playground. ~1–6 PM.
- dinner    — restaurant. ~5–9 PM.
- evening   — push hard for an EVENT TODAY (concert, show, talk, late-opening exhibit) when the pool has one that fits. Otherwise fall back to a low-key spot: a park, a creekside trail at golden hour, a downtown stroll, a playground, an ice cream shop, a bookstore, a library reading room, a record store. ~6–10 PM (kids: ~6–8 PM).

ALWAYS-FILL RULE — never skip a bucket. If breakfast has no perfect cafe, pick the best food candidate that's open then. If evening has no event, pick a park / playground / library / ice cream / bookstore / waterfront / overlook. A "go take a walk at X park" is a totally legitimate evening idea.

VARIETY RULE — dig for gems. Don't anchor evening on the same park or library day after day. Across all six buckets, lean toward picks the user probably hasn't seen recently. Score-penalized "recently shown" candidates in the pool are deprioritized for a reason — pull from the broader pool when there's something fresh. Mix categories aggressively: if afternoon is outdoor, evening shouldn't also be outdoor unless the evening pick is genuinely a different vibe (golden-hour overlook vs. mid-day hike).

RULES:
- Pick ONE candidate per bucket.
- breakfast / lunch / dinner are FOOD ONLY. Pick a restaurant, café, or bakery — never a park or museum.
- morning / afternoon / evening are ACTIVITIES (or events). Never a sit-down restaurant.
- Events with a fixed time (see "fits-bucket" hint) belong in the bucket their time matches. Don't move a 7 PM concert to the afternoon bucket.
- Include AT LEAST ONE "EVENT TODAY" item if the pool has any — that's the local-guide differentiator. Evening is the strongest candidate for an event slot.
- Geographic clustering: aim for the venues to cluster (one or two cities) so a user who DOES want to do all six isn't driving in circles. But don't drop a great pick over a 20-minute drive.
- Don't pick the same venue twice across buckets.
- Don't pick an obvious chain ("Starbucks", "Olive Garden") when local options exist.
- NEVER pick a "neighborhood" or "downtown area" — always a SPECIFIC place.
- NEVER pick a venue (theater, amphitheater, stadium) unless it appears in the pool as an EVENT TODAY.
${kids ? "- KIDS BUDGET: Casual and affordable. Never $$$$ restaurants. Prefer $ and $$.\n- KIDS EVENING: Library evening programs, family movie nights, downtown strolls, playgrounds, ice cream — no bars, no late-only spots. Pick something that wraps by 8 PM." : ""}
- READ THE PRICE DATA: if a place is listed as $$$$ it is NOT "casual." Match your description to the actual price level.

TONE — write like a friend texting an idea:
- "blurb": one sentence about what to actually DO at THIS specific place (order the tri-tip sandwich, hike the upper loop, sit on the patio). The blurb MUST describe the place named by the id you picked — never describe a different place.
- "why": one short sentence — "perfect weather for it" or "you won't find better ramen". Never "this is a one-time event that makes today unforgettable" — banned.
- NEVER say: "right now", "real game", "real event", "anchor event", "one-time", "only today", "happens only today", "unforgettable", "energy burn", "change of scenery"
- NEVER mention star ratings or review scores.
- NEVER mention distance, travel time, or proximity. No "near", "nearby", "close to", "minutes from", "short drive".
- NEVER fabricate details not in the data — no specific menu items unless the data lists them, no class schedules, no opening hours.
- NEVER describe a place as being "in" a city it's not in.
- Vary your sentence structure. Don't lean on em dashes (—) — mix periods, commas, short sentences.

OUTPUT (JSON array, no markdown fences, one entry per filled bucket):
[
  {
    "bucket": "breakfast",
    "id": "place:google-id-or-event:event-id",
    "blurb": "One sentence about what to do here.",
    "why": "One sentence about why this is a great pick."
  },
  ...
]

Return ONLY the JSON array. No explanation.`;

  const response = await client.messages.create({
    model: CLAUDE_SONNET,
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = extractText(response.content);
  const cleaned = stripFences(text);

  let picks: BucketPick[];
  try {
    picks = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Claude response: ${cleaned.slice(0, 200)}`);
  }

  const allCandidates = [...lockedCandidates.map((l) => l.candidate), ...topPool];
  const candidateMap = new Map(allCandidates.map((c) => [c.id, c]));
  const lockedIdSet = new Set(lockedCandidates.map((l) => l.candidate.id));
  const poolRank = new Map(topPool.map((c, i) => [c.id, i + 1]));

  const cards: DayCard[] = [];
  const usedBuckets = new Set<Bucket>();
  const usedIds = new Set<string>();

  for (const pick of picks) {
    if (!isBucket(pick.bucket)) continue;
    if (usedBuckets.has(pick.bucket)) continue; // dedup
    const candidate = candidateMap.get(pick.id);
    if (!candidate) continue;
    if (usedIds.has(candidate.id)) continue;

    // Force event cards to the bucket their real time matches.
    let bucket: Bucket = pick.bucket;
    if (candidate.source === "event" && candidate.eventTime) {
      const evBucket = bucketForEvent(candidate.eventTime, candidate.category);
      if (evBucket && evBucket !== pick.bucket) {
        if (usedBuckets.has(evBucket)) continue; // already filled
        logDecision({
          script: "plan-day",
          action: "autofixed",
          target: `${candidate.name} (${candidate.id})`,
          reason: `event time → bucket: claude said "${pick.bucket}", real time ${candidate.eventTime} → "${evBucket}"`,
          meta: { city, targetDate, eventTime: candidate.eventTime },
        });
        bucket = evBucket;
      }
    }

    // Meal/activity guard — meal buckets are food-only.
    if (MEAL_BUCKETS.has(bucket) && candidate.category !== "food" && candidate.source === "place") {
      logDecision({
        script: "plan-day",
        action: "dropped",
        target: `${candidate.name} (${candidate.id})`,
        reason: `non-food place in meal bucket "${bucket}"`,
        meta: { city, targetDate },
      });
      continue;
    }

    const isLocked = lockedIdSet.has(candidate.id);
    const rank = poolRank.get(candidate.id);
    const rationaleParts: string[] = [];
    if (isLocked) rationaleParts.push("locked-by-caller");
    else if (rank) rationaleParts.push(`claude:pool-rank-${rank}/${topPool.length}`);
    else rationaleParts.push("claude:pick");
    if (candidate.source === "event") rationaleParts.push(candidate.ongoing ? "ongoing-exhibit" : "event-today");
    if (candidate.rating) rationaleParts.push(`rating=${candidate.rating}`);
    if (candidate.category) rationaleParts.push(`bucket=${bucket}`);

    const cardBlurb =
      candidate.blurb ||
      pick.blurb ||
      candidate.description?.slice(0, 200) ||
      fallbackBlurb(candidate.source, candidate.category, candidate.name, candidate.venue);

    cards.push({
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      city: candidate.city,
      address: candidate.address,
      bucket,
      eventTime: candidate.eventTime || null,
      timeBlock: BUCKET_LABELS[bucket],
      blurb: cardBlurb,
      why: pick.why,
      url: candidate.url,
      mapsUrl: candidate.mapsUrl,
      cost: candidate.cost,
      costNote: kids && candidate.kidsCostNote ? candidate.kidsCostNote : candidate.costNote,
      kidsCostNote: candidate.kidsCostNote,
      photoRef: (candidate as any).photoRef || null,
      image: (candidate as any).image || null,
      venue: candidate.venue || null,
      source: candidate.source,
      locked: isLocked,
      rationale: rationaleParts.join(" | "),
    });

    usedBuckets.add(bucket);
    usedIds.add(candidate.id);

    logDecision({
      script: "plan-day",
      action: "picked",
      target: `${candidate.name} (${candidate.id})`,
      reason: rationaleParts.join(" | "),
      meta: { city, targetDate, bucket, kids },
    });
  }

  // Force locked items that Claude omitted into the plan.
  for (const { candidate, bucket: pinned } of lockedCandidates) {
    if (usedIds.has(candidate.id)) continue;
    let bucket: Bucket = pinned ?? "afternoon";
    if (candidate.source === "event" && candidate.eventTime) {
      const evBucket = bucketForEvent(candidate.eventTime, candidate.category);
      if (evBucket) bucket = evBucket;
    }
    if (usedBuckets.has(bucket)) {
      // Pick the first unused bucket as a fallback slot.
      const open = BUCKET_ORDER.find((b) => !usedBuckets.has(b));
      if (!open) continue;
      bucket = open;
    }

    cards.push({
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      city: candidate.city,
      address: candidate.address,
      bucket,
      eventTime: candidate.eventTime || null,
      timeBlock: BUCKET_LABELS[bucket],
      blurb: candidate.blurb || candidate.description?.slice(0, 200) || fallbackBlurb(candidate.source, candidate.category, candidate.name, candidate.venue),
      why: candidate.why || "This is the one the day is built around.",
      url: candidate.url,
      mapsUrl: candidate.mapsUrl,
      cost: candidate.cost,
      costNote: kids && candidate.kidsCostNote ? candidate.kidsCostNote : candidate.costNote,
      kidsCostNote: candidate.kidsCostNote,
      photoRef: (candidate as any).photoRef || null,
      image: (candidate as any).image || null,
      venue: candidate.venue || null,
      source: candidate.source,
      locked: true,
      rationale: "locked-force-insert | claude-omitted",
    });
    usedBuckets.add(bucket);
    usedIds.add(candidate.id);
    logDecision({
      script: "plan-day",
      action: "force-inserted",
      target: `${candidate.name} (${candidate.id})`,
      reason: "locked item missing from Claude output",
      meta: { city, targetDate, bucket },
    });
  }

  // Drop blurb↔card mismatches (blurb describes a different pool candidate).
  {
    const before = cards.length;
    const CITY_TOKENS = new Set([
      "san", "jose", "san-jose", "los", "gatos", "palo", "alto", "santa",
      "clara", "mountain", "view", "cupertino", "sunnyvale", "milpitas",
      "campbell", "saratoga", "south", "north", "east", "west", "downtown",
    ]);
    const GENERIC_TOKENS = new Set([
      "market", "museum", "center", "street", "avenue", "park", "plaza",
      "restaurant", "cafe", "bar", "library", "community",
    ]);
    const distinctive = (name: string): string[] =>
      (name || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 5 && !CITY_TOKENS.has(w) && !GENERIC_TOKENS.has(w));

    const poolDistinct = new Map<string, string[]>();
    for (const c of pool) poolDistinct.set(c.id, distinctive(c.name));

    for (let i = cards.length - 1; i >= 0; i--) {
      if (cards[i].locked) continue;
      const cardId = cards[i].id;
      const name = (cards[i].name || "").toLowerCase();
      const blurb = (cards[i].blurb || "").toLowerCase();
      if (!name || !blurb) continue;
      if (blurb.includes(name)) continue;

      const ownDistinct = poolDistinct.get(cardId) || distinctive(name);
      if (ownDistinct.some((w) => blurb.includes(w))) continue;

      let mismatchedTo: string | null = null;
      for (const [otherId, tokens] of poolDistinct.entries()) {
        if (otherId === cardId) continue;
        if (tokens.some((w) => blurb.includes(w))) {
          mismatchedTo = otherId;
          break;
        }
      }

      if (mismatchedTo) {
        logDecision({
          script: "plan-day",
          action: "dropped",
          target: `${cards[i].name} (${cards[i].id})`,
          reason: `blurb describes different pool candidate (${mismatchedTo})`,
          meta: { city, targetDate, blurb: cards[i].blurb?.slice(0, 80) },
        });
        usedBuckets.delete(cards[i].bucket);
        cards.splice(i, 1);
      }
    }
    if (cards.length < before) {
      console.log(`[plan-day] blurb validator: dropped ${before - cards.length} mismatched card(s)`);
    }
  }

  // Drop category-blurb mismatches (blurb's vocabulary clearly belongs to a
  // different category than the card).
  {
    const before = cards.length;
    const ALIEN_SIGNALS: Record<string, RegExp> = {
      outdoor: /\b(food hall|dozen vendors?|the menu|order the|tacos,?\s*ramen|ramen,?\s*banh|tasting menu|wine bar|cocktails?|happy hour|the bartender|chef[''']s|prix fixe)\b/i,
      food: /\b(easy trails?|hike the|hiking|playground|ducks to chase|wildflowers?|open space|swing set|sandbox|lap the loop|ride the train|the carousel)\b/i,
      museum: /\b(food hall|dozen vendors?|easy trails?|hike|happy hour|tasting menu)\b/i,
      shopping: /\b(food hall|dozen vendors?|easy trails?|hike|the menu|order the|tasting menu)\b/i,
      entertainment: /\b(food hall|dozen vendors?|easy trails?|hike)\b/i,
    };
    for (let i = cards.length - 1; i >= 0; i--) {
      if (cards[i].locked) continue;
      const cat = cards[i].category;
      const re = ALIEN_SIGNALS[cat];
      if (!re) continue;
      const blurb = cards[i].blurb || "";
      if (!re.test(blurb)) continue;
      logDecision({
        script: "plan-day",
        action: "dropped",
        target: `${cards[i].name} (${cards[i].id})`,
        reason: `blurb vocabulary signals different category than card (${cat})`,
        meta: { city, targetDate, blurb: blurb.slice(0, 120), category: cat },
      });
      usedBuckets.delete(cards[i].bucket);
      cards.splice(i, 1);
    }
    if (cards.length < before) {
      console.log(`[plan-day] category validator: dropped ${before - cards.length} card(s) with cross-category blurbs`);
    }
  }

  // Hours-fit check: drop place cards whose venue isn't open for at least 1h
  // within the bucket's window.
  {
    const before = cards.length;
    for (let i = cards.length - 1; i >= 0; i--) {
      if (cards[i].locked) continue;
      if (cards[i].source === "event") continue; // events keep their announced time
      const candidate = candidateMap.get(cards[i].id);
      if (!candidate) continue;
      const hoursObj = (candidate as any).hours as Record<string, string> | null | undefined;
      const placeTypes = (candidate as any).types as string[] | null | undefined;
      if (!openDuringBucket(hoursObj, dayKey, cards[i].bucket, placeTypes, candidate.category)) {
        const reason = !hoursObj
          ? "no verified hours for time-sensitive venue"
          : `venue not open during ${cards[i].bucket} window`;
        logDecision({
          script: "plan-day",
          action: "dropped",
          target: `${cards[i].name} (${cards[i].id})`,
          reason,
          meta: { city, targetDate, bucket: cards[i].bucket },
        });
        usedBuckets.delete(cards[i].bucket);
        cards.splice(i, 1);
      }
    }
    if (cards.length < before) {
      console.log(`[plan-day] hours-fit: dropped ${before - cards.length} card(s) outside bucket hours`);
    }
  }

  // Backfill: any bucket that ended up empty (Claude skipped it, or a
  // post-processor dropped its pick) gets the best remaining pool candidate
  // that matches the bucket's category + hours constraints. The "always-fill"
  // promise — a thin homepage with two cards is worse than a complete plan
  // with one or two filler picks.
  const usedAfterValidation = new Set(cards.map((c) => c.bucket));
  const usedIdsAfter = new Set(cards.map((c) => c.id));
  const emptyBuckets = BUCKET_ORDER.filter((b) => !usedAfterValidation.has(b));
  if (emptyBuckets.length > 0) {
    for (const bucket of emptyBuckets) {
      const isMeal = MEAL_BUCKETS.has(bucket);
      // Iterate the full pool by score (already sorted in plan-day caller).
      let backfill: Candidate | null = null;
      for (const c of pool) {
        if (usedIdsAfter.has(c.id)) continue;
        // Meal buckets food-only; activity buckets non-food (events of any
        // category fine since they're explicitly slotted by their time).
        if (isMeal && c.category !== "food") continue;
        if (!isMeal && c.source === "place" && c.category === "food") continue;
        // Events with a fixed time only fit if their bucket matches.
        if (c.source === "event" && c.eventTime) {
          const evBucket = bucketForEvent(c.eventTime, c.category);
          if (evBucket && evBucket !== bucket) continue;
        }
        // Hours fit (places only).
        if (c.source === "place") {
          const hoursObj = (c as any).hours as Record<string, string> | null | undefined;
          const placeTypes = (c as any).types as string[] | null | undefined;
          if (!openDuringBucket(hoursObj, dayKey, bucket, placeTypes, c.category)) continue;
        }
        backfill = c;
        break;
      }
      if (!backfill) continue;
      const card: DayCard = {
        id: backfill.id,
        name: backfill.name,
        category: backfill.category,
        city: backfill.city,
        address: backfill.address,
        bucket,
        eventTime: backfill.eventTime || null,
        timeBlock: BUCKET_LABELS[bucket],
        blurb: backfill.blurb || backfill.description?.slice(0, 200) || fallbackBlurb(backfill.source, backfill.category, backfill.name, backfill.venue),
        why: backfill.why || "Solid fill for this slot.",
        url: backfill.url,
        mapsUrl: backfill.mapsUrl,
        cost: backfill.cost,
        costNote: kids && backfill.kidsCostNote ? backfill.kidsCostNote : backfill.costNote,
        kidsCostNote: backfill.kidsCostNote,
        photoRef: (backfill as any).photoRef || null,
        image: (backfill as any).image || null,
        venue: backfill.venue || null,
        source: backfill.source,
        locked: false,
        rationale: `backfill | empty-bucket=${bucket}`,
      };
      cards.push(card);
      usedIdsAfter.add(backfill.id);
      logDecision({
        script: "plan-day",
        action: "backfilled",
        target: `${backfill.name} (${backfill.id})`,
        reason: `claude/validators left ${bucket} empty`,
        meta: { city, targetDate, bucket },
      });
    }
  }

  // Final sort: bucket order so the renderer doesn't have to.
  cards.sort((a, b) => bucketOrderIndex(a.bucket) - bucketOrderIndex(b.bucket));

  return cards;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!rateLimit(clientAddress, 30)) return rateLimitResponse();

  let body: PlanRequest;
  try {
    body = await request.json();
  } catch {
    return errJson("Invalid JSON body", 400);
  }

  const {
    city,
    kids = false,
    lockedIds = [],
    lockedCards = [],
    dismissedIds = [],
    dismissedNames = [],
    planDate,
    preferences,
    blockedNames = [],
    weekContext,
    recentlyShown = [],
    noCache = false,
  } = body;

  // Merge lockedCards into lockedIds + bucket map.
  const lockedBucketMap = new Map<string, Bucket | null>();
  for (const lc of lockedCards) {
    if (!lc?.id) continue;
    if (!lockedIds.includes(lc.id)) lockedIds.push(lc.id);
    if (isBucket(lc.bucket)) lockedBucketMap.set(lc.id, lc.bucket);
    else lockedBucketMap.set(lc.id, null);
  }
  const blockedSet = new Set(blockedNames.map((n) => normalizeName(n)).filter(Boolean));

  if (!city || !VALID_CITIES.has(city)) {
    return errJson(`Invalid city. Must be one of: ${[...VALID_CITIES].join(", ")}`, 400);
  }

  if (!import.meta.env.ANTHROPIC_API_KEY) {
    return errJson("Server configuration error", 500);
  }

  const canonicalDismissed = (dismissedIds as string[]).flatMap((id) =>
    id.startsWith("pad:") ? [id, "place:" + id.slice(4)] : [id],
  );
  const dismissedSet = new Set(canonicalDismissed);
  const dismissedNameSet = new Set(
    (Array.isArray(dismissedNames) ? dismissedNames : [])
      .map((n: string) => normalizeName(n))
      .filter(Boolean) as string[],
  );
  const lockedSet = new Set(lockedIds);

  const dayKey = dayKeyForDate(planDate);

  // Cache hit for default requests.
  const prefsHash = preferences
    ? Math.round((preferences.outdoorBias || 0) * 10 + (preferences.costBias || 0) * 10)
    : 0;
  const cacheKey = `${city}:${kids}:${prefsHash}:${planDate || ""}`;
  if (!noCache && lockedIds.length === 0 && dismissedIds.length === 0 && dismissedNameSet.size === 0 && blockedSet.size === 0 && recentlyShown.length === 0) {
    const cached = planCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return okJson(cached.data, { "Cache-Control": "private, no-store" });
    }
  }

  try {
    const weatherData = await fetchWeather(city);
    const weatherContext: WeatherContext | null = weatherData.forecast?.[0] ?? null;

    const allCandidates = buildCandidatePool(city, kids, dismissedSet, planDate, blockedSet, dismissedNameSet);

    // Score with graduated variety penalty.
    const recentById = new Map<string, number>();
    const recentByName = new Map<string, number>();
    for (const entry of recentlyShown) {
      if (typeof entry === "string") {
        recentById.set(entry, Math.max(recentById.get(entry) ?? 0, recentPenalty(0)));
        continue;
      }
      if (!entry) continue;
      const days = typeof entry.daysAgo === "number" ? entry.daysAgo : 0;
      const penalty = recentPenalty(days);
      if (penalty <= 0) continue;
      if (entry.id) recentById.set(entry.id, Math.max(recentById.get(entry.id) ?? 0, penalty));
      if (entry.name) {
        const key = entry.name.toLowerCase().replace(/\s+/g, " ").trim();
        if (key) recentByName.set(key, Math.max(recentByName.get(key) ?? 0, penalty));
      }
    }
    const recent: RecentPenaltyInput = { byId: recentById, byName: recentByName };
    const scored = scoreCandidates(allCandidates, weatherContext, kids, preferences, recent);

    // Extract locked candidates (and report any locked ids that are stale).
    const lockedRaw = scored.filter((c) => lockedSet.has(c.id));
    const foundLockedIds = new Set(lockedRaw.map((c) => c.id));
    const invalidLockedIds = [...lockedSet].filter((id) => !foundLockedIds.has(id));
    if (invalidLockedIds.length > 0) {
      console.log(`[plan-day] ${invalidLockedIds.length} invalid lockedId(s): ${invalidLockedIds.join(", ")}`);
      for (const id of invalidLockedIds) {
        logDecision({
          script: "plan-day",
          action: "invalid-lock",
          target: id,
          reason: "locked id not present in candidate pool",
          meta: { city, targetDate: planDate },
        });
      }
    }
    const lockedWithBucket = lockedRaw.map((c) => ({
      candidate: c,
      bucket: lockedBucketMap.get(c.id) ?? null,
    }));
    const unlockedPool = scored.filter((c) => !lockedSet.has(c.id));

    // --- Build the diverse pool ---

    // Dedupe events at same venue + time.
    const rawEventCandidates = unlockedPool.filter((c) => c.source === "event");
    const dedupedEvents: Candidate[] = [];
    const eventGroupSeen = new Map<string, Candidate>();
    for (const c of rawEventCandidates) {
      const loc = (c.venue || c.address || c.city || "").toLowerCase().trim();
      const time = (c.eventTime || "").toLowerCase().trim();
      const groupKey = time ? `${loc}|${time}` : null;
      if (eventGroupSeen.has(c.id)) continue;
      eventGroupSeen.set(c.id, c);
      if (!groupKey) {
        dedupedEvents.push(c);
        continue;
      }
      const existing = dedupedEvents.find((e) => {
        const eLoc = (e.venue || e.address || e.city || "").toLowerCase().trim();
        const eTime = (e.eventTime || "").toLowerCase().trim();
        return `${eLoc}|${eTime}` === groupKey;
      });
      if (!existing) dedupedEvents.push(c);
      else if ((c.score || 0) > (existing.score || 0)) {
        dedupedEvents[dedupedEvents.indexOf(existing)] = c;
      }
    }
    const eventCandidates = dedupedEvents;
    const foodCandidates = unlockedPool.filter((c) => c.source === "place" && c.category === "food");
    const otherPlaces = unlockedPool.filter((c) => c.source === "place" && c.category !== "food");

    const diversePool: Candidate[] = [];
    const MAX_CURATED_PLACES = 2;
    let curatedCount = 0;
    const tryAdd = (c: Candidate): boolean => {
      const isCurated = (c as any).curated && c.source === "place";
      if (isCurated) {
        if (curatedCount >= MAX_CURATED_PLACES) return false;
        curatedCount++;
      }
      diversePool.push(c);
      return true;
    };

    const eventSample = weightedSample(eventCandidates, 6, 12);
    for (const c of eventSample) tryAdd(c);

    // Need enough food picks to populate three meal buckets — bump to 8.
    const foodSample = weightedSample(foodCandidates, Math.max(8, 8), 22);
    for (const c of foodSample) tryAdd(c);

    const catCounts: Record<string, number> = {};
    const CAT_CAPS: Record<string, number> = {
      outdoor: 3,
      museum: 2,
      entertainment: 3,
      wellness: 1,
      shopping: 2,
      arts: 3,
      sports: 2,
      events: 3,
    };
    const otherSample = weightedSample(otherPlaces, 80, 22);
    for (const c of otherSample) {
      const count = catCounts[c.category] || 0;
      const maxForCat = CAT_CAPS[c.category] ?? 3;
      if (count >= maxForCat) continue;
      if (!tryAdd(c)) continue;
      catCounts[c.category] = count + 1;
      if (diversePool.length >= CANDIDATE_POOL_SIZE) break;
    }

    const cards = await pickBucketsWithClaude(
      diversePool,
      lockedWithBucket,
      weatherData.weather,
      city,
      kids,
      preferences,
      planDate,
      weekContext,
      dayKey,
    );

    const responseData = {
      cards,
      weather: weatherData.weather,
      city,
      kids,
      generatedAt: new Date().toISOString(),
      poolSize: allCandidates.length,
      invalidLockedIds: invalidLockedIds.length > 0 ? invalidLockedIds : undefined,
    };

    if (lockedIds.length === 0 && dismissedIds.length === 0 && dismissedNameSet.size === 0 && blockedSet.size === 0) {
      planCache.set(cacheKey, { data: responseData, ts: Date.now() });
      if (planCache.size > 100) {
        const oldest = planCache.keys().next().value!;
        planCache.delete(oldest);
      }
    }

    return okJson(responseData, { "Cache-Control": "private, no-store" });
  } catch (err) {
    console.error("[plan-day] error:", err);
    return errJson(err instanceof Error ? err.message : "Plan generation failed", 500);
  }
};
