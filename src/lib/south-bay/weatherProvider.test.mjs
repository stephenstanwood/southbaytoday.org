import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { shortForecastInfo, pairPeriodsByDate, fetchForecast } from "./weatherProvider.mjs";

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
  }, () => fetchForecast(40.0001, -120.0001));
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
  }, () => fetchForecast(40.0002, -120.0002));
  assert.equal(result.provider, "nws");
  assert.equal(pointsCalls, 2);
});

test("fetchForecast: falls back to Open-Meteo only when NWS is down", async () => {
  const result = await withMockFetch(async (url) => {
    const u = String(url);
    if (u.includes("api.weather.gov")) return { ok: false, status: 503, json: async () => ({}) };
    if (u.includes("api.open-meteo.com")) return OM_FORECAST;
    throw new Error(`unexpected fetch: ${url}`);
  }, () => fetchForecast(40.0003, -120.0003));
  assert.equal(result.provider, "open-meteo");
  assert.equal(result.forecast[0].high, 101);
});

test("fetchForecast: rejects when both providers fail (callers catch → null weather)", async () => {
  await assert.rejects(
    withMockFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }),
      () => fetchForecast(40.0004, -120.0004))
  );
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
      `Open-Meteo runs 5-8°F hot for South Bay — route temps through ${CANONICAL} (NWS primary). ` +
      `See the decision record at the top of that file.`
  );
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
      `${rel} no longer imports weatherProvider.mjs — reader-facing temps must come from the canonical NWS-primary module`
    );
  }
});
