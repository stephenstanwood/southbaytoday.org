import test from "node:test";
import assert from "node:assert/strict";
import { fetchSjsuEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

test("university concerts outrank academic program notes while music lectures stay educational", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-04T02:38:42Z") });
  // The real ModLark program notes mention reading a score, research and
  // a conference: https://events.sjsu.edu/event/modlark-laptop-orchestra-concert
  const rows = [
    ["ModLark (Laptop Orchestra) Concert", "Performers establish their own methods for reading the score. His research has been presented at a conference.", "music"],
    ["Piano Recital", "Presented as part of a music class.", "music"],
    ["Concert Lecture: Digital Scores", "A lecture on reading digital scores.", "education"],
    ["Music Workshop", "A class on composition and concert programming.", "education"],
  ];
  const origin = "https://events.sjsu.edu";
  const xml = `<rss><channel>${rows.map(([title, description], i) => `<item><title>${title}</title><description>${description}</description><pubDate>Thu, 05 Nov 2026 19:30:00 -0800</pubDate><link>${origin}/event/concert-category-${i}</link></item>`).join("")}</channel></rss>`;
  t.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, origin);
    if (request.pathname === "/calendar.xml") return new Response(xml);
    assert.equal(request.pathname, "/api/2/events");
    return Response.json({ page: { total: 1 }, events: rows.map((_, i) => ({ event: {
      localist_url: `${origin}/event/concert-category-${i}`, location_name: "Music Building",
      address: "One Washington Square, San José, CA 95192", experience: "inperson", filters: {},
      ticket_cost: "Free performance. No ticket purchase necessary.",
    } })) });
  });
  const events = await fetchSjsuEvents();
  assert.deepEqual(events.map(({ title, category }) => [title, category]), rows.map(([title, , category]) => [title, category]));
  for (const event of events) {
    assert.equal(event.date, "2026-11-05");
    assert.equal(event.time, "7:30 PM");
    assert.equal(event.venue, "Music Building");
    assert.equal(event.cost, "free");
  }
});

test("dated source conditions preserve RSVP uncertainty and CPR eligibility without leaking to another occurrence", () => {
  const cases = [
    ["2026-11-04", "https://events.stanford.edu/event/stanford-in-haus-cramer-a-berlin-microhistory-book-launch-and-reception", /October 26.*limited seating/],
    ["2026-11-18", "https://www.eventbrite.com/e/hands-only-cpr-and-aed-class-15-monte-sereno-15-hrs-2026-tickets-2004328931790", /Ages 13\+.*live or work.*under 18.*waiver/],
  ];
  for (const [date, url, note] of cases) {
    const original = { date, url, time: "10:00 AM", endTime: null, cost: null };
    const corrected = applyVerifiedEventFacts(original);
    assert.match(corrected.attendanceNote, note);
    assert.equal(corrected.registration, undefined);
    assert.equal(corrected.cost, null);
    if (url.includes("eventbrite")) assert.equal(corrected.endTime, "11:30 AM");
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    for (const other of [{ ...original, date: "2027-11-18" }, { ...original, url: "https://example.org/unrelated" }]) {
      assert.deepEqual(applyVerifiedEventFacts(other), other);
    }
  }
});

test("a comedian's family biography cannot override the venue's adult entry policy", () => {
  const original = {
    date: "2026-11-04", url: "https://improv.com/sanjose/comic/px+floro/",
    kidFriendly: true, audienceAge: "all", cost: null,
    description: "A mother of two daughters balancing a day job and family chaos.",
  };
  const corrected = applyVerifiedEventFacts(original);
  assert.equal(corrected.kidFriendly, false);
  assert.equal(corrected.audienceAge, "adult");
  assert.equal(corrected.cost, "paid");
  assert.match(corrected.attendanceNote, /standard entry policy is 21\+.*show-specific age exception/);
  assert.equal(corrected.description, original.description);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  assert.deepEqual(applyVerifiedEventFacts({ ...original, date: "2027-11-04" }), { ...original, date: "2027-11-04" });
});
