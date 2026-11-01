import assert from "node:assert/strict";
import test from "node:test";
import { isEventEditoriallySuppressed } from "../../src/lib/south-bay/eventAvailability.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";

test("unconfirmed newsletter occurrences stay withheld beyond their review date", () => {
  const events = [
    { title: "Mountain View Makers Market", venue: null, date: "2026-11-20", time: "3:00 PM" },
    { title: "Mountain View Makers Market", venue: "Castro Street", date: "2026-12-18", time: "3:00 PM" },
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
