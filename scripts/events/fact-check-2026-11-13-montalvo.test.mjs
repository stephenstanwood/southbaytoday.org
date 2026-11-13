import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchMontalvoEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-13-montalvo.json", import.meta.url)));
const now = new Date("2026-11-13T16:07:04Z");
const calendar = graph => `<script type="application/ld+json">${JSON.stringify({ "@graph": graph })}</script>`;
const partial = fixture.calendarGraph.filter(row => row.name !== "Pablo Cruise");

function mockSource(t, responses) {
  const requests = [];
  let calendarReads = 0;
  t.mock.method(globalThis, "fetch", async url => {
    const value = String(url);
    requests.push(value);
    if (value === fixture.calendarUrl) {
      assert(calendarReads < responses.length, "calendar retries are bounded");
      return new Response(calendar(responses[calendarReads++]));
    }
    const row = fixture.calendarGraph.find(event => event.url === value);
    assert(row, `unexpected source request: ${value}`);
    return new Response(value === fixture.ticketUrl ? fixture.ticketHtml : `<title>${row.name}</title>`);
  });
  return { requests, get calendarReads() { return calendarReads; } };
}

test("the real adapter recovers a partial successful Montalvo calendar on one fresh read", async t => {
  const source = mockSource(t, [partial, fixture.calendarGraph]);
  const before = structuredClone(fixture.previous);
  const events = await fetchMontalvoEvents({ previousEvents: [fixture.previous], now });
  assert.equal(source.calendarReads, 2);
  assert.equal(events.length, 5);
  const event = applyVerifiedEventFacts(events.find(row => row.url === fixture.ticketUrl));
  assert.equal(event.title, "Pablo Cruise");
  assert.equal(event.date, "2026-11-20");
  assert.equal(event.time, "7:30 PM");
  assert.equal(event.cost, "paid");
  assert.equal(event.category, "music");
  assert.equal(event.address, "15400 Montalvo Rd, Saratoga, CA 95070");
  assert.equal(event.occurrenceEvidence.sourceUrl, fixture.ticketUrl);
  assert(source.requests.includes(fixture.ticketUrl), "the recovered row receives normal detail verification");
  assert.deepEqual(fixture.previous, before);
});

test("a healthy calendar recognizes the production/ticket alias and is fetched only once", async t => {
  const source = mockSource(t, [fixture.calendarGraph]);
  const events = await fetchMontalvoEvents({ previousEvents: [fixture.previous], now });
  assert.equal(source.calendarReads, 1);
  assert.equal(events.length, 5);
});

test("a removal on both calendar reads is accepted without inventing or retaining the old listing", async t => {
  const source = mockSource(t, [partial, partial]);
  const events = await fetchMontalvoEvents({ previousEvents: [fixture.previous], now });
  assert.equal(source.calendarReads, 2);
  assert.equal(events.length, 4);
  assert(!events.some(row => row.title === "Pablo Cruise"));
  assert(!source.requests.includes(fixture.ticketUrl));
});

test("a fresh cancellation stays removed even when its record returns on the retry", async t => {
  const cancelled = structuredClone(fixture.calendarGraph);
  cancelled.find(row => row.name === "Pablo Cruise").eventStatus = "https://schema.org/EventCancelled";
  const source = mockSource(t, [partial, cancelled]);
  const events = await fetchMontalvoEvents({ previousEvents: [fixture.previous], now });
  assert.equal(source.calendarReads, 2);
  assert(!events.some(row => row.title === "Pablo Cruise"));
  assert(!source.requests.includes(fixture.ticketUrl));
});

test("the newer calendar's changed occurrence flows through instead of the old date", async t => {
  const rescheduled = structuredClone(fixture.calendarGraph);
  const show = rescheduled.find(row => row.name === "Pablo Cruise");
  show.startDate = "2026-11-21T19:30:00+00:00";
  const source = mockSource(t, [partial, rescheduled]);
  const events = await fetchMontalvoEvents({ previousEvents: [fixture.previous], now });
  assert.equal(source.calendarReads, 2);
  const actual = events.find(row => row.url === fixture.ticketUrl);
  assert.equal(actual.date, "2026-11-21");
  assert.equal(actual.time, "7:30 PM");
});

test("elapsed, ongoing and unrelated source records do not trigger a calendar retry", async t => {
  const source = mockSource(t, [partial]);
  await fetchMontalvoEvents({ previousEvents: [
    { ...fixture.previous, date: "2026-11-12" },
    { ...fixture.previous, ongoing: true },
    { ...fixture.previous, source: "Another organizer" },
  ], now });
  assert.equal(source.calendarReads, 1);
});
