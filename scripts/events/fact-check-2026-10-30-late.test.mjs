import test from "node:test";
import assert from "node:assert/strict";
import { fetchSjsuEvents } from "../generate-events.mjs";
import { hasOutOfAreaDestination } from "../../src/lib/south-bay/eventFilters.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { normalizePlaywrightEvent } from "../playwright-scrapers.mjs";
import { resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";

test("SJSU uses source location names and excludes away games without postal addresses", async () => {
  const origin = "https://events.sjsu.edu";
  const rows = [
    ["away", "Women's Volleyball - San Jose State vs. Grand Canyon at Phoenix, Ariz.", "Phoenix, Ariz.", "inperson"],
    ["home", "Women's Volleyball - San Jose State vs. Visitors at San Jose, Calif.", "San Jose, Calif.", "inperson"],
    ["partner", "Public workshop", "Cupertino Community Hall", "inperson"],
    ["campus", "Public recital", "Music Building", "inperson"],
    ["hidden", "Public discussion", "Sign in to download the location", "inperson"],
    ["online", "Remote workshop", "Phoenix, Ariz.", "virtual"],
  ];
  const xml = `<rss><channel>${rows.map(([slug, title]) => `<item><title>${title}</title><link>${origin}/event/${slug}</link><description>Public program.</description><pubDate>2026-11-05T17:00:00-08:00</pubDate></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch;
  const requested = [];
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
    assert.deepEqual(events.map((event) => event.url.split("/").at(-1)), ["home", "partner", "campus", "hidden", "online"]);
    assert.equal(events[0].venue, "San Jose, Calif.");
    assert.equal(events[1].venue, "Cupertino Community Hall");
    assert.equal(events[1].city, "cupertino");
    assert.equal(events[2].venue, "Music Building");
    assert.equal(events[3].venue, "San Jose State University");
    assert.equal(events[4].virtual, true);
    assert.ok(events.every((event) => event.address === ""), "do not invent street addresses");
    assert.equal(requested.length, 2, "reuse the existing RSS and metadata requests");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("city/state locations outrank an inherited campus, while descriptions cannot set geography", () => {
  for (const venue of ["Phoenix, Ariz.", "Phoenix, AZ", "Phoenix, Arizona", "Seattle, Wash.", "Portland, OR", "Savannah, Georgia"]) {
    assert.equal(hasOutOfAreaDestination({ venue, address: "" }), true, venue);
    assert.equal(hasOutOfAreaDestination({ venue: "San Jose State University", location: venue }), true, venue);
    assert.equal(hasOutOfAreaDestination({ venue, virtual: true }), false, venue);
  }
  for (const venue of ["San Jose, Calif.", "San Jose, CA", "Cupertino Community Hall", "King Library"]) {
    assert.equal(hasOutOfAreaDestination({ venue, description: "A speaker visiting from Phoenix, Ariz." }), false, venue);
  }
});

test("the retained road-match URL cannot send readers to the inherited San Jose campus", () => {
  const event = {
    id: "sjsu-b2bdebe893678b79", date: "2026-11-05", time: "5:00 PM",
    title: "Women's Volleyball - San Jose State vs. Grand Canyon at Phoenix, Ariz",
    url: "https://events.sjsu.edu/event/womens-volleyball-san-jose-state-vs-grand-canyon",
    venue: "San Jose State University", city: "san-jose", photoRef: "campus-photo",
  };
  const { orphans } = resolveRetired({ entries: [{ slug: "old-road-match-url", event }] }, [], [], "2026-10-30");
  assert.equal(orphans.length, 1);
  const corrected = orphans[0].event;
  assert.equal(corrected.venue, "Phoenix, Ariz.");
  assert.equal(corrected.city, null);
  assert.equal(corrected.photoRef, null);
  assert.equal(hasOutOfAreaDestination(corrected), true, "the normal generator gate also excludes a sparse old snapshot");
  assert.deepEqual(applyVerifiedEventFacts({ ...event, date: "2027-11-05" }), { ...event, date: "2027-11-05" });
});

const smoke = {
  title: "Who Want the Smoke 2026", date: "2026-11-20", time: "7:00 PM", endTime: null,
  venue: "SAP Center", address: "525 W Santa Clara St, San Jose, CA 95113", city: "san-jose",
  url: "https://www.sapcenter.com/events/detail/who-want-the-smoke-2026",
  source: "SAP Center", category: "community", cost: "paid", description: "",
  blurb: "Head to SAP Center on Friday evening for the community event Who Want the Smoke 2026, listed under the community category.",
};
const qin = {
  title: "Renée Qin and Ania Filochowska: The World We Speak Into Being",
  date: "2027-02-04", time: "7:00 PM", endTime: null, venue: "The Studio", cost: null,
  url: "https://live.stanford.edu/events/26-27season/studio/renee-qin-and-ania-filochowska-the-world-we-speak-into-being/",
  category: "education", description: "Harpist-composer Renée Qin and violinist Ania Filochowska create a multimedia experience co-created with the audience, exploring how technology can amplify our stories.",
  blurb: "Watch harpist Renée Qin and violinist Ania Filochowska build a multimedia performance with audience input.",
};

test("verified concert categories survive sparse snapshot normalization and repeated copy passes", () => {
  const snapshot = applyVerifiedEventFacts(normalizePlaywrightEvent(smoke));
  assert.equal(snapshot.category, "music");
  for (const input of [smoke, qin]) {
    const actual = applyVerifiedEventFacts(input);
    assert.equal(actual.category, "music");
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    for (const field of ["date", "time", "endTime", "venue", "cost", "url"]) assert.equal(actual[field], input[field], field);
    assert.deepEqual(applyVerifiedEventFacts({ ...input, date: "2028-11-20" }), { ...input, date: "2028-11-20" });
    assert.deepEqual(applyVerifiedEventFacts({ ...input, url: "https://example.org/another-event" }), { ...input, url: "https://example.org/another-event" });
  }
  const corrected = applyVerifiedEventFacts(smoke);
  assert.match(corrected.blurb, /Shoreline Mafia/);
  assert.doesNotMatch(corrected.blurb, /community (?:event|category)/i);
  assert.equal(applyVerifiedEventFacts(qin).blurb, qin.blurb, "accurate performance copy stays intact");
});

test("the dated Stanford occurrence preserves Filochowska's source spelling across refreshes", () => {
  const typo = { ...qin, category: "music", title: qin.title.replace("Filochowska", "Filochowka") };
  const corrected = applyVerifiedEventFacts(typo);
  assert.deepEqual(corrected, { ...typo, title: qin.title });
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  for (const unrelated of [
    { ...typo, date: "2028-02-04" },
    { ...typo, title: "Another performance", url: "https://example.org/another-performance" },
  ]) assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
});
