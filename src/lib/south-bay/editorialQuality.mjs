// Shared editorial signals used by both the regional day planner and the
// newsletter. Keep these deterministic; the model receives the signals but
// does not get to invent them.

const MARQUEE_VENUES = /\b(shoreline amphitheat\w*|mountain winery|sap center|levi'?s stadium|paypal park|excite ballpark|san jose civic|california theatre|center for the performing arts|montgomery theater|hammer theatre|san jose improv|stanford theatre|frost amphitheat\w*|heritage theatre|great america)\b/i;

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

/**
 * A dated occurrence is useful evidence, but it is not automatically a great
 * recommendation. This penalty keeps routine programming from crowding out a
 * genuinely special place or event merely because it has today's date.
 */
export function routineEventPenalty(event) {
  const title = String(event?.title || event?.name || "");
  let penalty = 0;
  if (/\b(board|commission|committee|subcommittee|regular|special)\s+meeting\b|\bstudy session\b|\bwebinar\b|\boffice hours\b|\bsupport group\b|\bpractice\b|\brehearsal\b/i.test(title)) {
    penalty = Math.max(penalty, 42);
  }
  if (/\b(story\s*time|book club|toddler|homework help|tech help|esl|teen(?:s)? teach|crafternoon|drop[- ]?in clinic)\b/i.test(title)) {
    penalty = Math.max(penalty, 26);
  }
  if (/^\s*(live music|open mic|happy hour|workshop|class|drop[- ]?in)\s*[.!]*$/i.test(title)) {
    penalty = Math.max(penalty, 20);
  }
  return penalty;
}
