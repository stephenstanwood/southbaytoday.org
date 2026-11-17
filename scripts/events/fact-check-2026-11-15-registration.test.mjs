import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchMontalvoEvents, fetchStanfordEvents, polishDescription } from "../generate-events.mjs";
import { findMontalvoPerformanceUrl, parseMontalvoOccurrencePage } from "../../src/lib/south-bay/montalvoOccurrence.mjs";
import { libraryEventDetails } from "../lib/library-event-details.mjs";
import { polishReviewedEventCopy } from "../../src/lib/south-bay/eventCopyEdits.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-15-registration.json", import.meta.url)));

test("the Montalvo adapter follows the exact seating and retains its visible sellout", async t => {
  const event = fixture.montalvoPublished, requested = [];
  t.mock.method(globalThis, "fetch", async url => {
    requested.push(String(url));
    if (String(url) === event.url) return new Response(fixture.montalvoOverview);
    if (String(url) === "https://my.montalvoarts.org/3253/3254") return new Response(fixture.montalvoPerformance);
    assert.equal(String(url), "https://montalvoarts.org/experience/events-calendar/");
    return new Response(`<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: event.title, startDate: "2026-11-22T11:30:00+00:00", url: event.url })}</script>`);
  });
  const [row] = await fetchMontalvoEvents({ previousEvents: [], now: new Date("2026-11-15T05:00:00Z") });
  assert(requested.includes("https://my.montalvoarts.org/3253/3254"));
  assert.equal(row.date, "2026-11-22");
  assert.equal(row.time, "11:30 AM");
  assert.equal(row.registration, "full");
  assert.match(row.attendanceNote, /Sold out.*waitlist/);
  assert.equal(row.occurrenceEvidence.admissionSourceUrl, "https://my.montalvoarts.org/3253/3254");
});

test("Montalvo's current not-on-sale alert carries its prior price without a sellout claim", async t => {
  const event = fixture.montalvoPublished;
  const ticketUrl = "https://my.montalvoarts.org/3253/3254";
  const notOnSale = fixture.montalvoPerformance.replace(
    /<p role="alert" class="tn-event-detail__unavailable-text">[\s\S]*?<\/p>/,
    '<p role="alert" class="tn-event-detail__unavailable-text"><h3><em>This event is not currently on sale.</em></h3></p>',
  );
  t.mock.method(globalThis, "fetch", async url => {
    if (String(url) === event.url) return new Response(fixture.montalvoOverview);
    if (String(url) === ticketUrl) return new Response(notOnSale);
    assert.equal(String(url), "https://montalvoarts.org/experience/events-calendar/");
    return new Response(`<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: event.title, startDate: "2026-11-22T11:30:00+00:00", url: event.url })}</script>`);
  });
  const [row] = await fetchMontalvoEvents({ previousEvents: [event], now: new Date("2026-11-17T20:00:00Z") });
  assert.equal(row.cost, "paid");
  assert.equal(row.costNote, event.costNote);
  assert.equal(row.attendanceStatus, "needs-confirmation");
  assert.equal(row.registration, undefined);
  assert.match(row.attendanceNote, /Online tickets are not currently available/);
  assert.equal(row.occurrenceEvidence.admissionSourceUrl, ticketUrl);
  assert.deepEqual(applyVerifiedEventFacts(row), row);
});

test("seating clocks come from the current occurrence label, with other sessions and hidden alerts excluded", () => {
  const url = "https://my.montalvoarts.org/3253/3254";
  assert.equal(findMontalvoPerformanceUrl(fixture.montalvoOverview, fixture.montalvoPublished), url);
  assert.equal(findMontalvoPerformanceUrl(fixture.montalvoOverview, { ...fixture.montalvoPublished, time: "1:00 PM" }), null);
  const parsed = parseMontalvoOccurrencePage(fixture.montalvoPerformance);
  assert.equal(parsed.date, "2026-11-22");
  assert.equal(parsed.time, "11:30 AM");
  assert.equal(parsed.registration, "full");
  const reopened = fixture.montalvoPerformance.replace(/<p role="alert" class="tn-event-detail__unavailable-text">[\s\S]*?<\/p>/, "")
    + '<div class="hidden">Sold out! Join the Waitlist</div><div data-tn-price-amount="80.00"></div>';
  const fresh = parseMontalvoOccurrencePage(reopened);
  assert.equal(fresh.registration, undefined);
  assert.equal(fresh.cost, "paid");
  assert.equal(parseMontalvoOccurrencePage(fixture.montalvoPerformance.replace("Seating at 11:30 am", "Another session at 11:30 am")).registration, undefined);
});

test("the cached tea carries the current booking notice and later exact performance evidence wins", async () => {
  const event = structuredClone(fixture.montalvoPublished);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "none");
  assert.equal(event.attendanceStatus, "needs-confirmation");
  assert.match(event.attendanceNote, /Online tickets are not currently available/);
  assert.doesNotMatch(event.attendanceNote, /Reserve your/);
  assert.equal(event.costNote, fixture.montalvoPublished.costNote);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
  for (const change of [{ date: "2027-11-22" }, { time: "2:30 PM" }, { costNote: "$90 per person." },
    { occurrenceEvidence: { ...event.occurrenceEvidence, admissionSourceUrl: "https://my.montalvoarts.org/3253/3254" }, registration: "required", attendanceNote: "Tickets available again." }]) {
    const revised = { ...fixture.montalvoPublished, ...change };
    assert.deepEqual(applyVerifiedEventFacts(revised), revised);
  }
});

test("Stanford preserves a mandatory registration paragraph after a rich-text section heading", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-15T05:00:00Z") });
  const source = fixture.stanfordSource;
  const variants = [source, ...[
    "Registration is not required.", "Registration is optional.", "Registration is now closed.",
    "Registration is now full.", "Registration is required. The revised deadline is November 15.",
  ].map((terms, i) => ({ ...source, id: i + 1,
    description: source.description.replace("Registration is required.", terms),
    description_text: source.description_text.replace("Registration is required.", terms),
  }))];
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: variants.map(event => ({ event })) }));
  const rows = await fetchStanfordEvents();
  assert.equal(rows[0].registration, "required");
  assert.match(rows[0].attendanceNote, /Registration is required\./);
  assert.equal(rows[0].virtual, true);
  assert.equal(rows[0].time, "12:00 PM");
  assert.equal(rows[0].endTime, "1:00 PM");
  assert.equal(rows[0].cost, "free");
  assert.equal(rows[1].registration, undefined, "a ticket URL and optional attendance are not a gate");
  assert.equal(rows[2].registration, undefined);
  assert.equal(rows[3].registration, "closed");
  assert.equal(rows[4].registration, "full");
  assert.equal(rows[5].registration, "required");
});

test("cached publication retains the verified lecture signup gate without changing its schedule or copy", async () => {
  const event = structuredClone(fixture.stanfordPublished);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "required");
  assert.match(event.attendanceNote, /Registration is required\./);
  for (const key of ["id", "title", "date", "time", "endTime", "venue", "virtual", "url", "description", "blurb", "cost"])
    assert.equal(event[key], fixture.stanfordPublished[key], key);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("the dated cached repair respects revised occurrences, terms and availability", () => {
  const original = fixture.stanfordPublished;
  for (const change of [{ date: "2027-11-16" }, { time: "2:00 PM" }, { endTime: "3:00 PM" },
    { url: "https://example.org/event" }, { source: "Another organizer" },
    { description: "Registration is optional." }, { registration: "full", attendanceNote: "Current source notice." },
    { registration: "closed", attendanceNote: "Current source notice." }]) {
    const revised = { ...original, ...change };
    assert.deepEqual(applyVerifiedEventFacts(revised), revised);
  }
});

for (const row of fixture.libraryCases) {
  test(`fresh library HTML preserves reviewed copy: ${row.event.title}`, () => {
    const refreshed = polishDescription(libraryEventDetails(row.source, row.entities).description);
    const event = polishReviewedEventCopy({ ...row.event, description: refreshed });
    assert.equal(event.description, row.reviewed);
    assert.deepEqual(polishReviewedEventCopy(event), event);
    const revisedText = refreshed.replace("$20 per hour", "$25 per hour")
      .replace("1-hour session", "2-hour session").replace("age of 15", "age of 16")
      .replace("408-808-3073", "408-555-0123").replace("caitlin.bosworth@sjlibrary.org", "updated@example.org");
    const revised = polishReviewedEventCopy({ ...row.event, description: revisedText });
    assert.equal(revised.description, row.reviewed.replace("$20 per hour", "$25 per hour")
      .replace("1-hour session", "2-hour session").replace("age of 15", "age of 16")
      .replace("408-808-3073", "408-555-0123").replace("caitlin.bosworth@sjlibrary.org", "updated@example.org"));
    for (const key of Object.keys(row.event)) if (key !== "description") assert.deepEqual(event[key], row.event[key], key);
    const other = { ...row.event, source: "Another publisher", description: refreshed };
    assert.deepEqual(polishReviewedEventCopy(other), other);
  });
}
