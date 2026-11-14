import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cleanTitle, fetchBiblioEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-14-access.json", import.meta.url)));
const mentor = fixture.events.find(event => event.source === "San Jose Public Library");
const genealogy = fixture.events.find(event => event.source === "City Newsletter");

test("the real library adapter preserves optional appointments and conditional walk-ins after publication", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-14T22:00:00Z") });
  t.mock.method(globalThis, "fetch", async () => Response.json({ entities: {
    events: { [fixture.source.id]: fixture.source }, locations: fixture.locations,
  } }));
  const [ingested] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  const event = applyVerifiedEventFacts({ ...ingested, title: cleanTitle(ingested.title) });
  assert.equal(requiresAdvanceRegistration(event), false);
  assert.equal(event.registrationClosesBy, null);
  assert.match(event.attendanceNote, /optional/);
  assert.match(event.attendanceNote, /4:30 PM if space is available/);
  assert.equal(event.time, "3:00 PM");
  assert.equal(event.endTime, "5:00 PM");
});

test("cached publication repairs both access flags without changing occurrence facts", async () => {
  for (const original of fixture.events) {
    const before = structuredClone(original);
    const event = structuredClone(original);
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.registration, original === mentor ? "none" : "required");
    assert.equal(requiresAdvanceRegistration(event), original === genealogy);
    if (original === mentor) assert.equal(event.registrationClosesBy, null);
    for (const field of ["id", "title", "date", "time", "endTime", "venue", "city", "url", "description"])
      assert.equal(event[field], original[field], field);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    assert.deepEqual(original, before);
  }
});

test("later access restrictions and unrelated occurrences pass through", () => {
  for (const original of fixture.events) {
    for (const change of [
      { date: "2027-11-18" }, { time: "2:00 PM" }, { endTime: "6:00 PM" },
      { venue: "Another Library" }, { url: "https://example.org/event" },
      { source: "Another Organizer" }, { title: "Another Program" },
      { description: "Registration is required. No walk-ins." },
    ]) {
      const unrelated = { ...original, ...change };
      assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
    }
  }
  for (const registration of ["full", "closed", "appointment-only"]) {
    const event = { ...mentor, registration, attendanceNote: "Current provider notice." };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    assert.equal(applyVerifiedEventFacts({ ...genealogy, registration }).registration, registration);
  }
  for (const attendanceNote of ["Registration is now closed.", "No walk-ins are allowed."]) {
    const event = { ...mentor, attendanceNote };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});
