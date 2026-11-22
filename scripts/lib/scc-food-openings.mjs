const STREET_TYPE_FAMILIES = [
  ["st", "street"],
  ["av", "ave", "avenue"],
  ["rd", "road"],
  ["bl", "blv", "blvd", "boulevard"],
  ["dr", "drive"],
  ["ct", "court"],
  ["ln", "lane"],
  ["ci", "cir", "circle"],
  ["pl", "place"],
  ["pk", "pkwy", "py", "parkway"],
  ["hwy", "highway"],
  ["wy", "way"],
  ["ex", "expwy", "expressway"],
  ["ter", "terrace"],
  ["sq", "square"],
];

const STREET_TYPE_BY_TOKEN = new Map();
for (const aliases of STREET_TYPE_FAMILIES) {
  const fragments = new Set();
  for (const alias of aliases) {
    STREET_TYPE_BY_TOKEN.set(alias, fragments);
    for (let length = 1; length <= alias.length; length += 1) {
      fragments.add(alias.slice(0, length));
    }
  }
}

function words(value) {
  return String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Classify a county final-inspection record without turning the inspection date
 * into an opening claim. A real opening date exists only when a separate,
 * attributable source explicitly establishes it.
 */
export function classifyFinalInspection(record, openingEvidence = null) {
  const sourceId = record?.sourceId || null;
  const inspectionDate = isIsoDate(record?.inspectionDate) ? record.inspectionDate : null;
  const hasOpeningEvidence = isIsoDate(openingEvidence?.date)
    && isHttpUrl(openingEvidence?.url)
    && typeof openingEvidence?.source === "string"
    && openingEvidence.source.trim().length > 0;

  if (hasOpeningEvidence) {
    return {
      ...record,
      id: `opened-${sourceId || record?.id || "unknown"}`,
      status: "opened",
      date: openingEvidence.date,
      inspectionDate,
      openingEvidence: {
        date: openingEvidence.date,
        url: openingEvidence.url,
        source: openingEvidence.source.trim(),
      },
    };
  }

  const classified = {
    ...record,
    id: `inspection-${sourceId || record?.id || "unknown"}`,
    status: "inspection-complete",
    inspectionDate,
  };
  delete classified.date;
  delete classified.openingEvidence;
  return classified;
}

/** Defense-in-depth for every surface that labels a record as opened. */
export function isVerifiedOpeningRecord(record) {
  return record?.status === "opened"
    && isIsoDate(record?.date)
    && record.date === record?.openingEvidence?.date
    && isHttpUrl(record?.openingEvidence?.url)
    && typeof record?.openingEvidence?.source === "string"
    && record.openingEvidence.source.trim().length > 0;
}

// Places types that mean "somewhere to eat or drink". Text Search returns its
// best guess for "<name> <address> <city>", which for a new business with no
// listing is often the shopping center around it: "A New Sunrise Cafe" (463
// Blossom Hill Rd, SR0885856) came back as Sunrise Plaza Shopping Center at
// 620-690 Blossom Hill Rd, and its tile showed a sporting-goods sign.
const FOOD_PLACE_TYPES = new Set([
  "restaurant", "food", "cafe", "coffee_shop", "bakery", "bar", "pub", "wine_bar",
  "meal_takeaway", "meal_delivery", "ice_cream_shop", "dessert_shop", "dessert_restaurant",
  "tea_house", "juice_shop", "donut_shop", "bagel_shop", "sandwich_shop", "pizza_restaurant",
  "fast_food_restaurant", "brunch_restaurant", "breakfast_restaurant", "confectionery",
  "grocery_store", "supermarket", "food_store", "market", "asian_grocery_store",
  "butcher_shop", "deli", "cafeteria", "food_court", "bar_and_grill", "brewery", "winery",
]);
const GENERIC_NAME_WORDS = new Set([
  "the", "and", "new", "cafe", "café", "restaurant", "kitchen", "bar", "grill", "house",
  "shop", "food", "foods", "market", "express", "eatery", "bistro", "company",
]);

function nameTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !GENERIC_NAME_WORDS.has(word));
}

function streetNumber(value) {
  return /^\s*(\d+)[a-z]?\b/i.exec(String(value || ""))?.[1] ?? null;
}

/**
 * Whether a Text Search hit can be trusted to picture this business: it must
 * be a food or drink place, and it must agree on the street number or share a
 * distinctive word of the name. A mall, office park or neighbor fails.
 */
export function placeMatchesFoodItem(item, place) {
  if (!place) return false;
  const types = [place.primaryType, ...(place.types || [])].filter(Boolean);
  if (!types.some((type) => FOOD_PLACE_TYPES.has(type))) return false;
  const itemNumber = streetNumber(item.address);
  const placeNumber = streetNumber(place.formattedAddress);
  if (itemNumber && placeNumber) return itemNumber === placeNumber;
  const placeWords = new Set(nameTokens(place.displayName?.text ?? place.displayName));
  return nameTokens(item.name).some((word) => placeWords.has(word));
}

export function foodPhotoCacheKey(item) {
  return item.sourceId || `${item.name}|${item.address || ""}|${item.cityId || ""}`;
}

/**
 * A Places photo belongs to the place ID in its resource name, not to a brand.
 * One place cannot be in two cities. Suppress every conflicting assignment:
 * the opaque photo reference cannot establish which business actually owns it.
 * Cache nulls so the next refresh does not restore the unverified photos.
 * Call once across openings, inspections and coming-soon records together.
 */
export function discardConflictingFoodPhotos(items, photoCacheByKey = {}) {
  const byPlace = new Map();
  for (const item of items) {
    const placeId = /^places\/([^/]+)\/photos\//.exec(item.photoRef || "")?.[1];
    if (!placeId) continue;
    if (!byPlace.has(placeId)) byPlace.set(placeId, []);
    byPlace.get(placeId).push(item);
  }

  const conflicts = [];
  for (const [placeId, records] of byPlace) {
    const cities = new Set(records
      .map((item) => words(item.cityId || item.cityName).join(" "))
      .filter(Boolean));
    if (cities.size < 2) continue;
    for (const item of records) {
      delete item.photoRef;
      photoCacheByKey[foodPhotoCacheKey(item)] = null;
    }
    conflicts.push({ placeId, cities: [...cities], sourceIds: records.map((item) => item.sourceId) });
  }
  return conflicts;
}

// First-party coming-soon facts checked October 4, 2026. A Reddit post is a
// discovery lead; its date and model-written blurb are not opening evidence.
const VERIFIED_COMING_SOON_DISCOVERIES = new Map([
  ["san-jose|spark social san jose", {
    address: "140 S Montgomery Blvd",
    blurb: "A food-truck park with a full bar, putt-putt and live music is planned at 140 S Montgomery Blvd.",
    source: "https://visitsparksocial.com/san-jose/",
    sourceLabel: "SPARK Social",
  }],
]);

export function normalizeComingSoonDiscovery(record) {
  if (record?.discoveryMethod !== "reddit-pulse") return record;
  const key = `${record.cityId}|${words(record.name).join(" ")}`;
  return {
    ...record,
    date: null,
    blurb: null,
    ...VERIFIED_COMING_SOON_DISCOVERIES.get(key),
  };
}

/** Normalize recurring South Bay street-name variants from SCC permit data. */
export function normalizeSouthBayAddress(value) {
  return String(value ?? "")
    .replace(/\bDeanza\b/gi, "De Anza")
    // County plan check SR0884037 prepends a stray P to the street number.
    // The existing business identifies the site at https://www.solrestaurantsca.com/vive.
    .replace(/^(\s*)P(?=2020 W EL CAMINO REAL\b)/i, "$1")
    // SCC permit typo: Flora (SR0882674, 2026-10-12) filed at "355 Santa Row".
    // There is no Santa Row in the South Bay; it's Santana Row.
    .replace(/\bSanta\s+Row\b/gi, "Santana Row")
    // SCC permit rows sometimes repeat the street number where the source form
    // concatenated a house number field with an already-complete street line,
    // shipping "1026 1026 W Evelyn Ave" (Spice Fusion, Sunnyvale, 2026-08-12).
    // Collapse the duplicate — only when the two numbers are identical and lead
    // the string, so a genuine range ("82-96") or "1 1st St" is untouched.
    .replace(/^(\s*)(\d+[a-z]?)\s+\2\b/i, "$1$2");
}

/**
 * Detect permit placeholder names derived from the site's street address.
 *
 * SCC sometimes turns one address into multiple food-facility records, such as
 * "E-4988 GREAT AMERICAN P CAFE" and "... COFFEE BAR". Checking only whether
 * the cleaned display name ends in a street type misses both records, and the
 * later same-address dedupe then recreates "4988 Great American P" as their
 * shared prefix. Match the name to the actual site address instead: the same
 * street number + street-name tokens + any full/truncated form of that address's
 * street type is an address placeholder, even when facility words follow it.
 */
export function isAddressDerivedBusinessName(businessName, siteLocation) {
  const nameTokens = words(String(businessName ?? "").replace(/^e-\s*/i, ""));
  const addressTokens = words(String(siteLocation ?? "").split(",", 1)[0]);

  if (!/^\d+[a-z]?$/.test(nameTokens[0] ?? "") || nameTokens[0] !== addressTokens[0]) {
    return false;
  }

  const streetTypeIndex = addressTokens.findIndex(
    (token, index) => index > 1 && STREET_TYPE_BY_TOKEN.has(token),
  );
  if (streetTypeIndex < 2) return false;

  const streetNameTokens = addressTokens.slice(1, streetTypeIndex);
  const nameStreetTokens = nameTokens.slice(1, streetTypeIndex);
  if (
    nameStreetTokens.length !== streetNameTokens.length
    || nameStreetTokens.some((token, index) => token !== streetNameTokens[index])
  ) {
    return false;
  }

  // A name ending at the street name (before the type) is also just an address.
  const possibleStreetType = nameTokens[streetTypeIndex];
  if (!possibleStreetType) return true;

  return STREET_TYPE_BY_TOKEN.get(addressTokens[streetTypeIndex]).has(possibleStreetType);
}
