import test from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, fetchPlaywrightEvents } from "../generate-events.mjs";
import { scrapeSJJazz } from "../playwright-scrapers.mjs";
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
  assert.equal(actual.address, "1 Paseo de San Antonio, San Jose, CA 95113");
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

test("the Jazz scraper reads advertised calendar pages and rejects a partial refresh", async () => {
  const today = "2026-11-21";
  const firstPage = "https://sanjosejazz.org/events/";
  const secondPage = "https://sanjosejazz.org/events/page/2/";
  const first = { title: "Noah & the Arkiteks", date: "Wed, Nov 25", time: "8pm" };
  const last = { title: "HSAS Big Band / U19s at Christmas in the Park", date: "Mon, Dec 21", time: "6pm" };
  const calls = [];
  let secondPageStatus = 200;
  const page = {
    async goto(url) {
      calls.push(url);
      const status = url === secondPage ? secondPageStatus : 200;
      return { ok: () => status === 200, status: () => status };
    },
    async evaluate() {
      return calls.at(-1) === firstPage
        ? { rows: [first], hasNextPage: true }
        : { rows: [last], hasNextPage: false };
    },
    async waitForTimeout() {},
  };

  assert.deepEqual((await scrapeSJJazz(page, { today })).map(event => event.title), [first.title, last.title]);
  assert.deepEqual(calls, [firstPage, secondPage]);
  secondPageStatus = 404;
  await assert.rejects(scrapeSJJazz(page, { today }), /calendar page 2 returned HTTP 404/);
});

test("the December Break Room jazz jam keeps its published open jam time", () => {
  const raw = { date: "2026-12-04", url: "https://sanjosejazz.org/events/sjz-break-room-jazz-jam-3/",
    description: "The SJZ U19s and the Michael Webster Group play before the jam." };
  const actual = applyVerifiedEventFacts(raw);
  assert.equal(actual.time, "5:20 PM");
  assert.equal(actual.endTime, "9:00 PM");
  assert.match(actual.description, /High School All Stars.*Michael Webster Quartet.*7 to 9 PM/);
  assert.doesNotMatch(actual.description, /U19s/);
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
