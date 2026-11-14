import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchBiblioEvents } from "../generate-events.mjs";
import { resolveRegistrationClosesBy } from "../../src/lib/south-bay/eventFilters.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/biblio-series-registration-2026-11-14.json", import.meta.url)));
const id = "6a751bec3f18b57d5233feb8";
const source = fixture.response.entities.events[id];
const start = new Date(source.indexStart);
const end = new Date(source.indexEnd);

test("a captured active series does not inherit its current session's false 9 AM cutoff", () => {
  assert.equal(fixture.window.event.status, "ACTIVE");
  assert.equal(fixture.window.event.window_end, "2026-12-19T10:30:00");
  assert.equal(source.definition.registrationInfo.scope, "ALL_REMAINING");
  const before = structuredClone(source);
  assert.equal(resolveRegistrationClosesBy(source, start, end), null);
  assert.deepEqual(source, before);
});

test("fresh library ingestion and cached publication preserve required registration after that false cutoff", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-14T17:36:00Z") });
  const calls = [];
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    calls.push(String(url));
    assert.equal(url.origin, "https://gateway.bibliocommons.com");
    return Response.json(url.searchParams.get("page") === "1"
      ? fixture.response : { entities: { events: {} } });
  });
  const [event] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.equal(calls.length, 2, "reuse existing paginated records without per-event requests");
  assert.equal(event.registration, "required");
  assert.equal(event.registrationClosesBy, undefined);
  assert.equal(event.date, "2026-11-14");
  assert.equal(event.time, "10:30 AM");
  assert.equal(event.endTime, "12:00 PM");
  assert.match(event.description, /Registration & placement testing required/);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "required");
  assert.equal(event.registrationClosesBy, undefined);
  assert.equal(event.cost, "free");
  assert.equal(event.venue, "Seven Trees Library");
});

test("series registrations retain actual full and closed provider states", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-14T17:36:00Z") });
  let response;
  t.mock.method(globalThis, "fetch", async input => Response.json(new URL(input).searchParams.get("page") === "1"
    ? response : { entities: { events: {} } }));
  for (const [changes, expected] of [[{ isFull: true }, "full"], [{ registrationClosed: true }, "closed"]]) {
    response = structuredClone(fixture.response);
    Object.assign(response.entities.events[id], changes);
    const [event] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
    assert.equal(event.registration, expected);
    assert.equal(event.registrationClosesBy, undefined);
  }
});

test("series scopes preserve absolute deadlines and other scopes retain instance-based deadlines", () => {
  for (const windowType of ["RELATIVE", "EVENT_START", "EVENT_END"]) {
    const event = structuredClone(source);
    event.definition.registrationInfo.registrationEnd.windowType = windowType;
    assert.equal(resolveRegistrationClosesBy(event, start, end), null);
  }
  const absolute = structuredClone(source);
  absolute.definition.registrationInfo.registrationEnd = { windowType: "STATIC", date: "2026-12-19", time: "T10:30" };
  assert.equal(resolveRegistrationClosesBy(absolute, start, end).toISOString(), "2026-12-19T18:30:00.000Z");
  const single = structuredClone(source);
  single.definition.registrationInfo.scope = null;
  assert.equal(resolveRegistrationClosesBy(single, start, end).toISOString(), "2026-11-14T17:00:00.000Z");
});
