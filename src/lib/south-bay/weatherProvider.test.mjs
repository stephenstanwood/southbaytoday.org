import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  shortForecastInfo,
  pairPeriodsByDate,
  fetchForecast,
  googleConditionInfo,
  mapGoogleDays,
  summaryLine,
  resetWeatherCaches,
} from "./weatherProvider.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ── Unit: NWS text mapping ──────────────────────────────────────────────────

test("shortForecastInfo: fog burns off — sunny mention wins", () => {
  assert.equal(shortForecastInfo("Patchy Fog then Sunny")[1], "Sunny");
  assert.equal(shortForecastInfo("Areas of Fog then Mostly Sunny")[1], "Mostly sunny");
  assert.equal(shortForecastInfo("Patchy Fog")[1], "Fog");
});

test("shortForecastInfo: precipitation wins outright", () => {
  assert.equal(shortForecastInfo("Slight Chance Rain Showers then Sunny")[1], "Rain");
  assert.equal(shortForecastInfo("Thunderstorms")[1], "Thunderstorms");
});

// ── Unit: period pairing ────────────────────────────────────────────────────

const period = (startDate, isDaytime, temperature, shortForecast = "Sunny") => ({
  startTime: `${startDate}T${isDaytime ? "06" : "18"}:00:00-07:00`,
  isDaytime,
  temperature,
  shortForecast,
  probabilityOfPrecipitation: { value: 0 },
});

test("pairPeriodsByDate: pairs day high with night low", () => {
  const days = pairPeriodsByDate([
    period("2026-07-14", true, 93),
    period("2026-07-14", false, 65),
    period("2026-07-15", true, 90),
    period("2026-07-15", false, 60),
  ]);
  assert.equal(days.length, 2);
  assert.deepEqual([days[0].high, days[0].low], [93, 65]);
});

test("pairPeriodsByDate: drops a leading night-only date (evening 'Tonight')", () => {
  const days = pairPeriodsByDate([
    period("2026-07-14", false, 65),
    period("2026-07-15", true, 90),
    period("2026-07-15", false, 60),
  ]);
  assert.equal(days[0].date, "2026-07-15");
});

// ── Runtime: provider selection + fallback (mocked fetch) ───────────────────
// Distinct lat/lon per test — the module caches gridpoint URLs per point.

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const NWS_POINTS = (url) => jsonResponse({ properties: { forecast: `https://api.weather.gov/gridpoints/TEST/1,1/forecast?for=${encodeURIComponent(url)}` } });
const NWS_FORECAST = jsonResponse({
  properties: {
    periods: [
      { startTime: "2026-07-14T06:00:00-07:00", isDaytime: true, temperature: 93, shortForecast: "Sunny", probabilityOfPrecipitation: { value: 1 } },
      { startTime: "2026-07-14T18:00:00-07:00", isDaytime: false, temperature: 65, shortForecast: "Mostly Clear", probabilityOfPrecipitation: { value: 0 } },
    ],
  },
});
const OM_FORECAST = jsonResponse({
  current: { temperature_2m: 70.2, weather_code: 0 },
  daily: {
    time: ["2026-07-14"],
    weather_code: [0],
    temperature_2m_max: [101.3],
    temperature_2m_min: [64.2],
    precipitation_probability_max: [0],
  },
});

async function withMockFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("fetchForecast: uses NWS when healthy — Open-Meteo never called", async () => {
  const calls = [];
  const result = await withMockFetch(async (url) => {
    calls.push(String(url));
    if (String(url).includes("api.weather.gov/points")) return NWS_POINTS(url);
    if (String(url).includes("api.weather.gov/gridpoints")) return NWS_FORECAST;
    throw new Error(`unexpected fetch: ${url}`);
  }, () => fetchForecast(40.0001, -120.0001, { googleKey: "" }));
  assert.equal(result.provider, "nws");
  assert.equal(result.forecast[0].high, 93);
  assert.ok(calls.every((u) => !u.includes("open-meteo")), "open-meteo must not be called when NWS works");
});

test("fetchForecast: transient NWS failure is retried, not failed over", async () => {
  let pointsCalls = 0;
  const result = await withMockFetch(async (url) => {
    const u = String(url);
    if (u.includes("api.weather.gov/points")) {
      pointsCalls++;
      if (pointsCalls === 1) return { ok: false, status: 500, json: async () => ({}) };
      return NWS_POINTS(url);
    }
    if (u.includes("api.weather.gov/gridpoints")) return NWS_FORECAST;
    throw new Error(`unexpected fetch: ${url}`);
  }, () => fetchForecast(40.0002, -120.0002, { googleKey: "" }));
  assert.equal(result.provider, "nws");
  assert.equal(pointsCalls, 2);
});

test("fetchForecast: falls back to Open-Meteo only when NWS is down", async () => {
  const result = await withMockFetch(async (url) => {
    const u = String(url);
    if (u.includes("api.weather.gov")) return { ok: false, status: 503, json: async () => ({}) };
    if (u.includes("api.open-meteo.com")) return OM_FORECAST;
    throw new Error(`unexpected fetch: ${url}`);
  }, () => fetchForecast(40.0003, -120.0003, { googleKey: "" }));
  assert.equal(result.provider, "open-meteo");
  assert.equal(result.forecast[0].high, 101);
});

test("fetchForecast: rejects when both providers fail (callers catch → null weather)", async () => {
  await assert.rejects(
    withMockFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }),
      () => fetchForecast(40.0004, -120.0004, { googleKey: "" }))
  );
});

// ── Google (primary) ────────────────────────────────────────────────────────

const googleDay = (y, m, d, hi, lo, type = "CLEAR", text = "Sunny", rain = 0, unit = "FAHRENHEIT") => ({
  displayDate: { year: y, month: m, day: d },
  maxTemperature: { degrees: hi, unit },
  minTemperature: { degrees: lo, unit },
  daytimeForecast: {
    weatherCondition: { type, description: { text } },
    precipitation: { probability: { percent: rain } },
  },
});
const GOOGLE_DAYS = [
  googleDay(2026, 9, 22, 71.2, 55.1),
  googleDay(2026, 9, 23, 80.6, 55.8, "CLEAR", "Sunny"),
  googleDay(2026, 9, 24, 83.1, 57.2, "CLOUDY", "Cloudy"),
];
const GOOGLE_FORECAST = jsonResponse({ forecastDays: GOOGLE_DAYS });
// 10am and 8pm PT on 2026-09-22 (PDT, UTC-7).
const MORNING = new Date("2026-09-22T17:00:00Z");
const EVENING = new Date("2026-09-23T03:00:00Z");

test("googleConditionInfo: Google types land on the NWS vocabulary", () => {
  assert.deepEqual(googleConditionInfo("CLEAR"), ["☀️", "Sunny"]);
  assert.deepEqual(googleConditionInfo("MOSTLY_CLEAR"), ["🌤", "Mostly sunny"]);
  assert.equal(googleConditionInfo("PARTLY_CLOUDY")[1], "Partly cloudy");
  assert.equal(googleConditionInfo("SCATTERED_SHOWERS")[1], "Showers");
  assert.equal(googleConditionInfo("HEAVY_RAIN")[1], "Heavy rain");
  assert.equal(googleConditionInfo("SCATTERED_THUNDERSTORMS")[1], "Thunderstorms");
  // Unknown type falls back to the description text.
  assert.equal(googleConditionInfo("SOMETHING_NEW", "Mostly Sunny")[1], "Mostly sunny");
});

test("mapGoogleDays: keeps today before 6pm PT, leads with tomorrow after", () => {
  const morning = mapGoogleDays(GOOGLE_DAYS, { now: MORNING });
  assert.equal(morning[0].date, "2026-09-22");
  assert.deepEqual([morning[1].high, morning[1].low], [81, 56]);
  const evening = mapGoogleDays(GOOGLE_DAYS, { now: EVENING });
  assert.equal(evening[0].date, "2026-09-23");
  assert.equal(evening.length, 2);
});

test("mapGoogleDays: converts a Celsius payload to °F", () => {
  const [day] = mapGoogleDays([googleDay(2026, 9, 23, 27, 13, "CLEAR", "Sunny", 0, "CELSIUS")], { now: MORNING });
  assert.deepEqual([day.high, day.low], [81, 55]);
});

test("summaryLine: says which day it describes — never a fake 'current' temp", () => {
  const today = [{ date: "2026-09-22", emoji: "☀️", desc: "Sunny", high: 71 }];
  const tomorrow = [{ date: "2026-09-23", emoji: "☀️", desc: "Sunny", high: 81 }];
  assert.equal(summaryLine(today, MORNING), "☀️ Today: sunny, high 71°");
  assert.equal(summaryLine(tomorrow, EVENING), "☀️ Tomorrow: sunny, high 81°");
});

test("fetchForecast: Google is primary when a key is set — NWS and Open-Meteo never called", async () => {
  resetWeatherCaches();
  const calls = [];
  const result = await withMockFetch(async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith("https://weather.googleapis.com/v1/forecast/days:lookup")) return GOOGLE_FORECAST;
    throw new Error(`unexpected fetch: ${u}`);
  }, () => fetchForecast(40.0005, -120.0005, { googleKey: "test-key", now: EVENING }));
  assert.equal(result.provider, "google");
  assert.deepEqual([result.forecast[0].date, result.forecast[0].high], ["2026-09-23", 81]);
  assert.equal(result.weather, "☀️ Tomorrow: sunny, high 81°");
  assert.ok(calls.every((u) => !u.includes("api.weather.gov") && !u.includes("open-meteo")));
  assert.ok(calls[0].includes("unitsSystem=IMPERIAL"), "must request °F");
});

test("fetchForecast: Google answers are memoized per point (quota guard)", async () => {
  resetWeatherCaches();
  let googleCalls = 0;
  await withMockFetch(async (url) => {
    if (String(url).includes("weather.googleapis.com")) { googleCalls++; return GOOGLE_FORECAST; }
    throw new Error(`unexpected fetch: ${url}`);
  }, async () => {
    await fetchForecast(40.0006, -120.0006, { googleKey: "test-key", now: MORNING });
    await fetchForecast(40.0006, -120.0006, { googleKey: "test-key", now: MORNING });
  });
  assert.equal(googleCalls, 1);
});

test("fetchForecast: Google 403 falls back to NWS, no retry, key never logged", async () => {
  resetWeatherCaches();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  let googleCalls = 0;
  try {
    const result = await withMockFetch(async (url) => {
      const u = String(url);
      if (u.includes("weather.googleapis.com")) {
        googleCalls++;
        return { ok: false, status: 403, json: async () => ({}) };
      }
      if (u.includes("api.weather.gov/points")) return NWS_POINTS(url);
      if (u.includes("api.weather.gov/gridpoints")) return NWS_FORECAST;
      throw new Error(`unexpected fetch: ${u}`);
    }, () => fetchForecast(40.0007, -120.0007, { googleKey: "SECRET-KEY-123" }));
    assert.equal(result.provider, "nws");
    assert.equal(googleCalls, 1, "a 4xx must not be retried");
    assert.ok(warnings.length > 0, "fallback must warn");
    assert.ok(warnings.every((w) => !w.includes("SECRET-KEY-123")), "API key leaked into a log line");
  } finally {
    console.warn = originalWarn;
    resetWeatherCaches();
  }
});

// ── Invariant: no reader-facing temps from Open-Meteo outside this module ───
// History: the site switched to NWS in May 2026 because Open-Meteo runs 5-8°F
// hot for South Bay heat events, but the newsletter and plan-day kept private
// Open-Meteo fetchers and kept emailing "99°" on 92° days for two months.
// This scan fails if anyone reintroduces a direct Open-Meteo temperature fetch
// anywhere in src/ or scripts/. Sun/UV-only Open-Meteo calls (SunUvCard) are
// allowed — NWS has no UV endpoint.

const SCAN_DIRS = ["src", "scripts"];
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|astro)$/;
const CANONICAL = "src/lib/south-bay/weatherProvider.mjs";
const THIS_TEST = "src/lib/south-bay/weatherProvider.test.mjs";

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SCAN_EXT.test(name)) yield path;
  }
}

test("only weatherProvider.mjs may fetch temperatures from Open-Meteo", () => {
  const offenders = [];
  for (const dir of SCAN_DIRS) {
    for (const path of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, path);
      if (rel === CANONICAL || rel === THIS_TEST) continue;
      const src = readFileSync(path, "utf8");
      if (src.includes("api.open-meteo.com") && /temperature_2m/.test(src)) {
        offenders.push(rel);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Open-Meteo temperature fetch outside the canonical weather provider: ${offenders.join(", ")}. ` +
      `Open-Meteo runs 5-8°F hot for South Bay — route temps through ${CANONICAL} (Google primary). ` +
      `See the decision record at the top of that file.`
  );
});

test("only weatherProvider.mjs may fetch forecasts from Google or NWS", () => {
  // A second forecast fetcher is how every past "fix" got undone: the site
  // switched sources while a private fetcher kept serving the old numbers.
  const FORECAST_ENDPOINTS = [
    "weather.googleapis.com",
    "api.weather.gov/points",
    "api.weather.gov/gridpoints",
  ];
  const offenders = [];
  for (const dir of SCAN_DIRS) {
    for (const path of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, path);
      if (rel === CANONICAL || rel === THIS_TEST) continue;
      const src = readFileSync(path, "utf8");
      if (FORECAST_ENDPOINTS.some((e) => src.includes(e))) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], `forecast fetch outside ${CANONICAL}: ${offenders.join(", ")}`);
});

test("provider chain stays Google → NWS → Open-Meteo", () => {
  const src = readFileSync(join(ROOT, CANONICAL), "utf8");
  const body = src.slice(src.indexOf("export async function fetchForecast"));
  const g = body.indexOf("fetchGoogle(");
  const n = body.indexOf("fetchNws(");
  const o = body.indexOf("fetchOpenMeteoFallback(");
  assert.ok(g > -1 && n > g && o > n,
    "fetchForecast must try Google, then NWS, then Open-Meteo — read the decision record before reordering");
});

test("known temp consumers import the canonical weather provider", () => {
  for (const rel of [
    "scripts/newsletter/lib.mjs",
    "src/pages/api/weather.ts",
    "src/pages/api/plan-day.ts",
  ]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    assert.ok(
      src.includes("weatherProvider.mjs"),
      `${rel} no longer imports weatherProvider.mjs — reader-facing temps must come from the canonical Google-primary module`
    );
  }
});
