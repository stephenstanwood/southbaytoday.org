import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const SEPTEMBER_10_READING_URL =
  "https://events.sjsu.edu/event/september-10-campus-reading-discussion-and-film";

// These promotional calendar rows contain all-day reminder dates. Their
// attached organizer posters establish just one actual program date each.
// Evidence: docs/qa/2026-11-05-2207z-fact-check.md.
const NOVEMBER_POSTER_DATES = new Map([
  ["https://events.sjsu.edu/event/campus-reading-program-november-9-events", "2026-11-09"],
  ["https://events.sjsu.edu/event/silent-movie-classic-with-live-score-performance-dont-miss-it", "2026-11-10"],
]);

// Localist currently publishes this one-day program as five all-day
// occurrences. SJSU's event poster is the controlling source: the discussion
// begins Sep. 10 at 4 PM in Sweeney Hall 413, followed by the film at 5:30 PM
// in Uchida Hall 124.
export function applyVerifiedSjsuEventOverride(event) {
  const url = String(event?.url || "").replace(/\/+$/, "");
  // SJSU and the organizer place this conference in Savannah, Georgia,
  // October 25–28. Exclude it even when an older metadata snapshot lacks its
  // address; inheriting San José from the calendar would invent a local event.
  // https://events.sjsu.edu/event/ischool-at-arma-infocon-2026
  // https://infocon.arma.org/
  // Evidence: docs/qa/2026-10-19-0407-fact-check.md.
  if (url === "https://events.sjsu.edu/event/ischool-at-arma-infocon-2026") return null;
  if (NOVEMBER_POSTER_DATES.has(url)) {
    if (event.date !== NOVEMBER_POSTER_DATES.get(url)) return null;
    return applyVerifiedEventFacts({ ...event, url });
  }
  if (url !== SEPTEMBER_10_READING_URL) return event;
  if (event.date !== "2026-09-10") return null;

  return {
    ...event,
    displayDate: "Thu, Sep 10",
    time: "4:00 PM",
    endTime: null,
    venue: "Sweeney Hall 413 and Uchida Hall 124",
    description:
      "Dr. Emily Slusser leads a 4 PM discussion of Asimov's “Robbie” in Sweeney Hall 413, followed by a 5:30 PM screening of M3GAN in Uchida Hall 124.",
  };
}
