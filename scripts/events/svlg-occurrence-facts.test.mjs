import test from "node:test";
import assert from "node:assert/strict";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
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

test("SVLG's dated ticket pages protect the venue and closed sales through repeated passes", () => {
  const fixedOtto = applyVerifiedEventFacts(otto);
  assert.equal(fixedOtto.venue, "SVLG Conference Room");
  assert.deepEqual(fixedOtto, { ...otto, venue: "SVLG Conference Room" });
  const fixedLarry = applyVerifiedEventFacts(larry);
  assert.equal(fixedLarry.registration, "closed");
  assert.match(fixedLarry.attendanceNote, /sales.*closed.*October 30.*SVLG/i);
  assert.equal(isBriefingEventAvailable(fixedLarry), false, "closed ticketing must reach existing availability consumers");
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
