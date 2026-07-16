import assert from "node:assert/strict";
import test from "node:test";

import { eventToSchema } from "./eventSchema";

test("eventToSchema identifies the canonical leaf page and preserves the primary source", () => {
  const pageUrl = "https://southbaytoday.org/event/2026-07-18-summer-concert";
  const sourceUrl = "https://example.org/events/summer-concert";
  const schema = eventToSchema({
    title: "Summer Concert",
    date: "2026-07-18",
    time: "7:00 PM",
    venue: "Town Plaza",
    address: "1 Main St",
    cityName: "Los Gatos",
    url: sourceUrl,
    pageUrl,
    cost: "free",
  });

  assert.ok(schema);
  assert.equal(schema["@id"], `${pageUrl}#event`);
  assert.equal(schema.url, pageUrl);
  assert.equal(schema.sameAs, sourceUrl);
  assert.equal(schema.eventStatus, "https://schema.org/EventScheduled");
  assert.equal(schema.eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode");
  assert.deepEqual(schema.location, {
    "@type": "Place",
    name: "Town Plaza",
    address: {
      "@type": "PostalAddress",
      addressRegion: "CA",
      addressCountry: "US",
      streetAddress: "1 Main St",
      addressLocality: "Los Gatos",
    },
  });
  assert.deepEqual(schema.offers, {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    url: sourceUrl,
  });
});

test("eventToSchema falls back to the primary source when no leaf page is known", () => {
  const sourceUrl = "https://example.org/events/open-house";
  const schema = eventToSchema({
    title: "Open House",
    date: "2026-07-19",
    cityName: "Sunnyvale",
    url: sourceUrl,
  });

  assert.ok(schema);
  assert.equal(schema.url, sourceUrl);
  assert.equal(schema.sameAs, undefined);
});

test("eventToSchema describes explicitly online events as virtual", () => {
  const sourceUrl = "https://example.org/register/author-talk";
  const schema = eventToSchema({
    title: "Online Author Talk",
    date: "2026-07-20",
    venue: "Zoom",
    cityName: "Los Gatos",
    url: sourceUrl,
  });

  assert.ok(schema);
  assert.equal(schema.eventAttendanceMode, "https://schema.org/OnlineEventAttendanceMode");
  assert.deepEqual(schema.location, {
    "@type": "VirtualLocation",
    name: "Zoom",
    url: sourceUrl,
  });
});

test("eventToSchema rejects records without a real title and ISO date", () => {
  assert.equal(eventToSchema({ title: "", date: "2026-07-19" }), null);
  assert.equal(eventToSchema({ title: "Open House", date: "July 19" }), null);
});
