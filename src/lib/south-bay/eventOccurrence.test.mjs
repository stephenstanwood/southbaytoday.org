import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hasRequiredOccurrenceEvidence,
  isEventExplicitlyInactive,
  isEventPublishable,
} from "./eventOccurrence.mjs";

const grpgEvent = {
  source: "Guadalupe River Park Conservancy",
  title: "Yoga and Zumba in the River Park",
  date: "2026-07-25",
  venue: "Arena Green West",
};

test("GRPG dates require exact first-party occurrence-page evidence", () => {
  assert.equal(hasRequiredOccurrenceEvidence(grpgEvent), false);
  assert.equal(hasRequiredOccurrenceEvidence({
    ...grpgEvent,
    occurrenceEvidence: {
      kind: "first-party-occurrence-page",
      sourceUrl: "https://grpg.org/calendar/events/",
      date: "2026-07-25",
    },
  }), true);
  assert.equal(hasRequiredOccurrenceEvidence({
    ...grpgEvent,
    occurrenceEvidence: {
      kind: "first-party-occurrence-page",
      sourceUrl: "https://grpg.org/calendar/events/",
      date: "2026-08-29",
    },
  }), false);
});

test("an aggregator or tracking link cannot stand in for first-party evidence", () => {
  assert.equal(hasRequiredOccurrenceEvidence({
    source: "Linden Tree Books",
    title: "Teen Writing Workshop",
    date: "2026-07-16",
    occurrenceEvidence: {
      kind: "first-party-occurrence-page",
      sourceUrl: "https://m4e9g4bab.cc.rs6.net/tn.jsp",
      date: "2026-07-16",
    },
  }), false);
});

test("structured inactive statuses and explicit cancellation titles are rejected", () => {
  assert.equal(isEventExplicitlyInactive({ eventStatus: "https://schema.org/EventCancelled" }), true);
  assert.equal(isEventExplicitlyInactive({ sourceStatus: "postponed" }), true);
  assert.equal(isEventExplicitlyInactive({ title: "CANCELLED: Garden Workday" }), true);
  assert.equal(isEventExplicitlyInactive({
    eventStatus: "https://schema.org/EventScheduled",
    description: "Refunds are available if the event is canceled.",
  }), false);
});

test("publishability combines occurrence evidence with editorial place availability", () => {
  assert.equal(isEventPublishable({
    ...grpgEvent,
    occurrenceEvidence: {
      kind: "first-party-occurrence-page",
      sourceUrl: "https://www.grpg.org/events",
      date: "2026-07-25",
    },
  }), true);
  assert.equal(isEventPublishable({
    source: "Santa Clara University",
    title: "Museum Open House",
    date: "2026-09-05",
    venue: "de Saisset Museum",
    eventStatus: "https://schema.org/EventScheduled",
  }), false);
});

test("canonical evidence-required rows contain exact occurrence evidence", () => {
  const upcoming = JSON.parse(readFileSync(
    new URL("../../data/south-bay/upcoming-events.json", import.meta.url),
    "utf8",
  ));
  const evidenceRequiredEvents = (upcoming.events || []).filter(
    (event) => ["Guadalupe River Park Conservancy", "Linden Tree Books"].includes(event.source),
  );

  assert.equal(evidenceRequiredEvents.every((event) => hasRequiredOccurrenceEvidence(event)), true);
  assert.equal(evidenceRequiredEvents.every((event) => isEventPublishable(event)), true);
});
