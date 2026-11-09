import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchInboundEvents } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";
import { resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-09-montalvo.json", import.meta.url)));

test("real newsletter ingestion and retained copy preserve Montalvo's show title and adult entry condition", async () => {
  const [event] = fetchInboundEvents({ events: [fixture.newsletter], today: "2026-11-09" });
  assert.equal(event.time, fixture.source.time, "the verified occurrence recovers the newsletter's missing clock");
  event.blurb = fixture.published.blurb;
  event.audienceAge = "all";
  const before = structuredClone(event);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.title, fixture.source.title);
  assert.equal(event.audienceAge, "adult");
  assert.equal(classifyAudienceAge(event), "adult");
  assert.equal(event.kidFriendly, false);
  assert.deepEqual(event.sourceAudiences, ["Adults 18+"]);
  assert.match(event.attendanceNote, /18\+.*valid photo ID required/);
  assert.doesNotMatch(event.description, /no start time given/);
  for (const key of Object.keys(before)) {
    if (!["title", "audienceAge", "description"].includes(key)) assert.deepEqual(event[key], before[key], key);
  }
  assert.equal(event.date, fixture.source.date);
  assert.equal(event.endTime, null);
  assert.equal(event.cost, null, "no price is inferred from a Buy Tickets link");
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("the exact occurrence keeps later availability notes, remains idempotent and does not alter other shows", () => {
  for (const registration of ["full", "closed", "appointment-only"]) {
    const source = { ...fixture.published, registration, attendanceNote: "Confirm current availability with Montalvo." };
    const actual = applyVerifiedEventFacts(source);
    assert.equal(actual.registration, registration);
    assert.match(actual.attendanceNote, /^Confirm current availability with Montalvo\./);
    assert.match(actual.attendanceNote, /18\+.*photo ID/);
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    assert.equal(source.title, fixture.published.title, "the captured input is not mutated");
  }
  const updated = { ...fixture.published, description: "Updated organizer program.", blurb: "Updated organizer copy." };
  assert.equal(applyVerifiedEventFacts(updated).description, updated.description);
  assert.equal(applyVerifiedEventFacts(updated).blurb, updated.blurb);
  for (const other of [
    { ...fixture.published, date: "2027-03-26" },
    { ...fixture.published, url: fixture.sourceUrl + "another-show" },
    { ...fixture.published, url: fixture.sourceUrl.replace("montalvoarts.org", "example.org") },
    { ...fixture.published, venue: "Another venue" },
    { ...fixture.published, title: "Another comedian" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("the former Shelf Help event URL redirects to the verified title", () => {
  const event = fixture.published;
  const oldSlug = "2027-03-25-comedian-david-nihill-shelf-help";
  const { redirects, orphans } = resolveRetired({ entries: [{ slug: oldSlug, event }] },
    [applyVerifiedEventFacts(event)], [], "2026-11-09");
  assert.equal(redirects.get(oldSlug), "2027-03-25-david-nihill-taking-tangents-tour");
  assert.equal(orphans.length, 0);
});
