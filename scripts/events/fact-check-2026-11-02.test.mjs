import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FARMERS_MARKETS, fetchFarmersMarketEvents, fetchSjsuEvents, fetchInboundEvents, inferCategory } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/sjsu-event-categories-2026-11-02.json", import.meta.url)));

test("Los Gatos market projections use the organizer's intersection rather than an unsupported street number", async () => {
  const source = readFileSync(new URL("../lib/fixtures/los-gatos-farmers-market-2026-11-02.txt", import.meta.url), "utf8");
  assert.match(source, /Town Park Plaza on Main Street & N\. Santa Cruz Avenue/);
  const market = FARMERS_MARKETS.find((entry) => entry.title === "Los Gatos Farmers Market");
  const events = await fetchFarmersMarketEvents({
    today: "2026-11-02", markets: [market],
    fetchImpl: async (url) => { assert.equal(url, market.url); return new Response(source); },
    notify: async () => assert.fail("The verified market schedule must not alert"),
  });
  assert.equal(events.length, 13);
  assert.equal(events[0].date, "2026-11-08");
  assert.equal(events.at(-1).date, "2027-01-31");
  for (const event of events) {
    assert.equal(event.address, "Main St & N Santa Cruz Ave, Los Gatos");
    assert.equal(event.venue, "Town Park Plaza");
    assert.equal(event.time, "9:00 AM");
    assert.equal(event.endTime, "1:00 PM");
    assert.equal(event.projectedRecurrence, true);
  }
});

test("SJSU film and startup titles outrank incidental course and showcase wording", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-02T02:00:00-08:00") });
  const xml = `<rss><channel>${fixture.items.map((item) => `<item><title><![CDATA[${item.title}]]></title><description><![CDATA[${item.description}]]></description><pubDate>${item.pubDate}</pubDate><link>${item.link}</link></item>`).join("")}</channel></rss>`;
  t.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://events.sjsu.edu");
    if (request.pathname === "/calendar.xml") return new Response(xml);
    assert.equal(request.pathname, "/api/2/events");
    return Response.json({ page: { total: 1 }, events: fixture.items.map((item) => ({ event: {
      localist_url: item.link, location_name: item.location_name, address: item.address,
      experience: "inperson", filters: {},
    } })) });
  });
  const events = await fetchSjsuEvents();
  assert.equal(events.length, 2);
  const movie = events.find((event) => event.url.includes("metropolis"));
  const pitch = events.find((event) => event.url.includes("gen-ai-pitch"));
  assert.equal(movie.category, "arts");
  assert.equal(movie.date, "2026-11-10");
  assert.equal(movie.time, "3:30 PM");
  assert.equal(pitch.category, "community");
  assert.equal(pitch.date, "2026-11-12");
  assert.equal(pitch.time, "11:00 AM");
  assert.equal(pitch.venue, "Mitchell Park Community Center");
  assert.match(pitch.address, /Palo Alto, CA 94303/);
  assert.equal(inferCategory("Film Event: Metropolis", "Part of a class and reading program.", ""), "arts");
  assert.equal(inferCategory("Computer Science Lecture", "A course on computing.", ""), "education");
});

test("reviewed newsletters keep the Nutcracker age, price and registration conditions", () => {
  const [event] = fetchInboundEvents({ today: "2026-11-02", events: [{
    id: "reviewed-nutcracker-day-trip", title: "The Nutcracker: San Francisco Ballet Day Trip",
    cityKey: "sunnyvale", startsAt: "2026-12-17T12:30:00-08:00", endsAt: "2026-12-17T18:00:00-08:00",
    location: "San Francisco Opera House", description: "Senior Center day trip for ages 50 and up. $111 Resident/$139 Nonresident. Lunch is not included.",
    sourceUrl: "https://anc.apm.activecommunities.com/sunnyvaleactivities/activity/search/detail/3059?onlineSiteId=0&locale=en-US&from_original_cui=true",
  }] });
  const corrected = applyVerifiedEventFacts({ ...event, audienceAge: "all" });
  assert.equal(corrected.cost, "paid");
  assert.equal(corrected.audienceAge, "adult");
  assert.equal(corrected.registration, "required");
  assert.match(corrected.attendanceNote, /50.*older/);
  assert.match(corrected.attendanceNote, /\$111.*\$139/);
  assert.match(corrected.attendanceNote, /lunch is not included/i);
  assert.equal(corrected.time, "12:30 PM");
  assert.equal(corrected.endTime, "6:00 PM");
  for (const registration of ["closed", "full", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...corrected, registration }).registration, registration);
  }
  for (const unrelated of [
    { ...event, date: "2027-12-17" },
    { ...event, url: "https://example.org/another-trip" },
  ]) assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});

test("dated admission and concert corrections stay bound to their reviewed sources", () => {
  const cases = [
    { date: "2026-11-10", url: "https://events.sjsu.edu/event/humhonculturecon-movie-event-metropolis-1927", cost: "free" },
    { date: "2026-11-10", url: "https://events.sjsu.edu/event/hearst-award-camille-zapata", cost: "free" },
    { date: "2026-11-14", url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/111020/", registration: "required" },
    ...[
      "https://montalvoarts.org/experience/carriage-house-concerts/irish-christmas-2/",
      "https://montalvoarts.org/experience/carriage-house-concerts/irish-christmas-2/?promo=",
      "https://my.montalvoarts.org/3113/3157",
    ].map((url) => ({ date: "2026-12-10", url, category: "music", cost: "paid" })),
  ];
  for (const { date, url, ...expected } of cases) {
    const input = { date, url, time: "7:30 PM", endTime: null, cost: null, category: "arts" };
    const corrected = applyVerifiedEventFacts(input);
    for (const [key, value] of Object.entries(expected)) assert.equal(corrected[key], value, url);
    assert.equal(corrected.time, input.time);
    assert.equal(corrected.endTime, null);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    if (url.includes("hearst-award")) assert.match(corrected.attendanceNote, /4 PM.*4:30 PM/);
    for (const unrelated of [{ ...input, date: "2027-12-10" }, { ...input, url: "https://example.org/unrelated" }]) {
      assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
    }
  }
});
