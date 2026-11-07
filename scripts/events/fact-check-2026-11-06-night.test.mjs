import test from "node:test";
import assert from "node:assert/strict";
import { fetchInboundEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

// These are sparse intake records: the complete, dated organizer records
// supply the terms. No private receiving-message identifiers belong here.
const sources = [
  {
    id: "fuze-watch-party", title: "49ers vs. Raiders Watch Party", cityKey: "san-jose",
    startsAt: "2026-11-08T13:05:00-08:00", endsAt: "2026-11-08T16:30:00-08:00",
    location: "Fuze", description: "Game-day watch party with food, drinks, music, and prizes.",
    sourceUrl: "https://www.eventbrite.com/e/49ers-vs-raiders-the-ultimate-football-watch-party-at-fuze-tickets-2003954792730?aff=odeimcmailchimp",
  },
  {
    id: "tyler-fischer", title: "Tyler Fischer", cityKey: "san-jose",
    startsAt: "2026-11-08T18:00:00-08:00", endsAt: null,
    location: "San Jose Improv", description: "Stand-up and impressions. Ticketed show.",
    sourceUrl: "https://improv.com/sanjose/comic/tyler+fischer/",
  },
  {
    id: "kids-rock", title: 'Kids Rock "Glow-Vember"', cityKey: "santa-clara",
    startsAt: "2026-11-13T18:00:00-08:00", endsAt: "2026-11-13T20:30:00-08:00",
    location: "Youth and Teen Center, Santa Clara",
    description: "An evening for elementary school children. Pre-registration is required.",
    sourceUrl: "https://anc.apm.activecommunities.com/santaclara/activity/search/detail/30217?onlineSiteId=0&from_original_cui=true",
  },
];

test("reviewed newsletter admission survives ingestion, cached blurbs and repeated normalization", async () => {
  const events = fetchInboundEvents({ events: sources, today: "2026-11-06" });
  const before = structuredClone(events);
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events.length, 3);
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    for (const field of ["id", "title", "date", "time", "endTime", "venue", "url", "description"]) {
      assert.equal(e[field], before[i][field], field);
    }
    assert.deepEqual(applyVerifiedEventFacts(e), e);
  }
  for (const e of events.slice(0, 2)) {
    assert.equal(e.audienceAge, "adult");
    assert.equal(classifyAudienceAge(e), "adult");
    assert.equal(e.kidFriendly, false);
    assert.match(e.attendanceNote, /Ages 21\+/);
    assert.equal(e.registration, undefined, "door tickets do not establish advance booking");
  }
  assert.equal(events[0].cost, "low");
  assert.equal(events[0].costNote, "$5 in advance; $10 at the door.");
  assert.equal(events[1].cost, "paid");
  assert.match(events[1].attendanceNote, /two-item minimum/);
  assert.equal(events[2].registration, "required");
  assert.equal(events[2].cost, null, "the city bulletin does not establish a price");
  assert.equal(classifyAudienceAge(events[2]), "kids");
});

test("the dated city requirement cannot reopen a later full, closed or appointment-only record", () => {
  const e = fetchInboundEvents({ events: [sources[2]], today: "2026-11-06" })[0];
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...e, registration }).registration, registration);
  }
});

test("reviewed entry terms never transfer to another occurrence or neighboring event ID", () => {
  const originals = fetchInboundEvents({ events: sources, today: "2026-11-06" });
  for (const e of originals) {
    for (const other of [
      { ...e, date: e.date.replace("2026-", "2027-") },
      { ...e, url: e.url.replace(/(2003954792730|30217)(?=[/?#]|$)/, id => id + "0").replace("tyler+fischer", "another+performer") },
    ]) {
      assert.deepEqual(applyVerifiedEventFacts(other), other);
    }
  }
  const alias = { ...originals[1], url: "https://www.ticketweb.com/event/tyler-fischer-san-jose-improv-tickets/14934463" };
  assert.equal(applyVerifiedEventFacts(alias).audienceAge, "adult");
});
