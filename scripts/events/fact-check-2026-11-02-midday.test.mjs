import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";
import { fetchInboundEvents } from "../generate-events.mjs";

const { events: fixture } = JSON.parse(readFileSync(new URL("../lib/fixtures/mountain-view-attendance-2026-11-02.json", import.meta.url)));
const row = (id) => structuredClone(fixture.find((event) => event.id === id));

test("the new senior-workshop newsletter title retains the reviewed audience and signup conditions", async () => {
  const source = row("inbound-05ef8d77461a6461"), original = structuredClone(source);
  const events = [structuredClone(source)];
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.equal(actual.audienceAge, "adult");
  assert.equal(actual.registration, "required");
  assert.equal(requiresAdvanceRegistration(actual), true);
  assert.match(actual.attendanceNote, /Ages 55\+/);
  assert.match(actual.attendanceNote, /650-903-6330/);
  assert.match(actual.attendanceNote, /Social Hall/);
  for (const key of Object.keys(source)) if (key !== "audienceAge") assert.deepEqual(actual[key], source[key], key);
  assert.deepEqual(source, original);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});

test("all three dated senior-workshop title variants survive the actual newsletter adapter", () => {
  for (const [date, title] of [
    ["2026-11-05", "Advance Care Planning"],
    ["2026-11-12", "Google Translate and Digital Emergency Prep"],
    ["2026-11-19", "Medicare's Annual Enrollment and Updates 2027"],
  ]) {
    const [event] = fetchInboundEvents({ today: "2026-11-02", events: [{
      id: `senior-${date}`, cityKey: "mountain-view", title: `Senior Workshop: ${title}`,
      startsAt: `${date}T13:00:00-08:00`, endsAt: null,
      location: "Social Hall, Mountain View Senior Center, 266 Escuela Avenue, Mountain View, CA",
      description: "Workshop for adults 55+. Sign up in advance.",
      sourceUrl: "https://www.mountainview.gov/our-city/departments/community-services/recreation/senior-center/special-events-workshops",
    }] });
    assert(event);
    const actual = applyVerifiedEventFacts({ ...event, audienceAge: "all" });
    assert.equal(actual.audienceAge, "adult");
    assert.equal(actual.registration, "required");
    assert.equal(actual.time, "1:00 PM");
    assert.equal(actual.endTime, null);
    assert.equal(actual.title, `Senior Workshop: ${title}`);
    for (const registration of ["closed", "full", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
    }
    for (const unrelated of [
      { ...event, date: "2027-11-12" },
      { ...event, venue: "Another Senior Center" },
      { ...event, title: "Another senior workshop" },
    ]) assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  }
});

test("Santa's Workshop retains paid registration, child audience and its room through publication", async () => {
  const source = row("inbound-d27668b3ac273f59"), original = structuredClone(source);
  const events = [structuredClone(source)];
  await resolveEventBlurbs(events, { enabled: false });
  const actual = events[0];
  assert.equal(actual.cost, "paid");
  assert.equal(actual.registration, "required");
  assert.equal(actual.kidFriendly, true);
  assert.equal(actual.audienceAge, "kids");
  assert.match(actual.attendanceNote, /ages 6.*11/i);
  assert.match(actual.attendanceNote, /Redwood Hall/);
  assert.match(actual.costNote, /[Mm]aterial fees.*included/);
  for (const key of Object.keys(source)) if (!["cost", "kidFriendly"].includes(key)) assert.deepEqual(actual[key], source[key], key);
  assert.deepEqual(source, original);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const registration of ["closed", "full", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...source, registration }).registration, registration);
  }
  for (const unrelated of [
    { ...source, date: "2027-12-12" },
    { ...source, url: "https://example.org/another-workshop" },
  ]) assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
});
