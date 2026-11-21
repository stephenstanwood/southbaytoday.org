import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchStanfordEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-15-public-access.json", import.meta.url)));

test("the real Stanford adapter honors short public-online eligibility without guessing a platform", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-15T02:00:00Z") });
  const source = fixture.stanfordSource;
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [
    { event: source },
    { event: { ...source, id: 2, custom_fields: {}, location_name: "Encina Hall" } },
    { event: { ...source, id: 3, custom_fields: { restricted_to: "In-person for Stanford affiliates." } } },
  ] }));
  const rows = await fetchStanfordEvents();
  assert.equal(rows.length, 2, "campus-only attendance without a public online option is excluded");
  assert.equal(rows[0].virtual, true);
  assert.equal(rows[0].venue, "Online");
  assert.equal(rows[0].address, "");
  assert.match(rows[0].attendanceNote, /In-person attendance is limited to Stanford affiliates/);
  assert.doesNotMatch(rows[0].attendanceNote, /Zoom/);
  assert.equal(rows[0].time, "12:00 PM");
  assert.equal(rows[0].endTime, "1:15 PM");
  assert.equal(rows[1].virtual, undefined, "unrestricted hybrid events remain physically attendable");
  assert.equal(rows[1].venue, "Encina Hall");
});

test("cached publication preserves public online access and the second-day market's verified free admission", async () => {
  for (const original of fixture.events) {
    const event = structuredClone(original);
    await resolveEventBlurbs([event], { enabled: false });
    if (original.source === "Stanford Events") {
      assert.equal(event.virtual, true);
      assert.equal(event.venue, "Online");
      assert.equal(event.address, "");
      assert.match(event.blurb, /online/);
      assert.match(event.attendanceNote, /In-person attendance is limited to Stanford affiliates/);
    } else {
      assert.equal(event.category, "market");
      assert.equal(event.cost, "free");
      assert.equal(event.registration, undefined, "optional parking signup is not mandatory registration");
      assert.match(event.attendanceNote, /help plan parking/);
    }
    for (const key of ["id", "title", "date", "time", "endTime", "url", "description"])
      assert.equal(event[key], original[key], key);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("occurrence corrections preserve revised schedules, prices and later availability restrictions", () => {
  for (const original of fixture.events) {
    for (const change of [{ date: "2027-11-16" }, { time: "2:00 PM" },
      { endTime: "4:00 PM" }, { url: "https://example.org/event" }, { source: "Another organizer" }]) {
      const unrelated = { ...original, ...change };
      assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
    }
    for (const registration of ["full", "closed", "required"]) {
      const event = { ...original, registration, attendanceStatus: "needs-confirmation", attendanceNote: "Current organizer notice." };
      const corrected = applyVerifiedEventFacts(event);
      assert.equal(corrected.registration, registration);
      assert.equal(corrected.attendanceStatus, event.attendanceStatus);
      assert(corrected.attendanceNote.startsWith(event.attendanceNote));
    }
  }
  const market = fixture.events.find(e => e.source === "City Newsletter");
  for (const change of [{ cost: "paid" }, { costNote: "Free for members only." },
    { description: "Tickets cost $10." }, { title: "Yuletide Tea at Montalvo" }]) {
    const event = { ...market, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});
