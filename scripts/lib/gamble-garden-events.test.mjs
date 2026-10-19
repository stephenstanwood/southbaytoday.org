import test from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, fetchGambleGardenEvents, polishDescription } from "../generate-events.mjs";

const url = "https://www.gamblegarden.org/event/once-upon-a-garden/";
const row = {
  id: 25684,
  title: 'Once Upon a Garden: "Through the Looking Glass"',
  start_date: "2026-12-04 17:00:00",
  end_date: "2026-12-04 19:00:00",
  url,
  description: "",
  excerpt: "",
  cost: "",
};

async function scrape(t, { rows = [row], html = "" } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-19T20:07:06Z") });
  const requests = [];
  const waits = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    requests.push(String(input));
    if (String(input).includes("/wp-json/tribe/events/")) {
      return Response.json({ events: rows, total_pages: 1 });
    }
    assert.equal(String(input), url);
    return new Response(html, { headers: { "content-type": "text/html" } });
  });
  const events = await fetchGambleGardenEvents({ wait: async (ms) => { waits.push(ms); } });
  return { events, requests, waits };
}

test("a renamed Gamble family event keeps its audience from the public page when the API omits copy", async (t) => {
  const { events, requests, waits } = await scrape(t, { html: `<nav>Adult education</nav>
    <div class="tribe-events-single-event-description tribe-events-content">
      <div><p>Experience a magical holiday evening for kids and families!</p></div>
      <ul><li>Delight in children's crafts and holiday shopping.</li></ul>
      <p>Adults enjoy a complimentary glass of champagne. Free parking.</p>
    </div><footer>Not event copy</footer>` });
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.kidFriendly, true);
  assert.equal(event.description, "Experience a magical holiday evening for kids and families!");
  assert.doesNotMatch(event.description, /education|Not event copy/);
  assert.equal(event.cost, null, "free parking is not free admission");
  assert.equal(event.date, "2026-12-04");
  assert.equal(event.time, "5:00 PM");
  assert.equal(event.endTime, "7:00 PM");
  assert.equal(event.url, url);
  assert.equal(requests.length, 2);
  assert.deepEqual(waits, [10_000], "honor the source's crawl delay");
});

test("Gamble family signals after the displayed excerpt still determine the audience", async (t) => {
  const { events, requests, waits } = await scrape(t, { rows: [{
    ...row, description: `<p>${"Explore the garden. ".repeat(20)}Welcoming families and children.</p>`, cost: "$36 – $55",
  }] });
  assert.equal(events[0].kidFriendly, true);
  assert.doesNotMatch(events[0].description, /families/);
  assert.equal(events[0].cost, "paid");
  assert.equal(requests.length, 1, "a complete API body needs no page request");
  assert.deepEqual(waits, []);
});

test("Gamble does not borrow family navigation or body text from another event", async (t) => {
  const { events } = await scrape(t, { html: `<nav>Kids, children and families</nav>
    <div class="tribe-events-single-event-description"><p>Learn rose pruning techniques.</p></div>
    <aside>Children's crafts at a different event</aside>` });
  assert.equal(events[0].kidFriendly, false);
  assert.equal(events[0].description, "Learn rose pruning techniques.");
});

test("Gamble fetches a repeated detail URL only once per refresh", async (t) => {
  const { events, requests, waits } = await scrape(t, {
    rows: [row, { ...row, id: 25685, start_date: "2026-12-05 17:00:00" }],
    html: '<div class="tribe-events-single-event-description"><p>Kids and families welcome.</p></div>',
  });
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.kidFriendly));
  assert.equal(requests.length, 2);
  assert.deepEqual(waits, [10_000]);
});

test("an unrecognized Gamble detail page cannot silently publish a guessed audience", async (t) => {
  const { events } = await scrape(t, { html: "<html><body><nav>Kids and families</nav>Temporarily unavailable</body></html>" });
  assert.deepEqual(events, []);
});

test("source-published OSF initials survive title and body cleanup", () => {
  const title = "CBD 2026: Contemplation in an Age of AI with Ilia Delio, OSF, PhD";
  assert.equal(cleanTitle(title), title);
  assert.equal(cleanTitle(cleanTitle(title)), title);
  const body = "Ilia Delio, OSF, PhD discusses contemplation.";
  assert.equal(polishDescription(body), body);
  assert.equal(polishDescription(polishDescription(body)), body);
});

test("TRUST retains the county program's initials without capitalizing ordinary trust", () => {
  assert.equal(cleanTitle("TRUST Team Tabling"), "TRUST Team Tabling");
  const body = "The TRUST team provides information about its support services.";
  assert.equal(polishDescription(body), body);
  assert.equal(polishDescription(polishDescription(body)), body);
  assert.equal(cleanTitle("Trust your intuition"), "Trust your intuition");
  assert.equal(polishDescription("Trust is important."), "Trust is important.");
});
