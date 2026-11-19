import assert from "node:assert/strict";
import test from "node:test";

import { scrapeChildrensDiscoveryMuseum, normalizePlaywrightEvent } from "../playwright-scrapers.mjs";
import { fetchInboundEvents, isEventTimeBackfillCandidate } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
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

test("the iceless rink stays listed as an exhibit during its confirmed run", () => {
  const events = [{
    id: "rink-newsletter", title: "Sock Skating at the Children's Discovery Museum",
    startsAt: "2026-11-21T09:30:00-08:00", cityKey: "san-jose",
    location: "Children's Discovery Museum of San Jose, 180 Woz Way, San Jose, CA 95110",
    sourceUrl: "https://secure2.convio.net/cdm/site/R?i=newsletter-link",
  }];
  const [opening] = fetchInboundEvents({ events, today: "2026-11-19" });
  const exhibit = applyVerifiedEventFacts(opening);
  assert.deepEqual([exhibit.date, exhibit.time, exhibit.endTime, exhibit.ongoing], ["2026-11-21", null, null, true]);
  assert.equal(exhibit.venue, "Children's Discovery Museum, Traveling Exhibit Hall");
  assert.equal(exhibit.url, "https://www.cdm.org/event/iceless-skating-rink/2026-11-21/");
  const [active] = fetchInboundEvents({ events, today: "2027-01-09" });
  assert.equal(active.id, opening.id);
  assert.equal(active.date, "2027-01-09");
  assert.equal(active.startDate, exhibit.date);
  assert.equal(applyVerifiedEventFacts(active).title, exhibit.title);
  assert.deepEqual(fetchInboundEvents({ events, today: "2027-01-10" }), []);
  assert.equal(isEventTimeBackfillCandidate(exhibit), false);
});

test("the December robotics demo cannot borrow museum opening time from the newsletter link", () => {
  const events = [{
    id: "robotics-newsletter", title: "Robotics Demonstration with Team Quixilver",
    startsAt: "2026-12-13T00:00:00-08:00", cityKey: "san-jose",
    location: "Children's Discovery Museum of San Jose, 180 Woz Way, San Jose, CA 95110",
    description: "The newsletter gives no start time.",
    sourceUrl: "https://secure2.convio.net/cdm/site/R?i=newsletter-link",
  }];
  const [row] = fetchInboundEvents({ events, today: "2026-11-19" });
  assert.equal(row.url, "");
  const unconfirmed = applyVerifiedEventFacts({ ...row, time: "10:00 AM" });
  assert.equal(unconfirmed.time, null);
  assert.equal(unconfirmed.attendanceStatus, "needs-confirmation");
  assert.equal(isEventTimeBackfillCandidate(unconfirmed), false);
});

test("the museum's holiday events use its public schedule and links", () => {
  const holidayRows = [
    ["Noon Year's Eve Celebration", "2026-12-31", "12:00 PM", null, "noon-years-eve"],
    ["El Día de los Tres Reyes Magos", "2027-01-09", "10:00 AM", "2:00 PM", "el-dia-de-los-tres-reyes-magos"],
  ];
  const events = holidayRows.map(([title, date], index) => ({
    id: `holiday-${index}`, title, startsAt: `${date}T00:00:00-08:00`, cityKey: "san-jose",
    location: "Children's Discovery Museum of San Jose, 180 Woz Way, San Jose, CA 95110",
    sourceUrl: "https://secure2.convio.net/cdm/site/R?i=newsletter-link",
    description: "The newsletter gives no start time.",
  }));
  const result = fetchInboundEvents({ events, today: "2026-11-19" }).map(applyVerifiedEventFacts);
  assert.deepEqual(result.map(({ title, date, time, endTime, url }) => [title, date, time, endTime, url]),
    holidayRows.map(([title, date, time, endTime, slug]) => [title, date, time, endTime, `https://www.cdm.org/event/${slug}/`]));
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
