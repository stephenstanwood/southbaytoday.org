// ---------------------------------------------------------------------------
// South Bay Today — city-page camp availability helper
// ---------------------------------------------------------------------------
// City pages need a one-line "N camps still open in <City>" pointer to /camps.
// The real "does this camp still have a session I could attend" check lives in
// CampsView.tsx (campHasUpcomingWeek) — this is a minimal, build-time-safe
// replica of just that predicate so CityPage doesn't have to import the whole
// directory/builder UI. Keep the two in sync if the upstream logic changes.

import { CAMPS, type Camp } from "../../data/south-bay/camps-data";
import { TODAY_ISO } from "./timeHelpers";

// Camps with no dated weeks (year-round / undated programs) always count as
// open — mirrors CampsView's campHasUpcomingWeek.
function campHasUpcomingWeek(camp: Camp): boolean {
  if (camp.weeks.length === 0) return true;
  return camp.weeks.some((w) => w.endDate >= TODAY_ISO);
}

/** Count of camps physically located in `cityId` with at least one session
 *  still ahead this summer. "multi" (multi-city) programs are excluded —
 *  they aren't specifically "in" any one city. */
export function openCampCountForCity(cityId: string): number {
  return CAMPS.filter((c) => c.cityId === cityId && campHasUpcomingWeek(c)).length;
}
