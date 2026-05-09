// ---------------------------------------------------------------------------
// Day-plan buckets — replaces the old hour-by-hour timeBlock format.
//
// A plan is six "idea sparks", not a tick-tock schedule:
//   breakfast  morning
//   lunch      afternoon
//   dinner     evening
//
// The user can do all six together if they want, but the plan is meant to read
// as a brainstorm. This module owns the canonical names, display labels, the
// rough time window each bucket implies (used for hours-fitting validation),
// and small helpers for mapping clock times → buckets when an event has a
// fixed real-world start.
// ---------------------------------------------------------------------------

export type Bucket =
  | "breakfast"
  | "morning"
  | "lunch"
  | "afternoon"
  | "dinner"
  | "evening";

/** Display order for the 2×3 grid, top-to-bottom, left-to-right.
 *  Left column = meals (breakfast → lunch → dinner).
 *  Right column = activities (morning → afternoon → evening). */
export const BUCKET_ORDER: Bucket[] = [
  "breakfast",
  "morning",
  "lunch",
  "afternoon",
  "dinner",
  "evening",
];

export const BUCKET_LABELS: Record<Bucket, string> = {
  breakfast: "Breakfast",
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  evening: "Evening",
};

/** True if this bucket is a meal slot. Meal buckets are food-only by intent;
 *  activity buckets are anything-goes (parks, museums, shopping, etc.). */
export const MEAL_BUCKETS: ReadonlySet<Bucket> = new Set(["breakfast", "lunch", "dinner"]);

/** Open/close hours (24h) the bucket implies — used for "is this venue open
 *  during this slot" validation. Wide enough that most reasonable venues fit
 *  somewhere inside. Generation does NOT promise the user a specific time;
 *  this is purely a venue-fitness check. */
export const BUCKET_TIME_WINDOWS: Record<Bucket, [number, number]> = {
  breakfast: [7, 11],
  morning: [9, 13],
  lunch: [11, 15],
  afternoon: [13, 18],
  dinner: [17, 21],
  evening: [18, 22],
};

/** Map a clock-hour (24h) to the most appropriate bucket. Used when an event
 *  has a fixed real start time and we need to slot it. */
export function bucketForHour(hour: number, kind: "meal" | "activity" = "activity"): Bucket {
  if (kind === "meal") {
    if (hour < 11) return "breakfast";
    if (hour < 16) return "lunch";
    return "dinner";
  }
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Parse a clock string like "7:30 PM" or "19:30" into 24h hour. Returns
 *  null on unparseable input. */
export function parseClockHour(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const ampm = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
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

/** Map an event's start time + category to a bucket. Food category leans
 *  meal; everything else leans activity. Used during plan generation to
 *  anchor events to the right slot. Returns null if the event time is
 *  unparseable (caller should fall through to Claude's pick). */
export function bucketForEvent(
  eventTime: string | null | undefined,
  category: string | null | undefined,
): Bucket | null {
  const start = parseClockHour((eventTime || "").split(/\s*-\s*/)[0]);
  if (start === null) return null;
  const kind: "meal" | "activity" = (category || "").toLowerCase() === "food" ? "meal" : "activity";
  return bucketForHour(start, kind);
}

/** Infer a bucket from a legacy clock-range timeBlock like "7:30 AM - 9:00 AM".
 *  Returns null if the string isn't a clock range (e.g. it's already a bucket
 *  label like "Breakfast", or empty). Used to render plans approved before
 *  the bucket cutover (2026-05-07) without a data migration. */
export function inferBucketFromTimeBlock(
  timeBlock: string | null | undefined,
  category: string | null | undefined = null,
): Bucket | null {
  if (!timeBlock) return null;
  const start = parseClockHour(timeBlock.split(/\s*-\s*/)[0]);
  if (start === null) return null;
  const kind: "meal" | "activity" = (category || "").toLowerCase() === "food" ? "meal" : "activity";
  return bucketForHour(start, kind);
}

/** True if `name` is a valid Bucket. */
export function isBucket(name: unknown): name is Bucket {
  return typeof name === "string" && BUCKET_ORDER.includes(name as Bucket);
}

/** Order index for sorting cards by bucket. Returns 99 for unknown buckets
 *  so they sort last. */
export function bucketOrderIndex(b: Bucket | string | null | undefined): number {
  if (!b) return 99;
  const i = BUCKET_ORDER.indexOf(b as Bucket);
  return i === -1 ? 99 : i;
}

/** Wall-clock cutoff (PT, 24h) past which a bucket reads as "missed today".
 *  Used by the homepage view to dim past buckets. Cutoffs are conservative —
 *  e.g. lunch is dim only after 3 PM, not at noon. */
export const BUCKET_PASSED_AFTER_HOUR: Record<Bucket, number> = {
  breakfast: 11,
  morning: 13,
  lunch: 15,
  afternoon: 18,
  dinner: 21,
  evening: 23, // never really "passed" before midnight
};
