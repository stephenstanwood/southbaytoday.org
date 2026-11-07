import test from "node:test";
import assert from "node:assert/strict";
import { mapTicketmasterEvent } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

// Minimal public Discovery fields from the reviewed San Jose Improv shows.
const source = {
  id: "reviewed-comedy-show",
  name: "Mark Normand",
  dates: { start: { localDate: "2026-11-07", localTime: "19:00:00" }, status: { code: "onsale" } },
  url: "https://www.ticketweb.com/event/mark-normand-san-jose-improv-tickets/14742663",
  _embedded: { venues: [{ name: "San Jose Improv", city: { name: "San Jose" }, address: { line1: "62 S Second St" } }] },
  priceRanges: [{ min: 0, max: 0 }],
  info: "There is a ticket delivery delay in place until two days prior to the event. Tickets will not be emailed until then. Tickets are only available online until the delivery delay is lifted. DO NOT PURCHASE TICKETS FROM ANYONE OR ANY OTHER SITE OTHER THAN IMPROV.COM. EVENT INFO: There is a two-item minimum purchase requirement in the showroom for all guests.",
  pleaseNote: "This event is 21 and over. • ALL SALES ARE FINAL, unless the event is canceled. • Mandatory two-item minimum purchase per person in the showroom. • No photography during the show.",
};

test("ticket purchase minimum survives truncated policy copy, normalization and cached blurbs", async () => {
  const e = mapTicketmasterEvent(source);
  assert.doesNotMatch(e.description, /minimum/);
  assert.equal(e.attendanceNote, "Ages 21+. Two-item minimum purchase per person.");
  assert.equal(e.cost, "paid", "a zero placeholder never establishes free Improv admission");
  assert.equal(e.costNote, undefined);
  assert.deepEqual(applyVerifiedEventFacts(e), e);
  const before = structuredClone(e);
  await resolveEventBlurbs([e], { enabled: false });
  for (const field of ["id", "date", "time", "venue", "url", "cost", "attendanceNote"]) {
    assert.equal(e[field], before[field], field);
  }
});

test("each complete source field can establish the requirement before display truncation", () => {
  for (const fields of [
    { info: source.info, pleaseNote: "" },
    { info: "", pleaseNote: source.pleaseNote },
    { info: "", pleaseNote: "Mandatory 2-item minimum purchase per person." },
  ]) {
    assert.match(mapTicketmasterEvent({ ...source, ...fields }).attendanceNote, /Two-item minimum purchase per person\./);
  }
  const soldOut = mapTicketmasterEvent({ ...source, name: "SOLD OUT Mark Normand" });
  assert.equal(soldOut.registration, "full");
  assert.match(soldOut.attendanceNote, /^Tickets are sold out.*Ages 21\+.*Two-item minimum/s);
});

test("conditional, historical, optional and limited-group minimums do not become universal rules", () => {
  for (const pleaseNote of [
    "If you choose the dinner package, mandatory two-item minimum purchase per person.",
    "If you choose the dinner package:\nMandatory two-item minimum purchase per person.",
    "Previously, mandatory two-item minimum purchase per person.",
    "The following applied last season:\nMandatory two-item minimum purchase per person.",
    "Mandatory two-item minimum purchase per person for VIP guests only.",
    "A two-item purchase is optional.",
    "No two-item minimum purchase per person.",
    "Without a two-item minimum purchase per person.",
    "The two-item minimum is waived for this show.",
    'The biography quotes "Mandatory two-item minimum purchase per person."',
    "Bags must fit under your seat.",
    "",
  ]) {
    const mapped = mapTicketmasterEvent({ ...source, info: "", pleaseNote });
    assert.equal(mapped.attendanceNote, undefined, pleaseNote);
  }
  assert.equal(mapTicketmasterEvent({ ...source, info: "No two-item minimum for this show." }).attendanceNote, "Ages 21+.", "a conflicting exception prevents a universal minimum");
});

test("fresh source text can remove the requirement without a dated or venue-based override", () => {
  const mapped = mapTicketmasterEvent({ ...source, info: "A comedy show.", pleaseNote: "This event is 18 and over." });
  assert.equal(mapped.attendanceNote, "Ages 18+.");
  assert.equal(mapped.date, source.dates.start.localDate);
  assert.equal(mapped.time, "7:00 PM");
  assert.equal(mapped.venue, "San Jose Improv");
});
