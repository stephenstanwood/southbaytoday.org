// ---------------------------------------------------------------------------
// Shared "today" label used by both the SignalApp masthead and the standalone
// Masthead component (city pages etc). Canonical form: full weekday + month +
// day + year, computed in Pacific time so it matches the site's news cycle
// regardless of the visitor's or server's local timezone.
// ---------------------------------------------------------------------------

export function formatTodayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}
