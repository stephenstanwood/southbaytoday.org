import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchSjsuEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/sjsu-public-scholar-2026-11-13.json", import.meta.url)));

test("the SJSU refresh retains the public-scholar conversation's mandatory preregistration", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-04T03:07:00-08:00") });
  assert.match(fixture.structuredEvent.description, /pre-registration is required/);
  const item = fixture.rss;
  const xml = `<rss><channel><item><title><![CDATA[${item.title}]]></title><description><![CDATA[${item.description}]]></description><pubDate>${item.pubDate}</pubDate><link>${item.link}</link></item></channel></rss>`;
  t.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://events.sjsu.edu");
    if (request.pathname === "/calendar.xml") return new Response(xml);
    assert.equal(request.pathname, "/api/2/events");
    return Response.json({ page: { total: 1 }, events: [{ event: {
      localist_url: item.link, experience: "virtual", filters: {},
    } }] });
  });
  const [event] = await fetchSjsuEvents();
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.date, "2026-11-13");
  assert.equal(fixed.time, "12:00 PM");
  assert.equal(fixed.virtual, true);
  assert.equal(fixed.registration, "required");
  assert.equal(requiresAdvanceRegistration(fixed), true);
  assert.match(fixed.attendanceNote, /Pre-registration is required/);
  assert.match(fixed.attendanceNote, /organizer's linked form/);
  const events = [{ ...event }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required", "the normal refresh path preserves the requirement");
  assert.equal(events[0].attendanceNote, fixed.attendanceNote);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const registration of ["closed", "full", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
  }
  for (const unrelated of [
    { ...event, date: "2027-11-13" },
    { ...event, url: "https://events.sjsu.edu/event/another-conversation" },
  ]) assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  for (const key of Object.keys(event).filter(key => !["registration", "attendanceNote"].includes(key))) {
    assert.deepEqual(fixed[key], event[key], key);
  }
});
