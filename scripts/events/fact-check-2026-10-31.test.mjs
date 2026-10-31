import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchScuEvents, fetchSjsuEvents, resolveRunWindow } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { hasOutOfAreaDestination, requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { snapshotEvent, resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const { events } = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-10-31.json", import.meta.url)));
const row = (id) => structuredClone(events.find((event) => event.id === id));

test("gallery psychic readings never become an exhibition after their start", () => {
  const event = row("eastwestbookshop-c5d7d7517b9e88a6");
  const start = new Date("2026-10-30T18:30:00-07:00"), end = new Date("2026-10-30T21:00:00-07:00");
  assert.deepEqual(resolveRunWindow(start, end, new Date("2026-10-30T18:00:00-07:00"), event), { date: start, ongoing: false });
  assert.equal(resolveRunWindow(start, end, new Date("2026-10-30T20:00:00-07:00"), event), null);
  const show = { title: "Gallery exhibition", description: "Artwork on view.", venue: "Community Gallery" };
  assert.equal(resolveRunWindow(new Date("2026-10-01T00:00:00-07:00"), end, start, show)?.ongoing, true);
});

test("retained psychic-reading pages keep clocks, paid adult admission and the entry cutoff", () => {
  const event = row("eastwestbookshop-c5d7d7517b9e88a6");
  const actual = applyVerifiedEventFacts(event);
  assert.equal(actual.time, "6:30 PM"); assert.equal(actual.endTime, "9:00 PM");
  assert.equal(actual.ongoing, false); assert.equal(actual.cost, "paid");
  assert.equal(actual.audienceAge, "adult");
  assert.match(actual.attendanceNote, /18\+.*7:00 PM/);
  assert.equal(snapshotEvent(actual).ongoing, undefined);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("regional alumni events need corroborated destination evidence, not the publishing campus", async () => {
  const origin = "https://events.scu.edu";
  const rows = [
    ["nyc", "Santa Clara Sips NYC", "America/New_York", "Join Santa Clara alumni and friends in NYC for drinks.", "inperson"],
    ["local", "New York art discussion", "America/Los_Angeles", "A campus discussion with an artist from NYC.", "inperson"],
    ["timezone-only", "Public recital", "America/New_York", "Music on campus.", "inperson"],
    ["online", "Santa Clara Sips NYC", "America/New_York", "Join Santa Clara alumni and friends in NYC for drinks.", "Online only"],
  ];
  const xml = `<rss><channel>${rows.map(([slug, title, timezone, description], i) => `<item><title>${title}</title><link>${origin}/alumni-association/event/${i + 1}-${slug}</link><pubDate>Sat, 07 Nov 2026 19:00:00 +0000</pubDate><description>${description}</description><livewhale:id>${i + 1}</livewhale:id><livewhale:timezone>${timezone}</livewhale:timezone><georss:featurename>Community venue</georss:featurename></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch, requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url) === `${origin}/live/rss/events`) return new Response(xml);
    assert.equal(String(url), `${origin}/live/json/events?page=1`);
    return Response.json({ meta: { total_pages: 1 }, data: rows.map(([, , , , onlineType], i) => ({ id: i + 1, online_type: onlineType })) });
  };
  try {
    const result = await fetchScuEvents();
    assert.deepEqual(result.map((event) => event.url.split("/").at(-1)), ["2-local", "3-timezone-only", "4-online"]);
    assert.equal(result.at(-1).virtual, true);
    assert.equal(requested.length, 2, "reuse existing feeds without per-event requests");
  } finally { globalThis.fetch = originalFetch; }
});

test("retained NYC event copies cannot inherit a Santa Clara destination", () => {
  const actual = applyVerifiedEventFacts(row("scu-649446af3eda7d36"));
  assert.equal(actual.city, null);
  assert.equal(actual.venue, "Gottino Enoteca e Salumeria, New York, NY");
  assert.equal(hasOutOfAreaDestination(actual), true);
});

test("NUMU's free registration and The Tech's separate paid activities survive blurb processing", async () => {
  const inputs = [row("inbound-ee379d557fb80d32"), row("inbound-a3235e0ec9b9f93b")];
  await resolveEventBlurbs(inputs, { enabled: false });
  assert.equal(inputs[0].cost, "free"); assert.equal(inputs[0].registration, "required");
  assert.equal(requiresAdvanceRegistration(inputs[0]), true);
  assert.equal(inputs[1].cost, "paid");
  assert.match(inputs[1].attendanceNote, /workshop.*laser shows.*extra/i);
  assert.match(inputs[1].costNote, /38.*28/);
  for (const state of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...inputs[0], registration: state }).registration, state);
  }
  for (const input of inputs) {
    assert.deepEqual(applyVerifiedEventFacts(input), input);
    for (const other of [{ ...input, date: "2027-10-31" }, { ...input, url: "https://example.org/unrelated" }]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("the faculty workshop retains its source clock and the CFETI proper name", () => {
  const input = row("sjsu-d7b488e11e0d9d23"), actual = applyVerifiedEventFacts(input);
  assert.match(actual.description, /CFETI/); assert.match(actual.blurb, /CFETI/);
  assert.equal(actual.time, "1:30 AM", "the fresh page and RSS both publish this clock; never substitute PM");
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("the original downtown newsletter's free admission survives tracked social links", () => {
  const input = row("inbound-c380f2cb4fea9b8f");
  for (const url of [input.url, "https://www.instagram.com/p/DeZtKbOmta2/?img_index=1&mc_cid=tracking"]) {
    const actual = applyVerifiedEventFacts({ ...input, url });
    assert.equal(actual.cost, "free");
    assert.equal(actual.time, "1:00 PM"); assert.equal(actual.endTime, "7:00 PM");
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  }
  for (const other of [{ ...input, date: "2027-10-31" }, { ...input, url: "https://www.instagram.com/p/unrelated/" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("SJSU away games are excluded before title cleanup can remove the destination", async () => {
  const origin = "https://events.sjsu.edu";
  const rows = [
    ["irvine", "Men's Basketball - San Jose State at UC Irvine", "Irvine, Calif.", "inperson"],
    ["davis", "Men's Soccer - San Jose State at UC Davis", "Davis, Calif.", "inperson"],
    ["missing-location", "Men's Basketball - San Jose State at Another University", "", "inperson"],
    ["home", "Men's Basketball - San Jose State vs UC Irvine", "San Jose, Calif.", "inperson"],
    ["campus", "Public recital at Music Building", "Music Building", "inperson"],
    ["virtual", "Remote discussion", "Davis, Calif.", "virtual"],
  ];
  const xml = `<rss><channel>${rows.map(([slug, title]) => `<item><title>${title}</title><link>${origin}/event/${slug}</link><description>Public program.</description><pubDate>2026-11-07T19:00:00-08:00</pubDate></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch, requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url) === `${origin}/calendar.xml`) return new Response(xml);
    assert.match(String(url), /^https:\/\/events\.sjsu\.edu\/api\/2\/events\?/);
    return Response.json({ page: { total: 1 }, events: rows.map(([slug, , location_name, experience]) => ({ event: {
      localist_url: `${origin}/event/${slug}`, location_name, experience, address: "",
    } })) });
  };
  try {
    const events = await fetchSjsuEvents();
    assert.deepEqual(events.map((event) => event.url.split("/").at(-1)), ["home", "campus", "virtual"]);
    assert.equal(events.at(-1).virtual, true);
    assert.equal(requested.length, 2, "reuse the existing source requests");
  } finally { globalThis.fetch = originalFetch; }
});

test("retained SJSU road-game URLs identify the actual destination without a campus photo", () => {
  const cases = [
    ["2026-11-07", "mens-basketball-san-jose-state-at-uc-irvine", "Irvine, Calif."],
    ["2026-11-06", "mens-soccer-san-jose-state-at-uc-davis-5703", "Davis, Calif."],
  ];
  for (const [date, slug, venue] of cases) {
    const event = {
      title: "San Jose State away game", date, time: "7:00 PM", city: "san-jose",
      venue: venue.split(",")[0], address: "", photoRef: "campus-photo", image: "campus-image",
      url: `https://events.sjsu.edu/event/${slug}`,
    };
    const { orphans } = resolveRetired({ entries: [{ slug: `retained-${slug}`, event }] }, [], [], "2026-10-31");
    const corrected = orphans[0].event;
    assert.equal(corrected.venue, venue);
    assert.equal(corrected.city, null);
    assert.equal(corrected.photoRef, null);
    assert.equal(corrected.image, null);
    assert.equal(hasOutOfAreaDestination(corrected), true);
    assert.equal(hasOutOfAreaDestination({ venue: venue.split(",")[0] }), true, "the normalized city-only venue is also out of coverage");
    assert.equal(hasOutOfAreaDestination({ ...corrected, virtual: true }), false);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    for (const unrelated of [{ ...event, date: "2027-11-07" }, { ...event, url: "https://example.org/another-game" }, { ...event, virtual: true }]) {
      assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
    }
  }
  assert.equal(hasOutOfAreaDestination({ venue: "Music Building", description: "Guest from Irvine and Davis." }), false);
});

test("Cantor's November Chinese tour retains its required advance registration", async () => {
  const event = {
    id: "inbound-95d1bb9de8e82cc0", title: "Chinese Language Tour", date: "2026-11-15",
    time: "2:00 PM", endTime: null, venue: "Cantor Arts Center", city: "palo-alto",
    url: "https://events.stanford.edu/event/copy-of-public-tour-cantor-highlights-in-chinese-4381",
    cost: null, description: "A tour of the Cantor's collection offered in Chinese.",
    blurb: "Tour the Cantor's collection with a guide leading the walk-through in Chinese.",
  };
  const actual = structuredClone(event);
  await resolveEventBlurbs([actual], { enabled: false });
  assert.equal(actual.cost, "free");
  assert.equal(actual.registration, "required");
  assert.equal(requiresAdvanceRegistration(actual), true);
  assert.match(actual.attendanceNote, /advance registration is required/i);
  for (const field of ["title", "date", "time", "endTime", "venue", "url", "description", "blurb"]) assert.equal(actual[field], event[field], field);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
  }
  for (const other of [{ ...event, date: "2027-11-15" }, { ...event, url: "https://events.stanford.edu/event/public-tour-cantor-highlights-spanish-language-7060" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});
