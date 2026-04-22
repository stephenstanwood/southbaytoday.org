// ---------------------------------------------------------------------------
// Shared event filters
// ---------------------------------------------------------------------------
// Single source of truth for "this event should never appear in a day plan."
// Imported by:
//   - scripts/generate-events.mjs — filters at scrape time so bad events
//     never land in upcoming-events.json
//   - src/pages/api/plan-day.ts — runtime safety net in case generation
//     missed something or the data is stale
//
// Any pattern added here applies in BOTH places. Keep them in sync or you
// get the "caught at one stage, not the other" divergence bug that let
// tUrn events leak into plans even after generation patterns were added.
// ---------------------------------------------------------------------------

/**
 * Patterns that match virtual/online/livestream events by title or
 * description. Matched case-insensitively. A positive match means the event
 * is NOT a valid physical stop and should be dropped from both pools.
 */
export const VIRTUAL_EVENT_PATTERNS = [
  // Title prefixes
  /^online[:\s-]/i,
  /^virtual[:\s-]/i,
  /^\[online\]/i,
  /^\[virtual\]/i,
  /^(virtual|online):\s+/i,

  // SCU tUrn climate lectures — academic-only, no fixed address
  /\btUrn\b/i,

  // Online-prefixed activity types
  /\bonline\s+(author\s+talk|book\s+club|discussion|talk|lecture|q&a|class|workshop|group|conversation)\b/i,
  /\bonline\s+conversation\s+group\b/i,

  // Generic virtual/online/livestream markers
  /\b(webinar|livestream|live[-\s]?stream|virtual\s+(event|talk|class|meeting|tour|gathering|reading))\b/i,
  /\bzoom\s+(meeting|call|session|event|webinar|link)\b/i,
];

/**
 * Returns true if the event looks virtual/online based on title + description.
 * Accepts either a string or an event-like object with .title and .description.
 */
export function isVirtualEvent(eventOrText) {
  if (!eventOrText) return false;
  if (typeof eventOrText === "string") {
    return VIRTUAL_EVENT_PATTERNS.some((re) => re.test(eventOrText));
  }
  const hay = [eventOrText.title, eventOrText.description]
    .filter(Boolean)
    .join(" ");
  if (!hay) return false;
  return VIRTUAL_EVENT_PATTERNS.some((re) => re.test(hay));
}
