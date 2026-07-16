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

/** Normalize recurring South Bay street-name variants from SCC permit data. */
export function normalizeSouthBayAddress(value) {
  return String(value ?? "").replace(/\bDeanza\b/gi, "De Anza");
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
