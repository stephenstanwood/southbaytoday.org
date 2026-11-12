import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchBiblioEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-12-afternoon.json", import.meta.url)));
const legoId = "sjpl-6a85eaec69166f088b934e2e";
const pumpkinId = "sjpl-6ad7ea86ebad22004546bd28";
const swapId = "sjpl-6a3f10c0f56bd86e00b95e6c";
const retained = (id = legoId) => structuredClone(fixture.published.find(event => event.id === id));

test("actual library ingestion preserves both optional admissions and the newly full pumpkin workshop", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-12T21:07:05Z") });
  t.mock.method(globalThis, "fetch", async url => {
    const request = new URL(url);
    assert.equal(request.origin, "https://gateway.bibliocommons.com");
    return Response.json(request.searchParams.get("page") === "1" ? fixture.response : { entities: { events: {} } });
  });
  const events = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  const originals = structuredClone(events);
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events.length, 3);
  const lego = events.find(event => event.id === legoId);
  const pumpkin = events.find(event => event.id === pumpkinId);
  assert.equal(lego.registration, "none");
  assert.equal(lego.registrationClosesBy, null);
  assert.match(lego.attendanceNote, /recommended but not required/);
  assert.match(lego.description, /Children under 5 must be accompanied/);
  assert.equal(isBriefingEventAvailable(lego), true);
  const swap = events.find(event => event.id === swapId);
  assert.equal(swap.registration, "none");
  assert.equal(swap.registrationClosesBy, null);
  assert.match(swap.attendanceNote, /requested but not required/);
  assert.equal(isBriefingEventAvailable(swap), true);
  assert.equal(pumpkin.registration, "full", "the per-occurrence flag outranks the shared definition's stale false value");
  assert.equal(isBriefingEventAvailable(pumpkin), false);
  for (const event of events) {
    const original = originals.find(row => row.id === event.id);
    for (const key of ["date", "time", "endTime", "title", "venue", "address", "cost", "description"]) {
      assert.deepEqual(event[key], original[key], `preserve ${key}`);
    }
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("retained optional library cards keep existing instructions and lose only the optional signup deadline", async () => {
  for (const [id, wording] of [[legoId, "recommended"], [swapId, "requested"]]) {
    for (const suffix of ["/events/", "/v2/events/"]) {
      const event = { ...retained(id), attendanceNote: "Existing organizer instruction." };
      event.url = event.url.replace("/events/", suffix);
      const original = structuredClone(event);
      await resolveEventBlurbs([event], { enabled: false });
      assert.equal(event.registration, "none");
      assert.equal(event.registrationClosesBy, null);
      assert.equal(event.attendanceNote, original.attendanceNote + ` Registration is ${wording} but not required.`);
      for (const key of ["date", "time", "endTime", "venue", "address", "title", "description", "blurb", "cost"]) {
        assert.deepEqual(event[key], original[key], `preserve retained ${key}`);
      }
      assert.deepEqual(applyVerifiedEventFacts(event), event);
    }
  }
});

test("the verified optional-booking exception preserves later closures and stays on the exact occurrence", () => {
  for (const id of [legoId, swapId]) {
    for (const change of [
      { registration: "full" }, { registration: "closed" }, { registration: "appointment-only" },
      { description: "Registration is required. No drop-ins." },
      { attendanceNote: "Registration is now closed." }, { attendanceNote: "No walk-ins." },
      { attendanceNote: "The session is now full." },
      { date: "2026-12-20" }, { url: "https://example.org/another-library-program" },
      { url: retained(id).url + "0" },
    ]) {
      const event = { ...retained(id), ...change };
      assert.deepEqual(applyVerifiedEventFacts(event), event);
    }
  }
});
