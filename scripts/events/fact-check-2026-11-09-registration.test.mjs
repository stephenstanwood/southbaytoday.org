import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchBiblioEvents, polishDescription } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-09-registration.json", import.meta.url)));

test("real library ingestion distinguishes optional chess signup and space-available tech appointments", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-09T03:10:00Z") });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async input => {
      assert(String(input).startsWith("https://gateway.bibliocommons.com/v2/libraries/sjpl/events?"));
      return Response.json(calls++ === 0 ? fixture.response : { entities: { events: {} } });
    };
    const events = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
    assert.equal(events.length, 2);
    for (const event of events) {
      assert.equal(event.registration, "required", "the raw form must reproduce the incorrect advance gate");
      const published = fixture.published.find(row => row.id === event.id);
      event.description = polishDescription(event.description);
      event.blurb = published.blurb;
    }
    await resolveEventBlurbs(events, { enabled: false });
    for (const event of events) {
      assert.equal(requiresAdvanceRegistration(event), false);
      assert.equal(event.registration, "none");
      assert.equal(event.registrationClosesBy, null, "optional signup deadlines cannot close attendance");
      const published = fixture.published.find(row => row.id === event.id);
      for (const field of ["date", "time", "endTime", "venue", "cost", "sourceAudiences", "blurb"]) {
        assert.deepEqual(event[field], published[field], `preserve ${field}`);
      }
      assert.deepEqual(applyVerifiedEventFacts(event), event);
    }
    const tech = events.find(event => event.venue === "Rose Garden Library");
    assert.match(tech.attendanceNote, /if times are available/);
    assert.match(tech.description, /408-808-3070/);
    const chess = events.find(event => event.venue === "Bascom Library");
    assert.match(chess.attendanceNote, /encouraged but not required/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retained cards and URL aliases preserve optional attendance without reopening later gates", async () => {
  for (const published of fixture.published) {
    const [event] = [structuredClone(published)];
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.registration, "none");
    assert.equal(event.registrationClosesBy, null);
    assert.equal(event.blurb, published.blurb);
    assert.equal(applyVerifiedEventFacts({ ...published, url: published.url.replace("/events/", "/v2/events/") }).registration, "none");
    for (const registration of ["full", "closed", "appointment-only"]) {
      const later = { ...published, registration };
      assert.deepEqual(applyVerifiedEventFacts(later), later);
    }
    for (const change of [
      { date: "2026-11-19" },
      { url: "https://example.org/unrelated" },
      { venue: "Another Library" },
      { time: "8:00 PM" },
      { description: "Registration is required. No drop-ins." },
      { description: published.description + " Registration is mandatory. You must register." },
      { description: "" },
    ]) {
      const other = { ...published, ...change };
      assert.deepEqual(applyVerifiedEventFacts(other), other, "different or updated source terms must survive");
    }
  }
});
