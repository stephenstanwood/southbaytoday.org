import { useSyncExternalStore } from "react";

/** Today's date in Pacific time (YYYY-MM-DD), the site's day boundary. */
export function todayPT(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/**
 * Whole calendar days from `isoDate` to `todayIso` (both YYYY-MM-DD). Positive
 * for past dates, 0 for today, negative for a future date. Diffing the two
 * dates as UTC midnights gives the same answer on the server and in every
 * browser.
 */
export function calendarDaysAgo(isoDate: string, todayIso: string): number {
  return Math.round(
    (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${isoDate}T00:00:00Z`)) /
      86_400_000,
  );
}

// Re-check once a minute so a tab left open rolls over at midnight.
function subscribeMinutely(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}

/**
 * Today's Pacific date for a view that also renders into the static build.
 *
 * `buildDayPt` is the day the page was built, passed down from the Astro page.
 * The build and the hydrating client both render that day, so hydration
 * matches however old the build is. React then re-renders with the reader's
 * day as soon as hydration commits. A view mounted client-side (a tab switch)
 * never hydrates, so it reads the clock from its first render.
 */
export function useTodayPT(buildDayPt: string | undefined): string {
  return useSyncExternalStore(subscribeMinutely, todayPT, () => buildDayPt ?? todayPT());
}
