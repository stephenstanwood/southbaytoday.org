import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchScccfdEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";

const { occurrences } = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-07-cert.json", import.meta.url)));

test("sparse organizer cards retain academy eligibility and session commitments through blurb resolution", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-07T19:07:04Z") });
  const cards = occurrences.map(({ published, sourceStart }) => ({
    name: published.title, url: published.url, eventbrite_event_id: published.id,
    start_date: sourceStart.slice(0, 10), start_time: "18:00:00", timezone: "America/Los_Angeles",
    primary_venue: { name: published.venue, address: {
      city: published.city === "campbell" ? "Campbell" : "Los Altos Hills",
      localized_address_display: published.address,
    } },
    ticket_availability: { is_free: false, minimum_ticket_price: { value: 3919 } },
  }));
  t.mock.method(globalThis, "fetch", async () => new Response(
    '<script id="__NEXT_DATA__" type="application/json">'
      + JSON.stringify({ props: { pageProps: { upcomingEvents: cards } } }) + "</script>",
  ));
  const events = await fetchScccfdEvents();
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events.length, 2, "do not invent individual session occurrences");
  for (const event of events) {
    assert.equal(event.time, "6:00 PM");
    assert.equal(event.endTime, "9:00 PM", "finish is the first class, not the academy's final day");
    assert.equal(classifyAudienceAge(event), "adult");
    assert(requiresAdvanceRegistration(event), "the multi-session course cannot enter walk-up recommendations");
    assert.match(event.attendanceNote, /Ages 18\+.*all five sessions to graduate/);
    assert.match(event.attendanceNote, /Skills day:/);
    assert.match(event.blurb, /five-session CERT academy/);
    assert.doesNotMatch(event.blurb, /Monday evenings/);
    assert.equal(event.costNote, "From $39.19", "keep the verified checkout price");
  }
  assert.match(events[0].attendanceNote, /January 25 and 27, February 1 and 3/);
  assert.match(events[1].attendanceNote, /April 5, 7, 12 and 14/);
});

test("carried copy cannot restore the Monday-only claim or reopen a closed academy", async () => {
  for (const { published } of occurrences) {
    const event = { ...published, blurb: "Attend this all-ages course on Monday evenings." };
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.audienceAge, "adult");
    assert.match(event.blurb, /ages 18\+/);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    for (const registration of ["full", "closed", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
    }
  }
});

test("academy attendance facts stay within each exact dated organizer record", () => {
  for (const { published } of occurrences) {
    for (const other of [
      { ...published, date: published.date.replace("2027-", "2028-") },
      { ...published, url: published.url + "0" },
      { ...published, url: published.url.replace("www.eventbrite.com", "example.com") },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});
