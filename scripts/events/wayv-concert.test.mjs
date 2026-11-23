import assert from "node:assert/strict";
import test from "node:test";
import { restoreWayvConcert } from "../lib/san-jose-theaters-events.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";

const today = "2026-11-20";
const formerListing = {
  title: "2026-27 WayV Concert Tour [Born This Way] In USA",
  date: "2027-02-06",
  time: "8:00 PM",
  venue: "San Jose Civic",
  url: "https://www.sanjose.org/theaters/events/2026-27-wayv-concert-tour-born-way-usa",
  source: "San Jose Theaters",
};

test("restores the source-confirmed WayV time when the theater listing vanishes or is stale", () => {
  const other = { ...formerListing, title: "Another Concert", url: "https://www.sanjose.org/theaters/events/another-concert" };
  for (const events of [[other], [other, formerListing]]) {
    const [unrelated, concert] = restoreWayvConcert(events, today);
    assert.equal(unrelated, other);
    assert.equal(concert.id, "sanjosetheaters-c176ca6a57bad2e7");
    assert.equal(concert.time, "7:30 PM");
    assert.equal(concert.url, "https://weverse.io/wayv/notice/41160");
    assert.equal(concert.occurrenceEvidence.sourceUrl, concert.url);
    assert.equal(concert.occurrenceEvidence.date, concert.date);
    assert.equal(concert.occurrenceEvidence.time, concert.time);
    assert.ok(isEventPublishable(concert));
    assert.equal(restoreWayvConcert(events, today).length, 2);
  }
});

test("an updated or canceled theater listing takes precedence and the fallback expires", () => {
  const updated = { ...formerListing, time: "7:30 PM" };
  const canceled = { ...formerListing, status: "cancelled" };
  assert.deepEqual(restoreWayvConcert([formerListing, updated], today), [updated]);
  assert.deepEqual(restoreWayvConcert([formerListing, canceled], today), [canceled]);
  assert.ok(!isEventPublishable(canceled));
  assert.deepEqual(restoreWayvConcert([], "2027-02-07"), []);
});

test("the republished 8 PM WayV listing keeps the artist time and discloses the conflict", () => {
  const republished = { ...formerListing, url: `${formerListing.url}-0` };
  const [concert] = restoreWayvConcert([republished], "2026-11-21");
  assert.equal(concert.time, "7:30 PM");
  assert.equal(concert.attendanceStatus, "needs-confirmation");
  assert.match(concert.attendanceNote, /AXS list a 7:30 PM start\. Visit San Jose lists 8 PM/);
  const updated = { ...republished, time: "7:30 PM" };
  assert.deepEqual(restoreWayvConcert([formerListing, updated], "2026-11-21"), [updated]);
});

test("preserves the prior WayV time conflict when the venue refresh fails", () => {
  const previousEvents = restoreWayvConcert([formerListing], today);
  const [restored] = restoreWayvConcert([], today, { previousEvents });
  assert.equal(restored.time, "7:30 PM");
  assert.equal(restored.attendanceStatus, "needs-confirmation");
  assert.equal(restored.attendanceNote, previousEvents[0].attendanceNote);

  const updated = { ...formerListing, time: "7:30 PM" };
  assert.deepEqual(restoreWayvConcert([updated], today, { previousEvents }), [updated]);
  assert.equal(restoreWayvConcert([], today)[0].attendanceStatus, undefined);
});
