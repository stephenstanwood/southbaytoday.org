import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-13-morning.json", import.meta.url)));
const original = fixture.events.find(event => event.title === "Pablo Cruise");
const urls = ["https://my.montalvoarts.org/3135/3153", "https://montalvoarts.org/experience/carriage-house-concerts/pablo-cruise/"];

test("Pablo Cruise keeps its concert category and physical ZIP through either organizer URL", async () => {
  for (const url of urls) {
    const source = { ...original, url, category: "arts", address: "15400 Montalvo Rd, Saratoga, CA 95071", registration: "full", attendanceNote: "Check current availability with the box office." };
    const before = structuredClone(source);
    const actual = applyVerifiedEventFacts(source);
    assert.deepEqual(source, before);
    assert.equal(actual.category, "music");
    assert.equal(actual.address, "15400 Montalvo Rd, Saratoga, CA 95070");
    for (const key of Object.keys(source)) {
      if (!["category", "address"].includes(key)) assert.deepEqual(actual[key], source[key], key);
    }
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    const cached = structuredClone(source);
    await resolveEventBlurbs([cached], { enabled: false });
    assert.equal(cached.category, "music");
    assert.equal(cached.address, actual.address);
  }
});

test("the dated Pablo Cruise repair preserves changed source identities and locations", () => {
  for (const url of urls) {
    const source = { ...original, url, category: "arts", address: "15400 Montalvo Rd, Saratoga, CA 95071" };
    for (const change of [
      { date: "2027-11-20" }, { title: "Another concert" },
      { time: "8:00 PM" }, { venue: "Another venue" },
      { address: "Another confirmed physical location" }, { virtual: true },
      { source: "Another organizer" }, { url: "https://example.org/a-different-event" },
    ]) {
      const other = { ...source, ...change };
      assert.deepEqual(applyVerifiedEventFacts(other), other);
    }
  }
});
