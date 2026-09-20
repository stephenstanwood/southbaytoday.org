import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = fileURLToPath(new URL("../../", import.meta.url));

// Exercise the real CLI in a disposable checkout. No source requests or alerts
// leave the test: every fetch gets the same permanent 403 as the incident.
for (const strict of [undefined, "0", "1"]) {
  test(`a critical 403 preserves published files with strict mode ${strict ?? "unset"}`, (t) => {
    const sandbox = realpathSync(mkdtempSync(join(tmpdir(), "sbt-event-publication-")));
    t.after(() => rmSync(sandbox, { recursive: true, force: true }));
    for (const path of ["scripts", "src/lib", "src/data/south-bay"]) {
      cpSync(join(repo, path), join(sandbox, path), { recursive: true });
    }
    symlinkSync(join(repo, "node_modules"), join(sandbox, "node_modules"), "dir");

    const dataDir = join(sandbox, "src/data/south-bay");
    const now = new Date().toISOString();
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const event = {
      id: "known-good-city-event", title: "Source-verified community event",
      date, time: "10:30 AM", city: "los-altos", category: "community",
      source: "Ticketmaster", url: "https://www.ticketmaster.com/event/fixture",
    };
    const files = {
      "upcoming-events.json": {
        generatedAt: now, eventCount: 1, sources: [event.source], events: [event],
        sourceHealth: [{ id: "fetchTicketmasterEvents", label: event.source, critical: true,
          status: "ok", count: 1, dateCounts: { [date]: 1 }, error: null }],
      },
      "events-archive.json": { events: [], eventCount: 0 },
      "events-retired.json": { version: 1, events: [] },
    };
    for (const [name, value] of Object.entries(files)) {
      writeFileSync(join(dataDir, name), JSON.stringify(value) + "\n");
    }
    // Fresh inputs let strict mode reach the source gate instead of stopping
    // for credentials or snapshot age before Ticketmaster is attempted.
    writeFileSync(join(dataDir, "playwright-events.json"), JSON.stringify({
      _meta: { generatedAt: now }, events: [{ ...event, source: "Fixture venue" }],
    }));
    writeFileSync(join(dataDir, "inbound-events.json"), JSON.stringify({
      _meta: { pulledAt: now }, events: [{ ...event, id: "fixture-inbound", source: "Fixture newsletter" }],
    }));
    const before = Object.fromEntries(Object.keys(files).map((name) => [name, readFileSync(join(dataDir, name))]));
    const preload = join(sandbox, "offline.mjs");
    writeFileSync(preload, `globalThis.fetch = async (url) => {
      if (String(url).includes("losaltosca.gov")) console.error("fixture: retired city source requested");
      if (String(url).includes("app.ticketmaster.com")) console.log("fixture: Ticketmaster 403");
      return new Response("Access denied", { status: 403 });
    };\n`);

    const env = {
      PATH: process.env.PATH,
      TICKETMASTER_API_KEY: "fixture",
      MEETUP_CLIENT_ID: "fixture", MEETUP_MEMBER_ID: "fixture",
      MEETUP_KID: "fixture", MEETUP_PRIVATE_KEY: "fixture",
    };
    if (strict !== undefined) env.SBT_STRICT_EVENT_REFRESH = strict;
    const result = spawnSync(process.execPath, ["--import", preload, join(sandbox, "scripts/generate-events.mjs")], {
      cwd: sandbox, env, encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000,
    });
    const output = result.stdout + result.stderr;
    assert.ifError(result.error);
    assert.match(output, /fixture: Ticketmaster 403/, output);
    assert.doesNotMatch(output, /fixture: retired city source requested/);
    assert.equal(result.status, 1, output);
    assert.match(output, /critical event sources failed:.*Ticketmaster is (?:empty|error: 403)/, output);
    for (const name of Object.keys(files)) {
      assert.deepEqual(readFileSync(join(dataDir, name)), before[name], `${name} must stay byte-identical`);
    }
  });
}
