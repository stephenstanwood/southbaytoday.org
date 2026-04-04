// ---------------------------------------------------------------------------
// South Bay Signal — Diversity Constraints
// Ensures post selections aren't dominated by one city/category/venue
// ---------------------------------------------------------------------------

import { DIVERSITY } from "./constants.mjs";

/**
 * Select top items while respecting diversity constraints.
 * Input must be pre-sorted by score descending.
 *
 * @param {Array} candidates - Scored candidates, sorted by score desc
 * @param {number} targetCount - How many items to select
 * @param {object} [opts] - Override diversity settings
 * @returns {Array} Selected items respecting diversity
 */
export function diverseSelect(candidates, targetCount, opts = {}) {
  const maxCity = opts.maxSameCity ?? DIVERSITY.maxSameCity;
  const maxCat = opts.maxSameCategory ?? DIVERSITY.maxSameCategory;
  const minCities = opts.minUniqueCities ?? DIVERSITY.minUniqueCities;

  const selected = [];
  const cityCounts = {};
  const catCounts = {};
  const venuesSeen = new Set();

  for (const item of candidates) {
    if (selected.length >= targetCount) break;

    const city = item.city || "unknown";
    const cat = item.category || "other";
    const venue = (item.venue || "").toLowerCase();

    // Check city cap
    if ((cityCounts[city] || 0) >= maxCity) continue;

    // Check category cap
    if ((catCounts[cat] || 0) >= maxCat) continue;

    // Skip duplicate venues
    if (venue && venue.length > 3 && venuesSeen.has(venue)) continue;

    selected.push(item);
    cityCounts[city] = (cityCounts[city] || 0) + 1;
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    if (venue) venuesSeen.add(venue);
  }

  // If we haven't met minimum city diversity, try swapping
  const uniqueCities = new Set(selected.map((s) => s.city).filter(Boolean));
  if (uniqueCities.size < minCities && selected.length >= minCities) {
    // Find candidates from underrepresented cities
    const usedCities = uniqueCities;
    const alternatives = candidates.filter(
      (c) => c.city && !usedCities.has(c.city) && !selected.includes(c)
    );

    if (alternatives.length > 0) {
      // Replace the lowest-scored item with the best alternative
      const alt = alternatives[0];
      selected[selected.length - 1] = alt;
    }
  }

  return selected;
}
