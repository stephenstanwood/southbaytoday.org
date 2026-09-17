// Pure drift check between the place blurbs baked into default-plans.json and
// the current place-blurb-cache.json. The homepage plan generator bakes
// `cleanDisplayCopy(cache[placeId].blurb)` into each place card at 3:21 AM;
// a blurb fix that lands in the cache later the same morning (#249 on Sep 16,
// #251 on Sep 17) leaves the day's baked card carrying the wording that was
// just corrected. Two cycles in a row found exactly one such card by hand.
//
// Shared by scripts/check-plan-blurb-drift.mjs (report / --fix) and its test.

import { cleanDisplayCopy } from "../../src/lib/south-bay/displayText.mjs";

export function cacheBlurbFor(cache, placeId) {
  const entry = cache?.blurbs?.[placeId];
  const raw = typeof entry === "string" ? entry : entry?.blurb;
  return raw ? cleanDisplayCopy(raw) || null : null;
}

/**
 * @returns {{ plan: string, index: number, id: string, name: string, baked: string|null, cache: string }[]}
 */
export function findPlanBlurbDrift(plans, cache) {
  const drift = [];
  for (const [plan, body] of Object.entries(plans?.plans ?? {})) {
    (body?.cards ?? []).forEach((card, index) => {
      if (typeof card?.id !== "string" || !card.id.startsWith("place:")) return;
      const expected = cacheBlurbFor(cache, card.id.slice("place:".length));
      if (!expected) return; // no cache entry — nothing authoritative to compare against
      if ((card.blurb ?? null) === expected) return;
      drift.push({ plan, index, id: card.id, name: card.name ?? card.id, baked: card.blurb ?? null, cache: expected });
    });
  }
  return drift;
}

/** Returns a new plans object with every drifted card's blurb re-baked from the cache. */
export function applyPlanBlurbFixes(plans, drift) {
  const next = structuredClone(plans);
  for (const d of drift) next.plans[d.plan].cards[d.index].blurb = d.cache;
  return next;
}
