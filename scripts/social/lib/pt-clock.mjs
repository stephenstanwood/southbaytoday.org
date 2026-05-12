// ---------------------------------------------------------------------------
// pt-clock.mjs
//
// Pacific-Time clock helpers. Replaces the legacy `getPTTime()` /
// `.toISOString().split("T")[0]` pattern in publish-from-queue.mjs which
// silently returns the *UTC* date after ~4-5pm PT (since `toISOString()` is
// always UTC). Live repro on the Mini at 2026-05-11 19:14 PT:
//
//     publisher thinks today is: 2026-05-12
//     isTimeRelevant verdict for today event: EXPIRED
//
// Every helper here pins `timeZone: "America/Los_Angeles"` on its formatter,
// so the result is correct regardless of the system TZ where the script runs
// and regardless of the hour-of-day. DST transitions are handled by the
// platform's tzdata.
// ---------------------------------------------------------------------------

const PT = "America/Los_Angeles";

// `en-CA` formats as ISO YYYY-MM-DD, which sorts and parses cleanly.
const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: PT,
  year: "numeric", month: "2-digit", day: "2-digit",
});

const HOUR_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: PT,
  hour: "numeric", hour12: false,
});

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: PT,
  weekday: "short",
});

// "h:mm a" — drop-in replacement for the legacy
//   ptTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
// pattern, which depended on system TZ.
const CLOCK_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: PT,
  hour: "numeric", minute: "2-digit",
});

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** PT date as "YYYY-MM-DD". */
export function ptDateString(d = new Date()) {
  return DATE_FMT.format(d);
}

/** PT hour as 0..23. Some locales emit "24" at midnight; normalize. */
export function ptHour(d = new Date()) {
  return parseInt(HOUR_FMT.format(d), 10) % 24;
}

/** PT day-of-week as 0..6 with Sunday=0 (matching `Date.prototype.getDay`). */
export function ptDayOfWeek(d = new Date()) {
  return WEEKDAY_INDEX[WEEKDAY_FMT.format(d)];
}

/** PT wall-clock time as e.g. "7:14 PM". */
export function ptClockString(d = new Date()) {
  return CLOCK_FMT.format(d);
}
