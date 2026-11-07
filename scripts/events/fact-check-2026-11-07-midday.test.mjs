import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backfillVerifiedEventTimes, extractTimeFromHtml, fetchInboundEvents } from "../generate-events.mjs";
import { deduplicateEventUrls } from "../lib/event-url-dedup.mjs";
import { libraryEventDetails } from "../lib/library-event-details.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-07-midday.json", import.meta.url)));
const wreaths = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-07-wreaths.json", import.meta.url)));
const morning = wreaths.occurrences[0];

test("a date-only newsletter alias canonicalizes after its clock is recovered, before URL deduplication", async () => {
  const newsletter = (id, title, startsAt, sourceUrl) => ({
    id, title, startsAt, endsAt: null, sourceUrl,
    fromEmail: "info@montalvoarts.org", cityKey: "saratoga",
    location: "Montalvo Arts Center", description: "Make a seasonal wreath.",
  });
  const events = fetchInboundEvents({ today: "2026-11-07", events: [
    newsletter("dated", "Wreathmaking Workshop (10am session)", "2026-11-15T10:00:00-08:00", morning.url),
    newsletter("date-only", "Wild-Foraged Wreath-Making Workshop", "2026-11-15T00:00:00-08:00", "https://my.montalvoarts.org/overview/3275?promo="),
  ] }).map(applyVerifiedEventFacts);
  assert.equal(events[1].time, null, "a midnight sentinel does not establish a start");
  assert.notEqual(events[1].url, morning.url);
  await backfillVerifiedEventTimes(events, { backfill: async (rows) => {
    assert.equal(rows, events);
    rows[1].time = extractTimeFromHtml(morning.html, rows[1].date);
  } });
  assert.equal(events[1].url, morning.url);
  assert.equal(events[1].time, "10:00 AM");
  assert.equal(events[1].registration, "full");
  assert.equal(events[1].venue, events[0].venue);
  assert.deepEqual(deduplicateEventUrls(events), [events[0]]);
  const later = { ...events[1], time: "6:00 PM", url: "https://my.montalvoarts.org/overview/3275?promo=" };
  await backfillVerifiedEventTimes([later], { backfill: async () => {} });
  assert.equal(later.time, "6:00 PM", "another session cannot inherit the morning identity");
  assert.notEqual(later.url, morning.url);
});

test("the exact storytime's contradictory pickup fields remain a confirmation notice through cached copy", async () => {
  const details = libraryEventDetails(fixture.library);
  assert.match(details.description, /60 minutes/);
  assert.match(details.attendanceNote, /30 minutes/);
  const input = { ...fixture.published, ...details };
  const event = applyVerifiedEventFacts(input);
  assert.equal(event.attendanceStatus, "needs-confirmation");
  assert.match(event.attendanceNote, /60 minutes.*30 minutes.*Confirm pickup timing/);
  assert.match(event.description, /conflicting ticket pickup instructions/);
  assert.doesNotMatch(event.description, /Information Desk 60 minutes/);
  assert.equal(event.time, "11:00 AM");
  assert.equal(event.endTime, "11:30 AM");
  assert.equal(event.cost, "free");
  await resolveEventBlurbs([event], { enabled: false });
  assert.deepEqual(applyVerifiedEventFacts(event), event);
  for (const resolved of [
    { ...input, description: details.description.replace("60 minutes", "30 minutes") },
    { ...input, attendanceNote: details.attendanceNote.replace("30 minutes", "60 minutes") },
    { ...input, date: "2027-11-10" },
    { ...input, url: "https://sjpl.bibliocommons.com/events/another-occurrence" },
  ]) assert.deepEqual(applyVerifiedEventFacts(resolved), resolved, "resolved or unrelated source facts must pass through");
});

test("the swim-center newsletter retains its public city bulletin without inventing admission terms", () => {
  const input = {
    id: "swim-center", title: "International Swim Center Phase 2 Community Meeting",
    cityKey: "santa-clara", fromEmail: "PRCustomerServe@info.SantaClaraCA.gov",
    startsAt: "2026-11-18T17:00:00-08:00", endsAt: "2026-11-18T18:30:00-08:00",
    location: "Santa Clara Senior Center, 1303 Fremont St., Santa Clara, CA",
    description: "Learn about the project and share your feedback.", sourceUrl: null,
  };
  const [event] = fetchInboundEvents({ events: [input], today: "2026-11-07" });
  assert.equal(event.url, "https://content.govdelivery.com/accounts/CASANTACLARA/bulletins/431da35");
  assert.equal(event.time, "5:00 PM");
  assert.equal(event.endTime, "6:30 PM");
  assert.equal(event.cost, null);
  assert.equal(event.registration, undefined);
  for (const other of [
    { ...input, startsAt: "2027-11-18T17:00:00-08:00", endsAt: null },
    { ...input, title: "Another community meeting" },
  ]) assert.equal(fetchInboundEvents({ events: [other], today: "2026-11-07" })[0].url, "");
});
