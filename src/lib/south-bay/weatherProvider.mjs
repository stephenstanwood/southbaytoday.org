// ---------------------------------------------------------------------------
// Canonical weather source for South Bay Today — NWS primary, Open-Meteo fallback.
//
// EVERY reader-facing temperature must come through this module. Plain .mjs on
// purpose: imported by both Astro API routes (weather.ts, plan-day.ts) and Node
// scripts on the Mini (scripts/newsletter/lib.mjs).
//
// Why NWS is primary (do not flip this without fresh three-way evidence):
// - May 2026 heat event: Open-Meteo said 99° when NWS said 93°; reality ~90-91°.
//   Site switched to NWS (PR #32) but the newsletter and plan-day kept private
//   Open-Meteo fetchers and spent two months telling readers it was 6-8° hotter
//   than every forecast they compared against.
// - 2026-07-14, measured live: Open-Meteo 101.3° / NWS 93° / Google 92°. The
//   morning email (Open-Meteo) said 99°.
// - An unmerged branch (claude/south-bay-weather-accuracy-1xxbu1, 2026-06-22)
//   claimed the opposite — "NWS runs 5-10° hotter than Google" — and tried to
//   flip weather.ts back. That claim is contradicted by every measured
//   comparison; do not resurrect it. Any future provider change needs a logged
//   same-morning NWS vs Open-Meteo vs Google comparison in the commit message.
//
// weatherProvider.test.mjs enforces the invariant: no other file may fetch
// temperature fields from api.open-meteo.com (sun/UV-only calls are fine — NWS
// has no UV endpoint).
// ---------------------------------------------------------------------------

export const DEFAULT_WEATHER_LAT = 37.2872; // Campbell — same anchor as the site
export const DEFAULT_WEATHER_LON = -121.95;

const NWS_USER_AGENT = "(southbaytoday.org, hello@southbaytoday.org)";

// Warm-instance cache: lat/lon -> gridpoint forecast URL (stable per point).
const gridpointCache = new Map();

async function fetchJson(url, { headers = {}, timeoutMs = 4000, attempts = 2 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`${url.split("?")[0]} → ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function getGridpointForecastUrl(lat, lon) {
  const key = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  const cached = gridpointCache.get(key);
  if (cached) return cached;
  const data = await fetchJson(`https://api.weather.gov/points/${key}`, {
    headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
    timeoutMs: 3000,
  });
  const url = data?.properties?.forecast;
  if (!url) throw new Error("nws points missing forecast url");
  gridpointCache.set(key, url);
  return url;
}

// Map NWS shortForecast text to [emoji, normalized desc].
// Bias optimistic for South Bay marine-layer days: NWS often says "Patchy Fog
// then Sunny" — the fog burns off by midmorning, so show the all-day call.
export function shortForecastInfo(short) {
  const s = String(short || "").toLowerCase();
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
  return ["🌡", String(short || "")];
}

// NWS returns up to 14 periods (day + night × 7). Pair them into calendar days.
// Skip dates with only a night period (after ~6pm NWS drops "Today" and leads
// with "Tonight" — the day's high is past, so we drop it rather than show the
// night temp as a "high").
export function pairPeriodsByDate(periods, maxDays = 5) {
  const byDate = new Map();
  for (const p of periods) {
    const date = p.startTime.slice(0, 10); // YYYY-MM-DD in the period's local offset
    const slot = byDate.get(date) ?? {};
    if (p.isDaytime) slot.day = p;
    else slot.night = p;
    byDate.set(date, slot);
  }
  const out = [];
  for (const [date, { day, night }] of byDate) {
    if (!day) continue;
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
    if (out.length >= maxDays) break;
  }
  return out;
}

async function fetchNws(lat, lon, { days = 5 } = {}) {
  const gridUrl = await getGridpointForecastUrl(lat, lon);
  const data = await fetchJson(gridUrl, {
    headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
    timeoutMs: 3500,
  });
  const periods = data?.properties?.periods;
  if (!periods?.length) throw new Error("nws empty periods");
  const current = periods[0];
  const [cEmoji, cDesc] = shortForecastInfo(current.shortForecast);
  const weather = `${cEmoji} ${Math.round(current.temperature)}°F ${cDesc.toLowerCase()}`;
  const forecast = pairPeriodsByDate(periods, days);
  if (forecast.length === 0) throw new Error("nws forecast produced 0 days");
  return { provider: "nws", weather, forecast };
}

// Minimal WMO-code mapping for the fallback path only. The richer mappings in
// src/lib/aestheticWeather.ts stay for React components; this one just has to
// produce a sane emoji/desc if NWS is down.
const WMO_FALLBACK = {
  0: ["☀️", "Sunny"], 1: ["🌤", "Mostly sunny"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Cloudy"],
  45: ["🌫️", "Fog"], 48: ["🌫️", "Fog"],
  51: ["🌦", "Drizzle"], 53: ["🌦", "Drizzle"], 55: ["🌧", "Heavy drizzle"],
  61: ["🌧", "Rain"], 63: ["🌧", "Rain"], 65: ["🌧", "Heavy rain"],
  71: ["🌨", "Snow"], 73: ["🌨", "Snow"], 75: ["🌨", "Heavy snow"],
  80: ["🌦", "Rain showers"], 81: ["🌧", "Rain showers"], 82: ["⛈", "Heavy showers"],
  95: ["⛈", "Thunderstorms"], 96: ["⛈", "Thunderstorms"], 99: ["⛈", "Thunderstorms"],
};

function wmoFallbackInfo(code) {
  return WMO_FALLBACK[code] || ["🌡", "Unknown"];
}

async function fetchOpenMeteoFallback(lat, lon, { days = 5 } = {}) {
  const url = [
    `https://api.open-meteo.com/v1/forecast`,
    `?latitude=${lat}&longitude=${lon}`,
    `&current=temperature_2m,weather_code`,
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`,
    `&temperature_unit=fahrenheit`,
    `&timezone=America%2FLos_Angeles`,
    `&forecast_days=${days}`,
  ].join("");
  const data = await fetchJson(url, { timeoutMs: 4000 });
  const temp = Math.round(data.current.temperature_2m);
  const [cEmoji, cDesc] = wmoFallbackInfo(data.current.weather_code);
  const weather = `${cEmoji} ${temp}°F ${cDesc.toLowerCase()}`;
  const { time, weather_code, temperature_2m_max, temperature_2m_min, precipitation_probability_max } = data.daily;
  const forecast = time.map((date, i) => {
    const [emoji, desc] = wmoFallbackInfo(weather_code[i]);
    return {
      date,
      emoji,
      desc,
      high: Math.round(temperature_2m_max[i]),
      low: Math.round(temperature_2m_min[i]),
      rainPct: precipitation_probability_max[i] ?? 0,
    };
  });
  return { provider: "open-meteo", weather, forecast };
}

/**
 * The one entry point. NWS primary; Open-Meteo only if NWS errors (after retry).
 * Returns { provider, weather, forecast: [{date, emoji, desc, high, low, rainPct}] }.
 * `weather` is a current-conditions one-liner built from the leading NWS period —
 * note that before ~6pm that period's temperature is the DAY'S FORECAST HIGH,
 * not a live thermometer reading. Don't present it as "right now".
 */
export async function fetchForecast(lat = DEFAULT_WEATHER_LAT, lon = DEFAULT_WEATHER_LON, opts = {}) {
  try {
    return await fetchNws(lat, lon, opts);
  } catch (nwsErr) {
    console.warn(`⚠️  weatherProvider: NWS failed (${nwsErr?.message}) — falling back to Open-Meteo. ` +
      `Heads up: Open-Meteo runs 5-8°F hot for South Bay heat events.`);
    return await fetchOpenMeteoFallback(lat, lon, opts);
  }
}

/** True if this desc/rainPct combination reads as a wet day. */
export function isRainyDay(desc, rainPct) {
  return (rainPct ?? 0) >= 40 || /rain|shower|storm|drizzle|snow/i.test(String(desc || ""));
}
