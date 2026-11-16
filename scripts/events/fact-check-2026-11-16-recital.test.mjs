import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cleanTitle, fetchInboundEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-16-recital.json", import.meta.url)));

test("both retained newsletter copies publish the recital's exact organizer link and supported program", async () => {
  const events = fetchInboundEvents({ events: structuredClone(fixture.incoming), today: "2026-11-16" });
  assert.equal(events.length, 2);
  for (const event of events) {
    event.title = cleanTitle(event.title);
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.url, fixture.organizerUrl);
    assert.equal(event.date, "2027-05-05");
    assert.equal(event.time, "7:30 PM");
    assert.equal(event.venue, "Bing Concert Hall");
    assert.doesNotMatch(event.description, /Baal Shem/);
    assert.match(event.description, /perform a recital/);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("cached publication repairs the link without replacing current admission, clocks or accurate copy", async () => {
  for (const registration of ["required", "full", "closed", "appointment-only"]) {
    const event = { ...fixture.published, time: "8:00 PM", endTime: "10:00 PM",
      registration, cost: "paid", costNote: "Current admission: $40.",
      attendanceNote: "Current organizer notice." };
    const expected = { ...event, url: fixture.organizerUrl };
    await resolveEventBlurbs([event], { enabled: false });
    assert.deepEqual(event, expected);
    await resolveEventBlurbs([event], { enabled: false });
    assert.deepEqual(event, expected);
  }
});

test("the older unsupported repertoire claim is removed from source and cached copy together", async () => {
  const description = fixture.incoming[0].description;
  const event = { ...fixture.published, description, blurb: description, attendanceNote: description };
  await resolveEventBlurbs([event], { enabled: false });
  for (const key of ["description", "blurb", "attendanceNote"]) {
    assert.doesNotMatch(event[key], /Baal Shem/);
    assert.match(event[key], /perform a recital as part of Stanford Live's America 250 series/);
  }
  assert.equal(event.url, fixture.organizerUrl);
  const intake = fixture.incoming[0];
  const repaired = applyVerifiedEventFacts({ date: intake.startsAt.slice(0, 10), title: intake.title,
    venue: intake.location, url: intake.sourceUrl, description: intake.description });
  assert.doesNotMatch(repaired.description, /Baal Shem/, "the raw newsletter pull uses the same repair");
});

test("other occurrences, sources and revised links retain their own evidence", () => {
  for (const change of [
    { date: "2028-05-05" }, { title: "Another recital" }, { venue: "The Studio" },
    { city: "santa-clara" }, { source: "Another organizer" },
    { url: "https://live.stanford.edu/events/revised-recital/" },
  ]) {
    const event = { ...fixture.published, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  const revised = { ...fixture.published, url: fixture.organizerUrl,
    description: "The organizer announces a revised recital program." };
  assert.deepEqual(applyVerifiedEventFacts(revised), revised);
});
