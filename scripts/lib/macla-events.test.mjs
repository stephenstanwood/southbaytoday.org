import test from "node:test";
import assert from "node:assert/strict";
import { fetchMaclaEvents } from "../generate-events.mjs";

// MACLA's October 19 feed carries a short description and a complete
// content:encoded body. MEC's start clock can be doors, not show time.
async function scrape(t, body, description = "Tickets on sale now!", now = "2026-10-19T13:07:06Z", expectedCount = 1) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(now) });
  const xml = `<?xml version="1.0"?><rss version="2.0"
    xmlns:content="http://purl.org/rss/1.0/modules/content/"
    xmlns:mec="http://webnus.net/rss/mec/"><channel><item>
    <title>MACLA Presents: Diana Gameros in Concert Ft. Magik*Magik</title>
    <link>https://maclaarte.org/events/volveralaluz/</link>
    <description><![CDATA[${description}]]></description>
    <content:encoded><![CDATA[${body}]]></content:encoded>
    <mec:startDate>2026-10-23</mec:startDate><mec:startHour>7:30 pm</mec:startHour>
    <mec:endDate>2026-10-23</mec:endDate><mec:endHour>9:30 pm</mec:endHour>
    </item></channel></rss>`;
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    return new Response(xml, { headers: { "content-type": "application/rss+xml" } });
  });
  const events = await fetchMaclaEvents();
  assert.deepEqual(requests, ["https://maclaarte.org/events/feed/"]);
  assert.equal(events.length, expectedCount);
  return events[0];
}

test("MACLA reads the show clock and general admission from the full RSS body", async (t) => {
  const event = await scrape(t, `<p>Doors: 7:30 PM | Show: 8:00 PM</p>
    <p>The unsubsidized cost of a ticket is $250.</p>
    <p>$75 Reserved Seating</p><p>$50 Reserved Seating</p>
    <p>$30 General Admission</p><p>$10 Student – Pay What You Can Tickets</p>`);
  assert.equal(event.date, "2026-10-23");
  assert.equal(event.time, "8:00 PM");
  assert.equal(event.endTime, "9:30 PM");
  assert.equal(event.cost, "paid");
  assert.equal(event.costNote, "General admission $30.");
});

test("MACLA does not invent free admission when its feed omits the price", async (t) => {
  const event = await scrape(t, "<p>A public performance. Free parking nearby.</p>");
  assert.equal(event.cost, null);
  assert.equal(event.costNote, undefined);
  assert.equal(event.time, "7:30 PM", "retain the source clock without a labeled show time");
});

test("MACLA keeps explicit free admission", async (t) => {
  const event = await scrape(t, "<p>Admission is free.</p>");
  assert.equal(event.cost, "free");
});

test("MACLA's student or child exception does not make general admission free", async (t) => {
  const event = await scrape(t, "<p>Free admission for students. Free parking.</p><p>$30 General Admission</p>");
  assert.equal(event.cost, "paid");
  assert.equal(event.costNote, "General admission $30.");
});

test("MACLA preserves a verified low general-admission rate", async (t) => {
  const event = await scrape(t, "<p>$10 General Admission</p>");
  assert.equal(event.cost, "low");
  assert.equal(event.costNote, "General admission $10.");
});

test("a conditional free-admission claim alone leaves MACLA's general price unknown", async (t) => {
  const event = await scrape(t, "<p>Free admission for students.</p>");
  assert.equal(event.cost, null);
});

for (const now of ["2026-10-23T00:01:00-07:00", "2026-10-23T04:03:00-07:00", "2026-10-23T19:45:00-07:00"]) {
  test(`MACLA keeps tonight's concert before its show clock at ${now}`, async (t) => {
    const event = await scrape(t, "<p>Doors: 7:30 PM | Show: 8:00 PM</p><p>$30 General Admission</p>", undefined, now);
    assert.equal(event.date, "2026-10-23");
    assert.equal(event.time, "8:00 PM");
    assert.equal(event.endTime, "9:30 PM");
    assert.equal(event.ongoing, undefined);
  });
}

test("MACLA does not turn a concert whose show has started into an ongoing exhibit", async (t) => {
  await scrape(t, "<p>Doors: 7:30 PM | Show: 8:00 PM</p>", undefined, "2026-10-23T20:01:00-07:00", 0);
});

test("MACLA uses the source start clock when no show clock is supplied", async (t) => {
  const event = await scrape(t, "<p>$30 General Admission</p>", undefined, "2026-10-23T19:00:00-07:00");
  assert.equal(event.time, "7:30 PM");
});

test("MACLA keeps an exhibition through its source closing clock on the final day", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-08T12:00:00-08:00") });
  const xml = `<rss xmlns:mec="http://webnus.net/rss/mec/"><channel><item>
    <title>Poetic Utterances: Work by Viviana Paredes</title>
    <link>https://maclaarte.org/events/vivianaparedes2026/</link>
    <description>Works by Viviana Paredes in the MACLA Gallery.</description>
    <mec:startDate>2026-09-04</mec:startDate><mec:startHour>12:00 pm</mec:startHour>
    <mec:endDate>2026-11-08</mec:endDate><mec:endHour>5:00 pm</mec:endHour>
    </item></channel></rss>`;
  t.mock.method(globalThis, "fetch", async () => new Response(xml));
  const [event] = await fetchMaclaEvents();
  assert.ok(event);
  assert.equal(event.date, "2026-11-08");
  assert.equal(event.ongoing, true);
  assert.equal(event.time, null);
  assert.equal(event.endTime, null);
  t.mock.timers.setTime(new Date("2026-11-08T17:01:00-08:00").getTime());
  assert.deepEqual(await fetchMaclaEvents(), []);
});
