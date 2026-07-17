import assert from "node:assert/strict";
import test from "node:test";

import {
  marketOccurrenceEvidence,
  marketPageConfirmsSchedule,
  verifyMarketScheduleSource,
} from "./marketOccurrence.mjs";

const market = {
  title: "Cupertino Farmers Market",
  url: "https://example.org/cupertino-farmers-market",
  evidencePatterns: [
    /Cupertino Farmers Market/i,
    /Every Friday/i,
    /9:00\s*am\s*(?:to|[-–])\s*1:00\s*pm/i,
  ],
};

test("a dead market page cannot confirm projected occurrences", async () => {
  const result = await verifyMarketScheduleSource(market, {
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  assert.deepEqual(result, { confirmed: false, reason: "http-404" });
});

test("a live organizer page without the named market and schedule fails closed", async () => {
  const html = `
    <main>
      <h1>Our South Bay farmers markets</h1>
      <p>Mountain View Farmers Market — Every Sunday, 9:00 am to 1:00 pm.</p>
    </main>`;
  assert.equal(marketPageConfirmsSchedule(html, market.evidencePatterns), false);

  const result = await verifyMarketScheduleSource(market, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: market.url,
      text: async () => html,
    }),
  });
  assert.deepEqual(result, { confirmed: false, reason: "schedule-not-confirmed" });
});

test("a first-party page that states the market, weekday, and hours yields date-matched evidence", async () => {
  const checkedAt = "2026-07-17T10:00:00.000Z";
  const result = await verifyMarketScheduleSource(market, {
    checkedAt,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: market.url,
      text: async () => `
        <main>
          <h1>Cupertino Farmers Market</h1>
          <p>Every Friday, 9:00 am to 1:00 pm.</p>
        </main>`,
    }),
  });

  assert.equal(result.confirmed, true);
  assert.deepEqual(marketOccurrenceEvidence(result, "2026-07-17"), {
    kind: "first-party-market-schedule",
    sourceUrl: market.url,
    date: "2026-07-17",
    checkedAt,
  });
});
