import type { Bucket } from "./buckets";
import { chainBrandKey } from "./chains.mjs";

/**
 * The regional day plan is three strong activity pillars. Each pillar owns
 * one meal pairing, so geography is evaluated inside a pair instead of across
 * the whole day.
 */
export const DAY_PLAN_SELECTION_MODEL = "pillar-pairs-v1" as const;

export const PILLAR_BUCKETS = ["morning", "afternoon", "evening"] as const;
export type PillarBucket = (typeof PILLAR_BUCKETS)[number];

export const MEAL_BUCKET_BY_PILLAR: Record<PillarBucket, Bucket> = {
  morning: "breakfast",
  afternoon: "lunch",
  evening: "dinner",
};

export const PILLAR_BUCKET_BY_MEAL: Partial<Record<Bucket, PillarBucket>> = {
  breakfast: "morning",
  lunch: "afternoon",
  dinner: "evening",
};

// Three miles is the preferred neighborhood-scale pairing. Five miles is a
// hard ceiling: wide enough for a park or edge-of-town venue, but still close
// enough that the meal feels attached to the activity rather than arbitrary.
export const MEAL_PAIR_PREFERRED_MILES = 3;
export const MEAL_PAIR_MAX_MILES = 5;

/**
 * Plan-wide restaurant identity. Google Places gives each branch a distinct
 * id, but a reader still experiences Oren's Cupertino and Oren's Mountain
 * View as the same recommendation. Fall back to the record id only when a
 * usable name is unavailable.
 */
export function mealBrandKey(name: string | null | undefined, fallbackId = ""): string {
  return chainBrandKey(name) || String(fallbackId || "").trim().toLowerCase();
}

/** Claude may exercise taste among comparably strong finalists, but cannot
 * override a material deterministic quality gap. */
export function isWithinQualityBand(
  candidateScore: number,
  bestAvailableScore: number,
  maxGap: number,
): boolean {
  return Number.isFinite(candidateScore) &&
    Number.isFinite(bestAvailableScore) &&
    candidateScore >= bestAvailableScore - maxGap;
}

export interface PairCoordinates {
  lat?: number | null;
  lng?: number | null;
}

export interface MealQualityCandidate extends PairCoordinates {
  id: string;
  rating?: number | null;
  ratingCount?: number | null;
  curated?: boolean;
  newlyOpened?: boolean;
  isChain?: boolean;
  chainLocations?: number;
  /** 0-12, computed from how uncommon and specific the food type is. */
  foodDistinctiveness?: number;
  blurb?: string | null;
}

export interface RankedNearbyMeal<T extends MealQualityCandidate> {
  candidate: T;
  distanceMiles: number;
  qualityScore: number;
  pairingScore: number;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const radiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceMiles(a: PairCoordinates, b: PairCoordinates): number | null {
  if (
    !Number.isFinite(a.lat) || !Number.isFinite(a.lng) ||
    !Number.isFinite(b.lat) || !Number.isFinite(b.lng)
  ) {
    return null;
  }
  return haversineKm(a.lat!, a.lng!, b.lat!, b.lng!) * 0.621371;
}

/**
 * Food quality intentionally outweighs small distance differences inside the
 * five-mile ceiling. This is the reusable expression of "new, unique, great":
 * reputation + evidence, an editorial/new-opening signal, and a reward for a
 * specific uncommon food type. Eligible chain branches carry an ubiquity
 * penalty, so their interest signal has to beat a comparable independent.
 */
export function mealQualityScore(candidate: MealQualityCandidate): number {
  const rating = Number.isFinite(candidate.rating) ? candidate.rating! : 0;
  const ratingCount = Number.isFinite(candidate.ratingCount) ? Math.max(0, candidate.ratingCount!) : 0;
  const ratingScore = rating > 0 ? Math.max(0, rating - 3.8) * 18 : 0;
  const evidenceScore = ratingCount > 0 ? Math.min(20, Math.log10(ratingCount + 1) * 6) : 0;
  const curatedScore = candidate.curated ? 10 : 0;
  const newScore = candidate.newlyOpened ? 14 : 0;
  const distinctiveScore = Math.max(0, Math.min(12, candidate.foodDistinctiveness || 0));
  const specificCopyScore = candidate.blurb && candidate.blurb.trim().length >= 55 ? 3 : 0;
  const ubiquityPenalty = candidate.isChain
    ? Math.min(12, 4 + Math.log2(Math.max(1, candidate.chainLocations || 1)) * 2)
    : 0;
  return ratingScore + evidenceScore + curatedScore + newScore + distinctiveScore + specificCopyScore - ubiquityPenalty;
}

export function rankNearbyMeals<T extends MealQualityCandidate>(
  pillar: PairCoordinates,
  meals: T[],
  maxMiles = MEAL_PAIR_MAX_MILES,
): RankedNearbyMeal<T>[] {
  const ranked: RankedNearbyMeal<T>[] = [];
  for (const candidate of meals) {
    const miles = distanceMiles(pillar, candidate);
    if (miles === null || miles > maxMiles) continue;
    const qualityScore = mealQualityScore(candidate);
    const neighborhoodBonus = miles <= MEAL_PAIR_PREFERRED_MILES ? 3 : 0;
    // Distance breaks ties; it does not turn the closest generic option into
    // the recommendation when a meaningfully better local place is nearby.
    const pairingScore = qualityScore + neighborhoodBonus - miles * 1.35;
    ranked.push({ candidate, distanceMiles: miles, qualityScore, pairingScore });
  }
  return ranked.sort((a, b) =>
    b.pairingScore - a.pairingScore ||
    b.qualityScore - a.qualityScore ||
    a.distanceMiles - b.distanceMiles ||
    a.candidate.id.localeCompare(b.candidate.id)
  );
}

export interface PairPlanCard {
  id: string;
  name?: string | null;
  bucket?: Bucket | null;
  city?: string | null;
  role?: "pillar" | "paired-meal" | null;
  pairedWithId?: string | null;
  pairDistanceMiles?: number | null;
  pairLocationPrecision?: "exact" | "venue" | "city" | null;
}

/** Remove rejected/stale cards without ever leaving the other half of a pair. */
export function filterAtomicPairCards<T extends PairPlanCard>(
  cards: T[],
  rejectedIds: ReadonlySet<string>,
): T[] {
  const isPairPlan = cards.some((card) => card.role === "pillar" || card.role === "paired-meal");
  if (!isPairPlan) return cards.filter((card) => !rejectedIds.has(card.id));
  return cards.filter((card) =>
    !rejectedIds.has(card.id) && !rejectedIds.has(card.pairedWithId || ""),
  );
}

/** Return every structural problem in a pillar-pairs plan. */
export function dayPlanPairingIssues(
  cards: PairPlanCard[],
  maxMiles = MEAL_PAIR_MAX_MILES,
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) issues.push(`duplicate card id: ${card.id}`);
    ids.add(card.id);
  }

  const mealBrands = new Map<string, string>();
  for (const mealBucket of Object.values(MEAL_BUCKET_BY_PILLAR)) {
    const meal = cards.find((card) => card.bucket === mealBucket);
    if (!meal) continue;
    const brand = mealBrandKey(meal.name, meal.id);
    const first = mealBrands.get(brand);
    if (first) {
      issues.push(`duplicate meal brand: ${first} / ${meal.name || meal.id}`);
    } else {
      mealBrands.set(brand, meal.name || meal.id);
    }
  }

  for (const pillarBucket of PILLAR_BUCKETS) {
    const mealBucket = MEAL_BUCKET_BY_PILLAR[pillarBucket];
    const pillar = cards.find((card) => card.bucket === pillarBucket);
    const meal = cards.find((card) => card.bucket === mealBucket);
    if (!pillar) {
      issues.push(`missing ${pillarBucket} pillar`);
      continue;
    }
    if (!meal) {
      issues.push(`missing ${mealBucket} pairing`);
      continue;
    }
    if (pillar.role !== "pillar") issues.push(`${pillarBucket} card is not marked pillar`);
    if (meal.role !== "paired-meal") issues.push(`${mealBucket} card is not marked paired-meal`);
    if (pillar.pairedWithId !== meal.id) issues.push(`${pillarBucket} does not point to ${mealBucket}`);
    if (meal.pairedWithId !== pillar.id) issues.push(`${mealBucket} does not point to ${pillarBucket}`);
    if (!Number.isFinite(meal.pairDistanceMiles)) {
      issues.push(`${mealBucket} is missing pair distance`);
    } else if (meal.pairDistanceMiles! > maxMiles + 0.05) {
      issues.push(`${mealBucket} is ${meal.pairDistanceMiles!.toFixed(1)} miles from ${pillarBucket}`);
    }
    if (meal.pairLocationPrecision !== "exact" && meal.pairLocationPrecision !== "venue") {
      issues.push(`${mealBucket} proximity is not venue-resolved`);
    }
  }
  return issues;
}

/** Back-compat city label for consumers that still require one city field. */
export function dominantPillarCity(cards: PairPlanCard[], fallback: string): string {
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  for (const [index, bucket] of PILLAR_BUCKETS.entries()) {
    const city = cards.find((card) => card.bucket === bucket)?.city?.trim();
    if (!city) continue;
    counts.set(city, (counts.get(city) || 0) + 1);
    if (!firstSeen.has(city)) firstSeen.set(city, index);
  }
  return [...counts.entries()]
    .sort(([a, ac], [b, bc]) => bc - ac || (firstSeen.get(a)! - firstSeen.get(b)!) || a.localeCompare(b))[0]?.[0]
    || fallback;
}
