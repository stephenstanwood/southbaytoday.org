import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectEventRefreshOutput,
  inspectMiniEventRefresh,
  inspectMiniRefreshState,
} from "./event-refresh-health.mjs";
import {
  buildSourceHealth,
  carryForwardTransientCriticalSources,
  eventsForSourceResult,
  sourceRegressionProblems,
} from "../lib/event-source-health.mjs";

const NOW = new Date("2026-07-20T05:00:00.000Z");
const REQUIRED = [
  "fetchMusicInParkEvents",
  "fetchJazzOnThePlazzEvents",
  "fetchLosAltosVillageEvents",
  "fetchSjJazzEvents",
  "fetchHappyHollowEvents",
  "fetchTicketmasterEvents",
  "fetchPlaywrightEvents",
  "fetchInboundEvents",
];

function healthyOutput() {
  return {
    generatedAt: "2026-07-20T04:30:00.000Z",
    eventCount: 2,
    events: [{ id: "a" }, { id: "b" }],
    sourceHealth: REQUIRED.map((id) => ({
      id,
      label: id,
      critical: ["fetchTicketmasterEvents", "fetchPlaywrightEvents", "fetchInboundEvents"].includes(id),
      status: "ok",
      count: 2,
      dateCounts: { "2026-08-01": 2 },
      error: null,
    })),
    inputSnapshots: [
      { name: "playwright-events", status: "ok", timestamp: "2026-07-20T04:20:00.000Z" },
      { name: "inbound-events", status: "ok", timestamp: "2026-07-20T04:25:00.000Z" },
      { name: "official-event-sources", status: "ok", timestamp: "2026-07-20T04:26:00.000Z" },
    ],
  };
}

test("accepts a fresh complete refresh output without retired Meetup health", () => {
  const health = inspectEventRefreshOutput({ data: healthyOutput(), now: NOW });
  assert.equal(health.ok, true);
  assert.equal(health.eventCount, 2);
  assert.deepEqual(health.problems, []);
});

test("verifies additional consumed snapshots instead of ignoring stale official sources", () => {
  const data = healthyOutput();
  data.inputSnapshots.at(-1).timestamp = "2026-07-20T04:20:00Z";
  assert.equal(inspectEventRefreshOutput({ data, now: NOW, snapshotMaxAgeHours: 8 }).ok, true);
  data.inputSnapshots.at(-1).timestamp = "2026-07-19T20:59:59Z";
  assert.match(inspectEventRefreshOutput({ data, now: NOW, snapshotMaxAgeHours: 8 }).problems.join("; "), /official-event-sources snapshot is 8.0h old/);
  data.inputSnapshots.at(-1).timestamp = "2026-07-20T04:20:00Z";
  data.inputSnapshots.at(-1).status = "error";
  assert.match(inspectEventRefreshOutput({ data, now: NOW }).problems.join("; "), /official-event-sources snapshot is error/);
});

test("detects missing adapters, stale snapshots, and count mismatches", () => {
  const data = healthyOutput();
  data.eventCount = 99;
  data.sourceHealth = data.sourceHealth.filter((source) => source.id !== "fetchMusicInParkEvents");
  data.inputSnapshots[0].timestamp = "2026-07-18T00:00:00.000Z";
  const health = inspectEventRefreshOutput({
    data,
    now: NOW,
    snapshotMaxAgeHours: 8,
  });
  assert.equal(health.ok, false);
  assert.ok(health.problems.some((problem) => problem.includes("does not match")));
  assert.ok(health.problems.some((problem) => problem.includes("fetchMusicInParkEvents")));
  assert.ok(health.problems.some((problem) => problem.includes("playwright-events snapshot is")));
});

test("detects a stale or malformed Mini success heartbeat", () => {
  assert.equal(inspectMiniRefreshState({
    state: { lastSuccessAt: "2026-07-18T00:00:00.000Z", head: "a".repeat(40) },
    now: NOW,
  }).ok, false);
  assert.deepEqual(inspectMiniRefreshState({
    state: { lastSuccessAt: "2026-07-20T04:00:00.000Z", head: "not-a-sha" },
    now: NOW,
  }).problems, ["Mini refresh state has no valid pushed HEAD"]);
});

test("combines scheduler heartbeat and generated-output health", () => {
  const health = inspectMiniEventRefresh({
    state: { lastSuccessAt: "2026-07-20T04:00:00.000Z", head: "a".repeat(40) },
    data: healthyOutput(),
    now: NOW,
  });
  assert.equal(health.ok, true);
  assert.deepEqual(health.problems, []);
});

test("absorbs a broken optional adapter the same way generate-events does", () => {
  const data = healthyOutput();
  data.sourceHealth.push({
    id: "fetchHeritageTheatreEvents",
    label: "Heritage Theatre",
    critical: false,
    status: "error",
    count: 0,
    dateCounts: {},
    error: "429",
  });
  const health = inspectEventRefreshOutput({ data, now: NOW });
  assert.equal(health.ok, true);
  assert.deepEqual(health.problems, []);
});

test("still flags a critical Ticketmaster failure in the generated output", () => {
  const data = healthyOutput();
  const tm = data.sourceHealth.find((source) => source.id === "fetchTicketmasterEvents");
  tm.status = "error";
  tm.count = 0;
  tm.error = "429";
  const health = inspectEventRefreshOutput({ data, now: NOW });
  assert.equal(health.ok, false);
  assert.ok(health.problems.some((problem) => /fetchTicketmasterEvents is error: 429/.test(problem)));
});

test("Ticketmaster fallback compares published coverage and keeps the last live baseline", () => {
  const today = "2026-07-19";
  const upcoming = "2026-08-01";
  const source = { id: "fetchTicketmasterEvents", label: "Ticketmaster", critical: true };
  const cached = Array.from({ length: 168 }, (_, i) => (
    { id: `tm-${i}`, source: source.label, date: upcoming }
  ));
  const previous = {
    generatedAt: "2026-07-19T12:00:00.000Z",
    events: [...cached, { id: "expired", source: source.label, date: "2026-07-18" }],
    sourceHealth: [{ ...source, status: "ok", count: 752, dateCounts: { [upcoming]: 752 } }],
  };
  const failure = { status: "rejected", reason: new DOMException("The operation was aborted due to timeout", "TimeoutError") };
  const [fallback] = carryForwardTransientCriticalSources([source], [failure], previous, { today });
  const [health] = buildSourceHealth([source], [fallback]);
  assert.deepEqual(eventsForSourceResult(fallback), cached);
  assert.deepEqual(health, {
    ...source, status: "fallback", count: 0, dateCounts: {}, error: failure.reason.message,
    retainedCount: 168, retainedDateCounts: { [upcoming]: 168 }, retainedFrom: previous.generatedAt,
    lastLiveDateCounts: { [upcoming]: 752 },
  });

  const baseline = { today, previousEvents: previous.events, previousSourceHealth: previous.sourceHealth };
  assert.deepEqual(sourceRegressionProblems({ ...baseline, nextSourceHealth: [health] }), []);
  const trimmed = { ...fallback, retained: { ...fallback.retained, events: cached.slice(0, 40) } };
  assert.deepEqual(sourceRegressionProblems({
    ...baseline, nextSourceHealth: buildSourceHealth([source], [trimmed]),
  }), ["Ticketmaster retained only 40 of 168 still-upcoming cached listings (24%)"]);

  const data = healthyOutput();
  data.events = cached;
  data.eventCount = cached.length;
  data.sourceHealth = data.sourceHealth.map((item) => item.id === source.id ? health : item);
  assert.equal(inspectEventRefreshOutput({ data, now: NOW }).ok, true);

  const repeated = carryForwardTransientCriticalSources([source], [failure], data, { today });
  const repeatedHealth = buildSourceHealth([source], repeated);
  assert.deepEqual(repeatedHealth, [health]);
  const partialLive = buildSourceHealth([source], [{ status: "fulfilled", value: cached }]);
  assert.deepEqual(sourceRegressionProblems({
    today, previousEvents: cached, previousSourceHealth: repeatedHealth, nextSourceHealth: partialLive,
  }), ["Ticketmaster retained only 168 of 752 still-upcoming source records (22%)"]);

  const expired = carryForwardTransientCriticalSources([source], [failure], data, { today: "2026-08-02" });
  assert.deepEqual(expired, [failure]);
  data.sourceHealth = data.sourceHealth.map((item) => item.id === source.id ? { ...health, retainedCount: 0 } : item);
  assert.equal(inspectEventRefreshOutput({ data, now: NOW }).ok, false);
});

test("pages when the output has no inputSnapshots array at all", () => {
  // 2026-08-24/25: an ad-hoc non-strict `npm run generate-events` (a93dbdba)
  // omitted the key entirely, two agent commits carried the field-less file
  // forward, and the watchdog fired. The checker was right and the producer
  // was wrong — generate-events now records snapshots on every run. Keep this
  // strict so the next producer that drops the field still pages instead of
  // going quiet.
  const data = healthyOutput();
  delete data.inputSnapshots;
  const health = inspectEventRefreshOutput({ data, now: NOW });
  assert.equal(health.ok, false);
  assert.ok(health.problems.includes("upcoming-events output has no inputSnapshots array"));
});

test("names the individual stale input rather than the whole array", () => {
  // The payoff of recording snapshots unconditionally: a non-strict run with a
  // stale input now reports which input went stale, instead of collapsing into
  // the far less actionable "no inputSnapshots array".
  const data = healthyOutput();
  data.inputSnapshots = data.inputSnapshots.map((snapshot) => (
    snapshot.name === "inbound-events"
      ? { ...snapshot, status: "stale", timestamp: "2026-07-18T00:00:00.000Z" }
      : snapshot
  ));
  const health = inspectEventRefreshOutput({ data, now: NOW });
  assert.equal(health.ok, false);
  assert.ok(health.problems.includes("inbound-events snapshot is stale"));
  assert.ok(!health.problems.some((problem) => problem.includes("no inputSnapshots array")));
});

test("Mini refreshes every input before a delayed GitHub check reaches eight hours", () => {
  const state = { lastSuccessAt: "2026-07-20T04:30:00Z", head: "a".repeat(40) };
  for (const name of ["playwright-events", "inbound-events", "official-event-sources"]) {
    const data = healthyOutput();
    const input = data.inputSnapshots.find((snapshot) => snapshot.name === name);
    input.timestamp = "2026-07-20T01:00:00Z";
    assert.equal(inspectMiniEventRefresh({ state, data, now: NOW }).ok, true,
      `${name} at four hours still has headroom`);
    input.timestamp = "2026-07-20T00:59:59Z";
    const health = inspectMiniEventRefresh({ state, data, now: NOW });
    assert.equal(health.ok, false);
    assert.ok(health.problems.some((problem) => problem.includes(`${name} snapshot is`)));
    assert.equal(inspectEventRefreshOutput({ data, now: NOW, snapshotMaxAgeHours: 8 }).ok, true,
      "Mini must recover while GitHub would still accept the source bytes");
    input.timestamp = "2026-07-19T20:36:00Z";
    assert.equal(inspectMiniEventRefresh({ state, data, now: NOW }).ok, false,
      "the actual 8.4-hour incident cannot be reported healthy");
    assert.equal(inspectEventRefreshOutput({ data, now: NOW, snapshotMaxAgeHours: 8 }).ok, false);
    input.timestamp = "2026-07-20T04:59:00Z";
    assert.equal(inspectMiniEventRefresh({ state, data, now: NOW }).ok, true,
      "a newly published source snapshot restores health");
  }
});

test("Mini cannot lose an input snapshot while retaining a healthy pushed heartbeat", () => {
  const state = { lastSuccessAt: "2026-07-20T04:30:00Z", head: "a".repeat(40) };
  const data = healthyOutput();
  data.inputSnapshots = data.inputSnapshots.filter((snapshot) => snapshot.name !== "official-event-sources");
  const health = inspectMiniEventRefresh({ state, data, now: NOW });
  assert.equal(health.ok, false);
  assert.ok(health.problems.includes("required input snapshot is missing: official-event-sources"));
});
