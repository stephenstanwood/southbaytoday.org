import assert from "node:assert/strict";
import test from "node:test";

import { scrapeChildrensDiscoveryMuseum, normalizePlaywrightEvent } from "../playwright-scrapers.mjs";
import { parseCdmOccurrenceDate } from "./cdm-events.mjs";

const programs = [
  { title: "Toddler Storytime", date: "Every Wednesday through Sunday", time: "11:30 am in the Wonder Cabinet", type: "Ongoing" },
  { title: "All Ages Storytime", date: "Every Tuesday", time: "11:30 am in the Theatre", type: "Ongoing" },
];

function calendarPage(rows) {
  return {
    setExtraHTTPHeaders: async () => {},
    goto: async (url) => assert.equal(url, "https://www.cdm.org/calendar/"),
    waitForTimeout: async () => {},
    evaluate: async () => rows,
  };
}

test("museum weekly programs publish only on the organizer's stated weekdays", async () => {
  for (const [today, expectedTitles] of [
    ["2026-10-15", ["Toddler Storytime"]],
    ["2026-10-18", ["Toddler Storytime"]],
    ["2026-10-19", []],
    ["2026-10-20", ["All Ages Storytime"]],
    ["2026-10-21", ["Toddler Storytime"]],
  ]) {
    const events = await scrapeChildrensDiscoveryMuseum(calendarPage(programs), { today });
    assert.deepEqual(events.map((event) => event.title), expectedTitles, today);
    for (const event of events) {
      const normalized = normalizePlaywrightEvent(event);
      assert.equal(normalized.date, today);
      assert.equal(normalized.time, "11:30 am");
      assert.equal(normalized.cost, "paid");
      assert.equal(normalized.venue, "Children's Discovery Museum");
    }
  }
});

test("museum keeps dated special events and rejects unrecognized recurrence", async () => {
  const rows = [
    { title: "Mars Expedition with VEX Robotics", date: "Saturday, October 17", time: "10:30 am – 12:00 pm", type: "Special Event" },
    { title: "Unresolved Recurring Program", date: "Every other Wednesday", time: "11:30 am", type: "Ongoing" },
  ];
  const events = await scrapeChildrensDiscoveryMuseum(calendarPage(rows), { today: "2026-10-15" });
  assert.deepEqual(events.map(({ title, date, time, endTime }) => ({ title, date, time, endTime })), [
    { title: "Mars Expedition with VEX Robotics", date: "2026-10-17", time: "10:30 am", endTime: "12:00 pm" },
  ]);
});

test("museum date labels reject stale, impossible and contradictory dates without annual rollover", () => {
  const today = "2026-10-15";
  for (const label of ["Every other Tuesday", "Every day", "Every Tuesday in summer", "October 10 - November 6", "February 30, 2027", "Friday, October 17", "October 14", "January 17"]) {
    assert.equal(parseCdmOccurrenceDate(label, today), null, label);
  }
  assert.equal(parseCdmOccurrenceDate("Saturday, October 17", today), "2026-10-17");
  assert.equal(parseCdmOccurrenceDate("October 17, 2027", today), "2027-10-17");
  assert.equal(parseCdmOccurrenceDate("Every Tuesday", "2026-02-30"), null);
  assert.equal(parseCdmOccurrenceDate("Weekdays", today), today);
  assert.equal(parseCdmOccurrenceDate("Weekends", today), null);
  assert.equal(parseCdmOccurrenceDate("Weekends", "2026-10-18"), "2026-10-18");
  assert.equal(parseCdmOccurrenceDate("Every Saturday through Tuesday", "2026-10-18"), "2026-10-18");
  assert.equal(parseCdmOccurrenceDate("Every Saturday through Tuesday", "2026-10-21"), null);
});
