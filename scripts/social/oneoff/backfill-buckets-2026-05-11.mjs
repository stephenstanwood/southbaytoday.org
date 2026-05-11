#!/usr/bin/env node
// One-off: backfill missing `bucket` fields on pre-cutover (May 7) frozen
// schedule + default-plans + shared-plans cards. PR #68 fixed May 10
// surgically; May 11-13 day-plans are still approved/published with the
// old clock-range timeBlock shape and no bucket field, which makes the
// homepage orphan cards when two times infer to the same bucket
// (Library 11 AM + Rancho 8:30 AM both → "morning"). Same pattern bites
// May 12 (Desi Pizza 10:30 + A.M. Craft 7:30 → both breakfast) and May 13
// (Gali Vineyards 3 PM + Farmers Market 11 AM → both lunch).
//
// Strategy: sort cards by start time, assign each to its preferred bucket
// (meal/activity × hour), shift to the nearest open bucket of the same
// kind on collision. Leaves cards with explicit `bucket` already set alone.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..", "..");

const SCHEDULE  = join(REPO, "src/data/south-bay/social-schedule.json");
const DEFAULTS  = join(REPO, "src/data/south-bay/default-plans.json");
const SHARED    = join(REPO, "src/data/south-bay/shared-plans.json");

const MEAL     = ["breakfast", "lunch", "dinner"];
const ACTIVITY = ["morning", "afternoon", "evening"];
const ALL      = ["breakfast", "morning", "lunch", "afternoon", "dinner", "evening"];

const BUCKET_LABELS = {
  breakfast: "Breakfast",
  morning:   "Morning",
  lunch:     "Lunch",
  afternoon: "Afternoon",
  dinner:    "Dinner",
  evening:   "Evening",
};

function parseHour(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
  return h;
}

function preferred(card, hour) {
  const isFood = (card.category || "").toLowerCase() === "food";
  if (isFood) {
    if (hour < 11) return "breakfast";
    if (hour < 16) return "lunch";
    return "dinner";
  }
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Assign buckets to a list of cards with collision resolution. Mutates
 *  cards in place: sets `bucket` and rewrites `timeBlock` to the bucket
 *  label (matches what plan-day.ts emits for post-cutover cards).
 *
 *  Two-pass assignment so events with fixed real times win their preferred
 *  slot over places. Without this, a 5 PM park grabs "evening" and a 6 PM
 *  concert gets shifted to "afternoon" — which is the exact mislabel
 *  PR #68 told us not to do. Events first, then places fill the rest. */
function assignBuckets(cards) {
  const indexed = cards.map((c, i) => {
    const t = (c.timeBlock || c.eventTime || "").split(/\s*-\s*/)[0];
    return { card: c, i, h: parseHour(t) };
  });
  const isEventCard = (c) => c.source === "event" || !!c.eventTime;

  // Process events first (by their real time), then places (by their
  // time-block start). Within each group, earlier first.
  const events = indexed.filter((x) => isEventCard(x.card)).sort((a, b) => (a.h ?? 99) - (b.h ?? 99));
  const places = indexed.filter((x) => !isEventCard(x.card)).sort((a, b) => (a.h ?? 99) - (b.h ?? 99));
  const order = [...events, ...places];

  const used = new Set();
  const assignment = new Map();

  for (const { card, i, h } of order) {
    if (h === null) { assignment.set(i, null); continue; }
    const pref = preferred(card, h);
    const isFood = (card.category || "").toLowerCase() === "food";
    const sameKind = isFood ? MEAL : ACTIVITY;

    let pick;
    if (!used.has(pref)) {
      pick = pref;
    } else {
      const prefIdx = sameKind.indexOf(pref);
      const candidates = sameKind
        .map((b, idx) => ({ b, dist: Math.abs(idx - prefIdx) }))
        .sort((a, b) => a.dist - b.dist)
        .map((x) => x.b);
      pick = candidates.find((b) => !used.has(b));
      if (!pick) pick = ALL.find((b) => !used.has(b));
    }
    if (pick) {
      used.add(pick);
      assignment.set(i, pick);
    } else {
      assignment.set(i, null);
    }
  }

  let changed = 0;
  for (let i = 0; i < cards.length; i++) {
    const b = assignment.get(i);
    if (!b) continue;
    if (cards[i].bucket === b && cards[i].timeBlock === BUCKET_LABELS[b]) continue;
    cards[i].bucket = b;
    cards[i].timeBlock = BUCKET_LABELS[b];
    changed++;
  }
  return changed;
}

function loadJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
function saveJson(p, d) { writeFileSync(p, JSON.stringify(d, null, 2) + "\n"); }

function planNeedsBackfill(cards) {
  return Array.isArray(cards) && cards.length > 0 && cards.every((c) => !c.bucket);
}

// ── Pass 1: social-schedule.json (the source of truth that feeds homepage
//    via default-plans.json AND the publisher). Only touches frozen
//    pre-cutover day-plan entries. ─────────────────────────────────────────
{
  const schedule = loadJson(SCHEDULE);
  const days = schedule.days || {};
  let totalChanged = 0;
  for (const [date, slots] of Object.entries(days)) {
    const dp = slots?.["day-plan"];
    const cards = dp?.plan?.cards;
    if (!planNeedsBackfill(cards)) continue;
    const n = assignBuckets(cards);
    console.log(`  schedule ${date}: ${n} cards assigned`);
    totalChanged += n;
  }
  if (totalChanged) {
    saveJson(SCHEDULE, schedule);
    console.log(`✓ social-schedule.json — ${totalChanged} cards updated`);
  } else {
    console.log("✓ social-schedule.json — nothing to do");
  }
}

// ── Pass 2: default-plans.json (the homepage hero file). Should pick up
//    today's adults plan, which derives from the same broken May 11
//    schedule entry. ───────────────────────────────────────────────────────
{
  const defaults = loadJson(DEFAULTS);
  const plans = defaults.plans || {};
  let totalChanged = 0;
  for (const [key, plan] of Object.entries(plans)) {
    const cards = plan?.cards;
    if (!planNeedsBackfill(cards)) continue;
    const n = assignBuckets(cards);
    console.log(`  defaults ${key}: ${n} cards assigned`);
    totalChanged += n;
  }
  if (totalChanged) {
    saveJson(DEFAULTS, defaults);
    console.log(`✓ default-plans.json — ${totalChanged} cards updated`);
  } else {
    console.log("✓ default-plans.json — nothing to do");
  }
}

// ── Pass 3: shared-plans.json (linked /plan/<id> pages). Any pre-cutover
//    plan that has no bucket on any card gets the same treatment so
//    permalinks don't 500 or render as orphans. ────────────────────────────
{
  const shared = loadJson(SHARED);
  let totalChanged = 0;
  let totalPlans = 0;
  for (const [id, plan] of Object.entries(shared)) {
    const cards = plan?.cards;
    if (!planNeedsBackfill(cards)) continue;
    const n = assignBuckets(cards);
    if (n > 0) {
      totalChanged += n;
      totalPlans++;
    }
  }
  if (totalChanged) {
    saveJson(SHARED, shared);
    console.log(`✓ shared-plans.json — ${totalChanged} cards across ${totalPlans} plans`);
  } else {
    console.log("✓ shared-plans.json — nothing to do");
  }
}

console.log("\nDone.");
