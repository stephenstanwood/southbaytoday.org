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

test("Gamble's sold-out detail heading becomes an attendance state", async (t) => {
  const { events } = await scrape(t, { html: `
    <div class="tribe-events-single-event-description">
      <h3>SOLD OUT</h3><p>Don't miss our annual Halloween event for families.</p>
    </div>` });
  assert.equal(events[0].registration, "full");
  assert.equal(events[0].cost, null, "a sold-out notice does not establish a price");
  assert.equal(events[0].date, "2026-12-04");
  assert.equal(events[0].time, "5:00 PM");
});

test("Gamble reads current availability before truncation without borrowing historical sellouts", async (t) => {
  for (const [name, description, expected] of [
    ["standalone notice", "<p>Sold out.</p><p>Join us in the garden.</p>", "full"],
    ["notice beyond excerpt", `<p>${"Explore the garden. ".repeat(25)}This event is sold out.</p>`, "full"],
    ["historical sellout", "<p>Last year's event sold out. Join this year's garden tour.</p>", undefined],
    ["artist biography", "<p>Sold-out shows around the world made this performer famous.</p>", undefined],
    ["conditional notice", "<p>If this event is sold out, check back for cancellations.</p>", undefined],
  ]) {
    await t.test(name, async (t) => {
      const { events } = await scrape(t, { rows: [{ ...row, description }] });
      assert.equal(events[0].registration, expected);
    });
  }
});

test("Gamble preserves required reservations beyond the displayed opening sentence", async (t) => {
  const { events } = await scrape(t, { rows: [{ ...row, title: "Holiday Luncheon (Tuesday)" }], html: `
    <div class="tribe-events-single-event-description">
      <p>One of Gamble Garden's traditions, our Holiday Luncheons celebrate the holidays.</p>
      <p>Enjoy a festive menu prepared and served by our volunteer committee.</p>
      <h3>Reservations:</h3><p>Reservations are required for all Holiday Luncheons.</p>
      <p>Book your table online or by calling the garden.</p>
    </div>` });
  assert.equal(events[0].registration, "required");
  assert.doesNotMatch(events[0].description, /reservations/i);
  assert.equal(events[0].cost, null, "reservations do not establish an admission price");
});

test("Gamble requires affirmative current booking instructions and preserves closures", async (t) => {
  for (const [name, description, expected] of [
    ["requirement after API excerpt", `<p>${"Explore the garden. ".repeat(25)}Registration is required.</p>`, "required"],
    ["advance reservation", "<p>Advance reservations are required.</p>", "required"],
    ["explicit RSVP", "<p>RSVP is required.</p>", "required"],
    ["closed registration", "<p>Registration is required. Registration is now closed.</p>", "closed"],
    ["sold out", "<p>Reservations are required. This event is sold out.</p>", "full"],
    ["optional RSVP", "<p>Join us in the garden. RSVP here.</p>", undefined],
    ["recommended booking", "<p>Reservations are recommended.</p>", undefined],
    ["no reservations", "<p>No reservations are required.</p>", undefined],
    ["registration not required", "<p>Registration is not required.</p>", undefined],
    ["historical requirement", "<p>Last year, reservations were required.</p>", undefined],
    ["conditional requirement", "<p>If reservations are required, contact the organizer.</p>", undefined],
  ]) {
    await t.test(name, async (t) => {
      const { events } = await scrape(t, { rows: [{ ...row, description }] });
      assert.equal(events[0].registration, expected);
    });
  }
});

test("Gamble does not borrow family navigation or body text from another event", async (t) => {
  const { events } = await scrape(t, { html: `<nav>Kids, children and families</nav>
    <div class="tribe-events-single-event-description"><p>Learn rose pruning techniques.</p></div>
    <aside>Children's crafts at a different event</aside>` });
  assert.equal(events[0].kidFriendly, false);
  assert.equal(events[0].description, "Learn rose pruning techniques.");
});

test("Gamble does not treat an instructor's family biography as the class audience", async (t) => {
  const { events } = await scrape(t, { rows: [{ ...row, title: "Peony Flower Arranging" }], html: `
    <div class="tribe-events-single-event-description">
      <p>Create spring floral arrangements with Jacqueline Pham.</p>
      <h2>Required Materials</h2><p>Bring floral clippers.</p>
      <h2><strong>Instructor Bio</strong></h2>
      <p>Her childhood led her to teach families. She has three children.</p>
      <h2>Terms and Conditions</h2><p>Registration is nonrefundable.</p>
    </div>` });
  assert.equal(events[0].kidFriendly, false);
  assert.equal(events[0].description, "Create spring floral arrangements with Jacqueline Pham.");
});

test("Gamble keeps an explicit audience before its instructor biography", async (t) => {
  const { events } = await scrape(t, { rows: [{ ...row, title: "Guided Tour" }], html: `
    <div class="tribe-events-single-event-description">
      <p>Explore the historic house and gardens.</p><p>Audience: Ages 10+.</p>
      <h3>About the Instructor</h3><p>The guide grew up in Palo Alto.</p>
    </div>` });
  assert.equal(events[0].kidFriendly, true);
});

test("Gamble applies the same biography boundary to API descriptions", async (t) => {
  const { events, requests } = await scrape(t, { rows: [{
    ...row, title: "Planting Tulip Bulbs for Spring",
    description: "<p>Plant tulip bulbs in containers.</p><h2>Instructor Bio</h2><p>She teaches families and children.</p>",
  }] });
  assert.equal(events[0].kidFriendly, false);
  assert.equal(requests.length, 1);
});

test("a senior age threshold alone does not make a Gamble class kid friendly", async (t) => {
  const { events } = await scrape(t, { rows: [{
    ...row, title: "Garden Workshop", description: "A workshop for ages 50 and up.",
  }] });
  assert.equal(events[0].kidFriendly, false);
});

test("a holiday luncheon remains a food event at a garden venue", async (t) => {
  const { events } = await scrape(t, { rows: [{ ...row, title: "Holiday Luncheon (Tuesday)" }], html: `
    <div class="tribe-events-single-event-description">
      <p>One of Gamble Garden's traditions, our Holiday Luncheons celebrate the holidays.</p>
      <p>Enjoy a festive menu prepared and served by our volunteer committee.</p>
    </div>` });
  assert.equal(events[0].category, "food");
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
  await assert.rejects(
    scrape(t, { html: "<html><body><nav>Kids and families</nav>Temporarily unavailable</body></html>" }),
    /Gamble Garden detail page has no event description body/,
  );
});

test("an interrupted Gamble response remains a source failure outside strict mode", async (t) => {
  // The October 29 refresh received headers, then lost the response body.
  // Returning [] here erased 31 future listings before source policy ran.
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    start(controller) { controller.error(new TypeError("terminated")); },
  })));
  await assert.rejects(fetchGambleGardenEvents({ wait: async () => {} }), /terminated/);
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
