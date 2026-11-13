import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchInboundEvents, fetchMontalvoEvents } from "../generate-events.mjs";
import { parseMontalvoOccurrencePage } from "../../src/lib/south-bay/montalvoOccurrence.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";
import { requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-13-afternoon.json", import.meta.url)));
const now = new Date("2026-11-13T21:07:05Z");

test("a dated online-sales refusal requires confirmation without claiming a sellout", () => {
  const parsed = parseMontalvoOccurrencePage(fixture.ticketHtml);
  assert.equal(parsed.date, "2026-11-15");
  assert.equal(parsed.time, "10:00 AM");
  assert.equal(parsed.attendanceStatus, "needs-confirmation");
  assert.match(parsed.attendanceNote, /Online tickets are not currently available.*box office/);
  assert.equal(parsed.registration, undefined);
  assert.equal(parsed.cost, null, "unavailable pricing is not evidence of free or paid admission");
  assert.equal(isBriefingEventAvailable(parsed), false);
});

test("unrelated and undated notices do not restrict attendance", () => {
  const undated = fixture.ticketHtml.replace(/<p class="tn-event-detail__display-time">[\s\S]*?<\/p>/, "");
  assert.equal(parseMontalvoOccurrencePage(undated).attendanceStatus, undefined);
  const unrelated = fixture.ticketHtml.replace(/class="tn-event-detail__unavailable-text"/, 'class="another-event-promotion"');
  assert.equal(parseMontalvoOccurrencePage(unrelated).attendanceStatus, undefined);
  const soldOut = fixture.ticketHtml.replace("Tickets are not currently available online", "This event is sold out");
  assert.equal(parseMontalvoOccurrencePage(soldOut).registration, "full");
  assert.equal(parseMontalvoOccurrencePage(soldOut).attendanceStatus, undefined);
});

test("the adapter preserves the exact linked occurrence's confirmation notice and evidence", async t => {
  const calendar = '<script type="application/ld+json">' + JSON.stringify({ "@graph": [{
    "@type": "Event", name: fixture.event.title, startDate: "2026-11-15T10:00:00",
    url: fixture.sourceOverviewUrl,
  }] }) + '</script>';
  const requests = [];
  t.mock.method(globalThis, "fetch", async url => {
    requests.push(String(url));
    if (String(url).includes("events-calendar")) return new Response(calendar);
    if (String(url) === fixture.sourceOverviewUrl) return new Response(fixture.overviewHtml);
    assert.equal(String(url), fixture.sourceTicketUrl);
    return new Response(fixture.ticketHtml);
  });
  const [event] = await fetchMontalvoEvents({ previousEvents: [], now });
  assert(requiresAttendanceConfirmation(event));
  assert.equal(event.registration, undefined);
  assert.equal(event.occurrenceEvidence.admissionSourceUrl, fixture.sourceTicketUrl);
  assert.equal(event.time, "10:00 AM");
  assert.equal(requests.length, 3);
  await resolveEventBlurbs([event], { enabled: false });
  assert(requiresAttendanceConfirmation(event), "cached copy cannot remove an access qualification");
});

test("a later available ticket response clears the earlier restriction on fresh ingestion", async t => {
  const calendar = '<script type="application/ld+json">' + JSON.stringify({ "@graph": [{
    "@type": "Event", name: fixture.event.title, startDate: "2026-11-15T10:00:00",
    url: fixture.sourceOverviewUrl,
  }] }) + '</script>';
  const available = fixture.ticketHtml.replace("Tickets are not currently available online", "Tickets are available online")
    + '<div data-tn-price-amount="104.00"></div>';
  t.mock.method(globalThis, "fetch", async url => new Response(String(url).includes("events-calendar")
    ? calendar : String(url) === fixture.sourceOverviewUrl ? fixture.overviewHtml : available));
  const [event] = await fetchMontalvoEvents({ previousEvents: [{ ...fixture.event, attendanceStatus: "needs-confirmation" }], now });
  assert.equal(event.attendanceStatus, undefined);
  assert.equal(event.attendanceNote, undefined);
  assert.equal(event.cost, "paid");
});

test("the verified newsletter class retains its required booking field through fresh and cached publication", async () => {
  const before = fixture.preparedness;
  const [event] = fetchInboundEvents({ today: "2026-11-13", events: [{
    id: "preparedness-fixture", title: before.title,
    startsAt: "2026-11-16T18:15:00-08:00", endsAt: "2026-11-16T20:15:00-08:00",
    cityKey: "sunnyvale", fromEmail: "sunnyvalepubliclibrary@public.govdelivery.com",
    location: before.address, sourceUrl: before.url, description: before.description,
  }] }).map(applyVerifiedEventFacts);
  assert.equal(event.registration, "required");
  assert.equal(event.attendanceNote, "Registration is required.");
  const cached = { ...before };
  await resolveEventBlurbs([cached], { enabled: false });
  assert.equal(cached.registration, "required");
  for (const key of ["id", "title", "date", "time", "endTime", "venue", "url", "description", "blurb"])
    assert.equal(cached[key], before[key], key);
  assert.deepEqual(applyVerifiedEventFacts(cached), cached);
  for (const registration of ["full", "closed", "appointment-only"])
    assert.equal(applyVerifiedEventFacts({ ...before, registration }).registration, registration);
  for (const change of [{ date: "2027-11-16" }, { time: "7:00 PM" }, { url: before.url + "-other" },
    { description: "Registration is not required." }])
    assert.deepEqual(applyVerifiedEventFacts({ ...before, ...change }), { ...before, ...change });
});
