import test from "node:test";
import assert from "node:assert/strict";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";
import { buildEventSlugs } from "../../src/lib/south-bay/eventSlug.ts";
import { resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const title = "The Carpenters Songbook: At Christmas";
const canonical = {
  id: "organizer", title, date: "2026-11-27", time: "7:00 PM", city: "san-jose",
  venue: "Center for the Performing Arts", address: "255 South Almaden Boulevard",
  category: "arts", cost: "paid", endTime: null, source: "San Jose Theaters",
  url: "https://www.sanjose.org/theaters/events/carpenters-songbook-christmas",
  occurrenceEvidence: { kind: "first-party-occurrence-page", date: "2026-11-27",
    sourceUrl: "https://www.sanjose.org/theaters/events/carpenters-songbook-christmas" },
};
const ticket = { ...canonical, id: "ticket", source: "Ticketmaster", occurrenceEvidence: undefined,
  title: "The Carpenters Songbook - A Live Celebration - ASL Performance",
  venue: "San Jose Center for the Performing Arts", address: "255 Almaden Blvd.",
  url: "https://www.ticketmaster.com/the-carpenters-songbook-a-live-celebration-san-jose-california-11-27-2026/event/1C0064E1DECF3956" };

test("the renamed Carpenters concert has one occurrence and retains ASL information", () => {
  const events = [ticket, canonical].map(applyVerifiedEventFacts);
  assert.equal(events[0].title, title);
  const { kept } = fuzzyDedupEvents(events);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, canonical.id);
  assert.match(kept[0].attendanceNote, /ASL interpretation/);
  for (const event of events) {
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    assert.equal(event.date, canonical.date);
    assert.equal(event.time, canonical.time);
    assert.equal(event.cost, "paid");
    assert.equal(event.endTime, null);
  }
});

test("the Carpenters alias does not alter another date or ticket event", () => {
  for (const event of [{ ...ticket, date: "2027-11-27" },
    { ...ticket, url: "https://www.ticketmaster.com/event/another-booking" }]) {
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  assert.equal(ticket.title, "The Carpenters Songbook - A Live Celebration - ASL Performance",
    "the captured input is not mutated");
});

test("the former ASL ticket URL redirects to the consolidated concert", () => {
  const slug = "2026-11-27-the-carpenters-songbook-a-live-celebration-asl-performance";
  const { redirects, orphans } = resolveRetired({ entries: [{ slug, event: ticket }] },
    [applyVerifiedEventFacts(canonical)], [], "2026-11-06");
  assert.equal(redirects.get(slug), "2026-11-27-the-carpenters-songbook-at-christmas");
  assert.equal(orphans.length, 0);
});

test("restoring a sourced evening show keeps the existing matinee URL", () => {
  const url = "https://www.sanjose.org/theaters/events/bodyguard";
  const matinee = { ...canonical, id: "z-matinee", title: "The Bodyguard",
    date: "2027-02-06", time: "2:00 PM", url,
    occurrenceEvidence: { kind: "first-party-occurrence-page", sourceUrl: url,
      date: "2027-02-06", time: "2:00 PM" } };
  const evening = { ...matinee, id: "a-evening", time: "7:30 PM",
    occurrenceEvidence: { ...matinee.occurrenceEvidence, time: "7:30 PM" } };
  const base = "2027-02-06-the-bodyguard";
  for (const events of [[matinee, evening], [evening, matinee]]) {
    const slugs = buildEventSlugs(events);
    assert.equal(slugs.get(base).id, matinee.id);
    assert.equal(slugs.get(base + "-2").id, evening.id);
  }
  for (const other of [{ ...evening, url: url + "-another-production" },
    { ...evening, occurrenceEvidence: undefined },
    { ...evening, occurrenceEvidence: { ...evening.occurrenceEvidence, time: "6:00 PM" } }]) {
    assert.equal(buildEventSlugs([matinee, other]).get(base).id, other.id,
      "other collision groups retain their established identifier order");
  }
  const sequel = { ...matinee, id: "m-sequel", title: "The Bodyguard 2", url: url + "-sequel" };
  const withSequel = buildEventSlugs([evening, sequel, matinee]);
  assert.equal(withSequel.size, 3, "a numeric title cannot overwrite a collision suffix");
  assert.equal(withSequel.get(base + "-2").id, sequel.id);
  assert.equal(withSequel.get(base + "-3").id, evening.id);
});
