import assert from "node:assert/strict";
import test from "node:test";
import { fetchMexicanHeritagePlazaEvents } from "../generate-events.mjs";
import { fetchMhpItems, parseMhpCalendar, parseMhpDetail, MHP_CALENDAR_URL } from "./mexican-heritage-plaza-events.mjs";

// The October 23 calendar preview repeated Avenida de Altares; the dated
// Fiesta Navideña detail page has its own holiday program and free concert.
const url = `${MHP_CALENDAR_URL}/avenida26-8yrsy`;
const listing = { title: "Fiesta Navideña", date: "2026-12-12", url };
const calendar = `<div class="eventlist--upcoming">
  <article class="eventlist-event eventlist-event--upcoming">
    <a href="${url}" class="eventlist-title-link">Fiesta Navideña</a>
    <time class="event-date" datetime="2026-12-12">December 12</time>
    <div class="eventlist-excerpt">October 31: Avenida de Altares, with altars.</div>
  </article></div>`;
const detail = `<script type="application/ld+json">${JSON.stringify({
  "@type": "Event", name: "Free Family-Friendly Holiday Event San Jose: Fiesta Navideña — MHP",
  startDate: "2026-12-12T17:30:00-0800", endDate: "2026-12-12T21:30:00-0800",
  location: { name: "School of Arts and Culture at MHP" },
})}</script>
<h1 class="eventitem-title">Fiesta Navideña</h1>
<div class="eventitem-column-content">
  <div class="sqs-html-content"><p>A free live concert and posada for all ages.</p></div>
  <style>.sqs-html-content { color: blue; }</style>
  <div class="eventitem-content-footer">Navigation and tags</div>
</div><footer><div class="sqs-html-content">Unrelated footer copy</div></footer>`;

test("MHP reads public HTML details instead of the stale preview or excluded JSON export", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (requested) => {
    requests.push(String(requested));
    assert.ok([MHP_CALENDAR_URL, url].includes(String(requested)));
    return new Response(String(requested) === MHP_CALENDAR_URL ? calendar : detail);
  };
  try {
    const [event] = await fetchMexicanHeritagePlazaEvents({ now: new Date("2026-10-23T20:00:00Z") });
    assert.deepEqual(requests, [MHP_CALENDAR_URL, url]);
    assert.equal(event.title, "Fiesta Navideña");
    assert.equal(event.date, "2026-12-12");
    assert.equal(event.time, "5:30 PM");
    assert.equal(event.endTime, "9:30 PM");
    assert.equal(event.venue, "School of Arts and Culture at MHP");
    assert.equal(event.cost, "free");
    assert.equal(event.kidFriendly, true);
    assert.equal(event.description, "A free live concert and posada for all ages.");
  } finally { globalThis.fetch = originalFetch; }
});

test("MHP requires a dated public occurrence and matching detail metadata", () => {
  assert.deepEqual(parseMhpCalendar(calendar, "2026-10-23"), [listing]);
  assert.deepEqual(parseMhpCalendar(calendar, "2026-12-13"), []);
  assert.throws(() => parseMhpCalendar("<p>Temporary error</p>", "2026-10-23"), /not recognized/);
  assert.throws(() => parseMhpCalendar(calendar.replace(url, "https://elsewhere.test/other"), "2026-10-23"), /public detail/);
  assert.throws(() => parseMhpCalendar(calendar.replace('datetime="2026-12-12"', ""), "2026-10-23"), /missing/);
  assert.throws(() => parseMhpDetail(detail, { ...listing, date: "2026-12-13" }), /incomplete/);
  assert.equal(parseMhpDetail(detail.replace("sqs-html-content", "other-content"), listing).body, "");
  assert.throws(() => parseMhpDetail(detail.replace("eventitem-column-content", "other-content"), listing), /incomplete/);
  assert.throws(() => parseMhpDetail(detail, { ...listing, title: "Other event" }), /title mismatch/);
});

test("MHP fetch and parser failures remain failures rather than successful empty feeds", async () => {
  await assert.rejects(fetchMhpItems({ fetchImpl: async () => new Response("Denied", { status: 403 }) }), /HTTP 403/);
  await assert.rejects(fetchMhpItems({ fetchImpl: async () => new Response("<p>Challenge</p>") }), /not recognized/);
});

test("Mercadito's dated headings identify a community grocery distribution", async (t) => {
  const mercaditoUrl = `${MHP_CALENDAR_URL}/mercadito-november-25`;
  const mercaditoDetail = detail
    .replaceAll("Fiesta Navideña", "Mercadito")
    .replace("2026-12-12T17:30:00", "2026-11-25T12:00:00")
    .replace("2026-12-12T21:30:00", "2026-11-25T14:00:00")
    .replace("<p>A free live concert and posada for all ages.</p>",
      "<h1>Free food distribution</h1><h1>Walk-up | En persona de 12-2 PM</h1><h2>Line starts at 11 AM</h2>");
  const mercaditoCalendar = calendar.replace(url, mercaditoUrl).replace("Fiesta Navideña", "Mercadito")
    .replace('datetime="2026-12-12"', 'datetime="2026-11-25"');
  t.mock.method(globalThis, "fetch", async (requested) => {
    if (requested === MHP_CALENDAR_URL) return new Response(mercaditoCalendar);
    assert.equal(requested, mercaditoUrl);
    return new Response(mercaditoDetail);
  });

  const [event] = await fetchMexicanHeritagePlazaEvents({ now: new Date("2026-11-23T12:00:00Z") });
  assert.equal(event.title, "Mercadito");
  assert.equal(event.category, "community");
  assert.equal(event.cost, "free");
  assert.equal(event.time, "12:00 PM");
  assert.equal(event.endTime, "2:00 PM");
  assert.equal(event.description, "Pick up free groceries at this walk-up distribution. The line starts at 11 AM.");

  const withoutQueue = parseMhpDetail(mercaditoDetail.replace("<h2>Line starts at 11 AM</h2>", ""),
    { title: "Mercadito", date: "2026-11-25", url: mercaditoUrl });
  assert.equal(withoutQueue.excerpt, "Pick up free groceries at this walk-up distribution.");
});
