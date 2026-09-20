import assert from "node:assert/strict";
import test from "node:test";
import { fetchLosAltosVillageEvents } from "../generate-events.mjs";

const year = new Date().getFullYear() + 1;
const event = (overrides = {}) => ({
  id: 1, title: "Holiday Market", start_date: `${year}-12-10 16:00:00`,
  end_date: `${year}-12-10 20:00:00`, all_day: false,
  description: "<p>Local vendors and live music.</p>", cost: "",
  venue: { venue: "State Street Market", address: "170 State Street",
    city: "Los Altos", stateprovince: "CA", zip: "94022" },
  url: "https://downtownlosaltos.org/event/holiday-market/", ...overrides,
});

async function withPages(pages, callback) {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (value) => {
    const url = new URL(value);
    assert.equal(url.origin, "https://downtownlosaltos.org");
    assert.equal(url.pathname, "/wp-json/tribe/events/v1/events");
    assert.equal(url.searchParams.get("per_page"), "50");
    requests.push(url);
    const page = pages[Number(url.searchParams.get("page")) - 1];
    assert.ok(page, `unexpected page ${url}`);
    return page instanceof Response ? page : Response.json(page);
  };
  try { return await callback(requests); } finally { globalThis.fetch = original; }
}

test("preserves winter Pacific times, venue, unknown pricing, and the actual publisher", async () => {
  const events = await withPages([{ events: [event()], total_pages: 1 }], () => fetchLosAltosVillageEvents());
  assert.equal(events.length, 1);
  assert.equal(events[0].date, `${year}-12-10`);
  assert.equal(events[0].time, "4:00 PM");
  assert.equal(events[0].endTime, "8:00 PM");
  assert.equal(events[0].venue, "State Street Market");
  assert.equal(events[0].address, "170 State Street, Los Altos, CA, 94022");
  assert.equal(events[0].cost, null);
  assert.equal(events[0].source, "Los Altos Village Association");
  assert.equal(events[0].url, event().url);
});

test("reads subsequent pages without duplicating occurrences and preserves all-day status", async () => {
  const day = event({ id: 2, title: "Small Business Saturday", all_day: true,
    start_date: `${year}-11-28 00:00:00`, end_date: `${year}-11-28 23:59:59`, cost: "Free" });
  const events = await withPages([
    { events: [event()], total_pages: 2 },
    { events: [event(), day], total_pages: 2 },
  ], async (requests) => {
    const rows = await fetchLosAltosVillageEvents();
    assert.equal(requests.length, 2);
    return rows;
  });
  assert.equal(events.length, 2);
  assert.equal(events[1].date, `${year}-11-28`);
  assert.equal(events[1].time, null);
  assert.equal(events[1].endTime, null);
  assert.equal(events[1].cost, "free");
});

test("keeps paid tickets distinct from free ancillary activities and excludes past rows", async () => {
  const rows = await withPages([{ total_pages: 1, events: [
    event({ title: "Wine &#038; Bites", cost: "$35", description: "Free parking with your ticket." }),
    event({ id: 2, start_date: "2020-01-01 16:00:00" }),
  ] }], () => fetchLosAltosVillageEvents());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Wine & Bites");
  assert.equal(rows[0].cost, "paid");
  assert.equal(rows[0].costNote, "$35");
});

test("reports fetch and malformed-feed failures instead of returning a healthy empty season", async () => {
  for (const page of [new Response("forbidden", { status: 403 }), {},
    { events: [event()], total_pages: 6 }, { events: [event({ start_date: "invalid" })], total_pages: 1 }]) {
    await withPages([page], () => assert.rejects(fetchLosAltosVillageEvents));
  }
  assert.deepEqual(await withPages([{ events: [], total_pages: 0 }], () => fetchLosAltosVillageEvents()), []);
});
