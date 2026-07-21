import assert from "node:assert/strict";
import test from "node:test";

import { CIVIC_EVENT_IMAGE_URL, civicMeetingToSchema } from "./civicMeetingSchema";

test("civic meeting schema has an honest image and canonical/source identities", () => {
  const pageUrl = "https://southbaytoday.org/gov/sunnyvale";
  const sourceUrl = "https://sunnyvaleca.legistar.com/Calendar.aspx";
  const schema = civicMeetingToSchema({
    cityId: "sunnyvale",
    cityName: "Sunnyvale",
    cityWebsite: "https://www.sunnyvale.ca.gov/",
    meeting: {
      date: "2026-07-21",
      bodyName: "City Council",
      location: "Council Chambers",
      url: sourceUrl,
    },
  });

  assert.ok(schema);
  assert.equal(schema.image, CIVIC_EVENT_IMAGE_URL);
  assert.equal(schema["@id"], `${pageUrl}#event`);
  assert.equal(schema.url, pageUrl);
  assert.equal(schema.sameAs, sourceUrl);
  assert.deepEqual(schema.organizer, {
    "@type": "Organization",
    name: "Sunnyvale City Council",
    url: "https://www.sunnyvale.ca.gov/",
  });
});

test("civic meeting schema is omitted when no exact meeting date is confirmed", () => {
  assert.equal(civicMeetingToSchema({
    cityId: "milpitas",
    cityName: "Milpitas",
    cityWebsite: "https://www.milpitas.gov/",
    meeting: null,
  }), null);
});
