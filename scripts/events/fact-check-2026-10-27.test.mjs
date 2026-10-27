import test from "node:test";
import assert from "node:assert/strict";
import { fetchStanfordEvents, fetchScuEvents } from "../generate-events.mjs";
import { applyVerifiedMeetupEventOverride } from "../lib/meetup-event-overrides.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventEditoriallySuppressed } from "../../src/lib/south-bay/eventAvailability.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

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
