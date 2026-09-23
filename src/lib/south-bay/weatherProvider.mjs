// ---------------------------------------------------------------------------
// Canonical weather source for South Bay Today.
// Chain: Google Weather API → NWS → Open-Meteo (last resort).
//
// EVERY reader-facing temperature must come through this module. Plain .mjs on
// purpose: imported by both Astro API routes (weather.ts, plan-day.ts) and Node
// scripts on the Mini (scripts/newsletter/lib.mjs).
//
// Why Google is primary — read this before touching the provider order:
// The yardstick readers (and Stephen) check SBT against is Google's forecast.
// For five months we kept "fixing hot temps" by swapping to whichever FREE
// provider happened to agree with Google that week, and every swap broke the
// next time the pattern changed:
// - May 2026: Open-Meteo 99° vs NWS 93° vs reality ~90-91° → switched to NWS.
// - 2026-07-14: Open-Meteo 101.3° / NWS 93° / Google 92° → NWS "confirmed".
// - 2026-06-22: an unmerged branch measured NWS 5-10° over Google. It wasn't
//   wrong — it was measuring a different weather pattern.
// - 2026-09-22 (Campbell, same evening): Google Wed 81° / Thu 83°;
//   NWS 88° / 89°; Open-Meteo best_match 87° / 87°; ECMWF 88° / 91°;
//   NBM 86° / 87°. Every model-based feed agreed with each other and
//   disagreed with Google by 6-7°. Over the prior 30 days NWS day-of highs
//   averaged +1.1° vs the SJC/RHV observed mean (MAE 2.4°), but ran +1.5° to
//   +7° every day of the final week.
// No free feed tracks Google — its forecast is its own product, not a relay of
// NWS or the global models — so we source Google directly. NWS stays as
// the fallback (no key, or Google down); Open-Meteo is last resort only
// because it runs 5-8° hot in South Bay heat events.
//
// Do NOT reorder the chain or add a second "better" source because one day's
// comparison looks off. If the site ever disagrees with google.com, first check
// the `provider` field on /api/weather — a non-"google" value means the key or
// the Weather API is broken, and THAT is the bug to fix.
//
// Cost: Google Maps Platform "Weather Usage" SKU — 10,000 free calls/month,
// then $0.15 per 1,000. /api/weather is CDN-cached for an hour per city and
// this module memoizes per warm instance, which keeps SBT inside the free tier.
//
// weatherProvider.test.mjs enforces: no other file may fetch forecast
// temperatures from Google, NWS, or Open-Meteo (sun/UV-only Open-Meteo calls
// like SunUvCard are fine), and the chain order stays Google → NWS → Open-Meteo.
// ---------------------------------------------------------------------------

export const DEFAULT_WEATHER_LAT = 37.2872; // Campbell — same anchor as the site
export const DEFAULT_WEATHER_LON = -121.95;

const NWS_USER_AGENT = "(southbaytoday.org, hello@southbaytoday.org)";

// Warm-instance cache: lat/lon -> gridpoint forecast URL (stable per point).
const gridpointCache = new Map();

// Error messages carry only the URL path — the Google key rides in the query
// string and must never reach a log line.
async function fetchJson(url, { headers = {}, timeoutMs = 4000, attempts = 2 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        const err = new Error(`${url.split("?")[0]} → ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      // A 4xx (bad key, API disabled, bad request) won't fix itself on retry.
      if (err?.status >= 400 && err?.status < 500 && err.status !== 429) break;
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
  const forecast = pairPeriodsByDate(periods, days);
  if (forecast.length === 0) throw new Error("nws forecast produced 0 days");
  return { provider: "nws", weather: summaryLine(forecast), forecast };
}

// ── Google Weather API (primary) ────────────────────────────────────────────

const GOOGLE_DAYS_URL = "https://weather.googleapis.com/v1/forecast/days:lookup";
// After this PT hour today's high is behind us, so the forecast leads with
// tomorrow — the same shape NWS produces once it switches to "Tonight".
export const EVENING_CUTOFF_HOUR_PT = 18;
const GOOGLE_CACHE_TTL_MS = 30 * 60 * 1000;
const GOOGLE_COOLDOWN_MS = 10 * 60 * 1000;

// Warm-instance memo of raw Google payloads (lat/lon → {at, days}). Raw, not
// mapped, so the evening cutoff is applied against the clock at read time.
const googleCache = new Map();
let googleCooldownUntil = 0;

/** Test hook: forget memoized Google payloads and any cooldown. */
export function resetWeatherCaches() {
  googleCache.clear();
  googleCooldownUntil = 0;
}

function googleKeyFromEnv() {
  const env = typeof process !== "undefined" && process?.env ? process.env : {};
  return env.GOOGLE_WEATHER_API_KEY || env.GOOGLE_PLACES_API_KEY || "";
}

function ptClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

// Google condition types → [emoji, desc], matching the NWS vocabulary above so
// downstream copy ("Sunny", "Mostly sunny", "Rain") reads the same either way.
export function googleConditionInfo(type, text) {
  const t = String(type || "").toUpperCase();
  if (t.includes("THUNDER")) return ["⛈", "Thunderstorms"];
  if (t.includes("SNOW") || t.includes("HAIL")) return ["🌨", "Snow"];
  if (/HEAVY_RAIN|MODERATE_TO_HEAVY_RAIN|RAIN_PERIODICALLY_HEAVY/.test(t)) return ["🌧", "Heavy rain"];
  if (t === "CHANCE_OF_SHOWERS" || t === "LIGHT_RAIN_SHOWERS" || t === "SCATTERED_SHOWERS") return ["🌦", "Showers"];
  if (t.includes("RAIN") || t.includes("SHOWER")) return ["🌧", "Rain"];
  if (t === "CLEAR") return ["☀️", "Sunny"];
  if (t === "MOSTLY_CLEAR") return ["🌤", "Mostly sunny"];
  if (t === "PARTLY_CLOUDY") return ["⛅", "Partly cloudy"];
  if (t === "MOSTLY_CLOUDY") return ["⛅", "Mostly cloudy"];
  if (t === "CLOUDY") return ["☁️", "Cloudy"];
  if (t === "WINDY") return ["💨", "Windy"];
  return shortForecastInfo(text);
}

function toFahrenheit(temp) {
  const deg = temp?.degrees;
  if (!Number.isFinite(deg)) return null;
  return temp.unit === "CELSIUS" ? deg * 9 / 5 + 32 : deg;
}

export function mapGoogleDays(forecastDays, { maxDays = 5, now = new Date() } = {}) {
  const { date: today, hour } = ptClock(now);
  const out = [];
  for (const day of forecastDays || []) {
    const dd = day?.displayDate;
    if (!dd?.year) continue;
    const date = `${dd.year}-${String(dd.month).padStart(2, "0")}-${String(dd.day).padStart(2, "0")}`;
    if (date < today) continue;
    if (date === today && hour >= EVENING_CUTOFF_HOUR_PT) continue;
    const high = toFahrenheit(day.maxTemperature);
    const low = toFahrenheit(day.minTemperature);
    if (high === null || low === null) continue;
    const cond = day.daytimeForecast?.weatherCondition;
    const [emoji, desc] = googleConditionInfo(cond?.type, cond?.description?.text);
    const rainPct =
      day.daytimeForecast?.precipitation?.probability?.percent ??
      day.nighttimeForecast?.precipitation?.probability?.percent ??
      0;
    out.push({ date, emoji, desc, high: Math.round(high), low: Math.round(low), rainPct });
    if (out.length >= maxDays) break;
  }
  return out;
}

async function fetchGoogle(lat, lon, key, { days = 5, now = new Date() } = {}) {
  if (Date.now() < googleCooldownUntil) throw new Error("google in cooldown after a hard failure");
  const cacheKey = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  let cached = googleCache.get(cacheKey);
  if (!cached || Date.now() - cached.at > GOOGLE_CACHE_TTL_MS) {
    // One extra day so the evening cutoff still leaves `days` days.
    const want = Math.min(10, days + 1);
    const url = `${GOOGLE_DAYS_URL}?key=${encodeURIComponent(key)}` +
      `&location.latitude=${lat}&location.longitude=${lon}` +
      `&days=${want}&pageSize=${want}&unitsSystem=IMPERIAL`;
    let data;
    try {
      data = await fetchJson(url, { timeoutMs: 3500 });
    } catch (err) {
      // Bad key / API disabled: stop paying the round trip on every request.
      if (err?.status >= 400 && err?.status < 500 && err.status !== 429) {
        googleCooldownUntil = Date.now() + GOOGLE_COOLDOWN_MS;
      }
      throw err;
    }
    if (!data?.forecastDays?.length) throw new Error("google empty forecastDays");
    cached = { at: Date.now(), days: data.forecastDays };
    googleCache.set(cacheKey, cached);
  }
  const forecast = mapGoogleDays(cached.days, { maxDays: days, now });
  if (forecast.length === 0) throw new Error("google forecast produced 0 days");
  return { provider: "google", weather: summaryLine(forecast, now), forecast };
}

// One honest line for the lead forecast day. Never a pseudo "current" temp —
// none of the providers give a live reading on this path.
export function summaryLine(forecast, now = new Date()) {
  const first = forecast?.[0];
  if (!first) return null;
  const when = first.date === ptClock(now).date ? "Today" : "Tomorrow";
  return `${first.emoji} ${when}: ${String(first.desc).toLowerCase()}, high ${first.high}°`;
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
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`,
    `&temperature_unit=fahrenheit`,
    `&timezone=America%2FLos_Angeles`,
    `&forecast_days=${days}`,
  ].join("");
  const data = await fetchJson(url, { timeoutMs: 4000 });
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
  return { provider: "open-meteo", weather: summaryLine(forecast), forecast };
}

/**
 * The one entry point. Google → NWS → Open-Meteo; each step only on failure.
 * Returns { provider, weather, forecast: [{date, emoji, desc, high, low, rainPct}] }.
 * `weather` is a one-line summary of the lead forecast day ("Today: sunny,
 * high 81°"), not a live reading.
 *
 * opts.googleKey overrides the env key ("" disables Google — tests use this).
 * opts.now pins the clock (tests).
 */
export async function fetchForecast(lat = DEFAULT_WEATHER_LAT, lon = DEFAULT_WEATHER_LON, opts = {}) {
  const googleKey = opts.googleKey ?? googleKeyFromEnv();
  if (googleKey) {
    try {
      return await fetchGoogle(lat, lon, googleKey, opts);
    } catch (googleErr) {
      console.warn(`⚠️  weatherProvider: Google failed (${googleErr?.message}) — falling back to NWS. ` +
        `The site will drift from google.com until this is fixed.`);
    }
  }
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
