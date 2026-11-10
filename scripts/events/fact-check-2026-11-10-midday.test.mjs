import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { fetchSjsuEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { eventBlurbCacheKey, resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-10-midday.json", import.meta.url)));
const openHouses = fixture.events.slice(0, 2);

test("SJSU's sparse RSS and cached publication retain open-house finishes and online access instructions", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.reviewedAt) });
  const xml = `<rss><channel>${openHouses.map((event, i) => `<item><title>${event.title.replace("MSIDT", "Msidt").replace("MLIS", "Mlis")}</title><description><![CDATA[${event.description}]]></description><pubDate>${new Date(fixture.sourceFacts[i].startDate).toUTCString()}</pubDate><link>${event.url}</link></item>`).join("")}</channel></rss>`;
  t.mock.method(globalThis, "fetch", async url => {
    const request = new URL(url);
    assert.equal(request.origin, "https://events.sjsu.edu");
    if (request.pathname === "/calendar.xml") return new Response(xml);
    assert.equal(request.pathname, "/api/2/events");
    return Response.json({ page: { total: 1 }, events: openHouses.map(event => ({ event: {
      localist_url: event.url, experience: "virtual", filters: {},
    } })) });
  });
  const events = await fetchSjsuEvents();
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.title), openHouses.map(event => event.title), "restore source acronyms before fact matching");
  await resolveEventBlurbs(events, { enabled: false });
  for (const actual of events) {
    assert.equal(actual.time, "5:30 PM");
    assert.equal(actual.endTime, "6:30 PM");
    assert.equal(actual.virtual, true);
    assert.match(actual.attendanceNote, /Register through the organizer's event page to receive the online participation link/);
    assert.equal(actual.registration, undefined, "do not infer a mandatory advance gate from the invitation");
    assert.equal(actual.cost, null, "do not infer free admission");
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  }
});

test("open-house corrections preserve later booking notices and stay within their dated source and venue", () => {
  for (const event of openHouses) {
    for (const registration of ["full", "closed", "appointment"]) {
      const actual = applyVerifiedEventFacts({ ...event, registration, attendanceNote: "Later organizer notice." });
      assert.equal(actual.registration, registration);
      assert.match(actual.attendanceNote, /^Later organizer notice\./);
      assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    }
    for (const change of [{ date: "2027-11-17" }, { url: "https://events.sjsu.edu/event/unrelated" }, { venue: "Another venue" }]) {
      const other = { ...event, ...change };
      assert.deepEqual(applyVerifiedEventFacts(other), other);
    }
    const actual = applyVerifiedEventFacts(event);
    for (const key of Object.keys(event).filter(key => !["endTime", "attendanceNote"].includes(key))) assert.deepEqual(actual[key], event[key], key);
  }
});

test("carried parade copy loses its unsupported ceremony sequence without changing the occurrence", async () => {
  const event = fixture.events[2];
  const events = [structuredClone(event)];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].blurb, "Attend the MOAA Silicon Valley Veterans Day parade and ceremony in downtown San Jose.");
  assert.equal(events[0].description, "Veterans Day parade and ceremony in downtown San Jose, listed in Supervisor Otto Lee's community newsletter.");
  for (const key of Object.keys(event).filter(key => !["blurb", "description"].includes(key))) assert.deepEqual(events[0][key], event[key], key);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const change of [{ date: "2027-11-11" }, { url: "https://example.org/another-parade" }, { venue: "Another venue" }]) {
    const other = { ...event, source: "Another source", ...change };
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("restoring the parade source link cannot let its old cached claims override conservative copy", async t => {
  const event = fixture.events[2];
  const originalRead = fs.readFileSync;
  const cache = { byKey: { [eventBlurbCacheKey(event)]: { blurb: event.blurb } } };
  t.mock.method(fs, "readFileSync", (path, ...args) => String(path).endsWith("event-blurb-cache.json")
    ? JSON.stringify(cache) : originalRead(path, ...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const carried = { ...event, url: "" };
  delete carried.blurb;
  await resolveEventBlurbs([carried], { enabled: false });
  assert.equal(carried.url, fixture.sourceFacts[2].url);
  assert.equal(carried.blurb, "Attend the MOAA Silicon Valley Veterans Day parade and ceremony in downtown San Jose.");
  assert.doesNotMatch(carried.description, /elected officials|will march/);
  assert.equal(carried.time, "12:00 PM");
});
