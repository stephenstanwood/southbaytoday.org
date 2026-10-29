import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchStanfordEvents } from "../generate-events.mjs";
import { isEventEditoriallySuppressed } from "../../src/lib/south-bay/eventAvailability.mjs";

// Stanford's Localist API returns ONE ROW PER OCCURRENCE. `first_date` and
// `last_date` bound the series; `event_instances[].event_instance.start` is the
// occurrence, and it is the only field with a Pacific offset and a clock time.
//
// The adapter read the occurrence off `first_date`, a bare calendar date, so
// `new Date()` resolved it to midnight UTC — the prior Pacific afternoon. Every
// timed Stanford event published a day early with a fabricated "5:00 PM" start
// (4:00 PM in winter) that no Stanford listing had ever claimed. Verified
// against events.stanford.edu on 2026-08-31: the Anne Wojcicki fireside chat is
// listed "Wednesday, September 2, 2026 / 12pm to 1pm PT" and was being
// published as Sep 1, 5:00 PM.

const PT = "America/Los_Angeles";
const dayPT = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: PT });
};

function localistEvent(overrides = {}) {
  const { instances = [], ...rest } = overrides;
  return {
    event: {
      id: 1,
      title: "Untitled",
      description_text: "",
      location_name: "Cantor Arts Center",
      address: "328 Lomita Dr",
      free: false,
      experience: "inperson",
      localist_url: "https://events.stanford.edu/event/untitled",
      first_date: dayPT(1),
      last_date: dayPT(1),
      event_instances: instances.map((i) => ({ event_instance: i })),
      ...rest,
    },
  };
}

async function runWith(events) {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ events }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    return await fetchStanfordEvents();
  } finally {
    globalThis.fetch = original;
  }
}

test("conditional free admission never masks published paid Localist ticket tiers", async () => {
  const tomorrow = dayPT(1);
  const instances = [{ start: `${tomorrow}T07:30:00-07:00` }];
  const costs = [
    { ticket_cost: "Free-$390", free: true },
    { ticket_cost: "$90-$390; free for Stanford affiliates", free: false },
    { ticket_cost: "Free (registration required)", free: false },
    { ticket_cost: "$0", free: false },
    { ticket_cost: "$15", free: false },
    { ticket_cost: "", free: false },
    { ticket_cost: "Free; ages 18+", free: false },
  ];
  const rows = await runWith(costs.map((cost, id) => localistEvent({ id: id + 1, instances, ...cost })));
  assert.deepEqual(rows.map((row) => row.cost), ["paid", "paid", "free", "free", "paid", null, "free"]);
});

test("Stanford visitor ID requirements survive a short display excerpt", async () => {
  const tomorrow = dayPT(1);
  const [event] = await runWith([localistEvent({
    title: "Branner Library Book & Map Exhibit - Water in the West",
    location_name: "Mitchell Earth Sciences", instances: [{ start: `${tomorrow}T10:00:00-07:00` }],
    description_text: "Explore water resources in California. ".repeat(15)
      + "A current Stanford ID is needed to enter the library, visitors must present a valid, physical government-issued photo ID to sign-in at the front desk.",
  })]);
  assert.match(event.attendanceNote, /physical government-issued photo ID/);
  assert.doesNotMatch(event.description, /photo ID/, "the note is read before truncation");
});

test("Stanford retains a current full-capacity notice before display truncation", async () => {
  const tomorrow = dayPT(1);
  const instances = [{ start: `${tomorrow}T12:00:00-07:00`, end: `${tomorrow}T13:15:00-07:00` }];
  const introduction = "A public talk about international affairs. ".repeat(12);
  const rows = await runWith([
    localistEvent({ id: 1, title: "After Fission", instances,
      description_text: introduction + "Registration is at full capacity. Check the organizer for updates." }),
    localistEvent({ id: 2, instances,
      description_text: "If registration is at full capacity, check another session." }),
  ]);
  assert.equal(rows[0].registration, "full");
  assert.equal(rows[0].time, "12:00 PM");
  assert.equal(rows[0].endTime, "1:15 PM");
  assert.equal(rows[0].cost, null, "capacity does not establish admission price");
  assert.equal(rows[1].registration, undefined);
});

test("Stanford's Class/Seminar format outranks an industrial park in the subject", async () => {
  // The October 26 Constructing Utopias listing declares Class/Seminar.
  // Its reference to Suzhou Industrial Park does not make it an outdoor trip.
  const tomorrow = dayPT(1);
  const [event] = await runWith([
    localistEvent({
      title: "Constructing Utopias: China's New Town Movement in the 21st Century",
      location_name: "Encina Hall",
      description_text: "This talk examines four decades of Chinese urbanization. Case studies include the Suzhou Industrial Park and prototypical eco-cities.",
      filters: { event_types: [{ name: "Class/Seminar" }] },
      instances: [{ start: `${tomorrow}T12:00:00-07:00`, end: `${tomorrow}T13:30:00-07:00` }],
    }),
  ]);
  assert.equal(event.category, "education");
  assert.equal(event.time, "12:00 PM");
  assert.equal(event.endTime, "1:30 PM");
});

test("Stanford's declared lecture format outranks children mentioned in the topic", async () => {
  const tomorrow = dayPT(1);
  const [event] = await runWith([
    localistEvent({
      id: 53745818123158,
      title: 'Universal Human Psychology, "Bani Adam," and Our Omnicultural Future',
      description_text: "Bani Adam literally means the children of Adam. The poem describes the interconnected nature of humankind.",
      location_name: "In person at Stanford",
      filters: { event_types: [{ name: "Lecture/Presentation/Talk" }] },
      instances: [{ start: `${tomorrow}T18:30:00-07:00`, end: `${tomorrow}T20:00:00-07:00` }],
    }),
  ]);
  assert.equal(event.category, "education");
  assert.equal(event.kidFriendly, false);
});

test("Stanford lectures retain arts topics and an untyped storytime retains its audience", async () => {
  const tomorrow = dayPT(1);
  const instances = [{ start: `${tomorrow}T13:00:00-07:00` }];
  const events = await runWith([
    localistEvent({
      id: 1, title: "Tangling the Digital: Weaving, Printmaking, Computing",
      location_name: "McMurtry Building", description_text: "A fireside chat exploring printmaking and visual art.",
      filters: { event_types: [{ name: "Lecture/Presentation/Talk" }] }, instances,
    }),
    localistEvent({ id: 2, title: "Family Storytime", location_name: "Library", instances }),
  ]);
  assert.deepEqual(events.map((event) => event.category), ["arts", "family"]);
});

test("Stanford clinic eligibility outranks Everyone metadata before description truncation", async () => {
  const tomorrow = dayPT(1);
  const clinic = {
    title: "EH&S: Flu & COVID-19 Vaccination Clinic",
    location_name: "484 Oak Road, Stanford, CA 94305",
    address: "484 Oak Road, Stanford, CA 94305",
    filters: { event_audience: [{ name: "Everyone" }] },
    instances: [{ start: `${tomorrow}T09:00:00-07:00`, end: `${tomorrow}T14:00:00-07:00` }],
  };
  // The October 27 page puts its eligibility section after the introductory
  // paragraph. Checking the shortened display description loses that evidence.
  const introduction = "Join an upcoming campus vaccination clinic this autumn. ".repeat(8);
  const restricted = introduction + "Who is Eligible? All students, faculty, staff, postdocs, retirees, and campus affiliates are welcome to participate.";
  const events = await runWith([
    localistEvent({ ...clinic, id: 1, description_text: restricted }),
    localistEvent({ ...clinic, id: 2, description_text: introduction + "Who is Eligible? Everyone in the general public is welcome." }),
    localistEvent({ ...clinic, id: 3, title: "Community Immunization Research Lecture", description_text: restricted }),
    // The October 29 Page Mill clinic has the same eligibility section,
    // without any audience metadata. Its location prefix must not bypass it.
    localistEvent({ ...clinic, id: 4, title: "Page Mill: Flu & COVID-19 Vaccination Clinic",
      filters: {}, description_text: restricted }),
    localistEvent({ ...clinic, id: 5, title: "Page Mill: Flu & COVID-19 Vaccination Clinic",
      description_text: introduction + "Who is Eligible? Everyone in the general public is welcome." }),
  ]);
  assert.deepEqual(events.map((event) => event.id), [2, 3, 5].map((id) => `stanford-${id}-${tomorrow}`));
});

test("Stanford room entry instructions outrank Everyone for a physical destination", async () => {
  const tomorrow = dayPT(1);
  const common = {
    title: "Public Seminar", location_name: "Building 120, McClatchy Hall, Main Quad",
    filters: { event_audience: [{ name: "Everyone" }] },
    description_text: "A public seminar with lunch for Stanford affiliates beforehand.",
    instances: [{ start: `${tomorrow}T12:00:00-07:00` }],
  };
  const room = "Studio S40 - bring your Stanford ID card/mobile ID to enter the building";
  const events = await runWith([
    localistEvent({ ...common, id: 1, room_number: room }),
    localistEvent({ ...common, id: 2, room_number: room, experience: "hybrid" }),
    localistEvent({ ...common, id: 3, room_number: room, experience: "virtual" }),
    localistEvent({ ...common, id: 4, room_number: "Studio S40; no Stanford ID required" }),
    localistEvent({ ...common, id: 5, room_number: "Studio S40" }),
  ]);
  assert.deepEqual(events.map((event) => event.id), [3, 4, 5].map((id) => `stanford-${id}-${tomorrow}`));
  assert.equal(events[0].virtual, true, "online access does not require building entry");
});

test("the dated Stanford ID restriction also withholds stale physical copies", () => {
  const stale = {
    title: "Australia's new social media legislation: the world is watching",
    venue: "Building 120, McClatchy Hall, Main Quad", date: "2026-10-27",
    description: "A public seminar.",
  };
  assert.equal(isEventEditoriallySuppressed(stale), true);
  for (const other of [
    { ...stale, virtual: true }, { ...stale, date: "2027-10-27" },
    { ...stale, title: "Another seminar" }, { ...stale, venue: "Another venue" },
  ]) assert.equal(isEventEditoriallySuppressed(other), false);
});

test("a dated event takes its day and clock from the occurrence, not first_date", async () => {
  const tomorrow = dayPT(1);
  const [event] = await runWith([
    localistEvent({
      id: 53809380678267,
      title: "Fireside Chat with Anne Wojcicki",
      first_date: tomorrow,
      last_date: tomorrow,
      instances: [{ start: `${tomorrow}T12:00:00-07:00`, end: `${tomorrow}T13:00:00-07:00` }],
    }),
  ]);
  assert.equal(event.date, tomorrow, "must not land a day early");
  assert.equal(event.time, "12:00 PM");
  assert.equal(event.endTime, "1:00 PM");
  assert.equal(event.ongoing, false);
});

test("off-site Stanford events are filtered before spending the source's local-event cap", async () => {
  const tomorrow = dayPT(1);
  const instances = [{ start: `${tomorrow}T18:00:00-07:00`, end: `${tomorrow}T19:15:00-07:00` }];
  const offsite = {
    title: "Coral Bleaching Recovery with the Help of Healthy Corals",
    location_name: "Hopkins Marine Station",
    address: "120 Ocean View Blvd Pacific Grove, CA 93950", instances,
  };
  const events = await runWith([
    localistEvent({ id: 1, instances }),
    localistEvent({ ...offsite, id: 2, experience: "inperson" }),
    localistEvent({ ...offsite, id: 3, experience: "hybrid" }),
    localistEvent({ ...offsite, id: 4, experience: "virtual" }),
    localistEvent({ ...offsite, id: 5, title: "Field Trip to Hopkins Marine Station" }),
  ]);
  assert.deepEqual(events.map((e) => e.id), [1, 4, 5].map((id) => `stanford-${id}-${tomorrow}`));
  assert.equal(events[1].virtual, true, "an online-only event has no physical destination");
});

test("an all-day occurrence keeps a null time instead of inventing one", async () => {
  // The old bug's signature was a wall of identical "5:00 PM" starts — the
  // Pacific rendering of midnight UTC. No time is the honest answer here, and
  // the publish gate drops timeless non-ongoing rows on purpose.
  const tomorrow = dayPT(1);
  const [event] = await runWith([
    localistEvent({
      id: 7,
      title: "Labor Day Facility Hours",
      first_date: tomorrow,
      last_date: tomorrow,
      instances: [{ start: `${tomorrow}T00:00:00-07:00`, end: null }],
    }),
  ]);
  assert.equal(event.date, tomorrow);
  assert.equal(event.time, null);
});

test("each occurrence of a series gets its own dated card", async () => {
  // One Localist id covers every session, so an unscoped id collapsed Tuesday's
  // counseling slot and Wednesday's into a single card.
  const events = await runWith([
    localistEvent({
      id: 42,
      title: "Financial Counseling with Fidelity",
      first_date: dayPT(1),
      last_date: dayPT(2),
      instances: [{ start: `${dayPT(1)}T08:00:00-07:00`, end: `${dayPT(1)}T17:00:00-07:00` }],
    }),
    localistEvent({
      id: 42,
      title: "Financial Counseling with Fidelity",
      first_date: dayPT(1),
      last_date: dayPT(2),
      instances: [{ start: `${dayPT(2)}T08:00:00-07:00`, end: `${dayPT(2)}T17:00:00-07:00` }],
    }),
  ]);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.date), [dayPT(1), dayPT(2)]);
  assert.equal(new Set(events.map((e) => e.id)).size, 2, "ids must not collide across days");
});

test("an exhibit open today anchors to today, clock-free, once", async () => {
  // Localist lists an open run once per day it is open. All of those rows
  // collapse to the same card, and Stanford is capped at 30 events off a
  // date-sorted list — leaving the duplicates in spends the whole budget on
  // one exhibit before a single dated event is read.
  const events = await runWith([
    localistEvent({
      id: 99,
      title: "In Focus: Asian American Art from the Collection",
      description_text: "An exhibition drawn from the Cantor collection.",
      first_date: dayPT(-30),
      last_date: dayPT(30),
      instances: [{ start: `${dayPT(0)}T11:00:00-07:00`, end: `${dayPT(0)}T18:00:00-07:00` }],
    }),
    localistEvent({
      id: 99,
      title: "In Focus: Asian American Art from the Collection",
      description_text: "An exhibition drawn from the Cantor collection.",
      first_date: dayPT(-30),
      last_date: dayPT(30),
      instances: [{ start: `${dayPT(1)}T11:00:00-07:00`, end: `${dayPT(1)}T18:00:00-07:00` }],
    }),
  ]);
  assert.equal(events.length, 1, "an open run is one card, not one per open day");
  assert.equal(events[0].ongoing, true);
  assert.equal(events[0].date, dayPT(0));
  assert.equal(events[0].time, null, "an exhibition does not start at a clock time");
  assert.equal(events[0].id, "stanford-99", "a run keeps a stable id as it re-anchors each day");
});

test("a multi-day series that is not an exhibit stays a set of dated sessions", async () => {
  const events = await runWith([
    localistEvent({
      id: 5,
      title: "Empowered Relief Instructor Certification",
      description_text: "A certification course for clinicians.",
      first_date: dayPT(-3),
      last_date: dayPT(3),
      instances: [{ start: `${dayPT(1)}T08:30:00-07:00`, end: `${dayPT(1)}T16:30:00-07:00` }],
    }),
  ]);
  assert.equal(events[0].ongoing, false);
  assert.equal(events[0].date, dayPT(1));
  assert.equal(events[0].time, "8:30 AM");
});

test("museum drawing sessions and public tours keep their published occurrences and clocks", async () => {
  // Both current Stanford listings have year-long series bounds and mention
  // galleries/collections. Their actual programs are timed, not daily exhibits.
  const tomorrow = dayPT(1);
  const events = await runWith([
    localistEvent({
      id: 50967994153103,
      title: "Drop-In Drawing @ The Anderson",
      description_text: "Drop-In Drawing happens every 2nd and 4th Friday. Sketch your way through the galleries.",
      location_name: "Anderson Collection",
      first_date: dayPT(-30), last_date: dayPT(300),
      instances: [{ start: `${tomorrow}T12:00:00-07:00`, end: `${tomorrow}T13:00:00-07:00` }],
    }),
    localistEvent({
      id: 53694822395653,
      title: "Public Tour | Auguste Rodin",
      description_text: "Join us for a tour of our indoor and outdoor Rodin Sculptures! Our collection spans three galleries.",
      first_date: dayPT(-30), last_date: dayPT(300),
      instances: [{ start: `${tomorrow}T11:30:00-07:00`, end: `${tomorrow}T12:30:00-07:00` }],
    }),
  ]);
  assert.deepEqual(events.map(({ id, date, time, endTime, ongoing }) => ({ id, date, time, endTime, ongoing })), [
    { id: `stanford-50967994153103-${tomorrow}`, date: tomorrow, time: "12:00 PM", endTime: "1:00 PM", ongoing: false },
    { id: `stanford-53694822395653-${tomorrow}`, date: tomorrow, time: "11:30 AM", endTime: "12:30 PM", ongoing: false },
  ]);
});

test("a gallery program with only a past occurrence is not kept alive by its series bounds", async () => {
  const events = await runWith([
    localistEvent({
      title: "Public Tour | Auguste Rodin",
      description_text: "Explore the sculpture collection with a guide.",
      first_date: dayPT(-30), last_date: dayPT(300),
      instances: [{ start: `${dayPT(-1)}T11:30:00-07:00`, end: `${dayPT(-1)}T12:30:00-07:00` }],
    }),
  ]);
  assert.deepEqual(events, []);
});

test("gallery conversations keep each scheduled session rather than the exhibition's run", async () => {
  // Stanford's JANE! page lists 2–3 PM conversations on specific dates. Its
  // October–January series bounds and exhibition copy do not make it on view.
  const tomorrow = dayPT(1);
  const nextDay = dayPT(2);
  const program = {
    id: 53818764048938,
    title: "Gallery Conversations | JANE!",
    description_text: "Join us for casual in-gallery conversations in our special exhibition, JANE!, facilitated by our Museum Engagement Guides.",
    first_date: dayPT(-20), last_date: dayPT(73),
    filters: { event_types: [{ name: "Tour" }] },
  };
  const events = await runWith([dayPT(-1), tomorrow, nextDay].map((date) =>
    localistEvent({
      ...program,
      instances: [{ start: `${date}T14:00:00-07:00`, end: `${date}T15:00:00-07:00` }],
    }),
  ));
  assert.deepEqual(events.map(({ id, date, time, endTime, ongoing }) => ({ id, date, time, endTime, ongoing })), [
    { id: `stanford-53818764048938-${tomorrow}`, date: tomorrow, time: "2:00 PM", endTime: "3:00 PM", ongoing: false },
    { id: `stanford-53818764048938-${nextDay}`, date: nextDay, time: "2:00 PM", endTime: "3:00 PM", ongoing: false },
  ]);
});

test("an exhibition using tour figuratively in its name remains an ongoing exhibit", async () => {
  const [event] = await runWith([
    localistEvent({
      title: "Something Sensational to Read: A Tour of Silicon Valley LGBTQ+ Publications, 1950 to Today",
      description_text: "An exhibit of newspapers, magazines, and other community publications.",
      location_name: "Library",
      first_date: dayPT(-30), last_date: dayPT(30),
      instances: [{ start: `${dayPT(0)}T00:00:00-07:00` }],
    }),
  ]);
  assert.equal(event.ongoing, true);
  assert.equal(event.date, dayPT(0));
  assert.equal(event.time, null);
});

test("an occurrence that has already happened is dropped", async () => {
  const events = await runWith([
    localistEvent({
      id: 6,
      title: "Department Meeting",
      first_date: dayPT(-2),
      last_date: dayPT(-2),
      instances: [{ start: `${dayPT(-2)}T07:00:00-07:00`, end: `${dayPT(-2)}T08:00:00-07:00` }],
    }),
  ]);
  assert.deepEqual(events, []);
});

test("a closed exhibit does not linger as ongoing", async () => {
  const events = await runWith([
    localistEvent({
      id: 8,
      title: "Summer Group Exhibition",
      description_text: "Works by regional artists.",
      first_date: dayPT(-60),
      last_date: dayPT(-2),
      instances: [{ start: `${dayPT(-2)}T10:00:00-07:00`, end: `${dayPT(-2)}T17:00:00-07:00` }],
    }),
  ]);
  assert.deepEqual(events, []);
});
