import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { backfillVerifiedEventTimes, fetchInboundEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { parseMontalvoOccurrencePage } from "../../src/lib/south-bay/montalvoOccurrence.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-14-yuletide.json", import.meta.url)));

test("the captured dated market ticket confirms free admission without inventing a booking requirement", () => {
  const detail = parseMontalvoOccurrencePage(fixture.ticketHtml);
  assert.equal(detail.date, "2026-11-20");
  assert.equal(detail.time, "10:00 AM");
  assert.equal(detail.cost, "free");
  assert.equal(detail.registration, undefined);
  assert.match(fixture.ticketHtml, /Opening Hours\s*10am–3pm/);
});

test("a newsletter fallback receives verified market hours after its unknown clock is recovered", async () => {
  const source = fixture.incoming;
  const events = fetchInboundEvents({ today: "2026-11-14", events: [{
    id: "yuletide-newsletter-fixture", title: source.title,
    startsAt: "2026-11-20T00:00:00-08:00", cityKey: "saratoga",
    location: source.address, sourceUrl: source.url, description: source.description,
  }] });
  assert.equal(events.length, 1);
  assert.equal(events[0].time, null);
  await backfillVerifiedEventTimes(events, { backfill: async rows => rows.forEach(e => { e.time = "10:00 AM"; }) });
  assert.equal(events[0].cost, "free");
  assert.equal(events[0].endTime, "3:00 PM");
  assert.match(events[0].description, /10 AM–3 PM each day\.$/);
  assert.doesNotMatch(events[0].description, /no times given/);
  assert.equal(events[0].registration, undefined);
});

test("cached publication repairs the actual replaced market and preserves identity and current access restrictions", async () => {
  const event = structuredClone(fixture.incoming);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.cost, "free");
  assert.equal(event.endTime, "3:00 PM");
  assert.match(event.attendanceNote, /asks visitors to register for free to help plan parking/);
  for (const key of ["id", "title", "date", "time", "venue", "address", "url", "firstSeenAt", "blurb"])
    assert.equal(event[key], fixture.incoming[key], key);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
  for (const restriction of [{ registration: "full" }, { registration: "closed" },
    { registration: "required" }, { attendanceStatus: "needs-confirmation" }]) {
    const current = { ...fixture.incoming, ...restriction, attendanceNote: "Current organizer notice." };
    const actual = applyVerifiedEventFacts(current);
    for (const [key, value] of Object.entries(restriction)) assert.equal(actual[key], value);
    assert(actual.attendanceNote.startsWith("Current organizer notice."));
  }
});

test("revised market facts and unrelated occurrences pass through without restoring old admission or hours", () => {
  for (const change of [{ date: "2026-11-21" }, { date: "2027-11-20" }, { time: "11:00 AM" },
    { endTime: "4:00 PM" }, { cost: "paid" }, { costNote: "Free for members only." },
    { description: "Tickets cost $10. Hours are 11 AM–4 PM." }, { city: "campbell" },
    { source: "Another organizer" }, { venue: "Another venue" }, { virtual: true },
    { title: "Another market" }, { url: "https://my.montalvoarts.org/overview/9999" }]) {
    const current = { ...fixture.incoming, ...change };
    assert.deepEqual(applyVerifiedEventFacts(current), current);
  }
});
