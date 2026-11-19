import assert from "node:assert/strict";
import test from "node:test";
import { eventSourceDefinitions } from "../generate-events.mjs";
import { buildSourceHealth, eventsForSourceResult, retainFailedOptionalSources, sourceProblems } from "../lib/event-source-health.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";

const source = () => eventSourceDefinitions().find(item => item.id === "fetchStanfordEvents");
const observedAt = "2026-11-04T13:04:10.179Z";
const previous = {
  generatedAt: observedAt,
  events: [
    { id: "stanford-noon", source: "Stanford Events", title: "Noon concert",
      date: "2026-11-04", time: "12:30 PM", venue: "Braun Music Center", cost: "free" },
    { id: "stanford-online", source: "Stanford Events", title: "Public online talk",
      date: "2026-11-05", time: "4:00 PM", virtual: true, registration: "required",
      attendanceNote: "Public attendance is via Zoom." },
    { id: "stanford-expired", source: "Stanford Events", date: "2026-11-03", time: "12:00 PM" },
    { id: "other-calendar", source: "Other calendar", date: "2026-11-05", time: "12:00 PM" },
  ],
};

test("Stanford fetch failures stay rejected outside strict mode without retrying access refusals", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    requests++;
    return new Response("Forbidden", { status: 403 });
  });
  await assert.rejects(source().fn(), /403/);
  assert.equal(requests, 1);
});

test("the registered Stanford adapter retains verified future occurrences while its timeout remains visible", () => {
  const adapter = source();
  const failure = [{ status: "rejected", reason: new Error("The operation was aborted due to timeout") }];
  const results = retainFailedOptionalSources([adapter], failure, previous, { today: "2026-11-04" });
  assert.deepEqual(results.flatMap(eventsForSourceResult), previous.events.slice(0, 2));
  assert.notEqual(results[0].retained.events[0], previous.events[0]);
  const [health] = buildSourceHealth([adapter], results);
  assert.equal(health.status, "error");
  assert.equal(health.count, 0);
  assert.equal(health.retainedCount, 2);
  assert.equal(health.retainedFrom, observedAt);
  assert.match(health.error, /timeout/);
  assert.equal(sourceProblems([health]).tolerated.length, 1);
  const repeated = retainFailedOptionalSources([adapter], failure, {
    generatedAt: "2026-11-05T13:00:00.000Z", events: results.flatMap(eventsForSourceResult), sourceHealth: [health],
  }, { today: "2026-11-05" });
  assert.deepEqual(repeated.flatMap(eventsForSourceResult), [previous.events[1]]);
  assert.equal(repeated[0].retained.from, observedAt);
});

test("a successful empty Stanford calendar replaces prior listings", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [] }));
  const adapter = source();
  const settled = await Promise.allSettled([adapter.fn()]);
  const results = retainFailedOptionalSources([adapter], settled, previous, { today: "2026-11-04" });
  assert.deepEqual(results.flatMap(eventsForSourceResult), []);
  assert.equal(buildSourceHealth([adapter], results)[0].status, "empty");
});

test("a malformed Stanford response cannot masquerade as a successful empty calendar", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "Temporarily unavailable" }));
  await assert.rejects(source().fn(), /no events array/);
});

test("Stanford retains the bike sale through its late walk-in window", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-19T09:00:00-08:00") });
  const sale = {
    id: 54499076662112, title: "Stanford Public Safety Bike Sale",
    localist_url: "https://events.stanford.edu/event/stanford-public-safety-bike-sale",
    location_name: "Stanford Public Safety bike lot", address: "343 Bonair Siding Rd, Stanford, CA 94305",
    description_text: "Walk-ins are welcome only during the last 30 minutes of the sale.",
    event_instances: [{ event_instance: { start: "2026-11-19T08:00:00-08:00", end: "2026-11-19T10:00:00-08:00" } }],
  };
  const appointment = { ...sale, id: 54499076662113, title: "Morning studio appointment", description_text: "Arrive at the start of your appointment." };
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [{ event: sale }, { event: appointment }] }));
  const events = await source().fn();
  assert.deepEqual(events.map(({ id, time, endTime }) => [id, time, endTime]), [
    ["stanford-54499076662112-2026-11-19", "8:00 AM", "10:00 AM"],
  ]);
  t.mock.timers.setTime(Date.parse("2026-11-19T10:00:00-08:00"));
  assert.deepEqual(await source().fn(), []);
});

test("Stanford reads attendance requirements from the full source before shortening descriptions", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-19T14:00:00-08:00") });
  const occurrence = {
    event_instances: [{ event_instance: { start: "2026-11-20T12:00:00-08:00" } }],
  };
  const publicTalk = "A public lecture on material history. Details follow.";
  const affiliateUrl = "https://events.stanford.edu/event/building-evidentiary-infrastructure-during-an-active-war-lessons-from-the-ukraine-war-archive";
  const events = [
    {
      ...occurrence, id: 11, title: "An online discussion", experience: "virtual",
      address: "450 Jane Stanford Way, Stanford, CA 94305",
      description_text: `${publicTalk}\n\n2. Sign up for the discussion to receive the meeting’s Zoom link.`,
    },
    {
      ...occurrence, id: 12, title: "An in-person lecture", experience: "inperson",
      location_name: "In person at Stanford", ticket_cost: "Free and open to the public. RSVP for location.",
      description_text: publicTalk,
    },
    {
      ...occurrence, id: 13, title: "A campus seminar", experience: "hybrid", localist_url: affiliateUrl,
      description_text: `${publicTalk}\n\nThis event is only open to Stanford students, staff, faculty & affiliates.`,
    },
    {
      ...occurrence, id: 14, title: "A public hybrid discussion", experience: "hybrid",
      location_name: "A campus lecture room",
      description_text: `${publicTalk}\n\n2. Sign up for the discussion to receive the meeting’s Zoom link.`,
    },
  ];
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: events.map(event => ({ event })) }));
  const [online, inPerson, hybrid] = await source().fn();
  assert.deepEqual([online.id, inPerson.id, hybrid.id], [11, 12, 14].map(id => `stanford-${id}-2026-11-20`));
  assert.deepEqual([online.virtual, online.venue, online.address, online.registration], [true, "Online (Zoom)", "", "required"]);
  assert.match(online.attendanceNote, /receive the Zoom link/);
  assert.deepEqual([inPerson.venue, inPerson.registration, inPerson.cost], [null, "required", "free"]);
  assert.match(inPerson.attendanceNote, /RSVP to receive the event location/);
  assert.equal(hybrid.registration, undefined);
  assert.equal(hybrid.venue, "A campus lecture room");
  assert.equal(isEventPublishable({
    title: "Building Evidentiary Infrastructure During an Active War: Lessons from the Ukraine War Archive",
    source: "Stanford Events", date: "2026-11-20", url: affiliateUrl, time: "12:00 PM",
  }), false, "the shortened retained listing must stay out of the public calendar");
});
