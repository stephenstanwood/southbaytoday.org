import test from "node:test";
import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { deduplicateEventSlots } from "../../../scripts/lib/event-url-dedup.mjs";
import {
  applyVerifiedEventFacts,
  copyMentionsEvent,
  eventCopyFactConflict,
  rotationActivityForOccurrence,
} from "./eventSourceFacts.mjs";
import { eventBlurbCacheKey, resolveEventBlurbs } from "./eventBlurbs.mjs";
import { fuzzyDedupEvents } from "./eventFuzzyDedup.mjs";
import { isEventPublishable } from "./eventOccurrence.mjs";
import { resolveRetired, retireSlugs } from "./eventSlugLedger.mjs";
import { isRegistrationClosedForDay, requiresAdvanceRegistration, requiresAttendanceConfirmation, REGISTRATION_APPOINTMENT } from "./eventFilters.mjs";

test("Stanford's coffee hour retains the organizer's intended audience", () => {
  const event = {
    date: "2026-11-27",
    url: "https://events.stanford.edu/event/office-for-military-affiliated-communities-coffee-donuts",
    description: "Grab a donut and meet the folks from the Office for Military-Affiliated Communities.",
  };
  const reviewed = applyVerifiedEventFacts(event);
  assert.equal(reviewed.attendanceNote, "The coffee hour is intended for veterans, active-duty service members, reservists, and military-connected students.");
  assert.equal(reviewed.registration, undefined);
  assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
  const outsideRun = { ...event, date: "2026-12-18" };
  assert.equal(applyVerifiedEventFacts(outsideRun), outsideRun);
});

test("Educational Park Teens Reach shows the signup conflict without a reservation badge", () => {
  const event = {
    date: "2026-12-02",
    url: "https://sjpl.bibliocommons.com/v2/events/6a6265aae9de6536001dc48f",
    registration: "required",
    registrationClosesBy: "2026-12-03T00:00:00.000Z",
    description: "Registration is not necessary; it is used as a headcount for room preparation. All teens welcome to the activities. Walk-ins okay.",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(requiresAdvanceRegistration(corrected), false);
  assert.equal(requiresAttendanceConfirmation(corrected), true);
  assert.equal(corrected.registrationClosesBy, null);
  assert.equal(corrected.description, "All teens welcome to the activities.");
  assert.match(corrected.attendanceNote, /requires registration.*walk-ins are welcome/);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  for (const registration of ["full", "closed"]) {
    const unavailable = { ...event, registration };
    assert.equal(applyVerifiedEventFacts(unavailable), unavailable);
  }
  const updated = { ...event, description: "Registration is required for this session." };
  assert.equal(applyVerifiedEventFacts(updated), updated);
});

test("King Library Music and Movement uses the published program finish", () => {
  const event = {
    date: "2026-12-02",
    url: "https://sjpl.bibliocommons.com/events/69fbb1fd43b41b3d0064a3f4",
    time: "5:30 PM",
    endTime: "6:15 PM",
    description: "Free, with limited capacity. Program finishes by 6:10pm.",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.endTime, "6:10 PM");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const changedSlot = { ...event, time: "5:45 PM" };
  assert.equal(applyVerifiedEventFacts(changedSlot), changedSlot);
});

test("Joseph uses the production page while keeping both dated Saturday performances", () => {
  const base = {
    title: "Joseph",
    date: "2026-12-12",
    url: "https://losaltosstage.org/events/joseph/",
    source: "Los Altos Stage Company",
    kidFriendly: false,
  };

  for (const time of ["3:00 PM", "8:00 PM"]) {
    const occurrence = {
      ...base, time,
      occurrenceEvidence: {
        kind: "first-party-occurrence-page",
        sourceUrl: "https://losaltosstage.org/?rhc_action=get_icalendar_events&ID=11179",
        date: base.date,
        time,
      },
    };
    const reviewed = applyVerifiedEventFacts(occurrence);
    assert.equal(reviewed.title, "Joseph and the Amazing Technicolor Dreamcoat");
    assert.equal(reviewed.url, "https://losaltosstage.org/joseph/");
    assert.equal(reviewed.kidFriendly, true);
    assert.equal(reviewed.time, time);
    assert.deepEqual(reviewed.occurrenceEvidence, occurrence.occurrenceEvidence);
    assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
  }
  const later = { ...base, date: "2027-11-27" };
  assert.equal(applyVerifiedEventFacts(later), later);
});

test("the Saratoga wine stroll distinguishes advance tickets from door sales", () => {
  const event = {
    date: "2026-11-27",
    url: "https://www.eventbrite.com/e/saratogas-holiday-wine-experience-tickets-2001268102768?aff=oddtdtcreator",
  };
  const oldNote = "Check-in opens at 5 PM at the Saratoga Chamber of Commerce, 14460 Big Basin Way. Bring photo ID and your ticket confirmation.";
  const ageRule = "Guests under 21 must attend with a parent or legal guardian.";
  const reviewed = applyVerifiedEventFacts(event);
  assert.match(reviewed.attendanceNote, /^Check-in opens at 5 PM at the Saratoga Chamber of Commerce, 14460 Big Basin Way\./);
  assert.match(reviewed.attendanceNote, /Everyone needs photo ID\. Bring your confirmation if you bought tickets online\./);
  assert.match(reviewed.attendanceNote, /Online sales close at noon\. Any remaining tickets are sold at the door until 7:30 PM\./);
  assert.ok(reviewed.attendanceNote.endsWith(ageRule));
  assert.deepEqual(applyVerifiedEventFacts({ ...event, attendanceNote: oldNote }), reviewed);
  assert.deepEqual(applyVerifiedEventFacts({ ...event, attendanceNote: `${oldNote} ${ageRule}` }), reviewed);
  const availability = "Check the organizer for remaining ticket availability.";
  assert.equal(applyVerifiedEventFacts({ ...event, attendanceNote: `${oldNote} ${ageRule} ${availability}` }).attendanceNote,
    `${availability} ${reviewed.attendanceNote}`);
  assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
});

test("Reading with Pets shows the required reservation and uses the verified library address", () => {
  const session = {
    date: "2026-12-01",
    source: "City Newsletter",
    city: "santa-clara",
    url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/115099/",
    venue: "Central Park Library - Redwood Room",
    address: "Central Park Library - Redwood Room, 2635 Homestead Road, Santa Clara, CA 95051",
    description: "Call the library to reserve a time slot.",
    blurb: "Read to a therapy pet in the Redwood Room.",
  };
  const reviewed = applyVerifiedEventFacts(session);
  assert.equal(requiresAdvanceRegistration(reviewed), true);
  assert.equal(reviewed.venue, "Central Park Library");
  assert.equal(reviewed.address, "2635 Homestead Road, Santa Clara, CA 95051");
  assert.equal(reviewed.blurb, "Read to a therapy pet.");
  assert.equal(reviewed.attendanceNote, "Confirm the room when you reserve your time slot.");
  assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
  assert.equal(applyVerifiedEventFacts({ ...session, registration: "full" }).registration, "full");
  assert.equal(applyVerifiedEventFacts({ ...session, venue: "Central Park Library - Edinger Room" }).venue,
    "Central Park Library - Edinger Room");
  const otherDate = { ...session, date: "2027-01-05" };
  assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
});

test("Sunnyvale's dated workshop listings use the booking pages' locations and attendance terms", () => {
  const lipBalm = {
    date: "2026-12-03",
    url: "https://sunnyvale.libcal.com/event/16525085",
    venue: "Sunnyvale Main Library",
    address: "Sunnyvale Main Library, Program Room",
  };
  const lipBalmReviewed = applyVerifiedEventFacts(lipBalm);
  assert.equal(lipBalmReviewed.venue, "Sunnyvale Main Library, Program Room");
  assert.equal(lipBalmReviewed.address, "665 W. Olive Ave., Sunnyvale, CA 94086");
  assert.equal(requiresAdvanceRegistration(lipBalmReviewed), true);
  assert.match(lipBalmReviewed.attendanceNote, /takes walk-ins when space is available/);
  assert.equal(applyVerifiedEventFacts({ ...lipBalm, registration: "full" }).registration, "full");
  assert.deepEqual(applyVerifiedEventFacts(lipBalmReviewed), lipBalmReviewed);

  const embroidery = {
    date: "2026-12-03",
    url: "https://sunnyvale.libcal.com/event/17982107",
    address: "Lakewood Branch Library, Maker Lab",
    audienceAge: "kids",
    description: "Registration is not required.",
    blurb: "Drop in for teen embroidery.",
  };
  const embroideryReviewed = applyVerifiedEventFacts(embroidery);
  assert.equal(embroideryReviewed.venue, "Lakewood Branch Library, Program Room");
  assert.equal(embroideryReviewed.address, "760 Lakechime Drive, Sunnyvale, CA 94089");
  assert.equal(embroideryReviewed.audienceAge, "all");
  assert.deepEqual(embroideryReviewed.sourceAudiences, ["Teens", "Adults"]);
  assert.equal(requiresAdvanceRegistration(embroideryReviewed), true);
  assert.match(embroideryReviewed.description, /registration is required/);
  assert.doesNotMatch(embroideryReviewed.blurb, /drop.in/i);

  const ai = {
    date: "2026-12-07",
    url: "https://sunnyvale.libcal.com/event/17861320",
    description: "Registration is required.",
    blurb: "Registration is required.",
  };
  const aiReviewed = applyVerifiedEventFacts(ai);
  assert.equal(requiresAttendanceConfirmation(aiReviewed), true);
  assert.match(aiReviewed.attendanceNote, /calls sign-up optional.*say registration is required/);
  assert.doesNotMatch(aiReviewed.description + aiReviewed.blurb, /registration is required/);
  assert.deepEqual(applyVerifiedEventFacts(aiReviewed), aiReviewed);
  const laterAi = { ...ai, date: "2027-01-20" };
  assert.equal(applyVerifiedEventFacts(laterAi), laterAi);
});

test("Sunnyvale's December volunteer club keeps its teen audience and discloses conflicting signup instructions", () => {
  const session = {
    date: "2026-12-10",
    url: "https://sunnyvale.libcal.com/event/16531841",
    venue: "Sunnyvale Main Library",
    address: "Sunnyvale Main Library, Teen Space",
    audienceAge: "all",
    registration: "required",
    registrationClosesBy: "2026-12-10T23:00:00Z",
  };
  const reviewed = applyVerifiedEventFacts(session);
  assert.equal(reviewed.venue, "Sunnyvale Main Library, Teen Space");
  assert.equal(reviewed.address, "665 W. Olive Ave., Sunnyvale, CA 94086");
  assert.equal(reviewed.audienceAge, "kids");
  assert.deepEqual(reviewed.sourceAudiences, ["Teens age 13 and up"]);
  assert.equal(reviewed.registration, null);
  assert.equal(reviewed.registrationClosesBy, null);
  assert.equal(requiresAttendanceConfirmation(reviewed), true);
  assert.equal(reviewed.attendanceNote, "The library's bulletin and event description say signing up is optional and will get you an email reminder. The booking panel says registration is required. Check with the library before walking in.");
  const extraNote = "See the library calendar for updates.";
  const oldNote = "The library’s bulletin and event description say signup is optional for an email reminder. The booking panel says registration is required. Check with the library before walking in.";
  const saved = { ...reviewed, attendanceNote: `${extraNote} ${oldNote}` };
  assert.deepEqual(applyVerifiedEventFacts(saved), {
    ...reviewed,
    attendanceNote: `${extraNote} ${reviewed.attendanceNote}`,
  });
  assert.match(reviewed.description, /volunteer hours, apply first/);
  assert.doesNotMatch(reviewed.description, /drop.in/i);
  assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
  assert.equal(applyVerifiedEventFacts({ ...session, registration: "full" }).registration, "full");
  const otherDate = { ...session, date: "2027-01-14" };
  assert.deepEqual(applyVerifiedEventFacts(otherDate), otherDate);
});

test("the Berryessa Pokémon session describes the activity without a popularity ranking", () => {
  const session = {
    id: "sjpl-6affa6610ad4ed003a04847f",
    date: "2026-12-02",
    description: "Practice playing the most popular trading card game, Pokémon TCG. Tutorial decks are available.",
  };
  const reviewed = applyVerifiedEventFacts(session);
  assert.equal(reviewed.description, "Practice playing the Pokémon Trading Card Game. Tutorial decks are available.");
  assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
});

test("the Earthquakes watch party offers an RSVP and welcomes all ages", () => {
  const party = {
    date: "2026-11-28", title: "Quakes Game 2 Watch Party", source: "City Newsletter",
    city: "san-jose", venue: "San Pedro Square", url: "https://www.sjearthquakes.com/fans/watchparty",
  };
  const verified = applyVerifiedEventFacts(party);
  assert.equal(verified.attendanceNote, "All ages welcome. RSVP is available on the Earthquakes' watch party page.");
  assert.equal(requiresAdvanceRegistration(verified), false);
  assert.deepEqual(applyVerifiedEventFacts(verified), verified);
  const otherDate = { ...party, date: "2026-12-05" };
  assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
});

test("the Christmas Carol opening follows the producer's dated sold-out performance", () => {
  const show = {
    date: "2026-12-04", title: "A Christmas Carol presented by Silicon Valley Shakespeare",
    city: "saratoga", venue: "Montalvo Arts Center", url: "https://my.montalvoarts.org/3261/3262",
    time: "6:00 PM", attendanceStatus: "needs-confirmation",
  };
  const reviewed = applyVerifiedEventFacts(show);
  assert.equal(reviewed.time, "7:30 PM");
  assert.equal(reviewed.url, "https://www.svshakespeare.org/carol");
  assert.equal(reviewed.registration, "full");
  assert.match(reviewed.attendanceNote, /waitlist.*No tickets at the door/);
  assert.equal(requiresAttendanceConfirmation(reviewed), false);
  assert.equal(isEventPublishable(reviewed), true);
  assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
  const browserRow = { ...show, title: "A Christmas Carol", url: "https://montalvoarts.org/christmas-carol/", time: null };
  assert.equal(applyVerifiedEventFacts(browserRow).time, "7:30 PM");
  const otherDate = { ...show, date: "2026-12-13" };
  assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
});

test("ICA exhibits show regular gallery hours without changing run dates or timed programs", () => {
  const exhibit = {
    date: "2027-01-15", startDate: "2027-01-15", endDate: "2027-08-22",
    url: "https://www.icasanjose.org/upcoming-exhibitions/nimahgobirfamiliar/",
    source: "ICA San José", ongoing: true,
    blurb: "See Nimah Gobir's exhibition on your own schedule.",
  };
  const verified = applyVerifiedEventFacts(exhibit);
  assert.deepEqual(verified, {
    ...exhibit,
    blurb: "See Nimah Gobir's exhibition Familiar at ICA San José.",
    attendanceNote: "Regular gallery hours are Thursday through Sunday, noon to 5 PM.",
  });
  assert.deepEqual(applyVerifiedEventFacts(verified), verified);
  const workshop = { ...exhibit, time: "5:00 PM", url: "https://www.icasanjose.org/upcoming-programs/decffzines/" };
  assert.equal(applyVerifiedEventFacts(workshop), workshop);
});

test("the San José holiday opening has one free ceremony and one public route", () => {
  const ceremony = {
    source: "City Newsletter", city: "san-jose", date: "2026-11-27", id: "opening",
    title: "Christmas in the Park Opening Night Ceremony and Tree Lighting",
    url: "https://christmasinthepark.com/events/", category: "outdoor", time: "6:00 PM",
    venue: "Plaza de San Jose", cost: null, kidFriendly: false,
  };
  const cityAdvisory = {
    ...ceremony, id: "advisory", time: "5:45 PM",
    title: "Christmas in the Park Tree-Lighting and Santa's All-Electric Home Debut",
    url: "https://christmasinthepark.com/",
  };
  const verified = applyVerifiedEventFacts(ceremony);
  assert.equal(verified.cost, "free");
  assert.equal(verified.category, "community");
  assert.equal(verified.kidFriendly, true);
  assert.equal(verified.venue, "Plaza de San José");
  assert.equal(verified.time, "6:00 PM");
  assert.equal(verified.endTime, "7:00 PM");
  assert.match(verified.description, /all-electric house returns/);
  assert.deepEqual(deduplicateEventSlots([verified, applyVerifiedEventFacts(cityAdvisory)]), [verified]);
  const ledger = retireSlugs(null, [cityAdvisory], [verified], "2026-11-25");
  const retired = resolveRetired(ledger, [verified], [], "2026-11-25");
  assert.deepEqual([...retired.redirects.values()], ["2026-11-27-christmas-in-the-park-opening-night-ceremony-and-tree-lighting"]);
  assert.deepEqual(applyVerifiedEventFacts(verified), verified);
  const vipParty = { ...ceremony, title: "Opening Night VIP Party" };
  assert.equal(applyVerifiedEventFacts(vipParty), vipParty);
});

test("Saratoga's Celebration of Light and Community Carol Sing retain their own venues and clocks", () => {
  const { verifiedCase } = JSON.parse(readFileSync(new URL(
    "../../../scripts/lib/fixtures/reviewed-event-copy-2026-11-25-saratoga.json", import.meta.url,
  )));
  const plaza = {
    date: "2026-12-05", city: "saratoga", source: "City Newsletter",
    title: "Saratoga Celebration of Light", venue: "Blaney Park", time: "6:00 PM",
  };
  const combined = { ...plaza, title: "Saratoga Celebration of Light & Community Carol Sing" };
  const carols = {
    ...plaza, title: "Community Carol Sing", time: "6:30 PM", venue: "Saratoga Federated Church parking lot",
  };
  const ceremony = applyVerifiedEventFacts(combined);
  const singing = applyVerifiedEventFacts(carols);
  assert.deepEqual(applyVerifiedEventFacts(plaza), ceremony);
  assert.equal(ceremony.venue, "Blaney Plaza");
  assert.equal(ceremony.endTime, "9:00 PM");
  assert.equal(singing.venue, "Saratoga Federated Church parking lot");
  assert.equal(singing.time, "6:30 PM");
  assert.equal(singing.endTime, null);
  assert.notEqual(singing.url, ceremony.url);
  assert.deepEqual(fuzzyDedupEvents(deduplicateEventSlots([ceremony, applyVerifiedEventFacts(plaza), singing])).kept,
    [ceremony, singing]);
  assert.equal(ceremony.description, verifiedCase.reviewed);
  assert.deepEqual(applyVerifiedEventFacts({ ...ceremony, description: verifiedCase.refreshed }), ceremony);
  assert.deepEqual(applyVerifiedEventFacts(ceremony), ceremony);
  assert.deepEqual(applyVerifiedEventFacts(singing), singing);
});

test("the church bulletin links Blue Christmas and both Christmas Eve services", () => {
  const blue = {
    title: "Blue Christmas Service", date: "2026-12-09", time: "7:00 PM", category: "music",
    city: "los-gatos", source: "City Newsletter", venue: "Sanctuary",
  };
  const verified = applyVerifiedEventFacts(blue);
  assert.equal(verified.venue, "Presbyterian Church of Los Gatos");
  assert.equal(verified.category, "community");
  assert.equal(verified.url, "https://www.pclg.org/this-week/2026-11-25.pdf");
  const services = ["4", "10"].map(hour => applyVerifiedEventFacts({
    ...blue, date: "2026-12-24", venue: verified.venue,
    title: `Christmas Eve Service (${hour}:00 p.m.)`, time: `${hour}:00 PM`,
  }));
  assert.ok(services.every(event => event.url === verified.url));
  assert.deepEqual(deduplicateEventSlots(services), services);
});

test("ongoing Stanford and King Library exhibits show verified Thanksgiving closures", () => {
  const exhibit = {
    date: "2026-11-24", ongoing: true, time: null,
    source: "Stanford Events", venue: "Cantor Arts Center",
    url: "https://events.stanford.edu/event/in-focus-asian-american-art-from-the-collection",
    attendanceNote: "Regular Thursday hours are 11 AM–8 PM.",
  };
  const fixed = applyVerifiedEventFacts(exhibit);
  assert.equal(fixed.attendanceNote,
    "Regular Thursday hours are 11 AM–8 PM. The museum is closed Thursday, November 26, for Thanksgiving.");
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const tour = { ...exhibit, ongoing: false, time: "2:00 PM" };
  assert.equal(applyVerifiedEventFacts(tour), tour);
  const nextDay = { ...exhibit, date: "2026-11-27" };
  assert.equal(applyVerifiedEventFacts(nextDay), nextDay);

  const library = {
    date: "2026-11-27", ongoing: true, source: "SJSU Events", venue: "King Library, DiNapoli Gallery",
    url: "https://events.sjsu.edu/event/renewal",
  };
  assert.match(applyVerifiedEventFacts(library).attendanceNote, /closed November 26 and 27/);
  const reopened = { ...library, date: "2026-11-28" };
  assert.equal(applyVerifiedEventFacts(reopened), reopened);
});

test("Thanksgiving closures follow the library or gallery's own hours", () => {
  const rows = [
    ["https://events.stanford.edu/event/text-machines-scarlet-thread-of-the-digital-order-1883-2026",
      "2026-11-27", "Green Library is closed November 26 and 27 for Thanksgiving."],
    ["https://sjpl.bibliocommons.com/events/6ac02d7dde300e004517d401",
      "2026-11-27", "Almaden Library is closed November 26 and 27 for Thanksgiving."],
    ["https://events.sjsu.edu/event/copy-of-natalie-and-james-thompson-gallery-common-ground",
      "2026-11-27", "Thompson Gallery is closed November 25 through 27."],
  ];
  for (const [url, date, note] of rows) {
    const event = { url, date, ongoing: true, attendanceNote: "Check visiting hours." };
    const fixed = applyVerifiedEventFacts(event);
    assert.equal(fixed.attendanceNote, `Check visiting hours. ${note}`);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const later = { ...event, date: "2026-11-30" };
    assert.equal(applyVerifiedEventFacts(later).attendanceNote, event.attendanceNote);
    const online = { ...event, virtual: true };
    assert.equal(applyVerifiedEventFacts(online).attendanceNote, event.attendanceNote);
  }
});

test("East Asia Library exhibit identifies both visitor entry and Thanksgiving closure", () => {
  const exhibit = {
    date: "2026-11-24", ongoing: true, time: null,
    url: "https://events.stanford.edu/event/korean-indigenous-futures",
  };
  const access = "Visitors without Stanford library access must register in person with a physical government-issued photo ID.";
  const closure = "East Asia Library is closed November 26 through 29.";
  const reviewed = applyVerifiedEventFacts(exhibit);
  assert.equal(reviewed.attendanceNote, `${access} ${closure}`);
  assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
  assert.equal(applyVerifiedEventFacts({ ...exhibit, date: "2026-11-29" }).attendanceNote, `${access} ${closure}`);
  assert.equal(applyVerifiedEventFacts({ ...exhibit, date: "2026-11-30" }).attendanceNote, access);
  for (const other of [{ ...exhibit, virtual: true }, { ...exhibit, date: "2026-12-12" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("California Current and Patty Chang use the museums' free admission", () => {
  const californiaCurrent = {
    date: "2026-11-24", ongoing: true, source: "Stanford Events",
    url: "https://events.stanford.edu/event/california-current-art-and-histories-from-the-bay-area-6587",
    cost: null, venue: "Stanford University", address: "",
  };
  const fixed = applyVerifiedEventFacts(californiaCurrent);
  assert.equal(fixed.cost, "free");
  assert.equal(fixed.venue, "Cantor Arts Center");
  assert.equal(fixed.address, "328 Lomita Drive, Stanford, CA 94305");
  assert.match(fixed.attendanceNote, /closed Thursday, November 26/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);

  const pattyChang = {
    ...californiaCurrent, date: "2026-11-27", venue: "Anderson Collection",
    url: "https://events.stanford.edu/event/patty-chang-surfacing",
  };
  assert.deepEqual(applyVerifiedEventFacts(pattyChang), { ...pattyChang, cost: "free" });
});

test("Maples Pavilion uses the campus guide's street number", () => {
  const event = {
    venue: "Maples Pavilion",
    address: "Maples Pavilion, Stanford University, 641 Campus Drive, Stanford, CA 94305",
  };
  assert.equal(applyVerifiedEventFacts(event).address, "655 Campus Drive, Stanford, CA 94305");
  const neighbor = { ...event, venue: "Another Stanford facility" };
  assert.equal(applyVerifiedEventFacts(neighbor), neighbor);
});

test("the dated Korean smartphone help listing keeps the library's booking instructions", () => {
  const event = {
    source: "City Newsletter", city: "santa-clara", date: "2026-12-07",
    title: "Tech Help Class: 1-on-1 Smartphone Help in Korean", url: "",
    venue: "Technology Center", cost: null,
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.venue, "Central Park Library");
  assert.equal(new URL(corrected.url).hostname, "bookings.cloud.microsoft");
  assert.equal(corrected.cost, "free");
  assert.equal(corrected.registration, REGISTRATION_APPOINTMENT);
  assert.match(corrected.attendanceNote, /15-minute appointment/);
  assert.equal(applyVerifiedEventFacts({ ...event, registration: "full" }).registration, "full");
  const otherDate = { ...event, date: "2026-12-08" };
  assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
});

test("the county flag raising links to its dated flyer when the newsletter URL is empty", () => {
  const event = {
    source: "City Newsletter", city: "san-jose", date: "2026-12-10",
    title: "Human Rights Day Flag Raising Ceremony", url: "",
  };
  assert.deepEqual(applyVerifiedEventFacts(event), {
    ...event, url: "https://assets.unlayer.com/projects/126416/1795110608252-981110.png",
  });
  const linked = { ...event, url: "https://example.org/ceremony" };
  assert.deepEqual(applyVerifiedEventFacts(linked), linked);
  const nextYear = { ...event, date: "2027-12-10" };
  assert.deepEqual(applyVerifiedEventFacts(nextYear), nextYear);
});

test("the Saratoga Thanksgiving service links to the city's confirmed 10 AM listing", () => {
  const event = {
    date: "2026-11-26", title: "61st Annual Community Interfaith Thanksgiving Service",
    venue: "Sacred Heart Parish", time: "10:00 AM", endTime: null, url: "",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.deepEqual(fixed, { ...event, url: "https://www.saratoga.ca.us/Calendar.aspx?EID=2710" });
  const updated = { ...fixed, attendanceStatus: "needs-confirmation", attendanceNote: "Check the parish for a weather update." };
  assert.deepEqual(applyVerifiedEventFacts(updated), updated);
});

test("the November 28 reading session uses the library's resolved signup window", () => {
  const staleCopy = "You may register for a 10-minute session online beginning two days before the event.";
  const event = {
    date: "2026-11-28", registration: "required", registrationClosesBy: "2026-11-28T22:30:00.000Z",
    url: "https://sccl.bibliocommons.com/v2/events/6a80ab1bb2047800299313ca",
    description: `${staleCopy} Reserve spots only for children who will participate.`,
    attendanceNote: "Only 10 spots. " + staleCopy,
  };
  const fixed = applyVerifiedEventFacts(event);
  const verifiedCopy = "Online registration for 10-minute sessions opens Wednesday, November 25 at 8:00 AM.";
  assert.deepEqual(fixed, {
    ...event,
    description: `${verifiedCopy} Reserve spots only for children who will participate.`,
    attendanceNote: "Only 10 spots. " + verifiedCopy,
  });
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const laterOccurrence = { ...event, date: "2026-12-05" };
  assert.deepEqual(applyVerifiedEventFacts(laterOccurrence), laterOccurrence);
});

test("the Los Altos tree celebration uses the plaza and verified free admission", () => {
  const event = {
    date: "2026-12-04", venue: "Downtown Los Altos", cost: null, kidFriendly: false,
    url: "https://downtownlosaltos.org/event/holiday-tree-celebration/",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.deepEqual(fixed, { ...event, venue: "Veterans Community Plaza", cost: "free", kidFriendly: true });
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const updatedListing = { ...event, venue: "Main Street", cost: "paid" };
  assert.deepEqual(applyVerifiedEventFacts(updatedListing), { ...updatedListing, kidFriendly: true });
});

test("Santa Paws uses the organizer's park and photo donation for the dated event", () => {
  const event = {
    date: "2026-12-12", title: "Santa Paws hosted by Humane Society Silicon Valley",
    venue: "Santana Row", city: "san-jose", cost: null, source: "Santana Row",
    url: "https://santanarow.com/event/santa-paws/",
    description: "Bring your pet to Park Valencia. Photos are a minimum donation of $10! Registration begins at 9:30am.",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.deepEqual(corrected, {
    ...event, venue: "Park Valencia, Santana Row", cost: "low",
    costNote: "$10 minimum donation for a photo",
  });
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const reviewedCopy = { ...event, description: "Bring your pet to Park Valencia. Photos require a donation of at least $10." };
  assert.equal(applyVerifiedEventFacts(reviewedCopy).cost, "low");
  for (const donation of ["$15", "$10.50"]) {
    const revisedPrice = { ...event, description: "Bring your pet to Park Valencia. Photos are a minimum donation of " + donation + "." };
    assert.equal(applyVerifiedEventFacts(revisedPrice).cost, null);
  }
  const publisherPrice = { ...event, cost: "paid", costNote: "From $30" };
  assert.equal(applyVerifiedEventFacts(publisherPrice).costNote, "From $30");
  const differentDate = { ...event, date: "2027-12-12" };
  assert.deepEqual(applyVerifiedEventFacts(differentDate), differentDate);
});

test("the verified Earthquakes Playoff Game 1 is paid without assuming a price", () => {
  const event = {
    date: "2026-11-24",
    cost: null,
    url: "https://www.tixr.com/groups/sjearthquakes/events/audi-mls-cup-playoffs-round-1-game-1-212863",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.deepEqual(fixed, { ...event, cost: "paid" });
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const otherDate = { ...event, date: "2026-12-02" };
  assert.deepEqual(applyVerifiedEventFacts(otherDate), otherDate);
  const explicitPrice = { ...event, cost: "low", costNote: "$20" };
  assert.deepEqual(applyVerifiedEventFacts(explicitPrice), explicitPrice);
});

test("the December 3 Candlelight listing points to paid music tickets and preserves closures", () => {
  const event = {
    id: "sjsu-192b4de184cb13b2", date: "2026-12-03", title: "Candlelight - 90s Unplugged",
    time: "8:45 PM", endTime: "9:45 PM", cost: null, category: "arts",
    city: "san-jose", venue: "Hammer Theatre Center, Sobrato Auditorium",
    url: "https://events.sjsu.edu/event/candlelight-90s-unplugged",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.url, "https://feverup.com/m/356802");
  assert.equal(fixed.cost, "paid");
  assert.equal(fixed.category, "music");
  assert.equal(fixed.registration, "required");
  assert.match(fixed.attendanceNote, /Ages 8 and up/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.equal(applyVerifiedEventFacts({ ...event, registration: "closed" }).registration, "closed");
  const otherDate = { ...event, date: "2026-12-04" };
  assert.deepEqual(applyVerifiedEventFacts(otherDate), otherDate);
  const retired = {
    ...event, id: "hammertheatre-9d6ddc1d809b8b31", title: "Fever presents Candlelight: 90s Unplugged",
    venue: "Hammer Theatre Center", url: fixed.url,
  };
  const ledger = retireSlugs({}, [retired], [fixed], "2026-11-23");
  const { redirects } = resolveRetired(ledger, [fixed], [], "2026-11-23");
  assert.equal(redirects.get("2026-12-03-fever-presents-candlelight-90s-unplugged"), "2026-12-03-candlelight-90s-unplugged");
});

test("the two December 4 Candlelight shows keep their own ticket link, time and access status", () => {
  for (const [slug, ticketId, time] of [
    ["candlelight-coldplay-imagine-dragons-2895", "262152", "6:30 PM"],
    ["candlelight-the-best-of-joe-hisaishi-7754", "353164", "8:45 PM"],
  ]) {
    const listing = {
      date: "2026-12-04", time, url: `https://events.sjsu.edu/event/${slug}`,
      category: "education", cost: null, registration: "closed",
    };
    const fixed = applyVerifiedEventFacts(listing);
    assert.equal(fixed.url, `https://feverup.com/m/${ticketId}`);
    assert.equal(fixed.time, time);
    assert.equal(fixed.cost, "paid");
    assert.equal(fixed.category, "music");
    assert.equal(fixed.registration, "closed");
    assert.equal(applyVerifiedEventFacts({ ...listing, registration: undefined }).registration, "required");
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const otherDate = { ...listing, date: "2027-01-21" };
    assert.deepEqual(applyVerifiedEventFacts(otherDate), otherDate);
    const otherTime = { ...listing, time: "10:00 AM" };
    assert.deepEqual(applyVerifiedEventFacts(otherTime), otherTime);
  }
});

test("Calabazas game club exposes conflicting signup instructions without inventing a deadline", () => {
  const listing = {
    date: "2026-12-01", url: "https://sjpl.bibliocommons.com/v2/events/6abef32c377296003a4913be",
    category: "education", registration: "required", registrationClosesBy: "2026-11-30T08:00:00.000Z",
    description: "Try games with your neighbors. No registration is required—just drop in and play!",
  };
  const fixed = applyVerifiedEventFacts(listing);
  assert.equal(fixed.category, "community");
  assert.equal(fixed.registration, null);
  assert.equal(fixed.registrationClosesBy, null);
  assert.equal(fixed.attendanceStatus, "needs-confirmation");
  assert.equal(fixed.description, "Try games with your neighbors.");
  assert.match(fixed.attendanceNote, /Confirm with Calabazas Library/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const resolved = { ...listing, description: "Try games with your neighbors. Sign up to reserve a seat." };
  assert.deepEqual(applyVerifiedEventFacts(resolved), resolved);
});

test("verified IMAX film ratings follow new showtimes in the same run", () => {
  for (const [date, title, ticketId] of [
    ["2026-11-29", "Hunger Games: Sunrise on the Reaping", "01a0f8a9-e4e2-59f2-90c5-8daebe40da6e"],
    ["2026-12-17", "Dune: Part Three", "3a7103f8-b895-1016-ff22-236b306b04af"],
  ]) {
    const event = {
      date, title, time: "5:30 PM", category: "community", kidFriendly: true,
      source: "The Tech Interactive", venue: "The Tech Interactive",
      url: `https://tickets.thetech.org/events/${ticketId}`,
    };
    const fixed = applyVerifiedEventFacts(event);
    assert.deepEqual(fixed, {
      ...event, category: "arts", kidFriendly: false, attendanceNote: "Film rated PG-13.",
    });
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const unrelated = { ...event, title: "Girl Scout Program" };
    assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  }
});

test("TeenHQ uses the linked poster dimensions on raw and normalized studio copy", () => {
  const event = {
    source: "San Jose Public Library",
    title: "TeenHQ MakerSpace Studio",
  };
  const prefix = "Poster Printing: All prints must be assembled on a ";
  const suffix = " canvas and printed as a PNG file. One poster per teen per day.";
  for (const size of ['2"x3"', "2”x3”"]) {
    const raw = { ...event, description: prefix + size + suffix };
    const fixed = { ...event, description: prefix + "24 × 36-inch" + suffix };
    assert.deepEqual(applyVerifiedEventFacts(raw), fixed);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const unrelated = { ...raw, title: "Miniature Art Workshop" };
    assert.deepEqual(applyVerifiedEventFacts(unrelated), unrelated);
  }
});

test("TeenHQ preserves the confirmed November 25 in-person signup and replaces stale series instructions", () => {
  const event = {
    source: "San Jose Public Library",
    title: "TeenHQ MakerSpace Studio",
    date: "2026-11-25",
    url: "https://sjpl.bibliocommons.com/v2/events/6927797a0886c5530056c25b",
    attendanceNote: "Advance registration is recommended. Walk-ins can take unclaimed spots at 4:30 PM.",
  };
  for (const arrival of [
    "If not all claimed registration spots have arrived by 4:30PM, they will be given to those waiting.",
    "If registered participants have not arrived by 4:30 PM, their spots will be given to those waiting.",
  ]) {
    const raw = {
      ...event,
      description: [
        "Up to 5 teens can use the equipment.",
        "Pre-registration is recommended to reserve your spot.",
        arrival,
        "The program is free for grades 6–12.",
        "Pre-registration will start 1 week before the start of the program.",
        "Registration closes 1 hour before the start of the program.",
        "Drop-ins will be accepted if not all registration slots are filled and if not all registered individuals arrive by 4:30 PM.",
        "The area is wheelchair accessible from the Children's Room elevator.",
      ].join(" "),
    };
    const fixed = applyVerifiedEventFacts(raw);
    assert.equal(fixed.description, "Up to 5 teens can use the equipment. The program is free for grades 6–12. The area is wheelchair accessible from the Children's Room elevator.");
    assert.equal(fixed.attendanceNote, "In-person sign-up opens at 3:45 PM. The first five teens get a spot.");
    assert.equal(requiresAttendanceConfirmation(fixed), false);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const later = { ...raw, date: "2026-12-02" };
    assert.deepEqual(applyVerifiedEventFacts(later), later);
    for (const registration of ["required", "full", "closed"]) {
      const booking = { ...raw, registration };
      assert.deepEqual(applyVerifiedEventFacts(booking), booking);
    }
  }

  const carried = {
    ...event,
    description: "In-person sign-up starts at 3:45 p.m. on the day of the event. The first five teens are guaranteed a spot.",
    attendanceStatus: "needs-confirmation",
    attendanceNote: "The event page has no signup link. Space is limited to five teens. Check with TeenHQ for availability.",
  };
  const fixed = applyVerifiedEventFacts(carried);
  assert.equal(fixed.description, carried.description);
  assert.equal(fixed.attendanceNote, "In-person sign-up opens at 3:45 PM. The first five teens get a spot.");
  assert.equal(requiresAttendanceConfirmation(fixed), false);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
});

test("Hillview's Saturday Fun stays open to all ages when the library says so", () => {
  const event = {
    title: "Saturday Fun: Arts, Crafts, and More", source: "San Jose Public Library",
    venue: "Hillview Library", sourceAudiences: ["Kids, ages 5-10"], audienceAge: "kids",
    description: "All supplies will be provided. All ages are welcome and no registration is required.",
  };
  assert.deepEqual(applyVerifiedEventFacts(event), { ...event, audienceAge: "all" });
  const childProgram = { ...event, description: "A craft program for children ages 5–10." };
  assert.deepEqual(applyVerifiedEventFacts(childProgram), childProgram);
});

test("Give Thanks Saturday distinguishes the single-day GA sellout from VIP options", () => {
  const event = {
    date: "2026-11-28",
    id: "tm-Z7r9jZ1AAAb0x",
    attendanceNote: "General admission is 18+ and VIP is 21+. Check the official ticket guide for current availability.",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.match(fixed.attendanceNote, /Saturday single-day general admission and two-day passes were sold out/);
  assert.match(fixed.attendanceNote, /Saturday VIP and three-day passes/);
  assert.equal(fixed.attendanceNote.match(/General admission is 18\+/g).length, 1);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
});

test("Easy Tech Seniors retains conditional walk-ins without reopening a full class", () => {
  const program = {
    date: "2026-11-28",
    url: "https://sjpl.bibliocommons.com/v2/events/68fc0358c313c23700ded895",
    description: "Free. Class limited to 10 attendees. Registration Recommended. Walk-Ins welcome if space is available.",
    registration: "required", registrationClosesBy: "2026-11-28T18:30:00.000Z",
  };
  const fixed = applyVerifiedEventFacts(program);
  assert.equal(requiresAdvanceRegistration(fixed), false);
  assert.equal(fixed.registrationClosesBy, null);
  assert.match(fixed.attendanceNote, /walk-ins are welcome if space is available/i);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const full = { ...program, registration: "full" };
  assert.deepEqual(applyVerifiedEventFacts(full), full);
});

test("Books Inc.'s November 24 author event uses the published book title and RSVP details", () => {
  const incoming = {
    date: "2026-11-24",
    title: "KIMBERLY BEA with THE CURSE OF THE FEATHERS",
    time: "7:00 PM",
    endTime: null,
    cost: null,
    venue: "Books Inc. Mountain View",
    url: "https://www.booksinc.com/pages/events",
    source: "Books Inc",
  };
  const fixed = applyVerifiedEventFacts(incoming);
  assert.equal(fixed.title, "Kimberly Bea with The Curse of Feathers");
  assert.equal(fixed.endTime, "8:00 PM");
  assert.equal(fixed.cost, "free");
  assert.match(fixed.url, /eventbrite\.com\/e\/.*-1999730803665$/);
  assert.match(fixed.attendanceNote, /RSVP for free/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const anotherDate = { ...incoming, date: "2026-12-01" };
  assert.deepEqual(applyVerifiedEventFacts(anotherDate), anotherDate);
});

test("Saratoga holiday dates retain the city's hours and direct occurrence links", () => {
  const appearances = [
    {
      eid: 2686, title: "Candy Cane Village", time: "3:00 PM", venue: "Historic Saratoga Village",
      verified: {
        endTime: "5:00 PM", venue: "Saratoga Chamber of Commerce",
        address: "14460 Big Basin Way, Saratoga, CA 95070", cost: "free", kidFriendly: true,
      },
    },
    {
      eid: 2698, title: "Annual Holiday Tree Lighting", time: "5:30 PM", venue: "Blaney Plaza",
      verified: { endTime: "6:30 PM" },
    },
  ];

  for (const { eid, title, time, venue, verified } of appearances) {
    const url = `https://www.saratoga.ca.us/Calendar.aspx?EID=${eid}`;
    const event = {
      date: "2026-11-27", title, time, venue, endTime: null, cost: null,
      url: `${url}&month=11&year=2026&day=5&calType=0`,
    };
    const corrected = applyVerifiedEventFacts(event);
    assert.deepEqual(corrected, { ...event, ...verified, url });
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    const otherDate = { ...event, date: "2026-11-28" };
    assert.deepEqual(applyVerifiedEventFacts(otherDate), otherDate);
  }
});

test("SCU home games with official ticket pages retain their paid admission on refresh", () => {
  const incoming = {
    title: "Santa Clara University Women's Volleyball vs San Diego",
    date: "2026-11-23",
    url: "https://events.scu.edu/bronco-athletics/event/486885-santa-clara-university-womens-volleyball-vs-san",
    cost: "",
    address: "",
  };
  const fixed = {
    ...incoming,
    url: "https://scubroncos.scu.edu/events/santa-clara-volleyball-vs-san-diego-1tnrm0",
    cost: "paid",
    address: "500 El Camino Real, Santa Clara",
  };

  assert.deepEqual(applyVerifiedEventFacts(incoming), fixed);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const newSourceFacts = { ...incoming, cost: "low", costNote: "$10", address: "Verified venue entrance" };
  assert.deepEqual(applyVerifiedEventFacts(newSourceFacts), { ...newSourceFacts, url: fixed.url });
  const otherDate = { ...incoming, date: "2026-11-24" };
  assert.deepEqual(applyVerifiedEventFacts(otherDate), otherDate);
});

test("the Los Altos museum housing-policy talk is listed under Education", () => {
  const incoming = {
    title: "A Local History of Housing",
    date: "2027-01-20",
    url: "https://www.losaltoshistory.org/events/a-local-history-of-housing/",
    source: "Los Altos History Museum",
    category: "arts",
    venue: null,
    registration: "required",
  };

  const corrected = applyVerifiedEventFacts(incoming);
  assert.equal(corrected.category, "education");
  assert.equal(corrected.venue, null);
  assert.equal(corrected.registration, "required");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);

  const exhibit = { ...incoming, title: "The Road I Call Home", url: "https://www.losaltoshistory.org/exhibit/the-road-i-call-home/" };
  assert.deepEqual(applyVerifiedEventFacts(exhibit), exhibit);
});

test("the rescheduled Alviso Math Festival keeps the library's full title", () => {
  const incoming = {
    id: "sjpl-6b048c2795b0491ca004827b",
    date: "2026-11-29",
    title: "Math Festival",
    url: "https://sjpl.bibliocommons.com/events/6b048c2795b0491ca004827b",
  };

  const corrected = { ...incoming, title: "Math Festival at Alviso" };
  assert.deepEqual(applyVerifiedEventFacts(incoming), corrected);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);

  const otherFestival = { ...incoming, id: "different-library-festival" };
  assert.deepEqual(applyVerifiedEventFacts(otherFestival), otherFestival);
});

test("Almaden STEaM keeps this session's ticket pickup and leaves its topic open", () => {
  const event = {
    date: "2026-11-24",
    url: "https://sjpl.bibliocommons.com/v2/events/6a73854af213992f00c9cfe7",
    time: "4:30 PM", endTime: "5:30 PM",
    description: "Oct 20 - Properties of Water. Nov 24 - TBA; Dec 1 - Let's Build Parachutes.",
    attendanceNote: "Tickets will be distributed starting 60 minutes before the program. Children younger than age 9 must be accompanied by an adult caregiver during this program.",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.match(fixed.description, /Program Room.*November 24 topic/);
  assert.doesNotMatch(fixed.description, /Properties of Water|Parachutes/);
  assert.match(fixed.attendanceNote, /60 minutes.*Check with Almaden Library for caregiver requirements/);
  assert.equal(fixed.time, event.time);
  assert.equal(fixed.endTime, event.endTime);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const announced = { ...event, description: "Nov 24 - Simple Machines." };
  assert.deepEqual(applyVerifiedEventFacts(announced), announced);
});

test("Campbell's November Cinema Sunday uses its dated listing and address", () => {
  const event = {
    date: "2026-11-29", time: "2:00 PM", endTime: "5:30 PM",
    url: "https://sccl.bibliocommons.com/events/6ada6cfffee2d21deb2520e8",
    venue: "Campbell Library", address: "",
    description: "No registration is required. Cinema Sundays take place on the fourth Sunday of every month. Free snacks will be provided while supplies last.",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.deepEqual(fixed, {
    ...event,
    address: "77 Harrison Ave, Campbell, CA 95008",
    description: "No registration is required. Free snacks will be provided while supplies last.",
  });
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const moved = { ...event, venue: "Off-site venue" };
  assert.deepEqual(applyVerifiedEventFacts(moved), moved);
});

test("the November 28 Elf Squad workday welcomes volunteers of all ages", () => {
  const url = "https://www.pclg.org/this-week/2026-11-18.pdf";
  const incoming = {
    date: "2026-11-28",
    title: "PCLG Elf Squad Holiday Decorating",
    venue: "Presbyterian Church of Los Gatos",
    time: "9:00 AM",
    category: "outdoor",
    kidFriendly: false,
  };
  const expected = { ...incoming, url, category: "community", kidFriendly: true, audienceAge: "all" };
  assert.deepEqual(applyVerifiedEventFacts(incoming), expected);
  assert.deepEqual(applyVerifiedEventFacts({ ...incoming, url }), expected);
  assert.deepEqual(applyVerifiedEventFacts(expected), expected);

  const nextYear = { ...incoming, date: "2027-11-27" };
  assert.equal(applyVerifiedEventFacts(nextYear), nextYear);
});

test("dated Montalvo concerts agree across the newsletter and box office", () => {
  for (const [date, title, ticketPath, programSlug] of [
    ["2026-12-10", "Irish Christmas in America", "3113/3157", "irish-christmas-2"],
    ["2027-01-21", "Five for Fighting with String Quartet", "3114/3159", "five-for-fighting"],
  ]) {
    const newsletter = {
      date, title, time: "7:30 PM", city: "saratoga", category: "arts", venue: "Carriage House",
      url: `https://montalvoarts.org/experience/carriage-house-concerts/${programSlug}/?promo=`,
      blurb: 'Hear "Superman" and "100 Years" as part of the show.',
    };
    const ticketUrl = `https://my.montalvoarts.org/${ticketPath}`;
    const direct = { ...newsletter, url: ticketUrl, venue: "Montalvo Arts Center", cost: "paid" };
    const fixed = applyVerifiedEventFacts(newsletter);
    assert.deepEqual(fixed, applyVerifiedEventFacts(direct));
    assert.deepEqual(fixed, applyVerifiedEventFacts(fixed));
    assert.equal(fixed.url, ticketUrl);
    assert.equal(fixed.venue, "Carriage House Theatre");
    assert.equal(fixed.cost, "paid");
    assert.equal(fixed.category, "music");
    assert.doesNotMatch(fixed.blurb, /Superman|100 Years/);
    assert.equal(applyVerifiedEventFacts({ ...newsletter, time: "8:00 PM" }).time, "8:00 PM");
    const anotherDate = { ...newsletter, date: "2027-12-10" };
    assert.deepEqual(applyVerifiedEventFacts(anotherDate), anotherDate);
  }
});

test("the Mt. Pleasant volunteer listing keeps signup uncertainty visible", () => {
  const event = {
    id: "sjpl-6ae233d229c3d60033331a04", date: "2026-11-25",
    description: "Drop in to work off library fines. To register, please call 408-808-3088.",
    blurb: "Drop in to help at Mt. Pleasant Library.",
    attendanceNote: "Volunteers under 15 must attend with a parent or guardian.",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(requiresAttendanceConfirmation(fixed), true);
  assert.match(fixed.attendanceNote, /parent or guardian.*Call 408-808-3088 to confirm signup/);
  assert.doesNotMatch(fixed.blurb, /drop in/i);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const clarified = { ...event, description: "Drop in to work off library fines. No registration required." };
  assert.deepEqual(applyVerifiedEventFacts(clarified), clarified);
});

test("the Guadalupe volunteer series drops stale PlayGarden access without changing attendance facts", () => {
  const roseTitle = "Volunteer in the Heritage Rose Garden!";
  const orchardTitle = "Volunteer in the Historic Orchard with UC Master Gardeners!";
  const shifts = [
    ["20f169faf651", "2026-11-21", roseTitle, "Rose Garden Shed", "8:30 AM",
      "Restrooms are available at the Rotary PlayGarden starting at 10AM. We highly recommend using the restrooms prior to volunteering."],
    ["fc11ad3b983b", "2026-11-28", roseTitle, "Rose Garden Shed", "8:30 AM",
      "Restrooms are available at the Rotary Play Garden starting at 10 AM. We highly recommend using the restrooms prior to volunteering."],
    ["40073c1e84f7", "2026-11-25", orchardTitle, "Historic Orchard", "9:30 AM",
      "Restrooms are available at the Rotary PlayGarden and will require staff assistance."],
  ];

  for (const [id, date, title, venue, time, staleCopy] of shifts) {
    const instructions = "Chaperones are required for those age 15 and younger.";
    const meeting = "Meet at the site shown on the registration form.";
    const event = {
      id, date, title, venue, time, endTime: "11:30 AM", registration: "required",
      source: "Guadalupe River Park Conservancy", url: "https://grpg.org/calendar/events/",
      description: [instructions, staleCopy, meeting].join(" "),
      attendanceNote: [staleCopy, meeting].join(" "),
    };
    const expected = { ...event, description: [instructions, meeting].join(" "), attendanceNote: meeting };
    assert.deepEqual(applyVerifiedEventFacts(event), expected);
    assert.deepEqual(applyVerifiedEventFacts(expected), expected);
    const beforeClosure = { ...event, date: "2026-10-31" };
    assert.deepEqual(applyVerifiedEventFacts(beforeClosure), beforeClosure);
    const otherSeries = { ...event, title: "Guadalupe Gardens Workday" };
    assert.deepEqual(applyVerifiedEventFacts(otherSeries), otherSeries);
    const futureShift = { ...event, date: "2026-12-02" };
    assert.deepEqual(applyVerifiedEventFacts(futureShift), { ...expected, date: futureShift.date });
  }
});

test("the two Milpitas Qi Gong classes keep accessibility and current notices when 2025 exceptions are dropped", () => {
  const staleCopy = "Please note that there is no class on the following dates in 2025: August 29, September 12, November 28, and December 5.";
  const introduction = "Classes meet in the auditorium.";
  const accessibility = "For accessibility accommodations, use the form at sccld.org/accessibility.";
  const currentNotice = "There is no class on December 25, 2026.";
  for (const [sourceId, date] of [
    ["65baeaeff664ce330023eafa", "2026-12-04"],
    ["65baeaeff664ce330023eafb", "2026-12-11"],
  ]) {
    const event = {
      id: "sccl-" + sourceId, date, time: "1:00 PM", endTime: "3:00 PM",
      title: "Qi Gong Meditation & Exercise Class", venue: "Milpitas Library",
      source: "Santa Clara County Library", url: "https://sccl.bibliocommons.com/events/" + sourceId,
      description: [introduction, staleCopy, accessibility, currentNotice].join(" "),
    };
    const expected = { ...event, description: [introduction, accessibility, currentNotice].join(" ") };
    assert.deepEqual(applyVerifiedEventFacts(event), expected);
    assert.deepEqual(applyVerifiedEventFacts(expected), expected);
    const otherEvent = { ...event, id: "sccl-other-occurrence" };
    assert.deepEqual(applyVerifiedEventFacts(otherEvent), otherEvent);
  }
});

test("Natalia Jiménez uses the box-office showtime and retains the listing identity", () => {
  const event = {
    id: "sanjosetheaters-d4ced2bfe1529bde",
    date: "2027-02-14", time: "8:00 PM", endTime: null, venue: "San Jose Civic",
    title: "Natalia Jiménez — La Jiménez", source: "San Jose Theaters",
    url: "https://www.sanjose.org/theaters/events/natalia-jimenez-la-jimenez",
  };
  event.occurrenceEvidence = {
    kind: "first-party-occurrence-page", date: event.date, time: event.time, sourceUrl: event.url,
  };
  const verified = applyVerifiedEventFacts(event);
  assert.equal(verified.time, "7:00 PM");
  assert.equal(verified.endTime, null);
  assert.equal(verified.id, event.id);
  assert.equal(verified.title, event.title);
  assert.equal(verified.url, event.url);
  assert.equal(verified.occurrenceEvidence.sourceUrl, event.url);
  assert.equal(verified.occurrenceEvidence.time, verified.time);
  assert.equal(verified.occurrenceEvidence.timeSourceUrl, "https://www.ticketmaster.com/event/1C006566BE13D9B4");
  const updated = applyVerifiedEventFacts({ ...event, id: "updated-source-id", time: "7:00 PM" });
  assert.deepEqual(updated, verified);
  const differentTime = { ...event, time: "4:00 PM" };
  assert.deepEqual(applyVerifiedEventFacts(differentTime), differentTime);
});

test("Les Misérables uses its production rating without changing the showtimes", () => {
  const event = {
    title: "Les Misérables", date: "2027-05-09", time: "6:00 PM",
    venue: "Montgomery Theater", source: "San Jose Theaters",
    url: "https://www.sanjose.org/theaters/events/les-miserables",
    category: "family", kidFriendly: true, attendanceNote: "Tickets sold out.",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.deepEqual(corrected, {
    ...event,
    category: "arts",
    kidFriendly: false,
    attendanceNote: "Tickets sold out. Children's Musical Theater rates this production for ages 12 and up in its student matinee guide.",
  });
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const otherRun = { ...event, date: "2028-05-09" };
  assert.deepEqual(applyVerifiedEventFacts(otherRun), otherRun);
});

test("Come From Away uses CMT's age guidance only for the Montgomery Theater run", () => {
  const event = {
    title: "Come from Away", date: "2026-12-13", time: "1:00 PM",
    venue: "Montgomery Theater", source: "San Jose Theaters",
    url: "https://www.sanjose.org/theaters/events/come-away",
    category: "family", kidFriendly: true,
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.deepEqual(corrected, {
    ...event,
    category: "arts",
    kidFriendly: false,
    attendanceNote: "Children's Musical Theater rates this production for ages 10 and up in its student matinee guide.",
  });
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const otherProduction = {
    ...event, source: "South Bay Musical Theatre", venue: "Saratoga Civic Theater",
    url: "https://southbaymt.com/shows/ticket-sales/come-from-away/",
  };
  assert.deepEqual(applyVerifiedEventFacts(otherProduction), otherProduction);
  const otherRun = { ...event, date: "2026-12-14" };
  assert.deepEqual(applyVerifiedEventFacts(otherRun), otherRun);
});

test("Come From Away uses the Saratoga producer's own parental advisory", () => {
  const event = {
    title: "Come From Away", date: "2027-02-13", time: "2:30 PM",
    source: "South Bay Musical Theatre", venue: "Saratoga Civic Theater",
    url: "https://southbaymt.com/shows/ticket-sales/come-from-away/",
    category: "arts", kidFriendly: true, attendanceNote: "Tickets sold out.",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.deepEqual(corrected, {
    ...event,
    kidFriendly: false,
    attendanceNote: "Tickets sold out. South Bay Musical Theatre advises parental discretion for younger children. The show deals with the September 11 attacks and includes occasional strong language.",
  });
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const otherRun = { ...event, date: "2028-02-13" };
  assert.equal(applyVerifiedEventFacts(otherRun), otherRun);
});

test("the dated Neighborhood Hands cleanup keeps the organizer's program times", () => {
  const event = {
    id: "94b3de5fed7c", date: "2026-11-28",
    title: "Neighborhood Hands Bi-monthly Cleanup",
    time: "7:45 AM", endTime: "10:30 AM", venue: "Guadalupe Gardens",
    source: "Guadalupe River Park Conservancy", url: "https://grpg.org/calendar/events/",
    description: "Cleanup until approximately 9:15 a.m. and a resource fair until 10:30 a.m.",
  };
  const verified = applyVerifiedEventFacts(event);
  assert.equal(verified.time, event.time);
  assert.equal(verified.endTime, "10:15 AM");
  assert.equal(verified.id, event.id);
  assert.equal(verified.url, event.url);
  assert.match(verified.description, /Weather permitting, volunteers clean the park until about 9:10 a\.m\./);
  assert.match(verified.description, /resource fair ends around 10:15 a\.m\./);
  assert.deepEqual(applyVerifiedEventFacts(verified), verified);
  const otherDay = { ...event, date: "2026-12-12" };
  assert.deepEqual(applyVerifiedEventFacts(otherDay), otherDay);
});

test("West Valley art series preserves walk-ins after its online cutoff", () => {
  const event = {
    date: "2026-11-25", registration: "closed", registrationClosesBy: "2026-11-23T18:00:00.000Z",
    url: "https://sjpl.bibliocommons.com/v2/events/6abc19e7035faf0033d92bf1",
    description: "Registration recommended. Registered participants have priority, followed by walk-ins.",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.registration, "none");
  assert.equal(fixed.registrationClosesBy, null);
  assert.match(fixed.attendanceNote, /walk-ins if space remains/);
  assert.equal(applyVerifiedEventFacts({ ...event, registrationClosesBy: null }).registration, "closed");
  assert.equal(applyVerifiedEventFacts({ ...event, date: "2026-11-26" }).registration, "closed");
});

test("Edenvale STEM sessions keep the day's activity and mandatory sign-in", () => {
  const sessions = [
    ["2026-11-23", "6ac02726e06996003a80e844", "Buzz Off"],
    ["2026-11-24", "6ac02726e06996003a80e845", "hovercrafts"],
    ["2026-11-25", "6ac02726e06996003a80e846", "stop-motion animation"],
  ];
  for (const [date, id, activity] of sessions) {
    const event = {
      date,
      url: `https://sjpl.bibliocommons.com/v2/events/${id}`,
      blurb: "Drop in for Buzz Off, hovercrafts, and stop-motion animation.",
    };
    const fixed = applyVerifiedEventFacts(event);
    assert.deepEqual(sessions.map(([, , name]) => fixed.blurb.includes(name)),
      sessions.map(([, , name]) => name === activity));
    assert.match(fixed.attendanceNote, /Space is limited\. Everyone must sign in at the information desk starting 30 minutes before/);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    assert.equal(applyVerifiedEventFacts({ ...event, date: "2026-11-26" }).blurb, event.blurb);
  }
});

test("the Cupertino library listing preserves in-person signup", () => {
  const reading = applyVerifiedEventFacts({
    date: "2026-12-14", registration: "required",
    url: "https://sccl.bibliocommons.com/v2/events/693b7d1394297d36009f8651",
  });
  assert.equal(reading.registration, "required");
  assert.match(reading.attendanceNote, /in person at the Children's Reference Desk/);
  assert.match(reading.attendanceNote, /408-446-1677 ext\. 3320/);
});

test("the Montalvo newsletter alias retains Charo's ticketed occurrence and official title", () => {
  const event = {
    date: "2026-12-05", title: "Christmas with Charo", cost: null,
    url: "https://my.montalvoarts.org/3111/3155?promo=",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.title, "Charo: Have Yourself a Cuchi Little Christmas");
  assert.equal(fixed.url, "https://my.montalvoarts.org/3111/3155");
  assert.equal(fixed.time, "7:30 PM");
  assert.equal(fixed.cost, "paid");
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.equal(applyVerifiedEventFacts({ ...event, date: "2026-12-06" }).cost, null);
});

test("Los Altos book club pickup instructions survive the event blurb and a full registration window", () => {
  const event = {
    date: "2026-11-24", registration: "full",
    url: "https://sccl.bibliocommons.com/v2/events/6adfe9fa9d27a00045538d73",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.match(fixed.blurb, /grades 6–8 discuss Stargirl/);
  assert.match(fixed.attendanceNote, /Los Altos or Woodland Library/);
  assert.equal(fixed.registration, "full");
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
});

test("visiting hours stay with an ongoing university exhibition as its date rolls", () => {
  const branner = {
    url: "https://events.stanford.edu/event/branner-library-book-map-exhibit-water",
    date: "2026-11-21", ongoing: true,
    attendanceNote: "Visitors must present a valid, physical government-issued photo ID.",
  };
  const first = applyVerifiedEventFacts(branner);
  assert.match(first.attendanceNote, /government-issued photo ID/);
  assert.match(first.attendanceNote, /Monday through Friday/);
  assert.deepEqual(applyVerifiedEventFacts(first), first);
  assert.match(applyVerifiedEventFacts({ ...branner, date: "2026-11-22" }).attendanceNote, /Monday through Friday/);
  assert.equal(applyVerifiedEventFacts({ ...branner, ongoing: false }).attendanceNote, branner.attendanceNote);
  assert.equal(applyVerifiedEventFacts({ ...branner, date: "2026-12-19" }).attendanceNote, branner.attendanceNote);
});

test("the Beethoven Center's December 3 concert uses the verified program and admission", () => {
  const concert = {
    url: "https://events.sjsu.edu/event/noontime-concerts-at-the-beethoven-center-series-december-3",
    date: "2026-12-03", cost: null,
    description: "Performers: Elizabeth Dorman (fortepiano) and Dorian Bandy (violin) Program: Mozart: Violin Sonata in C major, K.",
  };
  const reviewed = applyVerifiedEventFacts(concert);
  assert.equal(reviewed.cost, "free");
  assert.match(reviewed.description, /two Mozart sonatas and Beethoven's variations/);
  assert.match(reviewed.description, /coffee reception and open house/);
  assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
  assert.equal(applyVerifiedEventFacts({ ...concert, cost: "paid" }).cost, "paid");
  const differentDate = { ...concert, date: "2026-12-04" };
  assert.equal(applyVerifiedEventFacts(differentDate), differentDate);
});

test("Jurassic Quest follows the organizer's family format and daily hours", () => {
  const event = {
    source: "Ticketmaster",
    venue: "Santa Clara County Fairgrounds",
    url: "https://www.universe.com/events/jurassic-quest-san-jose-ca-santa-clara-county-fairgrounds-tickets-XGBKF2?ref=ticketmaster",
    category: "community",
  };
  for (const [date, endTime] of [["2027-01-22", "6:00 PM"], ["2027-01-23", "8:00 PM"], ["2027-01-24", "5:00 PM"]]) {
    const corrected = applyVerifiedEventFacts({ ...event, date });
    assert.equal(corrected.category, "family");
    assert.equal(corrected.kidFriendly, true);
    assert.equal(corrected.endTime, endTime);
    assert.equal(Boolean(corrected.attendanceNote), date === "2027-01-23");
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }
  const otherDate = { ...event, date: "2027-01-25" };
  assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
});

test("The Ritz showtime conflict stays visible and out of recommendations", () => {
  const event = { id: "tm-rZ7HnEZ1AfGJZ0", date: "2026-11-20", time: "9:00 PM", attendanceNote: "Ages 18+." };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.time, "8:00 PM");
  assert(requiresAttendanceConfirmation(fixed));
  assert.match(fixed.attendanceNote, /^Ages 18\+\. TicketWeb.*8 PM.*Ticketmaster.*9 PM/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const previous = { ...event, time: "8:00 PM", attendanceNote: "Ages 18+. Ticketmaster lists 8 PM. Check the organizer's ticket link for current entry rules and schedule." };
  assert.deepEqual(applyVerifiedEventFacts(previous), fixed);
  const agreeingSource = { ...event, time: "8:00 PM" };
  assert.deepEqual(applyVerifiedEventFacts(agreeingSource), agreeingSource);
});

test("House of Heavy describes the organizer's DJ format with no unverified price", () => {
  const event = { id: "tm-rZ7HnEZ1Afu84f", date: "2026-12-05", cost: "paid", costNote: "From $263", blurb: "Catch heavy music acts." };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.cost, "paid");
  assert.equal(fixed.costNote, null);
  assert.match(fixed.description, /^DJs play .*18 and up with valid ID/);
  assert.match(fixed.blurb, /DJ night/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
});

test("dated library events follow the organizer's program type and audience", () => {
  const game = {
    date: "2026-11-22",
    url: "https://sjpl.bibliocommons.com/events/6aa4453c65abe8002a78720c",
    title: "Game On at the Library",
    venue: "Joyce Ellington Library",
    source: "San Jose Public Library",
    category: "education",
    description: "Play board games at the Joyce Ellington Branch every Sunday at 1:00 p.m.",
  };
  const storytime = {
    date: "2026-12-09",
    url: "https://sccl.bibliocommons.com/v2/events/6afe848404009d003389998f",
    source: "Santa Clara County Library",
    audienceAge: "all",
    sourceAudiences: ["Kids: Family Events", "Kids: Preschoolers"],
    description: "For children ages 0-5. Seating is limited.",
  };
  const craftFair = {
    date: "2026-11-21",
    url: "https://sjpl.bibliocommons.com/v2/events/6ab6f84dda318a10e636d249",
    category: "arts",
  };
  const nextGame = { ...game, date: "2026-11-29", url: "https://sjpl.bibliocommons.com/v2/events/6aa4453c65abe8002a78720d" };
  for (const event of [game, nextGame]) {
    assert.deepEqual(applyVerifiedEventFacts(event), { ...event, category: "family" });
  }
  const otherBranch = { ...nextGame, venue: "Hillview Library" };
  assert.deepEqual(applyVerifiedEventFacts(otherBranch), otherBranch);
  const cafe = {
    date: "2026-11-29", url: "https://sjpl.bibliocommons.com/events/6ad13dbcfee2d21deb239013",
    category: "education",
  };
  assert.deepEqual(applyVerifiedEventFacts(cafe), { ...cafe, category: "community" });
  assert.deepEqual(applyVerifiedEventFacts(storytime), { ...storytime, audienceAge: "kids" });
  assert.deepEqual(applyVerifiedEventFacts(craftFair), { ...craftFair, category: "market" });
  const newProgram = { ...game, description: "Learn to design your own video game." };
  assert.deepEqual(applyVerifiedEventFacts(newProgram), newProgram);
  const newAudience = { ...storytime, description: "Open to all ages." };
  assert.deepEqual(applyVerifiedEventFacts(newAudience), newAudience);
});

test("the Chorale and museum ticket corrections keep dates and current availability", () => {
  const concert = {
    date: "2026-12-13", time: "4:00 PM",
    url: "https://events.scu.edu/center-for-spirituality-and-faith/event/517221-santa-clara-chorale-concert",
  };
  const fixed = applyVerifiedEventFacts(concert);
  assert.deepEqual(fixed, {
    ...concert, url: "https://www.scc.org/december-peace-on-earth.html",
    cost: "paid", costNote: "Adult tickets from $30", registration: "required",
  });
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.equal(applyVerifiedEventFacts({ ...concert, registration: "full" }).registration, "full");
  const unrelatedDate = { ...concert, date: "2026-12-14" };
  assert.deepEqual(applyVerifiedEventFacts(unrelatedDate), unrelatedDate);

  const tasting = { date: "2026-12-05", url: "https://www.jamsj.org/upcoming-events/kampai2026" };
  const ticketedTasting = applyVerifiedEventFacts(tasting);
  assert.equal(ticketedTasting.cost, "paid");
  assert.equal(ticketedTasting.costNote, "$115 general; $100 for JAMsj or Yu-Ai Kai members");
  assert.equal(ticketedTasting.registration, "required");
  assert.equal(applyVerifiedEventFacts({ ...tasting, registration: "closed" }).registration, "closed");
});

test("the December 12 Peninsula Women's Chorus concert keeps the published finish and box office", () => {
  const concert = {
    date: "2026-12-12",
    time: "1:00 PM",
    url: "https://events.scu.edu/center-for-spirituality-and-faith/event/517224-peninsula-womens-chorus-concert",
    cost: "",
  };
  const fixed = {
    ...concert,
    url: "https://pwchorus.ticketspice.com/pwc-2026-2027-season",
    endTime: "3:00 PM",
    cost: "paid",
    costNote: "$39 general, $59 premium, $10 young audience",
    registration: "required",
    attendanceNote: "Single-concert ticket sales open November 23.",
  };
  assert.deepEqual(applyVerifiedEventFacts(concert), fixed);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.equal(applyVerifiedEventFacts({ ...concert, registration: "full" }).registration, "full");
  const otherPerformance = { ...concert, date: "2026-12-11", url: fixed.url };
  assert.deepEqual(applyVerifiedEventFacts(otherPerformance), otherPerformance);
});

test("conflicting SJPL signup instructions are disclosed without a reservation badge", () => {
  const source = "https://sjpl.bibliocommons.com";
  for (const [path, description, venue] of [
    ["events/6a3f10cc4407827f8aa7ada2", "Free. Registration requested, but not required.", "Alum Rock Library"],
    ["v2/events/6a88a8afb2047800299484a3", "Free. Registration requested, but not required.", "Alum Rock Library"],
    ["events/6ac6a0e7fee2d21deb21c21a", "Free. Registration recommended but not required.", "Bascom Library"],
  ]) {
    const event = { date: "2026-11-22", url: `${source}/${path}`, description,
      registration: "required", registrationClosesBy: "2026-11-22T22:00:00.000Z" };
    const fixed = applyVerifiedEventFacts(event);
    assert.equal(requiresAdvanceRegistration(fixed), false);
    assert.equal(requiresAttendanceConfirmation(fixed), true);
    assert.equal(fixed.registrationClosesBy, null);
    assert.equal(fixed.description, "Free.");
    assert.match(fixed.attendanceNote, /signup panel says registration is required.*description says it is optional/);
    assert(fixed.attendanceNote.includes(venue));
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    for (const changed of [
      { ...event, date: "2026-11-29" },
      { ...event, registration: "closed" },
      { ...event, description: "Registration required." },
    ]) assert.deepEqual(applyVerifiedEventFacts(changed), changed);
  }
});

test("Alviso's November 24 reading keeps the library's story-language wording on refresh", async () => {
  const event = {
    date: "2026-11-24",
    title: "Reading to Children",
    venue: "Alviso Library",
    url: "https://sjpl.bibliocommons.com/events/6ab40cd2da318a10e6363672",
    description: "Our wonderful volunteer, Ning, will read stories in Mandarin or English to children and their families.",
    blurb: "Listen to volunteer Ning read stories in Mandarin and English to children and families.",
  };
  const refreshed = [
    { ...event },
    { ...event, url: event.url.replace("/events/", "/v2/events/"), blurb: undefined },
  ];
  await resolveEventBlurbs(refreshed, { enabled: false });
  for (const item of refreshed) {
    assert.deepEqual(item, { ...event, url: item.url, blurb: event.blurb.replace("and English", "or English") });
  }
  for (const changed of [
    { ...event, date: "2026-12-01" },
    { ...event, url: "https://sjpl.bibliocommons.com/events/other-event" },
    { ...event, description: "Volunteer Ning will read stories in Mandarin and English." },
  ]) assert.deepEqual(applyVerifiedEventFacts(changed), changed);
});

test("Tully's ESL 502 listing gives the verified placement step and removes the conflicting branch directions", () => {
  const help = "We will assist you with the application and registration processes in person at the Educational Park Branch Library.";
  const steps = "Complete and pass the Self-Guided Computer Assessment. This is not a test—it's simply an assessment to help us place you in the most appropriate ESL class based on your current English level.";
  for (const [path, intro] of [["events", "To Enroll, You Must:"], ["v2/events", "To enroll,"]]) {
    const event = {
      date: "2026-11-24", venue: "Tully Library", registration: "full",
      url: `https://sjpl.bibliocommons.com/${path}/6a46be4a48c98c3600a3fbb3`,
      description: `${intro} ${steps} Submit the registration form. ${help} Space is limited.`,
      attendanceNote: `${help} Space is limited.`,
    };
    const fixed = applyVerifiedEventFacts(event);
    assert.equal(fixed.description, "Complete Guided Self-Placement before enrolling so the college can help you choose the right ESL level. Submit the registration form. Space is limited.");
    assert.equal(fixed.attendanceNote, "Space is limited.");
    assert.equal(fixed.venue, "Tully Library");
    assert.equal(fixed.registration, "full");
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const other = { ...event, url: event.url.replace(/6a46be4a48c98c3600a3fbb3$/, "different-section") };
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("Edenvale's full ESL 501 session keeps its dated hours without obsolete enrollment directions", () => {
  const event = {
    date: "2026-11-24",
    url: "https://sjpl.bibliocommons.com/events/6a07b602c6a1dc3d00d40851",
    registration: "full",
    attendanceNote: "Space is limited.",
    time: "10:30 AM",
    endTime: "12:30 PM",
  };
  const raw = "Course Information: Starts: August 25, 2026; Ends: December 10, 2026; Meeting Days: Tuesday, Wednesday, and Thursday; Time: 10:30 AM - 12:30 PM; Instructor: Michelle N. Henninger. Before the classes start, you must complete a Guided Self-Placement (GSP). This is not a test—it's simply an assessment to help us place you in the most appropriate ESL class based on your current English level. We will assist you with the application and registration process in person at the Edenvale Branch Library. Space is limited.";
  const edited = "The course runs from August 25, 2026, through December 10, 2026. Classes meet Tuesday, Wednesday, and Thursday from 10:30 AM to 12:30 PM. The instructor is Michelle N. Henninger. Complete the Guided Self-Placement assessment before classes start. It helps the college place you in a class for your English level. Get help applying and registering in person at Edenvale Branch Library. Space is limited.";
  for (const [path, copy] of [["/events/", raw], ["/v2/events/", edited]]) {
    const row = {
      ...event,
      url: event.url.replace("/events/", path),
      description: `Free noncredit class. ${copy.replace(/ (We will assist you|Get help applying)/, " The class meets in the Community Room. $1")}`,
    };
    const fixed = applyVerifiedEventFacts(row);
    assert.deepEqual(fixed, {
      ...row,
      attendanceNote: undefined,
      description: "Free noncredit class. The instructor is Michelle N. Henninger. The class meets in the Community Room.",
    });
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const next = {
      ...row,
      date: "2026-11-25",
      url: row.url.replace(/6a07b602c6a1dc3d00d40851$/, "6a07b602c6a1dc3d00d40852"),
    };
    assert.deepEqual(applyVerifiedEventFacts(next), { ...fixed, date: next.date, url: next.url });
    for (const changed of [
      { ...row, registration: "required" },
      { ...row, date: "2026-11-25" },
      { ...row, url: row.url.replace(/6a07b602c6a1dc3d00d40851$/, "other-section") },
    ]) assert.deepEqual(applyVerifiedEventFacts(changed), changed);
  }
});

test("the full Educational Park class keeps its bilingual overview and session hours", () => {
  const row = {
    date: "2026-11-24",
    url: "https://sjpl.bibliocommons.com/events/69f1138fdefec6489cc0d968",
    time: "5:15 PM",
    endTime: "6:45 PM",
    registration: "full",
    description: "Submit the registration form. Completar el formulario de inscripción.",
    attendanceNote: "Space is limited.",
  };
  const fixed = applyVerifiedEventFacts(row);
  assert.match(fixed.description, /noncredit listening and speaking class.*Curso gratuito/);
  assert.doesNotMatch(fixed.description, /registration form|formulario de inscripción/);
  assert.equal(fixed.attendanceNote, undefined);
  assert.equal(fixed.time, row.time);
  assert.equal(fixed.endTime, row.endTime);
  assert.equal(fixed.registration, row.registration);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const other of [{ ...row, date: "2026-11-25" }, { ...row, registration: "required" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("Thanksgiving corrections keep exact occurrences and later registration notices", () => {
  const row = {
    source: "City Newsletter",
    city: "san-jose",
    date: "2026-11-26",
    title: "Thanksgiving Feast Gathering with Our Lady of Refuge",
    address: "2165 Lucretia Avenue, San Jose",
    url: "",
    time: "11:30 AM",
    endTime: "2:00 PM",
  };
  const fixed = applyVerifiedEventFacts(row);
  assert.equal(fixed.url, "https://www.eventbrite.com/e/thanksgiving-feast-gathering-tickets-2004205079344");
  assert.equal(fixed.venue, "Our Lady of Refuge");
  assert.equal(fixed.registration, "full");
  assert.match(fixed.attendanceNote, /sold out on November 23/);
  assert.doesNotMatch(fixed.blurb, /register/i);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const previousListing = {
    ...fixed,
    registration: "required",
    attendanceNote: "Seating is limited to registered guests and available on a first-come, first-served basis.",
    blurb: "Register for a Thanksgiving meal at Our Lady of Refuge in San Jose.",
  };
  assert.deepEqual(applyVerifiedEventFacts(previousListing), fixed);
  const closed = applyVerifiedEventFacts({ ...row, registration: "closed", attendanceNote: "Registration closed." });
  assert.equal(closed.registration, "closed");
  assert.match(closed.attendanceNote, /^Registration closed\./);
  for (const other of [
    { ...row, date: "2027-11-25" },
    { ...row, address: "2200 Lucretia Avenue, San Jose" },
    { ...row, url: "https://example.com/a-new-organizer-notice" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("Cars and Croissants uses Santana Row's explicit spectator admission and drops its ranking claim", () => {
  const event = {
    date: "2026-12-13",
    url: "https://santanarow.com/event/cars-croissants-on-the-row/",
    time: "9:00 AM",
    endTime: "12:00 PM",
    cost: null,
    description: "Experience one of the world’s premier exotic car gatherings, featuring an impressive display of supercars, luxury vehicles, and exotic marques from renowned manufacturers. This event is FREE to attend. Reserve a display space to show your car.",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.deepEqual(fixed, {
    ...event,
    cost: "free",
    description: "The show features supercars, luxury vehicles, and exotic marques. This event is FREE to attend. Reserve a display space to show your car.",
  });
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const differentDate = { ...event, date: "2026-12-20" };
  assert.deepEqual(applyVerifiedEventFacts(differentDate), differentDate);
  assert.equal(applyVerifiedEventFacts({ ...event, description: "Reserve a display space to show your car." }).cost, null);
  assert.equal(applyVerifiedEventFacts({ ...event, cost: "paid", costNote: "$5 spectator admission" }).cost, "paid");
});

test("Milpitas winter book sale applies the membership charge only to the preview", () => {
  const source = "https://sccl.bibliocommons.com";
  const preview = { date: "2026-12-03", cost: "free", category: "education",
    url: `${source}/events/6aece6bc30b4d5b2f42beee1` };
  const fixed = applyVerifiedEventFacts(preview);
  assert.equal(fixed.cost, "low");
  assert.equal(fixed.category, "market");
  assert.match(fixed.attendanceNote, /Members-only preview.*\$5 individually or \$10 per family.*rear/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const publicSale = { ...preview, date: "2026-12-04", url: `${source}/v2/events/6aece6bc30b4d5b2f42beee2` };
  assert.deepEqual(applyVerifiedEventFacts(publicSale), { ...publicSale, category: "market" });
});

test("Cupertino's Big Bunny calendar distinguishes the race start from same-day registration", () => {
  const event = {
    date: "2027-03-06",
    url: "https://www.cupertino.gov/Parks-Recreation/Events/Big-Bunny-5K/Big-Bunny-5K-Event",
    audienceAge: "kids",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.audienceAge, "all");
  assert.equal(fixed.cost, "paid");
  assert.match(fixed.attendanceNote, /5K starts at 8:30 AM on Torre Avenue in front of Cupertino City Hall/);
  assert.match(fixed.attendanceNote, /kids' run starts at 9:30 AM on Library Field for ages 7 and under/);
  assert.match(fixed.attendanceNote, /Same-day registration is available from 7 to 8:15 AM at Cupertino Community Hall if spots remain/);
  assert(!requiresAdvanceRegistration(fixed));
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const saved = { ...fixed, attendanceNote: "The 5K starts at 8:30 AM by Community Hall." };
  assert.deepEqual(applyVerifiedEventFacts(saved), fixed);
});

test("Cupertino's Hop 'n' Hunt calendar retains the published venue and admission", () => {
  const event = {
    date: "2027-03-27",
    url: "https://www.cupertino.gov/Parks-Recreation/Events/Hop-n-Hunt/Hop-n-Hunt",
    venue: null,
    address: "",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.venue, "Quinlan Community Center");
  assert.match(fixed.address, /^10185 North Stelling Road/);
  assert.equal(fixed.cost, "paid");
  assert.match(fixed.costNote, /\$10 for ages 13\+.*\$20 for ages 2–12/);
  assert.match(fixed.attendanceNote, /February 9.*children under 2/);
  assert(requiresAdvanceRegistration(fixed));
  assert.equal(applyVerifiedEventFacts({ ...event, registration: "full" }).registration, "full");
  const anotherDate = { ...event, date: "2028-03-27" };
  assert.deepEqual(applyVerifiedEventFacts(anotherDate), anotherDate);
});

test("Hack Cupertino preserves the youth eligibility and discloses the conflicting start", () => {
  const event = {
    date: "2027-04-10",
    url: "https://www.cupertino.gov/Parks-Recreation/Events/Hack-Cupertino/Hack-Cupertino",
    time: "6:30 PM",
    endTime: null,
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.audienceAge, "kids");
  assert.equal(fixed.endTime, null);
  assert.match(fixed.description, /ages 13–18.*18 must be in high school/);
  assert.match(fixed.attendanceNote, /6 PM opening.*6:30 PM start.*10:30 AM Sunday finish/);
  assert(requiresAttendanceConfirmation(fixed));
  assert(!requiresAttendanceConfirmation(applyVerifiedEventFacts({ ...event, time: "6:00 PM" })));
});

test("the November 21 library corrections preserve actual booking limits", () => {
  const day = { date: "2026-11-21", source: "San Jose Public Library" };
  const url = id => `https://sjpl.bibliocommons.com/events/${id}`;
  const tech = {
    ...day, url: url("6920f111c313c23700e355aa"), registration: "required",
    description: "Appointments are highly encouraged, though drop-ins can be taken if times are available.",
  };
  assert(!requiresAdvanceRegistration(applyVerifiedEventFacts(tech)));
  assert.equal(applyVerifiedEventFacts({ ...tech, registration: "full" }).registration, "full");
  assert.equal(applyVerifiedEventFacts({ ...tech, description: "All appointments must be booked in advance." }).registration, "required");

  const cozy = applyVerifiedEventFacts({
    ...day, url: url("6a7a247486ec588db26fbf06"), registration: "required",
    description: "Join this volunteer drop-in event.", blurb: "Drop in to make toys.",
  });
  assert(requiresAdvanceRegistration(cozy));
  assert.doesNotMatch(cozy.description + cozy.blurb, /drop[ -]in/i);
  assert.match(cozy.attendanceNote, /under 15.*parent or guardian/);

  const english = applyVerifiedEventFacts({
    ...day, url: url("6946ebdd2c65973d00139ebb"), registration: "full",
    description: "Free. No registration required. Gratis. No es necesario registrarse.",
  });
  assert.equal(english.registration, "full");
  assert.equal(english.description, "Free. Gratis.");
  assert.match(english.attendanceNote, /Confirm availability/);
  assert.deepEqual(applyVerifiedEventFacts(english), english);
});

test("confirmed optional library signups preserve new booking limits and unrelated occurrences", () => {
  const rows = [
    ["2026-11-21", "6a3f10c0f56bd86e00b95e6d", "Registration requested but not required."],
    ["2026-11-21", "6ad91a2e29c3d60033318752", "Registration is recommended. Drop-ins are also welcome."],
    ["2026-11-19", "6a83721e4cb69d003e216ef4", "Registration encouraged but not required."],
  ];
  for (const [date, id, description] of rows) {
    const event = { date, url: `https://sjpl.bibliocommons.com/events/${id}`, description,
      registration: "required", registrationClosesBy: `${date}T18:00:00Z` };
    const fixed = applyVerifiedEventFacts(event);
    assert(!requiresAdvanceRegistration(fixed));
    assert.match(fixed.attendanceNote, /welcome/);
    assert.equal(fixed.registrationClosesBy, null);
    assert.equal(applyVerifiedEventFacts({ ...event, registration: "full" }).registration, "full");
    assert.equal(applyVerifiedEventFacts({ ...event, registration: "closed" }).registration, "closed");
    assert.equal(applyVerifiedEventFacts({ ...event, date: "2026-11-20" }).registration, "required");
    assert.equal(applyVerifiedEventFacts({ ...event, description: description + " All guests must register." }).registration, "required");
  }
});

test("Palo Alto Art Center workshops keep the organizer's prices and public booking links", () => {
  for (const [title, costNote, search] of [
    ["Two-Day Clay Gingerbread House Workshop", "$120", "Family Workshop: Mini Clay Gingerbread Houses"],
    ["Two-Day Family Jewelry Making Workshop", "$90", "50453"],
  ]) {
    const event = { title, date: "2026-12-05", city: "palo-alto", venue: "Palo Alto Art Center",
      source: "City Newsletter", url: "", cost: null };
    const fixed = applyVerifiedEventFacts(event);
    const link = new URL(fixed.url);
    assert.equal(link.hostname, "ca-paloalto.civicrec.com");
    assert.equal(decodeURIComponent(atob(link.searchParams.get("filter"))), "search=" + search);
    assert.equal(fixed.cost, "paid");
    assert.equal(fixed.costNote, costNote);
    assert.equal(fixed.registration, "required");
    assert.match(fixed.attendanceNote, /every participant.*at least one adult/);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    assert.equal(applyVerifiedEventFacts({ ...event, registration: "full" }).registration, "full");
    const differentDate = { ...event, date: "2026-12-06" };
    assert.deepEqual(applyVerifiedEventFacts(differentDate), differentDate);
  }
});

const lost = { id: "tm-Z7r9jZ1A7x78x", date: "2026-09-05", title: "Lost 80s Live", venue: "Mountain Winery", description: "", blurb: "Sing along to a lineup of 80s cover bands." };
const duelo = { id: "sanjosetheaters-eb92ddeb3f824327", date: "2026-09-05", title: "Grupo Duelo – Gravedad Tour 2026", venue: "San Jose Civic" };

test("the dated Downtown Throwdown listing preserves admission terms on refresh", () => {
  const event = {
    date: "2026-11-18", source: "City Newsletter", venue: "Three Sisters Whiskey Bar",
    url: "https://www.eventbrite.com/e/downtown-throwdown-san-pedro-squares-best-bartending-competition-tickets-2003843757621?aff=ebdssbdestsearch",
    description: "Six San Pedro Square bars compete in a friendly cocktail contest. Tickets are available.",
    blurb: "Taste cocktails from six San Pedro Square bars competing in a friendly contest, held at Three Sisters Whiskey Bar.",
    cost: null,
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.cost, "low");
  assert.equal(corrected.costNote, "From $15 ($30 VIP)");
  assert.equal(corrected.audienceAge, "adult");
  assert.equal(corrected.kidFriendly, false);
  assert.match(corrected.attendanceNote, /21\+ with valid ID.*VIP admission includes samples/);
  assert.doesNotMatch(corrected.description, /Tickets are available/);
  assert.equal(corrected.blurb, "Watch bartenders from six San Pedro Square bars compete at Three Sisters Whiskey Bar.");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);

  const refreshed = {
    ...event,
    blurb: "Taste entries from six San Pedro Square bars competing in a friendly cocktail contest, starting at Three Sisters Whiskey Bar.",
  };
  assert.equal(applyVerifiedEventFacts(refreshed).blurb, corrected.blurb);

  const updated = applyVerifiedEventFacts({ ...event, cost: "paid", costNote: "From $30", registration: "full" });
  assert.equal(updated.costNote, "From $30");
  assert.equal(updated.registration, "full");
  const differentDate = { ...event, date: "2026-11-19" };
  assert.deepEqual(applyVerifiedEventFacts(differentDate), differentDate);
});

test("Wang Leehom's SAP Center listing keeps its tour subtitle and music category", () => {
  const event = {
    title: "Wang Leehom", category: "community", date: "2026-12-19", time: "8:00 PM",
    url: "https://www.sapcenter.com/events/detail/wang-leehom",
  };
  assert.deepEqual(applyVerifiedEventFacts(event), {
    ...event, title: "Wang Leehom: The Best Place II World Tour", category: "music",
  });
  const differentDate = { ...event, date: "2026-12-20" };
  assert.deepEqual(applyVerifiedEventFacts(differentDate), differentDate);
});

test("only the exact Improv show times get the verified availability notes", () => {
  const ticketUrl = (id) => `https://www.ticketweb.com/event/gianmarco-soresi-san-jose-improv-tickets/${id}`;
  const show = { title: "Gianmarco Soresi", venue: "San Jose Improv", date: "2026-11-21",
    time: "7:00 PM", url: ticketUrl("14735723"), cost: "paid", costNote: "From $31" };
  const waitlisted = applyVerifiedEventFacts(show);
  assert.equal(waitlisted.registration, "full");
  assert.equal(waitlisted.costNote, null);
  assert.match(waitlisted.attendanceNote, /waitlist.*21\+.*Two-item minimum/);
  assert.deepEqual(applyVerifiedEventFacts(waitlisted), waitlisted);
  const sunday = applyVerifiedEventFacts({ ...show, date: "2026-11-22", time: "6:00 PM", url: ticketUrl("14735693") });
  assert.equal(sunday.registration, "full");
  const late = { ...show, time: "9:30 PM", url: ticketUrl("14735713") };
  const venueWaitlist = applyVerifiedEventFacts(late);
  assert.match(venueWaitlist.attendanceNote, /Improv offers a waitlist/);
  assert.equal(venueWaitlist.registration, "full");
  const thursdayLate = applyVerifiedEventFacts({ ...show, date: "2026-11-19", time: "9:45 PM", url: ticketUrl("14740623") });
  assert.equal(thursdayLate.registration, "full");
  const thursdayEarly = applyVerifiedEventFacts({ ...show, date: "2026-11-19", time: "7:30 PM", url: ticketUrl("14153314") });
  assert.equal(thursdayEarly.registration, "full");
  assert.equal(thursdayEarly.costNote, null);
  const anotherTime = { ...show, date: "2026-11-19", time: "8:30 PM", url: ticketUrl("14153314") };
  assert.deepEqual(applyVerifiedEventFacts(anotherTime), anotherTime);

  const wednesday = applyVerifiedEventFacts({ ...show, date: "2026-11-18", time: "7:30 PM", url: ticketUrl("14984583") });
  assert.equal(requiresAttendanceConfirmation(wednesday), true);
  assert.equal(wednesday.registration, undefined);
  assert.equal(wednesday.costNote, "From $31");
});

test("the City Lights opening-night correction only supplies missing performance details", () => {
  const event = {
    date: "2026-11-19", time: "7:30 PM", source: "City Newsletter", title: "The 1940s Radio Hour",
    url: "https://cltc.org/event/radio-hour/", address: "City Lights Theater Company", endTime: null,
  };
  assert.deepEqual(applyVerifiedEventFacts(event), {
    ...event, address: "529 S 2nd St, San Jose, CA 95112", endTime: "9:30 PM",
  });
  const updated = { ...event, address: "Another venue address", endTime: "10:00 PM" };
  assert.deepEqual(applyVerifiedEventFacts(updated), updated);
  const differentDate = { ...event, date: "2026-11-20" };
  assert.deepEqual(applyVerifiedEventFacts(differentDate), differentDate);
});

test("only the conflicting Mitchell Park study session requires start confirmation", () => {
  const event = {
    date: "2026-12-09", time: "4:30 PM", endTime: "8:45 PM",
    title: "Locked in: Teen Finals Study Space!",
    source: "Palo Alto City Library", venue: "Mitchell Park Library",
    url: "https://paloalto.bibliocommons.com/v2/events/6afcaa4c22b92c0041aa768f",
    description: "Tuesday 12/8- 4:30 PM-8:45 PM Wednesday 12/9- 4:00 PM-8:45 PM Thursday 12/10 - not available",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.time, event.time);
  assert.equal(corrected.endTime, event.endTime);
  assert.equal(requiresAttendanceConfirmation(corrected), true);
  assert.match(corrected.attendanceNote, /4:30 PM.*4:00 PM/);
  assert.match(corrected.description, /Tuesday 12\/8- 4:30 PM-8:45 PM Wednesday, December 9: Confirm the start time with Mitchell Park Library\. Thursday 12\/10 - not available/);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);

  const sibling = { ...event, date: "2026-12-08", url: event.url.replace(/f$/, "e") };
  const siblingCorrected = applyVerifiedEventFacts(sibling);
  assert.equal(siblingCorrected.description, corrected.description);
  assert.equal(requiresAttendanceConfirmation(siblingCorrected), false);

  const updated = { ...event, description: event.description.replace("4:00 PM", "4:30 PM") };
  assert.deepEqual(applyVerifiedEventFacts(updated), updated);

  const longDates = "Tuesday, December 8: 4:30-8:45 pm; Wednesday, December 9: 4:00-8:45 pm; Thursday, December 10: unavailable.";
  const longDateCorrected = applyVerifiedEventFacts({ ...event, description: longDates });
  assert.equal(requiresAttendanceConfirmation(longDateCorrected), true);
  assert.equal(longDateCorrected.description, "Tuesday, December 8: 4:30-8:45 pm; Wednesday, December 9: Confirm the start time with Mitchell Park Library; Thursday, December 10: unavailable.");
  assert.equal(requiresAttendanceConfirmation(applyVerifiedEventFacts({ ...sibling, description: longDates })), false);
  const matchingLongDates = { ...event, description: longDates.replace("9: 4:00", "9: 4:30") };
  assert.deepEqual(applyVerifiedEventFacts(matchingLongDates), matchingLongDates);
});

test("Rose Garden tech help keeps conditional drop-in access for the November 19 occurrence", () => {
  const event = {
    date: "2026-11-19", title: "1 on 1 Tech Assistance / Asistencia tecnológica",
    source: "San Jose Public Library", venue: "Rose Garden Library",
    url: "https://sjpl.bibliocommons.com/events/6920f0bad6833e76917eb5ea",
    registration: "required", registrationClosesBy: "2026-11-20T01:00:00Z",
    description: "Appointments are highly encouraged, though drop-ins can be taken if times are available.",
  };
  assert.deepEqual(applyVerifiedEventFacts(event), { ...event, registration: "none", registrationClosesBy: null });

  const sourceCopy = "Sessions are 30 minutes and appointments are highly encouraged, though drop-ins can be taken on a first-come, first-served basis if times are available.";
  const publishedCopy = "Sessions last 30 minutes, and appointments are strongly recommended. Drop-ins are welcome on a first-come, first-served basis when slots are available.";
  const source = { ...event, description: sourceCopy, attendanceNote: sourceCopy };
  const polished = { ...event, description: publishedCopy, attendanceNote: publishedCopy };
  const corrected = { ...polished, registration: "none", registrationClosesBy: null };
  assert.deepEqual(applyVerifiedEventFacts(source), corrected);
  assert.deepEqual(applyVerifiedEventFacts(polished), corrected);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);

  const closed = { ...event, registration: "closed" };
  assert.deepEqual(applyVerifiedEventFacts(closed), closed);
  const noWalkIns = { ...event, description: "Registration is required. No drop-ins." };
  assert.deepEqual(applyVerifiedEventFacts(noWalkIns), noWalkIns);
});

test("Almaden tech help keeps current resources and appointment terms", () => {
  const event = {
    date: "2026-11-19", title: "Digital Skills: One-On-One Tech Help for Seniors",
    source: "San Jose Public Library", venue: "Almaden Library", registration: "closed",
    url: "https://sjpl.bibliocommons.com/events/69f10f4bfb87a3c2e2ac6fee",
    description: "Learning to use Libby (formerly Overdrive) to read ebooks and listen to e-audiobooks; Accessing non-Overdrive e-books and audiobooks from Boundless, Cloud Library, and Enki; Using Hoopla to read, listen and watch; Checking out a 7-day pass to access Great Courses from Libby or Hoopla; By appointment only.",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.description, "Learning to use Libby from OverDrive to read ebooks and listen to e-audiobooks; Finding e-books from Enki; Checking out a 7-day pass to access Great Courses from Libby; By appointment only.");
  assert.equal(corrected.registration, "closed");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const otherLibrary = { ...event, venue: "Another Library" };
  assert.deepEqual(applyVerifiedEventFacts(otherLibrary), otherLibrary);
});

test("Almaden's November 24 and 25 tech help replaces retired services for each exact occurrence", () => {
  for (const [date, id, time, registrationClosesBy] of [
    ["2026-11-24", "69f10f4bfb87a3c2e2ac6fef", "12:00 PM", "2026-11-17T08:00:00.000Z"],
    ["2026-11-25", "69f10f4bfb87a3c2e2ac6ff0", "11:00 AM", "2026-11-18T08:00:00.000Z"],
  ]) {
    const event = {
      id: `sjpl-${id}`, date, time, endTime: "4:00 PM",
      title: "Digital Skills: One-On-One Tech Help for Seniors",
      source: "San Jose Public Library", venue: "Almaden Library",
      url: `https://sjpl.bibliocommons.com/events/${id}`,
      registration: "closed", registrationClosesBy,
      attendanceNote: "By appointment only. One appointment per week per person.",
      description: "Learning to use Libby (formerly OverDrive) to read ebooks and listen to e-audiobooks; Accessing non-OverDrive e-books and audiobooks from Boundless, Cloud Library, and Enki; Using Hoopla to read, listen and watch; Checking out a 7-day pass to access Great Courses from Libby or Hoopla; By appointment only.",
    };
    const corrected = {
      ...event,
      attendanceNote: date === "2026-11-25" ? "By appointment only." : event.attendanceNote,
      description: "Learning to use Libby from OverDrive to read ebooks and listen to e-audiobooks; Finding e-books from Enki; Checking out a 7-day pass to access Great Courses from Libby; By appointment only.",
    };
    assert.deepEqual(applyVerifiedEventFacts(event), corrected);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    const rescheduled = { ...event, date: "2026-11-26" };
    assert.deepEqual(applyVerifiedEventFacts(rescheduled), rescheduled);
    const unverified = {
      ...event,
      id: "sjpl-69f10f4bfb87a3c2e2ac6ff1",
      url: "https://sjpl.bibliocommons.com/events/69f10f4bfb87a3c2e2ac6ff1",
    };
    assert.deepEqual(applyVerifiedEventFacts(unverified), unverified);
  }
});

test("Almaden's December 1 tech help keeps the shared booking instructions and current resources", () => {
  const event = {
    id: "sjpl-69f10f4bfb87a3c2e2ac6ff2",
    date: "2026-12-01",
    url: "https://sjpl.bibliocommons.com/v2/events/69f10f4bfb87a3c2e2ac6ff2",
    venue: "Almaden Library",
    time: "12:00 PM",
    registration: "required",
    description: "Book a 30-minute session for help with Boundless, Cloud Library, Hoopla, and Consumer Reports.",
    blurb: "Book an appointment to learn how to use Hoopla.",
  };
  for (const attendanceNote of [
    "Appointments are required. Each person can book one appointment per week by phone or email.",
    "Please call or stop by the Almaden Branch Library to book a 15- or 30-minute session with our staff. Only one appointment per day, please.",
  ]) {
    const corrected = applyVerifiedEventFacts({ ...event, attendanceNote });
    assert.match(corrected.description, /Libby/);
    assert.doesNotMatch(corrected.description + corrected.blurb, /Boundless|Cloud Library|Hoopla|Consumer Reports|30-minute/);
    assert.equal(corrected.attendanceNote, "Appointments are required. Call Almaden Library at (408) 808-3040 to book.");
    assert.equal(corrected.registration, "appointment-only");
    assert.equal(corrected.time, event.time);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }

  const full = { ...event, registration: "full", attendanceNote: "All appointments are booked." };
  const correctedFull = applyVerifiedEventFacts(full);
  assert.equal(correctedFull.registration, full.registration);
  assert.equal(correctedFull.attendanceNote, full.attendanceNote);

  const later = { ...event, date: "2026-12-02" };
  assert.deepEqual(applyVerifiedEventFacts(later), later);
});

test("Almaden's November 25 tech help keeps booking contacts when the source gives conflicting terms", () => {
  const event = {
    date: "2026-11-25",
    id: "sjpl-69f10f4bfb87a3c2e2ac6ff0",
    source: "San Jose Public Library",
    url: "https://sjpl.bibliocommons.com/v2/events/69f10f4bfb87a3c2e2ac6ff0",
    registration: "appointment-only",
  };
  const book = "For questions or to book, call (408) 808-3040 or email ab.sjpl@sjlibrary.org.";
  const published = {
    ...event,
    description: "The Almaden Branch offers 30-minute tech help appointments.",
    attendanceNote: `Appointments are required. Each person can book one appointment per week. ${book}`,
  };
  assert.deepEqual(applyVerifiedEventFacts(published), {
    ...event,
    description: "The Almaden Branch offers one-on-one tech help by appointment.",
    attendanceNote: `Appointments are required. ${book}`,
  });

  const refreshed = {
    ...event,
    description: "At the Almaden Branch you can make a 30-minute appointment to assist you with: learning new technology.",
    attendanceNote: "Please call or stop by the Almaden Branch Library to book a 15- or 30-minute session with our staff. Only one appointment per day, please.",
  };
  const corrected = {
    ...event,
    description: "At the Almaden Branch, you can make an appointment to assist you with: learning new technology.",
    attendanceNote: "Please call or stop by the Almaden Branch Library to book an appointment.",
  };
  assert.deepEqual(applyVerifiedEventFacts(refreshed), corrected);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});

test("Milpitas Winter Reading Bingo respects the library's all-ages invitation", () => {
  const event = {
    date: "2026-12-01", id: "sccl-6b05d51e3377ce00332d53ce",
    title: "Winter Reading Bingo", source: "Santa Clara County Library",
    description: "This free program invites readers of all ages to explore new stories.",
    sourceAudiences: ["Kids: Grades 5-8", "Kids: Preschoolers"],
    audienceAge: "kids", kidFriendly: true,
  };
  assert.deepEqual(applyVerifiedEventFacts(event), { ...event, audienceAge: "all" });

  const restricted = { ...event, description: "This program is for readers in grades 5-8." };
  assert.deepEqual(applyVerifiedEventFacts(restricted), restricted);
  const differentBranch = { ...event, id: "sccl-other-bingo" };
  assert.deepEqual(applyVerifiedEventFacts(differentBranch), differentBranch);
});

test("Montalvo's sold-out wreath workshop keeps its waitlist and any explicit price", () => {
  const event = {
    date: "2026-12-02", time: "6:00 PM", source: "Montalvo Arts Center",
    url: "https://my.montalvoarts.org/3275/3278",
    cost: null, registration: "full", attendanceNote: "Sold out. The organizer offers a waitlist.",
  };
  assert.deepEqual(applyVerifiedEventFacts(event), { ...event, cost: "paid" });
  const updated = { ...event, cost: "free" };
  assert.deepEqual(applyVerifiedEventFacts(updated), updated);
});

test("Stanford's free online book talk retains the advance Zoom signup and later closures", async () => {
  const event = {
    id: "stanford-54294456348609-2026-11-18", source: "Stanford Events", date: "2026-11-18",
    title: "Book Talk: Good Girls and Alpha Males: How Conservative Media is Targeting Gen Z",
    url: "https://events.stanford.edu/event/book-talk-good-girls-and-alpha-males",
    virtual: true, venue: "Stanford University", time: "12:00 PM", endTime: "1:00 PM", cost: null,
    description: "Gen Z is coming of age in a world that feels stacked against them. That's exactly why conservative media is targeting them.",
  };
  for (const registration of [undefined, "full", "closed"]) {
    const row = { ...event, registration };
    await resolveEventBlurbs([row], { enabled: false });
    assert.equal(row.cost, "free");
    assert.equal(row.venue, "Online (Zoom)");
    assert.equal(row.registration, registration || "required");
    assert.match(row.attendanceNote, /Register through Stanford's event page/);
    assert.deepEqual(applyVerifiedEventFacts(row), row);
  }
  const revised = { ...event, cost: "paid" };
  assert.deepEqual(applyVerifiedEventFacts(revised), revised);
});

test("dated Veterans Day source links survive newsletter reingestion without changing other occurrences", async () => {
  const { normalizeInboundEventPresentation } = await import("../../../scripts/lib/inbound-event-normalize.mjs");
  const cases = [
    {
      title: "Campbell Veterans Day Memorial", venue: "Campbell City Hall", city: "campbell",
      facts: { url: "https://www.campbellveteransmemorial.com/post/cvmf-newsletter-september-2026" },
    },
    {
      title: "Milpitas Veterans Day Event", venue: "Between Milpitas City Hall and the Community Center", city: "milpitas",
      facts: {
        url: "https://www.milpitas.gov/1326/11084/Veterans-Day",
        venue: "Veterans Plaza", address: "457 E. Calaveras Blvd., Milpitas",
      },
    },
    {
      title: "MOAA Silicon Valley Veterans Day Parade & Ceremony", venue: "Downtown San Jose", city: "san-jose",
      facts: {
        url: "https://svcmoaa-events.com/san-jose-veterans-day-parade",
        description: "Veterans Day parade and ceremony in downtown San Jose, listed in Supervisor Otto Lee's community newsletter.",
        blurb: "Attend the MOAA Silicon Valley Veterans Day parade and ceremony in downtown San Jose.",
      },
    },
  ];
  for (const { facts, ...identity } of cases) {
    const raw = {
      ...identity, date: "2026-11-11", url: "", address: identity.venue,
      time: identity.city === "san-jose" ? "12:00 PM" : "9:00 AM",
      cost: null, registration: "closed", description: "Original newsletter excerpt.",
    };
    const fixed = applyVerifiedEventFacts(raw);
    assert.deepEqual(fixed, { ...raw, ...facts });
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const intake = {
      title: raw.title, location: raw.venue, sourceUrl: "",
      startsAt: `2026-11-11T${identity.city === "san-jose" ? "12" : "09"}:00:00-08:00`,
    };
    const normalized = normalizeInboundEventPresentation(intake);
    assert.equal(normalized.url, facts.url);
    assert.equal(normalized.time, raw.time);
    assert.equal(normalized.venue ?? raw.venue, facts.venue ?? raw.venue);
    assert.deepEqual(intake.sourceUrl, "", "leave the received source record unchanged");
    for (const other of [
      { ...raw, date: "2027-11-11" },
      { ...raw, city: "another-city" },
      { ...raw, venue: "Another venue" },
      { ...raw, url: "https://example.org/new-organizer-notice" },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("Mountain View's dated bag sale keeps its 2 PM finish through newsletter and blurb refresh", async () => {
  const capture = JSON.parse(readFileSync(new URL("../../../scripts/lib/fixtures/mountain-view-book-sale-2026-11-08.json", import.meta.url)));
  const { normalizeInboundEventPresentation } = await import("../../../scripts/lib/inbound-event-normalize.mjs");
  const presentation = normalizeInboundEventPresentation(capture.intake);
  assert.equal(presentation.time, "11:00 AM");
  assert.equal(presentation.endTime, "2:00 PM", "the 2–4 PM bulk sale is separate from the bag sale");
  assert.equal(presentation.url, capture.sourceUrl);
  assert.match(capture.intake.endsAt, /T16:00:00-08:00$/, "keep the received source record unchanged");

  const raw = capture.publishedBefore;
  const fixed = applyVerifiedEventFacts(structuredClone(raw));
  assert.equal(fixed.endTime, presentation.endTime);
  assert.equal(fixed.url, capture.sourceUrl);
  assert.match(fixed.attendanceNote, /separate bulk sale runs 2–4 PM at \$1 per foot length/);
  for (const field of Object.keys(raw).filter(key => !["endTime", "url"].includes(key))) {
    assert.deepEqual(fixed[field], raw[field], field);
  }
  const events = [structuredClone(raw)];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].endTime, "2:00 PM");
  assert.equal(events[0].url, capture.sourceUrl);
  assert.equal(events[0].attendanceNote, fixed.attendanceNote);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const other of [
    { ...raw, date: "2026-11-07", title: "Friends of the Library Book Sale (General Public Sale)" },
    { ...raw, date: "2027-11-08" },
    { ...raw, city: "san-jose" },
    { ...raw, venue: "Another Library" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("the dated Stanford film retains the filmmaker's complete credit through cached blurb refresh", async () => {
  const raw = {
    date: "2026-11-05", url: "https://events.stanford.edu/event/no-ideas-but-in-things",
    title: "No Ideas But in Things", venue: "Clark Center", time: "4:30 PM", endTime: "6:00 PM",
    description: "No Ideas But in Things. Filmed and directed by Lan A.",
    blurb: "Watch the film No Ideas But in Things, filmed and directed by Lan A., at the Clark Center.",
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.match(fixed.description, /Lan A\. Li/);
  assert.match(fixed.blurb, /Lan A\. Li/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const events = [structuredClone(raw)];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].blurb, /Lan A\. Li/);
  for (const key of ["date", "url", "title", "venue", "time", "endTime"]) assert.equal(fixed[key], raw[key]);
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2026-11-12" }), { ...raw, date: "2026-11-12" });
});

test("the Stanford collections visit discloses conflicting wings without guessing a meeting point", async () => {
  const raw = {
    date: "2026-11-05", url: "https://events.stanford.edu/event/critical-carceral-studies-special-collections-coffee",
    title: "Critical Carceral Studies | Special Collections & Coffee", venue: "Green Library, Bing Wing",
    address: "459 Lasuen Mall, Stanford, CA 94305", time: "1:00 PM", endTime: "2:30 PM",
    description: "Please join us and archivist Benjamin Stone for a viewing of various items in the Stanford Special Collections.",
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.venue, "Green Library");
  assert.equal(fixed.address, "", "do not retain the disputed wing's address as an exact meeting point");
  assert.equal(requiresAttendanceConfirmation(fixed), true);
  assert.match(fixed.attendanceNote, /IC Classroom \(East Wing\)/);
  assert.match(fixed.attendanceNote, /header names Bing Wing/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const key of ["date", "url", "title", "time", "endTime", "description"]) assert.equal(fixed[key], raw[key], key);
  const events = [structuredClone(raw)];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].venue, "Green Library");
  assert.equal(requiresAttendanceConfirmation(events[0]), true);
  for (const other of [{ ...raw, date: "2026-11-12" }, { ...raw, url: "https://example.org/another-event" }]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("Santa Paws retains its organizer-backed community category, end time and all-ages admission through refresh", async () => {
  const capture = JSON.parse(readFileSync(new URL("../../../scripts/lib/fixtures/mountain-winery-santa-paws-2026-12-05.json", import.meta.url)));
  const { scrapeMountainWinery, normalizePlaywrightEvent } = await import("../../../scripts/playwright-scrapers.mjs");
  const page = {
    setExtraHTTPHeaders: async () => {}, goto: async () => {}, waitForTimeout: async () => {},
    evaluate: async () => [capture.card],
  };
  const [raw] = await scrapeMountainWinery(page, { today: "2026-11-04" });
  assert.equal(raw.category, "community", "an adoption event must not inherit the concert calendar's music default");
  assert.equal(raw.endTime, "3:00 PM");
  assert.equal(raw.kidFriendly, true);
  assert.equal(raw.cost, "paid", "zero-valued price placeholders do not verify free admission");
  const normalized = normalizePlaywrightEvent(raw);
  for (const key of ["category", "endTime", "kidFriendly"]) assert.equal(normalized[key], raw[key], key);
  const stale = { ...normalized, category: "music", endTime: null, kidFriendly: false };
  const fixed = applyVerifiedEventFacts(stale);
  assert.equal(fixed.category, "community");
  assert.equal(fixed.endTime, "3:00 PM");
  assert.equal(fixed.kidFriendly, true);
  for (const key of Object.keys(stale).filter(key => !["category", "endTime", "kidFriendly"].includes(key))) assert.deepEqual(fixed[key], stale[key], key);
  const events = [structuredClone(stale)];
  await resolveEventBlurbs(events, { enabled: false });
  for (const key of ["category", "endTime", "kidFriendly"]) assert.equal(events[0][key], fixed[key], key);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const aliasUrl = capture.sourceUrl.replace("/detail?", "/detail/?");
  assert.deepEqual(applyVerifiedEventFacts({ ...stale, url: aliasUrl }), { ...fixed, url: aliasUrl });
  for (const other of [
    { ...stale, date: "2027-12-05" },
    { ...stale, url: "https://www.mountainwinery.com/events/detail?event_id=1350103" },
    { ...stale, url: "https://example.org/unrelated" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("the dated financial-literacy listing drops unsupported economic records across raw and refreshed copy", async () => {
  const { polishDescription } = await import("../../../scripts/generate-events.mjs");
  const prefix = "Young adults today in the US are facing social pressures that can compromise their financial well-being. ";
  const details = "Come learn money matters with Teens Who Invest as they present on how to make good financial choices as teens and adults. Join us every 1st and 3rd Saturday of the month. Recommended for youth ages 10-18 years old. This program is free.";
  const claims = [
    "There are record lows in savings, record high in spending, and stepping into adulthood without the foundational education in Personal Finance. ",
    "There are record lows in savings and record highs in spending, and young adults are stepping into adulthood without foundational education in personal finance. ",
  ];
  for (const claim of claims) {
    const raw = {
      date: "2026-11-07", url: "https://sjpl.bibliocommons.com/events/6a3d7a8b6db61d280097f448",
      title: "Financial Literacy with Teens Who Invest", venue: "Pearl Avenue Library", city: "san-jose",
      time: "2:30 PM", endTime: "3:30 PM", cost: "free", sourceAudiences: ["Pre-Teens, ages 10-12", "Teens, ages 12-18"],
      description: prefix + claim + details, blurb: "Learn personal finance basics from Teens Who Invest.",
    };
    const fixed = applyVerifiedEventFacts(raw);
    assert.equal(fixed.description, prefix + details);
    for (const field of Object.keys(raw).filter(key => key !== "description")) assert.deepEqual(fixed[field], raw[field], field);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    assert.equal(applyVerifiedEventFacts({ ...raw, description: polishDescription(raw.description) }).description, prefix + details);
    const events = [structuredClone(raw)];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].description, fixed.description, "refresh normalization preserves the correction");
    assert.match(raw.description, /record lows/, "source records remain intact");
    for (const other of [
      { ...raw, date: "2027-11-07" },
      { ...raw, url: "https://example.org/another-event" },
      { ...raw, description: "A dated study reported household saving rates; learn personal finance basics." },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("Tully's Thursday LEGO occurrence omits contradictory Tuesday boilerplate without inventing a cadence", async () => {
  const capture = JSON.parse(readFileSync(new URL("../../../scripts/lib/fixtures/tully-lego-2026-11-05.json", import.meta.url)));
  const { libraryEventDetails, biblioEventOccurrence } = await import("../../../scripts/lib/library-event-details.mjs");
  const raw = {
    id: `sjpl-${capture.event.id}`, title: "LEGO Fun", venue: "Tully Library", cost: "free",
    url: capture.url, ...libraryEventDetails(capture.event),
    ...biblioEventOccurrence(capture.event, new Date("2026-11-01T12:00:00-08:00")).fields,
  };
  assert.equal(raw.date, "2026-11-05");
  assert.equal(raw.time, "4:00 PM");
  assert.match(raw.description, /every Tuesday/);
  const fixed = applyVerifiedEventFacts(raw);
  assert.doesNotMatch(fixed.description, /every (?:Tuesday|Thursday)/);
  assert.match(fixed.description, /Tully library for LEGO/);
  assert.match(fixed.description, /Children under 5 must be accompanied by their parents/);
  assert.match(fixed.description, /No registration required/);
  for (const field of Object.keys(raw).filter((key) => key !== "description")) assert.deepEqual(fixed[field], raw[field], field);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].description, fixed.description, "refresh normalization keeps the verified correction");
  assert.match(capture.event.definition.description, /every Tuesday/, "source capture stays intact");
});

test("the Tully LEGO correction is limited to the verified dated source", () => {
  const raw = { date: "2026-11-05", url: "https://sjpl.bibliocommons.com/events/6a4bcf2d4407827f8aa9a6cb",
    description: "Join us at Tully Library every Tuesday for LEGO fun. No registration required." };
  assert.equal(applyVerifiedEventFacts(raw).description, "Join us at Tully Library for LEGO fun. No registration required.");
  for (const other of [
    { ...raw, date: "2026-11-12" },
    { ...raw, url: "https://example.org/unrelated" },
    { ...raw, url: "https://sjpl.bibliocommons.com/events/another-event" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("Zoe Caron's November reception retains the city's required RSVP across newsletter copies", async () => {
  // October 29 city newsletter: free to all, RSVP required; the linked ticket
  // page is https://tickets.mvcpa.com/eventperformances.asp?evt=802.
  const raw = {
    title: "Artist Reception & Gallery Talk with Zoe Caron", date: "2026-11-04",
    venue: "MVCPA SecondStage", url: "", cost: null,
    time: "5:30 PM", endTime: "7:30 PM",
    description: "A free artist reception and gallery talk featuring Zoe Caron.",
    blurb: "Meet artist Zoe Caron at the gallery talk.",
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.registration, "required");
  assert.equal(fixed.cost, "free");
  assert.equal(fixed.url, "https://tickets.mvcpa.com/eventperformances.asp?evt=802");
  assert.match(fixed.attendanceNote, /RSVP is required/);
  assert.match(fixed.attendanceNote, /Doors open at 5:00 PM.*talk begins at 6:00 PM/);
  assert.equal(fixed.registrationClosesBy, undefined, "the city supplies no booking deadline");
  assert.equal(requiresAdvanceRegistration(fixed), true);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const field of ["title", "date", "time", "endTime", "venue", "description", "blurb"]) {
    assert.equal(fixed[field], raw[field], field);
  }
  for (const title of ["Zoe Caron Artist Reception & Gallery Talk", "Artist Reception & Gallery Talk featuring Zoe Caron"]) {
    const copy = applyVerifiedEventFacts({ ...raw, title, venue: "Mountain View Center for the Performing Arts, SecondStage, 500 Castro Street, Mountain View, CA" });
    assert.equal(copy.registration, "required", title);
    assert.equal(copy.url, fixed.url, title);
  }
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [{ ...raw, date: "2027-11-04" }, { ...raw, venue: "Another gallery" }, { ...raw, title: "Another artist reception" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required");
  assert.equal(events[0].url, fixed.url);
});

test("dated Lowrider and SJSU celebrations retain RSVP notices without inventing mandatory registration", async () => {
  const cases = [
    { url: "https://my.montalvoarts.org/3248/3250", title: "4th Lowrider Art Showcase", venue: "Montalvo Arts Center", time: "1:00 PM", endTime: null },
    { url: "https://events.sjsu.edu/event/mariachi-band-performance-dia-de-los-angelitos", title: "SJSU CommUniverCity Community Event: Día de los Muertos Celebration", venue: "Student Union Theater", time: "3:00 PM", endTime: "5:00 PM" },
  ];
  for (const example of cases) {
    const raw = { ...example, date: "2026-11-01", cost: "free", description: "", blurb: "Join the community celebration." };
    const fixed = applyVerifiedEventFacts(raw);
    assert.match(fixed.attendanceNote, /RSVP/);
    assert.doesNotMatch(fixed.attendanceNote, /required|must register|no walk-ins/i);
    assert.equal(fixed.registration, undefined, "an RSVP invitation does not establish a mandatory gate");
    if (example.venue === "Montalvo Arts Center") assert.match(fixed.attendanceNote, /No parking at Montalvo.*West Valley College/);
    for (const field of ["date", "url", "title", "venue", "time", "endTime", "cost"]) assert.equal(fixed[field], raw[field], field);
    for (const registration of ["full", "closed", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
    }
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    for (const other of [{ ...raw, date: "2027-11-01" }, { ...raw, url: "https://example.com/unrelated" }]) {
      assert.equal(applyVerifiedEventFacts(other), other);
    }
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.match(events[0].attendanceNote, /RSVP/);
    assert.equal(events[0].registration, undefined);
  }
});

test("Campbell's dated newsletter events retain organizer fees, RSVP requests and corrected catering name", async () => {
  const luncheon = {
    date: "2026-11-18", url: "https://business.campbellchamber.net/events/details/monthly-luncheon-16558",
    time: "11:30 AM", endTime: "1:00 PM", venue: "Nordahl Hall", cost: null,
    description: "Lunch by Table & Terrance.", blurb: "Hear a city update over lunch by Table & Terrance.",
  };
  const fixed = applyVerifiedEventFacts(luncheon);
  assert.equal(fixed.cost, "paid");
  assert.match(fixed.costNote, /\$35.*members.*\$40.*guests.*walk-ins/i);
  assert.match(fixed.attendanceNote, /\$35.*members.*\$40.*guests.*walk-ins/i);
  assert.match(fixed.description, /Table & Terrace/);
  assert.match(fixed.blurb, /Table & Terrace/);
  assert.equal(fixed.registration, undefined, "the organizer explicitly allows walk-ins");
  const workshop = {
    date: "2026-10-30", url: "https://business.campbellchamber.net/events/details/lunch-learn-communicating-for-results-16553",
    time: "12:00 PM", endTime: "1:00 PM", cost: null, registration: "closed",
  };
  const reserved = applyVerifiedEventFacts(workshop);
  assert.equal(reserved.cost, "free");
  assert.equal(reserved.registration, "closed", "a sourced RSVP request cannot reopen signup");
  assert.equal(applyVerifiedEventFacts({ ...workshop, registration: undefined }).registration, "required");
  assert.match(reserved.attendanceNote, /RSVP.*Bring your own lunch/);
  const gala = {
    date: "2026-11-14", url: "https://buy.stripe.com/cNi6oH5XSbIJ4ECarc3oA08", cost: null,
    time: "10:30 AM", endTime: "1:00 PM",
  };
  const ticketed = applyVerifiedEventFacts(gala);
  assert.equal(ticketed.registration, "required");
  assert.equal(ticketed.cost, null, "the original newsletter does not establish a ticket price");
  assert.equal(ticketed.costNote, undefined);
  for (const raw of [luncheon, workshop, gala]) {
    const corrected = applyVerifiedEventFacts(raw);
    for (const field of ["date", "url", "time", "endTime", "venue"]) assert.equal(corrected[field], raw[field]);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    const anotherYear = { ...raw, date: raw.date.replace("2026", "2027") };
    assert.equal(applyVerifiedEventFacts(anotherYear), anotherYear);
    const anotherUrl = { ...raw, url: "https://example.com/unrelated" };
    assert.equal(applyVerifiedEventFacts(anotherUrl), anotherUrl);
  }
  const events = [{ ...luncheon }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].blurb, /Table & Terrace/);
});

test("three dated Stanford basketball ticket pages retain their actual Maples address and ticket gate", () => {
  const games = [
    ["2026-11-02", "eastern-washington-0jbp1f"],
    ["2026-11-06", "oakland-6av258"],
    ["2026-11-09", "rice-vtjdko"],
  ];
  for (const [date, opponent] of games) {
    const raw = { date, url: `https://tickets.gostanford.com/events/mens-basketball-vs-${opponent}`,
      address: "Maples Pavilion, Stanford University, 641 Campus Drive, Stanford, CA 94305",
      venue: "Maples Pavilion", time: "7:00 PM", endTime: null, cost: null };
    const fixed = applyVerifiedEventFacts(raw);
    assert.equal(fixed.address, "655 Campus Drive, Stanford, CA 94305");
    assert.equal(fixed.cost, "paid");
    assert.equal(fixed.registration, "required");
    for (const status of ["full", "closed"]) {
      assert.equal(applyVerifiedEventFacts({ ...raw, registration: status }).registration, status);
    }
    for (const field of ["date", "url", "venue", "time", "endTime"]) assert.equal(fixed[field], raw[field]);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const anotherYear = { ...raw, date: date.replace("2026", "2027") };
    assert.deepEqual(applyVerifiedEventFacts(anotherYear), { ...anotherYear, address: fixed.address });
    const anotherUrl = { ...raw, url: "https://tickets.gostanford.com/events/unrelated" };
    assert.deepEqual(applyVerifiedEventFacts(anotherUrl), { ...anotherUrl, address: fixed.address });
  }
});

test("the dated Linden Tree book club preserves its age and email RSVP without inventing a price", async () => {
  const raw = { date: "2026-11-29", title: "Middle Grade Book Club: The Wish Ring Cipher", venue: "Linden Tree Books",
    url: "https://www.lindentreebooks.com/events-calendar/", cost: "free", kidFriendly: false, audienceAge: "all", time: "4:00 PM" };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.cost, null);
  assert.equal(fixed.registration, "required");
  assert.equal(fixed.kidFriendly, true);
  assert.equal(fixed.audienceAge, "kids");
  assert.match(fixed.attendanceNote, /ages 9.*Email.*RSVP/);
  assert.equal(fixed.time, raw.time);
  for (const registration of ["full", "closed"]) assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  for (const other of [{ ...raw, date: "2027-11-29" }, { ...raw, title: "Another book club" }, { ...raw, venue: "Another bookstore" }]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required");
  assert.equal(events[0].audienceAge, "kids");
});

test("Linden Tree's moved book club survives a stale snapshot with matching occurrence evidence", async () => {
  // Both the organizer's summary and event heading now say Sunday, December 6
  // at 4pm. Evidence: docs/qa/2026-10-28-2307-fact-check.md.
  const raw = {
    id: "9038118f4459", title: "Middle Grade Book Club: The Wish Ring Cipher",
    date: "2026-11-29", displayDate: "Sun, Nov 29", time: "4:00 PM", endTime: null,
    venue: "Linden Tree Books", city: "los-altos", source: "Linden Tree Books",
    url: "https://www.lindentreebooks.com/events-calendar/", cost: null,
    registration: "required", description: "A book club for ages 9+. Email the bookstore to RSVP.",
    blurb: "Discuss The Wish Ring Cipher with fellow readers ages 9 and up.",
    occurrenceEvidence: { kind: "first-party-occurrence-page", date: "2026-11-29",
      sourceUrl: "https://www.lindentreebooks.com/events-calendar/" },
  };
  const before = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [fixed] = events;
  assert.equal(fixed.date, "2026-12-06");
  assert.equal(fixed.displayDate, "Sun, Dec 6");
  assert.equal(fixed.occurrenceEvidence.date, fixed.date);
  assert.equal(isEventPublishable(fixed), true, "moving the date must retain valid first-party proof");
  assert.equal(fixed.registration, "required");
  assert.equal(fixed.audienceAge, "kids");
  assert.equal(fixed.cost, null);
  for (const field of ["id", "title", "time", "endTime", "venue", "city", "url", "description", "blurb"]) {
    assert.equal(fixed[field], raw[field], field);
  }
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.deepEqual(raw, before);
  const fresh = applyVerifiedEventFacts({ ...raw, date: "2026-12-06", displayDate: "Sun, Dec 6",
    occurrenceEvidence: { ...raw.occurrenceEvidence, date: "2026-12-06", checkedAt: "2026-10-29T08:00:00Z" } });
  assert.equal(fresh.occurrenceEvidence.checkedAt, "2026-10-29T08:00:00Z", "fresh provider evidence keeps its own timestamp");
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2027-11-29" }, { ...raw, date: "2027-12-06" },
    { ...raw, date: "2026-12-13" }, { ...raw, title: "Another book club" },
    { ...raw, venue: "Another bookstore" }, { ...raw, url: "https://example.com/another-calendar" },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "unrelated occurrences retain their own facts");
});

test("three dated Triton events retain their previously verified booking gates and distinct admission", () => {
  const cases = [
    ["2026-10-29", "Impressionism: The Beautiful Revolution – Lecture 4", "paid"],
    ["2026-11-07", "Harry Clewans Artist Talk", "free"],
    ["2026-11-08", "The Monuments Men: Reception and Art History Presentation", "free"],
  ];
  for (const [date, title, cost] of cases) {
    const raw = { date, title, venue: "Triton Museum of Art", cost: null, time: "1:00 PM" };
    const fixed = applyVerifiedEventFacts(raw);
    assert.equal(fixed.cost, cost);
    assert.equal(fixed.registration, "required");
    assert.equal(fixed.time, raw.time);
    if (cost === "paid") assert.match(fixed.costNote, /\$25.*individual lecture/);
    for (const registration of ["full", "closed"]) assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
    for (const other of [{ ...raw, date: date.replace("2026", "2027") }, { ...raw, venue: "Another museum" }]) assert.equal(applyVerifiedEventFacts(other), other);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  }
});

test("ICA exhibition blurbs describe the displayed work without inventing newness or inherited objects", async () => {
  const cases = [
    { url: "https://www.icasanjose.org/current-exhibitions/wearecaliforniaartists/", end: "2026-11-14", pattern: /sculptures by Wanxin Zhang.*Diane Ding/, bad: /new work/i },
    { url: "https://www.icasanjose.org/current-exhibitions/gregito-togiveandtake/", end: "2027-02-21", pattern: /paintings, sculptures and video installation.*inheritance/, bad: /inherited objects/i },
  ];
  for (const example of cases) {
    for (const date of ["2026-10-26", example.end]) {
      const raw = { date, url: example.url, ongoing: true, time: null, cost: "free", blurb: "See new work and inherited objects." };
      const corrected = applyVerifiedEventFacts(raw);
      assert.match(corrected.blurb, example.pattern);
      assert.doesNotMatch(corrected.blurb, example.bad);
      for (const field of ["date", "url", "ongoing", "time", "cost"]) assert.equal(corrected[field], raw[field], field);
      assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
      const events = [{ ...raw }];
      await resolveEventBlurbs(events, { enabled: false });
      assert.match(events[0].blurb, example.pattern);
    }
    const expired = { date: "2027-02-22", url: example.url, blurb: "A different exhibition." };
    assert.equal(applyVerifiedEventFacts(expired), expired);
  }
});

test("Montalvo's dated free showcase and student performance survive sparse refreshes and cached copy", async () => {
  const showcase = {
    date: "2026-11-01", url: "https://my.montalvoarts.org/3248/3250",
    title: "4th Lowrider Art Showcase", cost: "paid", kidFriendly: false,
    time: "1:00 PM", endTime: null, registration: "full",
  };
  const free = applyVerifiedEventFacts(showcase);
  assert.equal(free.cost, "free");
  assert.equal(free.kidFriendly, true);
  assert.match(free.attendanceNote, /No parking at Montalvo.*West Valley College/);
  assert.equal(free.registration, "full");
  assert.equal(free.time, showcase.time);
  const performance = {
    date: "2026-11-04", url: "https://my.montalvoarts.org/overview/3066",
    title: "Mosaic America (Grade K-8)", description: "Mosaic America",
    blurb: "Make mosaic art at Montalvo.", kidFriendly: false,
    time: "9:30 AM", endTime: null, cost: null, registration: "closed",
  };
  const corrected = applyVerifiedEventFacts(performance);
  assert.equal(corrected.cost, "paid", "the exact student ticket page charges admission");
  assert.equal(corrected.kidFriendly, true);
  assert.match(corrected.description, /music, dance and storytelling/);
  assert.match(corrected.blurb, /Mosaic America perform/);
  assert.doesNotMatch(corrected.blurb, /make mosaic/i);
  for (const field of ["date", "url", "time", "endTime", "registration"]) {
    assert.equal(corrected[field], performance[field], field);
  }
  for (const raw of [showcase, performance]) {
    const otherYear = { ...raw, date: raw.date.replace("2026", "2027") };
    assert.equal(applyVerifiedEventFacts(otherYear), otherYear);
    const otherUrl = { ...raw, url: "https://my.montalvoarts.org/overview/other" };
    assert.equal(applyVerifiedEventFacts(otherUrl), otherUrl);
    assert.deepEqual(applyVerifiedEventFacts(applyVerifiedEventFacts(raw)), applyVerifiedEventFacts(raw));
  }
  const events = [{ ...performance }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].blurb, /Mosaic America perform/);
  assert.equal(events[0].registration, "closed");
});

test("dated Meetup attendance terms retain RSVPs, deadlines, contributions and full states", async () => {
  const cases = [
    { date: "2026-11-13", url: "https://www.meetup.com/bhajanclubbingjamming/events/316961984/", note: /Confirm attendance.*Meetup/ },
    { date: "2026-12-03", url: "https://www.meetup.com/baypiggies/events/317138013/", note: /RSVP.*Wednesday, December 2/ },
    { date: "2026-10-31", url: "https://www.meetup.com/bay-area-hiking-walking-wellness-club/events/316656187/", note: /\$5–\$20.*non-contributors/ },
  ];
  for (const example of cases) {
    const raw = { date: example.date, url: example.url, time: "7:00 PM", cost: null, registration: "none", registrationClosesBy: "2026-12-03T07:59:00.000Z" };
    const corrected = applyVerifiedEventFacts(raw);
    assert.equal(requiresAdvanceRegistration(corrected), true);
    assert.match(corrected.attendanceNote, example.note);
    assert.equal(corrected.time, raw.time);
    assert.equal(corrected.registrationClosesBy, raw.registrationClosesBy);
    if (example.date === "2026-10-31") assert.equal(corrected.cost, "paid");
    else assert.equal(corrected.cost, null);
    for (const registration of ["full", "closed", REGISTRATION_APPOINTMENT]) {
      assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
    }
    const other = { ...raw, date: raw.date.replace("2026", "2027") };
    assert.equal(applyVerifiedEventFacts(other), other);
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].registration, "required");
    assert.match(events[0].attendanceNote, example.note);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }
});

test("Sunnyvale's October newsletter retains three explicit registration requirements", () => {
  for (const [date, sourceId] of [["2026-10-26", "17153875"], ["2026-10-27", "17731808"], ["2026-10-28", "17178520"]]) {
    const raw = { date, url: `https://sunnyvale.libcal.com/event/${sourceId}`, time: "6:30 PM" };
    const corrected = applyVerifiedEventFacts(raw);
    assert.equal(requiresAdvanceRegistration(corrected), true);
    assert.equal(corrected.time, raw.time);
    assert.match(corrected.attendanceNote, /Registration is required/);
    assert.equal(applyVerifiedEventFacts({ ...raw, registration: "full" }).registration, "full");
    const otherDate = { ...raw, date: "2027-10-26" };
    assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
  }
  const dropIn = { date: "2026-11-01", url: "https://sunnyvale.libcal.com/event/17715593" };
  assert.equal(applyVerifiedEventFacts(dropIn), dropIn);
});

test("dated Meetup fees preserve availability and distinguish watching from participating", async () => {
  const cases = [
    { date: "2026-10-29", url: "https://www.meetup.com/downtowners20-40s/events/317104221/", note: /\$5 cover for dancing/, cost: "low" },
    { date: "2026-10-27", url: "https://www.meetup.com/southbayimprovfun/events/317056442/", note: /Watching is free.*\$12.*\$15.*Nobody is turned away/ },
    { date: "2026-11-07", url: "https://www.meetup.com/bay-area-hiking-walking-wellness-club/events/316788593/", note: /approval.*do not walk in.*\$5–\$20.*non-contributors/, cost: "paid" },
  ];
  for (const fixture of cases) {
    const raw = { date: fixture.date, url: fixture.url, title: "Source title", registration: "full", cost: null, time: "6:00 PM" };
    const corrected = applyVerifiedEventFacts(raw);
    assert.equal(corrected.registration, "full", "fees never reopen a full occurrence");
    assert.equal(corrected.time, raw.time);
    assert.match(corrected.attendanceNote, fixture.note);
    if (fixture.cost) assert.equal(corrected.cost, fixture.cost);
    else assert.equal(corrected.cost, null, "mixed watching/participation terms do not establish one ticket price");
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-11-07" }).attendanceNote, undefined);
  }
});

test("Mantra Room cached copy retains the verified timing uncertainty", async () => {
  const event = { date: "2026-11-03", url: "https://www.meetup.com/san-jose-diet-meetup-group/events/316989193/",
    title: "Yoga of Sound", venue: "Mantra Room", time: "6:00 PM", endTime: "7:15 PM",
    attendanceStatus: "needs-confirmation", attendanceNote: "Header: 6–7:15 PM; description: 7–8:30 PM.",
    blurb: "Join a confirmed Tuesday session." };
  const events = [event];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].blurb, /confirm the conflicting session times/i);
  assert.equal(requiresAttendanceConfirmation(events[0]), true);
  const resolved = { ...event, attendanceStatus: undefined, attendanceNote: undefined };
  assert.equal(applyVerifiedEventFacts(resolved), resolved);
});

test("Klara movie outing keeps its tentative screening and ticket requirement through publication", async () => {
  const raw = {
    id: "meetup-a0a5d96a2e845f6d", date: "2026-11-08",
    title: "Book & Movie: Klara and the Sun - Nov 8, 2026", source: "Meetup",
    url: "https://www.meetup.com/interrobang/events/316773298/",
    time: "3:00 PM", endTime: "4:30 PM", venue: "AMC Mercado 20",
    address: "3111 Mission College Blvd, Santa Clara, CA 95054, USA", city: "santa-clara",
    cost: null, registration: "none",
    blurb: "Meet the book club at AMC Mercado 20 on Sunday afternoon.",
  };
  const original = structuredClone(raw);
  const corrected = applyVerifiedEventFacts(raw);
  assert.equal(corrected.cost, "paid");
  assert.equal(corrected.registration, "required");
  assert.equal(requiresAttendanceConfirmation(corrected), true);
  assert.match(corrected.attendanceNote, /time and cinema are tentative/i);
  assert.match(corrected.attendanceNote, /RSVP.*pay.*ticket/i);
  assert.match(corrected.costNote, /price.*not published/i);
  assert.match(corrected.blurb, /tentative/i);
  for (const field of ["date", "time", "endTime", "venue", "address", "city", "url"]) {
    assert.equal(corrected[field], raw[field], field);
  }
  assert.deepEqual(raw, original);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  for (const registration of ["full", "closed", REGISTRATION_APPOINTMENT]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2027-11-08" },
    { ...raw, url: raw.url.replace("316773298", "316773299") },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required");
  assert.equal(requiresAttendanceConfirmation(events[0]), true);
  assert.match(events[0].blurb, /tentative/i);
});

test("Pumpkin, Pasta & Prosecco retains its dated advance-payment requirement", async () => {
  const raw = {
    id: "meetup-343d8f816cdc482b", date: "2026-10-25",
    title: "Pumpkin, Pasta & Prosecco", source: "Meetup",
    url: "https://www.meetup.com/silicon-valley-women-social-circle-45/events/316877918/",
    time: "2:00 PM", endTime: "5:00 PM", venue: "Santa Teresa & Lean",
    address: "San Jose, CA 95123, USA", city: "san-jose",
    cost: null, registration: "none",
    blurb: "Meet fellow Silicon Valley Women's Social Club members for pasta, pumpkin treats, and prosecco.",
  };
  const original = structuredClone(raw);
  const corrected = applyVerifiedEventFacts(raw);
  assert.equal(corrected.cost, "paid");
  assert.equal(corrected.costNote, "$45 per person");
  assert.equal(corrected.registration, "required");
  assert.match(corrected.attendanceNote, /payment.*confirm.*spot/i);
  assert.match(corrected.attendanceNote, /\$45 per person/);
  assert.match(corrected.attendanceNote, /exact location/i);
  assert.equal(requiresAdvanceRegistration(corrected), true);
  for (const field of ["date", "time", "endTime", "venue", "address", "city", "url", "blurb"]) {
    assert.equal(corrected[field], raw[field], field);
  }
  assert.deepEqual(raw, original, "do not mutate source records");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  for (const registration of ["full", "closed", REGISTRATION_APPOINTMENT]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2027-10-25" },
    { ...raw, url: raw.url.replace("316877918", "316877919") },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "terms belong only to this occurrence");
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].registration, "required", "publication retains the payment gate");
  assert.equal(events[0].costNote, "$45 per person");
});

test("Picchetti spelling requires the verified venue identity and survives cached copy", async (t) => {
  const raw = {
    id: "meetup-2da20825a6089915", date: "2026-10-31",
    title: "Pichetti Ranch with Dish N Dash & Ice cream @ Icicles",
    venue: "Pichetti Ranch & Winery", address: "13100 Montebello Road, Cupertino",
    city: "cupertino", time: "9:30 AM", endTime: "12:00 PM",
    registration: "full", cost: null, description: "Meetup event by South Bay 50+ Social Hikers.",
    blurb: "Hike at Pichetti Ranch & Winery.",
  };
  const original = structuredClone(raw);
  const corrected = applyVerifiedEventFacts(raw);
  assert.deepEqual(corrected, {
    ...raw, title: raw.title.replace("Pichetti", "Picchetti"),
    venue: "Picchetti Ranch & Winery", blurb: "Hike at Picchetti Ranch & Winery.",
  });
  assert.deepEqual(raw, original);
  assert.equal(applyVerifiedEventFacts(corrected), corrected);
  for (const other of [
    { ...raw, city: "san-jose" }, { ...raw, address: "13101 Montebello Road, Cupertino" },
    { ...raw, address: "" }, { ...raw, venue: "Another Ranch" }, { ...raw, virtual: true },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
  const cache = { byKey: { [eventBlurbCacheKey(corrected)]: { blurb: raw.blurb } } };
  const originalRead = fs.readFileSync;
  t.mock.method(fs, "readFileSync", (path, ...args) =>
    String(path).endsWith("event-blurb-cache.json") ? JSON.stringify(cache) : originalRead(path, ...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const events = [{ ...corrected, blurb: undefined }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(stats.cache_hits, 1);
  assert.equal(events[0].blurb, "Hike at Picchetti Ranch & Winery.");
  assert.equal(events[0].registration, "full");
});

test("Sunnyvale pub listings retain the operator's Fibbar MaGees spelling and attendance facts", () => {
  const raw = {
    date: "2026-10-26", title: "Bate Papo at Fibbar Magee's",
    venue: "Fibbar Magee's", city: "sunnyvale", address: "156 S Murphy Ave, Sunnyvale",
    url: "https://www.meetup.com/example/events/317000000/",
    time: "6:00 PM", endTime: "9:00 PM", cost: null, registration: "full",
    description: "Meet for conversation at Fibbar Magee’s.",
    blurb: "Practice Brazilian Portuguese conversation at Fibbar Magee's.",
  };
  const original = structuredClone(raw);
  const expected = {
    ...raw, title: "Bate Papo at Fibbar MaGees", venue: "Fibbar MaGees",
    description: "Meet for conversation at Fibbar MaGees.",
    blurb: "Practice Brazilian Portuguese conversation at Fibbar MaGees.",
  };
  assert.deepEqual(applyVerifiedEventFacts(raw), expected);
  assert.deepEqual(raw, original, "the source object remains untouched");
  assert.equal(applyVerifiedEventFacts(expected), expected, "the canonical spelling is stable");
  for (const other of [
    { ...raw, city: "san-jose" },
    { ...raw, address: "157 S Murphy Ave, Sunnyvale" },
    { ...raw, address: "" },
    { ...raw, venue: "Another Pub" },
    { ...raw, venue: "Fibbar Magee's Annex" },
    { ...raw, virtual: true },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "a venue name alone cannot establish the business identity");
});

test("a cached pub blurb cannot restore the misspelled venue name after publication", async (t) => {
  const raw = {
    id: "fibbar-cache-regression", date: "2026-10-26", title: "Language Conversation",
    venue: "Fibbar MaGees", city: "sunnyvale", address: "156 S Murphy Ave, Sunnyvale",
    time: "6:00 PM", endTime: "9:00 PM", cost: null, registration: "required",
    description: "Meet for language conversation.", url: "https://example.org/conversation",
  };
  const key = eventBlurbCacheKey(raw);
  const cache = { byKey: { [key]: { blurb: "Practice conversation at Fibbar Magee's." } } };
  const originalRead = fs.readFileSync;
  t.mock.method(fs, "readFileSync", (path, ...args) =>
    String(path).endsWith("event-blurb-cache.json") ? JSON.stringify(cache) : originalRead(path, ...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const events = [{ ...raw }];
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(stats.cache_hits, 1);
  assert.equal(stats.generated, 0);
  assert.deepEqual(events[0], { ...raw, blurb: "Practice conversation at Fibbar MaGees." });
});

test("Cupertino open-house occurrences disclose the city's conflicting winter hours", async () => {
  const raw = {
    title: "Environmental Education Center Open House", venue: "McClellan Ranch Preserve",
    url: "https://www.cupertino.gov/Parks-Recreation/Events/McClellan-Events/Environmental-Education-Center-Open-House",
    time: "12:00 PM", endTime: "4:00 PM", cost: "free",
    description: "Drop by the Environmental Education Center (EEC) at McClellan Ranch Preserve every Saturday from 11 a.m. to 3 p.m. for family fun and discovery.",
    blurb: "Meet animal ambassadors and try nature-focused hands-on activities alongside park rangers.",
  };
  for (const date of ["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28", "2026-12-05", "2026-12-12", "2026-12-19"]) {
    const input = { ...raw, date };
    const corrected = applyVerifiedEventFacts(input);
    assert.equal(corrected.attendanceStatus, "needs-confirmation");
    assert.match(corrected.attendanceNote, /noon–4 PM/);
    assert.match(corrected.attendanceNote, /11 AM–3 PM/);
    assert.match(corrected.attendanceNote, /confirm.*hours/i);
    assert.equal(requiresAttendanceConfirmation(corrected), true);
    for (const field of Object.keys(input)) assert.deepEqual(corrected[field], input[field], field);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    const events = [{ ...input }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].attendanceStatus, "needs-confirmation", "the publication path retains the conflict");
  }
  for (const other of [
    { ...raw, date: "2026-10-31" },
    { ...raw, date: "2027-11-07" },
    { ...raw, date: "2026-11-08" },
    { ...raw, date: "2026-11-07", url: "https://www.cupertino.gov/another-event" },
    { ...raw, date: "2026-11-07", time: "11:00 AM", endTime: "3:00 PM" },
    { ...raw, date: "2026-11-07", description: "Drop by every Saturday from noon to 4 p.m." },
    { ...raw, date: "2026-11-07", description: "Drop by every Saturday for family fun and discovery." },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "resolved or unrelated records do not acquire a warning");
});

test("the Saratoga dinner title uses its verified La Fondue venue name without reopening attendance", () => {
  const raw = {
    date: "2026-11-13", title: "Fine Dining & Conversation in La Foundue, Saratoga",
    venue: "La Fondue", registration: "full", time: "6:00 PM", endTime: "8:00 PM",
    url: "https://www.meetup.com/i-wanna-do-it-but-not-alone/events/316965375/",
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert.equal(corrected.title, "Fine Dining & Conversation in La Fondue, Saratoga");
  assert.equal(corrected.registration, "full");
  for (const field of ["date", "venue", "registration", "time", "endTime", "url"]) assert.equal(corrected[field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  for (const other of [
    { ...raw, date: "2027-11-13" },
    { ...raw, venue: "Another Restaurant" },
    { ...raw, url: "https://www.meetup.com/another-event/" },
    { ...raw, title: "An unrelated event in Saratoga" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Monster Mash discloses conflicting city prices and retains mandatory child registration", () => {
  const event = {
    date: "2026-10-24", title: "Monster Mash", venue: "Quinlan Community Center",
    url: "https://www.cupertino.gov/Parks-Recreation/Events/Monster-Mash/Monster-Mash-Event",
    time: "5:00 PM", endTime: "8:00 PM", cost: "low", costNote: "From $17",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.registration, "required");
  assert.equal(corrected.attendanceStatus, "needs-confirmation");
  assert.doesNotMatch(corrected.costNote, /\$\s*\d/, "conflicting figures cannot become a JSON-LD price floor");
  assert.match(corrected.attendanceNote, /\$22.*\$26.*\$23.*\$28/);
  assert.match(corrected.attendanceNote, /confirm.*pricing/i);
  assert.match(corrected.attendanceNote, /children must register/i);
  assert.match(corrected.attendanceNote, /adults do not.*register/i);
  for (const field of ["date", "title", "venue", "url", "time", "endTime", "cost"]) {
    assert.equal(corrected[field], event[field]);
  }
  assert.equal(applyVerifiedEventFacts({ ...event, date: "2027-10-24" }).costNote, "From $17");
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
  }
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});

test("Cupertino's Signing Santa retains resident pricing and registration for every attendee", async () => {
  const raw = {
    id: "a2b447b7251a", date: "2026-12-12", title: "Signing Santa",
    url: "https://www.cupertino.gov/Parks-Recreation/Events/Signing-Santa/Signing-Santa-Event",
    venue: "Quinlan Community Center", time: "10:00 AM", endTime: "12:00 PM", cost: null,
    description: "Meet a Santa who understands sign language. Registration opens in late July.",
    blurb: "Meet a sign-language-fluent Santa with an on-site interpreter.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "low");
  assert.equal(events[0].costNote, "$5 residents; $6 nonresidents.");
  assert.equal(events[0].registration, "required");
  assert.match(events[0].attendanceNote, /\$5 residents; \$6 nonresidents/);
  assert.match(events[0].attendanceNote, /every attending child and adult/i);
  for (const field of ["id", "title", "date", "time", "endTime", "venue", "url", "description", "blurb"]) {
    assert.equal(events[0][field], raw[field]);
  }
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2027-12-12" },
    { ...raw, url: "https://www.cupertino.gov/Parks-Recreation/Events/another-event" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("History Park's Halloween Haunt cannot acquire unverified program details from cached copy", async () => {
  const raw = {
    id: "cd1a5ce49cb4", date: "2026-10-24", title: "Children's Halloween Haunt 2026",
    url: "https://historysanjose.org/event/childrens-halloween-haunt/",
    venue: "History Park", time: "2:00 PM", endTime: "6:30 PM", cost: null, description: "",
    blurb: "Trick-or-treat through a kid-friendly haunted experience with costumed characters and interactive scares.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].blurb, "Visit History Park for Children's Halloween Haunt.");
  for (const field of ["id", "title", "date", "time", "endTime", "venue", "url", "description", "cost"]) {
    assert.equal(events[0][field], raw[field]);
  }
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  assert.equal(applyVerifiedEventFacts({
    ...raw, url: "https://fareharbor.com/embeds/book/historysanjose/items/314582/?full-items=yes&flow=583745",
  }).blurb, events[0].blurb);
  for (const other of [
    { ...raw, date: "2027-10-24" },
    { ...raw, url: "https://historysanjose.org/event/another-haunt/" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("NUMU's Reawakening Community Day retains free admission and required registration after refresh", async () => {
  const raw = {
    id: "inbound-ca3dae2b2f8933c8", date: "2026-11-07",
    title: "Reawakening Community Day at NUMU", venue: "New Museum Los Gatos",
    url: "https://www.numulosgatos.org/events/reawakening",
    time: "12:00 PM", endTime: "4:00 PM", cost: null,
    description: "Family-friendly celebration of the museum's Reawakening exhibitions on Muwekma Ohlone culture.",
    blurb: "Join families at NUMU for activities inspired by the Reawakening exhibitions.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "free");
  assert.equal(events[0].registration, "required");
  assert.match(events[0].attendanceNote, /free with registration/i);
  for (const field of ["id", "title", "date", "time", "endTime", "venue", "url", "description", "blurb"]) {
    assert.equal(events[0][field], raw[field]);
  }
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const registration of ["full", "closed", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...raw, registration }).registration, registration);
  }
  for (const other of [
    { ...raw, date: "2027-11-07" },
    { ...raw, url: "https://www.numulosgatos.org/events/another-community-day" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Alviso's Math Festival discloses the source's conflicting duration until it is resolved", async () => {
  const raw = {
    date: "2026-10-25", title: "Math Festival", venue: "Alviso Library",
    url: "https://sjpl.bibliocommons.com/events/69c19013e2a2952aed0a154b",
    time: "3:00 PM", endTime: "4:00 PM", cost: "free",
    description: "The festival will be open for 1.5 hours, during which time kids can explore at their own pace.",
    blurb: "Solve hands-on math puzzles and games at the Julia Robinson Math Festival.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(requiresAttendanceConfirmation(events[0]), true);
  assert.match(events[0].attendanceNote, /3–4 PM.*1\.5 hours.*Confirm the end time/i);
  for (const field of Object.keys(raw)) assert.equal(events[0][field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const revised of [
    { ...raw, date: "2026-11-01" },
    { ...raw, url: "https://sjpl.bibliocommons.com/events/another-festival" },
    { ...raw, endTime: "4:30 PM" },
    { ...raw, time: "2:30 PM" },
    { ...raw, description: "The festival will be open for 1 hour." },
  ]) assert.deepEqual(applyVerifiedEventFacts(revised), revised);
});

test("Stanford's Muslim on Campus panel retains free admission and required signup", async () => {
  const raw = {
    date: "2026-10-26", title: "Being Muslim on Campus", venue: "Raikes Building",
    url: "https://events.stanford.edu/event/being-muslim-on-campus",
    time: "4:00 PM", endTime: "6:00 PM", cost: null, blurb: "Hear a panel discuss Abiya Ahmed's book.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].cost, "free");
  assert.equal(requiresAdvanceRegistration(events[0].registration), true);
  assert.match(events[0].attendanceNote, /register.*Stanford/i);
  for (const field of ["date", "time", "endTime", "venue", "blurb"]) assert.equal(events[0][field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [{ ...raw, date: "2026-11-02" }, { ...raw, url: "https://example.test/other" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("the dated Matthieu Rey lecture preserves free admission without inferring a signup requirement", () => {
  const raw = {
    date: "2026-10-26", title: "The Golden Age | Matthieu Rey", cost: null,
    url: "https://events.stanford.edu/event/the-golden-age-or-the-dark-time-of-the-plots",
    time: "4:00 PM", endTime: "5:30 PM", venue: "Encina Commons",
  };
  assert.deepEqual(applyVerifiedEventFacts(raw), { ...raw, cost: "free" });
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2026-11-02" }), { ...raw, date: "2026-11-02" });
});

test("SCU's Child Studies summit keeps its source-published 5 PM end and family category", () => {
  const raw = {
    date: "2026-10-24", title: "Child Studies Legislative Summit", category: "family", kidFriendly: true,
    url: "https://events.scu.edu/arts-and-sciences/event/521019-child-studies-legislative-summit",
    time: "2:00 PM", endTime: null, venue: "Alumni Science Hall", cost: "",
  };
  assert.deepEqual(applyVerifiedEventFacts(raw), { ...raw, endTime: "5:00 PM" });
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2026-10-25" }), { ...raw, date: "2026-10-25" });
});

test("the sugar-skull workshop keeps making and decorating on their separate dates", async () => {
  const raw = {
    date: "2026-10-25", title: "Make & Decorate Sugar Skulls",
    url: "https://sjpl.bibliocommons.com/events/6ad39fc229c3d60033309963",
    venue: "Biblioteca Latinoamericana Library", time: "11:00 AM", endTime: "12:30 PM",
    cost: "free",
    description: "Participants will not be able to finish their skulls in one session and should plan to return for the second session to decorate skulls. Session 1: Sunday, October 25, 11:00 AM - 12:30 PM; Session 2: Sunday, November 1, 11:00 AM - 12:30 PM.",
    blurb: "Make and decorate your own sugar skull for Dia de los Muertos Sunday morning.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].blurb, /Begin making a sugar skull.*return November 1 to decorate it/);
  for (const field of ["date", "time", "endTime", "venue", "cost", "description"]) {
    assert.equal(events[0][field], raw[field]);
  }
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [
    { ...raw, date: "2026-11-01" },
    { ...raw, url: "https://sjpl.bibliocommons.com/events/another-workshop" },
    { ...raw, description: "Make and decorate a sugar skull in this single-session workshop." },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("SJSU's November mariachi celebration retains its published admission and end time", async () => {
  const raw = {
    date: "2026-11-01", title: "SJSU CommUniverCity Community Event: Día de los Muertos Celebration",
    url: "https://events.sjsu.edu/event/mariachi-band-performance-dia-de-los-angelitos",
    venue: "Student Union Theater", time: "3:00 PM", endTime: null, category: "arts", cost: null,
    blurb: "Learn about the history, culture and art form of Mariachi music at SJSU's Día de los Muertos celebration in the Student Union Theater.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].category, "music");
  assert.equal(events[0].endTime, "5:00 PM");
  assert.equal(events[0].cost, "free");
  for (const field of ["date", "time", "venue", "blurb"]) assert.equal(events[0][field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  const anotherDate = { ...raw, date: "2027-11-01" };
  assert.deepEqual(applyVerifiedEventFacts(anotherDate), anotherDate);
});

test("SJSU's dated Candlelight concert retains its music category and published end", async () => {
  const raw = {
    date: "2026-10-30", title: "Candlelight - A Haunted Evening of Halloween Classics",
    url: "https://events.sjsu.edu/event/candlelight-a-haunted-evening-of-halloween-classics",
    venue: "Hammer Theatre Center", time: "6:30 PM", endTime: null, category: "arts",
    blurb: "Hear Halloween classics at the Hammer Theatre Center.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].category, "music");
  assert.equal(events[0].endTime, "7:30 PM");
  for (const field of ["date", "time", "venue", "blurb"]) assert.equal(events[0][field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  const anotherDate = { ...raw, date: "2027-10-30" };
  assert.deepEqual(applyVerifiedEventFacts(anotherDate), anotherDate);
});

test("the Halloween meal volunteer occurrence discloses its conflicting source schedules", async () => {
  const raw = {
    date: "2026-10-31", title: "Halloween: Cook & Share a Vegan Meal with Someone in Need",
    url: "https://www.meetup.com/san-jose-diet-meetup-group/events/316878539/",
    venue: "Mantra Room", time: "3:00 PM", endTime: "6:30 PM", registration: "none",
    blurb: "Cook and share a vegan meal at the Mantra Room on a Saturday afternoon.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(requiresAttendanceConfirmation(events[0]), true);
  assert.match(events[0].attendanceNote, /cooking begins at 5 PM.*6:30–8 PM.*conflicts with the event header/);
  assert.doesNotMatch(events[0].attendanceNote, /header lists 3–7 PM/);
  assert.match(events[0].blurb, /confirm the volunteer schedule/i);
  for (const field of ["date", "time", "endTime", "venue", "registration"]) assert.equal(events[0][field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  const anotherDate = { ...raw, date: "2026-11-07" };
  assert.deepEqual(applyVerifiedEventFacts(anotherDate), anotherDate);
});

test("a warned drum-circle occurrence cannot regain a definite park through cached copy", async () => {
  const raw = {
    date: "2026-11-14", title: "Community Drum Circle",
    url: "https://www.meetup.com/connected-through-music/events/317105031/",
    venue: "John D. Morgan Park", address: "540 West Rincon Avenue, Campbell",
    time: "3:30 PM", endTime: "5:00 PM", attendanceStatus: "needs-confirmation",
    attendanceNote: "The organizer's venue field lists John D. Morgan Park in Campbell, while its description refers to Baylands Park. Confirm the meeting location with the organizer before going.",
    blurb: "Join a community drum circle at John D. Morgan Park on a Saturday afternoon.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.match(events[0].blurb, /confirm the meeting location/i);
  assert.doesNotMatch(events[0].blurb, /John D\. Morgan|Baylands/);
  for (const field of ["venue", "address", "time", "endTime", "attendanceNote"]) assert.equal(events[0][field], raw[field]);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  const consistent = { ...raw };
  delete consistent.attendanceStatus;
  delete consistent.attendanceNote;
  assert.deepEqual(applyVerifiedEventFacts(consistent), consistent);
});

test("the running group's Alameda meeting point uses Voyager's current branch name", async () => {
  const raw = {
    date: "2026-10-31", title: "Run+Walk Meet-up - All Speeds Welcome!",
    venue: "Mission City Coffee Roasting Co", address: "2221 The Alameda, Santa Clara",
    url: "https://www.meetup.com/santa-clara-running-group/events/316904074/",
    time: "9:00 AM", blurb: "Meet other runners and walkers at Mission City Coffee Roasting Co.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].venue, "Voyager Craft Coffee");
  assert.match(events[0].blurb, /Voyager Craft Coffee/);
  assert.doesNotMatch(events[0].blurb, /Mission City/);
  assert.equal(events[0].address, raw.address);
  assert.equal(events[0].time, raw.time);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [{ ...raw, date: "2026-11-07" }, { ...raw, address: "Another branch" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

for (const occurrence of [
  { date: "2027-04-03", title: "Jack West: Guitars on Life", venue: "The Studio", time: "7:00 PM",
    url: "https://live.stanford.edu/events/26-27season/studio/jack-west-guitars-on-life/", category: "community" },
  { date: "2027-04-16", title: "Peter Asher: Songs and Stories", venue: "Carriage House", time: "7:30 PM",
    url: "https://montalvoarts.org/experience/carriage-house-concerts/peter-asher-songs-and-stories/", category: "arts" },
]) {
  test(`${occurrence.title} retains its organizer-verified concert category`, async () => {
    const raw = { ...occurrence, description: "", blurb: "See the performance." };
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    assert.equal(events[0].category, "music");
    assert.equal(events[0].date, raw.date);
    assert.equal(events[0].time, raw.time);
    assert.equal(events[0].blurb, raw.blurb);
    assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2028-04-03" }), { ...raw, date: "2028-04-03" });
    const other = { ...raw, title: "An unrelated concert", venue: "Another theatre", url: "https://example.test/other" };
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  });
}

test("dated concert details survive the sparse newsletter listings", () => {
  const stanford = {
    id: "inbound-46189d1f46f2ac9d", date: "2027-04-03", title: "Jack West: Guitars on Life",
    venue: "The Studio", time: "7:00 PM", url: "https://stanfordlive.stanford.edu",
    description: "Jack West performs Guitars On Life.",
  };
  const stanfordResult = applyVerifiedEventFacts(stanford);
  assert.equal(stanfordResult.time, "7:00 PM");
  assert.match(stanfordResult.description, /James Nash.*7 PM and 9 PM/);
  assert.equal(applyVerifiedEventFacts({ ...stanford, date: "2027-04-04" }).description, stanford.description);

  const montalvo = {
    date: "2027-04-18", title: "Saint Michael Trio: Saint Mike Has a Problem",
    url: "https://my.montalvoarts.org/3291/3293?promo=", time: null,
    description: "The newsletter gives no start time.",
  };
  const montalvoResult = applyVerifiedEventFacts(montalvo);
  assert.equal(montalvoResult.time, "3:00 PM");
  assert.equal(montalvoResult.cost, "paid");
  assert.equal(montalvoResult.category, "music");
  assert.equal(montalvoResult.venue, "Historic Villa at Montalvo Arts Center");
  assert.equal(montalvoResult.url, "https://my.montalvoarts.org/3291/3293");
  assert.doesNotMatch(montalvoResult.description, /newsletter|no start time/);
  assert.deepEqual(applyVerifiedEventFacts(montalvoResult), montalvoResult);
  const nextDay = { ...montalvo, date: "2027-04-19" };
  assert.deepEqual(applyVerifiedEventFacts(nextDay), nextDay);
});

test("Witchy Walk-A-Bout keeps the chamber's dated source and explicit free admission", () => {
  const raw = {
    id: "inbound-7183ea81af4fa0f4", date: "2026-10-31", title: "Witchy Walk-A-Bout",
    venue: "Saratoga Historic Village", city: "saratoga", url: "", cost: null,
    address: "Saratoga Historic Village, Saratoga, CA", time: "2:00 PM", endTime: "4:00 PM",
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.url, "https://members.saratogachamber.org/events/details/witchy-walk-a-bout-10852");
  assert.equal(fixed.cost, "free");
  assert.equal(fixed.address, "Big Basin Way, Saratoga, CA");
  assert.equal(fixed.id, raw.id);
  assert.equal(fixed.time, raw.time);
  assert.equal(fixed.endTime, raw.endTime);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const other of [{ ...raw, date: "2027-10-31" }, { ...raw, city: "san-jose" },
    { ...raw, title: "Another Halloween Event" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("SMASH's city-calendar survivor retains the organizer's STEM program through cached copy", async () => {
  const raw = {
    date: "2026-11-01", title: "SMASH Maker Fair 2026",
    url: "https://www.saratoga.ca.us/calendar.aspx?EID=2690",
    venue: "Saratoga High School courtyard", address: "", city: "saratoga",
    time: "2:00 PM", endTime: "5:00 PM", category: "market", cost: "free",
    description: "", blurb: "Browse maker booths and handmade goods at the Smash Maker Fair.",
  };
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const fixed = events[0];
  assert.equal(fixed.title, "SMASH Maker Fair");
  assert.equal(fixed.url, "https://saratogasmash.web.app/");
  assert.equal(fixed.category, "community");
  assert.equal(fixed.address, "20300 Herriman Avenue, Saratoga, CA 95070");
  assert.equal(fixed.kidFriendly, true);
  assert.match(fixed.blurb, /pumpkin.*smash|smash.*pumpkin/i);
  assert.doesNotMatch(fixed.blurb, /handmade goods/i);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  assert.deepEqual(raw, original);
  for (const other of [
    { ...raw, date: "2027-11-01" },
    { ...raw, url: "https://www.saratoga.ca.us/calendar.aspx?EID=2691" },
  ]) assert.equal(applyVerifiedEventFacts(other), other);
});

test("Kepler's rescheduled holiday party retains its actual locality and current program", async () => {
  const raw = {
    date: "2026-12-13", title: "Kepler's Annual Holiday Party",
    url: "https://www.keplers.org/upcoming-events-internal/holiday-party-2026",
    venue: "Kepler's", city: "palo-alto", address: "1010 El Camino Real #100, Menlo Park",
    time: "2:00 PM", endTime: "5:00 PM", cost: null,
    description: "Enjoy cookies and a cocktail. Literary Circle members receive 10% off.",
    blurb: "Sip a cocktail and nibble cookies at Kepler's annual holiday party.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const fixed = events[0];
  assert.equal(fixed.venue, "Kepler's Books");
  assert.equal(fixed.locality, "Menlo Park");
  assert.equal(fixed.city, "palo-alto", "retain the approved border coverage bucket");
  assert.equal(fixed.date, "2026-12-13");
  assert.equal(fixed.cost, null, "RSVP alone does not establish admission cost");
  assert.match(fixed.description, /active members/i);
  assert.doesNotMatch(fixed.description + fixed.blurb, /Literary Circle|cocktail|cookies/i);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const other = { ...raw, date: "2027-12-13" };
  assert.equal(applyVerifiedEventFacts(other), other);
});

test("Montalvo's Solas concert is music despite its sparse booking record", async () => {
  const raw = {
    date: "2026-11-06", title: "Solas", time: "7:30 PM",
    url: "https://my.montalvoarts.org/3107/3150", venue: "Montalvo Arts Center",
    category: "arts", description: "", blurb: "Catch Solas for an arts performance.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].category, "music");
  assert.match(events[0].blurb, /Irish traditional and Celtic folk music/);
  assert.equal(events[0].time, raw.time);
  const other = { ...raw, date: "2027-11-06" };
  assert.equal(applyVerifiedEventFacts(other), other);
});

test("Willow Glen's conflicting pickup instructions require confirmation instead of a guessed time", async () => {
  const raw = {
    date: "2026-10-27", title: "Family Storytime", venue: "Willow Glen Library",
    url: "https://sjpl.bibliocommons.com/events/691fb8c1dff9d93e00d10dc4",
    description: "A limited number of tickets will be distributed at the Information Desk 60 minutes prior to the start of Storytime.",
    attendanceNote: "A limited number of tickets will be distributed at the Information Desk 30 minutes prior to the start of Storytime.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(requiresAttendanceConfirmation(events[0]), true);
  assert.match(events[0].attendanceNote, /60 minutes.*30 minutes.*Confirm/i);
  assert.doesNotMatch(events[0].description, /will be distributed at.*60 minutes/);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [
    { ...raw, description: raw.description.replace("60 minutes", "30 minutes") },
    { ...raw, attendanceNote: raw.attendanceNote.replace("30 minutes", "60 minutes") },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "a consistent revised source keeps its own terms");
});

test("Berryessa's read-to-children program cannot reverse the volunteer's role", async () => {
  const raw = {
    date: "2026-10-28", title: "Reading to Children", venue: "Berryessa Library",
    url: "https://sjpl.bibliocommons.com/events/6a5e86410e562e28009b31f5",
    description: "Children will enjoy a small group interaction with our volunteer in the Children's Area.",
    blurb: "Watch kids read to a volunteer in a small group under the Read to Children sign at Berryessa Library.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.doesNotMatch(events[0].blurb, /kids read to a volunteer/i);
  assert.match(events[0].blurb, /small-group reading session.*Children's Area/);
  assert.equal(events[0].description, raw.description);
  const other = { ...raw, date: "2027-10-28" };
  assert.equal(applyVerifiedEventFacts(other), other);
});

test("the LinkedIn meetup keeps its sourced venue and date conflict through sparse refreshes", async () => {
  const raw = {
    id: "meetup-07326879c22c127a", date: "2026-12-08",
    title: "[In-Person + Online] Stream Processing with Apache Kafka and Flink",
    url: "https://www.meetup.com/stream-processing-meetup-linkedin/events/317066673/",
    time: "5:00 PM", endTime: "8:00 PM", source: "Meetup", city: "sunnyvale",
    venue: "Stream Processing with Apache Kafka, Samza, and Flink",
    address: "950 W Maude Ave, Sunnyvale, CA 94085, USA", cost: null,
    description: "Meetup event by Stream Processing with Apache Kafka, Samza, and Flink.",
    blurb: "Join this Sunnyvale meetup to hear discussion on stream processing with Apache Kafka, Samza, and Flink.",
  };
  const original = structuredClone(raw);
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const corrected = events[0];
  assert.equal(corrected.venue, "LinkedIn HQ");
  assert.match(corrected.description, /Apache Kafka, Apache Flink, and Change Data Capture/);
  assert.doesNotMatch(corrected.description + corrected.blurb, /Samza/);
  assert.match(corrected.attendanceNote, /Tuesday, December 8.*Thursday/);
  assert.equal(requiresAttendanceConfirmation(corrected), true);
  for (const field of ["id", "date", "title", "url", "time", "endTime", "city", "address", "cost"]) {
    assert.deepEqual(corrected[field], raw[field], field);
  }
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  assert.deepEqual(raw, original, "the source record is preserved");
  for (const updated of [
    { ...raw, date: "2026-12-10" },
    { ...raw, time: "5:30 PM" },
    { ...raw, description: "Revised organizer details confirm Tuesday, December 8." },
    { ...raw, url: raw.url.replace("317066673", "317066674") },
  ]) assert.equal(applyVerifiedEventFacts(updated), updated, "new source evidence keeps its own facts");
});

test("Hillview's Halloween conflict stays explicit through refresh without inventing a storytime meridiem", async () => {
  const raw = JSON.parse(readFileSync(new URL("../../../scripts/lib/fixtures/hillview-halloween-storytime-2026.json", import.meta.url)));
  const original = structuredClone(raw);
  for (const url of [raw.url, raw.url.replace("/events/", "/v2/events/")]) {
    for (const description of [raw.description, "Storytime 12:30 - 1:00 am Stay & Play 1:00 - 1:30 pm. Free. No registration required."]) {
      const events = [{ ...raw, url, description }];
      await resolveEventBlurbs(events, { enabled: false });
      const corrected = events[0];
      assert.match(corrected.description, /12:30–1:30 PM.*conflicting AM label/);
      assert.match(corrected.description, /Confirm the session timing with Hillview Library/);
      assert.doesNotMatch(corrected.description, /Storytime:?\s+12:30\s*[-–—]\s*1:00\s+[ap]m/i);
      assert.match(corrected.description, /Free\. No registration required\./);
      assert.equal(requiresAttendanceConfirmation(corrected), true);
      const { description: _description, attendanceNote, attendanceStatus, ...facts } = corrected;
      const { description: _sourceDescription, ...sourceFacts } = { ...raw, url };
      assert.deepEqual(facts, sourceFacts, "all other current event content and facts survive");
      assert.match(attendanceNote, /conflicting AM label/);
      assert.deepEqual(applyVerifiedEventFacts(corrected), corrected, "repeated refreshes do not duplicate the note");
    }
  }
  for (const other of [
    { ...raw, date: "2026-11-01" },
    { ...raw, url: "https://sjpl.bibliocommons.com/events/another-storytime" },
    { ...raw, time: "2:30 PM", endTime: "3:30 PM" },
    { ...raw, description: "New reviewed source copy. Storytime: 12:30 - 1:00 pm; Stay & Play: 1:00 - 1:30 pm. Free." },
    { ...raw, description: "New shorter reviewed source description. Free. No registration required." },
  ]) assert.equal(applyVerifiedEventFacts(other), other, "newer source content and other occurrences remain unchanged");
  assert.deepEqual(raw, original);
});

test("Stanford's full tour and location-by-RSVP talk retain their dated attendance terms", async () => {
  const rows = [
    {
      date: "2026-10-22", title: "Full—Tour Denning House, home to Knight-Hennessy Scholars",
      url: "https://events.stanford.edu/event/copy-of-tour-denning-house-home-to-knight-hennessy-scholars-8021",
      cost: null, blurb: "Tour Denning House Thursday afternoon.",
      expected: { registration: "full", cost: "free" },
    },
    {
      date: "2026-10-22", title: 'Universal Human Psychology, "Bani Adam," and Our Omnicultural Future',
      url: "https://events.stanford.edu/event/bani-adam-universal-human-psychology-and-our-omnicultural-future",
      expected: { registration: "required" },
    },
  ];
  for (const { expected, ...raw } of rows) {
    const original = structuredClone(raw);
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    const corrected = events[0];
    for (const [key, value] of Object.entries(expected)) assert.equal(corrected[key], value);
    assert.match(corrected.attendanceNote, /[Rr]egistration|RSVP/);
    assert.equal(requiresAdvanceRegistration(corrected), true);
    if (expected.registration === "full") {
      assert.match(corrected.blurb, /tour is full/);
      assert.match(corrected.attendanceNote, /full capacity/);
    } else {
      assert.match(corrected.attendanceNote, /RSVP to receive the location/);
    }
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    assert.deepEqual(raw, original);
    assert.equal(applyVerifiedEventFacts({ ...raw, registration: "closed" }).registration, "closed");
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2026-11-22" }), { ...raw, date: "2026-11-22" });
    assert.deepEqual(applyVerifiedEventFacts({ ...raw, url: "https://events.stanford.edu/event/another-event" }), { ...raw, url: "https://events.stanford.edu/event/another-event" });
  }
});

test("the sold-out Monte Sereno CPR class retains its age limit and ticket terms through refresh", async () => {
  const urls = [
    "https://Oct2026handsonlycprmontesereno.eventbrite.com",
    "https://oct2026handsonlycprmontesereno.eventbrite.com",
    "https://www.eventbrite.com/e/hands-only-cpr-and-aed-class-15-monte-sereno-15-hrs-2026-tickets-1998436176400",
  ];
  for (const url of urls) {
    const raw = {
      date: "2026-10-22", url, title: "Hands-Only CPR/AED & Choking Relief Training",
      venue: "Monte Sereno City Hall", address: "Monte Sereno City Hall",
      city: "monte-sereno", time: "10:00 AM", endTime: "11:30 AM",
      category: "family", kidFriendly: true, cost: null,
      description: "CPR techniques for adults, children, and infants.",
      blurb: "Learn CPR for all ages at Monte Sereno City Hall.",
    };
    const original = structuredClone(raw);
    const events = [{ ...raw }];
    await resolveEventBlurbs(events, { enabled: false });
    const corrected = events[0];
    assert.equal(corrected.registration, "full");
    assert.equal(requiresAdvanceRegistration(corrected), true);
    assert.equal(corrected.kidFriendly, false);
    assert.equal(corrected.category, "education");
    assert.equal(corrected.cost, "low");
    assert.equal(corrected.costNote, "From $17.85");
    assert.equal(corrected.address, "18041 Saratoga-Los Gatos Road, Monte Sereno, CA 95030");
    assert.match(corrected.description, /age 13 and older/);
    assert.match(corrected.description, /does not provide certification/);
    assert.match(corrected.blurb, /ages 13\+/);
    assert.doesNotMatch(corrected.blurb, /all ages/);
    assert.match(corrected.attendanceNote, /Sold out;.*waitlist/);
    assert.match(corrected.attendanceNote, /under 18.*waiver/);
    for (const field of ["date", "url", "title", "venue", "city", "time", "endTime"]) {
      assert.equal(corrected[field], raw[field], field);
    }
    assert.deepEqual(raw, original);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    assert.equal(applyVerifiedEventFacts({ ...raw, registration: "closed" }).registration, "closed");
    for (const other of [
      { ...raw, date: "2026-11-22" },
      { ...raw, url: "https://www.eventbrite.com/e/a-different-cpr-class" },
    ]) assert.equal(applyVerifiedEventFacts(other), other, "other CPR occurrences keep their own terms");
  }
});

test("November 25 Pearl Avenue Storytime qualifies pickup and keeps the confirmed ticket policy", () => {
  const policy = "Free, with limited capacity of 50 participants. Tickets are required to enter. Seating for Storytime is available on a first-come, first-served basis.";
  const pickupAtOpening = "A limited number of tickets will be distributed at the Information Desk when the Library opens. Try to arrive early to get your tickets.";
  const pickupBeforeStart = "A limited number of tickets will be distributed at the Information Desk 30 minutes prior to the start of Storytime.";
  const raw = {
    id: "sjpl-695477f8cba30d92b60b3b7e",
    date: "2026-11-25", time: "11:00 AM", cost: "free",
    title: "Indoor Family Storytime", venue: "Pearl Avenue Library",
    url: "https://sjpl.bibliocommons.com/v2/events/695477f8cba30d92b60b3b7e",
    description: policy + " " + pickupAtOpening,
    attendanceNote: [policy, pickupAtOpening, pickupBeforeStart].join(" "),
  };
  const corrected = applyVerifiedEventFacts(raw);
  assert(requiresAttendanceConfirmation(corrected));
  assert.equal(corrected.cost, "free");
  assert.equal(corrected.time, "11:00 AM");
  for (const field of ["description", "attendanceNote"]) {
    assert(corrected[field].startsWith(policy));
    assert.match(corrected[field], /opens.*30 minutes before storytime.*Confirm the pickup time with Pearl Avenue Library/);
    assert.doesNotMatch(corrected[field], /try to arrive early|tickets will be distributed/i);
  }
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  const agreeing = { ...raw, attendanceNote: raw.description };
  assert.equal(applyVerifiedEventFacts(agreeing), agreeing);
  const otherDate = { ...raw, date: "2026-12-02" };
  assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
});

test("March 6 Rinconada Chair Yoga qualifies conflicting signup instructions", () => {
  const raw = {
    id: "paloalto-6ab8557e607483003829d149",
    date: "2027-03-06", time: "11:00 AM", cost: "free",
    title: "Chair Yoga with Patricia Becker", venue: "Rinconada Library",
    url: "https://paloalto.bibliocommons.com/events/6ab8557e607483003829d149",
    description: "Join Patricia Becker for seated exercises. Registration isn't needed but means you will receive an email reminder. Here are the dates for 2027: January 2; March 6.",
  };
  for (const registration of [undefined, "required", "full", "closed"]) {
    const input = { ...raw, registration };
    if (registration === "required") input.registrationClosesBy = "2027-03-06T19:00:00Z";
    const corrected = applyVerifiedEventFacts(input);
    assert(requiresAttendanceConfirmation(corrected));
    assert.equal(corrected.registration, registration === "required" ? null : registration);
    assert.equal(corrected.registrationClosesBy, registration === "required" ? null : undefined);
    assert.match(corrected.attendanceNote, /registration is required.*signup is optional.*Confirm registration with Rinconada Library/);
    assert.equal(corrected.description, "Join Patricia Becker for seated exercises. Here are the dates for 2027: January 2; March 6.");
    assert.equal(corrected.cost, "free");
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }
  const agreeing = { ...raw, registration: "required", description: "Registration is required." };
  assert.equal(applyVerifiedEventFacts(agreeing), agreeing);
  const otherDate = { ...raw, date: "2027-05-01" };
  assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
});

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
  const novemberMeeting = { ...meeting, date: "2026-11-21",
    url: "https://sjpl.bibliocommons.com/v2/events/6a3d7bfbed35742f00fe48d0" };
  assert.equal(applyVerifiedEventFacts(novemberMeeting).description, applyVerifiedEventFacts(meeting).description);
  assert.equal(applyVerifiedEventFacts(novemberMeeting).time, novemberMeeting.time);
  assert.equal(applyVerifiedEventFacts({ ...novemberMeeting, venue: "Another Library" }).description, meeting.description);

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

test("Calabazas Teens Reach copy keeps the volunteer enrollment condition", async () => {
  const raw = {
    date: "2026-11-21", time: "4:00 PM", endTime: "5:00 PM", venue: "Calabazas Library",
    url: "https://sjpl.bibliocommons.com/events/6a3d7bfbed35742f00fe48d0",
    title: "Calabazas Teens Reach Meeting",
    description: "Come join us the first Thursday of the month for our monthly Calabazas Teens Reach meeting. You will need to be enrolled as a volunteer to log your hours. No registration required.",
    blurb: "Meet other teen volunteers, log volunteer hours, and work on projects at this monthly Reach meeting.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.deepEqual(actual, {
    ...raw,
    description: raw.description.replace(" the first Thursday of the month", ""),
    blurb: "Meet other teen volunteers and work on projects. Only enrolled library volunteers can log hours.",
  });
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  const changedTerms = { ...actual, description: "All participants can log hours.", blurb: "Log volunteer hours at the meeting." };
  assert.deepEqual(applyVerifiedEventFacts(changedTerms), changedTerms);
});

test("Stanford's ME218a showcase keeps its named meeting site and source-grounded blurb", async () => {
  const raw = {
    source: "Stanford Events", date: "2026-11-18", time: "7:00 PM", endTime: "9:00 PM",
    title: "ME218a Smart Product Design Fundamentals Project Presentations",
    url: "https://events.stanford.edu/event/me218a-smart-product-design-fundamentals-project-presentations-327",
    venue: "Building 550, Peterson Laboratory", address: "416 Escondido Mall, Stanford, CA 94305",
    blurb: "See the projects and talk with the students about their designs.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  const [actual] = events;
  assert.deepEqual(actual, {
    ...raw,
    venue: "Building 550, Peterson Laboratory, Grove",
    blurb: "See graduate mechanical engineering teams demonstrate their ME218a projects in an interactive mechatronics showcase.",
  });
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  for (const other of [{ ...raw, date: "2026-11-19" }, { ...raw, venue: "Another Laboratory" }, { ...raw, virtual: true }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
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
      "https://montalvoarts.org/experience/carriage-house-concerts/the-buena-vista-orchestra/", "paid"],
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
  for (const [date, title, venue, time, url, expectedTime, expectedUrl, expectedCost = null] of rows) {
    const raw = {
      id: "replacement-newsletter-id", date, title, venue, time, url,
      address: "Source address", cost: null, description: "A live concert.",
      blurb: "Hear a live concert.",
    };
    const events = [{ ...raw }];
    const stats = await resolveEventBlurbs(events, { enabled: false });
    const category = /^(?:Peter Asher|Jack West)/.test(title) ? { category: "music" } : {};
    assert.deepEqual(events[0], { ...raw, time: expectedTime, url: expectedUrl, cost: expectedCost, ...category });
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
    ["2026-11-24", "6a83713669166f088b92df7c", "Origami for Kids", /Advance signup is optional\. The library recommends it\./],
    ["2026-11-28", "6a3f10c0f56bd86e00b95e6e", "Language and Culture Swap", /Advance signup is optional\./],
    ["2026-11-29", "6a88a8afb2047800299484a4", "Basic English Level 0", /Advance signup is optional\./],
    ["2026-11-29", "6a3f10cc4407827f8aa7ada3", "Basic English Level 1", /Advance signup is optional\./],
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
    ["2026-10-27", "6a83713669166f088b92df78", "Origami for Kids", "3:15 PM"],
    ["2026-11-03", "6a83713669166f088b92df79", "Origami for Kids", "3:15 PM"],
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

test("Gamble Garden's four 2026 Holiday Tea seatings require reservations", () => {
  const raw = {
    date: "2026-12-04", title: "Holiday Tea", source: "Gamble Garden", cost: null,
    url: "https://www.gamblegarden.org/event/holiday-tea/2026-12-04/1/",
  };
  for (const date of ["2026-12-04", "2026-12-05"]) {
    for (const seating of ["1", "3"]) {
      const event = { ...raw, date, url: `https://www.gamblegarden.org/event/holiday-tea/${date}/${seating}/` };
      assert.deepEqual(applyVerifiedEventFacts(event), { ...event, registration: "required" });
    }
  }
  const closed = { ...raw, registration: "closed", attendanceNote: "Booking window closed." };
  assert.deepEqual(applyVerifiedEventFacts(closed), closed);
  for (const other of [
    { ...raw, date: "2027-12-04", url: raw.url.replace("2026", "2027") },
    { ...raw, url: "https://www.gamblegarden.org/event/another-tea/" },
  ]) {
    assert.equal(applyVerifiedEventFacts(other), other);
  }
});

test("History Park tea uses both verified seatings, the current booking calendar, and inclusive prices", () => {
  const raw = {
    date: "2026-12-05", title: "History Park Heritage Holiday Tea", venue: "History Park", category: "outdoor",
    endTime: "3:30 PM",
    url: "https://fareharbor.com/embeds/book/historysanjose/items/314593/calendar/2024/12/?full-items=yes",
    blurb: "Taste holiday tea service and sweets outdoors at History Park's Heritage Holiday Tea.",
    image: "https://historysanjose.org/wp-content/uploads/2022/07/ComingOut_About.jpg",
  };
  const fixed = applyVerifiedEventFacts(raw);
  assert.equal(fixed.url, "https://fareharbor.com/embeds/book/historysanjose/items/314593/calendar/2026/12/?flow=583745&full-items=yes");
  assert.equal(fixed.endTime, "4:00 PM");
  assert.equal(fixed.category, "community");
  assert.equal(fixed.blurb, "Choose the 11 AM–1 PM or 2–4 PM seating at the Empire Fire House.");
  assert.equal(fixed.attendanceNote, "Tickets are $58.30 for general admission and $53 for History San José members, including fees.");
  assert.match(fixed.image, /^https:\/\/www\.sanjose\.org\/.*\/holiday-tea-square_.*\.webp\?/);
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const retiredSlug = "2026-12-10-history-park-heritage-holiday-tea";
  const ledger = { entries: [{
    slug: retiredSlug,
    event: { ...raw, id: "historysj-f6db24f857516c7b", date: "2026-12-10", time: "11:00 AM" },
  }] };
  const published = { ...fixed, id: "historysj-0a92bee231b10266", time: "11:00 AM", venue: "History Park, Empire Fire House" };
  const { redirects, orphans } = resolveRetired(ledger, [published], [], "2026-11-24");
  assert.equal(redirects.get(retiredSlug), "2026-12-05-history-park-heritage-holiday-tea");
  assert.deepEqual(orphans, []);
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
  for (const [date, sourceId] of [["2026-10-15", "6aa49028101eb7003f2f6dfd"], ["2026-10-22", "6aa49028101eb7003f2f6dfe"], ["2026-10-29", "6aa49028101eb7003f2f6dff"], ["2026-12-17", "future-series-occurrence"]]) {
    const raw = {
      date, time: "1:30 PM", url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
      title: "Line Dancing for Beginners / Improvers", venue: "Calabazas Library",
      description: "Tickets will be available 30 minutes in advance. 30 First-time participants will need to sign a waiver form.",
    };
    const corrected = applyVerifiedEventFacts(raw);
    assert.equal(corrected.description, "Tickets will be available 30 minutes in advance. First-time participants will need to sign a waiver form.");
    assert.equal(corrected.time, raw.time);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    assert.equal(applyVerifiedEventFacts({ ...raw, url: raw.url.replace("/events/", "/v2/events/") }).description, corrected.description);
    assert.equal(applyVerifiedEventFacts({ ...raw, date: "2027-10-15" }).description, raw.description);
    const otherVenue = { ...raw, venue: "Another Library" };
    assert.equal(applyVerifiedEventFacts(otherVenue), otherVenue);
    const actualLimit = { ...raw, description: raw.description.replace(". 30 First-time", ". Only 30 first-time") };
    assert.deepEqual(applyVerifiedEventFacts(actualLimit), actualLimit, "preserve an explicitly stated participant limit");
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

test("the SJSU ticketed-music correction retains the verified Merry-Achi copy", () => {
  for (const [date, time, id] of [
    ["2026-11-27", "7:30 PM", "sjsu-45c5e8749a93e5e5"],
    ["2026-11-28", "2:00 PM", "sjsu-0d2083d9c2184167"],
  ]) {
    const event = {
      id, date, time, source: "SJSU Events",
      title: "Hammer Presents Merry-Achi Christmas 2026",
      venue: "Hammer Theatre Center", category: "music", cost: "paid",
      url: "https://events.sjsu.edu/event/hammer-presents-merry-achi-christmas-2026",
      description: "Mariachi Master Jóse Hernàndez and his Sol de Mexico have a history as rich and colorful as mariachi music itself.",
    };
    const reviewed = {
      ...event,
      description: "José Hernández and Mariachi Sol de México present a holiday mariachi concert at Hammer Theatre.",
      blurb: "Hear José Hernández and Mariachi Sol de México perform Merry-Achi Christmas at Hammer Theatre.",
    };
    assert.deepEqual(applyVerifiedEventFacts(event), reviewed);
    assert.deepEqual(applyVerifiedEventFacts(reviewed), reviewed);
  }
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

  const docent = applyVerifiedEventFacts({
    date: "2026-11-20", time: "6:00 PM", endTime: "7:30 PM", city: "san-jose", cost: null,
    url: "https://52102.blackbaudhosting.com/52102/tickets?tab=2&txobjid=d99e8482-8ff9-40b8-9855-85e4224a9ff8",
  });
  assert.equal(docent.cost, "free");
  assert(requiresAdvanceRegistration(docent));

  const anahita = {
    date: "2026-11-21", time: "2:00 PM", city: "san-jose", cost: null,
    url: "https://52102.blackbaudhosting.com/52102/tickets?tab=2&txobjid=0bbeb4b0-5969-4bce-9821-0ba84d9f867a",
  };
  const performance = applyVerifiedEventFacts(anahita);
  assert.equal(performance.cost, "low");
  assert.match(performance.costNote, /museum admission/);
  assert.equal(performance.endTime, "2:40 PM");
  assert(requiresAdvanceRegistration(performance));
  assert.equal(applyVerifiedEventFacts({ ...anahita, registration: "full" }).registration, "full");
  const otherShow = { ...anahita, time: "3:15 PM" };
  assert.deepEqual(applyVerifiedEventFacts(otherShow), otherShow);
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

test("the online SCU grad fair retains its actual organizer through cached blurbs", async () => {
  const raw = {
    date: "2026-10-28", title: "UC Santa Cruz Grad Fair",
    url: "https://events.scu.edu/school-of-education-and-counseling/event/517795-uc-santa-cruz-grad-fair",
    time: "11:00 AM", endTime: null, city: "los-gatos", venue: "University of California Santa Cruz",
    virtual: true, description: "Curious to learn more about the School of Education and Counseling Psychology? Come meet our Admissions team!",
    blurb: "Meet UC Santa Cruz's Education admissions team online and learn about the School of Education and Counseling Psychology.",
  };
  const events = [{ ...raw }];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].venue, "Online");
  assert.equal(events[0].city, "santa-clara");
  assert.equal(events[0].virtual, true);
  assert.match(events[0].blurb, /Santa Clara University's School of Education and Counseling Psychology admissions team/);
  assert.equal(events[0].time, raw.time);
  assert.equal(events[0].description, raw.description);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
  for (const other of [{ ...raw, date: "2026-11-28" }, { ...raw, url: "https://events.scu.edu/event/another-fair" }]) {
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("Stanford's Big Swap remains a community giveaway despite incidental music", () => {
  const raw = {
    date: "2026-10-23", title: "Big Swap: Game Day Edition",
    url: "https://events.stanford.edu/event/big-swap-game-day-edition-177",
    category: "music", description: "Sustainable Stanford will be giving away new Stanford gear at the football game on 10/23!",
  };
  assert.equal(applyVerifiedEventFacts(raw).category, "community");
  assert.deepEqual(applyVerifiedEventFacts({ ...raw, date: "2026-11-23" }), { ...raw, date: "2026-11-23" });
});

test("sparse Meetup blurbs cannot invent attendee roles or a performance format", () => {
  const sparse = { source: "Meetup", title: "AI Night with AWS, Anthropic, Temporal", description: "Meetup event by Silicon Valley Startup Incubation And Acceleration." };
  assert.ok(eventCopyFactConflict("Meet founders and engineers from AWS, Anthropic, and Temporal.", sparse));
  assert.ok(eventCopyFactConflict("Hear engineers explain Meta's AI infrastructure.", { ...sparse, title: "A Priority Queue Became the Backbone of Meta's AI Infrastructure" }));
  assert.ok(eventCopyFactConflict("Watch local improvisers build scenes from audience suggestions.", { ...sparse, title: "South Bay Improv" }));
  assert.ok(eventCopyFactConflict("Watch local improvisers perform.", { ...sparse, title: "South Bay Improv" }));
  assert.equal(eventCopyFactConflict("Join an AI night with AWS, Anthropic, and Temporal.", sparse), null);
  assert.equal(eventCopyFactConflict("Meet founders and engineers.", { ...sparse, title: "Founders and Engineers Meetup" }), null);
  assert.equal(eventCopyFactConflict("Watch improvisers perform using audience suggestions.", { ...sparse, title: "Improv performance with audience suggestions" }), null);
  assert.equal(eventCopyFactConflict("Watch improvisers perform using audience suggestions.", { ...sparse, description: "Watch our improvisers perform using audience suggestions." }), null);
});

test("sparse Meetup listings cannot acquire unsourced refreshments or live models", () => {
  const sparse = {
    source: "Meetup", title: "Property, Construction and Technology Mixer",
    description: "Meetup event by Bay Area Real Estate & Tech Talk.",
  };
  assert.ok(eventCopyFactConflict("Network with professionals over drinks at State Street Market.", sparse));
  assert.ok(eventCopyFactConflict("Swap ideas over coffee at Panera Bread.", { ...sparse, title: "Generative AI Social" }));
  assert.ok(eventCopyFactConflict("Draw from a live model.", { ...sparse, title: "Wednesday Morning Figure Drawing" }));
  assert.equal(eventCopyFactConflict("Network with professionals at State Street Market.", sparse), null);
  assert.equal(eventCopyFactConflict("Swap ideas over coffee.", { ...sparse, title: "Coffee and AI" }), null);
  assert.ok(eventCopyFactConflict("Swap ideas over coffee.", { ...sparse, title: "Beer and AI" }));
  assert.equal(eventCopyFactConflict("Draw from a live model.", { ...sparse, title: "Figure Drawing with a Live Model" }), null);
  assert.equal(eventCopyFactConflict("Draw from a live model.", { ...sparse, description: "The organizer provides a live model." }), null);
});

test("course level claims cannot choose between conflicting English and Spanish source levels", () => {
  // Fresh exact library record: its heading says Nivel 1; the body says cero.
  // https://sjpl.bibliocommons.com/events/6a8e2033b204780029958a7b
  const event = {
    title: "Clases de inglés para Hispanos - Nivel 1",
    description: "Te invitamos a una clase de Inglés nivel cero con una voluntaria.",
  };
  for (const claim of ["Practice English in a level-one class.", "Join a level 0 English class.",
    "Practica inglés en una clase de nivel uno.", "Clase de nivel cero."]) {
    assert.equal(eventCopyFactConflict(claim, event), "conflicting source course levels");
  }
  assert.equal(eventCopyFactConflict("Practice English vocabulary and grammar with a volunteer.", event), null);
  assert.equal(eventCopyFactConflict("An English class meets today. A different level-one class meets tomorrow.", event), null);
});

test("course level checks preserve consistent sources, ranges and unrelated uses of level", () => {
  const event = { title: "English Class - Level 1", description: "Practice English in a level one class." };
  assert.equal(eventCopyFactConflict("Practice English in a level-one class.", event), null);
  for (const description of ["English classes at levels 0–1.", "English classes at levels zero through one.",
    "English classes at level 0 and level 1.", "English classes for levels 0/1."]) {
    assert.equal(eventCopyFactConflict("Practice English in a level-one class.", { ...event, description }), null);
  }
  assert.equal(eventCopyFactConflict("Meet on level one.", { title: "Building Tour - Level 1", description: "Start on level zero." }), null);
  assert.equal(eventCopyFactConflict("Join a level-one class.", { ...event, description: "Practice English with a volunteer." }), null);
});

test("course level conflicts reject both carried and cached blurbs before generation", async (t) => {
  const event = {
    title: "Clases de inglés para Hispanos - Nivel 1", venue: "Library",
    description: "Clase de Inglés nivel cero con una voluntaria.",
  };
  const misleading = "Practice English in a level-one class.";
  const cachePath = fileURLToPath(new URL("../../data/south-bay/event-blurb-cache.json", import.meta.url));
  const originalRead = fs.readFileSync;
  const cache = { byKey: { [eventBlurbCacheKey(event)]: { blurb: misleading } } };
  t.mock.method(fs, "readFileSync", (path, ...args) =>
    String(path) === cachePath ? JSON.stringify(cache) : originalRead(path, ...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const events = [{ ...event, blurb: misleading }, { ...event }];
  const before = structuredClone(events);
  const stats = await resolveEventBlurbs(events, { enabled: false });
  assert.equal(stats.cache_hits, 0);
  assert.equal(stats.skipped, 2);
  for (const [index, actual] of events.entries()) {
    assert.equal(actual.blurb, undefined);
    assert.deepEqual(actual, Object.fromEntries(Object.entries(before[index]).filter(([key]) => key !== "blurb")));
  }
});

test("the live feed retains verified source facts and passes the copy guards", () => {
  // A false positive blanks legitimate copy, so the whole feed is the fixture.
  const feed = JSON.parse(readFileSync(new URL("../../data/south-bay/upcoming-events.json", import.meta.url)));
  const drift = feed.events.flatMap((event) => {
    const corrected = applyVerifiedEventFacts(event);
    const fields = Object.keys(corrected).filter((field) =>
      JSON.stringify(corrected[field]) !== JSON.stringify(event[field]));
    return fields.length ? [`${event.id}: ${fields.join(", ")}`] : [];
  });
  assert.deepEqual(drift, [], "direct data edits must preserve verified source corrections");
  const flagged = feed.events
    .filter((event) => event.blurb && eventCopyFactConflict(event.blurb, event))
    .map((event) => `${event.id} ${event.title}: ${eventCopyFactConflict(event.blurb, event)}`);
  assert.deepEqual(flagged, []);
});

test("dated SJSU home-game details fill sparse calendar rows", () => {
  const rows = [
    ["2026-11-18", "11:00 AM", "womens-basketball-san-jose-state-vs-california-baptist", "Provident Credit Union Event Center", "free"],
    ["2026-11-21", "11:00 AM", "womens-basketball-san-jose-state-vs-long-beach-state", "Provident Credit Union Event Center", "free"],
    ["2026-11-19", "3:00 PM", "womens-volleyball-san-jose-state-vs-unlv-7924", "Spartan Gym", null],
    ["2026-12-02", "7:00 PM", "womens-basketball-san-jose-state-vs-pepperdine", "Provident Credit Union Event Center", null],
  ];
  for (const [date, time, slug, venue, cost] of rows) {
    const raw = {
      date, time, source: "SJSU Events", city: "san-jose", venue: null, address: "", cost: null,
      url: `https://events.sjsu.edu/event/${slug}`,
    };
    const corrected = applyVerifiedEventFacts(raw);
    assert.equal(corrected.venue, venue);
    assert.match(corrected.address, /San Jose, CA 95112$/);
    assert.equal(corrected.cost, cost);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);

    const revised = { ...raw, venue: "New venue", address: "New address", cost: "paid" };
    assert.deepEqual(applyVerifiedEventFacts(revised), revised);
  }
});

test("the Cool Yule opener deduplicates to the full concert and its old link redirects", () => {
  const opener = {
    id: "6c03b8c73442", title: "Cool Yule: HSAS Full Ensemble & Vocal Ensemble",
    date: "2026-12-01", time: "7:30 PM", venue: "Hammer Theatre Center", city: "san-jose",
    url: "https://sanjosejazz.org/events/cool-yule-hsas/",
  };
  const hostListing = {
    ...opener, id: "sjsu-b633beb6f4439b5a", title: "Hammer Presents Cool Yule 2026",
    endTime: "9:00 PM", category: "arts",
    url: "https://events.sjsu.edu/event/hammer-presents-cool-yule-2026",
  };
  const concert = applyVerifiedEventFacts(hostListing);
  assert.equal(concert.category, "music");
  assert.match(concert.description, /Jazz Orchestra.*opening set.*High School All Stars/);
  assert.deepEqual(deduplicateEventSlots([concert, applyVerifiedEventFacts(opener)]), [concert]);

  const today = "2026-11-20";
  const ledger = retireSlugs({ entries: [] }, [opener], [concert], today);
  const { redirects } = resolveRetired(ledger, [concert], [], today);
  assert.equal(redirects.get("2026-12-01-cool-yule-hsas-full-ensemble-and-vocal-ensemble"), "2026-12-01-hammer-presents-cool-yule-2026");

  const nextDay = { ...opener, date: "2026-12-02" };
  assert.equal(applyVerifiedEventFacts(nextDay), nextDay);
});

test("the verified Common Ground and Rodin admission terms apply within their published runs", () => {
  const exhibit = {
    date: "2026-11-24", ongoing: true,
    url: "https://events.sjsu.edu/event/copy-of-natalie-and-james-thompson-gallery-common-ground",
  };
  assert.equal(applyVerifiedEventFacts(exhibit).cost, "free");
  const afterExhibit = { ...exhibit, date: "2026-12-05" };
  assert.equal(applyVerifiedEventFacts(afterExhibit), afterExhibit);

  const tour = {
    date: "2026-11-21", cost: null,
    url: "https://events.stanford.edu/event/copy-of-cancelled-public-tour-auguste-rodin-565",
  };
  const corrected = applyVerifiedEventFacts(tour);
  assert.equal(corrected.cost, "free");
  assert.equal(corrected.registration, "none");
  assert.match(corrected.attendanceNote, /first come, first served/);
  assert.equal(applyVerifiedEventFacts({ ...tour, registration: "closed" }).registration, "closed");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});

test("both A Closer Look tour listings use the arts filter and Cantor's walk-in terms", () => {
  for (const [slug, time] of [["public-tour-a-closer-look", "1:00 PM"], ["copy-of-public-tour-a-closer-look", "3:00 PM"]]) {
    const tour = {
      date: "2026-11-21", time, category: "community", cost: "free",
      url: `https://events.stanford.edu/event/${slug}`,
    };
    const corrected = applyVerifiedEventFacts(tour);
    assert.deepEqual(corrected, {
      ...tour, category: "arts", registration: "none", attendanceNote: "Tours are first come, first served.",
    });
    assert.equal(applyVerifiedEventFacts({ ...tour, registration: "closed" }).registration, "closed");
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }
});

test("Stanford farm shifts retain advance signup and waiver requirements", () => {
  const event = {
    date: "2026-11-21",
    url: "https://events.stanford.edu/event/copy-of-volunteering-at-the-stanford-educational-farm",
    attendanceNote: "Ages 10 to 14 must volunteer alongside an adult guardian. All volunteers must complete a safety waiver on arrival.",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert(requiresAdvanceRegistration(corrected));
  assert.equal(corrected.attendanceNote, "Ages 10 to 14 must volunteer alongside an adult guardian. All volunteers must register in advance and complete a safety waiver.");
  assert.equal(applyVerifiedEventFacts({ ...event, registration: "full" }).registration, "full");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});

test("the dated Triton paint workshop uses the museum's paid enrollment details", () => {
  const event = {
    date: "2026-12-04", venue: "Inside the Triton Museum of Art", cost: null,
    url: "https://www.eventbrite.com/e/create-with-the-curator-paint-night-at-the-triton-tickets-2004685415041?aff=oddtdtcreator",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.venue, "Triton Museum of Art");
  assert.equal(corrected.cost, "paid");
  assert.equal(corrected.costNote, "$40–$50");
  assert.equal(corrected.registration, "required");
  assert.match(corrected.url, /^https:\/\/www\.tritonmuseum\.org\/courses\//);
  const differentDate = { ...event, date: "2026-12-05" };
  assert.deepEqual(applyVerifiedEventFacts(differentDate), differentDate);
});

test("Black Mountain's November 24 listing shows the verified signup closure", () => {
  const event = {
    title: "Full Moon on Black Mountain", date: "2026-11-24", registration: "required",
    url: "https://www.openspace.org/events/guided-activities/full-moon-black-mountain-4",
    registrationClosesBy: "2026-11-23T22:00:00.000Z",
    attendanceNote: "Reservations close November 23 at 2 PM PT.",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.deepEqual(fixed, {
    ...event, registration: "closed", attendanceNote: "Reservations closed November 23 at 2 PM PT.",
  });
  assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  const rescheduledSignup = { ...event, registrationClosesBy: "2026-11-24T20:00:00.000Z" };
  assert.deepEqual(applyVerifiedEventFacts(rescheduledSignup), rescheduledSignup);
  const laterHike = { ...event, date: "2027-02-20" };
  assert.deepEqual(applyVerifiedEventFacts(laterHike), laterHike);
});

test("the official Stanford basketball ticket page supplies admission and address", () => {
  const event = {
    date: "2026-11-29", venue: "Maples Pavilion", cost: null,
    url: "https://tickets.gostanford.com/events/mens-basketball-vs-portland-pzvvw2",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.cost, "paid");
  assert.equal(corrected.address, "655 Campus Drive, Stanford, CA 94305");
});

test("SCU's online program information session links its official signup form", () => {
  const event = {
    date: "2026-12-18", virtual: true,
    url: "https://events.scu.edu/school-of-education-and-counseling/event/521799-new-ma-in-social-impact-leadership-informational-sess",
  };
  const corrected = applyVerifiedEventFacts(event);
  assert.equal(corrected.registration, "required");
  assert.equal(corrected.url, "https://slate.scu.edu/register/?id=199100ed-053c-4778-bade-bfb6f771e217");
  assert.equal(corrected.virtual, true);
  assert.equal(applyVerifiedEventFacts({ ...event, registration: "closed" }).registration, "closed");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});
