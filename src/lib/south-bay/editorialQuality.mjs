// Shared editorial signals used by both the regional day planner and the
// newsletter. Keep these deterministic; the model receives the signals but
// does not get to invent them.

const MARQUEE_VENUES = /\b(shoreline amphitheat\w*|mountain winery|sap center|levi'?s stadium|paypal park|excite ballpark|san jose civic|california theatre|center for the performing arts|montgomery theater|hammer theatre|san jose improv|stanford theatre|frost amphitheat\w*|heritage theatre|great america)\b/i;
export const REGIONAL_ROUTINE_PENALTY_CUTOFF = 35;
export const UNPROMPTED_AUDIENCE_PENALTY_CUTOFF = 35;

export function isMarqueeEvent(event) {
  return MARQUEE_VENUES.test(`${event?.venue || ""} ${event?.title || event?.name || ""}`);
}

export function titleQualityPenalty(title) {
  const text = String(title || "");
  let penalty = 0;
  if (/…|\|/.test(text)) penalty += 6;
  if (/[?!]{2,}|\?.*!|!.*\?/.test(text)) penalty += 4;
  if (/\b[A-Z]{6,}\b/.test(text)) penalty += 4;
  if (text.length > 90) penalty += 4;
  return penalty;
}

/** Source feeds sometimes call caregiver-and-child programs "all ages" even
 * though an adult without a child cannot participate. */
export function requiresChildToAttend(event) {
  const text = `${event?.title || event?.name || ""} ${event?.description || ""}`;
  return /\b(baby[ -]?wearing|pre[ -]?walking babies?|parent(?:s)? and me|mommy and me|caregiver and (?:baby|toddler))\b/i.test(text);
}

/**
 * Events can be public listings while still addressing only a tiny affinity
 * group. Keep those events searchable in the calendar, but out of unprompted
 * editorial recommendations unless a reader explicitly builds around one.
 *
 * This is intentionally about audience breadth, not subject matter. A public
 * talk by an alumnus is broad; an alumni night, reserved alumni section, or
 * members-only preview is not.
 */
export function audienceBreadthPenalty(event) {
  // Explicit gates use reader-facing title/blurb only. Some multi-day source
  // descriptions mention a members-only preview while later occurrences are
  // public; applying that sentence to every date would suppress the public days.
  const recommendationText = [
    event?.title || event?.name || "",
    event?.blurb || "",
  ].join(" ");
  const sourceText = `${recommendationText} ${event?.description || ""}`;

  if (
    /\b(?:members?|employees?|faculty|staff|students?|alumni|alumnus|alumna|alumnae|donors?|season[- ]ticket holders?)\s+only\b/i.test(recommendationText) ||
    /\b(?:invitation|invite)[ -]?only\b/i.test(recommendationText) ||
    /\b(?:reserved|exclusive(?:ly)?|available|open)\s+(?:only\s+)?(?:to|for)\s+(?:(?:current|enrolled|university|college|school|club|association)\s+){0,3}(?:members?|employees?|faculty|staff|students?|alumni|alumnus|alumna|alumnae|donors?|season[- ]ticket holders?)\b/i.test(recommendationText)
  ) {
    return 60;
  }

  const hasAffiliationAudience = /\b(?:alumni|alumnus|alumna|alumnae|sorority|fraternity)\b/i.test(recommendationText);
  const hasAffinityGathering = /\b(?:night|reception|mixer|meetup|gathering|tailgate|outing|network(?:ing)?|coalition|chapter|reunion|reserved section|tickets?|offer|package|discount)\b/i.test(recommendationText);
  if (
    (hasAffiliationAudience && hasAffinityGathering) ||
    /\b(?:student|faculty|staff|employee|member|donor)\s+(?:night|reception|mixer|meetup|appreciation|ticket offer)\b/i.test(sourceText)
  ) {
    return 45;
  }

  return 0;
}

/**
 * A dated occurrence is useful evidence, but it is not automatically a great
 * recommendation. This penalty keeps routine programming from crowding out a
 * genuinely special place or event merely because it has today's date.
 */
export function routineEventPenalty(event) {
  const title = String(event?.title || event?.name || "");
  let penalty = 0;
  if (/\b(board|commission|committee|subcommittee|regular|special)\s+meeting\b|\bstudy session\b|\bwebinar\b|\boffice hours\b|\bsupport group\b|\bpractice\b|\brehearsal\b/i.test(title)) {
    penalty = Math.max(penalty, 55);
  }
  if (/\b(story\s*time|book club|toddler|homework help|tech help|esl|teen(?:s)? teach|crafternoon|drop[- ]?in clinic)\b/i.test(title)) {
    penalty = Math.max(penalty, 36);
  }
  // These are legitimate community programs, but a date stamp does not make
  // them one of the three most exceptional things in the entire South Bay.
  // Keep them available for thin city inventories while ensuring a strong
  // park, museum, performance, or one-off event wins regionally.
  if (/\b(leisure noon|spin the wheel|baby[ -]?wearing|reading milestone|grab[ -]and[ -]go craft|community puzzle swap)\b/i.test(title)) {
    penalty = Math.max(penalty, 38);
  }
  if (/^\s*(live music|open mic|happy hour|workshop|class|drop[- ]?in)\s*[.!]*$/i.test(title)) {
    penalty = Math.max(penalty, 38);
  }
  return penalty;
}
