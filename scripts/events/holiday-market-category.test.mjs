import test from "node:test";
import assert from "node:assert/strict";
import { fetchLosAltosVillageEvents, inferCategory } from "../generate-events.mjs";

// The organizer's December 10/17, 2026 pages describe vendor markets with
// incidental live music, not concerts. Keep the real adapter in this replay.
// https://downtownlosaltos.org/event/holiday-market/
// https://downtownlosaltos.org/event/holiday-market-2/
test("Los Altos holiday vendor markets retain their category through ingestion", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-30T13:00:00Z") });
  const entries = [10, 17].map((day) => ({
    id: 20261200 + day,
    title: "Holiday Market",
    start_date: `2026-12-${day} 16:00:00`,
    end_date: `2026-12-${day} 20:00:00`,
    all_day: false,
    description: "Shop gifts from local vendors with live music and visits with Santa.",
    url: `https://downtownlosaltos.org/event/holiday-market${day === 17 ? "-2" : ""}/`,
    venue: { venue: "State Street Market", address: "170 State Street", city: "Los Altos", state: "CA", zip: "94022" },
    cost: "",
  }));
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    assert.equal(new URL(url).origin, "https://downtownlosaltos.org");
    return new Response(JSON.stringify({ events: entries, total_pages: 1 }));
  });
  const events = await fetchLosAltosVillageEvents();
  assert.equal(events.length, 2);
  assert.equal(requests.length, 1);
  for (const [index, event] of events.entries()) {
    assert.equal(event.category, "market");
    assert.equal(event.date, entries[index].start_date.slice(0, 10));
    assert.equal(event.time, "4:00 PM");
    assert.equal(event.endTime, "8:00 PM");
    assert.equal(event.venue, "State Street Market");
    assert.equal(event.address, "170 State Street, Los Altos, CA, 94022");
    assert.equal(event.cost, null, "blank pricing remains unknown");
    assert.equal(event.url, entries[index].url);
  }
});

test("a performance at a market venue keeps its own event category", () => {
  assert.equal(inferCategory("Live Music at the Holiday Market", "Local vendor stalls", "", "State Street Market"), "music");
  assert.equal(inferCategory("Holiday Market Concert", "Local vendor stalls", "", "State Street Market"), "music");
  assert.equal(inferCategory("Halloween Carnival", "Family activities", "", "Downtown Los Altos"), "family");
});
