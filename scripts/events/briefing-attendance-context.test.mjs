import test from "node:test";
import assert from "node:assert/strict";
import { briefingEventContext } from "../lib/city-briefing-integrity.mjs";

// Organizer: https://svcmoaa-events.com/san-jose-veterans-day-parade
// Event window: https://sjdowntown.com/traffic-construction-updates/
test("briefing input retains the parade's verified noon start alongside the broader event window", () => {
  const event = {
    title: "108th Veterans Day Parade", date: "2026-11-11",
    time: "11:00 AM", endTime: "2:00 PM", venue: "Plaza de San Jose",
    url: "https://svcmoaa-events.com/san-jose-veterans-day-parade",
    category: "community", source: "City Newsletter",
  };
  const before = structuredClone(event);
  const context = briefingEventContext(event, "Wed, Nov 11");
  assert.match(context, /Downtown San Jose \(Wed, Nov 11\) @ 11:00 AM/);
  assert.match(context, /attendance details: The city lists an 11 AM–2 PM event window\. The parade itself starts at noon\./);
  assert.deepEqual(event, before, "source verification must not mutate the input snapshot");
});

test("a later source qualification survives in full instead of borrowing another event's schedule", () => {
  const note = "Doors open at 6 PM. " + "Tickets are checked at the entrance. ".repeat(6)
    + "The performance itself starts at 7 PM.";
  const context = briefingEventContext({
    title: "Evening performance", date: "2026-12-01", time: "6:00 PM",
    venue: "Community Hall", category: "arts", attendanceNote: note,
  });
  assert(context.endsWith(`attendance details: ${note}`));
});
