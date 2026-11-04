import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchSjsuEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/sjsu-public-scholar-2026-11-13.json", import.meta.url)));

test("the SJSU refresh retains the public-scholar conversation's mandatory preregistration", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-04T03:07:00-08:00") });
  assert.match(fixture.structuredEvent.description, /pre-registration is required/);
  const item = fixture.rss;
  const xml = `<rss><channel><item><title><![CDATA[${item.title}]]></title><description><![CDATA[${item.description}]]></description><pubDate>${item.pubDate}</pubDate><link>${item.link}</link></item></channel></rss>`;
  t.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://events.sjsu.edu");
    if (request.pathname === "/calendar.xml") return new Response(xml);
    assert.equal(request.pathname, "/api/2/events");
    return Response.json({ page: { total: 1 }, events: [{ event: {
      localist_url: item.link, experience: "virtual", filters: {},
    } }] });
  });
  const [event] = await fetchSjsuEvents();
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.date, "2026-11-13");
  assert.equal(fixed.time, "12:00 PM");
  assert.equal(fixed.virtual, true);
  assert.equal(fixed.registration, "required");
  assert.equal(requiresAdvanceRegistration(fixed), true);
  assert.match(fixed.attendanceNote, /Pre-registration is required/);
  assert.match(fixed.attendanceNote, /organizer's linked form/);
  const events = [{ ...event }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required", "the normal refresh path preserves the requirement");
  assert.equal(events[0].attendanceNote, fixed.attendanceNote);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const registration of ["closed", "full", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
  }
  for (const unrelated of [
    { ...event, date: "2027-11-13" },
    { ...event, url: "https://events.sjsu.edu/event/another-conversation" },
  ]) assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  for (const key of Object.keys(event).filter(key => !["registration", "attendanceNote"].includes(key))) {
    assert.deepEqual(fixed[key], event[key], key);
  }
});

const languageSwap = JSON.parse(readFileSync(new URL("../lib/fixtures/sjpl-language-swap-2026-11-07.json", import.meta.url)));

test("the imported language swap keeps the organizer's optional signup through blurb refresh", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(languageSwap.retrievedAt) });
  const { fetchBiblioEvents } = await import("../generate-events.mjs");
  const original = structuredClone(languageSwap);
  t.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://gateway.bibliocommons.com");
    return Response.json({ entities: {
      ...languageSwap.entities,
      events: request.searchParams.get("page") === "1" ? { [languageSwap.event.id]: languageSwap.event } : {},
    } });
  });
  const [imported] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.match(imported.description, /Registration requested but not required/);
  const corrected = applyVerifiedEventFacts(imported);
  assert.equal(requiresAdvanceRegistration(corrected), false);
  assert.equal(corrected.registrationClosesBy, null, "the optional signup deadline cannot close attendance");
  assert.equal(corrected.attendanceNote, "Registration is requested but not required.");
  assert.equal(corrected.date, "2026-11-07");
  assert.equal(corrected.time, "4:30 PM");
  assert.equal(corrected.endTime, "5:30 PM");
  assert.equal(corrected.venue, "Alum Rock Library");
  for (const key of Object.keys(imported).filter(key => !["registration", "registrationClosesBy", "attendanceNote"].includes(key))) {
    assert.deepEqual(corrected[key], imported[key], key);
  }
  const events = [structuredClone(imported)];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(requiresAdvanceRegistration(events[0]), false);
  assert.equal(events[0].registrationClosesBy, null);
  assert.equal(events[0].attendanceNote, corrected.attendanceNote);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  assert.deepEqual(languageSwap, original, "keep the captured source immutable");
});

test("the optional language-swap form cannot close attendance or affect another occurrence", () => {
  const event = { date: "2026-11-07", url: languageSwap.sourceUrl, registration: "closed",
    registrationClosesBy: "2026-11-08T00:30:00.000Z" };
  for (const url of [event.url, event.url.replace("/events/", "/v2/events/")]) {
    const corrected = applyVerifiedEventFacts({ ...event, url });
    assert.equal(requiresAdvanceRegistration(corrected), false);
    assert.equal(corrected.registrationClosesBy, null);
  }
  for (const other of [
    { ...event, date: "2026-11-14" },
    { ...event, url: "https://sjpl.bibliocommons.com/events/another-language-swap" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  assert.equal(event.registration, "closed");
});
