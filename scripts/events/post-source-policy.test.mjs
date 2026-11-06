import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectPlaywrightSourceResults, runScraper, scrapePOST } from "../playwright-scrapers.mjs";
import { findUnexpectedEmptyRetries, inspectPlaywrightCoverage } from "../lib/playwright-source-resilience.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";

const previous = JSON.parse(readFileSync(new URL("../lib/fixtures/post-access-refusal-2026-11-06.json", import.meta.url)));
const name = "POST (Peninsula Open Space Trust)";
const tasks = [{ name }];

async function heldResult() {
  let closed = false;
  const page = new Proxy({ on() {}, close: async () => { closed = true; } }, {
    get(target, key) {
      if (key === "then") return undefined; // Promise resolution, not a browser API.
      assert.ok(key in target, `held POST must not use page.${String(key)}, including navigation or identity overrides`);
      return target[key];
    },
  });
  const result = await runScraper({ newPage: async () => page }, name, scrapePOST);
  assert.equal(closed, true);
  assert.deepEqual(result.events, []);
  assert.match(result.error, /HTTP 403 at https:\/\/openspacetrust.org\/events\//);
  assert.match(result.error, /observed 2026-11-06T17:38:14\.302Z/);
  assert.match(result.error, /collection not attempted/);
  return result;
}

test("POST holds the captured refusal without requesting, changing identity or retrying", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => assert.fail("held POST cannot make HTTP requests");
  const results = [await heldResult()];
  assert.deepEqual(findUnexpectedEmptyRetries({ tasks, results, previous, today: "2026-11-06" }), []);
  const source = readFileSync(new URL("../playwright-scrapers.mjs", import.meta.url), "utf8");
  assert.match(source, /tasks\.push\(\{ name: "POST \(Peninsula Open Space Trust\)"/,
    "the source stays registered, so retirement exclusions cannot erase its coverage");
});

test("the actual assembly preserves both captured future rows as failed, retained coverage", async () => {
  const before = JSON.stringify(previous);
  const results = [await heldResult()];
  const collected = collectPlaywrightSourceResults({ tasks, results, previous, today: "2026-11-06" });
  assert.deepEqual(collected.events, previous.events);
  const [health] = collected.sourceHealth;
  assert.equal(health.status, "error");
  assert.equal(health.liveCount, 0);
  assert.equal(health.retainedCount, 2);
  assert.equal(health.count, 2, "legacy count remains retained-inclusive");
  assert.equal(health.carriedForward, true);
  assert.match(health.carryForwardReason, /retained previous/);
  assert.equal(health.error, results[0].error);
  assert.equal(JSON.stringify(previous), before, "captured source evidence must not be restamped");
  assert.equal(inspectPlaywrightCoverage({ previous, events: collected.events, tasks }).excludedRows, 0);
});

test("repeat holds expire the December occurrences naturally and keep cancellation filtering", async () => {
  const results = [await heldResult()];
  const first = collectPlaywrightSourceResults({ tasks, results, previous, today: "2026-11-06" });
  const repeated = { _meta: { sourceHealth: first.sourceHealth }, events: first.events };
  const afterFirst = collectPlaywrightSourceResults({ tasks, results, previous: repeated, today: "2026-12-05" });
  assert.deepEqual(afterFirst.events.map(row => row.date), ["2026-12-12"]);
  assert.equal(afterFirst.sourceHealth[0].liveCount, 0);
  const afterBoth = collectPlaywrightSourceResults({ tasks, results, previous: repeated, today: "2026-12-13" });
  assert.deepEqual(afterBoth.events, []);
  assert.equal(afterBoth.sourceHealth[0].status, "error", "expiry does not make the held source healthy-empty");
  assert.equal(isEventPublishable({ ...first.events[0], eventStatus: "https://schema.org/EventCancelled" }), false);
});
