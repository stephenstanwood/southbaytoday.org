import assert from "node:assert/strict";
import test from "node:test";
import { parseBooksIncEvents } from "./booksinc-events.mjs";

// Event fields from the live Elfsight calendar, 2026-10-22. The rendered
// cards no longer have the regional-label line the old text regex required.
const LIVE = {
  "@type": "Event",
  name: "BEST LITERARY TRANSLATIONS: WENDY CALL, DMITRI MANIN, IIZE DUARTE",
  startDate: "2026-10-27T18:00:00-07:00",
  endDate: "2026-10-27T18:00:00-07:00",
  eventStatus: "https://schema.org/EventScheduled",
  location: {
    "@type": "Place", name: "Books Inc. Pruneyard",
    address: { "@type": "PostalAddress", name: "1875 S Bascom Ave, Campbell, CA 95008" },
  },
};
const parse = (events, options = {}) => parseBooksIncEvents(
  [JSON.stringify({ "@graph": events })], { today: "2026-10-22", ...options },
);

test("recovers a live Campbell card without the removed regional-label line", () => {
  const [event] = parse([LIVE]);
  assert.equal(event.title, LIVE.name);
  assert.equal(event.city, "campbell");
  assert.equal(event.venue, "Books Inc. Pruneyard");
  assert.equal(event.address, "1875 S Bascom Ave, Campbell, CA 95008");
  assert.equal(event.date, "2026-10-27");
  assert.equal(event.time, "6:00 PM");
  assert.equal(event.endTime, null, "equal start/end stamps do not establish a duration");
  assert.equal(event.cost, null, "a calendar listing without a price is not proof of free admission");
});

test("keeps winter clocks and the explicit year across New Year", () => {
  const [event] = parse([{
    ...LIVE, startDate: "2027-01-05T18:30:00-08:00", endDate: "2027-01-05T19:45:00-08:00",
  }]);
  assert.equal(event.date, "2027-01-05");
  assert.equal(event.time, "6:30 PM");
  assert.equal(event.endTime, "7:45 PM");
});

test("does not turn East Bay or San Francisco store events into South Bay coverage", () => {
  assert.deepEqual(parse([{
    ...LIVE, location: { name: "Books Inc. Alameda", address: { name: "1344 Park St, Alameda, CA 94501" } },
  }, {
    ...LIVE, location: { name: "Books Inc. Laurel Village", address: { name: "3515 California St, San Francisco, CA 94118" } },
  }]), []);
});

test("filters past, cancelled, and postponed cards and collapses repeated schema", () => {
  const events = parse([
    LIVE, LIVE,
    { ...LIVE, name: "Past event", startDate: "2026-10-01T18:00:00-07:00" },
    { ...LIVE, name: "Cancelled event", eventStatus: "https://schema.org/EventCancelled" },
    { ...LIVE, name: "Postponed event", eventStatus: "https://schema.org/EventPostponed" },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, LIVE.name);
});

test("preserves unknown clocks for date-only schema and rejects ambiguous or malformed timestamps", () => {
  const [event] = parse([{ ...LIVE, startDate: "2026-10-27", endDate: undefined }]);
  assert.equal(event.time, null);
  for (const startDate of ["2026-10-27T18:00:00", "2026-02-30T18:00:00-08:00", "not a date"]) {
    assert.throws(() => parse([{ ...LIVE, startDate }]), /parser drift/);
  }
});

test("an absent calendar is an error rather than an apparently quiet season", () => {
  assert.throws(() => parseBooksIncEvents(["broken JSON", '{"@type":"BreadcrumbList"}']), /no Event JSON-LD/);
});
