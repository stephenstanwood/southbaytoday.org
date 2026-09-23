// ---------------------------------------------------------------------------
// South Bay Today — city-page camp availability helper
// ---------------------------------------------------------------------------
// City pages need a one-line "N camps still open in <City>" pointer to /camps.
// The real "does this camp still have a session I could attend" check lives in
// CampsView.tsx (campHasUpcomingWeek) — this is a minimal, build-time-safe
// replica of just that predicate so CityPage doesn't have to import the whole
// directory/builder UI. Keep the two in sync if the upstream logic changes.
//
// Build-time only: src/pages/city/[slug].astro calls this through
// cityPageData.ts, so camps-data.ts never ships to the browser.

import { CAMPS, type Camp } from "../../data/south-bay/camps-data";
import { TODAY_ISO } from "./timeHelpers";

// Camps with no dated weeks (year-round / undated programs) always count as
// open — mirrors CampsView's campHasUpcomingWeek.
function campHasUpcomingWeek(camp: Camp, todayIso: string): boolean {
  if (camp.weeks.length === 0) return true;
  return camp.weeks.some((w) => w.endDate >= todayIso);
}

/** Camps physically located in `cityId` with at least one session still
 *  ahead on `todayIso`, each reduced to the end date of its last session
 *  (null for undated programs, which never close). "multi" (multi-city)
 *  programs are excluded — they aren't specifically "in" any one city.
 *
 *  The list's length is the open count on `todayIso`. On any later day `d`,
 *  the camps still open are the entries that are null or ≥ `d`, which is how
 *  CityPage re-counts against the reader's own day after mount. */
export function openCampLastDatesForCity(cityId: string, todayIso: string = TODAY_ISO): Array<string | null> {
  return CAMPS
    .filter((c) => c.cityId === cityId && campHasUpcomingWeek(c, todayIso))
    .map((c) => (c.weeks.length === 0
      ? null
      : c.weeks.reduce((last, w) => (w.endDate > last ? w.endDate : last), "")));
}
