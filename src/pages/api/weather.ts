export const prerender = false;
import type { APIRoute } from "astro";
import { fetchForecast, DEFAULT_WEATHER_LAT, DEFAULT_WEATHER_LON } from "../../lib/south-bay/weatherProvider.mjs";
import { CITY_MAP } from "../../lib/south-bay/cities";
import type { City } from "../../lib/south-bay/types";
import { rateLimit, rateLimitResponse } from "../../lib/rateLimit";
import { okJson } from "../../lib/apiHelpers";

/**
 * Weather proxy for South Bay Today — thin wrapper over the canonical
 * weatherProvider module (NWS primary, Open-Meteo fallback; see the decision
 * record in src/lib/south-bay/weatherProvider.mjs before touching providers).
 * Returns current conditions + 5-day daily forecast. Cached 30 min via CDN.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  if (!rateLimit(clientAddress)) return rateLimitResponse();

  const cityId = new URL(request.url).searchParams.get("city") as City | null;
  const cityConfig = cityId ? CITY_MAP[cityId] : null;
  const lat = cityConfig?.lat ?? DEFAULT_WEATHER_LAT;
  const lon = cityConfig?.lon ?? DEFAULT_WEATHER_LON;

  try {
    const { provider, weather, forecast } = await fetchForecast(lat, lon, { days: 5 });
    return okJson({ weather, forecast, provider }, { "Cache-Control": "public, s-maxage=1800, max-age=900" });
  } catch (err) {
    console.error("weather fetch error (both providers failed):", err);
    return okJson({ weather: null, forecast: null });
  }
};
