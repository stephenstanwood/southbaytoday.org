import test from "node:test";
import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import {
  applyVerifiedEventFacts,
  copyMentionsEvent,
  eventCopyFactConflict,
  rotationActivityForOccurrence,
} from "./eventSourceFacts.mjs";
import { eventBlurbCacheKey, resolveEventBlurbs } from "./eventBlurbs.mjs";
import { isRegistrationClosedForDay, requiresAdvanceRegistration, requiresAttendanceConfirmation, REGISTRATION_APPOINTMENT } from "./eventFilters.mjs";

const lost = { id: "tm-Z7r9jZ1A7x78x", date: "2026-09-05", title: "Lost 80s Live", venue: "Mountain Winery", description: "", blurb: "Sing along to a lineup of 80s cover bands." };
const duelo = { id: "sanjosetheaters-eb92ddeb3f824327", date: "2026-09-05", title: "Grupo Duelo – Gravedad Tour 2026", venue: "San Jose Civic" };

test("dated festival, off-site workshop and admission repairs survive sparse blurb resolution", async () => {
  const rows = [
    { date: "2026-10-31", url: "https://www.aztecadancers.com/dia-de-muertos", time: "10:00 PM", expected: { time: "2:00 PM", endTime: "10:00 PM", cost: "free", kidFriendly: true } },
    { date: "2026-11-01", url: "https://www.aztecadancers.com/dia-de-muertos", time: "10:00 PM", expected: { time: "10:00 AM", endTime: "6:00 PM" } },
    { date: "2026-10-25", url: "https://events.scu.edu/live/events/511268-encore-markey-center-on-the-road-with-fr-bill", city: "santa-clara", expected: { city: "santa-cruz", venue: "Villa Maria Del Mar", address: "21918 E Cliff Dr, Santa Cruz, CA 95062", endTime: "4:30 PM" } },
    { date: "2027-01-02", url: "https://paloalto.bibliocommons.com/events/6ab8557e607483003829d148", registration: "required", registrationClosesBy: "2026-11-06T19:00:00Z", expected: { registration: "none", registrationClosesBy: null } },
    { date: "2026-12-06", url: "https://www.keplers.org/upcoming-events-internal/holiday-party-2026", venue: "Kepler's", cost: "paid", expected: { venue: "Kepler's Books", cost: null } },
    { date: "2026-12-31", url: "https://paloalto.bibliocommons.com/events/6a750a3788e9bf28003613ac", category: "arts", expected: { category: "family" } },
  ];
  for (const { expected, ...raw } of rows) {
    const original = structuredClone(raw);
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    for (const [field, value] of Object.entries(expected)) assert.deepEqual(events[0][field], value, `${raw.url}: ${field}`);
    assert.deepEqual(raw, original);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.equal(applyVerifiedEventFacts({ ...raw, date: "2028-01-01" }).url, raw.url);
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2028-01-01" }), { ...raw, date: "2028-01-01" });
  }
});

test("the herbalism workshop retains Stanford's explicit barn entrance through sparse blurb resolution", async () => {
  const raw = {
    id: "stanford-54178302622575-2026-10-21", date: "2026-10-21",
    title: "10/21: A Thyme to Gather at the Farm: An Herbalism Workshop",
    url: "https://events.stanford.edu/event/rescheduled-to-1021-a-thyme-to-gather-at-the-farm-a-herbalism-workshop",
    venue: "O'Donohue Educational Farm", address: "175 Electioneer Rd, Stanford, CA 94305",
    time: "5:00 PM", endTime: "6:30 PM", cost: "free", description: "",
    blurb: "Gather at O'Donohue Educational Farm for a hands-on herbalism workshop.",
  };
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].venue, "Huffington Barn at O'Donohue Educational Farm");
  assert.equal(events[0].address, "555 Fremont Rd, Stanford, CA 94305");
  assert.match(events[0].attendanceNote, /Use Huffington Barn at 555 Fremont Road/);
  for (const key of ["id", "date", "title", "url", "time", "endTime", "cost", "description", "blurb"]) {
    assert.equal(events[0][key], raw[key], key);
  }
  assert.deepEqual(raw, original);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [
    { ...raw, date: "2026-10-22" },
    { ...raw, url: "https://events.stanford.edu/event/another-farm-workshop" },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "the farm's other programs keep their own entrance");
});

test("verified optional library signups stay ungated in retained snapshots without changing other occurrences", async () => {
  for (const [date, library, sourceId] of [
    ["2026-10-24", "sjpl", "6ab19c4ba5dbde002aa64a61"],
    ["2026-11-15", "paloalto", "697a5067834cbb3dea29ea08"],
    ["2026-12-19", "paloalto", "6ad7a697295d793e2d1803ec"],
  ]) {
    const raw = {
      date, url: `https://${library}.bibliocommons.com/events/${sourceId}`,
      title: "Library program", time: "3:00 PM", registration: "required",
      registrationClosesBy: `${date}T23:00:00.000Z`,
    };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(requiresAdvanceRegistration(events[0]), false);
    assert.equal(isRegistrationClosedForDay(events[0], date), false);
    assert.equal(events[0].registrationClosesBy, null);
    assert.equal(events[0].time, raw.time);
    assert.match(events[0].attendanceNote, /Registration is (?:recommended|not required)\./);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, url: raw.url.replace("/events/", "/v2/events/") }).registration, "none");
    for (const other of [
      { ...raw, date: "2027-12-19" },
      { ...raw, url: `https://${library}.bibliocommons.com/events/another-program` },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Guys & Dolls corrects the stale run opening without moving any ticketed performance", async () => {
  const raw = {
    title: "Guys & Dolls", url: "https://thepear.vbotickets.com/events?eid=193671",
    venue: "The Pear Theatre", time: "8:00 PM", endTime: null, cost: "paid",
    description: "Guys & Dolls by Frank Loesser. Feb 20 – March 7. Welcome to a vibrant New York City.",
    blurb: "Watch gamblers and missionaries collide in Guys & Dolls.",
  };
  for (const date of ["2027-02-19", "2027-02-27", "2027-03-07"]) {
    const events = [{ ...raw, date }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.match(events[0].description, /Feb 19 – March 7/);
    for (const key of ["date", "time", "endTime", "cost", "blurb", "url"]) {
      assert.equal(events[0][key], key === "date" ? date : raw[key], key);
    }
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  }
  for (const other of [
    { ...raw, date: "2027-02-18" },
    { ...raw, date: "2027-03-08" },
    { ...raw, date: "2027-02-19", url: "https://thepear.vbotickets.com/events?eid=193670" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("retained Los Gatos LibCal records use the verified library entrance without moving other venues", async () => {
  const raw = {
    date: "2026-10-24", title: "Girls Who Code", city: "los-gatos",
    venue: "Los Gatos Library", address: "110 E Main St, Los Gatos, CA 95030",
    url: "https://losgatosca.libcal.com/event/17444954", time: "10:00 AM", endTime: "12:00 PM",
    blurb: "Learn coding skills at Los Gatos Library.",
  };
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], { ...raw, address: "100 Villa Ave, Los Gatos, CA 95030" });
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.deepEqual(raw, original);
  for (const address of ["110 E Main St, Los Gatos", "110 E. Main Street, Los Gatos, CA 95030"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, address }).address, "100 Villa Ave, Los Gatos, CA 95030");
  }
  for (const other of [
    { ...raw, venue: "Los Gatos Civic Center Lawn" },
    { ...raw, venue: "NUMU" },
    { ...raw, virtual: true },
    { ...raw, city: "mountain-view" },
    { ...raw, url: "https://example.org/another-event" },
    { ...raw, address: "Another source address" },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "unrelated locations remain unchanged");
});

test("the volunteer meal's conflicting header and body clocks require confirmation without inventing a schedule", async () => {
  const raw = {
    date: "2026-10-24", title: "Share a Meal with One in Need", venue: "Mantra Room",
    url: "https://www.meetup.com/san-jose-diet-meetup-group/events/316768949/",
    time: "3:00 PM", endTime: "7:00 PM", registration: "none", cost: null,
    blurb: "Cook and distribute vegan meals at Mantra Room.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const { attendanceStatus, attendanceNote, ...preserved } = events[0];
  assert.deepEqual(preserved, raw);
  assert.equal(attendanceStatus, "needs-confirmation");
  assert.equal(requiresAttendanceConfirmation(events[0]), true);
  assert.match(attendanceNote, /header lists 3–7 PM/);
  assert.match(attendanceNote, /cooking begins at 5 PM.*6:30–8 PM/);
  assert.match(attendanceNote, /Confirm the volunteer schedule/);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [
    { ...raw, date: "2026-11-07" },
    { ...raw, url: "https://www.meetup.com/san-jose-diet-meetup-group/events/another-session/" },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "other occurrences keep their source schedule");
});

test("speed puzzling preserves paid competition signup and its separate free walk-in corner", async () => {
  const raw = {
    id: "meetup-52f12c160d54c2c9", date: "2026-11-07", title: "11/7 Team Speed Puzzling!",
    url: "https://www.meetup.com/social-speed-puzzling/events/315893663/",
    venue: "Empire Armadillo BBQ & Deli", time: "1:00 PM", endTime: "4:00 PM",
    cost: null, registration: "none",
  };
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.equal(actual.cost, "paid");
  assert.equal(actual.registration, "required");
  assert.equal(requiresAdvanceRegistration(actual), true);
  assert.match(actual.costNote, /\$15.*casual puzzling is free/);
  assert.match(actual.attendanceNote, /\$15 per person and requires registration/);
  assert.match(actual.attendanceNote, /1:15 PM.*1:30 PM/);
  assert.match(actual.attendanceNote, /casual puzzling corner welcomes walk-ins without registration/);
  assert.equal(actual.time, raw.time);
  assert.equal(actual.endTime, raw.endTime);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  assert.deepEqual(raw, original);
  for (const registration of ["full", "closed", REGISTRATION_APPOINTMENT]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-11-07" }).registration, "none");
  assert.equal(applyVerifiedEventFacts({ ...raw, url: "https://www.meetup.com/social-speed-puzzling/events/another-session/" }).registration, "none");
});

test("Danny the Dragon breakfast retains the organizer's all-ages welcome and ticket price", async () => {
  const raw = {
    date: "2026-12-06", title: "Holiday Breakfast with Danny the Dragon",
    url: "https://e.givesmart.com/events/P0d/i/_All/AS7u/?search=",
    venue: "Happy Hollow Park & Zoo", time: "9:00 AM", cost: null, kidFriendly: false,
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.equal(actual.kidFriendly, true);
  assert.equal(actual.cost, "paid");
  assert.match(actual.costNote, /\$50.*all-day park admission/);
  assert.match(actual.attendanceNote, /All ages welcome/);
  assert.match(actual.attendanceNote, /\$50 ticket includes breakfast/);
  assert.equal(actual.time, raw.time);
  assert.equal(actual.registration, undefined, "a ticket-platform account is not an advance-registration requirement");
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2027-12-06" }), { ...raw, date: "2027-12-06" });
});

test("Solar Sunday's optional Meetup RSVP cannot become a public-admission gate", async () => {
  const raw = {
    id: "meetup-6b6657a0f25625c8", date: "2026-11-01", title: "Solar Sunday – See Our Sun Up Close",
    url: "https://www.meetup.com/sj-astronomy/events/312677419/", venue: "Houge Park",
    time: "1:30 PM", endTime: "3:30 PM", registration: "required", cost: null,
    registrationClosesBy: "2026-10-31T23:59:00Z",
  };
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.equal(actual.cost, "free");
  assert.equal(actual.registration, "none");
  assert.equal(actual.registrationClosesBy, null);
  assert.equal(requiresAdvanceRegistration(actual), false);
  assert.match(actual.attendanceNote, /Walk-ins welcome.*RSVP is optional/);
  for (const key of ["id", "date", "title", "url", "venue", "time", "endTime"]) assert.equal(actual[key], raw[key]);
  assert.deepEqual(raw, original);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const other of [{ ...raw, date: "2026-12-06" }, { ...raw, url: "https://www.meetup.com/sj-astronomy/events/another-session/" }]) {
    assert.equal(applyVerifiedEventFacts(other), other, "unverified occurrences keep their own access state");
  }
});

test("the museum's free Halloween admission survives sparse intake without affecting other dates", () => {
  const raw = {
    date: "2026-10-31", title: "Halloween Night at the Museum", cost: "paid",
    url: "https://www.moah.org/moahevents/halloween-night-at-the-museum-1",
  };
  assert.equal(applyVerifiedEventFacts(raw).cost, "free");
  const otherDate = { ...raw, date: "2027-10-31" };
  assert.deepEqual(applyVerifiedEventFacts(otherDate), otherDate);
});

test("October's verified workshop topic, meeting cadence and family audience survive refresh", async () => {
  const workshop = {
    date: "2026-10-22", title: "ESL Workforce Development Workshop - Day 4: Interview Skills & Answering Questions",
    url: "https://sjpl.bibliocommons.com/events/6aa1bf97101eb7003f2ec8f1", venue: "Tully Library",
    time: "11:30 AM", description: "Learn workplace communication. Workshop Topic: Professional Introductions & My Skills. Registration is required. Tema del taller: Presentaciones Profesionales y Mis Habilidades. Es necesario registrarse.",
  };
  const correctedWorkshop = applyVerifiedEventFacts(workshop);
  assert.equal(correctedWorkshop.description, "Learn workplace communication. Registration is required. Es necesario registrarse.");
  assert.equal(correctedWorkshop.time, workshop.time);
  const correctedSource = { ...workshop, description: "Workshop Topic: Interview Skills & Answering Questions. Registration is required." };
  assert.deepEqual(applyVerifiedEventFacts(correctedSource), correctedSource);
  assert.equal(applyVerifiedEventFacts({ ...workshop, date: "2026-10-24" }).description, workshop.description);

  const meeting = { date: "2026-10-24", time: "4:00 PM", venue: "Calabazas Library",
    url: "https://sjpl.bibliocommons.com/events/6a3d7bfbed35742f00fe48cf",
    description: "Come join us the first Thursday of the month for our monthly Calabazas Teens Reach meeting. No registration required." };
  assert.equal(applyVerifiedEventFacts(meeting).description,
    "Come join us for our monthly Calabazas Teens Reach meeting. No registration required.");
  assert.equal(applyVerifiedEventFacts({ ...meeting, date: "2026-11-05" }).description, meeting.description);

  const summit = { date: "2026-10-24", title: "Child Studies Legislative Summit", time: "2:00 PM",
    url: "https://events.scu.edu/arts-and-sciences/event/521019-child-studies-legislative-summit",
    venue: "Alumni Science Hall", category: "education", kidFriendly: false, description: "Join an interactive afternoon focused on youth voice and civic engagement." };
  const events = [{ ...summit }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].category, "family");
  assert.equal(events[0].kidFriendly, true);
  assert.equal(events[0].description, summit.description);
  assert.equal(events[0].time, summit.time);
  const otherSummit = { ...summit, date: "2026-10-25" };
  assert.equal(applyVerifiedEventFacts(otherSummit), otherSummit);
});

test("Panama Deception drops obsolete current claims from source and polished descriptions", async () => {
  const { polishDescription } = await import("../../../scripts/generate-events.mjs");
  const event = {
    id: "paloalto-6a61028ecca66c2f00a54304", date: "2026-12-03",
    title: "Documentary: UNAFF presents the Panama Deception", city: "palo-alto",
    venue: "Rinconada Library", time: "6:00 PM", endTime: "7:45 PM",
    url: "https://paloalto.bibliocommons.com/events/6a61028ecca66c2f00a54304",
    blurb: "Watch the Academy Award-winning documentary The Panama Deception at the library.",
  };
  const lead = "The screening includes a discussion.";
  const history = "It was cablecast on Cinemax in the United States during October of that same year";
  const relocation = "EP has recently moved its offices out of New York and California. The new headquarters for all operations is now in Chapel Hill, North Carolina.";
  for (const description of [
    `${lead} ${relocation} ${history} and currently, Bravo-the Independent Film Channel retains the rights to cablecast the film. Funding includes the I. Roderick MacArthur Foundation.`,
    `${lead} ${relocation} ${history}. Currently, Bravo (the Independent Film Channel) retains the rights to cablecast the film. Funding includes the I. Roderick Mac Arthur Foundation.`,
  ]) {
    const raw = { ...event, description };
    const original = structuredClone(raw);
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].description, `${lead} ${history}. Funding includes the I. Roderick MacArthur Foundation.`);
    assert.equal(applyVerifiedEventFacts({ ...raw, description: polishDescription(description) }).description,
      events[0].description);
    for (const key of Object.keys(event)) assert.equal(events[0][key], event[key], key);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.deepEqual(raw, original);
    for (const other of [
      { ...raw, date: "2026-12-04" },
      { ...raw, url: "https://paloalto.bibliocommons.com/events/another-film" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
  const correctedSource = { ...event, description: "The screening includes a discussion. No television-rights claim is made." };
  assert.deepEqual(applyVerifiedEventFacts(correctedSource), correctedSource);
  const alias = { ...event, url: event.url.replace("/events/", "/v2/events/"), description: `${history} and currently, Bravo-the IndependentFilm Channel retains the rights to cablecast the film.` };
  assert.equal(applyVerifiedEventFacts(alias).description, `${history}.`);
});

test("Tangling the Digital keeps exhibition facts through sparse intake and carried blurbs", async () => {
  const raw = {
    id: "stanford-53948654465100-2026-10-21", date: "2026-10-21",
    title: "Tangling the Digital: Weaving, Printmaking, Computing",
    url: "https://events.stanford.edu/event/tangling-the-digital-weaving-printmaking-computing",
    venue: "McMurtry Building", city: "palo-alto", time: "1:00 PM", endTime: "5:00 PM",
    ongoing: false, category: "education", cost: null,
    description: "Digital objects are often seen as alien to craft, as though no hands had shaped them.",
    blurb: "See how weaving, printmaking, and computing intersect in this talk on digital craft.",
  };
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  const corrected = events[0];
  assert.equal(corrected.category, "arts");
  assert.equal(corrected.cost, "free");
  assert.match(corrected.description, /Coulter Art Gallery/);
  assert.match(corrected.description, /Monday–Friday, 1–5 PM; closed November 23–27/);
  assert.match(corrected.blurb, /free exhibition/);
  assert.doesNotMatch(corrected.blurb, /talk/);
  for (const key of ["id", "date", "title", "url", "venue", "city", "time", "endTime", "ongoing"]) {
    assert.equal(corrected[key], raw[key], key);
  }
  assert.equal(stats.generated, 0);
  assert.deepEqual(raw, original);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  for (const other of [
    { ...raw, date: "2026-09-28" },
    { ...raw, date: "2026-12-05" },
    { ...raw, url: "https://events.stanford.edu/event/a-separate-talk" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("homework blurbs cannot expand a program's published subject coverage", () => {
  const event = {
    title: "Homework Help for Grades K-6", venue: "Cupertino Library",
    description: "Free homework help with a trained tutor. No registration is required.",
  };
  for (const copy of [
    "Bring your homework and work with a trained tutor for free help in any subject.",
    "Get free homework help in all school subjects.",
    "Tutors can help with every academic subject.",
  ]) assert.equal(eventCopyFactConflict(copy, event), "unsupported tutoring subject coverage");
  assert.equal(eventCopyFactConflict("Bring your homework and work with a trained tutor for free.", event), null);
  assert.equal(eventCopyFactConflict(
    "Get homework help in any subject.",
    { ...event, description: "Get homework help in any subject with a live online tutor." },
  ), null);
  assert.equal(eventCopyFactConflict(
    "Explore any subject in a painting.", { title: "Open Art Studio", description: "Paint together." },
  ), null);
  assert.equal(eventCopyFactConflict(
    "Homework Help has free trained tutors. Open Art Studio lets you paint any subject.", event,
  ), null);
});

test("unsupported subject coverage is rejected from carried and cached homework blurbs", async (t) => {
  const event = {
    title: "Homework Help for Grades K-6", venue: "Cupertino Library",
    date: "2026-10-20", time: "4:30 PM",
    url: "https://sccl.bibliocommons.com/events/6a86814fdb86e4004d866f3f",
    description: "Free homework help with a trained tutor. No registration is required.",
    blurb: "Bring your homework and work with a trained tutor for free help in any subject.",
  };
  const cache = { byKey: { [eventBlurbCacheKey(event)]: { blurb: event.blurb } } };
  const cachePath = fileURLToPath(new URL("../../data/south-bay/event-blurb-cache.json", import.meta.url));
  const originalRead = fs.readFileSync;
  t.mock.method(fs, "readFileSync", (path, ...args) =>
    path === cachePath ? JSON.stringify(cache) : originalRead(path, ...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const events = [{ ...event }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].blurb, undefined);
  assert.equal(stats.generated, 0);
  assert.equal(stats.cache_hits, 0);
  for (const field of ["title", "venue", "date", "time", "url", "description"]) {
    assert.equal(events[0][field], event[field]);
  }
  assert.match(event.blurb, /any subject/);
});

test("Stanford's Crossover uses the outdoor fan-fest site without claiming free admission", () => {
  const raw = {
    date: "2026-10-23", title: "The Crossover: Basketball Fan Fest",
    url: "https://gostanford.com/the-crossover-2026", venue: "Stanford Stadium",
    address: "Stanford Stadium, 625 Nelson Rd, Stanford, CA", kidFriendly: false,
    time: "5:30 PM", endTime: "6:30 PM", cost: null, category: "family",
    description: "A free outdoor preseason basketball event before the football game, featuring a shooting competition, kids' dunk contest, meet-and-greets with Stanford student-athletes, and free T-shirts.",
    blurb: "Watch a shooting competition and kids' dunk contest at this outdoor basketball fan fest.",
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert.equal(corrected.venue, "Cobb Track and Angell Field — Hammer Throw area");
  assert.equal(corrected.address, "");
  assert.equal(corrected.kidFriendly, true);
  assert.match(corrected.description, /^An outdoor preseason/);
  assert.match(corrected.description, /free T-shirts/);
  for (const key of ["date", "time", "endTime", "cost", "category", "blurb"]) assert.equal(corrected[key], raw[key]);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const other = { ...raw, date: "2027-10-23" };
  assert.equal(applyVerifiedEventFacts(other), other);
});

test("the verified Stanford Live performances retain their music category", () => {
  for (const raw of [
    { date: "2026-10-23", time: "7:00 PM", url: "https://live.stanford.edu/events/26-27season/studio/jontavious-willis/", category: "community" },
    { date: "2026-10-23", time: "9:00 PM", url: "https://live.stanford.edu/events/26-27season/studio/jontavious-willis/", category: "community" },
    { date: "2026-11-11", time: "7:00 PM", url: "https://live.stanford.edu/events/26-27season/studio/bob-marley/", category: "education" },
  ]) {
    const corrected = applyVerifiedEventFacts(raw);
    assert.equal(corrected.category, "music");
    assert.equal(corrected.time, raw.time);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    const other = { ...raw, date: "2027-10-23" };
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Cielo's opening night keeps its published hours and hotel address through stale intake", () => {
  const raw = {
    id: "replacement-cielo-id", date: "2026-11-27",
    title: "Cielo Hotel Valencia Rooftop Holiday Experience", city: "san-jose",
    time: "9:00 PM", endTime: null, venue: "Santana Row",
    address: "377 Santana Row, San Jose, CA 95128", cost: null,
    url: "https://santanarow.com/event/cielo-hotel-valencia-rooftop-holiday-experience/",
  };
  const original = structuredClone(raw);
  const corrected = applyVerifiedEventFacts(raw);
  assert.deepEqual(corrected, {
    ...raw, time: "5:00 PM", endTime: "9:00 PM",
    venue: "Cielo Rooftop at Hotel Valencia", address: "355 Santana Row, San Jose, CA 95128",
  });
  assert.deepEqual(raw, original);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  for (const other of [
    { ...raw, date: "2027-11-27" },
    { ...raw, url: "https://santanarow.com/event/another-event/" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("MACLA's October 23 concert keeps paid admission and the performance clock through sparse publication", async () => {
  const raw = {
    id: "replacement-macla-id", date: "2026-10-23",
    title: "MACLA Presents: Diana Gameros in Concert Ft. Magik*Magik",
    venue: "MACLA", city: "san-jose", time: "7:30 PM", endTime: "9:30 PM",
    cost: "free", url: "https://maclaarte.org/events/volveralaluz/",
    description: "Tickets on sale now!", blurb: "Hear Diana Gameros with Magik*Magik.",
  };
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].time, "8:00 PM");
  assert.equal(events[0].cost, "paid");
  assert.match(events[0].costNote, /General admission \$30/);
  assert.match(events[0].costNote, /\$10 student/);
  assert.match(events[0].attendanceNote, /Doors open at 7:30 PM/);
  for (const key of ["id", "title", "date", "endTime", "venue", "city", "url", "description", "blurb"]) {
    assert.equal(events[0][key], raw[key], key);
  }
  assert.equal(stats.generated, 0);
  assert.deepEqual(raw, original);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2027-10-23" },
    { ...raw, url: "https://maclaarte.org/events/another-concert/" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Linden Tree's replacement book club retains its signup and age restrictions", async () => {
  const raw = {
    id: "replacement-book-club-id", date: "2026-10-25", time: "4:00 PM",
    title: "Middle Grade Book Club: Brittle Magic", venue: "Linden Tree Books",
    url: "https://www.lindentreebooks.com/events-calendar/", cost: "free",
    kidFriendly: false, description: "",
    blurb: "Discuss Brittle Magic with fellow middle grade readers.",
  };
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required");
  assert.equal(events[0].kidFriendly, true);
  assert.match(events[0].attendanceNote, /ages 9 and up/i);
  assert.match(events[0].attendanceNote, /RSVP by email/i);
  assert.match(events[0].attendanceNote, /Kate O'Shaughnessy will not attend/);
  for (const key of ["title", "date", "time", "venue", "url", "cost", "description", "blurb"]) {
    assert.equal(events[0][key], raw[key], key);
  }
  assert.equal(stats.generated, 0);
  assert.deepEqual(raw, original);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2027-10-25" },
    { ...raw, title: "Storytime with Oliver Chin" },
    { ...raw, venue: "Another bookstore" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("the November 14 JAMsj dedication preserves free admission and required RSVP through publication", async () => {
  const raw = {
    id: "replacement-museum-id", date: "2026-11-14",
    title: "World War II Japanese American Veteran Monument: Dedication & Gathering",
    venue: "Japanese American Museum of San Jose", city: "san-jose",
    time: "9:30 AM", endTime: "11:30 AM", cost: "paid",
    url: "https://www.jamsj.org/upcoming-events/cgm-dedication",
    description: "A community gathering and monument dedication.",
    blurb: "Gather at the museum for a monument dedication.",
  };
  const original = structuredClone(raw);
  const expected = {
    ...raw, cost: "free", registration: "required",
    attendanceNote: "Free with RSVP. See the museum's event page for signup details.",
  };
  const events = [{ ...raw }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], expected);
  assert.equal(requiresAdvanceRegistration(events[0]), true);
  assert.equal(stats.generated, 0);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.deepEqual(raw, original);
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2027-11-14" },
    { ...raw, url: "https://www.jamsj.org/upcoming-events/another-dedication" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Fall Family Day keeps the city's dated end time, free admission and source through intake", async () => {
  const { normalizeInboundEventPresentation } = await import("../../../scripts/lib/inbound-event-normalize.mjs");
  const url = "https://www.paloalto.gov/Events-Directory/Community-Services/2026-Fall-Family-Day";
  const intake = {
    title: "Fall Family Day", startsAt: "2026-10-18T14:00:00-07:00", endsAt: "2026-10-18T16:30:00-07:00",
    location: "Palo Alto Art Center, 1313 Newell Road, Palo Alto, CA 94303", sourceUrl: null,
  };
  const originalIntake = structuredClone(intake);
  const presentation = normalizeInboundEventPresentation(intake);
  assert.equal(presentation.time, "2:00 PM");
  assert.equal(presentation.endTime, "4:15 PM");
  assert.equal(presentation.url, url);
  const raw = {
    id: "replacement-newsletter-id", date: "2026-10-18", title: intake.title,
    venue: "Palo Alto Art Center", city: "palo-alto", address: intake.location,
    time: "2:00 PM", endTime: "4:30 PM", url: "", cost: null,
    description: "Family-friendly art activities inspired by the fall exhibition.",
    blurb: "Make art at the Palo Alto Art Center.",
  };
  const events = [{ ...raw }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], { ...raw, endTime: "4:15 PM", url, cost: "free" });
  assert.equal(stats.generated, 0);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.deepEqual(intake, originalIntake);
  assert.equal(raw.endTime, "4:30 PM");
  for (const other of [
    { ...raw, date: "2027-10-18" },
    { ...raw, title: "Another Family Day" },
    { ...raw, venue: "Another Art Center" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("the dated Roots newsletter and organizer records converge before cross-source dedupe", async () => {
  const { normalizeInboundEventPresentation } = await import("../../../scripts/lib/inbound-event-normalize.mjs");
  const { fuzzyDedupEvents } = await import("./eventFuzzyDedup.mjs");
  const intake = {
    title: "San Jose Roots Festival", startsAt: "2026-11-07T12:00:00-08:00", endsAt: "2026-11-07T16:00:00-08:00",
    location: "San Pedro Square Market, W. St John Street, San Jose, CA", sourceUrl: null,
  };
  const presentation = normalizeInboundEventPresentation(intake);
  const raw = {
    id: "replacement-newsletter-id", date: "2026-11-07", city: "san-jose",
    title: intake.title, venue: "San Pedro Square Market", address: intake.location,
    time: presentation.time, endTime: presentation.endTime, url: presentation.url,
    category: "arts", source: "City Newsletter", description: "A free festival celebrating San Jose's history.",
    blurb: "Celebrate San Jose's history with the community.",
  };
  const organizer = {
    ...raw, id: "organizer-id", title: "San José Roots", venue: "History Park",
    source: "History San Jose", description: "", url: "https://historysanjose.org/event/san-jose-roots/",
  };
  const original = structuredClone([raw, organizer]);
  const events = [raw, organizer].map((event) => ({ ...event }));
  await resolveEventBlurbs(events, { enabled: false });
  const { kept, droppedCount } = fuzzyDedupEvents(events);
  assert.equal(droppedCount, 1);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, "San José Roots");
  assert.equal(kept[0].venue, "Gonzales/Peralta Adobe");
  assert.equal(kept[0].address, "87 N San Pedro St., San José");
  assert.equal(kept[0].cost, "free");
  assert.equal(presentation.url, organizer.url, "the raw newsletter also gets the verified link before dedupe");
  assert.equal(presentation.venue, "Gonzales/Peralta Adobe");
  assert.equal(kept[0].time, "12:00 PM");
  assert.equal(kept[0].endTime, "4:00 PM");
  assert.deepEqual([raw, organizer], original);
  assert.deepEqual(applyVerifiedEventFacts(kept[0]), kept[0]);
  for (const other of [{ ...raw, date: "2027-11-07" }, { ...raw, venue: "Another Library" }, { ...raw, title: "Another Roots Concert" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Evergreen's dated bilingual sessions keep their attendance facts without conflicting monthly claims", async () => {
  const { polishDescription } = await import("../../../scripts/generate-events.mjs");
  for (const [date, sourceId] of [
    ["2026-10-19", "6a555243dee4ff5300c93bf4"],
    ["2026-10-20", "6a5553c764ed854800a5510a"],
  ]) {
    const raw = {
      id: `sjpl-${sourceId}`, date,
      title: "Music and Movement in Vietnamese and English and Craft",
      venue: "Evergreen Library", address: "2635 Aborn Rd San Jose", city: "san-jose",
      time: "4:30 PM", endTime: "5:30 PM", cost: "free", registration: "none",
      url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
      description: "We host Vietnamese Storytime and Craft every Friday, plus a special bilingual session on the fourth Tuesday of each month. Free, no registration is required. Thứ Sáu hằng tuần có hoạt động kể chuyện và thủ công tiếng Việt; riêng thứ Ba tuần thứ tư hằng tháng sẽ có chương trình kể chuyện song ngữ đặc biệt. Chương trình hoàn toàn miễn phí và không cần phải đăng ký trước.",
      blurb: "Sing songs and do movement activities in Vietnamese and English with the whole family at Evergreen Library.",
    };
    const expected = "We host Vietnamese Storytime and Craft every Friday. Free, no registration is required. Thứ Sáu hằng tuần có hoạt động kể chuyện và thủ công tiếng Việt. Chương trình hoàn toàn miễn phí và không cần phải đăng ký trước.";
    const original = structuredClone(raw);
    const events = [{ ...raw, description: polishDescription(raw.description) }];
    const stats = await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].description, expected);
    assert.deepEqual({ ...events[0], description: raw.description }, raw);
    assert.deepEqual(raw, original);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.equal(stats.generated, 0);
    for (const other of [
      { ...raw, date: "2026-10-27" },
      { ...raw, url: "https://sjpl.bibliocommons.com/events/another-session" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("stale BioBlitz snapshots retain the dated Milpitas entrance and required RSVP", async () => {
  const url = "https://www.eventbrite.com/e/coyote-creek-trail-bioblitz-tickets-1999128802062?aff=post";
  const raw = {
    id: "replacement-post-id", date: "2026-10-18", title: "Coyote Creek Trail BioBlitz",
    city: "san-jose", venue: "Coyote Creek", address: "", url,
    time: "9:00 AM", endTime: "11:30 AM", cost: "free", description: "",
    blurb: "Join a community survey of plants and wildlife along Coyote Creek Trail.",
  };
  for (const sourceUrl of [url, url.split("?")[0], "https://261018-bioblitz.eventbrite.com/"]) {
    const events = [{ ...raw, url: sourceUrl }];
    const stats = await resolveEventBlurbs(events, { enabled: false });
    const corrected = events[0];
    assert.equal(corrected.city, "milpitas");
    assert.equal(corrected.venue, "Coyote Creek Trail");
    assert.equal(corrected.address, "Ranch Dr. and Alviso Milpitas Rd, Milpitas, CA 95035");
    assert.equal(corrected.registration, "required");
    assert.equal(requiresAdvanceRegistration(corrected), true);
    assert.match(corrected.attendanceNote, /Ranch Drive entrance/);
    const { city, venue, address, registration, attendanceNote, ...preserved } = corrected;
    assert.deepEqual({ ...preserved, city: raw.city, venue: raw.venue, address: raw.address }, { ...raw, url: sourceUrl });
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    assert.equal(stats.generated, 0);
  }
  for (const registration of ["full", "closed", REGISTRATION_APPOINTMENT]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2026-10-25" },
    { ...raw, url: "https://example.org/another-bioblitz" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
  assert.equal(raw.city, "san-jose");
});

test("stale Edenvale tech-help copy retains the verified Chinese language option", async () => {
  const { polishDescription } = await import("../../../scripts/generate-events.mjs");
  const tail = "Would you like to find out more about computers? Learn at your own pace! No registration or appointment required.";
  for (const sentence of [
    "Offered in-person, in English or.",
    "Offered in person, in English.",
    "Offered in-person, in English.",
    "",
  ]) {
    const raw = {
      id: "sjpl-6a07b6ef278f7c2f008d79d9", date: "2026-10-20",
      title: "1:1 Tech Mentor", venue: "Edenvale Library", city: "san-jose",
      time: "3:30 PM", endTime: "5:30 PM", cost: "free",
      url: "https://sjpl.bibliocommons.com/events/6a07b6ef278f7c2f008d79d9",
      description: `Free. ${sentence} ${tail}`.replaceAll("  ", " "),
      blurb: "Get one-on-one help using your computer.",
    };
    const events = [{ ...raw, description: polishDescription(raw.description) }];
    const stats = await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].description,
      `Free. Offered in person, in English or Chinese. ${tail}`);
    assert.deepEqual({ ...events[0], description: raw.description }, raw);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.equal(stats.generated, 0);
    assert.equal(raw.description, `Free. ${sentence} ${tail}`.replaceAll("  ", " "));
    for (const other of [
      { ...raw, date: "2026-10-27" },
      { ...raw, url: "https://sjpl.bibliocommons.com/events/another-tech-session" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("the verified sold-out concert cannot return as an available stale ticket listing", async () => {
  const raw = {
    id: "replacement-ticket-id", date: "2026-11-12", time: "7:00 PM",
    title: "Tauren Wells: Air1 Worship Now Tour - San Jose, CA", venue: "Cathedral of Faith",
    url: "https://www.ticketweb.com/event/sold-out-tauren-wells-air1-cathedral-of-faith-tickets/14232924",
    description: "The Air1 Worship Now Tour returns this fall.",
    blurb: "Hear Tauren Wells at Cathedral of Faith.",
  };
  const events = [{ ...raw }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "full");
  assert.match(events[0].attendanceNote, /Tickets are sold out/);
  assert.equal(requiresAdvanceRegistration(events[0]), true);
  assert.equal(stats.generated, 0);
  const { registration, attendanceNote, ...preserved } = events[0];
  assert.deepEqual(preserved, raw);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.equal(applyVerifiedEventFacts({ ...raw, registration: "closed" }).registration, "closed");
  assert.equal(raw.registration, undefined);
  for (const other of [
    { ...raw, date: "2027-11-12" },
    { ...raw, url: "https://www.ticketweb.com/event/a-different-show/14232925" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("older museum snapshots cannot turn a full in-person lecture into a walk-up recommendation", async () => {
  const raw = {
    id: "replacement-snapshot-id", date: "2026-10-21", time: "5:30 PM", endTime: "7:00 PM",
    title: "Not Quite Created Equal? Who Got Left Out of the Declaration of Independence",
    venue: "Los Altos History Museum", city: "los-altos", cost: null,
    url: "https://www.losaltoshistory.org/events/not-quite-created-equal-who-got-left-out-of-the-declaration-of-independence/",
    description: "Caroline Winterer discusses the Declaration of Independence.",
    blurb: "Hear Caroline Winterer discuss who the Declaration included.",
  };
  const events = [{ ...raw }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(requiresAdvanceRegistration(events[0]), true);
  assert.equal(events[0].registration, "full");
  assert.match(events[0].attendanceNote, /In-person attendance is full/);
  assert.match(events[0].attendanceNote, /Register.*via Zoom/);
  const { registration, attendanceNote, ...preserved } = events[0];
  assert.deepEqual(preserved, raw);
  assert.equal(stats.generated, 0);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.equal(applyVerifiedEventFacts({ ...raw, registration: "closed" }).registration, "closed");
  assert.equal(raw.registration, undefined);
  for (const other of [
    { ...raw, date: "2027-10-21" },
    { ...raw, url: "https://www.losaltoshistory.org/events/another-lecture/" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Milpitas ESL preserves dated sessions while disclosing conflicting term and assessment information", async () => {
  const occurrences = [
    ["2026-10-19", "6a5992919943bdf31e9f816b"],
    ["2026-10-21", "6a5992919943bdf31e9f816c"],
    ["2026-10-26", "6a5992919943bdf31e9f816d"],
    ["2026-10-28", "6a5992919943bdf31e9f816e"],
    ["2026-11-02", "6a5992919943bdf31e9f816f"],
    ["2026-11-04", "6a5992919943bdf31e9f8170"],
  ];
  for (const [date, sourceId] of occurrences) {
    for (const [rangeWord, booking] of [
      ["to", "Please follow the link to make an appointment for your ESL assessment: https://outlook.office.com/boo..."],
      ["and", "Please make an appointment for your ESL assessment."],
    ]) {
      const raw = {
        id: `sccl-${sourceId}`, date, time: "6:00 PM", endTime: "8:00 PM",
        url: `https://sccl.bibliocommons.com/events/${sourceId}`,
        title: "Free Adult ESL Class", venue: "Milpitas Library", city: "milpitas", cost: "free",
        description: `The class meets from 6:00 PM to 8:00 PM at the Milpitas Library Program Room between February 9th ${rangeWord} May 20th. Regular attendance is required. ESL assessment dates: July 27th - August 19th. Class Dates: August 17th, 2025 - November 18, 2026, Mon & Weds 6:00 PM - 8:00 PM. ${booking}`,
        blurb: "Practice English speaking and listening skills at a beginner-to-intermediate level.",
      };
      const events = [{ ...raw }];
      const stats = await resolveEventBlurbs(events, { enabled: false });
      const corrected = events[0];
      assert.equal(requiresAttendanceConfirmation(corrected), true);
      assert.match(corrected.attendanceNote, /July 27–August 19 assessment dates and conflicting class date ranges/);
      assert.match(corrected.description, /Program Room\. Regular attendance is required\./);
      assert.match(corrected.description, /Confirm assessment and enrollment availability with Milpitas Library\./);
      assert.doesNotMatch(corrected.description, /February 9|Class Dates:|2025|ESL assessment dates:|outlook\.office/);
      assert.equal(corrected.registration, undefined, "uncertainty must not invent a closed or appointment-only class");
      for (const field of ["id", "date", "time", "endTime", "url", "title", "venue", "city", "cost", "blurb"]) {
        assert.equal(corrected[field], raw[field]);
      }
      assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
      assert.equal(stats.generated, 0);
      for (const other of [
        { ...raw, date: "2027-10-19" },
        { ...raw, date: "2026-10-20" },
        { ...raw, url: "https://sccl.bibliocommons.com/events/another-esl-class" },
        { ...raw, venue: "Cupertino Library" },
        { ...raw, city: "cupertino" },
        { ...raw, description: "Free adult English classes meet Mondays and Wednesdays, August 17–November 18, 2026. Contact Milpitas Library for enrollment." },
      ]) assert.equal(applyVerifiedEventFacts(other), other);
      for (const registration of ["required", "full", "closed", REGISTRATION_APPOINTMENT]) {
        assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
      }
      assert.equal(raw.attendanceStatus, undefined, "do not mutate the source record");
    }
  }
});

test("verified concert times and links survive newsletter refreshes and changed intake IDs", async () => {
  const rows = [
    ["2027-03-16", "Buena Vista Orchestra", "Carriage House", "8:00 PM", "", "7:30 PM",
      "https://montalvoarts.org/experience/carriage-house-concerts/the-buena-vista-orchestra/"],
    ["2027-04-16", "Peter Asher: Songs and Stories", "Carriage House", "8:00 PM", "", "7:30 PM",
      "https://montalvoarts.org/experience/carriage-house-concerts/peter-asher-songs-and-stories/"],
    ["2027-03-19", "The Spinners", "Heritage Theatre", "8:00 PM", "", "8:00 PM",
      "https://www.heritagetheatre.org/2026-2027-season-of-shows"],
    ["2027-03-13", "Stanley Clarke and Hiromi with the PUBLIQuartet", "Bing Concert Hall", "7:30 PM",
      "https://stanfordlive.stanford.edu", "7:30 PM",
      "https://live.stanford.edu/events/26-27season/bing-concert-hall/stanley-clarke-and-hiromi-with-the-publiquartet/"],
    ["2027-04-03", "Jack West: Guitars on Life", "The Studio", "7:00 PM", "https://stanfordlive.stanford.edu", "7:00 PM",
      "https://live.stanford.edu/events/26-27season/studio/jack-west-guitars-on-life/"],
  ];
  for (const [date, title, venue, time, url, expectedTime, expectedUrl] of rows) {
    const raw = {
      id: "replacement-newsletter-id", date, title, venue, time, url,
      address: "Source address", cost: null, description: "A live concert.",
      blurb: "Hear a live concert.",
    };
    const events = [{ ...raw }];
    const stats = await resolveEventBlurbs(events, { enabled: false });
    assert.deepEqual(events[0], { ...raw, time: expectedTime, url: expectedUrl });
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.equal(stats.generated, 0);
    assert.equal(raw.time, time);
    for (const other of [
      { ...raw, date: "2028-04-16" },
      { ...raw, title: "An unrelated concert", venue: "Another theatre" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("the ST Lee lecture retains required signup and never reopens a full or closed session", async () => {
  for (const registration of [undefined, "none", "required", "full", "closed", REGISTRATION_APPOINTMENT]) {
    const raw = {
      date: "2026-10-19", time: "4:00 PM", endTime: "5:00 PM", venue: "Encina Hall",
      title: "ST Lee Lecture featuring Former Congressman and Ambassador to Turkey Jeff Flake",
      url: "https://events.stanford.edu/event/st-lee-lecture-featuring-former-congressman-and-ambassador-to-turkey-jeff-flake",
      description: "Join Stanford's Freeman Spogli Institute for the ST Lee Lecture.",
      blurb: "Hear Stanford's St Lee Lecture.", registration,
    };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    const expected = ["full", "closed", REGISTRATION_APPOINTMENT].includes(registration) ? registration : "required";
    assert.equal(events[0].registration, expected);
    assert.equal(requiresAdvanceRegistration(events[0]), true);
    assert.match(events[0].attendanceNote, /Registration is required/);
    assert.equal(events[0].blurb, "Hear Stanford's ST Lee Lecture.");
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    for (const field of ["date", "time", "endTime", "venue", "description", "url"]) {
      assert.equal(events[0][field], raw[field]);
    }
    for (const other of [
      { ...raw, date: "2027-10-19" },
      { ...raw, url: "https://events.stanford.edu/event/another-lecture" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("late cache hits cannot restore incorrect university initials", async (t) => {
  const events = [
    {
      date: "2026-10-19", venue: "Encina Hall", time: "4:00 PM",
      title: "ST Lee Lecture featuring Former Congressman and Ambassador to Turkey Jeff Flake",
      url: "https://events.stanford.edu/event/st-lee-lecture-featuring-former-congressman-and-ambassador-to-turkey-jeff-flake",
    },
    {
      date: "2026-10-23", venue: "Lucas 106", time: "12:00 PM",
      title: "ISA Research Seminar: Vahid Akbari (University of Nottingham)",
      url: "https://events.scu.edu/leavey-school-of-business/event/518247-isa-research-seminar-vahid-akbari-university-of",
    },
  ];
  const cache = { byKey: {
    [eventBlurbCacheKey(events[0])]: { blurb: "Hear Stanford's St Lee Lecture." },
    [eventBlurbCacheKey(events[1])]: { blurb: "Hear the Isa Research Seminar." },
  } };
  const original = structuredClone(cache);
  const cachePath = fileURLToPath(new URL("../../data/south-bay/event-blurb-cache.json", import.meta.url));
  const originalRead = fs.readFileSync;
  t.mock.method(fs, "readFileSync", (path, ...args) =>
    path === cachePath ? JSON.stringify(cache) : originalRead(path, ...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(stats.cache_hits, 2, "exercise actual late cache assignment with no carried blurb");
  assert.equal(stats.generated, 0);
  assert.equal(events[0].blurb, "Hear Stanford's ST Lee Lecture.");
  assert.equal(events[1].blurb, "Hear the ISA Research Seminar.");
  for (const event of events) assert.deepEqual(applyVerifiedEventFacts(event), event);
  assert.deepEqual(cache, original, "dated repairs must not rewrite copy shared with other occurrences");
});

test("the Cupertino kite occurrence keeps its spelling across source notes and blurb refreshes", async () => {
  const raw = {
    date: "2026-10-26", url: "https://sccl.bibliocommons.com/events/6ab70960d6cf1f1a037de276",
    title: "Saranggola (Kite) Craft for Kids", venue: "Cupertino Library",
    time: "4:00 PM", endTime: "4:30 PM", cost: "free",
    description: "Make a sarrangola kite in room 101. Space is limited.",
    attendanceNote: "Make a sarrangola kite in room 101. Space is limited.",
    blurb: "Make a simple Filipino sarrangola kite.",
  };
  for (const blurb of [raw.blurb, undefined]) {
    const events = [{ ...raw, blurb }];
    const stats = await resolveEventBlurbs(events, { enabled: false });
    assert.match(events[0].blurb, /Filipino saranggola kite/);
    assert.equal(events[0].description, "Make a saranggola kite in room 101. Space is limited.");
    assert.equal(events[0].attendanceNote, events[0].description);
    for (const field of ["date", "url", "title", "venue", "time", "endTime", "cost"]) {
      assert.equal(events[0][field], raw[field]);
    }
    assert.equal(stats.generated, 0);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  }
  assert.match(raw.attendanceNote, /sarrangola/);
  for (const other of [
    { ...raw, date: "2027-10-26" },
    { ...raw, url: "https://sccl.bibliocommons.com/events/another-kite-craft" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("the Los Gatos gratitude class discloses conflicting rooms without selecting one on refresh", async () => {
  const raw = {
    date: "2026-11-03", url: "https://losgatosca.libcal.com/event/17036748",
    title: "Kids Mindful Art: Gratitude Trees (Ages 7-12)", venue: "Los Gatos Library",
    address: "100 Villa Ave, Los Gatos, CA 95030", time: "4:00 PM", endTime: "5:00 PM",
    registration: "required", cost: "free",
    description: "Make a gratitude tree with Makiko Niwa. This class will take place in the Technology Lab on the 2nd floor.",
    blurb: "Make a gratitude tree in the second-floor Technology Lab.",
  };
  for (const blurb of [raw.blurb, undefined]) {
    const events = [{ ...raw, blurb }];
    const stats = await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].description, "Make a gratitude tree with Makiko Niwa.");
    assert.doesNotMatch(events[0].blurb, /Technology Lab|Conference Room/);
    assert.match(events[0].attendanceNote, /location field says Conference Room/);
    assert.match(events[0].attendanceNote, /description says the second-floor Technology Lab/);
    for (const field of ["date", "url", "title", "venue", "address", "time", "endTime", "registration", "cost"]) {
      assert.equal(events[0][field], raw[field]);
    }
    assert.equal(stats.generated, 0);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  }
  assert.match(raw.blurb, /second-floor Technology Lab/);
  for (const other of [
    { ...raw, date: "2027-11-03" },
    { ...raw, url: "https://losgatosca.libcal.com/event/another-art-class" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("online library sessions cannot acquire a physical attendance claim from carried or cached copy", async () => {
  const blurb = "Practice everyday English conversation with fellow adult learners in a relaxed weekly session at the library.";
  const event = {
    title: "English Language Learners' (ELL) Conversation Club (via Pearl and Cambrian)",
    date: "2026-10-20", time: "11:00 AM", venue: "San Jose Public Library", virtual: true,
    url: "https://sjpl.bibliocommons.com/events/6938708d1e64afd01e4e250f",
    description: "We meet online on Tuesdays, 11 AM–12 PM. Register to receive the Zoom meeting link.",
    registration: "required", blurb,
  };
  assert.equal(eventCopyFactConflict(blurb, event), "physical library attendance for online event");
  for (const virtual of [false, undefined]) {
    assert.equal(eventCopyFactConflict(blurb, { ...event, virtual }), null);
  }
  for (const copy of [
    "Practice English conversation in a relaxed weekly online session.",
    "Discuss short stories with fellow readers at this virtual book club.",
    "Collect a book at the library before joining the online discussion.",
  ]) assert.equal(eventCopyFactConflict(copy, event), null);

  const events = [{ ...event }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].blurb, undefined);
  assert.equal(stats.generated, 0);
  assert.equal(stats.skipped, 1);
  for (const field of ["title", "date", "time", "venue", "virtual", "url", "description", "registration"]) {
    assert.equal(events[0][field], event[field]);
  }
  assert.equal(event.blurb, blurb);
});

test("Quilling Craft Club keeps its required signup when newsletter intake omits it", async () => {
  const raw = {
    date: "2026-11-04", url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114375/",
    title: "Quilling Craft Club", venue: "Central Park Library - Heritage Pavilion",
    time: "11:00 AM", endTime: "12:00 PM", blurb: "Learn paper quilling at the library.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required");
  assert.match(events[0].attendanceNote, /Registration is required; space is limited/);
  assert.equal(requiresAdvanceRegistration(events[0]), true);
  for (const [key, value] of Object.entries(raw)) assert.equal(events[0][key], value);
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2026-12-04" },
    { ...raw, url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/other/" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Saratoga's verified winter clocks also repair stale retained occurrences", async () => {
  for (const [date, sourceId, time, endTime] of [
    ["2026-11-01", "2690", "2:00 PM", "5:00 PM"],
    ["2026-11-27", "2686", "3:00 PM", "5:00 PM"],
    ["2026-12-05", "2681", "6:30 PM", null],
    ["2026-11-27", "2687", "6:00 PM", "9:00 PM"],
    ["2026-11-27", "2698", "5:30 PM", "6:30 PM"],
    ["2026-11-14", "2696", "9:00 AM", "12:00 PM"],
    ["2026-12-12", "2697", "9:00 AM", "12:00 PM"],
  ]) {
    const raw = {
      date, url: `https://www.saratoga.ca.us/calendar.aspx?EID=${sourceId}`,
      title: "City event", time: "8:00 AM", endTime: "11:00 AM", venue: "Source venue",
    };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.deepEqual(events[0], { ...raw, time, endTime });
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    for (const other of [
      { ...raw, date: "2027-11-14" },
      { ...raw, url: "https://www.saratoga.ca.us/calendar.aspx?EID=9999" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("verified library walk-ins survive optional form deadlines without losing capacity terms", async () => {
  for (const [date, sourceId, title, condition] of [
    ["2026-10-24", "6a3f10c0f56bd86e00b95e69", "Language and Culture Swap", /requested but not required/],
    ["2026-10-24", "6a87354c46e4c80031cbd152", "Teen Entrepreneurs & Small Business Skills", /20 participants; preregistered teens receive priority/],
    ["2026-10-24", "68fc0358c313c23700ded894", "Easy Tech Seniors", /if space is available;.*10 attendees/],
    ["2026-10-22", "6a83721e4cb69d003e216ef0", "Chess Club for Kids", /encouraged but not required/],
  ]) {
    for (const registration of ["required", "full", "closed"]) {
      const raw = {
        date, url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
        title, venue: "Source library", time: "2:00 PM", cost: "free",
        description: "The library's full participation terms.", registration,
        registrationClosesBy: "2026-09-24T18:00:00.000Z",
        blurb: "Join the library program.",
      };
      const original = structuredClone(raw);
      const events = [{ ...raw }];
      const stats = await resolveEventBlurbs(events, { enabled: false });
      assert.equal(events[0].registration, "none");
      assert.equal(events[0].registrationClosesBy, null);
      assert.equal(requiresAdvanceRegistration(events[0]), false);
      assert.equal(isRegistrationClosedForDay(events[0], date), false);
      assert.match(events[0].attendanceNote, condition);
      for (const field of ["title", "venue", "date", "time", "url", "cost", "description", "blurb"]) {
        assert.equal(events[0][field], raw[field]);
      }
      assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
      assert.deepEqual(raw, original);
      assert.equal(stats.generated, 0);
      assert.equal(applyVerifiedEventFacts({ ...raw, url: raw.url.replace("/events/", "/v2/events/") }).registration, "none");
      for (const other of [
        { ...raw, date: "2027-10-24" },
        { ...raw, url: "https://sjpl.bibliocommons.com/events/another-session" },
      ]) assert.equal(applyVerifiedEventFacts(other), other);
    }
  }
});

test("the St. Joseph's Hill hike retains its verified destination on sparse refresh", async () => {
  const raw = {
    date: "2026-10-31", url: "https://www.meetup.com/bay-area-hiking-walking-wellness-club/events/317070276/",
    title: "Green Excises Wellness Hike St.", venue: "Los Gatos Library", registration: "required",
    blurb: "Walk a group wellness hike.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].title, "Green Exercise Wellness Hike St. Joseph's Hill Preserve Rain or Shine");
  assert.deepEqual({ ...events[0], title: raw.title }, raw);
  for (const other of [
    { ...raw, date: "2026-11-01" },
    { ...raw, url: "https://www.meetup.com/another-group/events/123/" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Bascom's optional craft signups do not become admission gates on refresh", async () => {
  for (const [date, sourceId, title, time] of [
    ["2026-10-18", "6a85eaec69166f088b934e2d", "LEGO Fun!", "2:00 PM"],
    ["2026-10-20", "6a83713669166f088b92df77", "Origami for Kids", "3:15 PM"],
  ]) {
    for (const registration of ["required", "full", "closed"]) {
      const raw = {
        date, url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
        title, time, venue: "Bascom Library", cost: "free",
        description: "Registration recommended but not required.",
        blurb: "Make something at the library.", registration,
        registrationClosesBy: `${date}T21:00:00.000Z`,
      };
      const events = [{ ...raw }];
      const stats = await resolveEventBlurbs(events, { enabled: false });
      assert.equal(events[0].registration, "none");
      assert.equal(events[0].registrationClosesBy, null);
      assert.equal(requiresAdvanceRegistration(events[0]), false);
      assert.equal(isRegistrationClosedForDay(events[0], date), false);
      assert.equal(events[0].attendanceNote, "Registration is recommended but not required.");
      for (const field of ["title", "time", "date", "url", "venue", "cost", "description", "blurb"]) {
        assert.equal(events[0][field], raw[field]);
      }
      assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
      assert.equal(stats.generated, 0);
      assert.equal(raw.registration, registration);
      for (const other of [
        { ...raw, date: "2027-10-18" },
        { ...raw, url: "https://sjpl.bibliocommons.com/events/another-craft" },
      ]) assert.equal(applyVerifiedEventFacts(other), other);
    }
  }
});

test("Saratoga's enrolled ESL semester cannot become a walk-up on refresh", async () => {
  for (const [date, sourceId] of [
    ["2026-10-14", "6a5a9d66f4e5db3d00c27e15"],
    ["2026-10-19", "6a5a9d66f4e5db3d00c27e16"],
    ["2026-10-21", "6a5a9d66f4e5db3d00c27e17"],
    ["2026-10-26", "6a5a9d66f4e5db3d00c27e18"],
    ["2026-10-28", "6a5a9d66f4e5db3d00c27e19"],
    ["2026-11-02", "6a5a9d66f4e5db3d00c27e1a"],
  ]) {
    const raw = {
      id: `sccl-${sourceId}`, date, url: `https://sccl.bibliocommons.com/events/${sourceId}`,
      title: "Multi-Level ESL Class Session", venue: "Saratoga Library",
      time: "10:00 AM", endTime: "12:00 PM", registration: null,
      description: "Registration is now closed. Classes run August 31st to November 4th.",
      blurb: "Build your English speaking and listening skills with professional instructors.",
    };
    const events = [{ ...raw }];
    const stats = await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].registration, "closed");
    assert.equal(isRegistrationClosedForDay(events[0], date), true);
    assert.equal(requiresAdvanceRegistration(events[0]), true);
    assert.match(events[0].attendanceNote, /Registration is closed/);
    for (const field of ["title", "date", "url", "venue", "time", "endTime", "description", "blurb"]) {
      assert.equal(events[0][field], raw[field]);
    }
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.equal(stats.generated, 0);
    assert.equal(raw.registration, null);
    for (const other of [
      { ...raw, date: "2027-10-19" },
      { ...raw, url: "https://sccl.bibliocommons.com/events/another-esl-class" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("university source initials survive old cached title and blurb casing", async () => {
  for (const [date, url, title, blurb, expectedTitle, expectedBlurb] of [
    ["2026-10-19", "https://events.stanford.edu/event/ese-seminar-ines-azevedo-what-is-the-stanford-woods-institute-for-the-environment-a-journey-into-the-worlds-most-pressing-environmental-problems",
      "Ese Seminar - Inês Azevedo", "Hear the Ese Seminar.", "ESE Seminar - Inês Azevedo", "Hear the ESE Seminar."],
    ["2026-10-23", "https://events.scu.edu/leavey-school-of-business/event/518247-isa-research-seminar-vahid-akbari-university-of",
      "Isa Research Seminar: Vahid Akbari (University of Nottingham)", "Hear the Isa Research Seminar.",
      "ISA Research Seminar: Vahid Akbari (University of Nottingham)", "Hear the ISA Research Seminar."],
    ["2026-10-19", "https://events.stanford.edu/event/st-lee-lecture-featuring-former-congressman-and-ambassador-to-turkey-jeff-flake",
      "ST Lee Lecture featuring Former Congressman and Ambassador to Turkey Jeff Flake", "Hear Stanford's St Lee Lecture.",
      "ST Lee Lecture featuring Former Congressman and Ambassador to Turkey Jeff Flake", "Hear Stanford's ST Lee Lecture."],
  ]) {
    const raw = { date, url, title, blurb, venue: "University campus", time: "12:00 PM" };
    const events = [{ ...raw }];
    const stats = await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].title, expectedTitle);
    assert.equal(events[0].blurb, expectedBlurb);
    assert.equal(events[0].time, raw.time);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.equal(stats.generated, 0);
    for (const other of [
      { ...raw, date: "2027-10-19" },
      { ...raw, url: "https://example.edu/another-seminar" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Bike to the Bay retains the county's all-ages classification and primary URL on refresh", async () => {
  const raw = {
    id: "inbound-5a0ec185106f165a", date: "2026-10-17", title: "Bike to the Bay Ride",
    url: "https://go.sparkpostmail.com/f/a/newsletter-tracking-link",
    venue: "W Hedding St to Alviso Marina County Park", time: "9:00 AM", endTime: null,
    cost: null, kidFriendly: false, audienceAge: "all",
    description: "A group bike ride from the County building at 70 W Hedding to Alviso Marina County Park.",
    blurb: "Ride with the group from the County building on Hedding Street to Alviso Marina County Park.",
  };
  const events = [{ ...raw }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], {
    ...raw, kidFriendly: true, url: "https://d3.santaclaracounty.gov/dayonthebay2026",
  });
  assert.equal(stats.generated, 0);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.equal(raw.kidFriendly, false);
  for (const other of [
    { ...raw, date: "2027-10-17" },
    { ...raw, id: "another-ride", venue: "A different starting point" },
    { ...raw, id: "another-event", title: "A different event" },
    { ...raw, id: "another-ride", venue: "A different starting point", url: "https://d3.santaclaracounty.gov/dayonthebay2026" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("NeuroSphere does not choose between the library's conflicting grade ranges", async () => {
  for (const [date, sourceId] of [
    ["2026-10-18", "6a384108c134422d50e9a7b1"],
    ["2026-11-15", "6a384108c134422d50e9a7b2"],
    ["2026-12-20", "6a384108c134422d50e9a7b3"],
  ]) {
    for (const gradeSentence of [
      "NeuroSphere is a community for curious 2nd-7th graders about medicine!",
      "NeuroSphere is a community for 2nd-7th graders curious about medicine!",
    ]) {
      const raw = {
        id: `paloalto-${sourceId}`, date, url: `https://paloalto.bibliocommons.com/events/${sourceId}`,
        title: "Neurosphere: Neuroscience and More! Grades 3-8",
        venue: "Mitchell Park Library", time: "11:00 AM", endTime: "12:00 PM",
        cost: "free", registration: "required", kidFriendly: true, audienceAge: "kids",
        description: `Come join teen-led group NeuroSphere! ${gradeSentence} Explore brain function with hands-on activities. This program is open for 2nd-7th graders only.`,
        blurb: "Join a neuroscience workshop for students in grades 3-8.",
      };
      const events = [{ ...raw }];
      const stats = await resolveEventBlurbs(events, { enabled: false });
      const corrected = events[0];
      assert.equal(corrected.title, "NeuroSphere: Neuroscience and More!");
      assert.equal(corrected.description, "Come join teen-led group NeuroSphere! Explore brain function with hands-on activities.");
      assert.doesNotMatch(corrected.title + corrected.description + corrected.blurb, /graders|grades|2nd|3-8/i);
      assert.match(corrected.attendanceNote, /title lists grades 3–8.*description says grades 2–7 only/);
      assert.match(corrected.attendanceNote, /Confirm eligibility with Mitchell Park Library/);
      for (const field of ["id", "date", "url", "venue", "time", "endTime", "cost", "registration", "kidFriendly", "audienceAge"]) {
        assert.equal(corrected[field], raw[field]);
      }
      assert.equal(stats.generated, 0);
      assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
      assert.match(raw.description, /2nd-7th/);
      for (const other of [
        { ...raw, date: "2027-10-18" },
        { ...raw, url: "https://paloalto.bibliocommons.com/events/another-workshop" },
      ]) assert.equal(applyVerifiedEventFacts(other), other);
    }
  }
});

test("Pageturners cannot restore a misspelled author or an unsupported Booker winner claim", async () => {
  for (const [date, sourceId] of [
    ["2026-11-12", "6759fea0da3a5e3d00ca4d1a"],
    ["2026-12-10", "6759fea0da3a5e3d00ca4d1b"],
  ]) {
    const raw = {
      date, url: `https://paloalto.bibliocommons.com/events/${sourceId}`,
      title: "Pageturners", time: "6:30 PM", endTime: "7:45 PM", venue: "Rinconada Library",
      description: "My Friends by Fredrik Bachman; visiting International Booker Prize winner Andrey Kurkov (Diary of an Invasion).",
      blurb: "Discuss books by Fredrik Bachman and International Booker Prize winner Andrey Kurkov.",
    };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    for (const field of ["description", "blurb"]) {
      assert.match(events[0][field], /Fredrik Backman/);
      assert.match(events[0][field], /Andrey Kurkov/);
      assert.doesNotMatch(events[0][field], /Bachman|Booker Prize winner/);
    }
    for (const field of ["date", "url", "title", "time", "endTime", "venue"]) {
      assert.equal(events[0][field], raw[field]);
    }
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    for (const other of [
      { ...raw, date: "2027-11-12" },
      { ...raw, url: "https://paloalto.bibliocommons.com/events/another-book-club" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Hillview's October 18 storytime cannot inherit the source body's AM typo", async () => {
  const raw = {
    date: "2026-10-18", title: "Family Storytime", venue: "Hillview Library",
    url: "https://sjpl.bibliocommons.com/events/6aa86a287825b4006406d77d",
    time: "12:30 PM", endTime: "1:30 PM",
    blurb: "Join stories, songs, and movement activities with the whole family.",
  };
  for (const description of [
    "Storytime 12:30 - 1:00 am Stay & Play 1:00 - 1:30 pm. Free.",
    "Storytime: 12:30 - 1:00 am; Stay & Play: 1:00 - 1:30 pm. Free.",
  ]) {
    const events = [{ ...raw, description }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.match(events[0].description, /Storytime: 12:30 - 1:00 pm/);
    assert.doesNotMatch(events[0].description, /1:00 am/);
    assert.match(events[0].description, /Stay & Play:? 1:00 - 1:30 pm\. Free\./);
    assert.equal(events[0].time, raw.time);
    assert.equal(events[0].endTime, raw.endTime);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    for (const other of [
      { ...raw, description, date: "2027-10-18" },
      { ...raw, description, url: "https://sjpl.bibliocommons.com/events/another-storytime" },
    ]) assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Halloween Candlelight cannot inherit the VBO card's unrelated ABBA program", async () => {
  const raw = {
    id: "hammertheatre-f4a357599047b1d0", date: "2026-10-30", time: "8:45 PM",
    title: "Fever presents Candlelight: A Haunted Evening of Halloween Classics",
    venue: "Hammer Theatre Center", url: "https://feverup.com/m/140936",
    description: "Fever presents Candlelight: Tribute to ABBA & More",
    blurb: "Watch a candlelit tribute performance of ABBA and other Halloween-season favorites at Hammer Theatre.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].description, /string quartet.*Halloween-inspired music/i);
  assert.match(events[0].blurb, /Halloween-inspired music/);
  assert.doesNotMatch(events[0].description + events[0].blurb, /ABBA/i);
  assert.equal(events[0].title, raw.title);
  assert.equal(events[0].time, raw.time);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [
    { ...raw, date: "2027-10-30" },
    { ...raw, url: "https://feverup.com/m/another-concert" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Queen vs. ABBA keeps both acts on the verified November and January concerts", async () => {
  const raw = {
    id: "hammertheatre-e0001fa8bc4f7aa4", date: "2027-01-31", time: "7:45 PM",
    title: "Fever presents Candlelight: Tribute to ABBA & More",
    venue: "Hammer Theatre Center", url: "https://feverup.com/m/415717",
    description: "", blurb: "Watch string musicians perform ABBA hits and other pop favorites by candlelight.",
  };
  for (const date of ["2026-11-29", "2027-01-31"]) {
    const events = [{ ...raw, date }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].title, "Fever presents Candlelight: Queen vs. ABBA");
    assert.match(events[0].description, /Queen and ABBA/);
    assert.match(events[0].blurb, /Queen and ABBA/);
    assert.equal(events[0].time, raw.time);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  }
  for (const other of [
    { ...raw, date: "2028-01-31" },
    { ...raw, url: "https://feverup.com/m/another-concert" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
  const corrected = applyVerifiedEventFacts(raw);
  const { retireSlugs, resolveRetired } = await import("./eventSlugLedger.mjs");
  const ledger = retireSlugs({ entries: [] }, [raw], [corrected], "2026-10-16");
  const { redirects, orphans } = resolveRetired(ledger, [corrected], [], "2026-10-16");
  assert.equal(
    redirects.get("2027-01-31-fever-presents-candlelight-tribute-to-abba-and-more"),
    "2027-01-31-fever-presents-candlelight-queen-vs-abba",
  );
  assert.deepEqual(orphans, []);
});

test("NUMU exhibitions use the visitor address when intake extracted the mailing box", () => {
  const raw = {
    date: "2027-01-22", venue: "New Museum Los Gatos",
    address: "New Museum Los Gatos, PO Box 1904, Los Gatos, CA 95031",
    url: "https://www.numulosgatos.org/exhibitions-2/belle-yang",
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.address, "106 E. Main Street, Los Gatos, CA 95030");
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-02-01" }).address, fixed.address,
    "an ongoing exhibition's daily date must not restore the mailing address");
  for (const other of [
    { ...raw, url: "https://example.org/exhibitions-2/belle-yang" },
    { ...raw, url: "https://www.numulosgatos.org/events/offsite-program" },
    { ...raw, venue: "Another Museum" },
    { ...raw, virtual: true },
    { ...raw, address: "A different published street address" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("the ongoing Ofrenda exhibit cannot invite visitors to its past reception", async () => {
  const raw = {
    date: "2026-10-16", ongoing: true, title: "Art of Remembrance Ofrenda Exhibit",
    venue: "King Library", url: "https://events.sjsu.edu/event/art-of-remembrance-ofrenda-exhibit-2026",
    description: "Explore vibrant ofrendas created by local artists. Enjoy live performances, artist presentations, hot chocolate,…",
    blurb: "See vibrant ofrendas made by local artists and catch live performances and artist presentations at King Library.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.doesNotMatch(events[0].description + events[0].blurb, /performances|presentations|reception|chocolate/);
  assert.match(events[0].blurb, /ofrendas.*local artists.*King Library/);
  for (const date of ["2026-10-09", "2026-11-05"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, date }).blurb, events[0].blurb);
  }
  for (const other of [
    { ...raw, date: "2026-10-08" },
    { ...raw, date: "2026-11-06" },
    { ...raw, url: "https://events.sjsu.edu/event/another-exhibit" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Masala Mic's rescheduled November event retains required signup and age conditions", () => {
  const raw = {
    date: "2026-11-01", title: "Masala Mic Monthly November 1, 2026",
    url: "https://www.meetup.com/masalamic/events/316730245/",
    city: "milpitas", venue: "India Community Center (ICC)",
    time: "5:00 PM", endTime: "9:00 PM", registration: "none", cost: null,
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.registration, "required");
  assert.equal(requiresAdvanceRegistration(fixed), true);
  assert.match(fixed.attendanceNote, /signup and payment.*no children under 10/i);
  assert.equal(fixed.time, raw.time);
  assert.equal(fixed.endTime, raw.endTime);
  assert.equal(fixed.city, raw.city);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2026-12-01" }).registration, "none");
});

test("Stanford's field trip keeps its departure bucket and the museum's real postal locality", () => {
  const raw = {
    date: "2026-10-16", city: "palo-alto", venue: "San Jose Musuem of Art",
    address: "110 S Market Street, San José, CA 95113",
    url: "https://events.stanford.edu/event/environmental-humanities-project-field-trip-reimagining-our-waterways-climate-and-art-symposium",
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.city, "palo-alto");
  assert.equal(fixed.venue, "San José Museum of Art");
  assert.equal(fixed.locality, "San José");
  assert.equal(fixed.address, raw.address);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const other of [{ ...raw, date: "2027-10-16" }, { ...raw, url: "https://events.stanford.edu/event/another-trip" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("MOAH's verified free repair session keeps its check-in deadline and item limit", () => {
  const raw = {
    date: "2026-11-08", url: "https://www.moah.org/moahevents/repair-cafe-of-silicon-valley-2",
    title: "Repair Cafe of Silicon Valley", cost: "paid", time: "11:00 AM", endTime: "3:00 PM",
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.cost, "free");
  assert.match(fixed.attendanceNote, /two items.*2:30 PM.*earlier if capacity/);
  assert.equal(fixed.endTime, "3:00 PM", "the check-in deadline is not the event's closing time");
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const other of [{ ...raw, date: "2027-11-08" }, { ...raw, url: "https://www.moah.org/another-event" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("History Park tea links the current organizer listing without an invented outdoor setting", () => {
  const raw = {
    date: "2026-12-05", title: "History Park Heritage Holiday Tea", venue: "History Park", category: "outdoor",
    url: "https://fareharbor.com/embeds/book/historysanjose/items/314593/calendar/2024/12/?full-items=yes",
    blurb: "Taste holiday tea service and sweets outdoors at History Park's Heritage Holiday Tea.",
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.url, "https://historysanjose.org/programs-events/");
  assert.equal(fixed.category, "community");
  assert.match(fixed.blurb, /Empire Fire House/);
  assert.doesNotMatch(fixed.blurb, /outdoors|sweets/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const other of [{ ...raw, date: "2026-12-10" }, { ...raw, title: "Another Tea" }, { ...raw, venue: "Other Park" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("Kepler's Community Reads uses the bookstore's verified Menlo Park address", async () => {
  const raw = {
    date: "2026-10-24", time: "2:00 PM", endTime: "4:00 PM",
    title: "Community Reads: Her Right Foot by Dave Eggers and Shawn Harris",
    venue: "Kepler's Books", city: "palo-alto",
    address: "1010 El Camino Real, Palo Alto, CA, 94301", locality: "Palo Alto",
    url: "https://www.keplers.org/upcoming-events-internal/community-reads",
    description: "Illustrator Shawn Harris will lead an interactive collage workshop.",
    blurb: "Join an all-ages collage workshop with illustrator Shawn Harris.",
    kidFriendly: true,
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], {
    ...raw, address: "1010 El Camino Real, Menlo Park, CA 94025", locality: "Menlo Park",
  });
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [
    { ...raw, date: "2027-10-24" },
    { ...raw, url: "https://www.keplers.org/upcoming-events-internal/another-event" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("NUMU's Cassady talk keeps its Thursday label, closing time, and registration requirement", async () => {
  const raw = {
    id: "inbound-d897162cdf670c51", date: "2026-11-19", displayDate: "Wed, Nov 18",
    title: "Talk of the Town: Neal Cassady & the Beats", venue: "New Museum Los Gatos (NUMU)",
    time: "11:00 AM", endTime: null, cost: null, url: "https://www.numulosgatos.org/events/cassady",
    description: "A free public history talk featuring Los Gatan publisher Dan Pulcano discussing Neal Cassady and the Beat Generation's ties to Los Gatos.",
    blurb: "Hear publisher Dan Pulcano discuss Neal Cassady's ties to the Beat Generation in Los Gatos.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [corrected] = events;
  assert.equal(corrected.date, raw.date);
  assert.equal(corrected.displayDate, "Thu, Nov 19");
  assert.equal(corrected.time, "11:00 AM");
  assert.equal(corrected.endTime, "11:45 AM");
  assert.equal(corrected.cost, "free");
  assert.equal(corrected.registration, "required");
  assert.match(corrected.attendanceNote, /free with registration/i);
  assert.equal(requiresAdvanceRegistration(corrected), true);
  assert.equal(corrected.description, raw.description.replace("Dan Pulcano", "Dan Pulcrano"));
  assert.equal(corrected.blurb, raw.blurb.replace("Dan Pulcano", "Dan Pulcrano"));
  const withoutBlurb = { ...raw };
  delete withoutBlurb.blurb;
  const sparse = [withoutBlurb];
  await resolveEventBlurbs(sparse, { enabled: false });
  assert.match(sparse[0].blurb, /Dan Pulcrano/);
  assert.doesNotMatch(sparse[0].blurb, /Dan Pulcano/);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  for (const other of [
    { ...raw, date: "2027-11-19" },
    { ...raw, url: "https://www.numulosgatos.org/events/another-talk" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("NUMU's Canneries talk requires registration even with sparse newsletter attendance fields", async () => {
  const raw = {
    id: "inbound-6e0c73154efef76b", date: "2026-10-15", displayDate: "Thu, Oct 15",
    title: "Talk of the Town: Canneries & Agriculture", venue: "New Museum Los Gatos (NUMU)",
    time: "11:00 AM", endTime: null, cost: null, url: "https://www.numulosgatos.org/events/canneries",
    description: "A free public history talk exploring the role of canneries and agriculture in Los Gatos's early economy.",
    blurb: "Hear historians unpack how canneries and farming shaped early Los Gatos in this free talk at NUMU.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(requiresAdvanceRegistration(events[0]), true);
  assert.deepEqual(events[0], {
    ...raw, endTime: "11:45 AM", cost: "free", registration: "required", attendanceNote: "Free with registration.",
  });
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [
    { ...raw, date: "2027-10-15" },
    { ...raw, url: "https://www.numulosgatos.org/events/another-talk" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("FOPAL's organizer schedule corrects the library's November Sunday occurrence", async () => {
  const raw = {
    id: "paloalto-69667a0394297d3600a4e8a0", date: "2026-11-08", displayDate: "Sun, Nov 8",
    time: "1:00 PM", endTime: "4:00 PM", venue: "Cubberley Community Center", city: "palo-alto",
    title: "FOPAL Book Sale", url: "https://paloalto.bibliocommons.com/events/69667a0394297d3600a4e8a0",
    description: "Browse three rooms. Sunday hours: all rooms, 1 PM – 4 PM.",
    blurb: "Browse used books at the Friends of the Palo Alto Library sale.", cost: "free",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], {
    ...raw, date: "2026-11-15", displayDate: "Sun, Nov 15", url: "https://www.fopal.org/2026-book-sale-dates",
  });
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2026-12-13" }), { ...raw, date: "2026-12-13" });
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, id: "different", url: "https://example.org/another-sale" }), { ...raw, id: "different", url: "https://example.org/another-sale" });
  const { retireSlugs, resolveRetired } = await import("./eventSlugLedger.mjs");
  const ledger = retireSlugs({ entries: [] }, [raw], events, "2026-10-15");
  const { redirects, orphans } = resolveRetired(ledger, events, [], "2026-10-15");
  assert.equal(redirects.get("2026-11-08-fopal-book-sale"), "2026-11-15-fopal-book-sale");
  assert.deepEqual(orphans, []);
});

test("Los Altos astronomy talk distinguishes Kepler discoveries from planet candidates", async () => {
  const raw = {
    date: "2026-10-15", time: "7:00 PM", endTime: "8:30 PM",
    url: "https://sccl.bibliocommons.com/events/6aa329f860748300382614b2",
    title: "Why Are Exoplanetary Systems Unlike the Solar System?", venue: "Los Altos Library",
    description: "NASA's Kepler mission discovered over 4,400 transiting planets around other stars, including over 700 systems with multiple planets. Speaker Daniel Jontof-Hutter studies planetary dynamics.",
    blurb: "Hear how Kepler-discovered exoplanet systems compare to our own solar system's planetary layout.",
    cost: "free", sourceAudiences: ["Adults", "Older Adults", "Teens"],
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].description, "NASA's Kepler mission identified thousands of planets and planet candidates around other stars, including multi-planet systems. Speaker Daniel Jontof-Hutter studies planetary dynamics.");
  assert.deepEqual({ ...events[0], description: raw.description }, raw);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2027-10-15" }), { ...raw, date: "2027-10-15" });
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, url: "https://example.org/another-astronomy-talk" }), { ...raw, url: "https://example.org/another-astronomy-talk" });
});

test("Willow Glen tech assistance preserves the source's tutor role through blurb resolution", async () => {
  for (const [date, sourceId, time] of [
    ["2026-10-15", "68df10f9023ff328007ce8c8", "11:00 AM"],
    ["2026-10-17", "68df10f9023ff328007ce8c9", "10:00 AM"],
    ["2026-10-24", "68df10f9023ff328007ce8cc", "10:00 AM"],
  ]) {
    const raw = {
      date, time, url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
      title: "1 on 1 Tech Assistance", venue: "Willow Glen Library", cost: "free",
      description: "Our experienced and dedicated tech tutors can help with Word, Excel, and online forms. Participants are encouraged to pre-register; however, drop-ins are also considered.",
      blurb: "Get one-on-one help with Word, Excel, PowerPoint, or online forms from a librarian at Willow Glen Library.",
      registration: "required",
    };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].blurb, "Get one-on-one help with Word, Excel, PowerPoint, or online forms from a tech tutor at Willow Glen Library.");
    assert.deepEqual({ ...events[0], blurb: raw.blurb }, raw);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2027-10-15" }), { ...raw, date: "2027-10-15" });
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, url: "https://example.org/another-tech-session" }), { ...raw, url: "https://example.org/another-tech-session" });
    const staffClaim = { ...raw, blurb: "Sit down one-on-one with library staff to get help sharpening your computer skills." };
    assert.equal(applyVerifiedEventFacts(staffClaim).blurb,
      "Sit down one-on-one with a tech tutor to get help sharpening your computer skills.");
  }
});

test("October Nameless Anime Club retains its dated Sunday without a conflicting fourth-Sunday claim", async () => {
  const raw = {
    date: "2026-10-18", time: "12:00 PM", endTime: "4:00 PM",
    url: "https://sjpl.bibliocommons.com/events/6a02128243b41b3d0065b38d",
    title: "Nameless Anime Club", venue: "Edenvale Library", cost: "free",
    description: "Do you enjoy anime and manga? Join Edenvale Branch Library's Nameless Anime Club every fourth Sunday of the month! Participants are welcome to drop in anytime during our program. Free. No registration required.",
    blurb: "Drop in to watch anime and meet other fans at Edenvale Library.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].description, "Do you enjoy anime and manga? Join Edenvale Branch Library's Nameless Anime Club! Participants are welcome to drop in anytime during our program. Free. No registration required.");
  assert.deepEqual({ ...events[0], description: raw.description }, raw);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2027-10-18" }), { ...raw, date: "2027-10-18" });
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, url: "https://example.org/another-anime-club" }), { ...raw, url: "https://example.org/another-anime-club" });
});

test("October Little Learners keeps its explicit dates and registration without a conflicting Tuesday ordinal", async () => {
  const raw = {
    date: "2026-10-20", time: "3:30 PM", endTime: "4:15 PM", registration: "required",
    url: "https://sccl.bibliocommons.com/events/6a68e7ccf4e5db3d00c4dc6a",
    title: "Little Learners STEAM for Ages 3-5", venue: "Milpitas Library", cost: "free",
    description: "Join us every second Tuesday of the month* at Milpitas for our Little Learners STEAM series. Registration is required. Parents must participate with their child aged 3-5. September 15; October 20; November 17; December 8.",
    blurb: "Explore STEAM activities with your preschooler at Milpitas Library.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].description, "Join us at Milpitas for our Little Learners STEAM series. Registration is required. Parents must participate with their child aged 3-5. September 15; October 20; November 17; December 8.");
  assert.deepEqual({ ...events[0], description: raw.description }, raw);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2027-10-20" }), { ...raw, date: "2027-10-20" });
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, url: "https://example.org/another-preschool-class" }), { ...raw, url: "https://example.org/another-preschool-class" });
});

test("October Milpitas book discussions retain dated sessions without contradictory monthly boilerplate", async () => {
  const cadence = "The Milpitas Library Book Discussion Group meets on the 4th Wednesday morning and 4th Thursday evening of each month with the exception of November and December, when we will reschedule to accommodate holiday schedules.";
  for (const [date, sourceId, time] of [
    ["2026-10-21", "6a4c9f94541102b7fa8aea8d", "11:00 AM"],
    ["2026-10-22", "6a4c9f94541102b7fa8aea8e", "7:30 PM"],
  ]) {
    const raw = {
      date, time, url: `https://sccl.bibliocommons.com/events/${sourceId}`,
      title: "Milpitas Adult Book Discussion Group - Treasure Island by Robert Louis Stevenson",
      venue: "Milpitas Library", cost: "free",
      description: `Read Treasure Island. October 21st at 11:00 AM; October 22nd at 7:30 PM. ${cadence} For adults, ages 18+.`,
      blurb: "Discuss Treasure Island at Milpitas Library.",
    };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].description, "Read Treasure Island. October 21st at 11:00 AM; October 22nd at 7:30 PM. For adults, ages 18+.");
    assert.deepEqual({ ...events[0], description: raw.description }, raw);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2027-10-21" }), { ...raw, date: "2027-10-21" });
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, url: "https://example.org/another-book-club" }), { ...raw, url: "https://example.org/another-book-club" });
  }
});

test("October Cafecito omits conflicting English and Spanish cadence and room directions", async () => {
  for (const spanishClock of ["a.m.", "a. m."]) {
    const raw = {
      date: "2026-10-15", time: "10:00 AM", endTime: "11:00 AM",
      url: "https://losgatosca.libcal.com/event/16035613", title: "Cafecito Book Club",
      venue: "Los Gatos Library", cost: "free",
      description: `This book club reads exclusively Spanish books and meets on the 2nd Thursday of every month from 10-11 AM in the library's conference room (1st Floor). Este club de lectura lee libros exclusivamente en español y se reúne el segundo jueves de cada mes de 10 a 11 ${spanishClock} en la sala de conferencias de la biblioteca (primer piso).`,
      blurb: "Talk through a Spanish-language book with other readers in the library's first-floor conference room.",
    };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].description, "This book club reads exclusively Spanish books. Este club de lectura lee libros exclusivamente en español.");
    assert.equal(events[0].blurb, "Talk through a Spanish-language book with other readers at Los Gatos Library.");
    assert.deepEqual({ ...events[0], description: raw.description, blurb: raw.blurb }, raw);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2026-11-12" }), { ...raw, date: "2026-11-12" });
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, url: "https://example.org/another-book-club" }), { ...raw, url: "https://example.org/another-book-club" });
  }
});

test("Palo Alto's Halloween skate retains the linked provider's actual name across refreshes", async () => {
  const raw = {
    date: "2026-10-24", time: "2:00 PM", endTime: "5:00 PM", registration: "required",
    url: "https://paloalto.bibliocommons.com/events/6a873b1560ccaf01c01fb300",
    title: "Teen Halloween Roller Derby!", venue: "Mitchell Park (Mitchell Park Bowl)",
    description: "Two skating sessions from 2-3:30 PM and 3:30-5 PM with Open Skate Spaces. All attendees must fill out a waiver.",
    blurb: "Skate and craft at Mitchell Park Bowl.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].description, "Two skating sessions from 2-3:30 PM and 3:30-5 PM with Skate Open Spaces. All attendees must fill out a waiver.");
  assert.deepEqual({ ...events[0], description: raw.description }, raw);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-10-24" }).description, raw.description);
  assert.equal(applyVerifiedEventFacts({ ...raw, url: "https://example.org/another-skate" }).description, raw.description);
});

test("King Library's October 18 replacement program survives a shared storytime blurb", async () => {
  const raw = {
    date: "2026-10-18", title: "Indoor Family Storytime + Stay & Play",
    url: "https://sjpl.bibliocommons.com/events/69fb8818703c33630025ded4",
    venue: "King Library", time: "4:00 PM", endTime: "5:00 PM",
    description: "**10/18 We will offer the special program For Goodness Snakes in lieu of our regular storytime! ** Best for children ages 0-8 with their caregivers; all families welcome! Storytime is designed to accommodate a mix of ages.",
    blurb: "Join families at King Library for stories, songs, and playtime designed for kids of all ages.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].blurb, "For Goodness Snakes replaces the regular storytime at King Library; recommended for ages 0–8 with caregivers.");
  assert.deepEqual({ ...events[0], blurb: raw.blurb }, raw);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2026-10-25" }).blurb, raw.blurb);
  assert.equal(applyVerifiedEventFacts({ ...raw, url: "https://example.org/another-storytime" }).blurb, raw.blurb);
});

test("October Milpitas ESL occurrences omit contradictory term dates across refreshes", async () => {
  const occurrences = [
    ["2026-10-19", "6a5992919943bdf31e9f816b"],
    ["2026-10-21", "6a5992919943bdf31e9f816c"],
    ["2026-10-26", "6a5992919943bdf31e9f816d"],
    ["2026-10-28", "6a5992919943bdf31e9f816e"],
  ];
  for (const [date, id] of occurrences) {
    for (const springPhrase of ["between February 9th to May 20th", "from February 9th to May 20th"]) {
      const raw = {
        date, url: `https://sccl.bibliocommons.com/events/${id}`,
        title: "Free Adult ESL Class", time: "6:00 PM", endTime: "8:00 PM",
        venue: "Milpitas Library", cost: "free", audienceAge: "adult",
        description: `The class meets twice a week on Mondays and Wednesdays, from 6:00 PM to 8:00 PM at the Milpitas Library Program Room ${springPhrase}. Regular attendance is required. Class Dates: August 17th, 2025 - November 18, 2026, Mon & Weds 6:00pm - 8:00pm. Please follow the link to make an appointment for your ESL assessment.`,
        blurb: "Build your English skills in a free adult ESL class at Milpitas Library.",
      };
      const events = [{ ...raw }];
      await resolveEventBlurbs(events, { enabled: false });
      assert.equal(events[0].description, "The class meets twice a week on Mondays and Wednesdays, from 6:00 PM to 8:00 PM at the Milpitas Library Program Room. Regular attendance is required. Confirm assessment and enrollment availability with Milpitas Library.");
      const { attendanceNote, attendanceStatus, ...preserved } = events[0];
      assert.equal(attendanceStatus, "needs-confirmation");
      assert.match(attendanceNote, /Confirm class and enrollment details with Milpitas Library/);
      assert.deepEqual({ ...preserved, description: raw.description }, raw);
      assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
      assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-10-19" }).description, raw.description);
      assert.equal(applyVerifiedEventFacts({ ...raw, url: "https://example.org/another-class" }).description, raw.description);
    }
  }
});

test("the Tully Day 3 workshop does not repeat Day 1's topic in either language", async () => {
  const raw = {
    date: "2026-10-15", time: "11:30 AM", registration: "required",
    url: "https://sjpl.bibliocommons.com/events/6aa1bf97101eb7003f2ec8f0",
    title: "ESL Workforce Development Workshop - Day 3: Professional Communication & Workplace Expectations",
    description: "Practice workplace communication. Workshop Topic: Professional Introductions & My Skills This is a Free program. Tema del taller: Presentaciones Profesionales y Mis Habilidades Este programa es Gratuito. Es necesario registrarse.",
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert.equal(corrected.description, "Practice workplace communication. This is a Free program. Este programa es Gratuito. Es necesario registrarse.");
  assert.equal(corrected.title, raw.title);
  assert.equal(corrected.registration, raw.registration);
  assert.equal(corrected.time, raw.time);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2027-10-15" }), { ...raw, date: "2027-10-15" });
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], corrected);
});

test("interview workshop copy omits an unsupported hiring percentage and discloses conflicting signup instructions", () => {
  const raw = {
    date: "2026-10-15", time: "12:00 PM", registration: "required",
    url: "https://sjpl.bibliocommons.com/events/6a99d8351c197d11325d14f4",
    description: "Prepare for interviews. When it comes to job searching, 80% of the US population gets their job through someone they know. This workshop will discuss networking. No Registration Required.",
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert.doesNotMatch(corrected.description, /80%|No Registration Required/);
  assert.match(corrected.description, /This workshop will discuss networking/);
  assert.match(corrected.description, /description and signup instructions conflict/);
  assert.equal(corrected.registration, raw.registration);
  assert.equal(corrected.time, raw.time);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, url: "https://example.org/other" }), { ...raw, url: "https://example.org/other" });
  const source = { ...raw, description: raw.description.replace("know. This", "know, this") };
  assert.match(applyVerifiedEventFacts(source).description, /interviews\. This workshop/);
});

test("line dancing's translated pickup clock does not become a waiver headcount", () => {
  for (const [date, sourceId] of [["2026-10-15", "6aa49028101eb7003f2f6dfd"], ["2026-10-22", "6aa49028101eb7003f2f6dfe"]]) {
    const raw = {
      date, time: "1:30 PM", url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
      description: "Tickets will be available 30 minutes in advance. 30 First-time participants will need to sign a waiver form.",
    };
    const corrected = applyVerifiedEventFacts(raw);
    assert.equal(corrected.description, "Tickets will be available 30 minutes in advance. First-time participants will need to sign a waiver form.");
    assert.equal(corrected.time, raw.time);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    assert.equal(applyVerifiedEventFacts({ ...raw, url: raw.url.replace("/events/", "/v2/events/") }).description, corrected.description);
    assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-10-15" }).description, raw.description);
  }
});

test("the Frida screening corrects Diego Rivera without changing a different listing", async () => {
  const raw = {
    date: "2026-10-17", time: "2:30 PM",
    url: "https://sjpl.bibliocommons.com/events/6a945850be148200298b2c83",
    description: "Frida Kahlo's marriage to Diego River, and her growth as an artist.",
    blurb: "Watch Frida at Joyce Ellington Library.",
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert.equal(corrected.description, raw.description.replace("Diego River,", "Diego Rivera,"));
  assert.equal(corrected.time, raw.time);
  assert.equal(corrected.blurb, raw.blurb);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  assert.equal(applyVerifiedEventFacts({ ...raw, url: "https://example.org/other" }).description, raw.description);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], corrected);
});

test("Judi Oyama's opening retains the companion Halloween event's explicit family admission", () => {
  const opening = { date: "2026-10-31", url: "https://www.jamsj.org/upcoming-events/judi-oyama", kidFriendly: false };
  assert.equal(applyVerifiedEventFacts(opening).kidFriendly, true);
  assert.equal(applyVerifiedEventFacts({ ...opening, date: "2027-10-31" }).kidFriendly, false);
});

test("dated Montalvo source facts preserve paid family admission and remove an unsupported stage claim", async () => {
  const matinees = [
    { date: "2026-10-15", url: "https://my.montalvoarts.org/overview/3064" },
    { date: "2026-10-22", url: "https://my.montalvoarts.org/overview/3065", blurb: "Mariachi on an outdoor stage." },
  ];
  for (const event of matinees) {
    const corrected = applyVerifiedEventFacts({ ...event, kidFriendly: false, cost: "paid" });
    assert.equal(corrected.kidFriendly, true);
    assert.equal(corrected.cost, "paid");
    if (event.blurb) {
      assert.match(corrected.blurb, /Angeles Danzantes/);
      assert.doesNotMatch(corrected.blurb, /outdoor/);
    }
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    assert.equal(applyVerifiedEventFacts({ ...event, date: "2027-10-22", kidFriendly: false }).kidFriendly, false);
  }
  const family = { date: "2026-10-25", url: "https://my.montalvoarts.org/3257/3258", cost: "free", kidFriendly: false };
  const events = [{ ...family }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "paid");
  assert.equal(events[0].kidFriendly, true);
  assert.equal(applyVerifiedEventFacts({ ...family, url: "https://example.org/other" }).cost, "free");
});

test("SCU roundtable copy uses the official 2026 Election Day without changing the event date", () => {
  const raw = {
    date: "2026-10-20", time: "2:15 PM",
    url: "https://events.scu.edu/arts-and-sciences/event/517594-whats-on-silicon-valleys-ballot-a-roundtable-on",
    description: "Early voting has begun, and elections will close on November 2nd. All are welcome!",
    blurb: "Discuss local ballot issues.",
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert.match(corrected.description, /Election Day is November 3, 2026/);
  assert.match(corrected.description, /All are welcome/);
  assert.equal(corrected.date, raw.date);
  assert.equal(corrected.time, raw.time);
  assert.equal(corrected.blurb, raw.blurb);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-10-20" }).description, raw.description);
});

test("SCU's sparse job-search row remains online despite empty platform mode metadata", async () => {
  const raw = {
    date: "2026-10-15", time: "12:00 PM", venue: "Santa Clara University",
    url: "https://events.scu.edu/leavey-school-of-business/event/509849-job-search-series-2-resume-linkedin-and-practical",
    description: "", blurb: "Learn practical tips on resumes and networking.",
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert.equal(corrected.venue, "Online");
  assert.equal(corrected.virtual, true);
  assert.match(corrected.description, /Register to receive the Zoom link/);
  assert.equal(corrected.time, raw.time);
  assert.equal(corrected.blurb, raw.blurb);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], corrected);
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-10-15" }).venue, raw.venue);
});

test("public virtual Drupallers sessions retain online attendance across sparse refreshes", async () => {
  const raw = {
    title: "Drupallers Drop-in Web Help", date: "2026-10-15",
    url: "https://events.stanford.edu/event/drupallers-drop-in-web-help-q1-fy2027",
    venue: "Stanford University", address: "", virtual: true,
    blurb: "Drop in at Stanford University for help with Drupal.",
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert.equal(corrected.venue, "Online");
  assert.equal(corrected.address, "");
  assert.equal(corrected.virtual, true);
  assert.equal(corrected.cost, "free");
  assert.match(corrected.description, /personal or Stanford Zoom login/);
  assert.match(corrected.blurb, /online/);
  assert.doesNotMatch(corrected.blurb, /at Stanford/);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.deepEqual(events[0], corrected);
  for (const date of ["2026-11-19", "2026-12-17"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, date }).venue, "Online");
  }
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-10-15" }).venue, raw.venue);
  assert.equal(applyVerifiedEventFacts({ ...raw, url: "https://example.org/other" }).venue, raw.venue);
});

test("musical dynasties cannot become royalty in Delphian copy", async () => {
  const event = {
    title: "Delphian Lectures: Meet the Instruments & Meet the Dynasties",
    venue: "Willow Glen Library", date: "2026-10-16",
    description: "Meet the Strings; Meet the Bach Family; Meet the Mozart Family.",
  };
  const wrong = "Hear a Delphian lecture about musical instruments and royal dynasties.";
  assert.equal(eventCopyFactConflict(wrong, event), "unsupported royal-dynasty topic");
  assert.equal(eventCopyFactConflict("Learn about royal families.", event), "unsupported royal-dynasty topic");
  assert.equal(eventCopyFactConflict("Hear a lecture about instruments and composer families.", event), null);
  assert.equal(eventCopyFactConflict(wrong, { ...event, title: "European Royal Dynasties" }), null);
  assert.equal(eventCopyFactConflict(wrong, { ...event, description: "Music of the Bach Family and royal dynasties." }), null);
  assert.equal(eventCopyFactConflict(
    "The Delphian Lectures explore the Bach Family. A separate history lecture explores royal dynasties.", event,
  ), null);
  const carried = { ...event, blurb: wrong };
  await resolveEventBlurbs([carried], { enabled: false });
  assert.notEqual(carried.blurb, wrong);
});

test("dated concert identities survive sparse refreshes without changing another show", async () => {
  const events = [
    { id: "heritage-1e9b8b39407d8f09", date: "2027-02-19", title: "Journey USA - The Hits of Journey", venue: "Heritage Theatre", blurb: "Vocalists who toured with the real lineup." },
    { date: "2026-11-27", title: "Hammer Presents Merry-Achi Christmas 2026", venue: "Hammer Theatre Center", description: "", url: "https://plugin.vbotickets.com/new-session", blurb: "Grammy-nominated group Merry-Achi Christmas." },
    { date: "2026-11-28", title: "Hammer Presents Merry-Achi Christmas 2026", venue: "Hammer Theatre Center", description: "", blurb: "Grammy-nominated group Merry-Achi Christmas." },
  ];
  await resolveEventBlurbs(events, { enabled: false });
  assert.doesNotMatch(events[0].blurb, /toured|real lineup/);
  assert.match(events[0].blurb, /Journey USA.*hits of Journey/);
  for (const event of events.slice(1)) {
    assert.match(event.description, /José Hernández and Mariachi Sol de México/);
    assert.match(event.blurb, /José Hernández and Mariachi Sol de México/);
    assert.doesNotMatch(event.blurb, /group Merry-Achi/);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  const nextYear = { ...events[1], date: "2027-11-27", description: "A new lineup", blurb: "A new program" };
  assert.equal(applyVerifiedEventFacts(nextYear), nextYear);
  const elsewhere = { ...events[1], venue: "Another Hall", description: "A different production" };
  assert.equal(applyVerifiedEventFacts(elsewhere), elsewhere);
});

test("Ticketmaster artist typos are scoped to the verified show without freezing its lineup", () => {
  const raw = {
    date: "2026-11-20",
    url: "https://www.ticketmaster.com/who-want-the-smoke-san-jose-california-11-20-2026/event/1C006522E52E3A76",
    description: "Shorline Mafia, Kamayiah, and a newly added guest. Linup subject to change.",
    blurb: "Hear Kamayiah with Shorline Mafia.",
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert.match(corrected.description, /Shoreline Mafia, Kamaiyah, and a newly added guest/);
  assert.match(corrected.description, /Lineup subject to change/);
  assert.match(corrected.blurb, /Kamaiyah with Shoreline Mafia/);
  assert.equal(raw.description.includes("Kamayiah"), true);
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-11-20" }).description, raw.description);
  assert.equal(applyVerifiedEventFacts({ ...raw, url: "https://example.org/unrelated" }).description, raw.description);
  assert.equal(applyVerifiedEventFacts(corrected).description, corrected.description);
});

test("October first-party links and registration conditions survive sparse newsletter input", () => {
  const workshop = applyVerifiedEventFacts({
    title: "Preparing Your Fruit Trees for Winter Workshop", date: "2026-10-03",
    venue: "Saratoga Heritage Orchard", url: "",
  });
  assert.equal(workshop.cost, "free");
  assert.equal(workshop.registration, "required");
  assert.match(workshop.url, /\/message\/301201$/);
  const market = applyVerifiedEventFacts({
    title: "Downtown Palo Alto Farmers' Market", date: "2026-10-03",
    venue: "Gilman Street between Hamilton and Forest", url: "",
  });
  assert.equal(market.url, "https://www.pafarmersmarket.org/home");
  assert.equal(applyVerifiedEventFacts({ ...workshop, date: "2027-10-03", url: "" }).url, "");
});

test("verified artist identity and performance copy survive sparse ingest and blurb resolution", async () => {
  const events = [
    { title: "Rihab Chaieb: Nomad—the Eternal Wanderer", date: "2027-02-24", venue: "Bing Concert Hall", description: "Tunisian violinist Rihab Chaieb", blurb: "Hear violinist Rihab Chaieb." },
    { title: "300 Paintings by Sam Kissajukian", date: "2027-03-03", venue: "The Studio", blurb: "Walk through 300 paintings." },
    { title: "Renée Qin and Ania Filochowka: The World We Speak Into Being", date: "2027-02-04", venue: "The Studio" },
  ];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].description, /mezzo-soprano/i);
  assert.doesNotMatch(events[0].blurb, /violinist/i);
  assert.match(events[0].url, /rihab-chaieb-nomad-the-eternal-wanderer\/$/);
  assert.match(events[1].blurb, /Watch.*perform/);
  assert.doesNotMatch(events[1].blurb, /walk through/i);
  assert.match(events[2].title, /Ania Filochowska:/);
  const later = { ...events[0], date: "2028-02-24", description: "A different program" };
  assert.equal(applyVerifiedEventFacts(later), later);
  const elsewhere = { ...events[0], venue: "Other Hall", description: "A different program" };
  assert.equal(applyVerifiedEventFacts(elsewhere), elsewhere);
});

test("a sold-out organizer workshop stays unavailable on its verified date", () => {
  const raw = {
    id: "inbound-b451c136762c2e2c", date: "2026-10-17", time: "1:00 PM", cost: null,
    url: "https://bagi.org/products/diy-alebrije-dia-de-los-muertos-edition",
  };
  const event = applyVerifiedEventFacts(raw);
  assert.equal(event.registration, "full");
  assert.equal(event.endTime, "3:30 PM");
  assert.equal(event.cost, null);
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-10-17" }).registration, undefined);
});

test("SJMA's date-only snapshot recovers a free family event without requiring advance booking", async () => {
  const { normalizePlaywrightEvent } = await import("../../../scripts/playwright-scrapers.mjs");
  const raw = {
    title: "Community Day: Día de Los Muertos", date: "2026-10-24",
    time: "Saturday, October 24, 2026", cost: "paid", kidFriendly: false,
    venue: "San Jose Museum of Art", city: "san-jose", source: "San Jose Museum of Art",
    url: "https://sjmusart.org/community-day-dia-de-los-muertos",
  };
  const event = normalizePlaywrightEvent(raw);
  assert.equal(event.time, "11:00 AM");
  assert.equal(event.endTime, "4:00 PM");
  assert.equal(event.cost, "free");
  assert.equal(event.kidFriendly, true);
  assert.match(event.url, /programs-at-sjma\/community-days\/dia-de-los-muertos$/);
  assert.match(event.attendanceNote, /walk-ins are welcome.*separate ticket/i);
  assert.equal(requiresAdvanceRegistration(event), false);
  assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-10-24" }).time, raw.time);
  assert.equal(applyVerifiedEventFacts({ ...raw, url: "https://example.org/unrelated" }).time, raw.time);
});

test("SJMA facts preserve evening starts, offsite directions, and admission conditions", () => {
  const firstFriday = applyVerifiedEventFacts({ id: "0fd141a7f257", date: "2026-10-02", time: "12:00 PM", cost: "paid" });
  assert.equal(firstFriday.time, "6:00 PM");
  assert.equal(firstFriday.endTime, "9:00 PM");
  assert.equal(firstFriday.cost, "free");
  assert.match(firstFriday.attendanceNote, /7:25 PM.*first come/i);

  const lecture = applyVerifiedEventFacts({ id: "91accca935ec", date: "2026-10-27", photoRef: "museum-photo" });
  assert.match(lecture.venue, /State University.*ART 133/);
  assert.match(lecture.address, /One Washington Square/);
  assert.equal(lecture.photoRef, null);

  const walk = applyVerifiedEventFacts({ date: "2026-11-18", url: "https://sjmusart.org/programs-at-sjma/walk-with-a-naturalist" });
  assert.equal(walk.time, "12:30 PM");
  assert.equal(walk.cost, "paid", "free with admission must not become free admission");
  assert.match(walk.costNote, /museum admission/);

  const december = applyVerifiedEventFacts({ date: "2026-12-04", url: "https://sjmusart.org/event/first-fridays-december-2026" });
  assert.equal(december.title, "First Fridays: Celebrate the Holidays with Pride");
  assert.match(december.url, /celebrate-holidays-pride$/);
});

test("SJMA scraper rejects challenges and leaves unverified times and prices unknown", async () => {
  const { scrapeSJMuseumOfArt } = await import("../../../scripts/playwright-scrapers.mjs");
  await assert.rejects(scrapeSJMuseumOfArt({
    goto: async () => ({ ok: () => false, status: () => 403 }),
  }), /HTTP 403/);

  const rows = await scrapeSJMuseumOfArt({
    goto: async (_url, options) => {
      assert.equal(options.waitUntil, "domcontentloaded");
      return { ok: () => true };
    },
    waitForSelector: async () => {},
    evaluate: async () => [{ title: "An unverified future program", date: "2027-02-01", time: "Monday, February 1, 2027", link: "https://sjmusart.org/event/unverified" }],
  });
  assert.equal(rows[0].time, null);
  assert.equal(rows[0].cost, null);
});

test("September 6 library facts survive a sparse refresh and blurb resolution", async () => {
  const events = [
    { id: "sjpl-6a7bc1324cb69d003e203e28", title: "STEM: Balloon Car Derby", venue: "Berryessa Library", date: "2026-09-06", audienceAge: "all", kidFriendly: false },
    { id: "cbdd438d7fbe", title: "Narcan Training at the Library", venue: "Los Gatos Library", date: "2026-09-06", audienceAge: "all" },
  ];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].audienceAge, "kids");
  assert.equal(events[0].kidFriendly, true);
  assert.equal(events[0].time, "2:00 PM");
  assert.match(events[0].attendanceNote, /12 first-come.*confirm pickup timing/);
  assert.equal(events[0].attendanceStatus, "needs-confirmation");
  assert.equal(events[1].audienceAge, "adult");
  for (const event of events) {
    const next = { id: "different", title: event.title, venue: event.venue, date: "2026-09-13" };
    assert.equal(applyVerifiedEventFacts(next), next, "the hold and exact attendance note cannot leak to later occurrences");
  }
});

test("source corrections survive fresh sparse ingest without leaking into other occurrences", async () => {
  const events = [{ ...lost }, { ...duelo }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].description, /original vocalists or members/);
  assert.match(events[0].url, /^https:\/\/lost80slive.com\/event\/mwc09052026\//);
  assert.equal(events[0].time, "6:00 PM");
  assert.doesNotMatch(events[0].blurb, /cover bands/);
  assert.match(events[1].blurb, /norteño/);
  const nextYear = { ...lost, date: "2027-09-05" };
  assert.equal(applyVerifiedEventFacts(nextYear), nextYear);
  const unrelated = { id: "other", date: lost.date, title: "Other concert", venue: lost.venue };
  assert.equal(applyVerifiedEventFacts(unrelated), unrelated);
});

test("missing descriptions never support invented band identity; sourced tribute shows remain valid", () => {
  assert.ok(eventCopyFactConflict(lost.blurb, lost));
  assert.ok(eventCopyFactConflict("Hear the original members perform.", lost));
  assert.equal(eventCopyFactConflict("Hear Lost 80s Live at Mountain Winery.", lost), null);
  assert.equal(eventCopyFactConflict("Hear a tribute band.", { title: "ABBA tribute", description: "" }), null);
  assert.ok(eventCopyFactConflict("Hear Grupo Duelo play banda hits.", applyVerifiedEventFacts(duelo)));
  assert.equal(eventCopyFactConflict("Hear Banda MS.", { title: "Banda MS" }), null);
});

test("corrected feed/cache copies agree and Town Cats keeps in-person ticket pickup ungated", () => {
  const feed = JSON.parse(readFileSync(new URL("../../data/south-bay/upcoming-events.json", import.meta.url)));
  const cache = JSON.parse(readFileSync(new URL("../../data/south-bay/event-blurb-cache.json", import.meta.url)));
  for (const id of [lost.id, duelo.id, "sjpl-6a5280ebe564853d00fd6ea4", "sjpl-6a7bc1324cb69d003e203e28", "cbdd438d7fbe"]) {
    const event = feed.events.find((e) => e.id === id);
    if (!event) continue; // The occurrence legitimately ages out of the live feed.
    assert.equal(event.blurb, applyVerifiedEventFacts(event).blurb);
    assert.equal(cache.byKey[eventBlurbCacheKey(event)]?.blurb, event.blurb);
    assert.equal(eventCopyFactConflict(event.blurb, event), null);
    if (id === "sjpl-6a5280ebe564853d00fd6ea4") {
      assert.equal(requiresAdvanceRegistration(event), false);
      assert.match(event.blurb, /Information Desk.*1 PM/);
    }
  }
  assert.doesNotMatch(cache.byKey["fp:lost 80s live|mountain winery|d:"]?.blurb || "", /cover bands/i);
  assert.doesNotMatch(cache.byKey["fp:grupo duelo – gravedad tour 2026|san jose civic|d:af517bd503d6"]?.blurb || "", /banda/i);
});

test("every LibCal appointment occurrence is gated, not just the corrected one", () => {
  // The Sept 8 defect was systemic: only `d610aa488850` got a hand correction,
  // while its seven sibling occurrences — same service, same appointment-only
  // page — stayed walk-ups because nothing on the LibCal ingest path set
  // `registration`. registrationFromLibCal now derives it for all of them, so
  // the correction is a floor and the feed is the mechanism.
  const feed = JSON.parse(readFileSync(new URL("../../data/south-bay/upcoming-events.json", import.meta.url)));
  const byId = new Map(feed.events.map((e) => [e.id, e]));

  const scanning = [
    "d610aa488850", "beafbf0a38b7", "b7c1ea7f055a", "22a65f59e0b7",
    "a0b6ae3454e6", "dbf05ae12f85", "c5f16f14946d", "f61d141f208b",
  ];
  // These dated occurrences can all age out. Stable LibCal parsing fixtures
  // in scripts/newsletter/lib.test.mjs cover the appointment rule year-round.
  for (const id of scanning) {
    const event = byId.get(id);
    if (!event) continue; // The occurrence legitimately ages out of the live feed.
    assert.equal(event.registration, "appointment-only", id);
    assert.equal(requiresAdvanceRegistration(event), true, id);
  }

  // Mountain View's "Landscape Design for Beginners" opens "Registration is
  // required. Seats and materials are limited." — a seat, not a slot.
  const landscape = byId.get("ecadbadee33e");
  if (landscape) assert.equal(landscape.registration, "required");

  // And the guard did not swing the other way. Every LibCal event whose own
  // copy promises walk-up access must stay ungated, or a false positive
  // silently removes a good event from the plan.
  const libcalWalkUps = feed.events.filter(
    (e) => /libcal\.com/.test(e.url || "") && /\bno registration required\b|\bfirst come\b/i.test(e.description || ""),
  );
  for (const event of libcalWalkUps) {
    assert.equal(requiresAdvanceRegistration(event), false, `${event.id} ${event.title}`);
  }
});

// ---------------------------------------------------------------------------
// 2026-09-09 issue. The "Also on the calendar" intro referred to the Seven
// Trees playdate by venue and head noun rather than by its registration title
// ("Playdates for Children and Their Caregivers"), so no title path matched
// and repairNewsletterEventFacts' unsupported() closure skipped the event
// entirely — with it, every guard that hangs off copyMentionsEvent.
//
// The sentence itself was CORRECT and must survive: SJPL publishes the whole
// rotation on every occurrence ("2nd Wednesday: Superhero Obstacle Course
// (ages 3-8)"), September 2026's Wednesdays are 2/9/16/23/30, and Sept 9 is
// the 2nd. A guard that blanks a true sentence is the more expensive bug.
// ---------------------------------------------------------------------------
const playdate = {
  id: "sjpl-6a347d087550c8bf9f5e649a",
  date: "2026-09-09",
  title: "Playdates for Children and Their Caregivers",
  venue: "Seven Trees Library",
  sourceAudiences: ["Young Children, ages 0-5"],
  description: "Join us every Wednesday for weekly playdates. Kids get to practice early social skills like sharing, taking turns, imitation of play, and joint attention while caregivers get a chance to connect. 1st Wednesday: Cars 2nd Wednesday: Superhero Obstacle Course (ages 3-8) 3rd Wednesday: LEGO Duplo Blocks 4th Wednesday: Cars 5th Wednesday: LEGO Duplo Blocks Recommended for children ages 2 – 6 years old.",
};
const SHIPPED_INTRO = "Only the Palo Alto opera preview asks for advance registration; the downtown market and the Seven Trees playdate run every Wednesday, and this week's playdate is the superhero obstacle course for ages 3 to 8.";

test("a venue-plus-head-noun reference binds to the event the title match misses", () => {
  assert.equal(copyMentionsEvent(SHIPPED_INTRO, playdate), true);
  assert.equal(copyMentionsEvent("Bring the kids to the Seven Trees playdates.", playdate), true);
  // Both halves are required. A venue alone sweeps in every event at that
  // address; a head noun alone sweeps in every playdate in the county.
  assert.equal(copyMentionsEvent("Seven Trees Library also runs a bilingual storytime.", playdate), false);
  assert.equal(copyMentionsEvent("There is a playdate at Berryessa Library.", playdate), false);
  assert.equal(copyMentionsEvent("The downtown farmers market runs every Wednesday.", playdate), false);
});

test("the shipped Sept 9 intro is source-grounded and must not be blanked", () => {
  assert.equal(rotationActivityForOccurrence(playdate), "Superhero Obstacle Course");
  assert.equal(eventCopyFactConflict(SHIPPED_INTRO, playdate), null);
  // The age gate is the rotation entry's own parenthetical, wider than the
  // BiblioCommons audience tag; quoting it is not an invention.
  assert.equal(eventCopyFactConflict("This week's playdate is the superhero obstacle course for ages 3 to 8.", playdate), null);
  assert.equal(eventCopyFactConflict("Head to the Seven Trees playdate for the Superhero Obstacle Course.", playdate), null);
  // Listing the whole published rotation is not a wrong-week claim either.
  assert.equal(eventCopyFactConflict("The Seven Trees playdate rotates: Cars, Superhero Obstacle Course, LEGO Duplo Blocks.", playdate), null);
});

test("an invented age range is caught; a sourced one is not", () => {
  assert.ok(eventCopyFactConflict(SHIPPED_INTRO.replace("ages 3 to 8", "ages 9 to 14"), playdate));
  assert.ok(eventCopyFactConflict("This week's playdate is the superhero obstacle course for ages 3 and up.", playdate));
  // Sourced spans, in any of the shapes SJPL publishes them.
  assert.equal(eventCopyFactConflict("A playdate at Seven Trees for ages 0-5.", playdate), null);
  assert.equal(eventCopyFactConflict("A playdate at Seven Trees for ages 2 – 6.", playdate), null);
  // No age data anywhere in the source is not permission to assert one.
  const bare = { title: "Open Play", venue: "Rose Garden Library", description: "Drop by and play." };
  assert.ok(eventCopyFactConflict("Open Play at the Rose Garden is for ages 3 to 8.", bare));
});

test("naming another session's rotation activity is caught in both schedule shapes", () => {
  // Ordinal-weekday shape: LEGO Duplo Blocks is the 3rd and 5th Wednesday.
  assert.ok(eventCopyFactConflict("The Seven Trees playdate runs every Wednesday; this week it is LEGO Duplo Blocks.", playdate));
  assert.ok(eventCopyFactConflict("Head to the Seven Trees playdate for LEGO Duplo Blocks.", playdate));
  assert.ok(eventCopyFactConflict(SHIPPED_INTRO.replace("the superhero obstacle course for ages 3 to 8", "a puppet parade"), playdate));

  // Calendar-date shape. This is the Craft Tuesdays & Thursdays failure the
  // CORRECTIONS table carries by hand: washi tape bookmarks were Sept 8, bug
  // headbands Sept 10. The guard now derives that from the source, so the
  // wrong-week class no longer needs a hand-entry per occurrence.
  const craft = {
    id: "sjpl-6a945a62be148200298b2cfc",
    date: "2026-09-10",
    title: "Craft Tuesdays & Thursdays",
    venue: "Educational Park Library",
    description: "Join us for a limited series of crafts on Tuesdays and Thursdays! Tuesday, September 1: Cactus characters Thursday, September 3: beaded insects Tuesday September 8: Washi tape bookmarks Thursday, September 10: Bug headbands Tuesday, September 15: Decorated masks Thursday, September 17: Acorn craft Free. Supplies are limited, first come, first serve.",
  };
  assert.equal(rotationActivityForOccurrence(craft), "Bug headbands");
  assert.equal(eventCopyFactConflict("Make bug headbands at this week's drop-in craft session; supplies are limited.", craft), null);
  assert.ok(eventCopyFactConflict("Make washi tape bookmarks at this week's drop-in craft session.", craft));
  assert.ok(eventCopyFactConflict("This week's craft is decorated masks.", craft));

  // A rotation keyed to a weekday the occurrence is not on is not guessed at.
  assert.equal(rotationActivityForOccurrence({ ...playdate, date: "2026-09-10" }), "");
});

test("editorial voice is not mistaken for a session-activity claim", () => {
  // "this week's <subject> is …" only asserts a fact when the subject is the
  // event's own head noun. Otherwise it is the editor talking.
  assert.equal(eventCopyFactConflict("This week's plan is a quiet one near Seven Trees playdates.", playdate), null);
  assert.equal(eventCopyFactConflict("This week's highlight is a trip to the coast.", playdate), null);
});

test("no blurb in the live feed trips the new guards", () => {
  // A false positive blanks legitimate copy, so the whole feed is the fixture.
  const feed = JSON.parse(readFileSync(new URL("../../data/south-bay/upcoming-events.json", import.meta.url)));
  const flagged = feed.events
    .filter((event) => event.blurb && eventCopyFactConflict(event.blurb, event))
    .map((event) => `${event.id} ${event.title}: ${eventCopyFactConflict(event.blurb, event)}`);
  assert.deepEqual(flagged, []);
});
