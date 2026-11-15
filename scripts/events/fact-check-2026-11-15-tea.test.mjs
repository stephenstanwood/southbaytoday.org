import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchInboundEvents, polishDescription } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-15-tea.json", import.meta.url)));

test("the real newsletter adapter cannot restore seats or booking copy for the sold-out tea", async () => {
  const [event] = fetchInboundEvents({ today: "2026-11-15", events: [fixture.incoming] });
  assert(event);
  event.description = polishDescription(event.description);
  event.blurb = fixture.published.blurb;
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "full");
  assert.equal(event.description, fixture.description);
  assert.equal(event.blurb, fixture.blurb);
  assert.match(event.attendanceNote, /Sold out.*waitlist.*11:30 AM/);
  assert.equal(event.date, "2026-11-22");
  assert.equal(event.time, "11:30 AM");
  assert.equal(event.endTime, null);
  assert.equal(event.costNote, fixture.published.costNote);
  assert.equal(event.url, fixture.incoming.sourceUrl);
});

test("cached publication repairs only the stale availability clauses and is stable on repeat", async () => {
  const event = structuredClone(fixture.published);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.description, fixture.description);
  assert.equal(event.blurb, fixture.blurb);
  for (const key of Object.keys(fixture.published).filter(key => !["description", "blurb"].includes(key)))
    assert.deepEqual(event[key], fixture.published[key], key);
  const first = structuredClone(event);
  await resolveEventBlurbs([event], { enabled: false });
  assert.deepEqual(event, first);
});

test("revised seating facts and fresh exact-performance evidence supersede the dated copy repair", () => {
  for (const change of [
    { date: "2027-11-22" }, { time: "2:30 PM" },
    { url: "https://my.montalvoarts.org/3253/3255" },
    { costNote: "$90 per person." }, { registration: "appointment-only" },
    { occurrenceEvidence: { admissionSourceUrl: fixture.sourceUrl },
      registration: "required", attendanceNote: "Tickets available again." },
  ]) {
    const event = { ...fixture.published, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  const revised = { ...fixture.published, description: "The organizer has changed the menu.", blurb: "Read the organizer's current menu." };
  const actual = applyVerifiedEventFacts(revised);
  assert.equal(actual.description, revised.description);
  assert.equal(actual.blurb, revised.blurb);
  assert.equal(applyVerifiedEventFacts({ ...fixture.published, registration: "closed" }).registration, "closed");
});
