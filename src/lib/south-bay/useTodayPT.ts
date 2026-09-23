import { useSyncExternalStore } from "react";

/** Today's date in Pacific time (YYYY-MM-DD), the site's day boundary. */
export function todayPT(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
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
