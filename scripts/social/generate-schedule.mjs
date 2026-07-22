#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Today — 10-Day Schedule Generator
// Populates the 3-slot daily schedule with draft content + Recraft image:
//   07:15 — Day Plan (one /api/plan-day call per day)
//   11:45 — Tonight Pick (best evening event)
//   16:30 — Wildcard (SV history, restaurant, or general)
// Each slot lands with copy + image both ready so the review portal can
// approve both in one pass instead of stepping copy → image-gen → image.
//
// Also writes today's adults + kids plans into default-plans.json so the
// homepage first-paint reuses the social day-plan instead of recomputing.
// (Replaces the now-deleted scripts/generate-default-plans.mjs.)
//
// Runs at 2 AM on the Mini.
// Usage: node scripts/social/generate-schedule.mjs [--dry-run] [--days N]
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { loadAllCandidates, upcomingCandidates } from "./lib/data-loader.mjs";
import { scoreAndRank } from "./lib/scoring.mjs";
import { generateDayPlanCopy, generateTonightPickCopy, generateWildcardCopy } from "./lib/copy-gen.mjs";
import { todayPT, addDays } from "./lib/slot-scheduler.mjs";
import { runQualityReview } from "./lib/post-gen-review.mjs";
import { normalizeName } from "./lib/normalizeName.mjs";
import { canonicalizePlanCards } from "../../src/lib/south-bay/canonicalizeCard.mjs";
import { chainBrandKey } from "../../src/lib/south-bay/chains.mjs";
import { dayKeyForIsoDate, mealServiceIssue } from "../../src/lib/south-bay/mealService.mjs";
import { buildMjPromptForSlot } from "./lib/mj-prompt.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULE_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-schedule.json");
const PLANS_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "default-plans.json");
const EVENTS_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "upcoming-events.json");
const PLACES_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "places.json");
const SHARED_PLANS_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "shared-plans.json");
const RESTAURANT_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "scc-food-openings.json");
const REGIONAL_PLAN_CITY = "campbell";
const REGIONAL_PLAN_LABEL = "South Bay";
const DAY_PLAN_SELECTION_MODEL = "pillar-pairs-v1";
const MEAL_PAIR_MAX_MILES = 5;
const PAIRS = [
  ["morning", "breakfast"],
  ["afternoon", "lunch"],
  ["evening", "dinner"],
];

// Load env
const ENV_FILE = join(__dirname, "..", "..", ".env.local");
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const lines = readFileSync(ENV_FILE, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

// Compute a horizon that always reaches one full week past the next Wednesday
// from today. So a Saturday run covers Sat→Wed→+7 (12 days). A mid-week
// hand-run covers from now → next Wed + 7. Override with --days N if needed.
function computeDefaultDays() {
  const now = new Date();
  // PT day-of-week for "now"
  const todayDow = now.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "short" }).toLowerCase().slice(0, 3);
  const dowIdx = ["sun","mon","tue","wed","thu","fri","sat"].indexOf(todayDow);
  // Days from today until "next Wednesday" (3 = wed). If today is Wed, "next
  // Wednesday" is 7 days out (we still want to look forward, not stop today).
  const daysToNextWed = ((3 - dowIdx) + 7) % 7 || 7;
  // Inclusive horizon: today through next-Wed + 7 days
  return daysToNextWed + 7 + 1;
}
const daysAhead = parseInt(args.find((_, i) => args[i - 1] === "--days") || String(computeDefaultDays()));
// --hero-only: skip the social batch entirely and just refresh
// default-plans.json. This is now the standalone homepage/newsletter plan
// generator: it calls /api/plan-day directly for adults + kids instead of
// depending on social-schedule.json.
const heroOnly = args.includes("--hero-only");
// --local-only: commit the refreshed homepage/newsletter plans on the Mini but
// leave origin/main untouched. The guarded newsletter preflight will merge
// canonical remote changes before the next run.
const localOnly = args.includes("--local-only");

// Generic URL hosts that mean "no real event link" — copy generated against
// these either says "No URL provided" or pastes a useless homepage link.
// Reject candidates whose only URL is one of these so they never reach the
// copy generator.
const GENERIC_URL_HOSTS = new Set([
  "eventbrite.com", "www.eventbrite.com",
  "facebook.com", "www.facebook.com", "m.facebook.com",
  "instagram.com", "www.instagram.com",
  "twitter.com", "www.twitter.com", "x.com", "www.x.com",
  "meetup.com", "www.meetup.com",
  "google.com", "www.google.com",
  "linktr.ee", "linktree.com",
]);
function isUsableEventUrl(u) {
  if (!u || typeof u !== "string") return false;
  const trimmed = u.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  let parsed;
  try { parsed = new URL(trimmed); } catch { return false; }
  const host = parsed.hostname.toLowerCase();
  // Generic homepage of a known aggregator (path is empty / "/")
  const path = parsed.pathname.replace(/\/$/, "");
  if (GENERIC_URL_HOSTS.has(host) && path === "") return false;
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function loadSchedule() {
  if (!existsSync(SCHEDULE_FILE)) return { days: {} };
  try { return JSON.parse(readFileSync(SCHEDULE_FILE, "utf8")); } catch { return { days: {} }; }
}

function saveSchedule(schedule) {
  schedule._meta = {
    generatedAt: new Date().toISOString(),
    generator: "generate-schedule",
    daysAhead,
  };
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2) + "\n");
}

function loadDefaultPlans() {
  try { return JSON.parse(readFileSync(PLANS_FILE, "utf8")); } catch { return { plans: {} }; }
}

/** Extract card names from the *previous* default-plans.json, split by mode.
 *  Feeds `recentlyShown` (daysAgo: 1 → -25 penalty) into today's plan gen so
 *  day-over-day variety actually happens. Walks any key that starts with
 *  "adults" or "kids" (covers today + ":tomorrow" + legacy ":h9" variants). */
function extractPreviousPlanNames(plansData) {
  const adults = new Set();
  const kids = new Set();
  for (const [key, plan] of Object.entries(plansData?.plans || {})) {
    const target = key.startsWith("kids") ? kids : adults;
    for (const c of (plan?.cards || [])) {
      const n = normalizeName(c.name);
      if (n) target.add(n);
    }
  }
  return { adults: [...adults], kids: [...kids] };
}

const PLAN_API_BASE = process.env.SBT_API_BASE || "https://southbaytoday.org";
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

/** Look up a Google Places photo ref for a venue name. For in-app display only. */
async function lookupPhotoRef(name, city) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !name) return null;
  try {
    const query = city ? `${name} ${city.replace(/-/g, " ")}` : name;
    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.photos",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.places?.[0]?.photos?.[0]?.name || null;
  } catch { return null; }
}

/** Enrich plan cards that are missing photoRef. */
async function enrichCardPhotos(cards) {
  for (const card of cards) {
    if (card.photoRef) continue;
    const name = card.venue || card.name;
    if (!name) continue;
    const ref = await lookupPhotoRef(name, card.city);
    if (ref) card.photoRef = ref;
    await new Promise(r => setTimeout(r, 300));
  }
}

// Category → Unsplash URL cache so we only call once per category per run.
// Cards whose photoRef + image are both null would otherwise flash the
// category emoji on homepage load before the client-side Unsplash fallback
// resolves; pre-baking the URL means the browser renders the image on
// first paint.
const unsplashByCategory = new Map();

async function unsplashForCategory(category) {
  if (!category) return null;
  if (unsplashByCategory.has(category)) return unsplashByCategory.get(category);
  try {
    const res = await fetch(`${PLAN_API_BASE}/api/unsplash-photo?query=${encodeURIComponent(category)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { unsplashByCategory.set(category, null); return null; }
    const data = await res.json();
    const url = data?.url || null;
    unsplashByCategory.set(category, url);
    return url;
  } catch {
    unsplashByCategory.set(category, null);
    return null;
  }
}

/** Fill card.image with an Unsplash URL for cards still missing a photoRef
 *  after venue-lookup, so the homepage doesn't flash the emoji placeholder. */
async function enrichMissingImages(cards) {
  for (const c of cards) {
    if (c.photoRef || c.image) continue;
    const url = await unsplashForCategory(c.category);
    if (url) c.image = url;
  }
}

/** Backfill `eventTime` on event cards that lack it — usually frozen/approved
 *  slots written before plan-day learned to carry the field. Looks the event
 *  up in upcoming-events.json by ID (`event:<id>`) and copies its `time`.
 *  In-place mutation, no-op for non-events or events we can't resolve. */
let _eventsById = null;
function loadEventsById() {
  if (_eventsById) return _eventsById;
  try {
    const raw = readFileSync(EVENTS_FILE, "utf8");
    const events = (JSON.parse(raw).events || []);
    _eventsById = new Map(events.map((e) => [e.id, e]));
  } catch {
    _eventsById = new Map();
  }
  return _eventsById;
}
function deriveMissingEventTimes(cards) {
  const byId = loadEventsById();
  for (const c of cards) {
    if (c.source !== "event") continue;
    if (c.eventTime) continue;
    const id = String(c.id || "").replace(/^event:/, "");
    const evt = byId.get(id);
    if (evt?.time) c.eventTime = evt.time;
  }
}

/** Call the regional plan API for a date. `city` is only a stable weather
 *  context; it never limits the candidate pool. Returns plan data or null. */
async function fetchPlanFromApi(city = REGIONAL_PLAN_CITY, dateStr, opts = {}) {
  const { blockedNames = [], weekContext, kids = false, recentlyShown = [] } = opts;
  try {
    const res = await fetch(`${PLAN_API_BASE}/api/plan-day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city,
        scope: "regional",
        kids,
        planDate: dateStr,
        blockedNames,
        weekContext,
        recentlyShown,
        noCache: Boolean(opts.noCache),
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
      console.log(`      ⚠️  Plan API ${res.status} ${res.statusText} (city=${city} kids=${kids} date=${dateStr})`);
      return null;
    }
    const data = await res.json();
    if (!data.cards?.length) {
      console.log(`      ⚠️  Plan API returned 0 cards (city=${city} kids=${kids} date=${dateStr} pool=${data.poolSize ?? "?"})`);
      return null;
    }
    return data;
  } catch (err) {
    console.log(`      ⚠️  Plan API failed: ${err.message}`);
    return null;
  }
}

function pairingIssues(cards) {
  const issues = [];
  const byBucket = new Map((cards || []).map((card) => [card.bucket, card]));
  if (byBucket.size !== 6) issues.push(`only ${byBucket.size} bucket(s) filled`);
  const mealBrands = new Map();
  for (const mealBucket of ["breakfast", "lunch", "dinner"]) {
    const meal = byBucket.get(mealBucket);
    if (!meal) continue;
    const brand = chainBrandKey(meal.name) || meal.id;
    if (mealBrands.has(brand)) {
      issues.push(`duplicate meal brand: ${mealBrands.get(brand)} / ${meal.name || meal.id}`);
    } else {
      mealBrands.set(brand, meal.name || meal.id);
    }
  }
  for (const [pillarBucket, mealBucket] of PAIRS) {
    const pillar = byBucket.get(pillarBucket);
    const meal = byBucket.get(mealBucket);
    if (!pillar) { issues.push(`missing ${pillarBucket} pillar`); continue; }
    if (!meal) { issues.push(`missing ${mealBucket} pairing`); continue; }
    if (pillar.role !== "pillar") issues.push(`${pillarBucket} is not marked pillar`);
    if (meal.role !== "paired-meal") issues.push(`${mealBucket} is not marked paired-meal`);
    if (pillar.pairedWithId !== meal.id || meal.pairedWithId !== pillar.id) {
      issues.push(`${pillarBucket}/${mealBucket} links are not reciprocal`);
    }
    if (!Number.isFinite(meal.pairDistanceMiles)) {
      issues.push(`${mealBucket} is missing pair distance`);
    } else if (meal.pairDistanceMiles > MEAL_PAIR_MAX_MILES + 0.05) {
      issues.push(`${mealBucket} is ${meal.pairDistanceMiles.toFixed(1)} miles from ${pillarBucket}`);
    }
    if (!["exact", "venue"].includes(meal.pairLocationPrecision)) {
      issues.push(`${mealBucket} proximity is not venue-resolved`);
    }
  }
  return issues;
}

let _placesById = null;
function loadPlacesById() {
  if (_placesById) return _placesById;
  try {
    const data = JSON.parse(readFileSync(PLACES_FILE, "utf8"));
    _placesById = new Map((data.places || []).filter((place) => place?.id).map((place) => [place.id, place]));
  } catch {
    _placesById = new Map();
  }
  return _placesById;
}

function mealIntegrityIssues(cards, dateStr) {
  const dayKey = dayKeyForIsoDate(dateStr);
  if (!dayKey) return [];
  const placesById = loadPlacesById();
  const issues = [];
  for (const card of cards || []) {
    if (!["breakfast", "lunch", "dinner"].includes(card.bucket)) continue;
    const placeId = String(card.id || "").replace(/^place:/, "");
    const place = placesById.get(placeId);
    if (!place) continue;
    const issue = mealServiceIssue(place, card.bucket, dayKey);
    if (issue) issues.push(`${card.name || place.name || card.bucket}: ${issue}`);
  }
  return issues;
}

/** Check whether a generated pillar-pairs plan qualifies. */
function planPassesQuality(plan, usedNames, dateStr = plan?.planDate) {
  if (!plan?.cards?.length) return { ok: false, reason: "empty" };
  const cards = plan.cards;
  if (plan.selectionModel !== DAY_PLAN_SELECTION_MODEL) {
    return { ok: false, reason: `unexpected selection model: ${plan.selectionModel || "legacy"}` };
  }
  const pairProblems = pairingIssues(cards);
  if (pairProblems.length) return { ok: false, reason: pairProblems.join("; ") };
  const mealProblems = mealIntegrityIssues(cards, dateStr);
  if (mealProblems.length) return { ok: false, reason: mealProblems.join("; ") };
  // Reject if ≥2 venues repeat a previously-used name this run.
  const names = cards.map((c) => normalizeName(c.name)).filter(Boolean);
  const overlap = names.filter((n) => usedNames.has(n));
  if (overlap.length >= 2) {
    return { ok: false, reason: `${overlap.length} repeats: ${overlap.slice(0, 3).join(", ")}` };
  }
  return { ok: true };
}

function loadSharedPlans() {
  try { return JSON.parse(readFileSync(SHARED_PLANS_FILE, "utf8")); } catch { return {}; }
}

function saveSharedPlans(plans) {
  writeFileSync(SHARED_PLANS_FILE, JSON.stringify(plans, null, 2) + "\n");
}

function generatePlanId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Save a day plan to shared-plans.json and return the plan URL. */
function createSharedPlanUrl(plan, dateStr) {
  const planId = generatePlanId();
  const entry = {
    cards: canonicalizePlanCards(plan.cards),
    city: plan.city || plan.cards.find((card) => card.role === "pillar")?.city || REGIONAL_PLAN_CITY,
    kids: false,
    weather: plan.weather,
    planDate: dateStr,
    createdAt: new Date().toISOString(),
    selectionModel: plan.selectionModel || null,
    mealPairMaxMiles: plan.mealPairMaxMiles || null,
  };
  const current = loadSharedPlans();
  current[planId] = entry;
  saveSharedPlans(current);
  return `https://southbaytoday.org/plan/${planId}`;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Fall-back plan if the API failed entirely. The bucket schema only has one
 *  plan per (kids × today/tomorrow), so we just return the adults plan from
 *  yesterday's default-plans.json — better than skipping the day. */
function pickPlanForDate(plansData, _dateStr) {
  const plans = plansData.plans || {};
  const candidate = plans["adults"] || plans["adults:tomorrow"];
  if (!candidate?.cards?.length) {
    // Legacy fallback: any non-kids key (handles ":h9" pre-migration data).
    for (const [key, plan] of Object.entries(plans)) {
      if (key.startsWith("kids")) continue;
      if (plan?.cards?.length) return { key, plan };
    }
    return null;
  }
  return { key: "adults", plan: candidate };
}

/** Parse a time string like "7:30 PM", "14:00", "noon" into 24h hour. Returns null if unparseable. */
function parseHour(timeStr) {
  if (!timeStr) return null;
  const lower = timeStr.toLowerCase().trim();
  if (lower.includes("noon")) return 12;
  if (lower.includes("midnight")) return 0;

  // "7:30 PM", "7 PM", "7:30PM"
  const ampm = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const isPM = ampm[3] === "pm";
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h;
  }

  // 24h: "14:00", "17:30"
  const mil = lower.match(/^(\d{1,2}):(\d{2})$/);
  if (mil) return parseInt(mil[1]);

  return null;
}

/** Find the best evening event for a given date. Must start at 5 PM or later.
 *  Dedups against recent venues + titles used earlier in the run — once an
 *  artist or venue shows up once in a week, it can't show again. */
function pickTonightEvent(candidates, dateStr, recentVenues = new Set(), recentTitles = new Set()) {
  const dateEvents = candidates.filter((c) => c.date === dateStr);
  if (dateEvents.length === 0) return null;

  // Boring event patterns — skip these as tonight picks
  const BORING_TONIGHT = /\b(board of|trustees|commission|committee|council meeting|task force|budget hearing|budget|townhall|town hall meeting|book club|chess club|book sale)\b/i;

  const norm = normalizeName;

  // Only events starting at 5 PM or later, not boring government/library stuff,
  // and MUST have a real, specific URL (not a generic homepage). Without one
  // the copy generator either says "No URL provided" or pastes a useless
  // homepage link.
  const evening = dateEvents.filter((c) => {
    const hour = parseHour(c.time);
    if (hour === null) return false;
    if (hour < 17) return false;
    const title = (c.title || c.name || "").toLowerCase();
    if (BORING_TONIGHT.test(title)) return false;
    if (c.category === "government") return false;
    if (!isUsableEventUrl(c.url)) return false;
    // Dedup within the week — venue OR title already used
    if (recentVenues.has(norm(c.venue))) return false;
    if (recentTitles.has(norm(c.title || c.name))) return false;
    return true;
  });

  if (evening.length === 0) return null;

  // Score and pick from top candidates with some randomness
  const scored = evening.map((c) => ({
    ...c,
    _score: (c.score || 0) + (c.category === "arts" ? 3 : 0) + (c.category === "food" ? 2 : 0) + (c.venue ? 2 : 0),
  }));
  return weightedRandomPick(scored);
}

/** Parse TECH_MILESTONES from tech-companies.ts source and return the first
 *  milestone block matching (month, day), or null. Mirrors the block-by-block
 *  parser in generate-sv-history.mjs so we get foundedYear/tagline/etc. */
function findMilestone(src, month, day) {
  const startIdx = src.indexOf("export const TECH_MILESTONES");
  if (startIdx === -1) return null;
  const nextExport = src.indexOf("\nexport ", startIdx + 1);
  const section = nextExport !== -1 ? src.slice(startIdx, nextExport) : src.slice(startIdx);

  const blockRe = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const str = (block, key) => {
    const m = block.match(new RegExp(`${key}:\\s*["'\`]([\\s\\S]*?)["'\`]\\s*[,}]`));
    return m ? m[1] : "";
  };
  const num = (block, key) => {
    const m = block.match(new RegExp(`${key}:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : null;
  };
  const bool = (block, key) => {
    const m = block.match(new RegExp(`${key}:\\s*(true|false)`));
    return m ? m[1] === "true" : false;
  };
  let m;
  while ((m = blockRe.exec(section)) !== null) {
    const block = m[0];
    if (num(block, "month") === month && num(block, "day") === day) {
      const company = str(block, "company");
      if (!company) continue;
      return {
        id: str(block, "id"),
        company,
        city: str(block, "city"),
        foundedYear: num(block, "foundedYear") || 0,
        tagline: str(block, "tagline"),
        anniversaryNote: str(block, "anniversaryNote"),
        url: str(block, "url"),
        chmExhibit: str(block, "chmExhibit"),
        defunct: bool(block, "defunct"),
      };
    }
  }
  return null;
}

/** Find wildcard content for a given date. Avoids repeating recent picks. */
function pickWildcard(candidates, dateStr, recentTitles = new Set()) {
  // 1. Check for SV history anniversary
  const date = new Date(dateStr + "T12:00:00");
  const month = date.getMonth() + 1;
  const day = date.getDate();

  try {
    const techFile = join(__dirname, "..", "..", "src", "data", "south-bay", "tech-companies.ts");
    if (existsSync(techFile)) {
      const milestone = findMilestone(readFileSync(techFile, "utf8"), month, day);
      if (milestone) {
        return {
          subtype: "sv-history",
          item: {
            id: milestone.id,
            title: milestone.company,
            name: milestone.company,
            company: milestone.company,
            city: milestone.city,
            foundedYear: milestone.foundedYear,
            tagline: milestone.tagline,
            anniversaryNote: milestone.anniversaryNote,
            url: milestone.url,
            chmExhibit: milestone.chmExhibit,
            defunct: milestone.defunct,
            month, day,
          },
        };
      }
    }
  } catch {}

  // 2. Check for restaurant openings
  try {
    const restaurants = JSON.parse(readFileSync(RESTAURANT_FILE, "utf8"));
    const openings = (restaurants.openings || []).filter((r) => r.date === dateStr);
    if (openings.length > 0) {
      return { subtype: "restaurant", item: openings[0] };
    }
  } catch {}

  // 3. Fall back to general event — prefer events 1-3 days out from post date
  //    Skip events already used in recent days (dedup)
  const postDate = new Date(dateStr + "T12:00:00");
  const nearFuture = candidates.filter((c) => {
    if (c.sourceType !== "event" || !c.date) return false;
    // Skip if we already posted about this recently
    const title = (c.title || c.name || "").toLowerCase();
    if (recentTitles.has(title)) return false;
    const eventDate = new Date(c.date + "T12:00:00");
    const daysOut = Math.round((eventDate - postDate) / 86400000);
    return daysOut >= 0 && daysOut <= 3;
  });
  if (nearFuture.length > 0) {
    return { subtype: "general", item: weightedRandomPick(nearFuture) };
  }

  // 4. Same-date events as fallback (also deduped)
  const dateItems = candidates.filter((c) => {
    if (c.date !== dateStr || c.sourceType !== "event") return false;
    const title = (c.title || c.name || "").toLowerCase();
    return !recentTitles.has(title);
  });
  if (dateItems.length > 0) {
    return { subtype: "general", item: weightedRandomPick(dateItems) };
  }

  return null;
}

/** Generate a Recraft poster/abstract image for a slot and mutate it in place
 *  to set imageUrl / imageStyle / imagePrompt. Mirrors the review portal's
 *  approve-copy flow so Saturday batches can land copy + image together,
 *  letting Stephen review both in one pass instead of stepping through copy
 *  approval to trigger image gen. Errors are logged and swallowed — the
 *  review portal can still regen any slot whose image gen failed. */
async function generateImageForSlot(slot, dateStr, slotType) {
  const { pickStyle, dayPlanPrompt, buildImagePrompt } = await import("./lib/poster-styles.mjs");
  const { generateAndUpload } = await import("./lib/recraft.mjs");
  const pathname = `posters/${dateStr}-${slotType}-${Date.now()}.png`;
  let prompt;
  if (slotType === "day-plan" && slot.plan) {
    const style = await pickStyle();
    prompt = dayPlanPrompt(slot.plan, dateStr, style.style);
    console.log(`      🎨 Generating day-plan poster (${style.id})...`);
    const { url } = await generateAndUpload({ prompt, pathname, colors: style.colors || undefined });
    slot.imageUrl = url;
    slot.imageStyle = style.id;
  } else {
    const postCopy = slot.copy?.x || "";
    const category = slot.item?.category || "";
    prompt = await buildImagePrompt(postCopy, category);
    console.log(`      🎨 Generating abstract image for ${slotType}...`);
    const { url } = await generateAndUpload({ prompt, pathname });
    slot.imageUrl = url;
    slot.imageStyle = "abstract";
  }
  slot.imagePrompt = prompt;

  // Pre-cache the Midjourney prompt for tonight-picks so the review portal's
  // MJ box is ready the moment Stephen expands the slot — no spinning wait
  // for Opus distillation. Mirrors the per-approve pregen in
  // copy-review-server.mjs but happens at batch time instead. Failures are
  // swallowed; portal can always regen on demand.
  if (slotType === "tonight-pick" && slot.imageUrl && slot.imageStyle !== "upload") {
    try {
      const mjPrompt = await buildMjPromptForSlot(slot, slotType);
      slot.mjPrompt = mjPrompt;
      slot.mjPromptAt = new Date().toISOString();
      console.log(`      🎨 MJ prompt pre-cached`);
    } catch (err) {
      console.error(`      ⚠️  MJ pregen failed: ${err.message}`);
    }
  }
}

/** Fires a 🔴 Discord alert if Pass 4 (emergency fill) couldn't fill some
 *  day-plan slots. By the time we reach here, every other safety net has
 *  failed, so this should rarely fire. */
async function sendEmptyDaysAlert(dates) {
  const webhook = process.env.DISCORD_WEBHOOK;
  if (!webhook) {
    console.warn("   ⚠️  DISCORD_WEBHOOK not set — empty-days alert NOT sent");
    return;
  }
  const lines = [
    `🔴 **Schedule generator: ${dates.length} empty day-plan slot(s)** — emergency fill exhausted`,
    `Dates: ${dates.join(", ")}`,
    ``,
    `Manual catch-up:`,
    `\`\`\``,
    `ssh stephenstanwood@100.117.24.89 'cd ~/Projects/southbaytoday.org && \\`,
    `  /opt/homebrew/bin/node --env-file=.env.local \\`,
    `  scripts/social/generate-schedule.mjs --days 10'`,
    `\`\`\``,
  ];
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
    });
    if (!res.ok) console.warn(`   ⚠️  Discord alert ${res.status}`);
    else console.log(`   📣 Discord alert sent for ${dates.length} empty day(s)`);
  } catch (err) {
    console.warn(`   ⚠️  Discord alert failed: ${err.message}`);
  }
}

/** Pick from top candidates with weighted randomness — top 5 eligible, weighted by score. */
function weightedRandomPick(items) {
  items.sort((a, b) => (b.score || 0) - (a.score || 0));
  const pool = items.slice(0, Math.min(5, items.length));
  // Weight: first gets 5, second 4, etc.
  const weights = pool.map((_, i) => pool.length - i);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}

// ── Main ──────────────────────────────────────────────────────────────────

/** One pass of generation over `daysAhead` days.
 *  Mutates `schedule` in place. Callable multiple times: the second call will
 *  regen any slot that was deleted between calls (e.g. by the quality review).
 *
 *  @param {object} opts
 *  @param {"draft-or-missing"|"missing-only"} [opts.regenMode="draft-or-missing"]
 *    - "draft-or-missing": replace existing draft slots and fill missing slots
 *      (used for Pass 1)
 *    - "missing-only": only fill missing slots, leave existing drafts alone
 *      (used for Pass 2 — flagged slots were deleted, everything else is keep)
 */
async function runGenerationPass(schedule, plansData, scored, { regenMode = "draft-or-missing", yesterdayAdultsNames = [] } = {}) {
  const shouldFill = (slot) => {
    if (!slot) return true;
    // Empty-stub drafts (status=draft but no actual content) always need filling.
    // A prior quality pass can leave an empty draft stub; always refill it.
    const isEmptyStub = slot.status === "draft" && !slot.plan && !slot.item && !slot.copy;
    if (isEmptyStub) return true;
    if (regenMode === "missing-only") return false;
    return slot.status === "draft";
  };
  const today = todayPT();
  let generated = 0;
  let skipped = 0;

  // Track recent wildcard/tonight titles to avoid repeats across days
  const recentWildcardTitles = new Set();
  const recentTonightTitles = new Set();
  const recentTonightVenues = new Set();
  const usedDayPlanNames = new Set();
  // Week-level context only dampens overused categories. Geography does not
  // participate across pillars or across days.
  const categorySaturation = {};
  const recordPlanForContext = (plan) => {
    for (const c of (plan?.cards || [])) {
      const cat = (c.category || "").toLowerCase();
      if (!cat) continue;
      categorySaturation[cat] = (categorySaturation[cat] || 0) + 1;
    }
  };
  const seedUsedFromSchedule = () => {
    for (const d of Object.keys(schedule.days)) {
      const day = schedule.days[d];
      const dp = day["day-plan"];
      if (dp?.plan?.cards) {
        for (const c of dp.plan.cards) {
          const n = normalizeName(c.name);
          if (n) usedDayPlanNames.add(n);
        }
        recordPlanForContext(dp.plan);
      }
      const tp = day["tonight-pick"];
      if (tp?.item) {
        const t = normalizeName(tp.item.title || tp.item.name);
        const v = normalizeName(tp.item.venue);
        if (t) recentTonightTitles.add(t);
        if (v) recentTonightVenues.add(v);
      }
      const wc = day["wildcard"];
      if (wc?.item) {
        const t = normalizeName(wc.item.title || wc.item.name);
        if (t) recentWildcardTitles.add(t);
      }
    }
  };
  seedUsedFromSchedule();

  for (let offset = 0; offset < daysAhead; offset++) {
    const dateStr = addDays(today, offset);
    const dayName = DAY_NAMES[new Date(dateStr + "T12:00:00").getDay()];

    if (!schedule.days[dateStr]) schedule.days[dateStr] = {};
    const day = schedule.days[dateStr];

    console.log(`\n  ${dayName} ${dateStr}:`);

    // ── Day Plan (7:15 AM) ──────────────────────────────────────────────
    if (shouldFill(day["day-plan"])) {
      const citySlug = REGIONAL_PLAN_CITY;
      const cityName = REGIONAL_PLAN_LABEL;

      if (dryRun) {
        console.log(`    📋 Day Plan: ${cityName} [dry run]`);
      } else {
        let plan = null;
        let lastReason = null;

        console.log(`    📋 Fetching plan for ${cityName} on ${dateStr}...`);
        try {
          const blockedNames = Array.from(usedDayPlanNames);
          const weekContext = { categorySaturation: { ...categorySaturation } };
          // Penalize (not hard-block) yesterday's adults picks so today's
          // plan shuffles even when seedUsedFromSchedule missed anything.
          // daysAgo: 1 → -25 points in plan-day's scoreCandidates.
          const recentlyShown = yesterdayAdultsNames.map((n) => ({ name: n, daysAgo: 1 }));
          let candidate = await fetchPlanFromApi(citySlug, dateStr, { blockedNames, weekContext, recentlyShown });
          if (!candidate) {
            lastReason = "api returned nothing";
          } else {
            let quality = planPassesQuality(candidate, usedDayPlanNames, dateStr);
            if (!quality.ok) {
              console.log(`      ⚠️  Invalid pair plan: ${quality.reason} — retrying uncached`);
              candidate = await fetchPlanFromApi(citySlug, dateStr, {
                blockedNames, weekContext, recentlyShown, noCache: true,
              });
              quality = planPassesQuality(candidate, usedDayPlanNames, dateStr);
            }
            if (!quality.ok) {
              lastReason = quality.reason;
            } else {
              plan = candidate;
            }
          }
        } catch (err) {
          lastReason = err.message;
          console.log(`      ⚠️  ${cityName} plan fetch error: ${err.message}`);
        }

        // Fall back to default plan only if the API gave us nothing
        if (!plan) {
          const fallback = pickPlanForDate(plansData, dateStr);
          const fallbackQuality = fallback
            ? planPassesQuality(fallback.plan, usedDayPlanNames, dateStr)
            : { ok: false, reason: "no fallback" };
          if (fallback && fallbackQuality.ok) {
            plan = fallback.plan;
            console.log(`      ↩ Fell back to default plan after: ${lastReason}`);
          } else if (fallback) {
            lastReason = `fallback rejected: ${fallbackQuality.reason}`;
          }
        }

        if (!plan || !plan.cards?.length) {
          console.log(`    📋 Day Plan: no acceptable plan — skipping (${lastReason})`);
        } else {
          // Enrich cards missing venue photos (for in-app display)
          await enrichCardPhotos(plan.cards);

          // Register every featured POI as used for the rest of this run
          for (const c of plan.cards) {
            const n = normalizeName(c.name);
            if (n) usedDayPlanNames.add(n);
          }
          recordPlanForContext(plan);

          // Create a shared plan entry and get a shareable URL
          const planUrl = createSharedPlanUrl(plan, dateStr);
          console.log(`    📎 Plan link: ${planUrl}`);

          try {
            const copy = await generateDayPlanCopy(plan, dateStr, planUrl);
            day["day-plan"] = {
              status: "draft",
              slotType: "day-plan",
              city: plan.city || citySlug,
              cityName,
              planUrl,
              plan: {
                cards: plan.cards,
                weather: plan.weather,
                selectionModel: plan.selectionModel,
                mealPairMaxMiles: plan.mealPairMaxMiles,
              },
              copy,
              imageUrl: null,
              imageStyle: null,
              copyApprovedAt: null,
              imageApprovedAt: null,
              generatedAt: new Date().toISOString(),
            };
            generated++;
            console.log(`    📋 Day Plan: ${cityName} (3 pillar/meal pairs) ✅`);
            try { await generateImageForSlot(day["day-plan"], dateStr, "day-plan"); }
            catch (err) { console.log(`      ⚠️  Image gen failed: ${err.message} (review portal can retry)`); }
          } catch (err) {
            console.log(`    📋 Day Plan: ${cityName} ❌ ${err.message}`);
          }
        }
      }
    } else {
      skipped++;
      console.log(`    📋 Day Plan: already ${day["day-plan"].status}`);
      // Still register its cards so future days dedup against it
      const existing = day["day-plan"].plan?.cards || [];
      for (const c of existing) {
        const n = normalizeName(c.name);
        if (n) usedDayPlanNames.add(n);
      }
      recordPlanForContext(day["day-plan"].plan);
    }

    // ── Tonight Pick (11:45 AM) ─────────────────────────────────────────
    if (shouldFill(day["tonight-pick"])) {
      const tonight = pickTonightEvent(scored, dateStr, recentTonightVenues, recentTonightTitles);
      if (tonight) {
        if (dryRun) {
          console.log(`    🌙 Tonight: ${tonight.title?.slice(0, 50)} [dry run]`);
        } else {
          try {
            const copy = await generateTonightPickCopy(tonight);
            const tTitle = normalizeName(tonight.title || tonight.name);
            const tVenue = normalizeName(tonight.venue);
            if (tTitle) recentTonightTitles.add(tTitle);
            if (tVenue) recentTonightVenues.add(tVenue);
            day["tonight-pick"] = {
              status: "draft",
              slotType: "tonight-pick",
              item: {
                title: tonight.title, city: tonight.city, cityName: tonight.cityName,
                venue: tonight.venue, date: tonight.date, time: tonight.time,
                category: tonight.category, summary: tonight.summary,
                url: tonight.url, cost: tonight.cost, costNote: tonight.costNote,
              },
              copy,
              imageUrl: null,
              imageStyle: null,
              copyApprovedAt: null,
              imageApprovedAt: null,
              generatedAt: new Date().toISOString(),
            };
            generated++;
            console.log(`    🌙 Tonight: ${tonight.title?.slice(0, 50)} ✅`);
            try { await generateImageForSlot(day["tonight-pick"], dateStr, "tonight-pick"); }
            catch (err) { console.log(`      ⚠️  Image gen failed: ${err.message} (review portal can retry)`); }
          } catch (err) {
            console.log(`    🌙 Tonight: ❌ ${err.message}`);
          }
        }
      } else {
        console.log(`    🌙 Tonight: no evening events found`);
      }
    } else {
      skipped++;
      const existing = day["tonight-pick"].item || {};
      const t = normalizeName(existing.title || existing.name);
      const v = normalizeName(existing.venue);
      if (t) recentTonightTitles.add(t);
      if (v) recentTonightVenues.add(v);
      console.log(`    🌙 Tonight: already ${day["tonight-pick"].status}`);
    }

    // ── Wildcard (4:30 PM) — SV History only ────────────────────────────
    // General/restaurant wildcards are paused; only create the slot on
    // anniversary dates that match a SV tech milestone.
    if (shouldFill(day["wildcard"])) {
      const wildRaw = pickWildcard(scored, dateStr, recentWildcardTitles);
      const wild = wildRaw && wildRaw.subtype === "sv-history" ? wildRaw : null;
      if (!wild && wildRaw) {
        console.log(`    🎲 Wildcard: skipping ${wildRaw.subtype} (paused — SV history only)`);
      }
      if (wild) {
        if (dryRun) {
          console.log(`    🎲 Wildcard: [${wild.subtype}] ${wild.item.title?.slice(0, 50) || wild.item.name?.slice(0, 50)} [dry run]`);
        } else {
          try {
            const copy = await generateWildcardCopy(wild.item, wild.subtype, dateStr);
            day["wildcard"] = {
              status: "draft",
              slotType: "wildcard",
              subtype: wild.subtype,
              item: {
                title: wild.item.title || wild.item.name,
                city: wild.item.city, cityName: wild.item.cityName,
                venue: wild.item.venue, date: wild.item.date, time: wild.item.time,
                category: wild.item.category, summary: wild.item.summary || wild.item.blurb,
                url: wild.item.url, cost: wild.item.cost, costNote: wild.item.costNote,
                company: wild.item.company, foundedYear: wild.item.foundedYear,
              },
              copy,
              imageUrl: null,
              imageStyle: null,
              copyApprovedAt: null,
              imageApprovedAt: null,
              generatedAt: new Date().toISOString(),
            };
            generated++;
            recentWildcardTitles.add((wild.item.title || wild.item.name || "").toLowerCase());
            console.log(`    🎲 Wildcard: [${wild.subtype}] ${(wild.item.title || wild.item.name || "").slice(0, 50)} ✅`);
            // SV history wildcards skip Recraft entirely — they get the company logo
            // (curated via fetch-tech-logos.mjs nightly) which is more recognizable than
            // any abstract poster. Auto-approve since these are pre-vetted milestones.
            if (wild.subtype === "sv-history") {
              const logoId = wild.item.id;
              if (logoId) {
                day["wildcard"].imageUrl = `https://southbaytoday.org/logos/${logoId}.png`;
                day["wildcard"].imageStyle = "logo";
                const now = new Date().toISOString();
                day["wildcard"].copyApprovedAt = now;
                day["wildcard"].imageApprovedAt = now;
                console.log(`      ✓ SV history auto-approved (logo: ${logoId}.png)`);
              } else {
                console.log(`      ⚠️  SV history slot missing id — staying draft`);
              }
            } else {
              try { await generateImageForSlot(day["wildcard"], dateStr, "wildcard"); }
              catch (err) { console.log(`      ⚠️  Image gen failed: ${err.message} (review portal can retry)`); }
            }
          } catch (err) {
            console.log(`    🎲 Wildcard: ❌ ${err.message}`);
          }
        }
      } else {
        console.log(`    🎲 Wildcard: no content found — skipping`);
      }
    } else {
      skipped++;
      // Track existing wildcard title for dedup
      const existingTitle = day["wildcard"]?.item?.title || day["wildcard"]?.item?.name || "";
      if (existingTitle) recentWildcardTitles.add(existingTitle.toLowerCase());
      console.log(`    🎲 Wildcard: already ${day["wildcard"].status}`);
    }

    // Rate limit between days
    if (!dryRun && offset < daysAhead - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return { generated, skipped };
}

async function main() {
  const today = todayPT();

  // Hero-only fast path: skip the 10-day social batch and just refresh
  // default-plans.json for the homepage. Runs daily on the Mini.
  if (heroOnly) {
    console.log(`\n🏠 Hero-only refresh — ${today}`);
    const schedule = loadSchedule();
    const plansData = loadDefaultPlans();
    const { adults: yesterdayAdultsNames, kids: yesterdayKidsNames } = extractPreviousPlanNames(plansData);
    if (dryRun) {
      console.log(`\n🏜️  Dry run (hero-only)`);
      return;
    }
    await writeHomepageDefaultPlans(schedule, today, yesterdayAdultsNames, yesterdayKidsNames);
    try {
      const repoRoot = join(__dirname, "..", "..");
      const dirty = execSync("git diff --name-only -- src/data/south-bay/default-plans.json", { cwd: repoRoot, encoding: "utf8" }).trim();
      if (dirty) {
        execSync("git add src/data/south-bay/default-plans.json", { cwd: repoRoot, stdio: "pipe" });
        execSync('git commit -m "data: refresh homepage default plans"', { cwd: repoRoot, stdio: "pipe" });
        if (localOnly) {
          console.log("   📎 default-plans.json committed locally");
        } else {
          execSync("git push", { cwd: repoRoot, stdio: "pipe" });
          console.log("   📎 default-plans.json committed and pushed");
        }
      } else {
        console.log("   (default-plans.json unchanged)");
      }
    } catch (e) {
      console.warn("   ⚠️  Failed to auto-save default-plans.json:", e.message);
    }
    return;
  }

  console.log(`\n📅 Schedule generator — ${today} (${daysAhead} days ahead)`);

  const schedule = loadSchedule();
  const plansData = loadDefaultPlans();
  const allCandidates = loadAllCandidates();
  const upcoming = upcomingCandidates(allCandidates, daysAhead + 7);

  let scored;
  try { scored = scoreAndRank(upcoming); } catch { scored = upcoming; }

  // Cross-day variety seed: extract yesterday's picks (split by mode) from
  // the existing default-plans.json before we overwrite it. These flow into
  // every plan API call as recentlyShown{daysAgo: 1} → -25 score penalty.
  // Without this the nightly generator has no memory and serves the same
  // "obviously good" Bill's Cafe + Vasona Lake stack day after day.
  const { adults: yesterdayAdultsNames, kids: yesterdayKidsNames } = extractPreviousPlanNames(plansData);
  console.log(`   🔁 variety seed: ${yesterdayAdultsNames.length} adults + ${yesterdayKidsNames.length} kids names from yesterday`);

  // ── Pass 1: initial generation ─────────────────────────────────────────
  const p1 = await runGenerationPass(schedule, plansData, scored, { yesterdayAdultsNames });
  console.log(`\n▶︎ Pass 1: ${p1.generated} generated, ${p1.skipped} preserved`);

  // ── Quality review ────────────────────────────────────────────────────
  // Restrict to the active generation window — we don't want to delete a
  // slot we can't refill on Pass 2.
  const windowDates = Array.from({ length: daysAhead }, (_, i) => addDays(today, i));
  if (!dryRun) {
    console.log(`\n🔍 Running quality review...`);
    const review = runQualityReview(schedule, { dates: windowDates, resetFlaggedToDraft: true });
    for (const a of review.autoFixed) {
      console.log(`   🔧 auto-fix [${a.date} ${a.slotType}] ${a.kind}: ${a.details}`);
    }
    for (const f of review.flagged) {
      console.log(`   🚩 flag [${f.date} ${f.slotType}] ${f.reason} — will regen`);
    }

    // ── Pass 2: regenerate only the slots that were deleted by review ────
    if (review.flagged.length) {
      console.log(`\n🔁 Pass 2: regenerating ${review.flagged.length} flagged slot(s)...`);
      const p2 = await runGenerationPass(schedule, plansData, scored, { regenMode: "missing-only", yesterdayAdultsNames });
      console.log(`✅ Pass 2: ${p2.generated} regenerated`);

      // Re-run the deterministic portion of the review (terminology,
      // chronological sort) on the newly-regenerated slots. Don't reset
      // flags this time — avoid regen loops.
      const review2 = runQualityReview(schedule, { dates: windowDates, resetFlaggedToDraft: false });
      for (const a of review2.autoFixed) {
        console.log(`   🔧 auto-fix [${a.date} ${a.slotType}] ${a.kind}: ${a.details}`);
      }

      // The first retry is regional again: a different city would not
      // change the candidate pool and must never be used as a quality lever.
      for (const f of review2.flagged) {
        console.log(`   ⚠️  still flagged [${f.date} ${f.slotType}] ${f.reason} (regional retry exhausted)`);
      }
    }

    // ── Pass 4: empty-slot safety net ──────────────────────────────────────
    // After all other passes, scan the window for day-plan slots that ended up
    // missing or empty (no plan/cards). Those are guaranteed bugs — the user
    // sees "Untitled" rows in the review portal. Make one more regional
    // attempt per empty slot and Discord-alert any that still fail.
    const emptyDayPlans = windowDates.filter((dateStr) => {
      const dp = schedule.days?.[dateStr]?.["day-plan"];
      if (!dp) return true;
      if (["image-approved", "copy-approved", "published"].includes(dp.status)) return false;
      return !dp.plan?.cards?.length;
    });
    if (emptyDayPlans.length) {
      console.log(`\n🚨 ${emptyDayPlans.length} empty day-plan slot(s) — regional emergency fill`);
      const stillEmpty = [];
      for (const dateStr of emptyDayPlans) {
        console.log(`   🚨 ${dateStr}: emergency regional fill`);
        try {
          const plan = await fetchPlanFromApi(REGIONAL_PLAN_CITY, dateStr, { noCache: true });
          if (!plan?.cards?.length) {
            console.log("      ❌ plan-day returned empty");
            stillEmpty.push(dateStr);
            continue;
          }
          const quality = planPassesQuality(plan, new Set(), dateStr);
          if (!quality.ok) {
            console.log(`      ❌ invalid pair plan: ${quality.reason}`);
            stillEmpty.push(dateStr);
            continue;
          }
          await enrichCardPhotos(plan.cards);
          const planUrl = createSharedPlanUrl(plan, dateStr);
          const copy = await generateDayPlanCopy(plan, dateStr, planUrl);
          if (!schedule.days[dateStr]) schedule.days[dateStr] = {};
          schedule.days[dateStr]["day-plan"] = {
            status: "draft",
            slotType: "day-plan",
            city: plan.city || REGIONAL_PLAN_CITY,
            cityName: REGIONAL_PLAN_LABEL,
            planUrl,
            plan: {
              cards: plan.cards,
              weather: plan.weather,
              selectionModel: plan.selectionModel,
              mealPairMaxMiles: plan.mealPairMaxMiles,
            },
            copy,
            imageUrl: null,
            imageStyle: null,
            copyApprovedAt: null,
            imageApprovedAt: null,
            generatedAt: new Date().toISOString(),
          };
          console.log("      ✅ filled with 3 pillar/meal pairs");
          try { await generateImageForSlot(schedule.days[dateStr]["day-plan"], dateStr, "day-plan"); }
          catch (err) { console.log(`      ⚠️  Image gen failed: ${err.message} (review portal can retry)`); }
        } catch (err) {
          console.log(`      ❌ emergency fill failed: ${err.message}`);
          stillEmpty.push(dateStr);
        }
      }
      if (stillEmpty.length) {
        await sendEmptyDaysAlert(stillEmpty);
      }
    }
  }

  // Clean up old dates (more than 2 days in the past)
  const cutoff = addDays(today, -2);
  for (const dateStr of Object.keys(schedule.days)) {
    if (dateStr < cutoff) {
      delete schedule.days[dateStr];
    }
  }

  if (!dryRun) {
    saveSchedule(schedule);
    console.log(`\n✅ Schedule saved`);

    // ── Homepage hero plans ──────────────────────────────────────────────
    // The homepage's SouthBayTodayView and the daily email read
    // default-plans.json for instant first-paint / morning digest content.
    await writeHomepageDefaultPlans(schedule, today, yesterdayAdultsNames, yesterdayKidsNames);

    // Auto-commit schedule + plan JSONs. social-schedule.json is included here
    // so the uncommitted-changes window can't be wiped by another process doing
    // `git reset --hard origin/main` (lost a full schedule run on 2026-04-25).
    try {
      const repoRoot = join(__dirname, "..", "..");
      const TRACKED = "src/data/south-bay/social-schedule.json src/data/south-bay/shared-plans.json src/data/south-bay/default-plans.json";
      const dirty = execSync(`git diff --name-only -- ${TRACKED}`, { cwd: repoRoot, encoding: "utf8" }).trim();
      if (dirty) {
        execSync(`git add ${TRACKED}`, { cwd: repoRoot, stdio: "pipe" });
        execSync('git commit -m "data: update schedule + shared + default plans from schedule generator"', { cwd: repoRoot, stdio: "pipe" });
        try {
          execSync("git push", { cwd: repoRoot, stdio: "pipe" });
        } catch {
          execSync("git pull --rebase --autostash origin main", { cwd: repoRoot, stdio: "pipe" });
          execSync("git push", { cwd: repoRoot, stdio: "pipe" });
        }
        console.log("   📎 schedule + shared + default plans committed and pushed");
      }
    } catch (e) {
      console.warn("   ⚠️  Failed to auto-push plan JSONs:", e.message);
    }
  } else {
    console.log(`\n🏜️  Dry run`);
  }
}

const DEFAULT_PLANS_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "default-plans.json");

async function writeHomepageDefaultPlans(schedule, todayStr, yesterdayAdultsNames = [], yesterdayKidsNames = []) {
  console.log(`\n📋 Generating today's adults plan (${REGIONAL_PLAN_LABEL}) for homepage/newsletter...`);
  let todayAdultsPlan = null;
  try {
    const recentlyShown = yesterdayAdultsNames.map((n) => ({ name: n, daysAgo: 1 }));
    todayAdultsPlan = await fetchPlanFromApi(REGIONAL_PLAN_CITY, todayStr, { kids: false, recentlyShown });
    const quality = planPassesQuality(todayAdultsPlan, new Set(), todayStr);
    if (!quality.ok) {
      console.warn(`   ⚠️  Adults plan rejected: ${quality.reason}`);
      todayAdultsPlan = null;
    }
    if (todayAdultsPlan?.cards?.length) {
      deriveMissingEventTimes(todayAdultsPlan.cards);
      await enrichCardPhotos(todayAdultsPlan.cards);
      await enrichMissingImages(todayAdultsPlan.cards);
    }
  } catch (err) {
    console.warn(`   ⚠️  Adults plan fetch failed: ${err.message}`);
  }

  // Carry-forward fallbacks keep the site from going blank if the API is
  // briefly down, but only a complete v1 pair plan is eligible. Legacy social
  // schedule data must not quietly reintroduce the old six-bucket logic.
  const previousPlans = loadDefaultPlans()?.plans || {};
  const scheduledTodayAdults = schedule.days?.[todayStr]?.["day-plan"];
  const scheduledFallbackQuality = scheduledTodayAdults?.plan?.cards?.length
    ? planPassesQuality(scheduledTodayAdults.plan, new Set(), todayStr)
    : { ok: false };
  const fallbackAdultsEntry = scheduledFallbackQuality.ok
    ? {
        cards: scheduledTodayAdults.plan.cards,
        weather: scheduledTodayAdults.plan.weather || null,
        city: scheduledTodayAdults.city,
        kids: false,
        selectionModel: scheduledTodayAdults.plan.selectionModel || null,
        mealPairMaxMiles: scheduledTodayAdults.plan.mealPairMaxMiles || null,
        planDate: todayStr,
        carriedForward: true,
        generatedAt: new Date().toISOString(),
      }
    : carryForwardPlan(previousPlans, todayStr, "adults", "adults:tomorrow");
  if (!todayAdultsPlan?.cards?.length && !fallbackAdultsEntry?.cards?.length) {
    console.warn("   ⚠️  Today's adults plan unavailable — skipping default-plans.json update");
    return;
  }

  console.log(`\n📋 Generating today's kids plan (${REGIONAL_PLAN_LABEL}) for homepage...`);
  let kidsPlan = null;
  try {
    // Penalize yesterday's kids picks so the homepage doesn't serve
    // Bill's Cafe + Vasona Lake + Smoking Pig every day in a row.
    // daysAgo: 1 → -25 points in plan-day's scoreCandidates.
    const recentlyShown = yesterdayKidsNames.map((n) => ({ name: n, daysAgo: 1 }));
    kidsPlan = await fetchPlanFromApi(REGIONAL_PLAN_CITY, todayStr, { kids: true, recentlyShown });
    const quality = planPassesQuality(kidsPlan, new Set(), todayStr);
    if (!quality.ok) {
      console.warn(`   ⚠️  Kids plan rejected: ${quality.reason}`);
      kidsPlan = null;
    }
    if (kidsPlan?.cards?.length) {
      deriveMissingEventTimes(kidsPlan.cards);
      await enrichCardPhotos(kidsPlan.cards);
      await enrichMissingImages(kidsPlan.cards);
    }
  } catch (err) {
    console.warn(`   ⚠️  Kids plan fetch failed: ${err.message}`);
  }

  // ── Tomorrow's hero plans ────────────────────────────────────────────────
  // The homepage flips into tomorrow mode after 6 PM (kids) / 8 PM (adults).
  // Without dedicated tomorrow heroes, today's cache leaks today-only events
  // into tomorrow's view.
  const tomorrowStr = isoOffset(todayStr, 1);
  let tomorrowAdultsEntry = null;
  let tomorrowKidsEntry = null;
  console.log(`\n📋 Generating tomorrow's adults plan (${REGIONAL_PLAN_LABEL}) for homepage...`);
  try {
    const todayAdultNames = (todayAdultsPlan?.cards || fallbackAdultsEntry?.cards || []).map((c) => c.name).filter(Boolean);
    const recentlyShown = [
      ...yesterdayAdultsNames.map((n) => ({ name: n, daysAgo: 2 })),
      ...todayAdultNames.map((n) => ({ name: n, daysAgo: 1 })),
    ];
    const tomorrowAdultsPlan = await fetchPlanFromApi(REGIONAL_PLAN_CITY, tomorrowStr, { kids: false, recentlyShown });
    const quality = planPassesQuality(tomorrowAdultsPlan, new Set(), tomorrowStr);
    if (!quality.ok) console.warn(`   ⚠️  Tomorrow adults plan rejected: ${quality.reason}`);
    if (quality.ok && tomorrowAdultsPlan?.cards?.length) {
      deriveMissingEventTimes(tomorrowAdultsPlan.cards);
      await enrichCardPhotos(tomorrowAdultsPlan.cards);
      await enrichMissingImages(tomorrowAdultsPlan.cards);
      tomorrowAdultsEntry = {
        cards: tomorrowAdultsPlan.cards,
        weather: tomorrowAdultsPlan.weather || null,
        city: tomorrowAdultsPlan.city || REGIONAL_PLAN_CITY,
        kids: false,
        planDate: tomorrowStr,
        selectionModel: tomorrowAdultsPlan.selectionModel,
        mealPairMaxMiles: tomorrowAdultsPlan.mealPairMaxMiles,
        generatedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn(`   ⚠️  Tomorrow adults plan fetch failed: ${err.message}`);
  }

  console.log(`\n📋 Generating tomorrow's kids plan (${REGIONAL_PLAN_LABEL}) for homepage...`);
  try {
    const todayNames = (kidsPlan?.cards || todayAdultsPlan?.cards || fallbackAdultsEntry?.cards || []).map((c) => c.name).filter(Boolean);
    const recentlyShown = [
      ...yesterdayKidsNames.map((n) => ({ name: n, daysAgo: 2 })),
      ...todayNames.map((n) => ({ name: n, daysAgo: 1 })),
    ];
    const tomorrowKidsPlan = await fetchPlanFromApi(REGIONAL_PLAN_CITY, tomorrowStr, { kids: true, recentlyShown });
    const quality = planPassesQuality(tomorrowKidsPlan, new Set(), tomorrowStr);
    if (!quality.ok) console.warn(`   ⚠️  Tomorrow kids plan rejected: ${quality.reason}`);
    if (quality.ok && tomorrowKidsPlan?.cards?.length) {
      deriveMissingEventTimes(tomorrowKidsPlan.cards);
      await enrichCardPhotos(tomorrowKidsPlan.cards);
      await enrichMissingImages(tomorrowKidsPlan.cards);
      tomorrowKidsEntry = {
        cards: tomorrowKidsPlan.cards,
        weather: tomorrowKidsPlan.weather || null,
        city: tomorrowKidsPlan.city || REGIONAL_PLAN_CITY,
        kids: true,
        planDate: tomorrowStr,
        selectionModel: tomorrowKidsPlan.selectionModel,
        mealPairMaxMiles: tomorrowKidsPlan.mealPairMaxMiles,
        generatedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn(`   ⚠️  Tomorrow kids plan fetch failed: ${err.message}`);
  }

  const adultsEntry = todayAdultsPlan?.cards?.length ? {
    cards: todayAdultsPlan.cards,
    weather: todayAdultsPlan.weather || null,
    city: todayAdultsPlan.city || REGIONAL_PLAN_CITY,
    kids: false,
    planDate: todayStr,
    selectionModel: todayAdultsPlan.selectionModel,
    mealPairMaxMiles: todayAdultsPlan.mealPairMaxMiles,
    generatedAt: new Date().toISOString(),
  } : fallbackAdultsEntry;
  const kidsEntry = kidsPlan ? {
    cards: kidsPlan.cards,
    weather: kidsPlan.weather || null,
    city: kidsPlan.city || REGIONAL_PLAN_CITY,
    kids: true,
    planDate: todayStr,
    selectionModel: kidsPlan.selectionModel,
    mealPairMaxMiles: kidsPlan.mealPairMaxMiles,
    generatedAt: new Date().toISOString(),
  } : null;

  // Carry-forward fallback: if today's or tomorrow's kids fetch returned
  // empty, reuse only a complete place-only v1 plan. We never strip events in
  // isolation because that would leave their meals orphaned.
  const carryForwardKids = (targetDate, ...keys) => {
    for (const key of keys) {
      const prev = carryForwardPlan(previousPlans, targetDate, key);
      if (prev) return prev;
    }
    return null;
  };

  // Look at both new keys ("kids") and legacy ":h9" keys for forward-compat
  // during the cutover from old default-plans.json to bucket-shaped data.
  const finalKidsEntry = kidsEntry || carryForwardKids(todayStr, "kids", "kids:h9");
  const finalTomorrowKidsEntry = tomorrowKidsEntry || carryForwardKids(tomorrowStr, "kids:tomorrow", "kids:h9:tomorrow");

  const plans = { "adults": adultsEntry };
  if (finalKidsEntry) plans["kids"] = finalKidsEntry;
  if (tomorrowAdultsEntry) plans["adults:tomorrow"] = tomorrowAdultsEntry;
  if (finalTomorrowKidsEntry) plans["kids:tomorrow"] = finalTomorrowKidsEntry;

  const output = {
    _meta: {
      generatedAt: new Date().toISOString(),
      generator: "generate-schedule (homepage hero, pillar-pairs-v1)",
      selectionModel: DAY_PLAN_SELECTION_MODEL,
      planCount: Object.keys(plans).length,
    },
    plans,
  };
  writeFileSync(DEFAULT_PLANS_FILE, JSON.stringify(output, null, 2));
  const fmtKids = (entry, fresh) => {
    if (!entry) return "(no kids plan — fetch failed)";
    return fresh ? `+ ${entry.cards.length} kids` : `+ ${entry.cards.length} kids (carried forward, places-only)`;
  };
  const kidsMsg = fmtKids(finalKidsEntry, !!kidsEntry);
  const tomMsg = tomorrowAdultsEntry
    ? ` | tomorrow ${tomorrowAdultsEntry.cards.length} adults ${fmtKids(finalTomorrowKidsEntry, !!tomorrowKidsEntry)}`
    : "";
  console.log(`   🏠 default-plans.json: ${adultsEntry.cards.length} adults ${kidsMsg}${tomMsg}`);
}

function carryForwardPlan(plans, targetDate, ...keys) {
  for (const key of keys) {
    const prev = plans[key];
    if (!prev?.cards?.length) continue;
    // Never surgically remove an expired event: doing so severs its meal pair.
    // A carry-forward is safe only when the complete six-card plan is already
    // place-only and still satisfies the pillar-pairs contract.
    if (prev.cards.some((c) => c.source === "event")) continue;
    if (!planPassesQuality(prev, new Set(), targetDate).ok) continue;
    return { ...prev, planDate: targetDate, carriedForward: true, generatedAt: new Date().toISOString() };
  }
  return null;
}

/** Add `n` days to a YYYY-MM-DD string and return a new YYYY-MM-DD. */
function isoOffset(isoStr, n) {
  const [y, m, d] = isoStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error("Schedule generation failed:", err);
  process.exit(1);
});
