import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchPlaywrightEvents, polishDescription } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-16-makers.json", import.meta.url)));

test("the dated Makers Market retains its confirmed clocks and free admission through intake", async () => {
  const [event] = fetchPlaywrightEvents({ today: "2026-11-15", events: [fixture.incoming] });
  assert(event);
  event.description = polishDescription(event.description);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.description, fixture.intakeDescription);
  for (const key of ["id", "title", "date", "time", "endTime", "venue", "address", "url"])
    assert.deepEqual(event[key], fixture.published[key], key);
  assert.equal(event.cost, "free");
  assert.equal(event.date, "2026-11-21");
  assert.equal(new Date(`${event.date}T12:00:00Z`).getUTCDay(), 6);
  assert.equal(Math.ceil(Number(event.date.slice(-2)) / 7), 3);
});

test("cached publication also removes stale recurrence copy while preserving current booking and prices", async () => {
  for (const registration of ["required", "full", "closed", "appointment-only"]) {
    const event = { ...fixture.published, registration, cost: "paid", costNote: "Revised admission: $5.",
      attendanceNote: "Current organizer notice.",
      blurb: "Browse local makers on the second Saturday of every month from 11 AM-6 PM." };
    const before = structuredClone(event);
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.description, fixture.description);
    assert.equal(event.blurb, "Browse local makers from 11 AM-6 PM.");
    for (const key of Object.keys(before).filter(key => !["description", "blurb"].includes(key)))
      assert.deepEqual(event[key], before[key], key);
    const corrected = structuredClone(event);
    await resolveEventBlurbs([event], { enabled: false });
    assert.deepEqual(event, corrected);
  }
});

test("other source identities and occurrences retain their own schedules, and revised copy flows through", () => {
  for (const change of [
    { date: "2026-11-14" }, { date: "2026-12-12" }, { source: "Another organizer" },
    { url: "https://example.org/another-fair" }, { title: "Another market" },
    { venue: "Another venue" }, { city: "palo-alto" },
    { description: "The organizer has revised this occurrence's schedule.", blurb: "Read the revised schedule." },
  ]) {
    const event = { ...fixture.published, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event, JSON.stringify(change));
  }
  const revisedClock = applyVerifiedEventFacts({ ...fixture.published, time: "12:00 PM", endTime: "5:00 PM" });
  assert.equal(revisedClock.time, "12:00 PM");
  assert.equal(revisedClock.endTime, "5:00 PM");
  assert.equal(revisedClock.cost, "free");
  const explicitPrice = applyVerifiedEventFacts({ ...fixture.published, costNote: "$5 advance admission" });
  assert.equal(explicitPrice.cost, null);
  assert.equal(explicitPrice.costNote, "$5 advance admission");
});
