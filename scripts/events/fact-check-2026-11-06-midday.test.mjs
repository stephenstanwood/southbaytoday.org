import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchStanfordEvents, fetchGambleGardenEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { maintainEventArchive } from "../lib/event-archive.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-06-midday.json", import.meta.url)));
const now = new Date("2026-11-06T20:07:06Z");

test("an intraday refresh archives only started missing sessions and keeps the 90-day boundary", () => {
  const morning = { id: "a", title: "Tech Mentor", date: "2026-11-06", time: "10:00 AM" };
  const noon = { ...morning, id: "b", time: "12:00 PM" };
  const afternoon = { ...morning, id: "c", time: "2:00 PM" };
  const unknown = { ...morning, id: "unknown", time: null };
  const invalid = { ...morning, id: "invalid", time: "25:00 PM" };
  const yesterday = { ...morning, id: "yesterday", date: "2026-11-05" };
  const future = { ...morning, id: "future", date: "2026-11-07" };
  const cutoff = { ...morning, id: "cutoff", date: "2026-08-08" };
  const expired = { ...morning, id: "expired", date: "2026-08-07" };
  const input = { archiveEvents: [expired, cutoff], previousEvents: [morning, noon, afternoon, unknown, invalid, yesterday, future], currentEvents: [noon], now };
  const { events } = maintainEventArchive(input);
  assert.deepEqual(events.map(e=>e.id), ["cutoff", "yesterday", "a"]);
  assert.deepEqual(maintainEventArchive({ ...input, archiveEvents: events }).events, events);
  assert.equal(input.archiveEvents.length, 2, "inputs are not mutated");
  const atMidnight = maintainEventArchive({ previousEvents: [{ ...morning, time: "12:00 AM" }, noon], now: new Date("2026-11-06T08:00:00Z") });
  assert.deepEqual(atMidnight.events.map(e=>e.id), ["a"], "midnight is minute zero in Pacific time");
});

test("Stanford carries mandatory free tickets from admission terms, without inferring them from a link", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const record = fixture.stanford.record;
  const terms = [
    record.ticket_cost,
    "Free. Tickets are optional.",
    "Free. No ticket required.",
    "Free. Ticket not required.",
    "Free.",
    "Free ticket required. Registration is full.",
    "Free ticket required. Registration is closed.",
    "Free. Tickets are required.",
  ];
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: terms.map((ticket_cost, index) => ({ event: {
      ...record, id: record.id + index, ticket_cost,
    } })) });
  });
  const events = await fetchStanfordEvents();
  assert.equal(events.length, terms.length);
  assert.equal(events[0].registration, "required");
  assert.match(events[0].attendanceNote, /Free ticket required\./);
  assert.equal(events[0].cost, "free");
  assert.equal(events[0].date, "2026-11-07");
  assert.equal(events[0].time, "6:00 PM");
  assert.equal(events[0].endTime, null);
  assert.equal(events[0].venue, "In person at Stanford");
  for (const event of events.slice(1, 5)) {
    assert.equal(event.registration, undefined);
    assert.equal(event.attendanceNote, undefined);
  }
  assert.equal(events[5].registration, "full");
  assert.equal(events[6].registration, "closed");
  assert.equal(events[7].registration, "required");
});

test("Second Saturday reads timed admission beyond a nonempty API excerpt and respects crawl delay", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const { record, detailHtml } = fixture.gamble;
  const requests = [], waits = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    if (String(url).includes("/wp-json/tribe/events/")) return Response.json({ events: [record], total_pages: 1 });
    assert.equal(String(url), record.url);
    return new Response(detailHtml);
  });
  const [event] = await fetchGambleGardenEvents({ wait: async (ms) => waits.push(ms) });
  assert.equal(event.cost, "free");
  assert.equal(event.registration, "required");
  assert.match(event.attendanceNote, /Register for timed entry at 10:00 AM, 10:30 AM, or 11:00 AM\./);
  assert.match(event.attendanceNote, /check in at one of our two Welcome Tables/);
  assert.equal(event.description, record.description);
  assert.equal(event.date, "2026-11-14");
  assert.equal(event.time, "10:00 AM");
  assert.equal(event.endTime, "12:00 PM");
  assert.equal(event.url, record.url);
  assert.equal(event.kidFriendly, true);
  assert.equal(requests.length, 2);
  assert.deepEqual(waits, [10_000]);
});

test("Second Saturday follows changed admission and never turns optional signup or free parking into requirements", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const { record } = fixture.gamble;
  const cases = [
    { body: "Second Saturday is free and appropriate for all ages. Register for timed entry at 9:00 AM or 11:30 AM.", cost: "free", registration: "required", note: /9:00 AM or 11:30 AM/ },
    { body: "Free parking. Optional registration provides a reminder email.", cost: null },
    { body: "Second Saturday is free and appropriate for all ages. No registration is required.", cost: "free" },
    { body: "Registration is full. Register for timed entry at 10:00 AM.", cost: null, registration: "full" },
    { body: "Registration is closed. Register for timed entry at 10:00 AM.", cost: null, registration: "closed" },
  ];
  for (const example of cases) {
    t.mock.method(globalThis, "fetch", async (url) => String(url).includes("/wp-json/tribe/events/")
      ? Response.json({ events: [record], total_pages: 1 })
      : new Response(`<nav>Register for timed entry at 8:00 AM.</nav><div class="tribe-events-single-event-description">${example.body}</div>`));
    const [event] = await fetchGambleGardenEvents({ wait: async () => {} });
    assert.equal(event.cost, example.cost);
    assert.equal(event.registration, example.registration);
    if (example.note) assert.match(event.attendanceNote, example.note);
    else if (!example.registration) assert.equal(event.attendanceNote, undefined);
  }
});

test("cached dated cards retain both verified booking gates and their original identity", async () => {
  const events = [fixture.stanford.publishedBefore, fixture.gamble.publishedBefore].map(e => ({ ...e }));
  await resolveEventBlurbs(events, { enabled: false });
  for (let i = 0; i < events.length; i++) {
    const before = [fixture.stanford, fixture.gamble][i].publishedBefore;
    assert.equal(events[i].cost, "free");
    assert.equal(events[i].registration, "required");
    for (const key of ["id", "title", "date", "time", "endTime", "venue", "url", "description", "blurb"]) {
      assert.equal(events[i][key], before[key], key);
    }
    assert.deepEqual(applyVerifiedEventFacts(events[i]), events[i]);
    for (const registration of ["full", "closed", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...before, registration }).registration, registration);
    }
    assert.equal(applyVerifiedEventFacts({ ...before, date: "2028-11-07" }).registration, undefined);
    assert.equal(applyVerifiedEventFacts({ ...before, url: before.url + "-other" }).registration, undefined);
  }
});
