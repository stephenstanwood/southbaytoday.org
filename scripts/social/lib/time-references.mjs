// ---------------------------------------------------------------------------
// time-references.mjs
//
// Rewrites day-of-week and time-of-day phrases in scheduled social copy so
// posts read as if they were generated on publish day, not at gen time (which
// may be up to 10 days earlier).
//
// History: extracted from publish-from-queue.mjs after the 2026-05-11 incident
// where the original regex `\b<DayName>\b` blindly replaced every occurrence
// of the event-day name with "today" — turning "out of the house on a Monday"
// (idiom) into "out of the house on a Today" (broken) on the live X / Threads
// / Facebook / Instagram posts. The rules below only fire in clear scheduling
// contexts; idiomatic noun uses of day names are left alone.
// ---------------------------------------------------------------------------

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// PT-zoned formatters. Used so the rewriter can derive the publish-day date
// and hour from any Date — even one constructed with an explicit offset like
// `new Date("2026-05-11T19:00:00-07:00")` — without depending on the system
// timezone. (publish-from-queue.mjs previously used
// `getPTTime().toISOString().split("T")[0]` which silently returns the *UTC*
// date — wrong by one day after PT 4-5pm. That bug now lives only outside
// this module.)
const PT_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric", month: "2-digit", day: "2-digit",
});
const PT_HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric", hour12: false,
});

function ptDateString(d) {
  // en-CA emits ISO-style "YYYY-MM-DD".
  return PT_DATE_FORMATTER.format(d);
}

function ptHour(d) {
  // hour12:false gives "0".."23" — but at midnight some locales emit "24",
  // so normalize to mod 24.
  return parseInt(PT_HOUR_FORMATTER.format(d), 10) % 24;
}

export function parseEventHour(timeStr) {
  if (!timeStr) return null;
  const lower = timeStr.toLowerCase().trim();
  const match = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return null;
  let hour = parseInt(match[1]);
  const ampm = match[3];
  if (ampm === "pm" && hour !== 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  return hour;
}

export function getRelativeDayLabel(eventDate, publishDate) {
  if (!eventDate) return null;
  const event = new Date(eventDate + "T12:00:00");
  const publish = new Date(publishDate + "T12:00:00");
  const diffDays = Math.round((event - publish) / 86400000);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return null; // yesterday, shouldn't happen
  if (diffDays >= 2 && diffDays <= 6) return DAY_NAMES[event.getDay()];
  return null; // more than a week out, leave as-is
}

// Preserve the first-letter case of `match` when substituting `replacement`.
function preserveCase(match, replacement) {
  return match[0] === match[0].toUpperCase()
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

/**
 * Rewrite day/time references in copy to match the actual publish date.
 *
 * The rewriter only fires in scheduling contexts where the substitution is
 * guaranteed to read cleanly. Idiomatic uses of day names ("on a Monday",
 * "kind of Monday night", "Monday just got a reason to exist") are left
 * alone — false positives produce visibly broken English, missed positives
 * just keep the literal day name which is at worst slightly less timely.
 *
 * Scheduling contexts that DO fire:
 *   1. "this <Day>"            → "today" / "tomorrow"        (whole phrase)
 *   2. "on <Day>"              → "today" / "tomorrow"        (whole phrase)
 *   3. "<Day>'s <noun>"        → "Today's <noun>"            (possessive)
 *   4. "<Day> [at|@] <time>"   → "Today [at|@] <time>"       (day-name only)
 *   5. "<Day> <bare-time>"     → "Today <bare-time>"         (e.g. "Monday 7pm")
 *
 * Rule order matters: 1, 2, 3, 4 — earlier rules consume more text so they
 * must run first to avoid leaving fragments like "On Today's trivia".
 */
export function rewriteTimeReferences(text, item, ptTime) {
  const publishDate = ptDateString(ptTime);
  const relativeLabel = getRelativeDayLabel(item.date, publishDate);
  if (!relativeLabel) return text;

  // Same-day-name (event 2-6 days out, copy may already say "Friday" for a
  // Friday event) — nothing to rewrite, the day name is already correct.
  if (relativeLabel !== "today" && relativeLabel !== "tomorrow") return text;

  const eventDate = new Date(item.date + "T12:00:00");
  const Day = DAY_NAMES[eventDate.getDay()];

  let result = text;

  // ── Rule 1: "this <Day>" → whole-phrase swap ────────────────────────────
  // "This Monday at 7" → "Today at 7" (not "This today at 7").
  const thisPattern = new RegExp(`\\bthis\\s+${Day}\\b`, "gi");
  result = result.replace(thisPattern, (m) => preserveCase(m, relativeLabel));

  // ── Rule 2: "on <Day>" → whole-phrase swap ──────────────────────────────
  // "On Monday at 7" → "Today at 7". Crucially, "on a Monday" does NOT match
  // (the indefinite article between "on" and "Monday" defeats `\s+`), so
  // idiomatic uses are preserved.
  const onPattern = new RegExp(`\\bon\\s+${Day}\\b`, "gi");
  result = result.replace(onPattern, (m) => preserveCase(m, relativeLabel));

  // ── Rule 3: "<Day>'s" → "Today's" / "Tomorrow's" ───────────────────────
  // Lookahead — keep the 's. "Monday's trivia" → "Today's trivia".
  const possessivePattern = new RegExp(`\\b${Day}(?='s\\b)`, "gi");
  result = result.replace(possessivePattern, (m) => preserveCase(m, relativeLabel));

  // ── Rule 4: "<Day> [at|@] <time>" or "<Day> <bare-time>" ───────────────
  // Lookahead — replace the day name only, keep the time text intact.
  // Examples that match:
  //   "Monday at 7 PM"   "Monday at 7:30pm"   "Monday 7pm"   "Monday @ 7"
  // Examples that do NOT match (idiomatic / missing time signal):
  //   "Monday night"     "Monday morning"     "Monday and Tuesday"
  const timeLookahead = `\\s+(?:at\\s+|@\\s*)?\\d{1,2}(?::\\d{2})?\\s*(?:[ap]\\.?m\\.?)?\\b`;
  const beforeTimePattern = new RegExp(`\\b${Day}(?=${timeLookahead})`, "gi");
  result = result.replace(beforeTimePattern, (m) => preserveCase(m, relativeLabel));

  // ── Time-of-day refinements (today-only) ───────────────────────────────
  // Swap "this afternoon" ↔ "tonight" based on publish hour vs event hour,
  // and rewrite "tomorrow" → "today" for copy generated the day before.
  if (relativeLabel === "today") {
    const hour = ptHour(ptTime);
    const eventHour = parseEventHour(item.time);

    if (hour >= 17 && eventHour && eventHour >= 17) {
      result = result.replace(/\bthis afternoon\b/gi, (m) =>
        m[0] === m[0].toUpperCase() ? "Tonight" : "tonight"
      );
    }
    if (hour < 17 && eventHour && eventHour < 17) {
      result = result.replace(/\btonight\b/gi, (m) =>
        m[0] === m[0].toUpperCase() ? "This afternoon" : "this afternoon"
      );
    }
    result = result.replace(/\btomorrow\b/gi, (m) =>
      m[0] === m[0].toUpperCase() ? "Today" : "today"
    );
  }

  return result;
}
