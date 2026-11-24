import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cleanTitle, polishDescription } from "../generate-events.mjs";
import { scrapeTheTechUpcoming } from "../playwright-scrapers.mjs";
import { normalizeClockTime } from "../lib/clock-time.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { buildEventSlugs } from "../../src/lib/south-bay/eventSlug.ts";
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

test("the museum calendar keeps separate PG-13 screenings on a shared booking URL", async () => {
  const link = "https://tickets.thetech.org/events/01a0f8a9-e4e2-59f2-90c5-8daebe40da6e";
  const raw = ["5:30PM", "8:15PM"].map(clock => ({
    title: "Hunger Games: Sunrise on the Reaping", date: `November 22, 2026 ${clock}`, link,
  }));
  const result = await scrapeTheTechUpcoming({
    goto: async () => {}, waitForTimeout: async () => {}, evaluate: async () => raw,
  }, { today: "2026-11-20" });
  const shows = result.map((event, index) => applyVerifiedEventFacts({
    ...event, id: index ? "a-evening" : "z-early", time: normalizeClockTime(event.time),
  }));
  assert.equal(shows.length, 2);
  for (const show of shows) {
    assert.equal(show.category, "arts");
    assert.equal(show.kidFriendly, false);
    assert.equal(show.attendanceNote, "Film rated PG-13.");
    assert.equal(show.url, link);
  }
  assert.equal(fuzzyDedupEvents(shows).kept.length, 2);
  assert.deepEqual([...buildEventSlugs(shows).values()].map(show => show.time), ["5:30 PM", "8:15 PM"]);
  const wrongClock = { ...shows[1], time: "9:00 PM" };
  assert.equal(fuzzyDedupEvents([shows[0], wrongClock]).kept.length, 1);
  const otherBooking = "https://example.org/events/screening";
  assert.equal(fuzzyDedupEvents(shows.map(show => ({ ...show, url: otherBooking }))).kept.length, 1);
});

test("The Tech's workshop calendar uses the booking sessions and their Pacific clocks", async () => {
  const link = "https://tickets.thetech.org/events/01a1bdd1-4d1f-1c8c-9ed0-69944820e7c4";
  const card = {
    title: "DIY Snow Globes (Winter Wonderlab)",
    date: "December 19, 2026 2:00PM - December 26, 2026 3:00PM",
    venue: "The Tech Interactive",
    link,
  };
  const page = { goto: async () => {}, waitForTimeout: async () => {}, evaluate: async () => [card, card] };
  const sessions = [
    { start_datetime: "2026-12-19T22:00:00Z", end_datetime: "2026-12-19T23:00:00Z", sold_out: false },
    { start_datetime: "2026-12-20T23:00:00Z", end_datetime: "2026-12-21T00:00:00Z", sold_out: true },
  ];
  const requests = [];
  const rows = await scrapeTheTechUpcoming(page, {
    today: "2026-12-20",
    fetchBooking: async (url) => {
      requests.push(url.href);
      return { event_session: { _total: sessions.length, _data: sessions } };
    },
  });
  assert.deepEqual(requests, [
    "https://tickets.thetech.org/api/events/01a1bdd1-4d1f-1c8c-9ed0-69944820e7c4/sessions?_sort=start_datetime",
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-12-20");
  assert.equal(rows[0].time, "3:00PM");
  assert.equal(rows[0].endTime, "4:00 PM");
  assert.equal(rows[0].registration, "full");
  assert.deepEqual(rows[0].occurrenceEvidence, {
    kind: "first-party-occurrence-page", sourceUrl: link, date: "2026-12-20", time: "3:00 PM",
  });
  await assert.rejects(scrapeTheTechUpcoming(page, {
    today: "2026-12-19",
    fetchBooking: async () => ({ event_session: { _total: 4, _data: sessions } }),
  }), /Incomplete booking schedule/);
});
