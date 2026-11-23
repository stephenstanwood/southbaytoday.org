// ---------------------------------------------------------------------------
// South Bay Today — city-page camp pointer
// ---------------------------------------------------------------------------
// City pages carry a one-line "N summer camp programs in <City>" link to that
// city's camp list. The count comes from the sourced camp directory (Camp
// Finder, src/lib/south-bay/campFinder.ts).
//
// Build-time only: src/pages/city/[slug].astro calls this through
// cityPageData.ts, so the camp data never ships to the browser.

import { campCountForCity, cityHref } from "./campFinder";

export type CityCamps = { count: number; href: string } | null;

/** How many sourced camp programs sit in `cityId`, and where they're listed. */
export function campsForCity(cityId: string): CityCamps {
  const count = campCountForCity(cityId);
  return count > 0 ? { count, href: cityHref(cityId) } : null;
}
