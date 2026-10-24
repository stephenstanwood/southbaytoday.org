import assert from "node:assert/strict";
import test from "node:test";

import { inspectPlaywrightCoverage } from "../lib/playwright-source-resilience.mjs";

function coverageFixture() {
  const rows = (source, count) => Array.from({ length: count }, () => ({ source, date: "2026-11-01" }));
  const active = Array.from({ length: 20 }, (_, i) => `Active ${i}`);
  const events = active.flatMap((source, i) => rows(source, i === 0 ? 34 : 10));
  const previousRows = [
    ...events,
    ...rows("Mountain View Public Library", 114),
    ...rows("Los Gatos Library", 103),
  ];
  return {
    previous: {
      _meta: { eventCount: 441, sources: [...active, "Mountain View Public Library", "Los Gatos Library"] },
      events: previousRows,
    },
    events,
    tasks: active.map((name) => ({ name })),
  };
}

test("reviewed LibCal retirements do not block the 441-to-224 transition or mutate old data", () => {
  const fixture = coverageFixture();
  const before = JSON.stringify(fixture);
  assert.deepEqual(inspectPlaywrightCoverage(fixture), {
    previousEvents: 224,
    previousSources: 20,
    nextEvents: 224,
    nextSources: 20,
    excludedRows: 217,
    excludedSources: ["Mountain View Public Library", "Los Gatos Library"],
    regressed: false,
  });
  assert.equal(JSON.stringify(fixture), before);
});

test("retired rows cannot mask a loss below 60 percent of remaining coverage", () => {
  const fixture = coverageFixture();
  // Retain every active source, isolating the event-count threshold.
  fixture.events = fixture.events.filter((_, i) => i % 2 === 0);
  assert.equal(inspectPlaywrightCoverage(fixture).regressed, true);
});

test("four unexpectedly missing active sources still block after retirement", () => {
  const fixture = coverageFixture();
  fixture.events = fixture.events.filter((event) => !["Active 16", "Active 17", "Active 18", "Active 19"].includes(event.source));
  assert.equal(inspectPlaywrightCoverage(fixture).regressed, true);
});

test("an unreviewed removal stays protected even when its task is missing", () => {
  const fixture = coverageFixture();
  for (const event of fixture.previous.events) {
    if (event.source === "Mountain View Public Library") event.source = "Unreviewed Library";
  }
  assert.equal(inspectPlaywrightCoverage(fixture).previousEvents, 338);
  fixture.events = fixture.events.filter((_, i) => i % 2 === 0);
  assert.equal(inspectPlaywrightCoverage(fixture).regressed, true);
});

test("a restored library task receives the normal coverage protection", () => {
  const fixture = coverageFixture();
  fixture.tasks.push({ name: "Mountain View Public Library" }, { name: "Los Gatos Library" });
  const result = inspectPlaywrightCoverage(fixture);
  assert.equal(result.excludedRows, 0);
  assert.equal(result.previousEvents, 441);
  assert.equal(result.regressed, true);
});

test("the existing 60-percent and four-source boundaries remain unchanged", () => {
  const tasks = Array.from({ length: 20 }, (_, i) => ({ name: `Active ${i}` }));
  const rows = (count) => Array.from({ length: count }, (_, i) => ({ source: tasks[i % 20].name }));
  const previous = { _meta: { eventCount: 200, sources: tasks.map((task) => task.name) }, events: rows(200) };
  assert.equal(inspectPlaywrightCoverage({ previous, tasks, events: rows(120) }).regressed, false);
  assert.equal(inspectPlaywrightCoverage({ previous, tasks, events: rows(119) }).regressed, true);
  assert.equal(inspectPlaywrightCoverage({ previous, tasks, events: rows(200).filter((event) => !["Active 17", "Active 18", "Active 19"].includes(event.source)) }).regressed, false);
  assert.equal(inspectPlaywrightCoverage({ previous, tasks, events: rows(200).filter((event) => !["Active 16", "Active 17", "Active 18", "Active 19"].includes(event.source)) }).regressed, true);
});
