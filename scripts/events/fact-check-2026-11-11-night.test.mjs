import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchInboundEvents } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";

const { events } = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-11-night.json", import.meta.url)));
const asInbound = event => ({
  title: event.title,
  startsAt: `${event.date}T${event.date === "2026-12-11" ? "16:00" : event.date === "2026-11-11" ? "19:30" : "19:00"}:00-08:00`,
  ...(event.endTime ? { endsAt: `${event.date}T20:00:00-08:00` } : {}),
  sourceUrl: event.url, location: event.address, description: event.description,
  cityKey: event.city,
});

test("the real newsletter path and cached publication retain sourced classifications and adult entry terms", async () => {
  const ingested = fetchInboundEvents({ events: events.map(asInbound), today: "2026-11-11" });
  assert.equal(ingested.length, 3);
  await resolveEventBlurbs(ingested, { enabled: false });
  const museum = ingested.find(event => event.city === "los-gatos");
  const poetry = ingested.find(event => event.city === "palo-alto");
  assert.equal(museum.kidFriendly, true);
  assert.equal(museum.date, "2026-12-11");
  assert.equal(museum.time, "4:00 PM");
  assert.equal(museum.endTime, "8:00 PM");
  assert.equal(poetry.category, "arts");
  assert.equal(poetry.time, "7:00 PM");
  const comedy = ingested.find(event => event.city === "san-jose");
  assert.equal(comedy.audienceAge, "adult");
  assert.equal(comedy.kidFriendly, false);
  assert.match(comedy.attendanceNote, /Ages 18\+.*Two-item minimum/);
  assert.equal(comedy.time, "7:30 PM");
  assert.equal(comedy.cost, null, "the old ticket price is not a current quote");
});

test("retained cards keep their admission, age scope, copy and later booking state when classification is repaired", async () => {
  const rows = events.map(event => ({ ...event, registration: "closed", attendanceNote: "Registration is now closed." }));
  await resolveEventBlurbs(rows, { enabled: false });
  for (let index = 0; index < rows.length; index++) {
    const before = events[index], after = rows[index];
    const correctedKey = before.city === "los-gatos" ? "kidFriendly" : before.city === "san-jose" ? "audienceAge" : "category";
    for (const key of Object.keys(before).filter(key => key !== correctedKey)) assert.deepEqual(after[key], before[key], `preserve ${key}`);
    assert.equal(after.registration, "closed");
    assert.ok(after.attendanceNote.startsWith("Registration is now closed."));
    if (before.city === "san-jose") assert.match(after.attendanceNote, /Ages 18\+.*Two-item minimum/);
    else assert.equal(after.attendanceNote, "Registration is now closed.");
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
  const comedy = events.find(event => event.city === "san-jose");
  for (const change of [
    { sourceAudiences: ["Adults, ages 21+"] },
    { attendanceNote: "All ages welcome." },
    { description: "Three-item minimum purchase per person." },
  ]) {
    const newerTerms = { ...comedy, ...change };
    assert.deepEqual(applyVerifiedEventFacts(newerTerms), newerTerms, "new source entry terms outrank retained conditions");
  }
});

test("Open Mic's retained entry note survives audience reclassification on later refreshes", async () => {
  const original = events.find(event => event.city === "san-jose");
  const event = applyVerifiedEventFacts(original);
  const verified = { ...event };

  // Refreshes revisit already corrected rows. Generic audience inference has
  // only the sparse newsletter description, while the entry note is retained.
  for (let refresh = 0; refresh < 3; refresh++) {
    event.audienceAge = classifyAudienceAge(event);
    await resolveEventBlurbs([event], { enabled: false });
    assert.deepEqual(event, verified);
  }
  assert.equal(event.audienceAge, "adult");
  assert.equal(event.attendanceNote, "Ages 18+. Two-item minimum purchase per person.");

  for (const change of [
    { sourceAudiences: ["Adults, ages 21+"] },
    { attendanceNote: `${event.attendanceNote} All ages welcome.` },
    { description: "Three-item minimum purchase per person." },
  ]) {
    const newerTerms = { ...event, ...change, audienceAge: "all" };
    assert.deepEqual(applyVerifiedEventFacts(newerTerms), newerTerms);
  }
});
