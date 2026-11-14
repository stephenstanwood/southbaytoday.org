import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { deduplicateEventSlots } from "../lib/event-url-dedup.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/cantor-concurrent-programs-2026-11-15.json", import.meta.url)));

test("the organizer's distinct simultaneous Cantor programs survive either input order", () => {
  const before = structuredClone(fixture);
  for (const events of [fixture, [...fixture].reverse()]) {
    assert.equal(deduplicateEventSlots(events).length, 2);
  }
  assert.deepEqual(fixture, before);
});

test("a newsletter copy and its authoritative Localist occurrence still merge", () => {
  const official = { ...fixture[0], id: "stanford-53695161366348-2026-11-15", source: "Stanford Events",
    occurrenceEvidence: { kind: "first-party-occurrence-page", sourceUrl: fixture[0].url, date: fixture[0].date } };
  for (const events of [[...fixture, official], [official, ...fixture]]) {
    const kept = deduplicateEventSlots(events);
    assert.equal(kept.length, 2);
    assert(kept.includes(official));
    assert(kept.includes(fixture[1]));
    assert.equal(official.registration, "required");
  }
});

test("the same Localist page with a trailing slash is one occurrence", () => {
  assert.equal(deduplicateEventSlots([fixture[0], { ...fixture[0], url: fixture[0].url + "/" }]).length, 1);
});

test("SJSU's Localist pages preserve distinct simultaneous programs too", () => {
  const rows = fixture.map((e) => ({ ...e, url: e.url.replace("events.stanford.edu", "events.sjsu.edu") }));
  assert.equal(deduplicateEventSlots(rows).length, 2);
});

test("other hosts and collection pages retain their established slot matching", () => {
  for (const url of ["https://example.edu/event/", "https://events.stanford.edu/calendar/"]) {
    const rows = fixture.map((e, i) => ({ ...e, url: url + "?id=" + i }));
    assert.equal(deduplicateEventSlots(rows).length, 1);
  }
});

