import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cleanTitle, cleanVenue, fetchStanfordEvents, polishDescription } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-16-stanford.json", import.meta.url)));

test("Stanford's sparse API retains the reviewed free admission after intake and cached publication", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T03:00:00Z") });
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: fixture.sourceEvents.map(event => ({ event })) });
  });
  const rows = await fetchStanfordEvents();
  assert.equal(rows.length, 2);
  for (const row of rows) {
    row.title = cleanTitle(row.title).replace(/\s+/g, " ").trim();
    row.description = polishDescription(row.description);
    await resolveEventBlurbs([row], { enabled: false });
    assert.equal(row.cost, "free");
    assert.deepEqual(applyVerifiedEventFacts(row), row);
    if (row.virtual) {
      assert.equal(row.venue, "Online (Zoom)");
      assert.equal(row.address, "");
      assert.equal(row.registration, "required");
      assert.match(row.attendanceNote, /In-person attendance is limited to current Stanford/);
    } else {
      assert.equal(row.venue, "Stanford Graduate School of Business");
      assert.equal(row.address, "", "a display cleanup must not invent a separate address");
    }
  }
});

test("sparse published cards regain admission without changing their other sourced facts", async () => {
  for (const original of fixture.events) {
    const event = { ...original, venue: cleanVenue(original.venue) };
    const expected = { ...event, cost: "free" };
    await resolveEventBlurbs([event], { enabled: false });
    assert.deepEqual(event, expected);
  }
});

test("dated admission evidence yields to changed occurrences, prose and explicit prices", () => {
  for (const original of fixture.events) {
    const reviewed = { ...original, venue: cleanVenue(original.venue) };
    for (const change of [
      { date: "2027-11-16" }, { time: "2:00 PM" }, { endTime: "6:30 PM" },
      { source: "Another organizer" }, { url: "https://example.org/new-event" },
      { title: "Another program" }, { venue: "Another venue" },
      { description: "Updated organizer admission terms." },
      { cost: "paid" }, { costNote: "Free for members only." },
    ]) {
      const changed = { ...reviewed, ...change };
      assert.deepEqual(applyVerifiedEventFacts(changed), changed);
    }
  }
});

test("free admission does not reopen full or closed registration", () => {
  for (const original of fixture.events) {
    for (const registration of ["required", "full", "closed"]) {
      const event = {
        ...original, venue: cleanVenue(original.venue), registration,
        attendanceStatus: "needs-confirmation", attendanceNote: "Current organizer notice.",
      };
      assert.deepEqual(applyVerifiedEventFacts(event), { ...event, cost: "free" });
    }
  }
});
