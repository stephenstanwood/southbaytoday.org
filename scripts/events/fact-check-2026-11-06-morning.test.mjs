import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanTitle, fetchStanfordEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-06-morning.json", import.meta.url)));

test("the Early Childhood Institute keeps its source-published ECI initials", () => {
  const { schema, publishedBefore } = fixture.eci;
  assert.match(schema.description, /Early Childhood Institute/);
  assert.equal(cleanTitle(schema.name), schema.name);
  assert.equal(cleanTitle(cleanTitle(schema.name)), schema.name);
  assert.equal(applyVerifiedEventFacts(publishedBefore).title, schema.name);
  assert.equal(cleanTitle("Eci is a source-spelled name"), "Eci is a source-spelled name");
});

test("Stanford preserves the farm's source eligibility before shortening the description", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-06T10:07:01Z") });
  const { schema } = fixture.farm;
  const makeEvent = (id, description) => ({ event: {
    id, title: schema.name, description_text: description,
    location_name: schema.location.name, address: schema.location.address,
    localist_url: schema.url, experience: "inperson",
    filters: { event_audience: [{ name: "Everyone" }] },
    first_date: "2026-11-07", last_date: "2026-11-07",
    event_instances: [{ event_instance: { start: schema.startDate, end: schema.endDate } }],
  } });
  const changedAges = schema.description.replace("10 years old and older", "12 years old and older")
    .replace("between 10 and 14 years old", "between 12 and 15 years old");
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: [
      makeEvent(47557682677329, schema.description),
      makeEvent(2, "Volunteers help keep the farm running. No minimum age is stated."),
      makeEvent(3, changedAges),
    ] });
  });
  const [farm, unspecified, changed] = await fetchStanfordEvents();
  assert.match(farm.attendanceNote, /10 years old and older/);
  assert.match(farm.attendanceNote, /between 10 and 14 years old.*guardian actively volunteering/);
  assert(!farm.description.includes("guardian"), "eligibility is beyond the display excerpt");
  assert.equal(farm.time, "9:30 AM");
  assert.equal(farm.endTime, "11:30 AM");
  assert.equal(unspecified.attendanceNote, undefined, "do not invent an age requirement");
  assert.match(changed.attendanceNote, /12 years old and older/);
  assert.match(changed.attendanceNote, /between 12 and 15 years old/);
});

test("cached cards retain the verified farm eligibility and ECI spelling", async () => {
  const events = [fixture.farm.publishedBefore, fixture.eci.publishedBefore].map(e => ({ ...e }));
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].attendanceNote, /10 years old and older/);
  assert.match(events[0].attendanceNote, /guardian actively volunteering/);
  assert.equal(events[1].title, fixture.eci.schema.name);
  for (let i = 0; i < events.length; i++) {
    const before = [fixture.farm, fixture.eci][i].publishedBefore;
    for (const key of ["id", "date", "time", "endTime", "cost", "venue", "url", "virtual"]) {
      assert.equal(events[i][key], before[key], key);
    }
    assert.deepEqual(applyVerifiedEventFacts(events[i]), events[i]);
  }
  assert.equal(applyVerifiedEventFacts({ ...fixture.farm.publishedBefore, date: "2027-11-07" }).attendanceNote, undefined);
  assert.equal(fixture.eci.publishedBefore.title.startsWith("Eci "), true, "retained input stays unchanged");
});
