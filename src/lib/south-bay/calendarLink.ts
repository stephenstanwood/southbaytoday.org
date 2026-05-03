// ---------------------------------------------------------------------------
// Google Calendar "Add to calendar" link builder
// ---------------------------------------------------------------------------
// Generates a Google Calendar render URL pre-populated with an event's title,
// dates, location, and description. Works for both timed and all-day events.
//
// Format reference: https://www.google.com/calendar/render?action=TEMPLATE
// Times are Pacific (America/Los_Angeles); we pass a TZID-style local time
// (no Z suffix) plus &ctz so Google interprets correctly across user TZs.
// ---------------------------------------------------------------------------

interface CalendarEventInput {
  title: string;
  date: string;                  // "YYYY-MM-DD" (PT)
  time?: string | null;          // "8:00 PM", "10:30 AM", etc.
  endTime?: string | null;
  ongoing?: boolean;
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  description?: string | null;
  blurb?: string | null;
  url?: string | null;
}

/** "8:00 PM" → {h:20, m:0}; null/unparseable → null. */
export function parseClockTime(t: string | null | undefined): { h: number; m: number } | null {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2] ?? "0", 10);
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/** ISO date "2026-05-03" → "20260503". Returns null on bad input. */
export function compactDate(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

/** Add n minutes to {h,m}, wrapping past midnight is rare for events but supported. */
function addMinutes(t: { h: number; m: number }, mins: number): { h: number; m: number; dayOffset: number } {
  const total = t.h * 60 + t.m + mins;
  const dayOffset = Math.floor(total / 1440);
  const wrapped = ((total % 1440) + 1440) % 1440;
  return { h: Math.floor(wrapped / 60), m: wrapped % 60, dayOffset };
}

/** "20260503" + dayOffset → next ISO compact date. */
function addDaysCompact(compact: string, n: number): string {
  const y = parseInt(compact.slice(0, 4), 10);
  const mo = parseInt(compact.slice(4, 6), 10) - 1;
  const d = parseInt(compact.slice(6, 8), 10);
  // Use UTC to avoid local TZ shifts confusing the math.
  const dt = new Date(Date.UTC(y, mo, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear().toString();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Build the Google Calendar template URL for an event.
 * Returns null if the event lacks a usable date.
 *
 * Behavior:
 *  - Event has a parseable start time → 1-hour default duration if no endTime
 *    (or 2h for arts/music if we wanted; keep it simple for now).
 *  - Event is ongoing or has no time → all-day event for that single date.
 *    Google's all-day end is exclusive so we add 1 day.
 */
export function buildGoogleCalendarUrl(evt: CalendarEventInput): string | null {
  const compact = compactDate(evt.date);
  if (!compact) return null;

  const start = parseClockTime(evt.time);
  let dates: string;

  if (start && !evt.ongoing) {
    const endParsed = parseClockTime(evt.endTime);
    let end: { h: number; m: number; dayOffset: number };
    if (endParsed && (endParsed.h * 60 + endParsed.m) > (start.h * 60 + start.m)) {
      end = { h: endParsed.h, m: endParsed.m, dayOffset: 0 };
    } else {
      end = addMinutes(start, 60);
    }
    const startCompact = compact;
    const endCompact = end.dayOffset > 0 ? addDaysCompact(compact, end.dayOffset) : compact;
    dates = `${startCompact}T${pad2(start.h)}${pad2(start.m)}00/${endCompact}T${pad2(end.h)}${pad2(end.m)}00`;
  } else {
    // All-day; Google's end is exclusive.
    const endCompact = addDaysCompact(compact, 1);
    dates = `${compact}/${endCompact}`;
  }

  // Build details: blurb/description + URL line.
  const detailsParts: string[] = [];
  const body = (evt.blurb && evt.blurb.trim()) || (evt.description && evt.description.trim());
  if (body) detailsParts.push(body);
  if (evt.url) detailsParts.push(`More info: ${evt.url}`);
  const details = detailsParts.join("\n\n");

  const locParts: string[] = [];
  if (evt.venue) locParts.push(evt.venue);
  if (evt.address) locParts.push(evt.address);
  else if (evt.city) {
    const cityLabel = evt.city.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
    locParts.push(cityLabel);
  }
  const location = locParts.join(", ");

  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", evt.title);
  params.set("dates", dates);
  if (details) params.set("details", details);
  if (location) params.set("location", location);
  // Always pin to PT so the event lands at the right wall-clock for the South Bay.
  params.set("ctz", "America/Los_Angeles");

  return `https://www.google.com/calendar/render?${params.toString()}`;
}
