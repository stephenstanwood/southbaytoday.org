import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paloAltoPlayersTicketSource, paloAltoPlayersOccurrence } from "../lib/palo-alto-players-events.mjs";
import { fetchPaloAltoPlayersEvents, isEventTimeBackfillCandidate } from "../generate-events.mjs";
import { hasRequiredOccurrenceEvidence } from "../../src/lib/south-bay/eventOccurrence.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/palo-alto-players-2026-11-01.json", import.meta.url)));
const options = { sourceUrl: fixture.sourceUrl, title: fixture.ticket.name,
  venue: "Lucie Stern Theatre", today: "2026-11-01", checkedAt: "2026-11-02T06:20:00Z" };
const booking = '<a href="https://my.paplayers.org/EventAvailability?EventId=12801&amp;ref=bookNow">Buy Tickets</a>';

test("production links bind the exact Palo Alto Players booking identity", () => {
  assert.equal(paloAltoPlayersTicketSource(booking + booking), fixture.sourceUrl);
  for (const html of [booking.replace("my.paplayers.org", "example.org"),
    booking.replace("https:", "http:"), booking + booking.replace("12801", "13001"),
    '<p>EventId=12801</p>']) assert.equal(paloAltoPlayersTicketSource(html), null);
});

test("the next published performance replaces a projected run day and distinguishes matinees", () => {
  const next = paloAltoPlayersOccurrence(fixture.ticket, options);
  assert.equal(next.date, "2026-11-06");
  assert.equal(next.time, "7:30 PM");
  assert.equal(next.occurrenceEvidence.sourceOccurrenceId, fixture.ticket.instances[0].id);
  assert.equal(paloAltoPlayersOccurrence(fixture.ticket, { ...options, today: "2026-11-07" }).time, "2:00 PM");
  const sunday = paloAltoPlayersOccurrence(fixture.ticket, { ...options, today: "2026-11-08" });
  assert.equal(sunday.date, "2026-11-08");
  assert.equal(sunday.time, "2:00 PM");
  assert.equal(paloAltoPlayersOccurrence(fixture.ticket, { ...options, today: "2026-11-09" }), null);
});

test("unrelated, canceled, invalid, or contradictory occurrences cannot supply a date", () => {
  const first = fixture.ticket.instances[0];
  for (const bad of [{ ...first, cancelled: true }, { ...first, cancelled: undefined },
    { ...first, event: { id: "other-production" } }, { ...first, start: "2026-11-06" },
    { ...first, start: "2026-99-06T19:30:00" }, { ...first, start: "2026-02-30T19:30:00" },
    { ...first, startUtc: "2026-11-07T22:00:00" },
    { ...first, availability: { name: "Another Theatre" } }]) {
    assert.equal(paloAltoPlayersOccurrence({ ...fixture.ticket, instances: [bad] }, options), null);
  }
  assert.equal(paloAltoPlayersOccurrence(fixture.ticket, { ...options, title: "Another Show" }), null);
  assert.equal(paloAltoPlayersOccurrence(fixture.ticket, { ...options, sourceUrl: options.sourceUrl.replace("12801", "13001") }), null);
  assert.equal(paloAltoPlayersOccurrence(fixture.ticket, { ...options, sourceUrl: options.sourceUrl.replace("paloaltoplayers", "anotherclient") }), null);
});

test("published future performances preserve unavailable single-ticket sales and full capacity", () => {
  const first = fixture.ticket.instances[0];
  const notOnSale = paloAltoPlayersOccurrence({ ...fixture.ticket, instances: [{ ...first, isOnSale: false }] }, options);
  assert.equal(notOnSale.date, "2026-11-06");
  assert.match(notOnSale.attendanceNote, /not currently on sale/);
  assert.equal(notOnSale.registration, undefined);
  const full = paloAltoPlayersOccurrence({ ...fixture.ticket,
    instances: [{ ...first, availability: { ...first.availability, available: 0 } }] }, options);
  assert.equal(full.registration, "full");
});

test("the actual adapter reads linked occurrences and cannot reuse the production's generic clock", async () => {
  const html = `<h1>The Addams Family</h1><p>Oct 30, 2026 – Nov 15, 2026</p>
    <p>7:30 PM Evenings: Fridays and Saturdays. 2:00 PM Matinees: Sundays and select Saturdays.</p>${booking}`;
  const requests = [];
  const events = await fetchPaloAltoPlayersEvents({ today: options.today, fetchImpl: async (url) => {
    requests.push(url);
    if (url.includes("/wp-json/")) return Response.json([{ link: fixture.productionUrl, title: { rendered: fixture.ticket.name } }]);
    if (url === fixture.productionUrl) return new Response(html);
    assert.equal(url, fixture.sourceUrl);
    return Response.json(fixture.ticket);
  } });
  assert.equal(requests.length, 3);
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.date, "2026-11-06");
  assert.equal(event.time, "7:30 PM");
  assert.equal(event.endTime, null);
  assert.equal(isEventTimeBackfillCandidate({ ...event, time: null }), false);
  assert.equal(hasRequiredOccurrenceEvidence(event), true);
  for (const changed of [{ ...event, date: "2026-11-01" }, { ...event, time: "2:00 PM" },
    { ...event, occurrenceEvidence: undefined },
    { ...event, occurrenceEvidence: { ...event.occurrenceEvidence, sourceUrl: fixture.productionUrl } }]) {
    assert.equal(hasRequiredOccurrenceEvidence(changed), false);
  }
});
