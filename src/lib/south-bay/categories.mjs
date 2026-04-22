// ---------------------------------------------------------------------------
// Canonical category taxonomy
// ---------------------------------------------------------------------------
// Single source of truth for the ~8 categories plan-day.ts uses for scoring,
// caps, and diversity rules. Places and events historically used different
// taxonomies (places: 8 categories, events: 13, only 4 overlapping), which
// caused diversity rules to misfire and CAT_CAPS to silently not apply to
// event-specific categories like "music", "community", "education".
//
// CANONICAL_CATEGORIES is the only set plan-day.ts should reason about.
// canonicalCategory(raw) maps any raw value from places.json or upcoming-
// events.json into it. Raw categories stay in the data for display — the
// card pill shows "Community" or "Music" as labels, but the engine treats
// them all as "events" for capping and diversity.
// ---------------------------------------------------------------------------

export const CANONICAL_CATEGORIES = [
  "food",
  "outdoor",
  "museum",
  "entertainment",
  "wellness",
  "shopping",
  "arts",
  "sports",
  "events",       // catchall for community/education/family event-only cats
  "neighborhood", // legacy from curated POIs; plan-day.ts filters these out
];

/**
 * Map a raw category (from event generation or place generation) to one of
 * CANONICAL_CATEGORIES. Unknown inputs fall through to "events" so they
 * still receive a cap and participate in diversity rules instead of
 * floating free.
 */
export function canonicalCategory(raw) {
  if (!raw) return "events";
  const c = String(raw).toLowerCase().trim();

  // Already canonical
  if (CANONICAL_CATEGORIES.includes(c)) return c;

  // Event-side mappings
  switch (c) {
    case "music":      return "entertainment";
    case "market":     return "shopping";
    case "nature":     return "outdoor";
    case "family":     return "events";
    case "community":  return "events";
    case "education":  return "arts";
    case "technology": return "arts";
    case "volunteer":  return "events";
    case "meetings":   return "events";
  }

  // Unknown — bucket under events so it's still capped.
  return "events";
}
