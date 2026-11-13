import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchStanfordEvents } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-12-evening.json", import.meta.url)));
const response = (...events) => ({ events: events.map(event => ({ event })) });

test("Stanford's Our Town performance keeps its confirmed curtain and discloses the conflicting finish", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-12T23:14:23Z") });
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), fixture.sourceUrl);
    return Response.json(response(fixture.performance));
  });
  const [event] = await fetchStanfordEvents();
  assert.equal(event.id, "stanford-53763766608135-2026-11-12");
  assert.equal(event.date, "2026-11-12");
  assert.equal(event.time, "8:00 PM");
  assert.equal(event.endTime, "9:30 PM", "the calendar's raw finish is retained until source reconciliation");
  assert.equal(event.ongoing, false);
  assert.equal(event.category, "arts");
  assert.equal(event.venue, fixture.publishedPerformance.venue);
  assert.equal(event.url, fixture.publishedPerformance.url);
  assert.equal(event.cost, fixture.publishedPerformance.cost);
  event.blurb = fixture.publishedPerformance.blurb;
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.time, "8:00 PM");
  assert.equal(event.endTime, null);
  assert.match(event.attendanceNote, /9:30 PM finish.*100-minute runtime/);
  assert.equal(event.ongoing, false);
  assert.match(event.description, /NO LATE SEATING/);
});

test("the performance finish warning preserves later source clocks and stays within the verified run", () => {
  const event = { ...fixture.publishedPerformance, time: "8:00 PM", endTime: "9:30 PM" };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.endTime, null);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  for (const change of [
    { endTime: "9:40 PM" }, { time: "7:00 PM" }, { date: "2026-11-15" },
    { description: "The revised production ends at 9:30 PM." },
    { url: "https://events.stanford.edu/event/another-production" },
  ]) {
    const revised = { ...event, ...change };
    assert.deepEqual(applyVerifiedEventFacts(revised), revised);
  }
});

test("a past performance cannot reappear as an exhibition during the rest of its series", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-13T18:00:00Z") });
  t.mock.method(globalThis, "fetch", async () => Response.json(response(fixture.performance)));
  assert.deepEqual(await fetchStanfordEvents(), []);
});

test("the declared performance format protects other titles and follows a later occurrence's own clock", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-13T18:00:00Z") });
  const event = structuredClone(fixture.performance);
  event.title = "An Artist's Story";
  // Synthetic later occurrence tests propagation, not a new published showtime.
  event.event_instances[0].event_instance.start = "2026-11-13T18:15:00-08:00";
  event.event_instances[0].event_instance.end = "2026-11-13T19:45:00-08:00";
  t.mock.method(globalThis, "fetch", async () => Response.json(response(event)));
  const [actual] = await fetchStanfordEvents();
  assert.equal(actual.id, "stanford-53763766608135-2026-11-13");
  assert.equal(actual.time, "6:15 PM");
  assert.equal(actual.endTime, "7:45 PM");
  assert.equal(actual.ongoing, false);
});

test("the actual Branner exhibition remains an ongoing run with its source visitor-ID requirement", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-12T23:14:23Z") });
  t.mock.method(globalThis, "fetch", async () => Response.json(response(fixture.exhibit)));
  const [actual] = await fetchStanfordEvents();
  assert.equal(actual.id, "stanford-53993437264584");
  assert.equal(actual.date, "2026-11-12");
  assert.equal(actual.ongoing, true);
  assert.equal(actual.time, null);
  assert.equal(actual.endTime, null);
  assert.match(actual.attendanceNote, /physical government-issued photo ID/);
});

test("the drawing workshop's full source charge survives cached publication without changing its schedule", async () => {
  const source = fixture.drawingSourceOffering;
  assert.equal(source.StartDateTime.slice(0, 19), "2026-11-21T10:00:00");
  assert.equal(source.EndDateTime.slice(0, 19), "2026-11-21T16:00:00");
  assert.equal(source.AdvertisedOffers[0].OfferAmount.AmountTaxInclusive, 185);
  const supplies = fixture.drawingSourceTemplate.Description.ContentFields.find(field => field.FieldName === "Supply List");
  assert.match(supplies.Content.Text, /\$10 materials fee due to the instructor at the start of class/);
  const event = structuredClone(fixture.drawingPublished);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.cost, "paid");
  assert.equal(event.costNote, "$185 tuition + $10 materials fee");
  assert.match(event.description, /\$185, plus a \$10 materials fee/);
  assert.equal(event.url.replace("/class/?", "/class?"), source.ViewUri);
  for (const key of ["id", "title", "date", "time", "endTime", "venue", "address", "blurb", "registration", "audienceAge"])
    assert.deepEqual(event[key], fixture.drawingPublished[key], key);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("the drawing fee correction leaves newer prices, source links and other occurrences intact", () => {
  for (const change of [
    { date: "2026-12-21" }, { venue: "Another Art Studio" },
    { description: "One-day drawing workshop led by Robert Dvorak. Cost is $190." },
    { costNote: "$175 member tuition + $10 materials" },
    { url: "https://www.pacificartleague.org/class/?event=another-offering" },
  ]) {
    const event = { ...fixture.drawingPublished, ...change };
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});
