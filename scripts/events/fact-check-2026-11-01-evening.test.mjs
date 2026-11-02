import test from "node:test";
import assert from "node:assert/strict";
import { extractTimeFromHtml, fetchInboundEvents, fetchPlaywrightEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";

// Fresh first-party sources and authenticated newsletter originals:
// docs/qa/2026-11-02-0107z-fact-check.md.
const sarodTitle = "The Sarod Trilogy: Amjad Ali Khan, Amaan Ali Bangash, and Ayaan Ali Bangash";
const sarodUrl = "https://montalvoarts.org/experience/carriage-house-concerts/the-sarod-trilogy/";
const sarod = {
  id: "browser-sarod", source: "Montalvo Arts Center", date: "2026-11-14", city: "saratoga",
  venue: "Montalvo Arts Center", time: "5:30 PM", endTime: null, category: "arts", cost: "paid",
  title: sarodTitle.replace("Amaan Ali", "Amaan Ayaan Ali"), url: sarodUrl,
  blurb: "Hear Amaan Ayaan Ali Bangash perform with Amjad Ali Khan and Ayaan Ali Bangash.",
};

test("a dated performance schedule outranks a pre-show exhibition mentioned later", () => {
  const html = `<html><body><h1>The Sarod Trilogy</h1>
    <h4>${sarodTitle}</h4><p>Saturday, November 14, 2026 • 7:30 PM</p>
    <h2>Special Art Exhibition before the show at 5:30 pm</h2>
    <p>Before the concert, explore the gallery from 5:30–7:30 pm.</p>
    <footer>Box Office Hours: Mon-Fri 10 am – 4 pm</footer></body></html>`;
  assert.equal(extractTimeFromHtml(html, "2026-11-14"), "7:30 PM");
  // A different day's explicit performance time cannot establish this date.
  assert.equal(extractTimeFromHtml(html.replace("November 14", "November 15"), "2026-11-14"), null);
  assert.equal(extractTimeFromHtml(html.replace("</body>", "<p>November 14, 2026 • 2:00 PM</p></body>"), "2026-11-14"), null);
});

test("both Sarod adapters normalize to one correctly named 7:30 PM concert", () => {
  const [browser] = fetchPlaywrightEvents({ today: "2026-11-01", events: [sarod] });
  const ticket = { ...sarod, id: "ticket-sarod", title: "Amjad Ali Khan Trio (Sarod Trilogy)",
    url: "https://my.montalvoarts.org/3109/3152", time: "7:30 PM",
    occurrenceEvidence: {kind:"first-party-occurrence-page",sourceUrl:"https://my.montalvoarts.org/3109/3152",date:sarod.date} };
  const corrected = [browser, ticket].map(applyVerifiedEventFacts);
  for (const event of corrected) {
    assert.equal(event.title, sarodTitle);
    assert.equal(event.time, "7:30 PM");
    assert.equal(event.category, "music");
    assert.equal(event.endTime, null);
    assert.doesNotMatch(event.blurb, /Amaan Ayaan/);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  const result = fuzzyDedupEvents(corrected);
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].id, ticket.id);
  for (const event of [{ ...sarod, date: "2027-11-14" }, { ...sarod, url: "https://example.org/unrelated" }]) {
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
});

const newsletter = (title, date, time, url, location = "Sunnyvale Main Library, Program Room") => ({
  id: title, title, startsAt: `${date}T${time}:00-08:00`, endsAt: null,
  cityKey: "sunnyvale", location, sourceUrl: url, description: "",
});

test("Sunnyvale's new library programs retain admission and distinct signup conditions", () => {
  const rows = [
    newsletter("Native American Heritage Month: Muwekma Ohlone Tribe", "2026-11-02", "16:00", "https://sunnyvale.libcal.com/event/17134942"),
    newsletter("Movie: Smoke Signals (1998) with Film Professor Intro & Discussion", "2026-11-23", "18:00", "https://sunnyvale.libcal.com/event/17754557"),
    newsletter("Online Author Talk: Rebecca Roanhorse", "2026-11-19", "16:00", "https://libraryc.org/sunnyvalelibrary/220791", "Online"),
    newsletter("Online Author Talk: Chef Pyet DeSpain", "2026-11-12", "11:00", "https://libraryc.org/sunnyvalelibrary/220092", "Online"),
  ];
  const events = fetchInboundEvents({ today: "2026-11-01", events: rows }).map(applyVerifiedEventFacts);
  assert.equal(events.length, 4);
  for (const event of events) assert.equal(event.cost, "free");
  assert.equal(events[0].registration, "required");
  assert.match(events[0].attendanceNote, /guaranteed only until.*start/i);
  assert.equal(events[0].audienceAge, "kids");
  assert.equal(events[1].registration, "none");
  assert.match(events[1].attendanceNote, /optional.*reminder/i);
  assert.equal(events[1].audienceAge, "adult");
  for (const event of events.slice(2)) {
    assert.equal(event.virtual, true);
    assert.equal(event.venue, "Online");
    assert.equal(event.registration, "required");
  }
  for (const event of events) {
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    assert.deepEqual(applyVerifiedEventFacts({ ...event, date: "2027-11-02", cost: null }), { ...event, date: "2027-11-02", cost: null });
    if (event.registration === "required") for (const registration of ["closed", "full", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
    }
  }
});

test("Montalvo's newsletter promo link retains the verified free family showcase and shuttle note", () => {
  const [event] = fetchInboundEvents({ today: "2026-11-01", events: [{
    ...newsletter("Lowrider Art Showcase: Celebrating Día de los Muertos", "2026-11-01", "13:00", "https://my.montalvoarts.org/3248/3250?promo=", "Montalvo Arts Center, 15400 Montalvo Rd, Saratoga"),
    cityKey: "saratoga", description: "A showcase with artists, vendors and face painting shown in the newsletter photos.",
  }] });
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.cost, "free");
  assert.equal(corrected.kidFriendly, true);
  assert.match(corrected.attendanceNote, /No parking at Montalvo.*West Valley College/);
  assert.doesNotMatch(corrected.description, /face painting/);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});

test("contradictory library source instructions stay qualified and the unsupported jobs figure is removed", () => {
  const workshop = { date: "2026-11-05", url: "https://sjpl.bibliocommons.com/events/6a99d8351c197d11325d14f5",
    registration: "required", time: "12:00 PM", endTime: "1:00 PM",
    description: "When it comes to job searching, 80% of the US population gets their job through someone they know, this workshop will discuss how to successfully market yourself as a solution to their problem. No registration required." };
  const corrected = applyVerifiedEventFacts(workshop);
  assert.doesNotMatch(corrected.description, /80%|US population/);
  assert.equal(corrected.attendanceStatus, "needs-confirmation");
  assert.match(corrected.attendanceNote, /no registration.*signup instructions.*confirm/i);
  assert.equal(corrected.time, workshop.time);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const coloring = {date:"2026-11-05",url:"https://sjpl.bibliocommons.com/v2/events/6a02181d43b41b3d0065b7ed",time:"10:00 AM",endTime:"11:30 AM",registration:"required"};
  const qualified = applyVerifiedEventFacts(coloring);
  assert.equal(qualified.attendanceStatus, "needs-confirmation");
  assert.equal(qualified.time, coloring.time);
  assert.match(qualified.attendanceNote, /10.*10:30.*confirm/i);
  for (const event of [workshop, coloring]) {
    const other = { ...event, date: "2027-11-05" };
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});
