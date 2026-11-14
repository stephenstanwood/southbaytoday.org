import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchHistorySanJoseEvents } from "../generate-events.mjs";

const actualCard = fs.readFileSync(new URL("../lib/fixtures/historysj-flashback-2026-11-14.html", import.meta.url), "utf8");
const sourceUrl = "https://historysanjose.org/programs-events/";
const card = (title, dates) => `<div class="event_all_box"><div class="event-content">
  <p>${dates}</p><h2>${title}</h2><span class="eventlocation">History Park</span>
  <span class="eventtime">11:00 am</span></div></div>`;

for (const timezone of ["UTC", "America/Los_Angeles"]) {
  test(`History San José retains today's original occurrence on a ${timezone} host`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-14T12:09:00Z") });
    const previousTimezone = process.env.TZ;
    process.env.TZ = timezone;
    t.after(() => {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    });
    t.mock.method(globalThis, "fetch", async (url) => {
      assert.match(String(url), /^https:\/\/historysanjose\.org\/programs-events\//);
      return new Response(String(url) === sourceUrl ? actualCard : "");
    });
    const [event] = await fetchHistorySanJoseEvents();
    assert(event, "the 11 AM Pacific event is still upcoming at 4:09 AM Pacific");
    assert.equal(event.id, "historysj-6be015f8a7dd3c6a");
    assert.equal(event.date, "2026-11-14");
    assert.equal(event.displayDate, "Sat, Nov 14");
    assert.equal(event.time.replace(/\s/g, ""), "11:00AM");
    assert.equal(event.endTime.replace(/\s/g, ""), "1:00PM");
    assert.equal(event.venue, "History Park");
    assert.equal(event.cost, "paid");
  });
}

test("History San José expires single dates and the final day of ranges at the Pacific day boundary", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-15T03:00:00Z") });
  t.mock.method(globalThis, "fetch", async (url) => new Response(String(url) === sourceUrl ? [
    actualCard,
    card("Past listing", "11/13/2026"),
    card("Current range", "11/01/2026 – 11/14/2026"),
    card("Past range", "11/01/2026 – 11/13/2026"),
    card("Tomorrow's listing", "11/15/2026"),
  ].join("") : ""));
  const evening = await fetchHistorySanJoseEvents();
  assert.equal(evening.length, 3, "November 14 remains the Pacific date after UTC midnight");
  assert(evening.some(e => e.title === "Current range"));
  t.mock.timers.setTime(new Date("2026-11-15T08:00:00Z").getTime());
  const nextDay = await fetchHistorySanJoseEvents();
  assert.deepEqual(nextDay.map(e => e.title), ["Tomorrow's listing"]);
});
