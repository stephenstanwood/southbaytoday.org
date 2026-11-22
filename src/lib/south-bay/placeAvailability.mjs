// Editorial corrections that Google Places cannot reliably express. Keep this
// list deliberately small and source every temporary suppression. A review date
// is a prompt to recheck the source, not an automatic expiry: the place stays
// unavailable until a human confirms that it has reopened and removes the flag.
export const PLACE_EDITORIAL_OVERRIDES = Object.freeze({
  "ChIJ06EYWO-6j4AR5x1zss9iick": Object.freeze({
    canonicalUrl: "https://www.izzysbrooklynbagels.com/",
    source: "https://www.izzysbrooklynbagels.com/contact",
  }),
  ChIJMZC2UwI1joAReJaK1vHSqcc: Object.freeze({
    canonicalUrl: "https://parks.santaclaracounty.gov/locations/los-gatos-creek-county-park",
    hoursVaryWithDaylight: true,
    source: "https://parks.santaclaracounty.gov/locations/los-gatos-creek-county-park",
  }),
  ChIJ24fHtb81joARJByKotZNf3k: Object.freeze({
    hoursVaryWithDaylight: true,
    source: "https://parks.santaclaracounty.gov/locations/vasona-lake-county-park",
  }),
  "ChIJ-ZogKrvMj4ARKrML-5D1a88": Object.freeze({
    hoursVaryWithDaylight: true,
    source: "https://www.sanjoseca.gov/Home/Components/FacilityDirectory/FacilityDirectory/2088/2028",
  }),
  "ChIJ-ZogKrvMj4ARfjcGfUkMHxY": Object.freeze({
    hoursVaryWithDaylight: true,
    source: "https://www.sanjoseca.gov/Home/Components/FacilityDirectory/FacilityDirectory/2082/2028",
  }),
  ChIJyY2YFsq3j4ARqe46wAhtELk: Object.freeze({
    hoursVaryWithDaylight: true,
    source: "https://www.mountainview.gov/our-city/departments/community-services/parks-and-trails/trails-684",
  }),
  ChIJ8QmpntO2j4ARX1iGIbLixxY: Object.freeze({
    hoursVaryWithDaylight: true,
    source: "https://www.mountainview.gov/our-city/departments/community-services/parks-and-trails/parks/city-parks",
  }),
  ChIJKUycKxLSj4AR0gmKsUg3QOI: Object.freeze({
    hoursVaryWithDaylight: true,
    source: "https://www.openspaceauthority.org/preserve/sierra-vista",
  }),
  "ChIJzxby-tczjoARqapOY6c8orU": Object.freeze({
    canonicalName: "Emerald Hills Golfland",
    canonicalUrl: "https://www.golfland.com/sanjose/",
    source: "https://www.golfland.com/sanjose/",
  }),
  ChIJWzt9SsAxjoARxdjosLm4AjE: Object.freeze({
    canonicalName: "MiMi's Kitchen",
    canonicalUrl: "https://order.online/store/mimi-s-kitchen-blossom-hill-rd-25105409",
    aliases: Object.freeze(["mimi's kitchen"]),
    source: "https://order.online/store/mimi-s-kitchen-blossom-hill-rd-25105409",
  }),
  ChIJuZpNGzXLj4ARIrlguZcNUOc: Object.freeze({
    canonicalName: "Rose Garden Farmers' Market",
    canonicalUrl: "https://www.wcfma.org/rose-garden/",
    aliases: Object.freeze(["rose garden farmer's market", "rose garden farmers' market"]),
    source: "https://www.wcfma.org/rose-garden/",
  }),
  ChIJUVuaM6zLj4ARoQSjNyb1ebQ: Object.freeze({
    canonicalName: "de Saisset Museum",
    canonicalUrl: "https://www.scu.edu/desaisset/",
    aliases: Object.freeze(["de saisset museum"]),
    urlIncludes: Object.freeze(["/de-saisset/", "/desaisset/"]),
    temporarilyUnavailable: true,
    reviewOn: "2026-09-01",
    reason: "The museum's official site says its galleries are closed and will reopen in September 2026.",
    source: "https://www.scu.edu/desaisset/",
  }),
  "ChIJ924cgmrNj4AR_zzWa-nJdVQ": Object.freeze({
    aliases: Object.freeze(["jackie's place - north"]),
    temporarilyUnavailable: true,
    reviewOn: "2026-12-03",
    reason: "Visit San Jose lists the North First Street location as temporarily closed and directs diners to the South First Street location.",
    source: "https://www.sanjose.org/listings/jackies-place-north",
  }),
});

function barePlaceId(value) {
  const raw = typeof value === "object" && value ? value.id : value;
  return String(raw || "").replace(/^place:/, "");
}

export function getPlaceEditorialOverride(value) {
  return PLACE_EDITORIAL_OVERRIDES[barePlaceId(value)] || null;
}

export function applyPlaceEditorialOverride(place) {
  const override = getPlaceEditorialOverride(place);
  if (!override) return place;
  return {
    ...place,
    ...(override.canonicalName ? { name: override.canonicalName } : {}),
    ...(override.canonicalUrl ? { url: override.canonicalUrl } : {}),
    ...(override.hoursVaryWithDaylight ? { hours: null } : {}),
  };
}

export function isPlaceTemporarilyUnavailable(value) {
  const direct = getPlaceEditorialOverride(value);
  if (direct?.temporarilyUnavailable === true) return true;
  if (!value || typeof value !== "object") return false;

  const names = [value.name, value.venue]
    .filter(Boolean)
    .map((candidate) => String(candidate).trim().toLowerCase());
  const urls = [value.url, value.mapsUrl]
    .filter(Boolean)
    .map((candidate) => String(candidate).toLowerCase());

  return Object.values(PLACE_EDITORIAL_OVERRIDES).some((override) => {
    if (override.temporarilyUnavailable !== true) return false;
    if (override.aliases?.some((alias) => names.includes(alias))) return true;
    return override.urlIncludes?.some((fragment) =>
      urls.some((candidate) => candidate.includes(fragment)),
    ) === true;
  });
}
