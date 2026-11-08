import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchInboundEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-08-morning.json", import.meta.url)));

test("newsletter ingestion preserves the verified family filters, fees and public source link", async () => {
  const events = fetchInboundEvents({ events: fixture.inbound, today: "2026-11-08" });
  assert.equal(events.length, 5);
  for (const event of events) {
    const published = fixture.published.find(row => row.id === event.id);
    assert(published, "retain the existing occurrence identity");
    event.blurb = published.blurb;
  }
  await resolveEventBlurbs(events, { enabled: false });
  const named = title => events.find(event => event.title === title);
  const breakfast = named("Breakfast with Santa: Pajama Party");
  const evening = named("Evening with Santa");
  assert.equal(breakfast.kidFriendly, true);
  assert.equal(breakfast.cost, "paid");
  assert.match(breakfast.costNote, /residents \$25; nonresidents \$31/);
  assert.equal(evening.kidFriendly, true);
  assert.equal(evening.category, "family");
  assert.equal(evening.cost, "paid");
  assert.match(evening.costNote, /residents \$20; nonresidents \$25/);
  assert.match(evening.description, /ages 2-12/);
  const corita = named("Corita's Legacy: A Panel Discussion");
  assert.equal(corita.url, "https://paacf.org/event/coritas-legacy-a-panel-discussion/");
  assert.equal(corita.cost, "free");
  assert.equal(corita.registration, undefined, "an RSVP link does not establish a mandatory gate");
  for (const event of events) {
    const published = fixture.published.find(row => row.id === event.id);
    for (const field of ["date", "time", "endTime", "venue", "address", "description", "blurb"]) {
      assert.deepEqual(event[field], published[field], `${event.title}: preserve ${field}`);
    }
    assert.deepEqual(applyVerifiedEventFacts(event), event, "repeated publication is stable");
  }
});

test("the youth party retains grade, residency and membership eligibility without inventing a fee", async () => {
  const source = fixture.published.find(event => event.title.includes("Grinch Night"));
  const [event] = [structuredClone(source)];
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.audienceAge, "kids", "teen programming must not enter adult plans as all-ages");
  assert.equal(event.kidFriendly, true);
  assert.match(event.attendanceNote, /Mountain View and Los Altos students in grades 6–12/);
  assert.match(event.attendanceNote, /membership is required for activity registration/);
  assert.equal(event.cost, null, "general free membership does not establish this activity's fee");
  assert.equal(event.registration, undefined, "the newsletter's Register link does not establish a mandatory gate");
});

test("the dated Korematsu gathering remains community programming with its verified museum offer", async () => {
  const source = fixture.published.find(event => event.title.startsWith("Fred T."));
  const event = structuredClone(source);
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.category, "community");
  assert.equal(event.cost, "free");
  assert.equal(event.date, "2027-01-23");
  assert.equal(event.time, "1:00 PM");
  assert.equal(event.endTime, "3:00 PM");
  assert.match(event.description, /museum of san jose offers free admission that day/i);
  assert.equal(applyVerifiedEventFacts({ ...source, url: source.url.split("?")[0] }).cost, "free");
});

test("dated newsletter repairs cannot alter other occurrences or overwrite later availability", () => {
  for (const source of fixture.published) {
    for (const other of [
      { ...source, date: "2028-12-12" },
      { ...source, url: "https://example.org/unrelated" },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other, source.title);
    for (const registration of ["full", "closed", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...source, registration }).registration, registration);
    }
  }
  const corita = fixture.published.find(event => event.title.startsWith("Corita"));
  assert.deepEqual(applyVerifiedEventFacts({ ...corita, venue: "Another Art Center" }), { ...corita, venue: "Another Art Center" });
});
