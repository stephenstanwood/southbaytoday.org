import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchStanfordEvents, fetchScuEvents, fetchInboundEvents, polishDescription } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { polishReviewedEventCopy } from "../../src/lib/south-bay/eventCopyEdits.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-02-evening.json", import.meta.url)));
const row = id => structuredClone(fixture.events.find(event => event.id === id));

test("Theft's raw source comma cannot restore the conflicting Thursday cadence after copy editing", () => {
  const event = row("sccl-6ab592174852aa18b5b0a4fc");
  // Replay the actual order: source prose normalization, verified facts, then copy desk.
  // The former regression covered only text with its comma already removed.
  const raw = fixture.theftSourceDescription.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const source = { ...event, description: polishDescription(raw) };
  const actual = polishReviewedEventCopy(applyVerifiedEventFacts(source));
  assert.doesNotMatch(actual.description, /third Thursday/);
  assert.match(actual.description, /2025 novel Theft/);
  assert.match(actual.description, /Meetings are held in Room 201B/);
  assert.equal(actual.date, "2026-11-18");
  assert.equal(actual.time, "11:00 AM");
  assert.equal(actual.endTime, "12:30 PM");
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  assert.match(source.description, /third Thursday/, "source remains immutable");
  assert.deepEqual(applyVerifiedEventFacts({ ...source, date: "2027-11-18" }), { ...source, date: "2027-11-18" });
});

test("Stanford's affiliate coffee hour is excluded before its full eligibility sentence is shortened", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-02T19:00:00-08:00") });
  const source = fixture.stanfordSources.find(event => event.id === 54069403650036);
  const publicCoffee = { ...source, id: 9990001, description_text: "Coffee and conversation. Open to everyone in the general public.", description: "Coffee and conversation. Open to everyone in the general public." };
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [source, publicCoffee].map(event => ({ event })) }));
  const events = await fetchStanfordEvents();
  assert.equal(events.some(event => event.id.includes(String(source.id))), false);
  assert.equal(events.some(event => event.id.includes("9990001")), true);
  const sparse = row("stanford-54069403650036-2026-11-04");
  assert.equal(isEventPublishable({ ...sparse, description: "" }), false);
  assert.equal(isEventPublishable({ ...sparse, date: "2027-11-04" }), true);
});

test("the mentorship kickoff's contradictory date stays withheld without declaring a cancellation", () => {
  const source = fixture.stanfordSources.find(event => event.id === 54411717562546);
  assert.match(source.description_text, /Thursday, 29 October 2026/);
  assert.match(source.event_instances[0].event_instance.start, /^2026-11-03/);
  const event = row("stanford-54411717562546-2026-11-03");
  assert.equal(isEventPublishable(event), false);
  assert.equal(isEventPublishable({ ...event, date: "2027-11-03" }), true);
  assert.equal(isEventPublishable({ ...event, title: "Public Mentorship Workshop" }), true);
});

test("SCU's sparse RSS entry retains the source-backed room and required registration", async t => {
  const event = row("scu-c79ca354573f603a");
  const xml = `<rss><channel><item><title>${event.title.replaceAll("&", "&amp;")}</title><link>${event.url}</link><pubDate>Thu, 05 Nov 2026 16:30:00 -0800</pubDate><description></description></item></channel></rss>`;
  t.mock.method(globalThis, "fetch", async url => new URL(url).pathname === "/live/rss/events"
    ? new Response(xml) : Response.json({ meta: { total_pages: 1 }, data: [fixture.scuSource] }));
  const rows = await fetchScuEvents();
  assert.equal(rows.length, 1);
  const actual = applyVerifiedEventFacts(rows[0]);
  assert.equal(actual.title, "GBP & MSSB Fireside Chat: SF Giants");
  assert.equal(actual.venue, "Lucas Hall");
  assert.equal(actual.registration, "required");
  assert.match(actual.attendanceNote, /Room 209/);
  assert.equal(actual.time, "4:30 PM");
  assert.equal(actual.cost, "", "an unknown price remains unknown");
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const registration of ["closed", "full", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
  }
  for (const other of [{ ...event, date: "2027-11-05" }, { ...event, url: "https://example.org/other" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("the rally uses the organizer's Friday occurrence and preserves the autograph eligibility condition", () => {
  const event = row("inbound-58e6e16a32afb464");
  const [imported] = fetchInboundEvents({ today: "2026-11-02", events: [{
    id: "rally", title: event.title, startsAt: "2026-11-13T18:00:00-08:00", cityKey: event.city,
    location: event.address, sourceUrl: event.url, description: event.description,
  }] });
  const actual = applyVerifiedEventFacts(imported);
  assert.equal(actual.date, "2026-11-13");
  assert.equal(actual.time, "6:00 PM");
  assert.equal(actual.venue, "San Pedro Square Market");
  assert.doesNotMatch(actual.description, /Saturday|date or weekday may be wrong/);
  assert.match(actual.attendanceNote, /season ticket holders/i);
  assert.match(actual.attendanceNote, /RSVP/);
  assert.equal(actual.registration, undefined, "an RSVP invitation alone does not establish required registration");
  assert.equal(actual.cost, null);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const other of [{ ...event, date: "2027-11-13" }, { ...event, url: "https://example.org/other" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});
