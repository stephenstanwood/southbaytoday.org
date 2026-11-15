import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { backfillVerifiedEventTimes, cleanTitle, fetchInboundEvents, fetchStanfordEvents, isEventTimeBackfillCandidate } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { isEventEditoriallySuppressed } from "../../src/lib/south-bay/eventAvailability.mjs";
import { retireSlugs, resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-15-evening.json", import.meta.url)));
const talk = fixture.events.find(event => event.id.startsWith("stanford-544355"));
const openAccess = fixture.events.find(event => event.id === "598139b9b514");

test("Stanford's current-affiliate room restriction retains public Zoom access and registration", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.checkedAt) });
  let sources = structuredClone(fixture.stanford);
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: sources.map(event => ({ event })) });
  });
  const rows = await fetchStanfordEvents();
  assert.equal(rows.length, 1, "the campus-community workshop is not a public event");
  assert.equal(rows[0].virtual, true);
  assert.equal(rows[0].address, "");
  assert.match(rows[0].venue, /Online/);
  assert.equal(rows[0].registration, "required");
  assert.match(rows[0].attendanceNote, /Register for Zoom link/);
  assert.match(rows[0].attendanceNote, /current Stanford/);

  sources = [{ ...fixture.stanford[0], filters: { event_audience: [{ name: "General Public" }] } }];
  const publicRows = await fetchStanfordEvents();
  assert.equal(publicRows.length, 1, "revised public eligibility flows through");
  assert(isEventPublishable(publicRows[0]), "a stale suppression cannot mask fresh public eligibility");
  sources = [{ ...fixture.stanford[1], custom_fields: {}, stream_info: null }];
  assert.equal((await fetchStanfordEvents())[0].virtual, undefined, "unrestricted hybrid attendance stays physical");
  sources = [{ ...fixture.stanford[1], stream_info: null }];
  assert.equal((await fetchStanfordEvents()).length, 0, "restricted rooms need explicit public online access");
});

test("dated Stanford and Montalvo corrections survive cached publication without changing occurrence clocks", async () => {
  const events = structuredClone([talk, openAccess]);
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].virtual, true);
  assert.equal(events[0].address, "");
  assert.match(events[0].venue, /Online/);
  assert.equal(events[0].cost, "free");
  assert.equal(events[0].registration, "required");
  assert.match(events[0].blurb, /online/);
  assert.equal(events[1].attendanceStatus, "needs-confirmation");
  assert.equal(events[1].cost, null, "free membership admission does not establish a public ticket price");
  assert.match(events[1].costNote, /Free for Montalvo members/);
  assert.match(events[1].attendanceNote, /408-961-5858/);
  assert.match(events[1].attendanceNote, /Free for Montalvo members/);
  assert.match(events[1].description, /monograph|book/);
  assert.doesNotMatch(events[1].blurb, /exhibition/i);
  for (let i = 0; i < events.length; i++) {
    for (const key of ["id", "title", "date", "time", "endTime", "url"]) assert.equal(events[i][key], [talk, openAccess][i][key]);
    assert.deepEqual(applyVerifiedEventFacts(events[i]), events[i]);
  }
  const corrected = structuredClone(events);
  await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events, corrected);
});

test("new SMU ticket alias cannot restore a placeholder kickoff through newsletter intake or stale backfill", async () => {
  const incoming = fixture.incoming.find(event => /SMU/.test(event.title));
  const [event] = fetchInboundEvents({ events: [incoming], today: "2026-11-15" });
  Object.assign(event, applyVerifiedEventFacts(event));
  assert.equal(isEventTimeBackfillCandidate(event), false);
  await backfillVerifiedEventTimes([event], { backfill: async rows => { rows[0].time = "7:00 PM"; } });
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.time, null);
  assert.equal(event.endTime, null);
  assert.equal(isEventPublishable(event), false);
  const promotion = { ...event, time: "7:00 PM", url: "https://tickets.gostanford.com/events/69c4649c39baf6e77d7c9b7f/000000000000000000000000" };
  assert.equal(applyVerifiedEventFacts(promotion).time, null, "rotating promotional aliases share the dated event hold");
  const previous = fixture.events.find(row => /SMU/.test(row.title));
  const ledger = retireSlugs({ entries: [] }, [previous], [], "2026-11-15", fixture.checkedAt);
  const retired = resolveRetired(ledger, [], [], "2026-11-15");
  assert.equal(retired.orphans[0].event.time ?? null, null, "the retired leaf cannot repeat 7 PM");
});

test("the Berkeley Big Game and campus-only workshop cannot reenter the public calendar", () => {
  const away = fixture.incoming.find(event => /Big Game/.test(event.title));
  const [event] = fetchInboundEvents({ events: [away], today: "2026-11-15" });
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(isEventPublishable(corrected), false);
  assert.equal(corrected.city, null, "the retired leaf cannot keep the publisher's Palo Alto location");
  assert.equal(corrected.venue, "California Memorial Stadium");
  const workshop = fixture.events.find(row => /SimplyAnalytics/.test(row.title));
  assert(isEventEditoriallySuppressed(workshop));
  assert.equal(isEventPublishable(workshop), false);
  assert.equal(isEventEditoriallySuppressed({ ...workshop, date: "2026-11-17" }), false);
});

test("source corrections respect new dates, revised prose, current attendance restrictions and source identity", () => {
  for (const event of [talk, openAccess]) {
    for (const change of [{ date: "2027-11-15" }, { url: "https://example.org/another-event" }, { description: "The organizer announces revised admission." }]) {
      const revised = { ...event, ...change };
      assert.deepEqual(applyVerifiedEventFacts(revised), revised);
    }
  }
  const closed = applyVerifiedEventFacts({ ...openAccess, registration: "closed", attendanceNote: "Current organizer notice." });
  assert.equal(closed.registration, "closed");
  assert(closed.attendanceNote.startsWith("Current organizer notice."));
  assert.equal(cleanTitle("Tnt Traysikel: Never Gonna Give You Up!"), "TNT Traysikel: Never Gonna Give You Up!");
});
