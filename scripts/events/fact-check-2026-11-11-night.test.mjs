import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchInboundEvents } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const { events } = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-11-night.json", import.meta.url)));
const asInbound = event => ({
  title: event.title,
  startsAt: `${event.date}T${event.date === "2026-12-11" ? "16:00" : "19:00"}:00-08:00`,
  ...(event.endTime ? { endsAt: `${event.date}T20:00:00-08:00` } : {}),
  sourceUrl: event.url, location: event.address, description: event.description,
  cityKey: event.city,
});

test("the real newsletter path and cached publication retain the museum's family eligibility and poetry's arts category", async () => {
  const ingested = fetchInboundEvents({ events: events.map(asInbound), today: "2026-11-11" });
  assert.equal(ingested.length, 2);
  await resolveEventBlurbs(ingested, { enabled: false });
  const museum = ingested.find(event => event.city === "los-gatos");
  const poetry = ingested.find(event => event.city === "palo-alto");
  assert.equal(museum.kidFriendly, true);
  assert.equal(museum.date, "2026-12-11");
  assert.equal(museum.time, "4:00 PM");
  assert.equal(museum.endTime, "8:00 PM");
  assert.equal(poetry.category, "arts");
  assert.equal(poetry.time, "7:00 PM");
});

test("retained cards keep their admission, age scope, copy and later booking state when classification is repaired", async () => {
  const rows = events.map(event => ({ ...event, registration: "closed", attendanceNote: "Registration is now closed." }));
  await resolveEventBlurbs(rows, { enabled: false });
  for (let index = 0; index < rows.length; index++) {
    const before = events[index], after = rows[index];
    const correctedKey = before.city === "los-gatos" ? "kidFriendly" : "category";
    for (const key of Object.keys(before).filter(key => key !== correctedKey)) assert.deepEqual(after[key], before[key], `preserve ${key}`);
    assert.equal(after.registration, "closed");
    assert.equal(after.attendanceNote, "Registration is now closed.");
    assert.deepEqual(applyVerifiedEventFacts(after), after);
  }
});

test("a dated organizer correction cannot classify another occurrence or an unrelated source", () => {
  for (const event of events) {
    for (const change of [{ date: "2028-12-11" }, { url: "https://example.org/unrelated" }]) {
      const unrelated = { ...event, ...change };
      assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
    }
  }
});
