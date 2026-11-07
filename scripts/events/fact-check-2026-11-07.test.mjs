import test from "node:test";
import assert from "node:assert/strict";
import { fetchInboundEvents, isEventTimeBackfillCandidate } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { resolveRetired, snapshotEvent } from "../../src/lib/south-bay/eventSlugLedger.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

// Sparse intake shapes; verified terms come from the original November city,
// Art Center and church newsletters. No private receiving identifiers or
// subscriber-specific source links belong in a public regression fixture.
const newsletter = [
  {
    id: "kids-night", title: "Kids Night Out", cityKey: "sunnyvale",
    startsAt: "2026-12-04T18:00:00-08:00", endsAt: "2026-12-04T21:00:00-08:00",
    location: "Recreation Center, Sunnyvale",
    sourceUrl: "https://anc.apm.activecommunities.com/sunnyvaleactivities/activity/search/detail/1704?onlineSiteId=0",
    description: "Supervised evening of games, crafts, group activities and pizza for children ages 5 to 11. Registration required; $30 resident, $38 nonresident.",
  },
  {
    id: "tea", title: "PCLG Christmas Tea", cityKey: "los-gatos",
    startsAt: "2026-12-03T13:30:00-08:00", endsAt: null,
    location: "Presbyterian Church of Los Gatos, 16575 Shannon Rd, Los Gatos",
    sourceUrl: null, description: "Annual Christmas Tea. Tickets are $25, sold after Sunday worship (cash or check).",
  },
  {
    id: "meditation", title: "Mindfulness Meditation with Phuong Pham", cityKey: "palo-alto",
    startsAt: "2026-12-05T13:00:00-08:00", endsAt: "2026-12-05T14:00:00-08:00",
    location: "Palo Alto Art Center, 1313 Newell Road, Palo Alto, CA 94303",
    sourceUrl: null, description: "Free session in the Art Center galleries. No registration is required.",
  },
];

test("verified newsletter fees and supervision survive actual ingestion and cached copy", async () => {
  const events = fetchInboundEvents({ events: newsletter, today: "2026-11-07" });
  const originals = structuredClone(events);
  await resolveEventBlurbs(events, { enabled: false });
  for (const [i, event] of events.entries()) {
    for (const field of ["id", "title", "date", "time", "endTime", "url", "venue", "city"]) {
      assert.equal(event[field], originals[i][field], field);
    }
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  assert.equal(events[0].cost, "paid");
  assert.match(events[0].costNote, /\$30 resident; \$38 nonresident/);
  assert.doesNotMatch(events[0].description, /Registration required/i);
  assert.equal(requiresAdvanceRegistration(events[0]), false, "the newsletter CTA is not a mandatory advance gate");
  assert.equal(events[1].cost, "paid");
  assert.match(events[1].costNote, /\$25; cash or check/);
  assert.equal(requiresAdvanceRegistration(events[1]), false, "ticket sale instructions do not establish an advance-only policy");
  assert.equal(events[2].cost, "free");
  assert.equal(events[2].registration, "none");
  assert.match(events[2].attendanceNote, /Children under 10 must be accompanied by an adult/);
});

test("newsletter corrections stay on their verified date, publisher, venue and source ID", () => {
  const events = fetchInboundEvents({ events: newsletter, today: "2026-11-07" });
  for (const e of events) {
    for (const other of [{ ...e, date: e.date.replace("2026-", "2027-") }, { ...e, source: "Another source" }]) {
      assert.deepEqual(applyVerifiedEventFacts(other), other);
    }
  }
  const neighbor = { ...events[0], url: events[0].url.replace("/1704?", "/17040?") };
  assert.deepEqual(applyVerifiedEventFacts(neighbor), neighbor);
  const otherVenue = { ...events[1], venue: "Another church" };
  assert.deepEqual(applyVerifiedEventFacts(otherVenue), otherVenue);
  for (const registration of ["required", "full", "closed", "appointment-only"]) {
    const newer = { ...events[2], registration };
    assert.deepEqual(applyVerifiedEventFacts(newer), newer, "the old no-registration notice cannot replace a newer booking state");
  }
});

const football = {
  title: "Stanford Football vs. SMU (Fan Appreciation Game)", date: "2026-11-28",
  time: "7:00 PM", endTime: null, venue: "Stanford Stadium", city: "palo-alto", category: "sports",
  url: "https://tickets.gostanford.com/events/69c4649c39baf6e77d7c9b7f/6ae10caa2652b89aac76ea31?elqCampaignId=1024",
  source: "City Newsletter", description: "Fan Appreciation Game.",
};

test("an official TBA kickoff cannot be supplied by the ticket shop schema or a cached clock", async () => {
  const fixed = applyVerifiedEventFacts(football);
  assert.equal(fixed.time, null);
  assert.match(fixed.description, /Kickoff time is TBA/);
  assert.equal(isEventPublishable(fixed), false);
  assert.equal(isEventTimeBackfillCandidate(fixed), false);
  assert.equal(snapshotEvent(fixed).time, undefined, "the retained published URL cannot keep 7 PM");
  const held = resolveRetired({ entries: [{ slug: "2026-11-28-stanford-football-vs-smu", event: football }] }, [], [], "2026-11-07");
  assert.equal(held.orphans[0].event.time, undefined);
  assert.match(held.orphans[0].event.description, /Kickoff time is TBA/);
  const events = [{ ...football }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(isEventPublishable(events[0]), false);
  assert.equal(events[0].time, null);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const other of [{ ...football, date: "2027-11-28" }, { ...football, url: football.url.replace("6ae10caa2652b89aac76ea31", "other-game") }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("conflicting Rush clocks retain a visible confirmation notice and cannot be backfilled", async () => {
  const source = {
    title: "Rush", date: "2026-12-06", time: "7:00 PM", endTime: null,
    url: "https://www.sapcenter.com/events/detail/rush-2", category: "community", cost: "paid",
    venue: "SAP Center", source: "SAP Center", blurb: "See Rush perform live on stage at SAP Center.",
  };
  for (const url of [source.url, "https://www.ticketmaster.com/rush-fifty-something-san-jose-california-12-06-2026/event/1C006355EC78A84D"]) {
    const fixed = applyVerifiedEventFacts({ ...source, url });
    assert.equal(fixed.time, null);
    assert.equal(fixed.category, "music");
    assert.equal(fixed.cost, "paid");
    assert.match(fixed.attendanceNote, /SAP Center lists 7 PM; Ticketmaster lists 7:30 PM/);
    assert.equal(isEventTimeBackfillCandidate(fixed), false);
    assert.equal(isEventPublishable(fixed), true, "the known date and concert remain useful with a confirmation notice");
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  }
  const events = [{ ...source }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].time, null);
  assert.equal(events[0].attendanceStatus, "needs-confirmation");
  const held = resolveRetired({ entries: [{ slug: "2026-12-06-rush", event: source }] }, events, [], "2026-11-07");
  assert.equal(held.orphans[0].event.time, null);
  assert.match(held.orphans[0].event.attendanceNote, /SAP Center lists 7 PM; Ticketmaster lists 7:30 PM/);
  assert.equal(isEventTimeBackfillCandidate({ url: "https://example.org/event/another" }), true);
  assert.deepEqual(applyVerifiedEventFacts({ ...source, date: "2026-12-05" }), { ...source, date: "2026-12-05" });
});

test("the exact SJSU and organizer ticket listings establish a free three-hour workshop", async () => {
  const source = {
    date: "2026-11-17", title: "De-risking for Startups Through Partnerships | Hosted by Emumba x Silicon Valley SBDC x AWS",
    time: "5:00 PM", endTime: null, cost: null, venue: "Plug & Play Tech Center", source: "SJSU Events",
    url: "https://events.sjsu.edu/event/de-risking-for-startups-through-partnerships-hosted-by-emumba-x-silicon-valley-sbdc-x-aws",
  };
  const events = [{ ...source }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "free");
  assert.equal(events[0].endTime, "8:00 PM");
  for (const field of ["date", "title", "time", "venue", "url", "source"]) assert.equal(events[0][field], source[field], field);
  assert.deepEqual(applyVerifiedEventFacts({ ...source, date: "2026-11-18" }), { ...source, date: "2026-11-18" });
});
