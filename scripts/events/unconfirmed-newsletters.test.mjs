import assert from "node:assert/strict";
import test from "node:test";
import { fetchInboundEvents } from "../generate-events.mjs";
import { isEventEditoriallySuppressed } from "../../src/lib/south-bay/eventAvailability.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

test("unconfirmed newsletter occurrences stay withheld beyond their review date", () => {
  const events = [
    { title: "Njioma Grevious Violin Recital", venue: "Bing Concert Hall", date: "2027-02-05", time: "7:30 PM" },
    { title: "Renée Qin and Ania Filochowska: The World We Speak Into Being", venue: "The Studio", date: "2027-02-04", time: "7:00 PM" },
    { title: "Rihab Chaieb: Nomad—the Eternal Wanderer", venue: "Bing Concert Hall", date: "2027-02-24", time: "7:30 PM" },
    { title: "300 Paintings by Sam Kissajukian", venue: "The Studio", date: "2027-03-03", time: "7:00 PM" },
  ];
  for (const event of events) {
    assert.equal(isEventEditoriallySuppressed(event), true);
    assert.equal(isEventPublishable(event), false);
    assert.equal(isEventEditoriallySuppressed({ ...event, date: "2027-03-01" }), false);
  }
  for (const event of [
    { title: "Poetry Live! with Franny Choi and Cameron Awkward-Rich", venue: "The Studio", date: "2027-01-14", time: "7:00 PM" },
    { title: "A Christmas Show with Camila Fernández", venue: "Bing Concert Hall", date: "2026-12-13", time: "4:00 PM" },
  ]) assert.equal(isEventPublishable(event), true);
});

test("both city-confirmed Makers Markets publish with their source clocks and a named venue", () => {
  const url = "https://econdev.mountainview.gov/downtown/makers-market-2026";
  const sources = [
    ["2026-11-20", "Mountain View Makers Market"],
    ["2026-12-18", "Mountain View Makers Market (December)"],
  ];
  for (const [date, title] of sources) {
    const [event] = fetchInboundEvents({ today: "2026-11-18", events: [{
      id: date, title, sourceUrl: url, cityKey: "mountain-view",
      startsAt: `${date}T15:00:00-08:00`, endsAt: `${date}T20:00:00-08:00`,
      location: "300 Block of Castro Street, Downtown Mountain View",
    }] });
    const listing = applyVerifiedEventFacts(event);
    assert(isEventPublishable(listing));
    assert.equal(listing.title, "Mountain View Makers Market");
    assert.equal(listing.venue, "Castro Street");
    assert.equal(listing.address, "300 block of Castro Street, Mountain View, CA");
    assert.equal(listing.category, "market");
    assert.deepEqual([listing.date, listing.time, listing.endTime], [date, "3:00 PM", "8:00 PM"]);
    assert.equal(applyVerifiedEventFacts({ ...listing, time: "4:00 PM" }).time, "4:00 PM");
  }
});

test("the Advent fair publishes the attendee bulletin through inbound normalization", () => {
  const raw = {
    id: "advent-fair", title: "Advent Craft Faire and Supper", cityKey: "los-gatos",
    startsAt: "2026-11-29T16:00:00-08:00",
    location: "Presbyterian Church of Los Gatos, Los Gatos, CA",
    sourceUrl: "https://www.signupgenius.com/go/10C0E49AEA92CA5F58-67534688-advent?utm_source=qrcode",
    description: "Dinner starts at 5:30 PM. The sign-up link is for volunteers helping prepare and serve dinner.",
  };
  const [event] = fetchInboundEvents({ today: "2026-11-18", events: [raw] });
  const listing = applyVerifiedEventFacts(event);
  assert.equal(listing.url, "https://www.pclg.org/this-week/2026-11-18.pdf");
  assert.equal(listing.endTime, "7:00 PM");
  assert.equal(listing.description, "Dinner starts at 5:30 PM.");
  assert.deepEqual(applyVerifiedEventFacts(listing), listing);
  const [updated] = fetchInboundEvents({ today: "2026-11-18", events: [{
    ...raw, endsAt: "2026-11-29T18:30:00-08:00",
  }] });
  assert.equal(applyVerifiedEventFacts(updated).endTime, "6:30 PM");
});
