import assert from "node:assert/strict";
import test from "node:test";

import { inferPostLocation, normalizePlaywrightEvent, scrapePOST } from "../playwright-scrapers.mjs";

const date = "2026-10-18";
const url = "https://www.eventbrite.com/e/coyote-creek-trail-bioblitz-tickets-1999128802062?aff=post";
const title = "Coyote Creek Trail BioBlitz";
const location = {
  city: "milpitas",
  venue: "Coyote Creek Trail",
  address: "Ranch Dr. and Alviso Milpitas Rd, Milpitas, CA 95035",
};

test("the POST scraper publishes the dated Milpitas meeting point and keeps unrelated locations", async () => {
  const raw = [
    { month: "Oct", day: "18", title, link: url, time: "9:00 AM", endTime: "11:30 AM", volunteer: true },
    // Neither another occurrence nor another organizer URL establishes a city
    // for this long trail. They must not inherit this meeting point.
    { month: "Oct", day: "25", title, link: url },
    { month: "Oct", day: "19", title, link: "https://example.org/another-bioblitz" },
    { month: "Nov", day: "1", title: "BioBlitz at Hellyer County Park", link: "https://example.org/hellyer", volunteer: true },
    { month: "Oct", day: "29", title: "Bug’s Eye View (Online Event)", link: "https://openspacetrust.org/event/bugs-eye-view-online-event/", virtual: true },
  ];
  const page = {
    setExtraHTTPHeaders: async () => {},
    goto: async (target) => assert.equal(target, "https://openspacetrust.org/events/"),
    waitForTimeout: async () => {},
    evaluate: async () => raw,
  };
  const events = (await scrapePOST(page, { today: date })).map(normalizePlaywrightEvent);
  assert.equal(events.length, 3);
  assert.deepEqual(
    Object.fromEntries(["city", "venue", "address"].map((key) => [key, events[0][key]])), location,
  );
  assert.equal(events[0].date, date);
  assert.equal(events[0].time, "9:00 AM");
  assert.equal(events[0].endTime, "11:30 AM");
  assert.equal(events[0].registration, "required");
  assert.match(events[0].attendanceNote, /Register through Keep Coyote Creek Beautiful/);
  assert.equal(events[1].city, "san-jose");
  assert.equal(events[1].venue, "Hellyer County Park");
  assert.equal(events[2].virtual, true);
  assert.equal(events[2].venue, "Online (POST Webinar)");
});

test("Coyote Creek alone cannot establish a city, and other park rules still work", () => {
  assert.equal(inferPostLocation(title), null);
  assert.equal(inferPostLocation(title, { date: "2026-10-25", url }), null);
  assert.equal(inferPostLocation(title, { date, url: "https://example.org/another-bioblitz" }), null);
  assert.deepEqual(inferPostLocation(title, { date, url }), location);
  assert.deepEqual(inferPostLocation("Stevens Creek Trail Walk"), {
    city: "mountain-view", venue: "Stevens Creek Trail",
  });
  assert.equal(inferPostLocation("BioBlitz at Bair Island"), null);
});

test("cached POST rows get the verified location without reopening a closed signup", () => {
  const raw = {
    title, date, url, source: "Peninsula Open Space Trust",
    city: "san-jose", venue: "Coyote Creek", address: "", registration: "closed",
  };
  const event = normalizePlaywrightEvent(raw);
  assert.equal(event.city, "milpitas");
  assert.equal(event.address, location.address);
  assert.equal(event.registration, "closed");
  assert.equal(raw.city, "san-jose");
  const later = normalizePlaywrightEvent({ ...raw, date: "2026-10-25" });
  assert.equal(later.city, "san-jose", "a dated correction must not infer a later occurrence's location");
});
