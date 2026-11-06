import test from "node:test";
import assert from "node:assert/strict";
import { lindenTreeEventFacts } from "../lib/linden-tree-heading.mjs";
import { normalizePlaywrightEvent } from "../playwright-scrapers.mjs";
import { fetchPlaywrightEvents } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { registrationLabel, requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

// Organizer calendar retrieved November 6, 2026, at 12:09 UTC:
// https://www.lindentreebooks.com/events-calendar/
// The notice is a separate line inside this occurrence's h3; it is absent
// from the paragraphs below it. Keep booking status separate from the title.
const heading = "Hilo: The Holiday Special with Judd Winick\nFriday, November 6 at 6pm\nEVENT FULL";
const description = "This event is free, but you must purchase a copy of Hilo: The Holiday Special from Linden Tree to enter the signing line.";

test("Linden Tree's separate EVENT FULL heading supplies the missing booking gate", () => {
  const facts = lindenTreeEventFacts(heading, description);
  assert.equal(facts.registration, "full");
  assert.equal(facts.cost, "free");
  assert.equal(registrationLabel(facts), "Registration full");
  assert.equal(requiresAdvanceRegistration(facts), true);
  assert.equal(lindenTreeEventFacts(heading, "No registration required.").registration, "full");
  assert.equal(lindenTreeEventFacts(heading).cost, null, "full does not establish a price");
});

test("a reopened calendar and unrelated uses of full do not inherit the booking state", () => {
  const reopened = heading.replace("EVENT FULL", "RSVP Now »");
  assert.notEqual(lindenTreeEventFacts(reopened, description).registration, "full");
  for (const title of ["A Full Life", "Sold Out: A Novel", "An EVENT FULL of Surprises", "EVENT FULL\nFriday, November 6 at 6pm", "Author Talk\nEVENT FULL\nFriday, November 6 at 6pm"]) {
    assert.notEqual(lindenTreeEventFacts(title, "The author has played sold-out shows.").registration, "full");
  }
});

test("the full notice survives snapshot normalization, ingestion and cached-blurb resolution", async () => {
  const raw = {
    title: "Hilo: The Holiday Special with Judd Winick", date: "2026-11-06",
    time: "6pm", endTime: null, venue: "Linden Tree Books",
    address: "265 State St, Los Altos, CA 94022", city: "los-altos",
    url: "https://www.lindentreebooks.com/events-calendar/", source: "Linden Tree Books",
    description,
  };
  const snapshot = normalizePlaywrightEvent({ ...raw, ...lindenTreeEventFacts(heading, description) });
  const [event] = fetchPlaywrightEvents({ events: [snapshot], today: "2026-11-06" });
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.registration, "full");
  assert.equal(requiresAdvanceRegistration(event), true);
  for (const key of ["id", "title", "date", "endTime", "venue", "address", "city", "url", "source", "cost"]) {
    assert.equal(event[key], snapshot[key], key);
  }
  const reopened = normalizePlaywrightEvent({ ...raw, ...lindenTreeEventFacts(heading.replace("EVENT FULL", "RSVP Now »"), description) });
  const [fresh] = fetchPlaywrightEvents({ events: [reopened], today: "2026-11-06" });
  assert.equal(fresh.registration, undefined, "a fresh source can clear the full state");
});
