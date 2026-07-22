const MEAL_BUCKETS = new Set(["breakfast", "lunch", "dinner"]);

const MEAL_VENUE_TYPES = new Set([
  "restaurant", "cafe", "coffee_shop", "bakery", "bistro", "diner",
  "sandwich_shop", "bar_and_grill", "pub", "food_court",
]);

const NON_DINING_PRIMARY_TYPES = new Set([
  "catering_service", "food_delivery", "meal_delivery", "meal_takeaway",
  "food_store", "grocery_store", "supermarket", "convenience_store",
  "candy_store", "chocolate_shop", "confectionery", "dessert_shop",
  "business_center", "store",
]);

const BREAKFAST_PRIMARY_TYPES = new Set([
  "breakfast_restaurant", "brunch_restaurant", "cafe", "coffee_shop",
  "bakery", "pastry_shop", "diner", "sandwich_shop",
]);

const DINNER_PRIMARY_TYPES = new Set([
  "restaurant", "bistro", "diner", "bar_and_grill", "pub", "gastropub",
]);

const BREAKFAST_DISPLAY_SIGNAL = /\b(breakfast|brunch|cafe|café|coffee|bakery|pastry|diner)\b/i;
const DINNER_DISPLAY_SIGNAL = /\b(restaurant|bistro|diner|taqueria|pizzeria|brasserie|izakaya|gastropub|bar and grill)\b/i;
const GENERAL_DINING_DISPLAY_SIGNAL = /\b(restaurant|cafe|café|coffee|bakery|bistro|diner|taqueria|pizzeria|brasserie|izakaya|gastropub|bar and grill)\b/i;

const SERVICE_PROBES = {
  breakfast: [9.5, 10.25],
  lunch: [12.5, 13.25],
  dinner: [18.5, 19.25],
};

function parseClockHour(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59 || hour > (meridiem ? 12 : 24)) return null;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour + minute / 60;
}

function openRangesOn(hours, dayKey) {
  const value = hours?.[dayKey];
  if (!value) return [];
  const ranges = [];
  for (const segment of String(value).split(",")) {
    const [openText, closeText] = segment.split("-");
    const open = parseClockHour(openText);
    let close = parseClockHour(closeText);
    if (open === null || close === null) continue;
    if (close <= open) close += 24;
    ranges.push([open, close]);
  }
  return ranges;
}

export function dayKeyForIsoDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const index = new Date(`${date}T12:00:00Z`).getUTCDay();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][index] || null;
}

export function mealVenueMatchesService(candidate, bucket) {
  if (!MEAL_BUCKETS.has(bucket)) return false;
  const types = Array.isArray(candidate?.types) ? candidate.types : [];
  const primaryType = String(candidate?.primaryType || "");
  const displayType = String(candidate?.displayType || "");
  const bestSlots = Array.isArray(candidate?.bestSlots) ? candidate.bestSlots : [];

  if (NON_DINING_PRIMARY_TYPES.has(primaryType)) return false;
  if (/\b(?:apt|apartment)\b/i.test(candidate?.address || "")) return false;

  const primaryIsRestaurant = primaryType === "restaurant" || primaryType.endsWith("_restaurant");
  const primaryIsDiningVenue = primaryIsRestaurant
    || MEAL_VENUE_TYPES.has(primaryType)
    || types.some((type) => MEAL_VENUE_TYPES.has(type));
  const displayIsDiningVenue = GENERAL_DINING_DISPLAY_SIGNAL.test(displayType);
  const trustedUntypedRecord = candidate?.curated === true && !primaryType && types.length === 0;
  if (!primaryIsDiningVenue && !displayIsDiningVenue && !trustedUntypedRecord) return false;

  if (bucket === "breakfast") {
    // Being open in the morning does not turn an arbitrary lunch/dinner
    // restaurant (or a grocery-and-grill hybrid) into a breakfast stop. We
    // need an explicit breakfast service/type signal or editorial best-slot.
    return bestSlots.includes("breakfast")
      || BREAKFAST_PRIMARY_TYPES.has(primaryType)
      || types.some((type) => BREAKFAST_PRIMARY_TYPES.has(type))
      || BREAKFAST_DISPLAY_SIGNAL.test(displayType);
  }
  if (bucket === "dinner") {
    return primaryIsRestaurant || DINNER_PRIMARY_TYPES.has(primaryType)
      || (!primaryType && DINNER_DISPLAY_SIGNAL.test(displayType));
  }
  return true;
}

export function mealOpenForService(hours, dayKey, bucket) {
  if (!dayKey || !SERVICE_PROBES[bucket]) return false;
  const [serviceStart, serviceEnd] = SERVICE_PROBES[bucket];
  return openRangesOn(hours, dayKey).some(([open, close]) => open <= serviceStart && close >= serviceEnd);
}

export function mealServiceIssue(place, bucket, dayKey) {
  if (!mealVenueMatchesService(place, bucket)) return `not a verified ${bucket} venue`;
  if (!mealOpenForService(place?.hours, dayKey, bucket)) return `not open for ${bucket} service`;
  return null;
}
