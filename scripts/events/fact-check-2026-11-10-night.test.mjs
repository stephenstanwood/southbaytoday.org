import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cleanTitle, fetchInboundEvents, fetchStanfordEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-10-night.json", import.meta.url)));
const event = id => fixture.events.find(e => e.id === id);

test("newsletter ingestion and cached publication retain CEEF's race admission and initials", async () => {
  const before = event("inbound-c6a64d24d9f5667f");
  const [actual] = fetchInboundEvents({ today: "2026-11-10", events: [{
    id: "race-source", title: before.title, description: before.description,
    startsAt: "2027-03-20T08:30:00-07:00", location: before.venue,
    cityKey: before.city, sourceUrl: before.url,
  }] });
  await resolveEventBlurbs([actual], { enabled: false });
  assert.equal(actual.title, "CEEF & CUSD Run for Great Schools 5K + Kids Dash");
  assert.equal(actual.cost, "paid");
  assert.match(actual.costNote, /5K \$35; Kids Dash \$15; family of four \$90, plus card fees/);
  assert.match(actual.costNote, /Prices increase February 14/);
  assert.match(actual.attendanceNote, /age 5 and younger/);
  assert.equal(actual.date, "2027-03-20");
  assert.equal(actual.time, "8:30 AM");
  for (const registration of ["full", "closed", "appointment"]) {
    const retained = applyVerifiedEventFacts({ ...before, registration, attendanceNote: "Later organizer notice." });
    assert.equal(retained.registration, registration);
    assert.match(retained.attendanceNote, /^Later organizer notice\./);
    assert.deepEqual(applyVerifiedEventFacts(retained), retained);
  }
});

test("paid concerts and the free privacy workshop keep source admission without guessed booking gates", async () => {
  const ids = ["inbound-20ab15b59bf74057", "inbound-b0382cebabec4e42", "sjsu-edadee733d36a8e0"];
  const events = ids.map(id => structuredClone(event(id)));
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "paid");
  assert.match(events[0].costNote, /Standard \$47.*student \$30/);
  assert.equal(events[1].cost, "paid");
  assert.equal(events[1].costNote, undefined, "no unverified price floor");
  assert.equal(events[2].cost, "free");
  assert.equal(events[2].endTime, "12:00 PM");
  for (let i = 0; i < events.length; i++) {
    assert.equal(events[i].registration, undefined);
    for (const key of ["id", "date", "time", "venue", "url"]) assert.equal(events[i][key], event(ids[i])[key], key);
    assert.deepEqual(applyVerifiedEventFacts(events[i]), events[i]);
  }
});

test("the verified corrections do not transfer to another date, source, or venue", () => {
  for (const id of ["inbound-c6a64d24d9f5667f", "inbound-20ab15b59bf74057", "sjsu-edadee733d36a8e0"]) {
    for (const change of [{ date: "2028-11-10" }, { url: "https://example.org/unrelated" }, { venue: "Another venue" }]) {
      const other = { ...structuredClone(event(id)), ...change };
      assert.deepEqual(applyVerifiedEventFacts(other), other);
    }
  }
});

test("Stanford's weekday farm variant preserves current age, guardian, and waiver terms before truncation", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-10T09:07:06Z") });
  const schema = fixture.farmSchema;
  const makeEvent = (id, description) => ({ event: {
    id, title: schema.name, description_text: description,
    location_name: schema.location.name, address: schema.location.address,
    localist_url: schema.url, experience: "inperson",
    filters: { event_audience: [{ name: "Everyone" }] },
    first_date: "2026-11-11", last_date: "2026-11-11",
    event_instances: [{ event_instance: { start: schema.startDate, end: schema.endDate } }],
  } });
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: [
      makeEvent(51888083181057, schema.description),
      makeEvent(2, schema.description.replace("10 years old and older", "12 years old and older")
        .replace("between 10 and 14 years old", "between 12 and 15 years old")),
      makeEvent(3, "Volunteers help keep the farm running. No minimum age is stated."),
    ] });
  });
  const [actual, changed, unspecified] = await fetchStanfordEvents();
  assert.match(actual.attendanceNote, /10 years old and older/);
  assert.match(actual.attendanceNote, /between 10 and 14 years old.*guardian actively volunteering/);
  assert.match(actual.attendanceNote, /safety waiver on arrival/);
  assert(!actual.description.includes("guardian"), "terms follow the display excerpt");
  assert.equal(actual.time, "9:00 AM");
  assert.equal(actual.endTime, "12:00 PM");
  assert.match(changed.attendanceNote, /12 years old and older/);
  assert.match(changed.attendanceNote, /between 12 and 15 years old/);
  assert.equal(unspecified.attendanceNote, undefined, "missing source terms stay unknown");
  await resolveEventBlurbs([actual], { enabled: false });
  assert.match(actual.attendanceNote, /guardian actively volunteering/);
  assert.match(actual.attendanceNote, /safety waiver on arrival/);
});

test("the film's BLKNWS initials survive repeated display and cache normalization", async () => {
  const before = event("stanford-54241742757329-2026-11-10");
  const actual = structuredClone(before);
  actual.title = cleanTitle(actual.title);
  await resolveEventBlurbs([actual], { enabled: false });
  assert.match(actual.description, /BLKNWS: Pilgrim/);
  assert.match(actual.blurb, /BLKNWS: Pilgrim/);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const key of ["id", "date", "time", "endTime", "venue", "url", "cost"]) assert.equal(actual[key], before[key], key);
});
