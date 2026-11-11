import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchSjsuEvents } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-11-morning.json", import.meta.url)));
const origin = "https://events.sjsu.edu";
const rss = (events) => `<rss><channel>${events.map(event => `<item><title><![CDATA[${event.title}]]></title><link>${event.localist_url}</link><description>Public program.</description><pubDate>${event.start}</pubDate></item>`).join("")}</channel></rss>`;

test("SJSU preserves the two organizer-published November 18 finishes through cached publication", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-11T10:07:06Z") });
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    calls.push(String(url));
    if (String(url) === `${origin}/calendar.xml`) return new Response(rss(fixture.sjsu.map(event => ({
      ...event, start: event.event_instances[0].event_instance.start,
    }))));
    assert.equal(new URL(url).pathname, "/api/2/events");
    return Response.json({ page: { total: 1 }, events: fixture.sjsu.map(event => ({ event })) });
  });
  const events = await fetchSjsuEvents();
  assert.equal(events.length, 2);
  assert.equal(calls.length, 2, "reuse the existing RSS and metadata requests");
  await resolveEventBlurbs(events, { enabled: false });
  for (const event of events) {
    assert.equal(event.date, "2026-11-18");
    assert.equal(event.endTime, "1:00 PM");
    const before = fixture.events.find(row => row.url === event.url);
    assert.equal(event.time, before.time);
    assert.equal(event.cost, before.cost, "a finish cannot imply admission");
    assert.equal(event.registration, before.registration);
  }
});

test("repeated URLs retain distinct finishes across metadata pages and timezone spellings", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-11T10:07:06Z") });
  const url = `${origin}/event/public-art-workshop`;
  const instances = [
    { start: "2026-11-18T12:00:00-08:00", end: "2026-11-18T13:00:00-08:00" },
    { start: "2026-11-19T12:00:00-08:00", end: "2026-11-19T14:00:00-08:00" },
  ];
  t.mock.method(globalThis, "fetch", async input => {
    if (String(input) === `${origin}/calendar.xml`) return new Response(rss(instances.map(instance => ({
      title: "Public art workshop", localist_url: url, start: new Date(instance.start).toISOString(),
    }))));
    const page = Number(new URL(input).searchParams.get("page"));
    return Response.json({ page: { total: 2 }, events: [{ event: {
      localist_url: url, location_name: "King Library", experience: "inperson",
      event_instances: [{ event_instance: instances[page - 1] }],
    } }] });
  });
  const events = await fetchSjsuEvents();
  assert.deepEqual(events.map(event => [event.date, event.time, event.endTime]), [
    ["2026-11-18", "12:00 PM", "1:00 PM"],
    ["2026-11-19", "12:00 PM", "2:00 PM"],
  ]);
});

test("missing, other-occurrence, all-day, conflicting and implausible finishes stay unknown", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-11T10:07:06Z") });
  const start = "2026-11-18T12:00:00-08:00";
  const valid = { start, end: "2026-11-18T13:00:00-08:00" };
  const cases = [
    [], [{ start }], [{ start, end: "invalid" }],
    [{ ...valid, start: "2026-11-19T12:00:00-08:00" }],
    [{ ...valid, all_day: true }],
    [valid, { start, end: "2026-11-18T14:00:00-08:00" }],
    [{ start, end: "2026-11-18T11:00:00-08:00" }],
    [{ start, end: "2026-11-19T13:00:00-08:00" }],
  ];
  const rows = cases.map((instances, index) => ({
    title: `Public art workshop ${index}`, localist_url: `${origin}/event/workshop-${index}`,
    start, location_name: "King Library", event_instances: instances.map(event_instance => ({ event_instance })),
  }));
  t.mock.method(globalThis, "fetch", async input => String(input) === `${origin}/calendar.xml`
    ? new Response(rss(rows)) : Response.json({ page: { total: 1 }, events: rows.map(event => ({ event })) }));
  const events = await fetchSjsuEvents();
  assert.equal(events.length, cases.length);
  assert.ok(events.every(event => event.time === "12:00 PM" && event.endTime === null));
});

test("the two captured ESL occurrences distinguish practiced English from Vietnamese-speaking staff", async () => {
  const events = fixture.events.filter(event => event.id.startsWith("sjpl-")).map(event => structuredClone(event));
  await resolveEventBlurbs(events, { enabled: false });
  for (const event of events) {
    const source = fixture.library.find(row => event.id === `sjpl-${row.id}`);
    assert.match(source.definition.description, /staff who can speak Vietnamese/);
    assert.match(event.blurb, /Practice beginner English conversation with library staff who speak Vietnamese/);
    for (const field of ["date", "time", "endTime", "url", "cost", "registration", "registrationClosesBy"])
      assert.deepEqual(event[field], fixture.events.find(row => row.id === event.id)[field], field);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    for (const changes of [{ date: "2028-11-14" }, { url: "https://example.org/another-class" }]) {
      const other = { ...fixture.events.find(row => row.id === event.id), ...changes };
      assert.deepEqual(applyVerifiedEventFacts(other), other, "do not project an unverified occurrence");
    }
  }
});
