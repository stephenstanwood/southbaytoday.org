import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchStanfordEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-11-afternoon.json", import.meta.url)));

test("Stanford ingestion retains Zoom, location-RSVP and application conditions before shortening the body", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.checkedAt) });
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    calls.push(String(url));
    return Response.json({ events: fixture.stanford.map(event => ({ event })) });
  });
  const events = await fetchStanfordEvents();
  assert.equal(events.length, 3);
  assert.deepEqual(calls, ["https://events.stanford.edu/api/2/events?days=60&pp=200"]);
  for (const event of events) assert.equal(event.registration, "required");
  const find = id => events.find(event => event.id.startsWith(`stanford-${id}-`));
  assert.equal(find(53859860302679).attendanceNote, "Register for Zoom link.");
  assert.equal(find(53859860302679).virtual, true);
  assert.equal(find(53859860302679).cost, "free");
  assert.equal(find(54162171268165).attendanceNote, "RSVP to receive the event location.");
  assert.equal(find(54162171268165).venue, "RSVP for location");
  assert.match(find(53985402086600).attendanceNote, /access code.*Other attendees must apply and be accepted/);
});

test("optional signup, a ticket URL and an optional hybrid stream cannot create a registration gate", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.checkedAt) });
  const source = fixture.stanford.find(event => event.id === 53859860302679);
  const cases = [
    { ticket_cost: "Optional: register for a Zoom link." },
    { ticket_cost: null },
    { ticket_cost: "Free and open to the public. Register for Zoom link.", experience: "hybrid" },
    { ticket_cost: "Registration is not required." },
  ];
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: cases.map((change, i) => ({
    event: { ...source, id: i + 1, ...change },
  })) }));
  for (const event of await fetchStanfordEvents()) {
    assert.equal(event.registration, undefined);
    assert.equal(event.attendanceNote, undefined);
  }
});

test("fresh Stanford admission terms cannot reopen registration that the source says is closed", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.checkedAt) });
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: fixture.stanford.map(event => ({
    event: { ...event, description_text: `Registration is closed. ${event.description_text}` },
  })) }));
  const events = await fetchStanfordEvents();
  assert.equal(events.length, 3);
  for (const event of events) assert.equal(event.registration, "closed");
});

test("verified venue, admission and acronym corrections survive retained cards and cached blurb publication", async () => {
  const events = structuredClone(fixture.events);
  await resolveEventBlurbs(events, { enabled: false });
  const jazz = events.find(event => event.source === "San Jose Jazz");
  assert.equal(jazz.venue, "Hammer Theatre Center");
  assert.equal(jazz.address, "101 Paseo de San Antonio, San Jose, CA 95113");
  assert.equal(jazz.endTime, null, "the opening set has no confirmed finish");
  assert.equal(jazz.cost, null, "conflicting free-admission copy does not establish a price");
  for (const event of events) {
    assert.deepEqual(applyVerifiedEventFacts(event), event, "corrections are idempotent");
    if (/Memoirs|Changing Gender|Research Symposium/i.test(event.title)) assert.equal(event.registration, "required");
  }
  const ballot = events.find(event => event.title.includes("Free Ballot"));
  assert.match(ballot.title, /: SIR,/);
  assert.equal(ballot.registration, undefined, "a Zoom registration URL alone is not explicit mandatory admission text");
});

test("retained corrections preserve later booking notices and do not affect another date, URL or honorific", () => {
  for (const source of fixture.events) {
    for (const registration of ["full", "closed", "appointment-only"]) {
      const event = { ...source, registration, attendanceNote: "Later organizer booking notice." };
      const actual = applyVerifiedEventFacts(event);
      assert.equal(actual.registration, registration);
      assert.match(actual.attendanceNote, /^Later organizer booking notice\./);
    }
    for (const change of [{ date: "2028-11-12" }, { url: "https://example.org/another-event" }]) {
      const event = { ...source, ...change };
      assert.deepEqual(applyVerifiedEventFacts(event), event);
    }
  }
  const unrelated = { title: "An Evening with Sir David", date: "2026-11-12", url: "https://example.org/sir-david" };
  assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
});
