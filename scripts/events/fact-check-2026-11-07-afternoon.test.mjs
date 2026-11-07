import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchBiblioEvents } from "../generate-events.mjs";
import { libraryEventDetails } from "../lib/library-event-details.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-07-afternoon.json", import.meta.url)));

test("the newly ingested November 10 appointment discloses conflicting print limits through blurb resolution", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-07T22:07:06Z") });
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ entities: {
    events: requests++ === 0 ? { [fixture.source.id]: fixture.source } : {},
    locations: fixture.locations, eventAudiences: fixture.eventAudiences,
  } })));
  const events = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.equal(events.length, 1);
  const original = structuredClone(events[0]);
  await resolveEventBlurbs(events, { enabled: false });
  const event = events[0];
  assert.match(event.attendanceNote, /conflicting print-time limits \(45 minutes and 1 hour 45 minutes\)/);
  assert.match(event.attendanceNote, /cz\.sjpl@sjlibrary\.org/);
  for (const key of ["id", "date", "time", "endTime", "venue", "cost", "registration", "registrationClosesBy", "description"]) {
    assert.deepEqual(event[key], original[key], key);
  }
  assert.equal(event.registration, "full", "the source's full state cannot reopen");
  assert.deepEqual(applyVerifiedEventFacts(event), event, "the clarification must be idempotent");
});

test("the retained November 10 record gains only its clarification note", () => {
  const event = applyVerifiedEventFacts(fixture.published);
  assert.match(event.attendanceNote, /^One appointment per month per person\..*conflicting print-time limits/);
  assert.deepEqual({ ...event, attendanceNote: fixture.published.attendanceNote }, fixture.published);
  for (const registration of ["closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...fixture.published, registration }).registration, registration);
  }
});

test("resolved limits and unverified dates or identities do not inherit the clarification", () => {
  const event = { ...fixture.published, ...libraryEventDetails(fixture.source) };
  for (const other of [
    { ...event, date: "2026-11-17" },
    { ...event, url: fixture.url + "0" },
    { ...event, url: fixture.url.replace("sjpl.bibliocommons.com", "example.com") },
    { ...event, description: event.description.replace("Designs must print in 1 hour 45 minutes", "Designs must print in under 45 minutes") },
    { ...event, description: event.description.replace("have a print time of under 45 minutes", "have a print time of under 1 hour 45 minutes") },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});
