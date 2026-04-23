// ---------------------------------------------------------------------------
// audienceAge — classify events as "kids" | "adult" | "all" from title+desc.
//
// Tag applied at ingest time (generate-events.mjs). Plan-day reads the tag
// at candidate-pool time to exclude kids-only events from adult plans and
// adults-only events from kids plans. "all" is the default and hits both.
//
// Bias is CONSERVATIVE — only strong, unambiguous signals trigger "kids" or
// "adult". Everything else stays "all". The goal is to kill obvious
// mismatches ("Kids Knitting" in an adult plan, "Wine Tasting" in a kids
// plan) without dropping mixed events that genuinely work for both.
//
// Note: brewpubs, bars, and breweries are NOT adult-only by default — many
// serve food and welcome families. Only the EVENT itself being 21+/drag/etc.
// flips the tag to "adult". Same for "kids" — a community event that says
// "kids welcome" is still "all", not "kids".
// ---------------------------------------------------------------------------

// Strong kids-only signals: explicit age ranges, preschool/toddler, story
// time, puppet shows, "kids [activity]" patterns. Note: "kids" alone is NOT
// enough — "Family Day: Kids Welcome" should stay "all".
const KIDS_SIGNALS = [
  /\btoddlers?\b/i,
  /\bpreschool(?:er)?s?\b/i,
  /\bstory ?times?\b/i,
  /\bbedtime stor(?:y|ies)\b/i,
  /\bpuppet\s+shows?\b/i,
  /\bages?\s+\d{1,2}\s*[-–]\s*\d{1,2}\b/i,        // "ages 2-5"
  /\bages?\s+\d{1,2}\s*(?:and|&|\+)\s*(?:up|under)\b/i, // "ages 5 and up"
  /\bages?\s+\d{1,2}\+?\b/i,                     // "ages 5+"
  /\bkid'?s?\s+(?:knitting|craft|art|yoga|cooking|science|club|camp|hour|music|dance|story|story time|book club)\b/i,
  /\bkids'?\s+only\b/i,
  /\bchildren's\s+(?:story|hour|craft|music|book club|program)\b/i,
  /\bkindergart(?:en|ner)s?\b/i,
  /\bgrades?\s+(?:k|pre-k|\d)\b/i,
  /\belementary(?:-school| school)?\b/i,
  /\btween\s+(?:night|club|hangout|meetup|program)\b/i,
  /\btots?\b(?:\s+(?:club|hour|story|storytime|time))/i,  // "tots" alone could be false positive
];

// Strong adult-only signals: explicit age gates, adult-theme events.
// Bar/brewery venue alone does NOT trigger this.
const ADULT_SIGNALS = [
  /\b21\s*\+\b/,
  /\b18\s*\+\b/,
  /\b21\s*(?:and|&)\s*over\b/i,
  /\b18\s*(?:and|&)\s*over\b/i,
  /\badults?\s+only\b/i,
  /\bno\s+minors\b/i,
  /\bspeakeas(?:y|ies)\b/i,
  /\bburlesque\b/i,
  /\bdrag\s+(?:show|brunch|queen|bingo|night)\b/i,
  /\bwine\s+(?:tasting|pairing|dinner|walk|stroll|flight)\b/i,
  /\bcocktail\s+(?:class|hour|making|tasting|pairing)\b/i,
  /\bspirits?\s+tasting\b/i,
  /\bwhisk(?:e)?y\s+(?:tasting|pairing|flight|dinner)\b/i,
  /\bbeer\s+(?:tasting|pairing|dinner)\b/i,
  /\bsake\s+tasting\b/i,
  /\bcannabis\b/i,
  /\bhookah\b/i,
  /\bsingles\s+(?:mixer|night|event)\b/i,
  /\bspeed\s+dating\b/i,
];

/**
 * Classify an event's audience age.
 *   - "kids"  — kids-only (story time, age-specific, etc.)
 *   - "adult" — adults-only (21+, drag, wine tasting)
 *   - "all"   — mixed / family-friendly / no strong signal (default)
 */
export function classifyAudienceAge(event) {
  const title = String(event.title || "");
  const desc = String(event.description || "").slice(0, 400);
  const hay = `${title}\n${desc}`;

  const isKids = KIDS_SIGNALS.some((r) => r.test(hay));
  const isAdult = ADULT_SIGNALS.some((r) => r.test(hay));

  // If both patterns hit (rare — e.g. "family wine walk" or "kids welcome at
  // the drag brunch"), prefer "all" — too ambiguous to hard-exclude.
  if (isKids && isAdult) return "all";
  if (isKids) return "kids";
  if (isAdult) return "adult";
  return "all";
}
