import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSourceHealth,
  criticalSourceProblems,
  eventRegressionProblem,
  inspectSnapshot,
  strictRefreshInputHealth,
} from "./event-source-health.mjs";

const NOW = new Date("2026-07-20T03:00:00.000Z");

test("rejects stale and timestamp-less snapshots", () => {
  assert.equal(inspectSnapshot({
    name: "playwright",
    data: { events: [{}] },
    timestamp: "2026-07-18T00:00:00.000Z",
    now: NOW,
    maxAgeHours: 30,
  }).status, "stale");
  assert.equal(inspectSnapshot({
    name: "inbound",
    data: { events: [{}] },
    timestamp: null,
    now: NOW,
  }).status, "invalid");
});

test("strict input health requires credentials and both fresh snapshots", () => {
  const env = Object.fromEntries([
    "TICKETMASTER_API_KEY",
    "MEETUP_CLIENT_ID",
    "MEETUP_MEMBER_ID",
    "MEETUP_KID",
    "MEETUP_PRIVATE_KEY",
  ].map((key) => [key, "present"]));
  const result = strictRefreshInputHealth({
    env,
    playwright: { _meta: { generatedAt: "2026-07-20T02:00:00.000Z" }, events: [{}] },
    inbound: { _meta: { pulledAt: "2026-07-20T01:00:00.000Z" }, events: [{}] },
    now: NOW,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});

test("source health fails closed only for declared critical adapters", () => {
  const health = buildSourceHealth(
    [
      { id: "broad", label: "Broad feed", critical: true },
      { id: "seasonal", label: "Seasonal feed", critical: false },
    ],
    [
      { status: "fulfilled", value: [] },
      { status: "fulfilled", value: [] },
    ],
  );
  assert.deepEqual(criticalSourceProblems(health), ["Broad feed is empty"]);
});

test("detects meaningful source or event-count regressions", () => {
  const previous = { sources: Array.from({ length: 20 }, (_, i) => `s${i}`), eventCount: 100 };
  assert.match(eventRegressionProblem({ previous, nextSourceCount: 15, nextEventCount: 95 }), /regressed/);
  assert.match(eventRegressionProblem({ previous, nextSourceCount: 19, nextEventCount: 50 }), /regressed/);
  assert.equal(eventRegressionProblem({ previous, nextSourceCount: 19, nextEventCount: 90 }), null);
});
