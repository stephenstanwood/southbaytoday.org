import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchBiblioEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/bascom-chess-2026-11-05.json", import.meta.url)));
const id = "sjpl-6a83721e4cb69d003e216ef2";

test("Bascom's November 5 chess signup is optional through import and cached-copy refresh", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-02T20:00:00-08:00") });
  t.mock.method(globalThis, "fetch", async url => {
    const request = new URL(url);
    assert.equal(request.origin, "https://gateway.bibliocommons.com");
    return Response.json(request.searchParams.get("page") === "1"
      ? fixture.response : { entities: { events: {} } });
  });
  const [imported] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.equal(imported.id, id);
  assert.match(imported.description, /Registration encouraged but not required/);
  const corrected = applyVerifiedEventFacts(imported);
  assert.equal(requiresAdvanceRegistration(corrected), false);
  assert.equal(corrected.registrationClosesBy, null, "an optional signup deadline cannot close attendance");
  assert.match(corrected.attendanceNote, /Registration is encouraged but not required/);
  for (const field of ["id", "title", "date", "time", "endTime", "venue", "address", "cost", "description"]) {
    assert.equal(corrected[field], imported[field], field);
  }
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const rows = [{ ...imported, blurb: "Learn chess or play a casual game with other kids and families at Bascom Library." }];
  await resolveEventBlurbs(rows, { enabled: false });
  assert.equal(requiresAdvanceRegistration(rows[0]), false);
  assert.equal(rows[0].registrationClosesBy, null);
});

test("the chess correction repairs retained URL aliases without changing other occurrences", () => {
  const retained = { id, date: "2026-11-05", url: "https://sjpl.bibliocommons.com/events/6a83721e4cb69d003e216ef2",
    registration: "closed", registrationClosesBy: "2026-11-05T00:00:00.000Z" };
  for (const url of [retained.url, retained.url.replace("/events/", "/v2/events/")]) {
    const corrected = applyVerifiedEventFacts({ ...retained, url });
    assert.equal(requiresAdvanceRegistration(corrected), false);
    assert.equal(corrected.registrationClosesBy, null);
  }
  for (const other of [{ ...retained, date: "2026-11-12" }, { ...retained, url: "https://example.org/another-chess-club" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
  assert.equal(retained.registration, "closed");
});
