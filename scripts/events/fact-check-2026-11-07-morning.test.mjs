import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fetchInboundEvents, isPublicEvent, looksCancelled } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { parseTheaterEventPage } from "../lib/san-jose-theaters-events.mjs";
import { isEventExplicitlyInactive, isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveRetired, snapshotEvent } from "../../src/lib/south-bay/eventSlugLedger.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

const jubin = {
  title: "Jubin Nautiyal Live in Concert – Bay Area", date: "2026-11-13",
  time: "8:00 PM", endTime: "10:00 PM", venue: "San Jose Civic",
  source: "San Jose Theaters",
  url: "https://www.sanjose.org/theaters/events/jubin-nautiyal-live-concert-bay-area",
};

test("the organizer's misspelled postponement notice outranks its unchanged theater clock", () => {
  for (const notice of ["THIS EVENT HAS BEEN POSTPOINED.", "This event has been postponed."]) {
    const detail = parseTheaterEventPage(`<div class="listing-detail--primary">
      <div class="listing-detail--content--block"><p>${notice}</p></div>
      </div><div class="listing-detail--secondary"><h3>When</h3>
      <div class="listing-detail--secondary--section--focus">Fri, Nov 13, 2026</div>
      <div class="listing-detail--secondary--ticket-info">8:00 PM</div><h3>Where</h3></div>`);
    const description = detail.descriptionHtml.replace(/<[^>]*>/g, " ");
    const event = { ...jubin, description };
    assert.equal(detail.whenTimes[0], "8:00 PM");
    assert.equal(isEventExplicitlyInactive(event), true);
    assert.equal(isEventPublishable(event), false);
    assert.equal(looksCancelled(description, null), true);
    assert.equal(isPublicEvent(event.title, event.source, description, event.venue), false);
    assert.equal(snapshotEvent(event).time, undefined);
    const held = resolveRetired({ entries: [{ slug: "held-jubin", event }] }, [], [], "2026-11-07");
    assert.equal(held.orphans[0].event.time, undefined);
    assert.equal(held.orphans[0].event.endTime, undefined);
    assert.match(held.orphans[0].event.description, /postp(?:on|oin)ed/i);
  }
});

test("conditional, historical and confirmed replacement notices do not close a current occurrence", () => {
  for (const description of [
    "If this event is postponed, ticket holders will be notified.",
    "Learn why this event was postponed last year.",
    "This event has been postponed to November 13, 2026 at 8 PM.",
    "Tickets are now available for this concert.",
  ]) assert.equal(isEventPublishable({ ...jubin, description }), true, description);
  assert.equal(isEventExplicitlyInactive({ ...jubin, blurb: "This concert has been postponed." }), true);
});

const intake = [
  {
    title: "Cardinal Kids Day: Stanford Men's Basketball vs. Pacific", cityKey: "palo-alto",
    startsAt: "2026-12-06T13:00:00-08:00", location: "Maples Pavilion, Stanford, CA",
    sourceUrl: "https://tickets.gostanford.com/events/6aa42f3d18db9fde45dc7752/6aecd0d65c621b96be40ac4b",
    description: "Each paid adult ticket unlocks two free youth tickets.",
  },
  {
    title: "Hélène Grimaud Piano Recital", cityKey: "palo-alto",
    startsAt: "2026-12-06T14:30:00-08:00", location: "Bing Concert Hall, Stanford, CA",
    sourceUrl: "https://ticketing.purchase.live.stanford.edu/stanfordlive/website/ChooseSeats.aspx?EventInstanceId=33401&resize=true",
    description: "Pianist Hélène Grimaud performs Rachmaninoff, Beethoven and Schubert.",
  },
  {
    title: "Rose Sellery Artist Talk and Gallery Tour", cityKey: "santa-clara",
    startsAt: "2026-12-05T13:00:00-08:00", endsAt: "2026-12-05T14:00:00-08:00",
    location: "Triton Museum of Art, 1505 Warburton Avenue, Santa Clara, CA 95050",
    sourceUrl: "https://www.eventbrite.com/e/rose-sellery-artist-talk-tickets-2002592274401?aff=oddtdtcreator",
    description: "Free and open to the public with free parking; RSVP on Eventbrite.",
  },
];

test("actual newsletter ingestion preserves paid admission and the bounded youth offer without inventing a booking gate", async () => {
  const events = fetchInboundEvents({ events: intake, today: "2026-11-07" });
  assert.equal(events.length, 3);
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "paid");
  assert.match(events[0].costNote, /paid adult.*up to two.*eighth grade or younger/);
  assert.equal(events[0].attendanceNote, events[0].costNote, "the offer terms must also reach the visible event page");
  assert.equal(events[1].cost, "paid");
  assert.equal(events[1].costNote, undefined, "do not invent a price floor from the student tariff");
  assert.equal(events[2].cost, "free");
  assert.equal(requiresAdvanceRegistration(events[2]), false);
  assert.match(events[2].attendanceNote, /RSVP/);
  for (const event of events) assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("dated admission corrections stay on the exact instance and preserve later booking states", () => {
  const events = fetchInboundEvents({ events: intake, today: "2026-11-07" });
  for (const event of events) {
    for (const changed of [{ ...event, date: "2027-12-06" }, { ...event, venue: "Another venue" }]) {
      assert.deepEqual(applyVerifiedEventFacts(changed), changed);
    }
    for (const registration of ["required", "full", "closed", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
    }
  }
  for (const [index, segment] of [[0, "6aecd0d65c621b96be40ac4b"], [1, "33401"], [2, "2002592274401"]]) {
    const event = { ...events[index], url: events[index].url.replace(segment, segment + "0"), cost: null, costNote: null, attendanceNote: null };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("the published Jubin URL retains a postponement notice without its old start time", () => {
  const data = JSON.parse(readFileSync(new URL("../../src/data/south-bay/upcoming-events.json", import.meta.url)));
  assert.equal(data.events.some(event => event.url === jubin.url && event.date === jubin.date), false);
  const ledger = JSON.parse(readFileSync(new URL("../../src/data/south-bay/events-retired.json", import.meta.url)));
  const retained = ledger.entries.filter(row => row.event.url === jubin.url && row.event.date === jubin.date);
  assert.ok(retained.length);
  for (const row of retained) {
    assert.match(row.event.description, /postponed/);
    assert.equal(row.event.time, undefined);
    assert.equal(row.event.endTime, undefined);
  }
});
