// Offline invariants on the projected-market config in generate-events.mjs.
//
// These markets are the one event source the pipeline projects forward instead
// of scraping per-occurrence, so a config typo doesn't fail loudly — it just
// silently publishes the wrong thing, or nothing. Both happened:
//
//   * Mountain View and Santana Row went dark for weeks because their evidence
//     patterns had drifted off the organizer pages' wording. sourceHealth still
//     showed the farmers-market source as "ok" the whole time, because the
//     other five markets were fine.
//   * Mountain View publishes six Sundays where the market moves to the Hope
//     St. lots. A relocation keyed to a date that isn't the market's weekday
//     would never fire and nobody would know.
//
// Nothing here touches the network: verifyMarketScheduleSource still has to
// confirm each page at run time, and these checks only guarantee the config it
// is handed is internally coherent.

import assert from "node:assert/strict";
import test from "node:test";

import { FARMERS_MARKETS, fetchFarmersMarketEvents } from "../generate-events.mjs";

test("every projected market carries a complete, verifiable config", () => {
  assert.ok(FARMERS_MARKETS.length > 0);
  for (const m of FARMERS_MARKETS) {
    assert.ok(m.title, "market needs a title");
    assert.match(m.url, /^https:\/\//, `${m.title}: source must be https`);
    assert.ok(Number.isInteger(m.day) && m.day >= 0 && m.day <= 6, `${m.title}: bad weekday`);
    assert.ok(m.city, `${m.title}: needs a city`);
    assert.ok(m.venue && m.address, `${m.title}: needs a venue and address`);
    // verifyMarketScheduleSource refuses to confirm on fewer than three, so a
    // market configured with two would be permanently suppressed.
    assert.ok(
      Array.isArray(m.evidencePatterns) && m.evidencePatterns.length >= 3,
      `${m.title}: needs at least 3 evidence patterns`,
    );
    for (const p of m.evidencePatterns) {
      assert.ok(p instanceof RegExp, `${m.title}: evidence patterns must be regexes`);
    }
    const [from, to] = m.season;
    assert.ok(from >= 1 && to <= 12 && from <= to, `${m.title}: bad season window`);
  }
});

test("date-keyed exceptions land on the market's own weekday", () => {
  const weekdayOf = (iso) => new Date(`${iso}T12:00:00-07:00`).getDay();
  for (const m of FARMERS_MARKETS) {
    for (const date of m.excludedDates ?? []) {
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${m.title}: excludedDates must be ISO`);
      assert.equal(weekdayOf(date), m.day, `${m.title}: excluded ${date} is not a market day`);
    }
    for (const [date, alt] of Object.entries(m.relocations ?? {})) {
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${m.title}: relocations must be keyed by ISO date`);
      assert.equal(weekdayOf(date), m.day, `${m.title}: relocation ${date} is not a market day`);
      assert.ok(alt.venue, `${m.title}: relocation ${date} needs a venue`);
      assert.ok(alt.address, `${m.title}: relocation ${date} needs an address`);
      assert.notEqual(alt.venue, m.venue, `${m.title}: relocation ${date} repeats the usual venue`);
    }
  }
});

test("Mountain View's published alternate-location Sundays are all configured", () => {
  const mv = FARMERS_MARKETS.find((m) => m.title === "Mountain View Farmers Market");
  assert.ok(mv, "Mountain View market is configured");
  // The six "Market Relocates" notices on the CAFMA page as of 2026-09-04.
  assert.deepEqual(Object.keys(mv.relocations).sort(), [
    "2026-09-20", "2026-09-27", "2026-10-04",
    "2026-11-08", "2026-11-29", "2026-12-13",
  ]);
});

test("Santa Clara suppresses the organizer's Parade of Champions closure", () => {
  const market = FARMERS_MARKETS.find((m) => m.title === "Santa Clara Farmers Market");
  assert.ok(market);
  assert.ok(market.excludedDates.includes("2026-10-03"));
});

const santanaRow = FARMERS_MARKETS.find((m) => m.title === "Santana Row Farmers Market");
const scheduleHtml = "Santana Row Farmers Market, every Wednesday, 4pm–8pm through September";

// Exercise the real adapter and verifier without contacting organizers or
// Discord. Record the side effects as well as the published dates: an empty
// result alone would miss the original off-season alert regression.
async function collectMarket(today, { market = santanaRow, status = 200, html = scheduleHtml } = {}) {
  const requests = [];
  const alerts = [];
  const events = await fetchFarmersMarketEvents({
    today,
    markets: [market],
    fetchImpl: async (url) => {
      requests.push(url);
      return new Response(html, { status });
    },
    notify: async (alert) => { alerts.push(alert); },
  });
  return { events, requests, alerts };
}

test("expired Santana Row season neither verifies nor alerts, including the following year", async () => {
  for (const today of ["2026-10-01", "2027-07-28"]) {
    const result = await collectMarket(today, { status: 500 });
    assert.deepEqual(result, { events: [], requests: [], alerts: [] }, today);
  }
});

test("a season outside the 90-day window is not verified or escalated", async () => {
  // July 22 is 91 days after April 22, outside the inclusive 90-day horizon.
  const result = await collectMarket("2026-04-22", { status: 500 });
  assert.deepEqual(result, { events: [], requests: [], alerts: [] });
  // Also exercise the month bounds without explicit start/end dates.
  const { startDate, endDate, ...seasonOnly } = santanaRow;
  assert.deepEqual(await collectMarket("2026-10-01", { market: seasonOnly, status: 500 }), {
    events: [], requests: [], alerts: [],
  });
});

test("an upcoming season is verified when its first occurrence enters the window", async () => {
  const result = await collectMarket("2026-04-23");
  assert.deepEqual(result.requests, [santanaRow.url]);
  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.events.map((event) => event.date), ["2026-07-22"]);
});

test("active and final-day occurrences still require verification and carry matching evidence", async () => {
  const result = await collectMarket("2026-09-01");
  assert.deepEqual(result.requests, [santanaRow.url]);
  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.events.map((event) => event.date), [
    "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30",
  ]);
  for (const event of result.events) {
    assert.equal(event.occurrenceEvidence.kind, "first-party-market-schedule");
    assert.equal(event.occurrenceEvidence.date, event.date);
    assert.equal(event.occurrenceEvidence.sourceUrl, santanaRow.url);
  }
  const finalDay = await collectMarket("2026-09-30");
  assert.deepEqual(finalDay.requests, [santanaRow.url]);
  assert.deepEqual(finalDay.events.map((event) => event.date), ["2026-09-30"]);
});

test("HTTP failures still suppress and alert for upcoming and active seasons", async () => {
  for (const today of ["2026-04-23", "2026-09-01"]) {
    const result = await collectMarket(today, { status: 500 });
    assert.deepEqual(result.requests, [santanaRow.url]);
    assert.deepEqual(result.events, []);
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].key, "farmers-market-suppressed");
    assert.match(result.alerts[0].body, /Santana Row Farmers Market \(http-500\)/);
  }
});

test("an active market with unconfirmed page wording stays unpublished and alerts", async () => {
  const result = await collectMarket("2026-09-01", { html: "Visit Santana Row" });
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.requests, [santanaRow.url]);
  assert.equal(result.alerts.length, 1);
  assert.match(result.alerts[0].body, /schedule-not-confirmed/);
});

test("closures and weekday bounds can remove the last eligible occurrence before verification", async () => {
  for (const market of [
    { ...santanaRow, excludedDates: ["2026-09-30"] },
    { ...santanaRow, endDate: "2026-09-29" },
  ]) {
    const result = await collectMarket("2026-09-24", { market, status: 500 });
    assert.deepEqual(result, { events: [], requests: [], alerts: [] });
  }
});

test("year-round markets retain date-specific closures and relocations", async () => {
  const market = FARMERS_MARKETS.find((m) => m.title === "Mountain View Farmers Market");
  const result = await collectMarket("2026-10-01", {
    market,
    html: "Mountain View Farmers Market. Sundays, 9:00am-1:00pm",
  });
  assert.deepEqual(result.requests, [market.url]);
  assert.deepEqual(result.alerts, []);
  const relocated = result.events.find((event) => event.date === "2026-10-04");
  assert.equal(relocated.venue, "Hope St. Lots (Lots 4 & 8)");
  assert.equal(relocated.address, "Hope St, Mountain View");
  assert.equal(result.events.find((event) => event.date === "2026-10-11").venue, market.venue);
  const santaClara = FARMERS_MARKETS.find((m) => m.title === "Santa Clara Farmers Market");
  const closed = await collectMarket("2026-10-01", {
    market: santaClara,
    html: "Santa Clara Farmers Market Saturday 9am-1pm. Jackson Street and Homestead Road",
  });
  assert.deepEqual(closed.requests, [santaClara.url]);
  assert.deepEqual(closed.alerts, []);
  assert.equal(closed.events[0].date, "2026-10-10");
});
