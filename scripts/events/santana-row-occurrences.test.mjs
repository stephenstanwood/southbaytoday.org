import assert from "node:assert/strict";
import test from "node:test";

import { deduplicateEventSlots, deduplicateEventTitles } from "../lib/event-url-dedup.mjs";
import { normalizePlaywrightEvent, scrapeSantanaRow } from "../playwright-scrapers.mjs";

const calendar = "https://www.santanarow.com/events/";
const date = "December 1, 2026";
const title = "Spirit of The Row";
const link = "https://santanarow.com/event/spirit-of-the-row/";
const sharedHours = "The first 3 Tuesdays in December from 6pm-8pm.";
const lineup = "Line-Up:Tuesday, December 1• Local dancersTuesday, December 8• Local choirTuesday, December 15• Local band";

function pageFor(excerpt) {
  return {
    goto: async (url) => assert.equal(url, calendar),
    waitForTimeout: async () => {},
    evaluate: async () => [{ date, title, link, excerpt, text: `${date} ${title} ${excerpt} Learn More` }],
  };
}

test("Santana Row keeps the verified series dates after the opening night", async () => {
  const excerpt = sharedHours + lineup;
  const page = pageFor(excerpt);
  const events = (await scrapeSantanaRow(page, { today: "2026-11-28" })).map(normalizePlaywrightEvent);
  assert.deepEqual(events.map(({ date }) => date), ["2026-12-01", "2026-12-08", "2026-12-15"]);
  assert.deepEqual(deduplicateEventTitles(deduplicateEventSlots(events)), events);
  assert.equal(new Set(events.map(({ id }) => id)).size, 3);
  for (const event of events) {
    assert.equal(event.time, "6:00 PM");
    assert.equal(event.endTime, "8:00 PM");
    assert.equal(event.description, excerpt);
    assert.equal(event.occurrenceEvidence.sourceUrl, calendar);
    assert.equal(event.occurrenceEvidence.date, event.date);
  }

  const afterOpening = (await scrapeSantanaRow(page, { today: "2026-12-02" })).map(normalizePlaywrightEvent);
  assert.deepEqual(afterOpening.map(({ id }) => id), events.slice(1).map(({ id }) => id));
});

test("Santana Row uses the card date when the lineup does not confirm the shared schedule", async () => {
  const unconfirmed = pageFor(sharedHours + lineup.replace("December 15", "December 16"));
  const events = await scrapeSantanaRow(unconfirmed, { today: "2026-11-28" });
  assert.deepEqual(events.map(({ date, time, endTime }) => ({ date, time, endTime })), [
    { date: "2026-12-01", time: "6:00 PM", endTime: "8:00 PM" },
  ]);
});
