export const prerender = false;
import type { APIRoute } from "astro";
import { fetchForecast, DEFAULT_WEATHER_LAT, DEFAULT_WEATHER_LON } from "../../lib/south-bay/weatherProvider.mjs";
import { CITY_MAP } from "../../lib/south-bay/cities";
import type { City } from "../../lib/south-bay/types";
import { rateLimit, rateLimitResponse } from "../../lib/rateLimit";
import { okJson } from "../../lib/apiHelpers";
import { weatherApiKey } from "../../lib/south-bay/weatherKey";

/**
 * Weather proxy for South Bay Today — thin wrapper over the canonical
 * weatherProvider module (Google → NWS → Open-Meteo; read the decision record
 * in src/lib/south-bay/weatherProvider.mjs before touching providers).
 * Returns a lead-day summary line + 5-day daily forecast + which provider
 * answered. CDN-cached for an hour per city: daily highs barely move within
 * the hour, and it keeps Google's metered calls inside the free tier.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  if (!rateLimit(clientAddress)) return rateLimitResponse();

  const cityId = new URL(request.url).searchParams.get("city") as City | null;
  const cityConfig = cityId ? CITY_MAP[cityId] : null;
  const lat = cityConfig?.lat ?? DEFAULT_WEATHER_LAT;
  const lon = cityConfig?.lon ?? DEFAULT_WEATHER_LON;

  try {
    const { provider, weather, forecast } = await fetchForecast(lat, lon, { days: 5, googleKey: weatherApiKey() });
    // A fallback answer is cached briefly so the site snaps back to Google
    // within minutes of the key/API recovering.
    const sMaxAge = provider === "google" ? 3600 : 600;
    return okJson(
      { weather, forecast, provider },
      { "Cache-Control": `public, max-age=900, s-maxage=${sMaxAge}, stale-while-revalidate=1800` },
    );
  } catch (err) {
    console.error("weather fetch error (every provider failed):", err);
    return okJson({ weather: null, forecast: null });
  }
};
