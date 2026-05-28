import test from "node:test";
import assert from "node:assert/strict";
import { renderEmail } from "./lib.mjs";

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
