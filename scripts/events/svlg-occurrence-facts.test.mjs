import test from "node:test";
import assert from "node:assert/strict";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";

const otto = {
  title: "Coffee & Conversation: Otto Lee", date: "2026-11-18",
  url: "https://www.eventbrite.com/e/coffee-conversation-otto-lee-tickets-2002235621643?aff=oddtdtcreator&keep_tld=true",
  venue: "Google Conference Room", address: "2480 N. First St., San Jose, CA 95131",
  time: "11:00 AM", endTime: "12:00 PM", cost: "unknown", category: "community",
};
const larry = {
  title: "Coffee & Conversation: Larry Klein", date: "2026-12-10",
  url: "https://www.eventbrite.com/e/coffee-conversation-larry-klein-tickets-1998017392807",
  venue: null, address: "2480 N First St San Jose, CA",
  time: "10:00 AM", endTime: "11:00 AM", cost: "unknown", category: "community",
};

test("SVLG's dated ticket pages protect the venue and prevent publication of a postponed date", () => {
  const fixedOtto = applyVerifiedEventFacts(otto);
  assert.equal(fixedOtto.venue, "SVLG Conference Room");
  assert.deepEqual(fixedOtto, { ...otto, venue: "SVLG Conference Room" });
  const fixedLarry = applyVerifiedEventFacts(larry);
  assert.equal(fixedLarry.registration, "closed");
  assert.equal(fixedLarry.eventStatus, "https://schema.org/EventPostponed");
  assert.match(fixedLarry.description, /postponed.*new date and time/i);
  assert.equal(isEventPublishable(fixedLarry), false);
  assert.equal(isBriefingEventAvailable(fixedLarry), false);
  assert.equal(isEventPublishable(applyVerifiedEventFacts({ ...larry, url: larry.url.replace("/e/", "/e/postponed-") })), false);
  for (const [input, corrected] of [[otto, fixedOtto], [larry, fixedLarry]]) {
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    assert.deepEqual(applyVerifiedEventFacts({ ...input, url: input.url.split("?")[0] + "?aff=another-source" }), { ...corrected, url: input.url.split("?")[0] + "?aff=another-source" });
    for (const field of ["date", "time", "endTime", "cost", "category", "address", "url"]) assert.equal(corrected[field], input[field], field);
  }
  assert.equal(otto.venue, "Google Conference Room", "source objects are not mutated");
  assert.equal(Object.hasOwn(larry, "registration"), false);
});

test("the SVLG correction does not apply to another occurrence or another organizer", () => {
  for (const input of [otto, larry]) {
    for (const other of [{ ...input, date: "2027-12-10" }, { ...input, url: "https://example.org/another-talk" }]) {
      assert.deepEqual(applyVerifiedEventFacts(other), other);
    }
  }
});

test("the Coffee & Conversation ticket pages supply the room and free admission for both dates", () => {
  const dates = [
    ["2027-01-07", "coffee-conversation-russell-hancock-tickets-2003679243555"],
    ["2027-02-04", "new-date-coffee-conversation-otto-lee-tickets-2002235621643"],
  ];
  for (const [date, path] of dates) {
    const input = {
      date, source: "SVLG", venue: "Google Conference Room", cost: "unknown",
      url: `https://www.eventbrite.com/e/${path}?aff=calendar`,
    };
    const corrected = applyVerifiedEventFacts(input);
    assert.equal(corrected.venue, "SVLG Conference Room");
    assert.equal(corrected.cost, "free");
    assert.equal(corrected.url, input.url);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    const otherDate = { ...input, date: "2027-02-05" };
    assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
  }
});

test("the members-only SVLG summit is excluded from public events", () => {
  const summit = {
    date: "2027-01-22", title: "Tech & Innovation Summit", source: "SVLG",
    url: "https://www.eventbrite.com/e/tech-innovation-summit-tickets-2002660719121?aff=calendar",
    venue: "Nutanix HQ",
  };
  assert.equal(isEventPublishable(summit), false);
  assert.equal(isEventPublishable({ ...summit, date: "2027-01-23" }), true);
  assert.equal(isEventPublishable({ ...summit, url: "https://example.org/community-summit" }), true);
});
