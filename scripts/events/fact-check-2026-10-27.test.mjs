import test from "node:test";
import assert from "node:assert/strict";
import { fetchStanfordEvents, fetchScuEvents } from "../generate-events.mjs";
import { applyVerifiedMeetupEventOverride } from "../lib/meetup-event-overrides.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventEditoriallySuppressed } from "../../src/lib/south-bay/eventAvailability.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

test("solidarity and Morph-A-Thon retain source signup instructions without invented mandatory gates", async () => {
  for (const raw of [
    { date: "2026-10-27", url: "https://events.stanford.edu/event/organizing-in-solidarity-at-stanford-past-present", cost: null },
    { date: "2026-10-29", url: "https://www.meetup.com/autonomous-application-development-meetup-group/events/317097934/", cost: null, registration: "none" },
  ]) {
    const expected = raw.date === "2026-10-27" ? /RSVPs by October 23.*after that deadline/ : /sign up in advance.*spaces are limited/;
    const fixed = applyVerifiedEventFacts(raw);
    assert.match(fixed.attendanceNote, expected);
    assert.equal(fixed.registration, raw.registration);
    assert.equal(fixed.cost, null);
    assert.equal(fixed.registrationClosesBy, undefined);
    assert.equal(fixed.attendanceStatus, undefined);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    for (const state of ["full", "closed", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...raw, registration: state }).registration, state);
    }
    for (const other of [{ ...raw, date: "2027-10-27" }, { ...raw, url: "https://example.com/unrelated" }]) {
      assert.equal(applyVerifiedEventFacts(other), other);
    }
    const events = [{ ...raw, description: "", blurb: "Attend the event." }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.match(events[0].attendanceNote, expected);
    assert.equal(events[0].registration, raw.registration);
    assert.equal(events[0].cost, null);
  }
});

test("Stanford bike-class eligibility survives missing audience tags and display truncation", async () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const restricted = "This is a free class for Stanford Students, Faculty and Staff who have either not yet learned how to ride a bike, or want a refresher.";
  const rows = [
    { id: 1, title: "Learn to Ride Class", description_text: "Class introduction. ".repeat(40) + restricted },
    { id: 2, title: "Learn to Ride Class", description_text: "This free class is open to the public, including Stanford students, faculty and staff." },
    { id: 3, title: "Public transport lecture", description_text: restricted },
  ].map((row) => ({ event: { ...row, location_name: "Galvez Parking Lot", first_date: tomorrow, last_date: tomorrow,
    event_instances: [{ event_instance: { start: `${tomorrow}T14:00:00-07:00` } }] } }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ events: rows });
  try {
    assert.deepEqual((await fetchStanfordEvents()).map((e) => e.id), [2, 3].map((id) => `stanford-${id}-${tomorrow}`));
  } finally { globalThis.fetch = originalFetch; }
  const stale = { date: "2026-10-27", title: "Learn to Ride Class", venue: "Galvez Parking Lot", description: "" };
  assert.equal(isEventEditoriallySuppressed(stale), true);
  for (const other of [{ ...stale, date: "2027-10-27" }, { ...stale, title: "Another class" }, { ...stale, venue: "Another venue" }]) {
    assert.equal(isEventEditoriallySuppressed(other), false);
  }
});

test("SCU uses existing LiveWhale admission metadata without confusing free extras with admission", async () => {
  const origin = "https://events.scu.edu";
  const costs = ["Free", "$20", "Contact the organizer", undefined, "$0.00"];
  const xml = `<rss><channel>${costs.map((_, id) => `<item><title>Public recital ${id}</title><link>${origin}/arts-and-sciences/event/${id}-recital</link><description>${id === 3 ? "Free admission." : "Free refreshments."}</description><pubDate>2026-11-04T12:00:00-08:00</pubDate><georss:featurename>Music Recital Hall</georss:featurename></item>`).join("")}</channel></rss>`;
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url) === `${origin}/live/rss/events`) return new Response(xml);
    assert.equal(String(url), `${origin}/live/json/events?page=1`);
    return Response.json({ meta: { total_pages: 1 }, data: costs.map((cost, id) => ({ id, cost })) });
  };
  try {
    assert.deepEqual((await fetchScuEvents()).map((e) => e.cost), ["free", "paid", "", "free", "free"]);
    assert.equal(requested.length, 2, "reuse the metadata request; no per-event calls");
  } finally { globalThis.fetch = originalFetch; }
});

test("Illicit Finance preserves explicit free admission and required advance registration through blurb resolution", async () => {
  const raw = { date: "2026-10-27", time: "5:30 PM", endTime: "6:30 PM", venue: "Hohbach Hall", cost: null,
    url: "https://events.stanford.edu/event/the-illicit-finance-hydra-crypto-sanctions-evasion-and-the-new-financial-battlefield",
    title: "The Illicit Finance Hydra: Crypto, Sanctions Evasion, and the New Financial Battlefield", description: "", blurb: "Attend a public talk." };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.cost, "free");
  assert.equal(fixed.registration, "required");
  assert.match(fixed.attendanceNote, /Advance registration is required/);
  for (const state of ["full", "closed", "appointment-only"]) assert.equal(applyVerifiedEventFacts({ ...raw, registration: state }).registration, state);
  for (const key of ["date", "time", "endTime", "venue", "url", "title"]) assert.equal(fixed[key], raw[key]);
  for (const other of [{ ...raw, date: "2027-10-27" }, { ...raw, url: "https://example.com/unrelated" }]) assert.equal(applyVerifiedEventFacts(other), other);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "free");
  assert.equal(events[0].registration, "required");
});

test("Stanford RSVP invitations survive shortened copy without becoming mandatory gates", async () => {
  for (const slug of ["an-evening-of-poetry-with-fady-joudah", "the-unbroken-sky"]) {
    const raw = { date: "2026-10-27", url: `https://events.stanford.edu/event/${slug}`, cost: null, description: "", blurb: "Attend the event." };
    const fixed = applyVerifiedEventFacts(raw);
    assert.match(fixed.attendanceNote, /requests an RSVP/);
    assert.equal(fixed.cost, null);
    assert.equal(fixed.registration, undefined);
    for (const state of ["full", "closed", "appointment-only"]) assert.equal(applyVerifiedEventFacts({ ...raw, registration: state }).registration, state);
    for (const other of [{ ...raw, date: "2027-10-27" }, { ...raw, url: "https://example.com/unrelated" }]) assert.equal(applyVerifiedEventFacts(other), other);
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.match(events[0].attendanceNote, /RSVP/);
    assert.equal(events[0].registration, undefined);
  }
});

test("the November roommate occurrence discloses the copied October date only while its fresh body conflicts", () => {
  const raw = { date: "2026-11-09", time: "7:00 PM", endTime: "8:30 PM", registration: "none",
    url: "https://www.meetup.com/san-jose-friends-roommate-finder/events/316998965/" };
  const fixed = applyVerifiedMeetupEventOverride(raw, { sourceDescription: "Details: Mon Oct 19 · 7:00–8:30 PM" });
  assert.equal(fixed.attendanceStatus, "needs-confirmation");
  assert.match(fixed.attendanceNote, /November 9.*October 19/);
  for (const key of ["date", "time", "endTime", "registration", "url"]) assert.equal(fixed[key], raw[key]);
  for (const sourceDescription of ["Details: Mon Nov 9 · 7:00–8:30 PM", "Join us for an evening."]) {
    assert.equal(applyVerifiedMeetupEventOverride(raw, { sourceDescription }), raw);
  }
  assert.equal(applyVerifiedMeetupEventOverride({ ...raw, date: "2027-11-09" }, { sourceDescription: "Mon Oct 19" }).attendanceStatus, undefined);
});

test("new Stanford invitations and exhibition entry instructions survive sparse cached copy without advance gates", async () => {
  const cases = [
    ["2026-10-27", "the-offline-dream-program-three-takes-on-film-the-internet-and-instanternity", /requests an RSVP/],
    ["2026-10-27", "public-lecture-gravitational-wave-detection", /livestream link.*registration confirmation email/],
    ["2026-10-28", "electric-contrasts-the-art-of-the-detail-7315", /650-723-3408.*building and elevator access/],
    ["2026-10-28", "a-vision-of-paris-the-roxane-debuisson-collection-at-stanford", /government ID.*at the entrance/],
  ];
  for (const [date, slug, note] of cases) {
    const raw = { date, url: `https://events.stanford.edu/event/${slug}`, cost: null, description: "", blurb: "Visit the event." };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.match(events[0].attendanceNote, note);
    assert.equal(events[0].registration, undefined, "a visitor-entry condition or invitation is not advance registration");
    assert.equal(events[0].cost, null);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    for (const other of [{ ...raw, date: "2027-10-27" }, { ...raw, url: "https://example.com/unrelated" }]) {
      assert.equal(applyVerifiedEventFacts(other), other);
    }
  }
});

test("source corrections retain explicit free admission, the author's verified name and the hike's admission requirement", async () => {
  const rows = [
    { date: "2026-10-28", url: "https://events.stanford.edu/event/touch-me-not-12th-annual-undergraduate-juried-exhibition", cost: null },
    { date: "2026-11-03", url: "https://events.sjsu.edu/event/natalie-and-james-thompson-gallery-common-ground", cost: null },
    { date: "2026-11-22", url: "https://www.lindentreebooks.com/events-calendar/", description: "Meet Nisha Lamsam Lion.", blurb: "Meet Nisha Lamsam Ligor." },
    { date: "2026-10-28", url: "https://www.meetup.com/south-bay-50-social-hikers/events/317096095/", registration: "none", cost: null },
  ];
  await resolveEventBlurbs(rows, { enabled: false });
  assert.deepEqual(rows.slice(0, 2).map((e) => e.cost), ["free", "free"]);
  assert.match(rows[2].description, /Nisha Lamsam Ligon/);
  assert.match(rows[2].blurb, /Nisha Lamsam Ligon/);
  assert.equal(rows[3].registration, "required");
  assert.equal(rows[3].cost, null);
  assert.match(rows[3].attendanceNote, /listed as going.*does not allow walk-ins/);
  for (const state of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...rows[3], registration: state }).registration, state);
  }
});

test("AI Tinkerers' conflicting end times remain disclosed through publication only while the fresh body conflicts", async () => {
  const raw = { date: "2026-11-10", time: "6:00 PM", endTime: "9:00 PM", registration: "full", cost: null,
    url: "https://www.meetup.com/sf-mcp-devs/events/316977267/", blurb: "Meet fellow AI builders." };
  const fixed = applyVerifiedMeetupEventOverride(raw, { sourceDescription: "Tuesday • 10 Nov 2026 • 6:00–8:30 PM • Downtown San Jose" });
  const events = [fixed];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].attendanceStatus, "needs-confirmation");
  assert.match(events[0].attendanceNote, /6–9 PM.*6–8:30 PM/);
  for (const key of ["date", "time", "endTime", "registration", "cost", "url"]) assert.equal(events[0][key], raw[key]);
  for (const sourceDescription of ["Tuesday • 10 Nov 2026 • 6:00–9:00 PM", "Meet fellow builders."]) {
    assert.equal(applyVerifiedMeetupEventOverride(raw, { sourceDescription }), raw);
  }
  for (const other of [{ ...raw, date: "2027-11-10" }, { ...raw, url: "https://example.com/unrelated" }]) {
    assert.equal(applyVerifiedMeetupEventOverride(other, { sourceDescription: "6:00–8:30 PM" }), other);
  }
});
