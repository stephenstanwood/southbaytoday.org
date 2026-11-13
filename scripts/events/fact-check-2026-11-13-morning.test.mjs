import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchStanfordEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-13-morning.json", import.meta.url)));

test("the real Stanford adapter uses the declared defense format and retains Everyone eligibility", async t => {
  const date = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const event = {
    ...fixture.stanfordSource, id: 987654321,
    first_date: date, last_date: date,
    event_instances: [{ event_instance: { start: `${date}T13:00:00-08:00`, end: null } }],
  };
  // Use the sparse collection shape: a missing abstract must not classify an
  // academic defense as arts or establish paid/campus-only admission.
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ events: [{ event }] })));
  const [actual] = await fetchStanfordEvents();
  assert.ok(actual, "Everyone is an explicit public audience");
  assert.equal(actual.category, "education");
  assert.equal(actual.cost, null);
  assert.equal(actual.venue, "Clark Center");
  assert.equal(actual.date, date);
});

test("cached publication repairs the three source-confirmed categories and the Montalvo ZIP", async () => {
  for (const original of fixture.events) {
    const event = structuredClone(original);
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.category, original.source === "Stanford Events" ? "education" : "music");
    if (event.title === "The Smithereens") assert.equal(event.address, "15400 Montalvo Rd, Saratoga, CA 95070");
    for (const field of Object.keys(original)) {
      if (!["category", "address"].includes(field)) assert.deepEqual(event[field], original[field], field);
    }
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

test("dated category repairs preserve source objects and later attendance notices, clocks and venues", () => {
  for (const original of fixture.events) {
    const source = { ...original, id: "regenerated-source-id", cost: "paid", registration: "full", attendanceNote: "Confirm current availability." };
    const before = structuredClone(source);
    const actual = applyVerifiedEventFacts(source);
    assert.deepEqual(source, before);
    for (const field of ["id", "cost", "registration", "attendanceNote"]) assert.equal(actual[field], source[field]);
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    for (const change of [
      { date: "2028-11-13" }, { source: "Another organizer" },
      { url: "https://example.org/another-event" }, { title: "Another event" },
      { venue: "Another venue" }, { time: "2:00 PM" }, { virtual: true },
    ]) {
      const other = { ...source, ...change };
      assert.deepEqual(applyVerifiedEventFacts(other), other);
    }
  }
  const relocated = { ...fixture.events.find(event => event.title === "The Smithereens"), address: "A new organizer-confirmed location" };
  assert.deepEqual(applyVerifiedEventFacts(relocated), relocated);
});
