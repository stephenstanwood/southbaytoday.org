import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchSjsuEvents, fetchStanfordEvents } from "../generate-events.mjs";
import { applyVerifiedSjsuEventOverride } from "../lib/sjsu-event-overrides.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { requiresAttendanceConfirmation, requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

const posters = JSON.parse(readFileSync(new URL("../lib/fixtures/sjsu-posters-2026-11-05.json", import.meta.url)));
const stanford = JSON.parse(readFileSync(new URL("../lib/fixtures/stanford-attendance-2026-11-06.json", import.meta.url)));
const nathan = JSON.parse(readFileSync(new URL("../lib/fixtures/paloalto-nathan-2026-12-19.json", import.meta.url)));

test("the concert's changed header does not justify a two-hour blurb or a guessed finish", async () => {
  const before = structuredClone(nathan);
  assert.equal(nathan.event.definition.start, "2026-12-19T14:00");
  assert.equal(nathan.event.definition.end, "2026-12-19T15:30");
  assert.match(nathan.event.definition.description, /two-hour/);
  const fixed = applyVerifiedEventFacts(nathan.publishedBefore);
  assert.equal(fixed.time, "2:00 PM");
  assert.equal(fixed.endTime, "3:30 PM");
  assert.doesNotMatch(fixed.blurb, /two-hour/);
  assert.match(fixed.attendanceNote, /2–3:30 PM.*two-hour/);
  assert.equal(fixed.registration, "none");
  assert.equal(fixed.registrationClosesBy, null);
  assert.equal(requiresAttendanceConfirmation(fixed), true);
  const events = [structuredClone(nathan.publishedBefore)];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].blurb, fixed.blurb);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const resolved of [
    { ...nathan.publishedBefore, endTime: "4:00 PM" },
    { ...nathan.publishedBefore, description: "Hear the band perform. No registration required." },
  ]) {
    const actual = applyVerifiedEventFacts(resolved);
    assert.equal(actual.attendanceStatus, undefined, "a fresh resolved source does not inherit the old conflict");
    assert.equal(actual.blurb, resolved.blurb);
    assert.equal(actual.endTime, resolved.endTime);
  }
  const unrelated = { ...nathan.publishedBefore, url: "https://paloalto.bibliocommons.com/events/another-performance" };
  assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  assert.deepEqual(nathan, before);
});

test("captured SJSU reminder dates become the two poster-confirmed programs", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(posters.retrievedAt) });
  const before = structuredClone(posters);
  const xml = `<rss><channel>${posters.rss.map(item => `<item><title><![CDATA[${item.title}]]></title><description><![CDATA[${item.description}]]></description><pubDate>${item.pubDate}</pubDate><link>${item.link}</link></item>`).join("")}</channel></rss>`;
  t.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://events.sjsu.edu");
    if (request.pathname === "/calendar.xml") return new Response(xml);
    assert.equal(request.pathname, "/api/2/events");
    return Response.json({ page: { total: 1 }, events: posters.sourceUrls.map(url => ({ event: {
      localist_url: url, experience: "inperson", filters: {},
      location_name: url.includes("reading-program") ? "Campus Village B" : "King Library",
    } })) });
  });
  const parsed = await fetchSjsuEvents();
  assert.equal(parsed.length, 3, "only the real reading program and two copies of the real movie survive intake");
  const events = fuzzyDedupEvents(parsed.map(e => applyVerifiedEventFacts(e))).kept;
  assert.equal(events.length, 2);
  const reading = events.find(e => e.url === posters.sourceUrls[0]);
  assert.equal(reading.date, "2026-11-09");
  assert.equal(reading.time, "3:30 PM");
  assert.equal(reading.endTime, null, "the film's finish is unknown");
  assert.match(reading.venue, /Campus Village B RAC.*Uchida Hall 124/);
  assert.equal(reading.address, "", "a two-building program cannot inherit one building's street address");
  assert.match(reading.attendanceNote, /3:30–4:30 PM.*5:30 PM/);
  const movie = events.find(e => e.url === posters.sourceUrls[2]);
  assert.equal(movie.date, "2026-11-10");
  assert.equal(movie.time, "3:30 PM");
  assert.equal(movie.endTime, "6:30 PM");
  assert.equal(movie.cost, "free");
  assert.match(movie.venue, /Room 225/);
  assert.match(movie.description, /live accompaniment/);
  assert.deepEqual(posters, before, "captured sources remain immutable");
});

test("stale published rows cannot recover reminder dates, midnight clocks or duplicate movie copy", async () => {
  const originals = structuredClone(posters.publishedBefore);
  const kept = originals.map(e => applyVerifiedSjsuEventOverride(e)).filter(Boolean).map(e => applyVerifiedEventFacts(e));
  const events = fuzzyDedupEvents(kept).kept;
  assert.equal(events.length, 2);
  for (const original of posters.publishedBefore) {
    const corrected = applyVerifiedEventFacts(original);
    assert.equal(corrected.date, original.url.includes("reading-program") ? "2026-11-09" : "2026-11-10");
    assert.equal(corrected.time, "3:30 PM", "old published URLs get the real date and clock too");
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }
  await resolveEventBlurbs(events, { enabled: false });
  assert(events.every(e => e.time === "3:30 PM"));
  assert.equal(events.find(e => e.date === "2026-11-10").endTime, "6:30 PM");
  for (const event of events) assert.deepEqual(applyVerifiedEventFacts(event), event);
  for (const url of posters.sourceUrls.slice(0, 2)) {
    for (const date of ["2026-11-05", "2026-11-06", "2027-11-09"]) {
      assert.equal(applyVerifiedSjsuEventOverride({ url, date }), null);
    }
  }
  const unrelated = { date: "2026-11-09", time: "12:00 AM", url: "https://events.sjsu.edu/event/a-real-midnight-event" };
  assert.deepEqual(applyVerifiedSjsuEventOverride(unrelated), unrelated);
  assert.deepEqual(originals, posters.publishedBefore);
});

test("Stanford's full body preserves mandatory booking without treating optional forms as gates", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(stanford.retrievedAt) });
  const source = structuredClone(stanford);
  const base = source.events[0].event;
  const controls = [
    ["No registration is required. Sign up for an optional reminder.", undefined],
    ["Registration is requested but not required.", undefined],
    ["Advance registration required. Register through our form.", "required"],
    ["Registration is required. Registration is now closed.", "closed"],
    ["Registration is required. This event is full.", "full"],
  ].map(([description_text, expected], index) => ({ event: {
    ...base, id: `control-${index}`, title: `Public workshop ${index}`,
    localist_url: `https://events.stanford.edu/event/registration-control-${index}`,
    description_text, description: description_text, _expectedRegistration: expected,
  } }));
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), stanford.sourceUrl);
    return Response.json({ events: [...source.events, ...controls] });
  });
  const events = await fetchStanfordEvents();
  for (const { event } of controls) {
    assert.equal(events.find(e => e.url === event.localist_url).registration, event._expectedRegistration);
  }
  const symposium = events.find(e => e.url.includes("rosenkranz"));
  assert.equal(symposium.registration, "required", "the requirement lies beyond the display excerpt");
  const corrected = applyVerifiedEventFacts(symposium);
  assert.equal(corrected.cost, "free");
  assert.equal(requiresAdvanceRegistration(corrected), true);
  assert.equal(requiresAttendanceConfirmation(corrected), true);
  assert.match(corrected.attendanceNote, /November 3.*Confirm late registration/);
  assert.equal(corrected.registrationClosesBy, undefined, "no cutoff clock is published");
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...symposium, registration }).registration, registration);
  }
  const online = applyVerifiedEventFacts(events.find(e => e.url.includes("regulatory-policy")));
  assert.equal(online.virtual, true);
  assert.equal(online.registration, "required");
  assert.match(online.attendanceNote, /register.*Zoom|Zoom.*Register/i);
  const collab = events.find(e => e.url.includes("collab-lab"));
  assert.equal(isEventPublishable(collab), false, "public audience tags cannot settle conflicting eligibility");
  assert.equal(isEventPublishable({ ...collab, date: "2026-12-04" }), true);
  assert.equal(isEventPublishable({ ...collab, title: "Another public music workshop", url: "https://events.stanford.edu/event/another-workshop" }), true);
  for (const event of [corrected, online]) assert.deepEqual(applyVerifiedEventFacts(event), event);
  assert.deepEqual(source, stanford);
});
