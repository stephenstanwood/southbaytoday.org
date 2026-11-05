import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeInboundEventPresentation } from "../lib/inbound-event-normalize.mjs";
import { deduplicateEventUrls } from "../lib/event-url-dedup.mjs";
import { compareDuplicateAuthority } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const capture = JSON.parse(readFileSync(new URL("../lib/fixtures/cdm-november-2026.json", import.meta.url)));

test("Diwali intake uses the celebration's clocks, keeping its first performance separate", async () => {
  const before = structuredClone(capture);
  const { diwali } = capture;
  assert.equal(diwali.sourceEvent.startDate, "2026-11-07T10:00:00-08:00");
  assert.equal(diwali.sourceEvent.endDate, "2026-11-07T15:30:00-08:00");
  assert.equal(diwali.firstPerformanceTime, "10:40 AM");
  assert(diwali.intake.some(e => e.startsAt === "2026-11-07T10:40:00-08:00"));

  for (const raw of diwali.intake) {
    const normalized = normalizeInboundEventPresentation(raw);
    assert.equal(normalized.time, "10:00 AM");
    assert.equal(normalized.endTime, "3:30 PM");
    assert.equal(normalized.url, diwali.sourceEvent.url);
  }
  for (const raw of diwali.publishedBefore) {
    const events = [structuredClone(raw)];
    await resolveEventBlurbs(events, { enabled: false });
    const fixed = events[0];
    assert.equal(fixed.time, "10:00 AM");
    assert.equal(fixed.endTime, "3:30 PM");
    assert.equal(fixed.title, diwali.sourceEvent.name);
    assert.equal(fixed.url, diwali.sourceEvent.url);
    assert.equal(fixed.cost, "paid");
    assert.doesNotMatch(fixed.blurb, /10:40/);
    for (const field of ["id", "date", "city", "source", "kidFriendly", "audienceAge"]) {
      assert.equal(fixed[field], raw[field], field);
    }
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  }
  assert.deepEqual(capture, before, "do not change captured newsletter or calendar evidence");
});

test("both newsletter aliases and the calendar row resolve to one Diwali occurrence in either order", () => {
  for (const input of [capture.diwali.publishedBefore, [...capture.diwali.publishedBefore].reverse()]) {
    const corrected = input.map(e => applyVerifiedEventFacts(structuredClone(e)));
    const kept = deduplicateEventUrls(corrected.sort(compareDuplicateAuthority));
    assert.equal(kept.length, 1);
    assert.equal(kept[0].title, "Diwali: Festival of Lights");
    assert.equal(kept[0].date, "2026-11-07");
    assert.equal(kept[0].venue, "Children's Discovery Museum");
    assert.equal(kept[0].url, capture.diwali.sourceEvent.url);
  }
});

test("the dated storytime retains only organizer-confirmed facts through cached blurb refresh", async () => {
  const { storytime } = capture;
  assert.equal(storytime.sourceEvent.startDate, "2026-11-10T11:30:00-08:00");
  assert.equal(storytime.sourceEvent.endDate, "2026-11-10T12:00:00-08:00");
  assert.match(storytime.sourceEvent.description, /Brandenburg Theatre/);
  const events = [structuredClone(storytime.publishedBefore)];
  await resolveEventBlurbs(events, { enabled: false });
  const [fixed] = events;
  assert.equal(fixed.title, storytime.sourceEvent.name);
  assert.equal(fixed.url, storytime.sourceEvent.url);
  assert.equal(fixed.time, "11:30 AM");
  assert.equal(fixed.endTime, "12:00 PM");
  assert.doesNotMatch([fixed.title, fixed.description, fixed.blurb].join(" "), /Chugga|Kevin Lewis/);
  for (const field of ["id", "date", "venue", "address", "city", "source", "cost", "kidFriendly"]) {
    assert.equal(fixed[field], storytime.publishedBefore[field], field);
  }
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
});

test("museum corrections do not project another date or alter another venue's Diwali or storytime", () => {
  for (const raw of [...capture.diwali.publishedBefore, capture.storytime.publishedBefore]) {
    for (const other of [
      { ...raw, date: "2027" + raw.date.slice(4) },
      { ...raw, date: "2026-11-14" },
      { ...raw, venue: "Another Museum" },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});
