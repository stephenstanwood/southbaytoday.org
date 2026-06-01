import test from "node:test";
import assert from "node:assert/strict";
import { renderEmail, formatLongDate, todayPT } from "./lib.mjs";

const BLOCKED_UNSPLASH = "https://images.unsplash.com/photo-1585899873671-ade0aa28a821?crop=entropy&w=400";

test("newsletter renders also-calendar events chronologically and hides stale/blocked assets", () => {
  const { html } = renderEmail({
    date: "2026-05-28",
    longDate: "Thursday, May 28, 2026",
    weather: null,
    dayPlan: null,
    dayPlanBlurb: "",
    tonightPick: {
      title: "Story Is the Thing",
      time: "6:00 PM",
      venue: "Kepler's Books",
      city: "palo-alto",
      cost: "paid",
      url: "https://example.com/story",
      image: BLOCKED_UNSPLASH,
    },
    tonightPickBlurb: "Local authors gather at Kepler's Books for an evening reading.",
    todayEvents: [{}, {}, {}],
    featuredEvents: [
      { title: "Late Event", time: "7:00 PM", venue: "Late Hall", city: "palo-alto", url: "https://example.com/late" },
      { title: "Early Event", time: "9:00 AM", venue: "Early Hall", city: "campbell", url: "https://example.com/early", image: BLOCKED_UNSPLASH },
    ],
    recentOpenings: [
      { name: "Old Cafe", date: "2026-05-20", cityName: "Campbell", address: "1 Main St" },
    ],
    tonightMeetings: [],
    todayHistory: [],
    redditPosts: [],
    visuals: { tonightPickImage: BLOCKED_UNSPLASH },
    editorial: {
      eventsHeading: "On the calendar",
      eventsNote: "A few useful things are happening today.",
      openingsHeading: "Newly open",
      openingsNote: "Fresh food openings.",
    },
  });

  assert.match(html, /Also on the calendar/);
  assert.equal(html.includes("Also also on the calendar"), false);
  assert.equal(html.includes(BLOCKED_UNSPLASH), false);
  assert.ok(html.indexOf("Early Event") < html.indexOf("Late Event"));
  assert.equal(html.includes("Old Cafe"), false);
  assert.equal(html.includes("Newly open"), false);
});

test("also-calendar events without an image span the full width (colspan), not the 72px image gutter", () => {
  // Regression: the events list is ONE shared table. Rows with an image emit two cells
  // (<td width=72>img</td><td>text</td>); rows without an image must span BOTH columns,
  // or their lone cell lands in the 72px image column and the text gets crammed into a
  // narrow strip with the right half blank. (Flagged repeatedly — keep this locked.)
  const { html } = renderEmail({
    date: "2026-05-28",
    longDate: "Thursday, May 28, 2026",
    weather: null, dayPlan: null, dayPlanBlurb: "",
    tonightPick: null, tonightPickBlurb: "",
    todayEvents: [{}, {}, {}],
    featuredEvents: [
      // No image → must carry colspan="2".
      { title: "Book Club Night", time: "7:00 PM", venue: "Campbell Library", city: "campbell", url: "https://example.com/book" },
      // With image → keeps the [thumb][text] two-cell layout.
      { title: "Morning Walk", time: "9:00 AM", venue: "Creek Trail", city: "campbell", url: "https://example.com/walk", image: "https://southbaytoday.org/img/walk.jpg" },
    ],
    recentOpenings: [], tonightMeetings: [], todayHistory: [], redditPosts: [],
    visuals: {}, editorial: null,
  });

  // The no-image event's content cell spans both columns.
  const bookIdx = html.indexOf("Book Club Night");
  assert.ok(bookIdx > -1, "no-image event should render");
  const rowSlice = html.slice(html.lastIndexOf("<tr>", bookIdx), bookIdx);
  assert.match(rowSlice, /colspan="2"/);

  // The image event keeps its 72px thumb cell and does NOT colspan its text.
  const walkIdx = html.indexOf("Morning Walk");
  const walkRow = html.slice(html.lastIndexOf("<tr>", walkIdx), walkIdx);
  assert.match(walkRow, /width="72"/);
  assert.equal(walkRow.includes("colspan"), false);
});

// ── Date helpers (PT-safe formatting — the timezone-drift bug class) ──────────

test("todayPT returns a YYYY-MM-DD string in Pacific Time", () => {
  const t = todayPT();
  assert.match(t, /^\d{4}-\d{2}-\d{2}$/);
  const expected = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  assert.equal(t, expected);
});

test("formatLongDate renders a full weekday/month/day/year string", () => {
  assert.match(formatLongDate("2026-05-06"), /^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}$/);
  assert.ok(formatLongDate("2026-05-06").includes("May 6, 2026"));
});

test("formatLongDate does NOT drift across the year boundary (PT, not UTC)", () => {
  // A naive new Date('2026-01-01') formatted in PT renders as Dec 31, 2025.
  // The helper pins noon-UTC + PT to avoid exactly that — lock it in.
  assert.ok(formatLongDate("2026-01-01").includes("January 1, 2026"));
  assert.ok(!formatLongDate("2026-01-01").includes("2025"));
});

// ── Dark-mode email ──────────────────────────────────────────────────────────

test("email head carries dark-mode overrides, keeps light styles, spares accents", () => {
  const { html } = renderEmail({
    date: "2026-05-28",
    longDate: "Thursday, May 28, 2026",
    weather: null, dayPlan: null, dayPlanBlurb: "",
    tonightPick: null, tonightPickBlurb: "",
    todayEvents: [], featuredEvents: [], recentOpenings: [],
    tonightMeetings: [], todayHistory: [], redditPosts: [],
    visuals: {}, editorial: null,
  });
  // Color-scheme signal + media query are present.
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  // Structural ink color gets a dark override; the light inline value still ships.
  assert.ok(html.includes('[style*="color:#1a1a2e"]'));
  // Accent hexes must NOT appear inside the dark block (left vibrant, not flattened).
  const darkBlock = html.slice(
    html.indexOf("@media (prefers-color-scheme: dark)"),
    html.indexOf("</style>"),
  );
  assert.equal(darkBlock.includes("#7c3aed"), false);
  assert.equal(darkBlock.includes("#3b4ef0"), false);
});
