import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { hasOutOfAreaDestination, LOCAL_DEPARTURE_TRIP, requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";
import { fetchScuEvents, fetchStanfordEvents } from "../generate-events.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-02-afternoon.json", import.meta.url)));
const row = id => structuredClone(fixture.events.find(event => event.id === id));

test("Theft keeps its dated Wednesday meeting while correcting the book year in source and cached copy", async () => {
  const source = row("sccl-6ab592174852aa18b5b0a4fc"), original = structuredClone(source);
  const events = [structuredClone(source)];
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.match(actual.description, /2025 novel Theft/);
  assert.match(actual.blurb, /2025 novel Theft/);
  assert.doesNotMatch(actual.description, /third Thursday/);
  assert.match(actual.description, /Room 201B/);
  for (const key of Object.keys(source)) if (!["description", "blurb"].includes(key)) assert.deepEqual(actual[key], source[key], key);
  assert.deepEqual(source, original);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  assert.equal(actual.date, "2026-11-18");
  assert.equal(actual.time, "11:00 AM");
  assert.equal(actual.endTime, "12:30 PM");
});

test("book corrections stay bound to the exact occurrence and preserve later corrected source text", () => {
  const source = row("sccl-6ab592174852aa18b5b0a4fc");
  const alias = applyVerifiedEventFacts({ ...source, url: source.url.replace("/events/", "/v2/events/") });
  assert.match(alias.description, /2025 novel Theft/);
  for (const unrelated of [
    { ...source, date: "2027-11-18" },
    { ...source, url: "https://example.org/another-book-discussion" },
    { ...source, description: "Discuss the novel Theft in Room 201B.", blurb: "Discuss Theft with the library group." },
  ]) assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
});

test("SCU's real RSS adapter preserves its locally departing trip and elapsed signup deadline through publication", async t => {
  const source = row("scu-271b4132f5822d7a");
  const xml = `<rss><channel><item><title>${source.title}</title><link>${source.url}</link><pubDate>Fri, 06 Nov 2026 08:30:00 -0800</pubDate><description><![CDATA[It's our most anticipated experience of the year!]]></description><location>Hilton Union Square</location></item></channel></rss>`;
  t.mock.method(globalThis, "fetch", async url => {
    const request = new URL(url);
    assert.equal(request.origin, "https://events.scu.edu");
    if (request.pathname === "/live/rss/events") return new Response(xml);
    assert.equal(request.pathname, "/live/json/events");
    return Response.json({ meta: { total_pages: 1 }, data: [fixture.scuSource] });
  });
  const events = await fetchScuEvents();
  assert.equal(events.length, 1);
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.equal(actual.registration, "required");
  assert.equal(actual.attendanceStatus, "needs-confirmation");
  assert.match(actual.title, /SCU day trip/);
  assert.equal(actual.city, "santa-clara");
  assert.equal(actual.time, "8:30 AM");
  assert.equal(actual.endTime, null);
  assert.match(actual.attendanceNote, /October 5/);
  assert.match(actual.attendanceNote, /SCU/);
  assert.equal(actual.cost, "free");
  assert.equal(actual.address, "333 O'Farrell Street, San Francisco, CA 94102");
  assert.equal(LOCAL_DEPARTURE_TRIP.test(actual.title), true, "preserve genuine local departures in the feed");
  assert.equal(hasOutOfAreaDestination(actual), true, "the destination is still outside day-plan coverage");
  assert.equal(requiresAttendanceConfirmation(actual), true);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("Stanford eligibility and public Zoom access survive the real importer, including contradictory audience tags", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-02T14:00:00-08:00") });
  const [bike, book, wellness] = fixture.stanfordSources;
  const publicClass = { ...bike, id: 99901, title: "Public Bicycle Class", custom_fields: {},
    description_text: "This free class is open to the general public.", description: "This free class is open to the general public.",
    filters: { event_audience: [{ name: "Everyone" }] } };
  const privateClass = { ...bike, id: 99902, title: "Campus transport class", description_text: "Practice riding.",
    filters: { event_audience: [{ name: "Everyone" }] } };
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(url).origin, "https://events.stanford.edu");
    return Response.json({ events: [bike, book, wellness, publicClass, privateClass].map(event => ({ event })) });
  });
  const events = await fetchStanfordEvents();
  assert.equal(events.some(event => event.id.includes(String(bike.id))), false);
  assert.equal(events.some(event => event.id.includes("99902")), false);
  assert.equal(events.some(event => event.id.includes("99901")), true);
  const talk = events.find(event => event.id.includes(String(book.id)));
  assert(talk);
  assert.equal(talk.virtual, true);
  assert.equal(talk.venue, "Online (Zoom)");
  assert.equal(talk.address, "");
  assert.match(talk.attendanceNote, /In-person attendance is limited/);
  const stale = row("stanford-54223394113762-2026-11-03");
  assert.equal(isEventPublishable(stale), false);
  assert.equal(isEventPublishable({ ...stale, date: "2027-11-03" }), true);
  assert.equal(isEventPublishable({ ...stale, title: "Public Bicycle Class" }), true);
});

test("Stanford's public book talk stays online through cached publication without losing its clock", async () => {
  const source = row("stanford-54125978092384-2026-11-03");
  const events = [structuredClone(source)];
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.equal(actual.virtual, true);
  assert.equal(actual.venue, "Online (Zoom)");
  assert.equal(actual.address, "");
  assert.equal(actual.cost, "free");
  assert.match(actual.attendanceNote, /In-person attendance is limited/);
  assert.equal(actual.time, source.time);
  assert.equal(actual.endTime, source.endTime);
  assert.equal(actual.registration, undefined, "a linked form alone does not establish mandatory signup");
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const unrelated of [{ ...source, date: "2027-11-03" }, { ...source, url: "https://example.org/another-talk" }]) {
    assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  }
});

test("the wellness RSVP request stays an elapsed deadline requiring confirmation, not a made-up closure", async () => {
  const source = row("stanford-54383500169589-2026-11-03");
  const events = [structuredClone(source)];
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.equal(actual.cost, "free");
  assert.equal(actual.attendanceStatus, "needs-confirmation");
  assert.match(actual.attendanceNote, /November 1 at 11:59 PM Pacific/);
  assert.match(actual.attendanceNote, /meeting room/);
  assert.equal(actual.venue, source.venue);
  assert.equal(actual.registration, undefined);
  assert.equal(actual.time, source.time);
  assert.equal(actual.endTime, source.endTime);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const unrelated of [{ ...source, date: "2027-11-03" }, { ...source, url: "https://example.org/another-session" }]) {
    assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  }
});

test("the trip's source aliases and cached blurb cannot restore an available local conference", async () => {
  const source = row("scu-271b4132f5822d7a");
  for (const url of [source.url,
    "https://events.scu.edu/ciocca-center/event/517331-startup-world-cup-grand-finale",
    "https://events.scu.edu/campus-calendar/event/517331-startup-world-cup-grand-finale",
    "https://events.scu.edu/event/517331-startup-world-cup-grand-finale",
  ]) {
    const events = [{ ...source, url }];
    await resolveEventBlurbs(events, { enabled: false });
    const actual = events[0];
    assert.equal(actual.registration, "required");
    assert.equal(actual.attendanceStatus, "needs-confirmation");
    assert.match(actual.blurb, /day trip/);
    assert.match(actual.blurb, /confirm late signup/);
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    for (const unrelated of [
      { ...source, url: "https://example.org/another-conference" },
      { ...source, date: "2027-11-06" },
    ]) assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  }
});
