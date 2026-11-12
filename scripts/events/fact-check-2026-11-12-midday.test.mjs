import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { backfillVerifiedEventTimes, cleanTitle, fetchInboundEvents, fetchStanfordEvents, isEventTimeBackfillCandidate, polishDescription } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";
import { retireSlugs, resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-12-midday.json", import.meta.url)));

test("Stanford keeps affirmative body RSVP instructions before shortening, without inventing optional gates", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.checkedAt) });
  let source = fixture.stanford;
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: source.map(event => ({ event })) });
  });
  const events = await fetchStanfordEvents();
  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.registration, "required");
    assert.match(event.attendanceNote, /RSVP/);
  }
  // Different source identities bypass the dated repairs and exercise intake.
  source = ["RSVP is optional.", "No RSVP is required.", "See the registration link for more information."].map((description_text, index) => ({
    ...fixture.stanford[0], id: index + 1, description_text,
    localist_url: `https://events.stanford.edu/event/other-${index}`,
  }));
  for (const event of await fetchStanfordEvents()) {
    assert.equal(event.registration, undefined);
    assert.equal(event.attendanceNote, undefined);
  }
  source = fixture.stanford.map(event => ({ ...event, description_text: `Registration is closed. ${event.description_text}` }));
  for (const event of await fetchStanfordEvents()) assert.equal(event.registration, "closed");
});

test("cached publication repairs reception order, RSVP gates and source initials without changing occurrence facts", async () => {
  const events = structuredClone(fixture.events);
  await resolveEventBlurbs(events, { enabled: false });
  for (let i = 0; i < events.length; i++) {
    const event = events[i], before = fixture.events[i];
    assert.deepEqual(applyVerifiedEventFacts(event), event, "repeat publication is stable");
    for (const key of ["id", "date", "url", "venue", "address", "cost", "audienceAge"]) {
      assert.deepEqual(event[key], before[key], `preserve ${key}`);
    }
    if (event.id.includes("54003649862388")) {
      assert.doesNotMatch(event.blurb, /then head to the reception/);
      assert.match(event.blurb, /reception.*before the lecture/);
    }
    if (event.id.includes("54251541114674")) assert.equal(event.title, "MRC Public Lecture: Tadashi Tokieda");
    if (/54251541114674|54045658778096/.test(event.id)) {
      assert.equal(event.registration, "required");
      assert.match(event.attendanceNote, /RSVP to attend/);
      const closed = applyVerifiedEventFacts({ ...event, registration: "closed", attendanceNote: "Registration is now closed." });
      assert.equal(closed.registration, "closed");
      assert.ok(closed.attendanceNote.startsWith("Registration is now closed."));
    }
    if (event.id.includes("54136301350930")) assert.match(event.description, /CDCES/);
    if (!event.id.startsWith("inbound-")) {
      assert.equal(event.time, before.time);
      assert.equal(event.endTime, before.endTime);
    }
  }
  assert.equal(cleanTitle("MRC Public Lecture: Tadashi Tokieda"), "MRC Public Lecture: Tadashi Tokieda");
  assert.equal(polishDescription("Erin Hodgson, MS, RD, BC-ADM, CDCES."), "Erin Hodgson, MS, RD, BC-ADM, CDCES.");
  assert.equal(cleanTitle("Mrc is a source-spelled name"), "Mrc is a source-spelled name");
});

test("December robotics stays untimed through newsletter intake, stale backfill and briefing selection", async () => {
  const before = fixture.events.find(event => event.id.startsWith("inbound-"));
  const [event] = fetchInboundEvents({ today: "2026-11-12", events: [{
    title: before.title, startsAt: "2026-12-13T00:00:00-08:00", sourceUrl: before.url,
    location: before.address, cityKey: before.city, description: before.description,
  }] });
  assert.ok(event);
  assert.equal(event.time, null);
  // The generator applies dated facts to every adapter before time backfill.
  Object.assign(event, applyVerifiedEventFacts(event));
  assert.equal(isEventTimeBackfillCandidate(event), false);
  await backfillVerifiedEventTimes([event], { backfill: async rows => { rows[0].time = "10:00 AM"; } });
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.time, null);
  assert.equal(event.endTime, null);
  assert.equal(event.attendanceStatus, "needs-confirmation");
  assert.equal(isBriefingEventAvailable(event), false);
  assert.match(event.attendanceNote, /time is unconfirmed/);
  const ledger = retireSlugs({ entries: [] }, [before], [event], "2026-11-12", fixture.checkedAt);
  const retired = resolveRetired(ledger, [event], [], "2026-11-12");
  assert.equal(retired.orphans.length, 1, "the former timed URL must keep resolving");
  assert.equal(retired.orphans[0].event.time, null, "a retired page cannot keep the unsupported clock");
  assert.match(retired.orphans[0].event.attendanceNote, /time is unconfirmed/);
  const later = { ...before, description: "The museum announces the December demonstration from 11 AM to noon.", time: "11:00 AM" };
  assert.deepEqual(applyVerifiedEventFacts(later), later, "a newly explicit source time must flow through");
});

test("dated source repairs cannot affect another occurrence or a later accurate blurb", () => {
  for (const event of fixture.events) {
    const otherDay = { ...event, date: "2028-11-12" };
    assert.deepEqual(applyVerifiedEventFacts(otherDay), otherDay);
    if (!event.id.startsWith("inbound-")) {
      const otherSource = { ...event, url: "https://example.org/unrelated" };
      assert.deepEqual(applyVerifiedEventFacts(otherSource), otherSource);
    }
  }
  const lecture = { ...fixture.events.find(event => event.id.includes("54003649862388")), blurb: "Hear M. D. Usher speak at Stanford." };
  assert.deepEqual(applyVerifiedEventFacts(lecture), lecture);
});
