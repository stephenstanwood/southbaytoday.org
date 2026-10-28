import test from "node:test";
import assert from "node:assert/strict";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

test("Solar Sunday's rescheduled November 8 occurrence retains free public walk-in access", async () => {
  const raw = {
    id: "meetup-6b6657a0f25625c8", date: "2026-11-08",
    url: "https://www.meetup.com/sj-astronomy/events/312677419/",
    title: "Solar Sunday – See Our Sun Up Close", venue: "Houge Park",
    time: "1:30 PM", endTime: "3:30 PM", cost: null, registration: "required",
    registrationClosesBy: "2026-11-07T23:59:00Z",
    description: "Meetup event by SJ Astronomy.",
    blurb: "Look through telescopes at Houge Park to see the sun up close with SJ Astronomy.",
  };
  const before = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.equal(actual.cost, "free");
  assert.equal(requiresAdvanceRegistration(actual), false);
  assert.equal(actual.registrationClosesBy, null);
  assert.match(actual.attendanceNote, /Walk-ins welcome.*RSVP is optional/);
  for (const key of ["id", "date", "url", "title", "venue", "time", "endTime", "blurb"]) {
    assert.equal(actual[key], raw[key]);
  }
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  assert.deepEqual(raw, before);
  for (const other of [{ ...raw, date: "2026-11-15" }, { ...raw, date: "2027-11-08" }, { ...raw, url: "https://www.meetup.com/sj-astronomy/events/another/" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Bluey's opening performance uses the producer's actual run and ticket policy through blurb resolution", async () => {
  const aliases = [
    "https://www.ticketmaster.com/blueys-big-play-tickets/artist/2726558?venueId=229426&list_view=1",
    "https://broadwaysanjose.com/shows/blueys-big-play/",
  ];
  for (const url of aliases) {
    const raw = {
      id: "inbound-0c2fdee4143ab91c", title: "Bluey's Big Play", date: "2026-10-30", url,
      time: "6:00 PM", endTime: null, venue: "Center for the Performing Arts", cost: null,
      description: "Bluey, running Oct. 30 through Nov. 18. Showtimes are not given in the newsletter. Ticketed.",
      blurb: "See a puppet stage adaptation of the children's series Bluey at the Center for the Performing Arts.",
    };
    const before = structuredClone(raw);
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    const [actual] = events;
    assert.match(actual.description, /October 30 through November 1/);
    assert.doesNotMatch(actual.description, /Nov(?:ember)?\.? 18|Showtimes are not given/);
    assert.match(actual.description, /Every attendee needs a ticket, including children/);
    assert.equal(actual.cost, "paid");
    assert.equal(actual.url, aliases[1]);
    for (const key of ["id", "title", "date", "time", "endTime", "venue", "blurb"]) {
      assert.equal(actual[key], raw[key]);
    }
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    assert.deepEqual(raw, before);
    for (const other of [{ ...raw, date: "2027-10-30" }, { ...raw, url: "https://example.com/another-show" }]) {
      assert.equal(applyVerifiedEventFacts(other), other);
    }
  }
});
