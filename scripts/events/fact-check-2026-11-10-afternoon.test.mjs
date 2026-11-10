import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchStanfordEvents } from "../generate-events.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-10-afternoon.json", import.meta.url)));

test("Stanford's dated public music performances survive academic biographies and plural recital titles", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.reviewedAt) });
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: fixture.events.map(event => ({ event })) });
  });
  const events = await fetchStanfordEvents();
  assert.equal(events.length, 2);
  for (let i = 0; i < events.length; i++) {
    assert.equal(events[i].category, "music");
    assert.equal(events[i].date, "2026-11-11");
    assert.equal(events[i].url, fixture.events[i].localist_url);
    assert.equal(events[i].venue, fixture.events[i].location_name);
  }
  assert.equal(events[0].time, "12:30 PM");
  assert.equal(events[0].endTime, "1:00 PM", "the current source page, schema and API agree; do not adopt stale search copy");
  assert.equal(events[1].time, "12:15 PM");
  assert.equal(events[1].endTime, "1:15 PM");
});

test("declared music performances do not recategorize lectures or events missing performance evidence", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.reviewedAt) });
  const base = fixture.events[0];
  const variants = [
    { ...base, title: "Music History Lecture" },
    { ...base, filters: { ...base.filters, event_types: [{ name: "Lecture/Presentation/Talk" }] } },
    { ...base, filters: { ...base.filters, event_subject: [] } },
    { ...base, filters: { ...base.filters, event_types: [] } },
    { ...base, title: "Recitals in Music History: Lecture" },
    { ...base, title: "Recitals and Lectures" },
  ];
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: variants.map(event => ({ event })) }));
  const events = await fetchStanfordEvents();
  assert.equal(events.length, variants.length);
  assert(events.every(event => event.category === "education"));
});

test("plural recital titles remain music when a feed omits format tags and mentions a class", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.reviewedAt) });
  const event = { ...fixture.events[1], filters: {}, description_text: "The performer also teaches a class." };
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [{ event }] }));
  const [actual] = await fetchStanfordEvents();
  assert.equal(actual.category, "music");
});
