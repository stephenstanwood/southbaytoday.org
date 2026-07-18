// ---------------------------------------------------------------------------
// canonicalizeCard — normalize a shared-plan card to the shape the renderer
// at src/pages/plan/[id].ts expects.
//
// Every writer to shared-plans.json should run every card through this before
// persisting, and the renderer re-runs it at read time as belt-and-suspenders.
// Prevents /plan/XXX 500s when upstream writers drift from the canonical shape.
//
// 2026-05-07: cards moved from clock-range timeBlock ("10:30 AM - 12:00 PM")
// to bucket slots ("breakfast", "morning", etc.). New cards write `bucket`;
// `timeBlock` is preserved for legacy shared plans so /plan/<id> from before
// the cutover still renders.
//
// 2026-07-18: bucket cards gained a pillar/paired-meal relationship. Those
// fields are part of the durable shared-plan contract, not disposable model
// metadata, so canonicalization must carry them across every surface.
// ---------------------------------------------------------------------------

import { cleanDisplayCopy, cleanDisplayName } from "./displayText.mjs";

const VALID_BUCKETS = new Set([
  "breakfast", "morning", "lunch", "afternoon", "dinner", "evening",
]);

function str(v, fallback = "") {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "string") return v;
  return String(v);
}

function nullableStr(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") return v;
  return String(v);
}

function nullableBucket(v) {
  if (typeof v !== "string") return null;
  return VALID_BUCKETS.has(v) ? v : null;
}

/** Parse a clock-range start hour ("7:30 AM - 9:00 AM" → 7) for legacy
 *  timeBlock strings predating the bucket cutover. Returns null on already-
 *  bucket-shaped labels ("Breakfast") or unparseable input. */
function parseClockHour(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
  return h;
}

/** Infer bucket from a legacy clock-range timeBlock when the card has no
 *  bucket field. Mirrors the helper in src/lib/south-bay/buckets.ts. */
function inferBucket(timeBlock, category) {
  const start = parseClockHour(String(timeBlock || "").split(/\s*-\s*/)[0]);
  if (start === null) return null;
  const isFood = String(category || "").toLowerCase() === "food";
  if (isFood) {
    if (start < 11) return "breakfast";
    if (start < 16) return "lunch";
    return "dinner";
  }
  if (start < 12) return "morning";
  if (start < 17) return "afternoon";
  return "evening";
}

/**
 * Coerce a raw card-ish object into the canonical shape.
 * Unknown extra fields (kidsCostNote, locked, type, neighborhood, featuredPlace,
 * eventId, placeId, rationale) are preserved so callers can keep their metadata.
 */
export function canonicalizeCard(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      id: "",
      name: "",
      category: "other",
      city: "",
      address: "",
      timeBlock: "",
      bucket: null,
      eventTime: null,
      blurb: "",
      why: "",
      url: "",
      mapsUrl: null,
      cost: null,
      costNote: null,
      photoRef: null,
      venue: "",
      source: "event",
    };
  }

  const canonical = {
    id: str(raw.id),
    name: cleanDisplayName(str(raw.name || raw.title)),
    category: str(raw.category, "other"),
    city: str(raw.city || raw.neighborhood),
    address: str(raw.address),
    timeBlock: str(raw.timeBlock),
    bucket: nullableBucket(raw.bucket) || inferBucket(raw.timeBlock, raw.category),
    eventTime: nullableStr(raw.eventTime),
    blurb: cleanDisplayCopy(str(raw.blurb)),
    why: str(raw.why),
    url: str(raw.url),
    mapsUrl: nullableStr(raw.mapsUrl),
    cost: nullableStr(raw.cost),
    costNote: nullableStr(raw.costNote),
    photoRef: nullableStr(raw.photoRef),
    venue: cleanDisplayName(str(raw.venue || raw.name || raw.title)),
    source: str(raw.source || (raw.type === "place" ? "place" : "event"), "event"),
  };

  // Preserve optional fields that exist on some cards (don't drop them).
  const passthrough = [
    "kidsCostNote", "locked", "type", "neighborhood", "featuredPlace",
    "eventId", "placeId", "rationale", "eventEndTime", "image",
    "role", "pairedWithId", "pairDistanceMiles", "pairLocationPrecision",
    "interestingChain", "chainInterestReasons",
  ];
  for (const key of passthrough) {
    if (raw[key] !== undefined) canonical[key] = raw[key];
  }

  return canonical;
}

/**
 * A card is considered renderable if it has a name AND either a bucket
 * (new format) or a timeBlock (legacy shared plans). Without one or the other
 * the renderer has no slot to put it in.
 */
export function isRenderableCard(card) {
  if (!card || typeof card !== "object") return false;
  if (!str(card.name).trim()) return false;
  if (nullableBucket(card.bucket)) return true;
  return Boolean(str(card.timeBlock).trim());
}

/**
 * Canonicalize an entire plan's cards array; drops unrenderable cards entirely
 * so the renderer never has to defensively skip them.
 */
export function canonicalizePlanCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map(canonicalizeCard).filter(isRenderableCard);
}

/**
 * Canonicalize a whole shared-plan wrapper. Returns null if the plan is
 * unsalvageable (missing id or has no renderable cards) so the renderer can
 * redirect home instead of 500ing on thin data.
 */
export function canonicalizeSharedPlan(raw) {
  if (!raw || typeof raw !== "object") return null;
  const cards = canonicalizePlanCards(raw.cards);
  if (cards.length === 0) return null;
  return {
    ...raw,
    id: str(raw.id),
    city: str(raw.city),
    planDate: nullableStr(raw.planDate),
    createdAt: nullableStr(raw.createdAt || raw.generatedAt),
    cards,
  };
}
