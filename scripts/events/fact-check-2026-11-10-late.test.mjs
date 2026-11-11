import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cleanTitle, polishDescription } from "../generate-events.mjs";
import { scrapeTheTechUpcoming } from "../playwright-scrapers.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";

const { events } = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-10-late.json", import.meta.url)));
const row = id => structuredClone(events.find(event => event.id === id));

test("verified optional library bookings do not close walk-up attendance or reopen later full sessions", () => {
  for (const id of ["sjpl-6920f111c313c23700e355a9", "sjpl-6ab6f970129d8e0031f52185"]) {
    const source = row(id), event = applyVerifiedEventFacts(source);
    assert.equal(event.registration, "none");
    assert.equal(event.registrationClosesBy, null);
    assert.equal(event.attendanceNote, source.attendanceNote);
    for (const registration of ["full", "closed", "appointment-only"]) {
      const later = { ...source, registration };
      assert.deepEqual(applyVerifiedEventFacts(later), later);
    }
    for (const change of [{ date: "2027-11-14" }, { description: "Registration is required. No walk-ins." }]) {
      const later = { ...source, ...change };
      assert.deepEqual(applyVerifiedEventFacts(later), later);
    }
  }
});

test("a sold-out organizer listing cannot become an available newsletter or briefing pick", () => {
  const source = row("inbound-b1af54878462c7c7");
  const event = applyVerifiedEventFacts(source);
  assert.equal(event.registration, "full");
  assert.equal(event.cost, "paid");
  assert.match(event.attendanceNote, /Sold out.*waitlist/);
  assert.equal(isBriefingEventAvailable(event), false);
  assert.equal(applyVerifiedEventFacts({ ...source, registration: "closed" }).registration, "closed");
});

test("dated attendance facts preserve subsequent availability and distinguish the parade window from its start", () => {
  const cpr = applyVerifiedEventFacts(row("scccfd-3ba4d130e598efed"));
  assert.equal(cpr.endTime, "7:30 PM");
  assert.equal(cpr.registration, "required");
  assert.match(cpr.attendanceNote, /Ages 13\+.*Minors.*service area.*does not provide.*certification/);
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...cpr, registration }).registration, registration);
  }
  const parade = applyVerifiedEventFacts(row("inbound-b38369a173298089"));
  assert.equal(parade.time, "11:00 AM");
  assert.equal(parade.endTime, "2:00 PM");
  assert.equal(parade.venue, "Downtown San Jose");
  assert.match(parade.attendanceNote, /parade itself starts at noon/);
  assert.doesNotMatch(parade.description + parade.blurb, /Plaza de San Jose|pre-parade ceremony/);
});

test("a limited giveaway stays conditional and an EMBA recruitment event keeps its real meaning", () => {
  const giveaway = applyVerifiedEventFacts(row("inbound-092e15984d483ea0"));
  assert.match(giveaway.description, /Early arrivals.*while supplies last/);
  assert.match(giveaway.blurb, /early arrivals while supplies last/);
  const emba = applyVerifiedEventFacts(row("scu-a83831bc8f1bc13d"));
  assert.equal(cleanTitle(emba.title), "Premier EMBA Event, Santa Clara University");
  assert.equal(emba.endTime, "9:00 PM");
  assert.match(emba.blurb, /Executive MBA.*alumni/);
  assert.equal(emba.cost, "free");
});

test("sparse SCU copies do not establish public eligibility for the campus Harvesting Hope event", () => {
  const source = row("scu-7d5c59e95bea0ac4");
  assert.equal(isEventPublishable(source), false);
  assert.equal(isEventPublishable({ ...source, date: "2027-11-17" }), true);
  assert.equal(isEventPublishable({ ...source, title: "Public garden tour" }), true);
});

test("museum source facts replace invented puzzles, robot details and participatory laser demonstrations", () => {
  for (const id of ["1bb48fb347ad", "14ac2c3257eb", "a74177bcaf5f"]) {
    const source = row(id), event = applyVerifiedEventFacts(source);
    assert.doesNotMatch(event.blurb, /interactive science|battle.*demons|interactive puzzles|mini robot/);
    assert.ok(event.description.length > 50);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    for (const change of [{ date: "2028-01-01" }, { url: "https://example.org/unrelated" }, { venue: "Another museum" }]) {
      const unrelated = { ...source, ...change };
      assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
    }
  }
  assert.match(applyVerifiedEventFacts(row("1bb48fb347ad")).blurb, /laser effects set to music/);
  assert.equal(polishDescription("Tengar founder Yongey Mingyur Rinpoche joins us."), "Tergar founder Yongey Mingyur Rinpoche joins us.");
});

test("the museum adapter retains its card description and specific ticket URL without expanding date ranges", async () => {
  const link = "https://tickets.thetech.org/events/019c0209-5293-5bea-4c9c-8ad87164827b";
  const source = { title: "LASERS: KPOP Demon Hunters", date: "December 28, 2026 4:45PM - December 30, 2026 4:45PM", venue: "The Tech Interactive", description: "A laser show featuring music from the movie.", link };
  const result = await scrapeTheTechUpcoming({
    goto: async () => {}, waitForTimeout: async () => {}, evaluate: async () => [source],
  }, { today: "2026-11-10" });
  assert.equal(result.length, 1);
  assert.equal(result[0].date, "2026-12-28");
  assert.equal(result[0].endTime, null, "a later occurrence's clock is not this show's finish");
  assert.equal(result[0].description, source.description);
  assert.equal(result[0].url, link);
  assert.equal(result[0].category, "arts");
  const verified = applyVerifiedEventFacts({ ...result[0], title: cleanTitle(result[0].title) });
  assert.doesNotMatch(verified.blurb, /battle|science experience/);
});
