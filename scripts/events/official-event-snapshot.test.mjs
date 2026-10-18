import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fetchLosAltosHistoryEvents, fetchSjJazzEvents } from "../generate-events.mjs";
import { snapshotOfficialSources } from "./snapshot-official-sources.mjs";
import { inspectOfficialEventSnapshot, officialSnapshotEvents, OFFICIAL_SNAPSHOT_SOURCES } from "../lib/official-event-snapshot.mjs";

const NOW = new Date("2026-10-18T12:00:00Z");
const museumEvent = {
  id: "lecture", title: "Not Quite Created Equal?", date: "2026-10-21", time: "5:30 PM",
  source: "Los Altos History Museum", cost: "low", costNote: "$15; $10 members",
  url: "https://www.losaltoshistory.org/events/not-quite-created-equal/",
};
function snapshot(stamp = NOW.toISOString()) {
  return { version: 1, generatedAt: stamp, sources: Object.fromEntries(
    Object.entries(OFFICIAL_SNAPSHOT_SOURCES).map(([id, definition]) => [id, {
      status: "ok", sourceUrl: definition.url, observedAt: stamp,
      events: id === "fetchLosAltosHistoryEvents" ? [museumEvent] : [],
    }]),
  ) };
}
function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), "sbt-official-sources-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("a verified empty festival and a priced museum event survive snapshot consumption", (t) => {
  const path = join(scratch(t), "snapshot.json");
  writeFileSync(path, JSON.stringify(snapshot()));
  assert.equal(inspectOfficialEventSnapshot(snapshot(), { now: NOW, maxAgeHours: 8 }).count, 1);
  assert.deepEqual(officialSnapshotEvents("fetchSjJazzEvents", { path, now: NOW }), []);
  assert.deepEqual(officialSnapshotEvents("fetchLosAltosHistoryEvents", { path, now: NOW }), [museumEvent]);
  assert.deepEqual(officialSnapshotEvents("fetchLosAltosHistoryEvents", { path, now: new Date("2026-10-22T12:00:00Z"), maxAgeHours: 120 }), []);
});

test("stale, future, failed, missing, and malformed source results fail closed", () => {
  const inspect = (data) => inspectOfficialEventSnapshot(data, { now: NOW, maxAgeHours: 8 });
  assert.throws(() => inspect(snapshot("2026-10-18T03:59:59Z")), /stale/);
  assert.throws(() => inspect(snapshot("2026-10-18T14:00:00Z")), /future/);
  for (const change of [
    data => { delete data.sources.fetchSjJazzEvents; },
    data => { data.sources.fetchSjJazzEvents.status = "error"; },
    data => { data.sources.fetchSjJazzEvents.sourceUrl = "https://example.com/"; },
    data => { data.sources.fetchSjJazzEvents.events = null; },
    data => { data.sources.fetchLosAltosHistoryEvents.events[0].date = null; },
  ]) {
    const data = structuredClone(snapshot()); change(data);
    assert.throws(() => inspect(data), /no verified source result|malformed events/);
  }
  const data = snapshot();
  data.sources.fetchSjJazzEvents.observedAt = "2026-10-18T03:00:00Z";
  assert.throws(() => inspect(data), /fetchSjJazzEvents is stale/, "a new envelope cannot freshen an old source");
});

test("CAPTCHA responses never become empty success, even without strict mode", async (t) => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response('<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=x"></head></html>', {
      status: 202, headers: { "sg-captcha": "challenge", "content-type": "text/html" },
    });
  };
  t.after(() => { globalThis.fetch = original; });
  for (const adapter of [fetchLosAltosHistoryEvents, fetchSjJazzEvents]) {
    await assert.rejects(adapter({ live: true }), /upstream CAPTCHA challenge/);
  }
  assert.equal(calls.length, 2, "do not probe alternate routes after an explicit challenge");
});

test("Jazz accepts a parsed past festival but rejects an unrecognized lineup", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(`
    <title>San Jose Jazz Summer Fest 2001</title>
    <div class="artist col-sm-12"><span class="month-date">Aug 7</span>
      <span class="time">5:45pm</span><span class="stage-name">Main Stage</span>
      <h3><a href="https://summerfest.sanjosejazz.org/artists/archived-artist">Archived artist</a></h3>
    </div>`);
  assert.deepEqual(await fetchSjJazzEvents({ live: true }), []);
  globalThis.fetch = async () => new Response("<html><h1>New page layout</h1></html>");
  await assert.rejects(fetchSjJazzEvents({ live: true }), /parser returned no artist performances/);
});

test("a failed live source preserves the complete previous snapshot byte for byte", async (t) => {
  const outputPath = join(scratch(t), "snapshot.json");
  const before = JSON.stringify(snapshot());
  writeFileSync(outputPath, before);
  await assert.rejects(snapshotOfficialSources({ outputPath, adapters: {
    fetchLosAltosHistoryEvents: async ({ live }) => { assert.equal(live, true); return [museumEvent]; },
    fetchSjJazzEvents: async () => { throw new Error("upstream CAPTCHA challenge"); },
  } }), /CAPTCHA/);
  assert.equal(readFileSync(outputPath, "utf8"), before);
});

test("the snapshot writer validates live results before atomically publishing", async (t) => {
  const outputPath = join(scratch(t), "snapshot.json");
  const data = await snapshotOfficialSources({ outputPath, adapters: {
    fetchLosAltosHistoryEvents: async ({ live }) => { assert.equal(live, true); return [museumEvent]; },
    fetchSjJazzEvents: async ({ live }) => { assert.equal(live, true); return []; },
  } });
  assert.equal(inspectOfficialEventSnapshot(data).count, 1);
  assert.deepEqual(JSON.parse(readFileSync(outputPath)), data);
});

test("cloud adapters consume the canonical snapshot without contacting challenged hosts", (t) => {
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  const sandbox = scratch(t);
  for (const path of ["scripts", "src/lib", "src/data/south-bay"]) {
    cpSync(join(repo, path), join(sandbox, path), { recursive: true });
  }
  symlinkSync(join(repo, "node_modules"), join(sandbox, "node_modules"), "dir");
  const path = join(sandbox, "src/data/south-bay/official-event-sources.json");
  const run = () => spawnSync(process.execPath, ["--input-type=module", "-e", `
    globalThis.fetch = async () => { throw new Error("challenged host must not be requested"); };
    const {fetchLosAltosHistoryEvents,fetchSjJazzEvents} = await import("./scripts/generate-events.mjs");
    console.log(JSON.stringify(await Promise.all([fetchLosAltosHistoryEvents(),fetchSjJazzEvents()])));
  `], { cwd: sandbox, env: { PATH: process.env.PATH, SBT_USE_OFFICIAL_EVENT_SNAPSHOT: "1", SBT_EVENT_SNAPSHOT_MAX_AGE_HOURS: "8" }, encoding: "utf8", timeout: 15_000 });
  const fresh = snapshot(new Date().toISOString());
  const futureEvent = { ...museumEvent, date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) };
  fresh.sources.fetchLosAltosHistoryEvents.events = [futureEvent];
  writeFileSync(path, JSON.stringify(fresh));
  const result = run();
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), [[futureEvent], []]);
  writeFileSync(path, JSON.stringify(snapshot(new Date(Date.now() - 9 * 3_600_000).toISOString())));
  assert.match(run().stderr, /stale/);

  // Exercise the real generator's early abort, rather than just the reader.
  const published = ["upcoming-events.json", "events-archive.json", "events-retired.json"];
  const before = published.map((name) => readFileSync(join(sandbox, "src/data/south-bay", name)));
  const cli = spawnSync(process.execPath, ["scripts/generate-events.mjs"], {
    cwd: sandbox, env: { PATH: process.env.PATH, SBT_USE_OFFICIAL_EVENT_SNAPSHOT: "1", SBT_EVENT_SNAPSHOT_MAX_AGE_HOURS: "8" },
    encoding: "utf8", timeout: 15_000,
  });
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stderr, /official event snapshot:.*stale/);
  published.forEach((name, index) => assert.deepEqual(readFileSync(join(sandbox, "src/data/south-bay", name)), before[index]));
  rmSync(path);
  assert.notEqual(run().status, 0, "missing snapshot must not fall through to a cloud fetch");
});
