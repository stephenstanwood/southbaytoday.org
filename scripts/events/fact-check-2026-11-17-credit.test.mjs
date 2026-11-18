import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchStanfordEvents } from "../generate-events.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-17-credit.json", import.meta.url)));
const admission = "Free without CE credit; $65 with CE credit.";

async function ingest(t, overrides = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T13:00:00Z") });
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: [{ event: { ...fixture.sourceEvent, ...overrides } }] });
  });
  const [event] = await fetchStanfordEvents();
  return event;
}

test("Stanford's captured course distinguishes free attendance from optional CE credit", async t => {
  const event = await ingest(t);
  assert.equal(event.cost, "free");
  assert.equal(event.costNote, admission);
  assert.equal(event.attendanceNote, admission);
  assert.equal(event.date, "2026-11-18");
  assert.equal(event.time, "8:30 AM");
  assert.equal(event.endTime, "2:00 PM");
  assert.equal(event.virtual, true);
  assert.equal(event.registration, undefined, "a registration link alone does not prove a mandatory gate");
  assert.doesNotMatch(event.description, /No CE Credit/, "admission must survive the short excerpt");
});

test("a revised source credit price is read rather than frozen at $65", async t => {
  const event = await ingest(t, {
    ticket_cost: "Free–$85",
    description: fixture.sourceEvent.description.replace("$65", "$85"),
  });
  assert.equal(event.cost, "free");
  assert.equal(event.costNote, "Free without CE credit; $85 with CE credit.");
  assert.equal(event.attendanceNote, event.costNote);
});

for (const [name, overrides] of [
  ["conflicting current ticket price", { ticket_cost: "$80" }],
  ["conditional free attendance", { description: fixture.sourceEvent.description.replace(": Free<br", ": Free for Stanford affiliates<br") }],
  ["paid attendance without credit", { description: fixture.sourceEvent.description.replace(": Free<br", ": $20<br") }],
  ["missing labelled credit price", { description: fixture.sourceEvent.description.replace("CE Credit: $65", "CE Credit available") }],
]) {
  test(`${name} does not establish unrestricted free admission`, async t => {
    const event = await ingest(t, overrides);
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.cost, "paid");
    assert.equal(event.costNote, undefined);
  });
}

test("free attendance preserves a current closed-registration notice", async t => {
  const event = await ingest(t, { custom_fields: { banner_text: "Registration is closed." } });
  assert.equal(event.cost, "free");
  assert.equal(event.registration, "closed");
  assert.match(event.attendanceNote, /Registration is closed/);
});

test("current admission tiers survive blurb publication without reopening registration", async t => {
  const generated = await ingest(t);
  for (const registration of [undefined, "required", "full", "closed"]) {
    const event = { ...generated, ...(registration ? { registration } : {}) };
    const expected = { ...event, cost: "free", costNote: admission };
    await resolveEventBlurbs([event], { enabled: false });
    assert.deepEqual(event, expected);
  }
});
