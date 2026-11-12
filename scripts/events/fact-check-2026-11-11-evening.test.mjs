import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchBiblioEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

// The November 11 live page reconfirms this exact stored source's one-minute
// rule, optional signup and open state. Evidence: the dated QA note.
const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-09-registration.json", import.meta.url)));
const id = "6a83721e4cb69d003e216ef3";
const published = fixture.published.find(event => event.id === `sjpl-${id}`);

test("a minute-based chess deadline stays open after the old erroneous day-based cutoff", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-11T20:00:00-08:00") });
  const response = structuredClone(fixture.response);
  response.entities.events = { [id]: response.entities.events[id] };
  t.mock.method(globalThis, "fetch", async url => {
    const request = new URL(url);
    assert.equal(request.origin, "https://gateway.bibliocommons.com");
    return Response.json(request.searchParams.get("page") === "1" ? response : { entities: { events: {} } });
  });
  const [event] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.equal(event.registration, "required", "the source form is open before applying its optional-attendance wording");
  assert.equal(event.registrationClosesBy, "2026-11-12T23:59:00.000Z");
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "none");
  assert.equal(event.registrationClosesBy, null);
  assert.match(event.attendanceNote, /encouraged but not required/);
});

test("retained chess cards lose only the known erroneous closure, preserving later booking notices", async () => {
  const stale = { ...published, registration: "closed", registrationClosesBy: "2026-11-12T00:00:00.000Z" };
  for (const url of [stale.url, stale.url.replace("/events/", "/v2/events/")]) {
    const [event] = [{ ...stale, url }];
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.registration, "none");
    assert.equal(event.registrationClosesBy, null);
    for (const key of ["id", "date", "time", "endTime", "venue", "address", "description", "blurb", "cost"]) {
      assert.deepEqual(event[key], stale[key], `preserve ${key}`);
    }
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  for (const change of [
    { registration: "full" }, { registration: "appointment-only" },
    { registrationClosesBy: null }, { registrationClosesBy: "2026-11-12T23:59:00.000Z" },
    { attendanceNote: "Registration is now closed." }, { attendanceNote: "No drop-ins." },
    { description: published.description + " The session is now full." },
    { description: "Registration is mandatory. No drop-ins." },
    { date: "2026-11-19" }, { url: "https://example.org/another-chess-club" },
  ]) {
    const later = { ...stale, ...change };
    assert.deepEqual(applyVerifiedEventFacts(later), later);
  }
});
