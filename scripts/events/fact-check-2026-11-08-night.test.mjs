import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchScclEvents } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-08-night.json", import.meta.url)));

test("the evening Theft discussion corrects the source and cached book year through real library ingestion", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-08T05:07:05Z") });
  let page = 0;
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(url).origin, "https://gateway.bibliocommons.com");
    assert.equal(new URL(url).pathname, "/v2/libraries/sccl/events");
    return Response.json(page++ === 0 ? fixture.library : { entities: { events: {} } });
  });
  const events = await fetchScclEvents();
  assert.equal(events.length, 1);
  assert.match(events[0].description, /2022 novel Theft/);
  events[0].blurb = fixture.published.blurb;
  const before = structuredClone(events[0]);
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.match(actual.description, /2025 novel Theft/);
  assert.match(actual.blurb, /2025 novel Theft/);
  assert.match(actual.description, /third Thursday evening/);
  assert.match(actual.description, /Room 201B/);
  for (const key of Object.keys(before)) {
    if (!["description", "blurb"].includes(key)) assert.deepEqual(actual[key], before[key], key);
  }
  assert.equal(actual.date, "2026-11-19");
  assert.equal(actual.time, "7:00 PM");
  assert.equal(actual.endTime, "8:15 PM");
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("the year correction accepts the exact source alias and preserves later availability and corrected copy", () => {
  const source = fixture.published;
  const alias = applyVerifiedEventFacts({ ...source, url: source.url.replace("/events/", "/v2/events/") });
  assert.match(alias.description, /2025 novel Theft/);
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...source, registration }).registration, registration);
  }
  const corrected = { ...source, description: "Discuss Theft in Room 201B.", blurb: "Discuss Theft with the library group." };
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});

test("the verified evening correction cannot spread to another occurrence or source identity", () => {
  const source = fixture.published;
  for (const other of [
    { ...source, date: "2026-11-26" },
    { ...source, url: source.url + "0" },
    { ...source, url: source.url.replace("sccl.bibliocommons.com", "example.org") },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});
