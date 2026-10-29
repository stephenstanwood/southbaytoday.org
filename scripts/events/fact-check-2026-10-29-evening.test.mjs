import test from "node:test";
import assert from "node:assert/strict";
import { fetchPlaywrightEvents, fetchInboundEvents } from "../generate-events.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

test("retired Timely theater snapshots cannot reintroduce their one-hour-early clocks", () => {
  const legacy = { id: "timely", title: "Dog Man: The Musical", date: "2026-11-01",
    time: "2:00pm", source: "San Jose Theaters", url: "https://www.sanjose.org/theaters" };
  const primary = { ...legacy, id: "primary", time: "3:00 PM",
    url: "https://www.sanjose.org/theaters/events/dog-man-musical",
    occurrenceEvidence: { kind: "first-party-occurrence-page", date: legacy.date,
      sourceUrl: "https://www.sanjose.org/theaters/events/dog-man-musical" } };
  const other = { ...legacy, id: "other", source: "Another Organizer", url: "https://example.org/events" };
  const events = fetchPlaywrightEvents({ today: "2026-10-29", events: [legacy, primary, other] });
  assert.deepEqual(events.map((event) => event.id), ["primary", "other"]);
  assert.equal(events[0].time, "3:00 PM");
});

test("verified museum ingestion survives a different venue's similarly named holiday", () => {
  const [museum] = fetchInboundEvents({ today: "2026-10-29", events: [{
    id: "museum", title: "Día de los Muertos Celebration", cityKey: "san-jose",
    startsAt: "2026-11-01T09:30:00-08:00",
    location: "Children's Discovery Museum of San Jose, 180 Woz Way, San Jose, CA 95110",
    sourceUrl: "https://www.cdm.org/event/dia-de-los-muertos/", description: "A museum celebration.",
  }] });
  assert.equal(museum.time, "10:00 AM");
  const row = { id: "row", title: museum.title, city: museum.city, date: museum.date,
    time: "10:30 AM", venue: "Santana Row", address: "377 Santana Row, San Jose, CA 95128",
    source: "Santana Row", url: "https://santanarow.com/event/dia-de-los-muertos-celebration/" };
  assert.deepEqual(fuzzyDedupEvents([museum, row]).kept.map((event) => event.id), [museum.id, row.id]);
});

test("the Stanford conference preserves in-person fees and the qualified free options", () => {
  const actual = applyVerifiedEventFacts({ id: "stanford-53543265910564-2026-10-30",
    title: "Electrophysiology in the West 2026", date: "2026-10-30", cost: "free",
    venue: "Li Ka Shing Center for Learning and Knowledge",
    url: "https://events.stanford.edu/event/electrophysiology-in-the-west-2026" });
  assert.equal(actual.cost, "paid");
  assert.match(actual.costNote, /\$90/);
  assert.match(actual.costNote, /\$140/);
  assert.match(actual.costNote, /\$390/);
  assert.match(actual.costNote, /Stanford.*email/i);
  assert.match(actual.costNote, /virtual.*free/i);
  assert.match(actual.attendanceNote, /Registration is required/);
  assert.match(actual.attendanceNote, /\$90.*\$140.*\$390/);
  assert.equal(actual.registration, "required");
  assert.equal(applyVerifiedEventFacts({ ...actual, date: "2027-10-30", cost: "free" }).cost, "free");
});
