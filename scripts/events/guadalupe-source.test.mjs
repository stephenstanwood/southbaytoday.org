import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizeGuadalupeEvent } from "../lib/guadalupe-events.mjs";
import { scrapeGuadalupeRiverPark, normalizePlaywrightEvent } from "../playwright-scrapers.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";

test("the captured Guadalupe calendar preserves occurrence locations and end times", async () => {
  const { rows } = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/guadalupe-2026-11.json", import.meta.url), "utf8"));
  const events = await scrapeGuadalupeRiverPark({
    goto: async url => assert.equal(url, "https://grpg.org/calendar/events/"),
    evaluate: async () => rows,
  }, { today: "2026-11-01" });
  assert.equal(events.length, 6);
  const bootcamps = events.filter(event => event.title.startsWith("Bootcamp"));
  assert.deepEqual(bootcamps.map(event => [event.date, event.time, event.endTime, event.venue, event.address]), [
    ["2026-11-05", "5:30 PM", "6:30 PM", "Arena Green West", "N Autumn St, San Jose, CA 95113, USA"],
    ["2026-11-19", "6:00 PM", "7:00 PM", "Arena Green West", "N Autumn St, San Jose, CA 95113, USA"],
  ]);
  for (const event of events.filter(event => event.title.startsWith("Neighborhood"))) {
    assert.equal(event.venue, "Guadalupe Gardens");
    assert.equal(event.address, "37.341241, -121.905470");
    assert.equal(event.endTime, "10:30 AM");
    assert.match(event.description, /community resource fair/);
  }
  const restore = normalizePlaywrightEvent(events.find(event => event.title.startsWith("Restore")));
  assert.equal(restore.venue, null);
  assert.equal(restore.address, "");
  assert.equal(restore.attendanceStatus, "needs-confirmation");
  assert.match(restore.attendanceNote, /does not list a meeting location/);
  assert.equal(restore.endTime, "11:00 AM");
  const yoga = events.find(event => event.title.startsWith("Yoga"));
  assert.equal(yoga.venue, "Arena Green West");
  assert.equal(yoga.endTime, "11:15 AM");
  assert.match(yoga.description, /10:15am - 11:15am Yoga/);
  assert.ok(events.every(event => event.cost === null && !event.address.includes("438 Coleman")));
});

test("Guadalupe records require a dated occurrence and never infer an office meeting point or free admission", () => {
  const raw = { title: "Community program", startDate: "2026-11-05T17:30:00-08:00" };
  const options = { today: "2026-11-01" };
  assert.equal(normalizeGuadalupeEvent({ ...raw, startDate: "Every Thursday" }, options), null);
  assert.equal(normalizeGuadalupeEvent({ ...raw, startDate: "2026-11-05T17:30" }, options), null);
  assert.equal(normalizeGuadalupeEvent(raw, { today: "2026-11-06" }), null);
  const unknown = normalizeGuadalupeEvent(raw, options);
  assert.equal(unknown.venue, null);
  assert.equal(unknown.address, "");
  assert.equal(unknown.cost, null);
  assert.equal(normalizeGuadalupeEvent({ ...raw, description: "Free admission." }, options).cost, "free");
  assert.equal(normalizeGuadalupeEvent({ ...raw, description: "$15 per person." }, options).cost, "paid");
  assert.equal(normalizeGuadalupeEvent({ ...raw, description: "Bring a bag; volunteers receive a $15 stipend and a free water bottle." }, options).cost, null);
});

test("Guadalupe volunteer meeting instructions outrank generic address metadata and survive publication", () => {
  const { rows } = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/guadalupe-2026-11-volunteers.json", import.meta.url), "utf8"));
  const expectedVenues = ["Historic Orchard", "Rose Garden Shed", "Rose Garden Shed"];
  for (const [index, raw] of rows.entries()) {
    const event = normalizePlaywrightEvent(normalizeGuadalupeEvent(raw, { today: "2026-11-01" }));
    assert.equal(event.venue, expectedVenues[index]);
    assert.equal(event.address, "", "neither the calendar's generic street nor the parking address is the meeting point");
    assert.equal(event.registration, "required");
    assert.match(event.attendanceNote, /registration is required/i);
    assert.match(event.attendanceNote, /registration form for the meeting map/i);
    assert.match(event.attendanceNote, /Chaperones are required for those age 15 and younger/i);
    assert.equal(event.attendanceStatus, undefined);
    assert.equal(classifyAudienceAge(event), "all");
    assert.equal(event.cost, null);
  }
});

test("Guadalupe volunteer signup does not invent a missing trail meeting point or gate partner workouts", () => {
  const { rows } = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/guadalupe-2026-11.json", import.meta.url), "utf8"));
  const events = rows.map(raw => normalizeGuadalupeEvent(raw, { today: "2026-11-01" }));
  const trail = events.find(event => event.title.startsWith("Restore"));
  assert.equal(trail.registration, "required");
  assert.equal(trail.venue, null);
  assert.equal(trail.address, "");
  assert.equal(trail.attendanceStatus, "needs-confirmation");
  assert.match(trail.attendanceNote, /does not list a meeting location/);
  assert.match(trail.attendanceNote, /registration is required/i);
  for (const event of events.filter(event => !event.title.startsWith("Restore"))) {
    assert.equal(event.registration, undefined, event.title);
  }
});
