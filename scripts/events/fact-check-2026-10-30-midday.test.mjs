import test from "node:test";
import assert from "node:assert/strict";
import { fetchInboundEvents, inferCategory } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

// The dated ticket page describes a Louisiana soul artist performing blues,
// rock and R&B. The sparse calendar title alone loses that music context.
// https://my.montalvoarts.org/3232/3246
test("Marc Broussard's verified concert category survives a sparse source and deduplication", () => {
  for (const url of [
    "https://my.montalvoarts.org/3232/3246",
    "https://montalvoarts.org/experience/carriage-house-concerts/marc-broussard/?promo=",
  ]) {
    const event = {
      title: "Marc Broussard", date: "2026-11-13", time: "7:30 PM",
      venue: "Montalvo Arts Center", category: "arts", cost: null, url,
    };
    const corrected = applyVerifiedEventFacts(event);
    assert.deepEqual(corrected, { ...event, category: "music" });
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    const nextYear = { ...event, date: "2027-11-13" };
    assert.deepEqual(applyVerifiedEventFacts(nextYear), nextYear);
  }
  const unrelated = { title: "Marc Broussard", date: "2026-11-13",
    venue: "Another Venue", category: "arts", url: "https://example.org/another-event" };
  assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
});

// The original October 30 city newsletter puts both input meetings inside
// City Hall, not at the park whose renovation is being discussed.
// https://content.govdelivery.com/accounts/CASUNNYVALE/bulletins/43116f0
test("park renovation community open houses retain their civic category through newsletter ingestion", () => {
  const events = fetchInboundEvents({ today: "2026-10-30", events: [16, 18].map((day) => ({
    id: `las-palmas-${day}`, title: "Las Palmas Park Renovation Community Open House",
    startsAt: `2026-11-${day}T18:00:00-08:00`, endsAt: `2026-11-${day}T20:00:00-08:00`,
    location: "Sunnyvale City Hall, 456 W. Olive Ave., Sunnyvale", cityKey: "sunnyvale",
    description: "In-person open house about the Las Palmas Park renovation, with a brief presentation and topic stations for sharing feedback.",
    sourceUrl: "https://www.sunnyvale.ca.gov/business-and-development/projects-in-sunnyvale/infrastructure-projects/las-palmas-park-renovation",
  })) });
  assert.equal(events.length, 2);
  for (const [index, event] of events.entries()) {
    assert.equal(event.category, "community");
    assert.equal(event.date, `2026-11-${[16, 18][index]}`);
    assert.equal(event.time, "6:00 PM");
    assert.equal(event.endTime, "8:00 PM");
    assert.equal(event.venue, "Sunnyvale City Hall");
    assert.equal(event.city, "sunnyvale");
    assert.equal(event.cost, null, "the newsletter does not state admission");
  }
  assert.equal(inferCategory("Birding at Las Palmas Park", "Walk the park trails.", ""), "outdoor");
});

test("the documentary listing omits its unsupported national population fraction", () => {
  const event = {
    title: "Documentaries: Holodomor Remembrance Day", date: "2026-11-14",
    url: "https://paloalto.bibliocommons.com/events/6ae4c93a901b02002cc63238",
    description: "The famine killed millions of Ukrainians. Holodomor Remembrance Day is observed on the fourth Saturday of November to remember the one-quarter of Ukraine's population who died during the Holodomor. Join the documentary program.",
    time: "2:00 PM", endTime: "3:30 PM", venue: "Rinconada Library", cost: "free",
  };
  for (const url of [event.url, event.url.replace("/events/", "/v2/events/")]) {
    const corrected = applyVerifiedEventFacts({ ...event, url });
    assert.deepEqual(corrected, { ...event, url,
      description: event.description.replace("the one-quarter of Ukraine's population who", "those who"),
    });
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }
  const anotherOccurrence = { ...event, date: "2027-11-14" };
  assert.deepEqual(applyVerifiedEventFacts(anotherOccurrence), anotherOccurrence);
});
