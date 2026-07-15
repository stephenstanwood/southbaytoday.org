import assert from "node:assert/strict";
import test from "node:test";

import { confirmedGrpgEvents, mergeConfirmedGrpgEvents } from "./grpg-events.mjs";

test("expands the eight organizer-confirmed GRPG programs over 90 days", () => {
  const events = confirmedGrpgEvents({ startDate: "2026-07-15" });

  assert.ok(events.every((item) => item.date >= "2026-07-15" && item.date <= "2026-10-13"));
  assert.deepEqual(
    [...new Set(events.map((item) => item.title))].sort(),
    [
      "Animal Encounters at Rotary PlayGarden",
      "BEE: Beginning Environmental Explorers",
      "Bootcamp in the River Park",
      "GRPC PlayHub",
      "Guadalupe Gardens Workday",
      "Pumpkins in the Park: 30th Anniversary",
      "Yoga and Zumba in the River Park",
      "Yoga in the River Park: Sunset Sessions",
    ].sort(),
  );

  assert.ok(events.some((item) => item.title === "Yoga and Zumba in the River Park" && item.date === "2026-07-25"));
  assert.ok(events.some((item) => item.title === "Bootcamp in the River Park" && item.date === "2026-07-16"));
  assert.ok(events.some((item) => item.title === "Yoga in the River Park: Sunset Sessions" && item.date === "2026-07-16"));
  assert.ok(events.some((item) => item.title === "Animal Encounters at Rotary PlayGarden" && item.date === "2026-08-02"));
  assert.ok(events.some((item) => item.title === "GRPC PlayHub" && item.date === "2026-08-02"));
  assert.ok(events.some((item) => item.title === "Guadalupe Gardens Workday" && item.date === "2026-07-24"));
  assert.ok(events.some((item) => item.title === "Pumpkins in the Park: 30th Anniversary" && item.date === "2026-10-10"));

  const bee = events.find((item) => item.title === "BEE: Beginning Environmental Explorers");
  assert.equal(bee.time, "10:30 AM");
  assert.equal(bee.endTime, "1:00 PM");
  assert.match(bee.description, /noon–1 PM/);
});

test("confirmed events replace same-title scraped rows without dropping other GRPG events", () => {
  const merged = mergeConfirmedGrpgEvents([
    {
      title: "Yoga and Zumba in the River Park",
      date: "2026-07-25",
      time: null,
    },
    {
      title: "Restore & Explore: Trail Clean-Up & Trail Tour",
      date: "2026-07-18",
      time: "9:00 AM",
    },
  ], { startDate: "2026-07-15" });

  assert.equal(merged.filter((item) => item.title === "Yoga and Zumba in the River Park" && item.date === "2026-07-25").length, 1);
  assert.equal(merged.find((item) => item.title === "Yoga and Zumba in the River Park").time, "9:00 AM");
  assert.ok(merged.some((item) => item.title === "Restore & Explore: Trail Clean-Up & Trail Tour"));
});
