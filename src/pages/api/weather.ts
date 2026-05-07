export const prerender = false;
import type { APIRoute } from "astro";
import { wmoInfo, forecastEmoji, DEFAULT_WEATHER_LAT, DEFAULT_WEATHER_LON } from "../../lib/aestheticWeather";
import { CITY_MAP } from "../../lib/south-bay/cities";
import type { City } from "../../lib/south-bay/types";
import { rateLimit, rateLimitResponse } from "../../lib/rateLimit";
import { okJson } from "../../lib/apiHelpers";

/**
 * Weather proxy for South Bay Today.
 * Primary: NOAA / National Weather Service (api.weather.gov) — authoritative US forecasts, no key.
 * Fallback: Open-Meteo — used only if NWS errors. NWS skews ~5° cooler than Open-Meteo for South Bay heat events; we trust NWS.
 * Returns current conditions + 5-day daily forecast. Cached 30 min via CDN.
 */

const NWS_USER_AGENT = "(southbaytoday.org, hello@southbaytoday.org)";

interface DailyForecast {
  date: string;
  emoji: string;
  desc: string;
  high: number;
  low: number;
  rainPct: number;
}

interface NwsPeriod {
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  shortForecast: string;
  probabilityOfPrecipitation?: { value: number | null };
}

const gridpointCache = new Map<string, string>();

async function getGridpointForecastUrl(lat: number, lon: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = gridpointCache.get(key);
  if (cached) return cached;
  const res = await fetch(`https://api.weather.gov/points/${key}`, {
    headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`nws points ${res.status}`);
  const data = await res.json();
  const url = data?.properties?.forecast as string | undefined;
  if (!url) throw new Error("nws points missing forecast url");
  gridpointCache.set(key, url);
  return url;
}

// Map NWS shortForecast text to [emoji, normalized desc].
// Bias optimistic for South Bay marine-layer days: NWS often says "Patchy Fog then Sunny" —
// the fog burns off by midmorning, so we show the all-day call (sunny) rather than the morning hour.
function shortForecastInfo(short: string): [string, string] {
  const s = short.toLowerCase();
  // Real precipitation wins outright.
  if (s.includes("thunderstorm")) return ["⛈", "Thunderstorms"];
  if (s.includes("snow") || s.includes("flurries") || s.includes("sleet")) return ["🌨", "Snow"];
  if (s.includes("heavy rain") || s.includes("heavy showers")) return ["🌧", "Heavy rain"];
  if (s.includes("rain") || s.includes("shower") || s.includes("drizzle")) return ["🌧", "Rain"];

  // Sky state — sunny/clear mentions trump fog & cloud cover ("Patchy Fog then Sunny" → sunny).
  const hasSunny = s.includes("sunny") || s.includes("clear");
  if (hasSunny) {
    if (s.includes("mostly sunny") || s.includes("mostly clear")) return ["🌤", "Mostly sunny"];
    if (s.includes("partly sunny")) return ["⛅", "Partly cloudy"];
    return ["☀️", "Sunny"];
  }

  if (s.includes("fog")) return ["🌫️", "Fog"];
  if (s.includes("partly cloudy")) return ["⛅", "Partly cloudy"];
  if (s.includes("mostly cloudy")) return ["⛅", "Mostly cloudy"];
  if (s.includes("cloudy") || s.includes("overcast")) return ["☁️", "Cloudy"];
  return ["🌡", short];
}

function pairPeriodsByDate(periods: NwsPeriod[]): DailyForecast[] {
  const byDate = new Map<string, { day?: NwsPeriod; night?: NwsPeriod }>();
  for (const p of periods) {
    const date = p.startTime.slice(0, 10); // YYYY-MM-DD in the period's local offset
    const slot = byDate.get(date) ?? {};
    if (p.isDaytime) slot.day = p;
    else slot.night = p;
    byDate.set(date, slot);
  }
  const out: DailyForecast[] = [];
  for (const [date, { day, night }] of byDate) {
    if (!day) continue; // skip dates with only a night period (e.g. "tonight" after ~6pm — today's high is past)
    const [emoji, desc] = shortForecastInfo(day.shortForecast);
    const rainPct = day.probabilityOfPrecipitation?.value ?? night?.probabilityOfPrecipitation?.value ?? 0;
    out.push({
      date,
      emoji,
      desc,
      high: Math.round(day.temperature),
      low: Math.round(night?.temperature ?? day.temperature),
      rainPct,
    });
    if (out.length >= 5) break;
  }
  return out;
}

async function fetchNws(lat: number, lon: number): Promise<{ weather: string; forecast: DailyForecast[] }> {
  const gridUrl = await getGridpointForecastUrl(lat, lon);
  const res = await fetch(gridUrl, {
    headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
    signal: AbortSignal.timeout(3500),
  });
  if (!res.ok) throw new Error(`nws forecast ${res.status}`);
  const data = await res.json();
  const periods = data?.properties?.periods as NwsPeriod[] | undefined;
  if (!periods?.length) throw new Error("nws empty periods");
  const current = periods[0];
  const [cEmoji, cDesc] = shortForecastInfo(current.shortForecast);
  const weather = `${cEmoji} ${Math.round(current.temperature)}°F ${cDesc.toLowerCase()}`;
  const forecast = pairPeriodsByDate(periods);
  if (forecast.length === 0) throw new Error("nws forecast produced 0 days");
  return { weather, forecast };
}

async function fetchOpenMeteo(lat: number, lon: number): Promise<{ weather: string; forecast: DailyForecast[] }> {
  const url = [
    `https://api.open-meteo.com/v1/forecast`,
    `?latitude=${lat}&longitude=${lon}`,
    `&current=temperature_2m,weather_code`,
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloud_cover_mean`,
    `&temperature_unit=fahrenheit`,
    `&timezone=America%2FLos_Angeles`,
    `&forecast_days=5`,
  ].join("");
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const data = await res.json();
  const temp = Math.round(data.current.temperature_2m);
  const code = data.current.weather_code as number;
  const [emoji, desc] = wmoInfo(code);
  const weather = `${emoji} ${temp}°F ${desc.toLowerCase()}`;
  const { time, weather_code, temperature_2m_max, temperature_2m_min, precipitation_probability_max, cloud_cover_mean } = data.daily;
  const forecast = (time as string[]).map((date: string, i: number) => {
    const rainPct = precipitation_probability_max[i] as number;
    const ccMean = cloud_cover_mean?.[i] as number | null | undefined;
    const [fe, fd] = forecastEmoji(weather_code[i] as number, ccMean, rainPct);
    return {
      date,
      emoji: fe,
      desc: fd,
      high: Math.round(temperature_2m_max[i] as number),
      low: Math.round(temperature_2m_min[i] as number),
      rainPct,
    };
  });
  return { weather, forecast };
}

export const GET: APIRoute = async ({ request, clientAddress }) => {
  if (!rateLimit(clientAddress)) return rateLimitResponse();

  const cityId = new URL(request.url).searchParams.get("city") as City | null;
  const cityConfig = cityId ? CITY_MAP[cityId] : null;
  const lat = cityConfig?.lat ?? DEFAULT_WEATHER_LAT;
  const lon = cityConfig?.lon ?? DEFAULT_WEATHER_LON;

  try {
    const result = await fetchNws(lat, lon);
    return okJson(result, { "Cache-Control": "public, s-maxage=1800, max-age=900" });
  } catch (nwsErr) {
    console.warn("nws weather failed, falling back to open-meteo:", nwsErr);
    try {
      const result = await fetchOpenMeteo(lat, lon);
      return okJson(result, { "Cache-Control": "public, s-maxage=1800, max-age=900" });
    } catch (omErr) {
      console.error("weather fetch error (both providers failed):", omErr);
      return okJson({ weather: null, forecast: null });
    }
  }
};
