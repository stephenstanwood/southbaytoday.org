// ---------------------------------------------------------------------------
// Age labels for Recently Funded cards
// ---------------------------------------------------------------------------
// Split out of TechnologyView so the arithmetic is testable without a DOM —
// same reasoning as postAge.ts.
//
// `RecentlyFunded.date` is a Pacific calendar date, so its age has to be a
// Pacific calendar-day count. The original version anchored each round at
// `new Date(date + "T12:00:00")` — parsed in whatever zone the renderer sits
// in — and floored a raw millisecond delta against it, which put the rollover
// at local noon instead of local midnight. Every card read a full day younger
// all morning: on Aug 28 a round dated Aug 26 rendered "yesterday", and a round
// announced that same morning scored -1, which also suppressed its NEW badge.
// Because the app shell is `client:load`, that arithmetic ran again against
// each visitor's own clock and zone, so one card aged differently by reader.
//
// Diffing the two Pacific calendar dates as UTC midnights is stable on the
// server and in every browser. The card gets "today" from useTodayPT, so it
// hydrates against the build's day, then ages against the reader's.
// ---------------------------------------------------------------------------

/** Pacific calendar date ("YYYY-MM-DD") for a moment in time. */
export function pacificDate(nowMs: number): string {
  return new Date(nowMs).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

/**
 * Whole calendar days from `isoDate` to `todayIso` (both YYYY-MM-DD).
 * Positive for past dates, 0 for today, negative for a future-dated round.
 */
export function calendarDaysAgo(isoDate: string, todayIso: string): number {
  return Math.round(
    (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${isoDate}T00:00:00Z`)) /
      86_400_000,
  );
}

/** Whole Pacific calendar days between `isoDate` (YYYY-MM-DD) and `nowMs`. */
export function pacificDaysAgo(isoDate: string, nowMs: number): number {
  return calendarDaysAgo(isoDate, pacificDate(nowMs));
}

/** A round closed within the last two weeks earns the NEW badge. */
export function isFreshRound(daysAgo: number): boolean {
  return daysAgo >= 0 && daysAgo <= 14;
}

/**
 * "today" / "yesterday" / "3d ago" / "2w ago" inside a 30-day window, and an
 * absolute Pacific date beyond it, as seen on the Pacific date `todayIso`.
 * Future-dated rounds fall through to the absolute date rather than claiming
 * a negative age.
 */
export function fundingDateLabel(isoDate: string, todayIso: string): string {
  const daysAgo = calendarDaysAgo(isoDate, todayIso);
  if (daysAgo >= 0 && daysAgo <= 30) {
    if (daysAgo === 0) return "today";
    if (daysAgo === 1) return "yesterday";
    if (daysAgo < 7) return `${daysAgo}d ago`;
    return `${Math.round(daysAgo / 7)}w ago`;
  }
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
