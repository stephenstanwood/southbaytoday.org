import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { deduplicateEventSlots } from "../lib/event-url-dedup.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/library-concurrent-programs-2026-11-13.json", import.meta.url)));

for (const pair of fixture.pairs) {
  test(`distinct organizer records survive the shared slot: ${pair[0].title}`, () => {
    const input = structuredClone(pair);
    assert.equal(input[0].venue, input[1].venue);
    assert.equal(input[0].time, input[1].time);
    assert.deepEqual(deduplicateEventSlots(input), pair);
    assert.deepEqual(fuzzyDedupEvents(deduplicateEventSlots(input)).kept, pair);
    assert.deepEqual(input, pair);
    assert.deepEqual(deduplicateEventSlots([...input].reverse()), [...pair].reverse());
  });
}

test("newsletter copies and v2 aliases of the same library occurrence still deduplicate", () => {
  const original = fixture.pairs[0][0];
  const copy = { ...original, id: "newsletter-copy", source: "City Newsletter", url: original.url.replace("/events/", "/v2/events/") + "?utm_source=newsletter" };
  assert.equal(deduplicateEventSlots([original, copy]).length, 1);
});

test("other organizers retain the existing concrete-slot matching and sparse rows", () => {
  const original = { ...fixture.pairs[0][0], url: "https://example.org/event/one", source: "Another organizer" };
  const copy = { ...original, id: "another-copy", url: "https://example.org/event/two" };
  const untimed = { ...original, id: "untimed", time: null };
  const noVenue = { ...original, id: "no-venue", venue: null, url: "https://example.org/event/three" };
  assert.deepEqual(deduplicateEventSlots([original, copy, untimed, noVenue]), [original, untimed, noVenue]);
});

test("a hostname containing bibliocommons does not establish library record identity", () => {
  const pair = fixture.pairs[0].map(event => ({ ...event, url: event.url.replace("sccl.bibliocommons.com", "sccl.bibliocommons.com.example.org") }));
  assert.equal(deduplicateEventSlots(pair).length, 1);
});
