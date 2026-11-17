import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fetchBiblioEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/bascom-food-drive-2026-11-17.json", import.meta.url)));

test("the exact Bascom food drive's optional signup survives ingestion and cached-copy refresh", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T05:00:00Z") });
  t.mock.method(globalThis, "fetch", async url => {
    const request = new URL(url);
    assert.equal(request.origin, "https://gateway.bibliocommons.com");
    return Response.json(request.searchParams.get("page") === "1"
      ? fixture.response : { entities: { events: {} } });
  });
  const [event] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.equal(event.id, fixture.published.id);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(requiresAdvanceRegistration(event), false);
  assert.equal(event.registrationClosesBy, null);
  assert.match(event.attendanceNote, /recommended but not required/);
  for (const key of ["date", "time", "endTime", "venue", "cost"]) assert.equal(event[key], fixture.published[key], key);
});

test("retained food-drive cards are corrected without reopening changed requirements or later booking states", () => {
  for (const url of [fixture.published.url, fixture.published.url.replace("/events/", "/v2/events/")]) {
    const original = { ...fixture.published, url };
    const corrected = applyVerifiedEventFacts(original);
    assert.equal(requiresAdvanceRegistration(corrected), false);
    assert.equal(corrected.registrationClosesBy, null);
    assert.equal(corrected.description, original.description);
    assert.equal(corrected.blurb, original.blurb);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }
  for (const change of [
    { date: "2026-12-15" }, { url: "https://example.org/another-food-drive" },
    { registration: "full" }, { registration: "closed" }, { registration: "appointment-only" },
    { description: fixture.published.description + " Registration is mandatory. You must register." },
    { attendanceNote: "The program is now full; no walk-ins." }, { description: "" },
  ]) {
    const revised = { ...fixture.published, ...change };
    assert.deepEqual(applyVerifiedEventFacts(revised), revised);
  }
});
