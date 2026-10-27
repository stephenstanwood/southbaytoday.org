import test from "node:test";
import assert from "node:assert/strict";
import { fetchBiblioEvents, fetchStanfordEvents, fetchScuEvents, mapTicketmasterEvent } from "../generate-events.mjs";
import { applyVerifiedMeetupEventOverride } from "../lib/meetup-event-overrides.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventEditoriallySuppressed } from "../../src/lib/south-bay/eventAvailability.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

test("a sold-out TicketWeb zero offer does not turn a paid concert free", async () => {
  const source = { id: "rZ7HnEZ1AfFw00", name: "SOLD OUT Tauren Wells: Air1 Worship Now Tour - San Jose, CA",
    url: "https://www.ticketweb.com/event/sold-out-tauren-wells-air1-cathedral-of-faith-tickets/14232924",
    dates: { start: { localDate: "2026-11-12", localTime: "19:00:00" }, status: { code: "onsale" } },
    priceRanges: [{ type: "standard", currency: "USD", min: 0, max: 0 }],
    info: "Ticket prices are subject to change based on demand and/or when purchased at the door. By purchasing a ticket and voluntarily entering the event...",
    _embedded: { venues: [{ name: "Cathedral of Faith", city: { name: "San Jose" }, address: { line1: "2315 Canoas Garden Ave" } }] },
  };
  const event = mapTicketmasterEvent(source);
  assert.equal(event.cost, "paid");
  assert.equal(event.costNote, undefined, "do not restore an old numeric price");
  assert.equal(event.registration, "full");
  assert.equal(event.time, "7:00 PM");
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.cost, "paid");
  assert.equal(event.registration, "full");
  assert.equal(mapTicketmasterEvent({ ...source, info: "A concert." }).cost, null);
  assert.equal(mapTicketmasterEvent({ ...source, info: "Free admission." }).cost, "free");
  assert.equal(mapTicketmasterEvent({ ...source, name: "Free community concert", info: "", url: "https://www.ticketmaster.com/event/example" }).cost, "free");
  assert.equal(mapTicketmasterEvent({ ...source, priceRanges: [{ min: 34, max: 34 }] }).cost, "paid");
});

test("the teen college tour retains the city's registration request without inventing a gate", async () => {
  const raw = { date: "2026-11-07", time: "9:00 AM", endTime: "3:00 PM", cost: null,
    url: "https://anc.apm.activecommunities.com/mountainviewrecreation/activity/search/detail/19449?onlineSiteId=0&from_original_cui=true",
    description: "Space is limited and registration is required.", blurb: "Tour campus, with registration required for 11th and 12th graders." };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].attendanceNote, /asks participants to register early/);
  assert.doesNotMatch(events[0].description + events[0].blurb, /registration (?:is )?required/);
  assert.equal(events[0].registration, undefined);
  for (const key of ["time", "endTime", "cost"]) assert.equal(events[0][key], raw[key]);
  for (const state of ["full", "closed", "appointment-only"]) assert.equal(applyVerifiedEventFacts({ ...raw, registration: state }).registration, state);
  for (const other of [{ ...raw, date: "2027-11-07" }, { ...raw, url: "https://example.com/unrelated" }]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("the expired SJPL display stays out of ingest and cached publication without hiding other Halloween programs", async (t) => {
  // The live page and exact API agree on these past dates, while the indexed
  // page still advertises October 21–31. Evidence: docs/qa/2026-10-27-2007-fact-check.md.
  const id = "69c41db41e64afd01e64a8d9";
  const past = { id, definition: { title: "Halloween Interactive Activity", start: "2026-03-25", end: "2026-04-06" } };
  const OriginalDate = globalThis.Date;
  t.mock.method(globalThis, "Date", class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : ["2026-10-27T20:00:00Z"])); }
    static now() { return new OriginalDate("2026-10-27T20:00:00Z").getTime(); }
  });
  t.mock.method(globalThis, "fetch", async (url) => Response.json({
    entities: { events: new URL(url).searchParams.get("page") === "1" ? { [id]: past } : {} },
  }));
  assert.deepEqual(await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose"), []);
  const stale = { id: `sjpl-${id}`, title: "Halloween Interactive Activity", date: "2026-10-27",
    ongoing: true, startDate: "2026-10-21", endDate: "2026-10-31", venue: "Mt. Pleasant Library",
    url: `https://sjpl.bibliocommons.com/events/${id}` };
  assert.equal(isEventPublishable(stale), false);
  assert.equal(isEventPublishable({ ...stale, date: "2026-10-31" }), false, "a rolling cached copy stays withheld");
  assert.equal(isEventPublishable({ ...stale, id: "cached-copy", title: "Display", venue: "Library" }), false, "the source URL identifies sparse copies");
  assert.equal(isEventPublishable({ ...stale, id: "sjpl-other", title: "Halloween Storytime", url: "https://sjpl.bibliocommons.com/events/other" }), true);
  assert.equal(isEventPublishable({ ...stale, id: "sjpl-next-year", date: "2027-10-27", url: "https://sjpl.bibliocommons.com/events/next-year" }), true);
});

test("the public GSB panel retains free admission and its registration option through cached copy", async () => {
  const raw = { date: "2026-10-28", cost: null, time: "9:00 AM", endTime: "10:00 AM", virtual: true,
    url: "https://events.stanford.edu/event/GSB-Alumni-Innovating-for-American-Safety-Net",
    description: "", blurb: "Join this online session for Stanford GSB alumni on innovating for America's safety net." };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "free");
  assert.match(events[0].attendanceNote, /open to the public.*Registration is offered/);
  assert.match(events[0].blurb, /panel featuring Stanford GSB alumni/);
  assert.equal(events[0].registration, undefined, "a linked form alone does not establish mandatory signup");
  for (const key of ["date", "time", "endTime", "virtual", "url"]) assert.equal(events[0][key], raw[key]);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [{ ...raw, date: "2027-10-28" }, { ...raw, url: "https://example.com/unrelated" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("the lantern-festival meetup distinguishes its gathering from paid festival admission", async () => {
  const raw = { date: "2026-11-14", time: "4:00 PM", endTime: "6:00 PM", cost: null, registration: "none",
    url: "https://www.meetup.com/townflame/events/315756596/", description: "Meetup event by Growth Social Volunteering Professionals.",
    blurb: "Meet up with a volunteering group for the Water Lantern Festival at Almaden Lake on a Saturday afternoon." };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "paid");
  assert.match(events[0].costNote, /ages 8 and older.*under 8 enter free/);
  assert.match(events[0].attendanceNote, /meetup is 4–6 PM.*festival runs 2:30–6:30 PM.*separate from a Meetup RSVP/);
  assert.match(events[0].blurb, /ticketed Water Lantern Festival/);
  for (const key of ["time", "endTime", "registration", "url"]) assert.equal(events[0][key], raw[key]);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [{ ...raw, date: "2027-11-14" }, { ...raw, url: "https://example.com/unrelated" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("pickleball attendance instructions cannot reopen a full, closed or appointment-only occurrence", async () => {
  const raw = { date: "2026-11-01", time: "8:00 AM", endTime: "10:00 AM", registration: "none", cost: null,
    url: "https://www.meetup.com/south-bay-over-50-social-pickleballers/events/317153210/", blurb: "Play pickleball at Doerr Park." };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required");
  assert.match(events[0].attendanceNote, /listed as going.*8 AM.*7:30 AM.*Waitlisted players/);
  assert.equal(events[0].cost, null);
  for (const state of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration: state }).registration, state);
  }
  for (const other of [{ ...raw, date: "2027-11-01" }, { ...raw, url: "https://example.com/unrelated" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("the Halloween storytime clears the invented morning finish without guessing a replacement", async () => {
  const raw = { date: "2026-10-29", time: "10:30 AM", endTime: "11:30 AM", cost: null,
    venue: "Central Park Library", url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114667/",
    blurb: "Hear an outdoor Halloween storytime, weather permitting, then go trick or treating through the library." };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].endTime, null);
  assert.match(events[0].attendanceNote, /10:30 AM start.*11:30 PM finish.*Confirm the end time/);
  for (const key of ["date", "time", "cost", "venue", "url", "blurb"]) assert.equal(events[0][key], raw[key]);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [{ ...raw, date: "2027-10-29" }, { ...raw, url: "https://example.com/unrelated" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Cantor exhibition hours and explicit free admission survive excerpting and follow source updates", async () => {
  const day = (offset) => new Date(Date.now() + offset * 86_400_000)
    .toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  // Captured from the full JANE! Localist body on October 27. The admission
  // and closure instructions appear well beyond the published excerpt.
  const hours = "Mon & Fri: 11 AM–6 PM Thurs: 11 AM–8 PM Sat & Sun: 10 AM–5 PM CLOSED: Tues and Wed";
  let body = "Curated by Associate Curator of European Art, Patrick R. Crowley, JANE! celebrates Jane Stanford. ".repeat(10)
    + `MUSEUM HOURS ${hours} We're always free! Come visit us, https://museum.stanford.edu/visit`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ events: [
    { id: 1, location_name: "Cantor Arts Center", ticket_cost: "" },
    { id: 2, location_name: "Cantor Arts Center", ticket_cost: "$25" },
    { id: 3, location_name: "Another Gallery", ticket_cost: "" },
  ].map((row) => ({ event: { ...row, title: "JANE! exhibition", description_text: body,
    first_date: day(-1), last_date: day(14), free: false,
    event_instances: [{ event_instance: { start: `${day(0)}T00:00:00-07:00` } }] } })) });
  try {
    const events = await fetchStanfordEvents();
    const exhibition = events.find((e) => e.id === "stanford-1");
    assert.equal(exhibition.cost, "free");
    assert.equal(exhibition.attendanceNote, `Museum hours: ${hours}.`);
    assert.equal(exhibition.ongoing, true);
    assert.equal(exhibition.time, null);
    assert.equal(exhibition.registration, undefined);
    assert.doesNotMatch(exhibition.description, /MUSEUM HOURS|always free/);
    assert.equal(events.find((e) => e.id === "stanford-2").cost, "paid", "an explicit charge still wins");
    assert.equal(events.find((e) => e.id === "stanford-3").cost, null);
    assert.equal(events.find((e) => e.id === "stanford-3").attendanceNote, undefined);
    await resolveEventBlurbs([exhibition], { enabled: false });
    assert.equal(exhibition.cost, "free");
    assert.equal(exhibition.attendanceNote, `Museum hours: ${hours}.`);

    body = "An exhibition. MUSEUM HOURS Friday: 12 PM–4 PM CLOSED: Monday We're always free!";
    const changed = (await fetchStanfordEvents()).find((e) => e.id === "stanford-1");
    assert.equal(changed.attendanceNote, "Museum hours: Friday: 12 PM–4 PM CLOSED: Monday.");

    body = "An exhibition with free refreshments.";
    const sparse = (await fetchStanfordEvents()).find((e) => e.id === "stanford-1");
    assert.equal(sparse.cost, null, "free extras do not establish admission");
    assert.equal(sparse.attendanceNote, undefined, "removed hours must not persist");
  } finally { globalThis.fetch = originalFetch; }
});

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
