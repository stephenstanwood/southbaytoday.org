import test from "node:test";
import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fetchBiblioEvents, fetchInboundEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { eventBlurbCacheKey, resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/los-altos-teen-dnd-2026-11.json", import.meta.url)));
const misleading = "Watch or join an ongoing 5th edition Dungeons and Dragons campaign with teen players on Thursday afternoons.";

test("the actual library importer and blurb refresh preserve spectator access when player seats are full", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-02T21:00:00-08:00") });
  let captured;
  t.mock.method(globalThis, "fetch", async url => {
    const request = new URL(url);
    assert.equal(request.origin, "https://gateway.bibliocommons.com");
    return Response.json(request.searchParams.get("page") === "1" ? captured : { entities: { events: {} } });
  });
  for (const capture of fixture.captures) {
    captured = capture.response;
    const original = structuredClone(captured);
    const [imported] = await fetchBiblioEvents("sccl", "Santa Clara County Library", () => "los-altos");
    const raw = { ...imported, blurb: misleading };
    const actual = applyVerifiedEventFacts(raw);
    assert.match(actual.blurb, /Watch the teen Dungeons and Dragons game/);
    assert.match(actual.blurb, /player seats are currently full/);
    assert.match(actual.attendanceNote, /Teen spectators are welcome/);
    assert.match(actual.attendanceNote, /adult reference desk/);
    assert.equal(actual.registration, imported.registration, "do not close spectator attendance");
    assert.equal(actual.time, "4:30 PM");
    assert.equal(actual.endTime, "6:30 PM");
    assert.equal(actual.venue, "Los Altos Library");
    for (const key of Object.keys(raw).filter(key => key !== "blurb")) assert.deepEqual(actual[key], raw[key], key);
    const events = [structuredClone(raw)];
    await resolveEventBlurbs(events, { enabled: false });
    assert.deepEqual(events[0], actual);
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    assert.deepEqual(captured, original, "the original source stays intact");
  }
});

test("a retained cached invitation cannot reopen the reviewed game, and changed source conditions stay untouched", async t => {
  const event = {
    date: "2026-11-19", title: "Teen Dungeons and Dragons Social Club", venue: "Los Altos Library",
    url: "https://sccl.bibliocommons.com/v2/events/693b4639ddf5632800207370",
    description: "Teen drop ins to watch the game are welcome. Right now the game is full.",
  };
  const originalRead = fs.readFileSync;
  const cache = { byKey: { [eventBlurbCacheKey(event)]: { blurb: misleading } } };
  t.mock.method(fs, "readFileSync", (path, ...args) => String(path).endsWith("event-blurb-cache.json")
    ? JSON.stringify(cache) : originalRead(path, ...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const events = [structuredClone(event)];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].blurb, /player seats are currently full/);
  assert.equal(events[0].registration, undefined);
  for (const other of [
    { ...event, date: "2027-11-19" },
    { ...event, url: "https://example.org/another-game" },
    { ...event, description: "Teen drop ins to watch the game are welcome. New players are welcome." },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("Santa Clara's intake copies cannot turn an announcement of open registration into a requirement", () => {
  for (const raw of fixture.intakeOriginals) {
    const date = raw.startsAt.slice(0, 10);
    const [imported] = fetchInboundEvents({ today: "2026-11-02", events: [raw] });
    const fixed = applyVerifiedEventFacts(imported);
    assert.match(fixed.description, /Registration was announced as open/);
    assert.doesNotMatch(fixed.description, /Registration required/);
    assert.equal(fixed.registration, undefined);
    assert.equal(fixed.date, date);
    assert.equal(fixed.time, imported.time);
    assert.equal(fixed.endTime, imported.endTime);
    // The puller's description-only repair uses this same source shape.
    const retained = applyVerifiedEventFacts({
      date, title: raw.title, url: raw.sourceUrl, venue: raw.location, description: raw.description,
    });
    assert.match(retained.description, /Registration was announced as open/);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    for (const other of [
      { ...imported, date: "2027-12-12" },
      { ...imported, url: "https://example.org/another-activity" },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
    const updatedRequirement = { ...imported, description: "The organizer requires advance registration.", registration: "required" };
    const updated = applyVerifiedEventFacts(updatedRequirement);
    assert.equal(updated.description, updatedRequirement.description, "a later explicit requirement must not be rewritten");
    assert.equal(updated.registration, "required");
    assert.match(raw.description, /Registration required/, "intake originals remain immutable");
  }
});
