import test from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, fetchPlaywrightEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";

test("the sparse Christmas in the Park snapshot retains the organizer's actual band, venue and admission", async () => {
  const raw = { id: "jazz-snapshot", title: "HSAS Big Band at Christmas in the Park",
    date: "2026-12-21", time: "6:00 PM", endTime: null, venue: "San Jose Jazz Venue",
    address: "", city: "san-jose", cost: null, source: "San Jose Jazz",
    url: "https://sanjosejazz.org/events/hsas-big-band-at-christmas-in-the-park-2/",
    description: "", blurb: "Hear the band at the San Jose Jazz venue." };
  const events = fetchPlaywrightEvents({ today: "2026-10-29", events: [raw] });
  events[0].title = cleanTitle(events[0].title);
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.equal(actual.title, "HSAS Big Band / U19s at Christmas in the Park");
  assert.equal(actual.venue, "Plaza de César Chávez");
  assert.match(actual.address, /310 South First St/);
  assert.equal(actual.cost, "free");
  assert.equal(actual.time, "6:00 PM", "showtime is distinct from the 5 PM doors");
  assert.equal(actual.endTime, null, "the organizer gives no closing time");
  assert.match(actual.blurb, /HSAS.*U19s.*Plaza de César Chávez/);
  assert.doesNotMatch(actual.blurb, /San Jose Jazz venue/i);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  assert.equal(cleanTitle("Hsas Big Band at Christmas in the Park"), "HSAS Big Band at Christmas in the Park");
  assert.equal(cleanTitle(actual.title), actual.title);
  for (const other of [{ ...raw, date: "2027-12-21" }, { ...raw, url: "https://example.org/another-show" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Edenvale's contradictory AM body stays visible with a confirmation notice until the source resolves it", async () => {
  const raw = { id: "sjpl-6a7b58523f18f80030ba659d", date: "2026-11-01",
    url: "https://sjpl.bibliocommons.com/events/6a7b58523f18f80030ba659d",
    title: "Bilingual Family Storytime/ Hora de Cuentos & Stay and Play",
    venue: "Edenvale Library", time: "3:00 PM", endTime: "3:30 PM", cost: "free",
    description: "Storytime: 3:00 - 3:30 am; Stay & Play: 3:30 - 4:00 pm.",
    blurb: "Enjoy bilingual stories, then stay and play." };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.equal(requiresAttendanceConfirmation(actual), true);
  assert.equal(isBriefingEventAvailable(actual), false);
  assert.match(actual.attendanceNote, /3–3:30 PM.*AM.*Edenvale Library/);
  for (const field of Object.keys(raw)) assert.deepEqual(actual[field], raw[field], field);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const other of [
    { ...raw, date: "2027-11-01" },
    { ...raw, url: "https://sjpl.bibliocommons.com/events/another-occurrence" },
    { ...raw, description: raw.description.replace("3:30 am", "3:30 pm") },
    { ...raw, time: "10:00 AM", endTime: "10:30 AM" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});
