import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildSourceHealth,
  carryForwardTransientCriticalSources,
  eventRegressionProblem,
  isTransientSourceError,
  sourceProblems,
  inspectSnapshot,
  sourceRegressionProblems,
  strictRefreshInputHealth,
} from "./event-source-health.mjs";
import { applyVerifiedSjsuEventOverride } from "./sjsu-event-overrides.mjs";
import { applyVerifiedMeetupEventOverride } from "./meetup-event-overrides.mjs";

test("Mantra Room timing conflict preserves source clocks and clears when resolved", () => {
  const event = { date: "2026-11-03", time: "6:00 PM", endTime: "7:15 PM", registration: "full",
    url: "https://www.meetup.com/san-jose-diet-meetup-group/events/316989193/" };
  const original = structuredClone(event);
  const corrected = applyVerifiedMeetupEventOverride(event, { sourceDescription: "Every Tuesday | 7:00–8:30 PM" });
  assert.equal(corrected.attendanceStatus, "needs-confirmation");
  assert.match(corrected.attendanceNote, /6–7:15 PM.*7–8:30 PM/);
  for (const field of ["date", "time", "endTime", "registration", "url"]) assert.equal(corrected[field], event[field]);
  assert.deepEqual(event, original);
  assert.equal(applyVerifiedMeetupEventOverride(event, { sourceDescription: "Every Tuesday | 6:00–7:15 PM" }), event);
  for (const other of [{ ...event, date: "2026-11-10" }, { ...event, time: "7:00 PM", endTime: "8:30 PM" },
    { ...event, url: event.url.replace("316989193", "316989194") }]) {
    assert.equal(applyVerifiedMeetupEventOverride(other, { sourceDescription: "Every Tuesday | 7:00–8:30 PM" }), other);
  }
});
import {
  hasProspectiveCityHallUpgrade,
  hasEventSelectionCount,
  hasUnsupportedEventMilestone,
  hasUnsupportedSharedEventVenue,
  briefingEventWhen,
  isBriefingEventAvailable,
  meetingWithinBriefingWindow,
  refreshBriefingAvailability,
} from "./city-briefing-integrity.mjs";

const NOW = new Date("2026-07-20T03:00:00.000Z");

test("the October 26 roommate meetup discloses the source's conflicting October 19 date", () => {
  const event = {
    date: "2026-10-26", title: "Friends & Roommates Finder", venue: "Starbucks",
    url: "https://www.meetup.com/san-jose-friends-roommate-finder/events/316998975/",
    time: "7:00 PM", endTime: "8:30 PM", address: "4190 N First St, San Jose",
  };
  const fixed = applyVerifiedMeetupEventOverride(event, { sourceDescription: "Details: Mon Oct 19 · 7:00–8:30 PM" });
  assert.equal(fixed.attendanceStatus, "needs-confirmation");
  assert.match(fixed.attendanceNote, /October 26.*October 19/);
  assert.equal(isBriefingEventAvailable(fixed), false);
  for (const field of ["date", "time", "endTime", "venue", "address"]) assert.equal(fixed[field], event[field]);
  assert.equal(applyVerifiedMeetupEventOverride(event, { sourceDescription: "Details: Mon Oct 26 · 7:00–8:30 PM" }), event);
  for (const other of [{ ...event, date: "2026-11-02" }, { ...event, url: "https://example.test/other" }]) {
    assert.equal(applyVerifiedMeetupEventOverride(other, { sourceDescription: "Mon Oct 19" }), other);
  }
  assert.equal(event.attendanceStatus, undefined);
});

test("the November real-estate meetup uses the venue explicitly named in its body", () => {
  const event = {
    date: "2026-11-10", title: "Mega Meet Up: The Ultimate Business & Real Estate Monthly Mixer",
    url: "https://www.meetup.com/nvst-capital-real-estate-meetup/events/316660427/",
    venue: "", address: "10275 N De Anza Blvd, Cupertino, CA 95014, USA", time: "5:30 PM",
  };
  const sourceDescription = "**Where:** AlphaX RE Capital, 10275 N De Anza Blvd, Cupertino, CA";
  assert.deepEqual(applyVerifiedMeetupEventOverride(event, { sourceDescription }), { ...event, venue: "AlphaX RE Capital" });
  for (const other of [
    { ...event, date: "2026-11-11" }, { ...event, url: "https://example.test/other" },
    { ...event, venue: "A revised meeting place" },
  ]) assert.equal(applyVerifiedMeetupEventOverride(other, { sourceDescription }), other);
  assert.equal(applyVerifiedMeetupEventOverride(event, { sourceDescription: "Meet at another venue." }), event);
});

test("the drum circle discloses conflicting source parks without choosing one", () => {
  const event = {
    date: "2026-11-14", title: "Community Drum Circle", venue: "John D. Morgan Park",
    url: "https://www.meetup.com/connected-through-music/events/317105031/",
    time: "3:30 PM", address: "540 West Rincon Avenue, Campbell",
  };
  const fixed = applyVerifiedMeetupEventOverride(event, { sourceDescription: "There is sometimes a parking fee at Baylands park." });
  assert.equal(fixed.attendanceStatus, "needs-confirmation");
  assert.match(fixed.attendanceNote, /John D\. Morgan Park.*Baylands Park/);
  assert.equal(fixed.venue, event.venue);
  assert.equal(fixed.address, event.address);
  assert.equal(fixed.time, event.time);
  assert.equal(applyVerifiedMeetupEventOverride(event, { sourceDescription: "Meet at John D. Morgan Park." }), event);
  for (const other of [{ ...event, date: "2026-11-15" }, { ...event, url: "https://example.test/other" }]) {
    assert.equal(applyVerifiedMeetupEventOverride(other, { sourceDescription: "Parking fee at Baylands park." }), other);
  }
  assert.equal(event.attendanceStatus, undefined);
});

test("SJSU's verified Savannah conference stays excluded without location metadata", () => {
  const url = "https://events.sjsu.edu/event/ischool-at-arma-infocon-2026";
  for (const date of ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]) {
    assert.equal(applyVerifiedSjsuEventOverride({ url, date, venue: "Savannah Convention Center", address: "" }), null);
  }
  const other = { url: "https://events.sjsu.edu/event/local-conference", date: "2026-10-25" };
  assert.equal(applyVerifiedSjsuEventOverride(other), other);
});

test("corrects SJSU's false multi-day September 10 reading occurrence", () => {
  const url = "https://events.sjsu.edu/event/september-10-campus-reading-discussion-and-film";
  assert.equal(applyVerifiedSjsuEventOverride({ url, date: "2026-09-09" }), null);

  const event = applyVerifiedSjsuEventOverride({ url, date: "2026-09-10", time: "8:00 AM" });
  assert.equal(event.time, "4:00 PM");
  assert.equal(event.venue, "Sweeney Hall 413 and Uchida Hall 124");
  assert.match(event.description, /5:30 PM screening of M3GAN/);
});

test("normalizes verified MacinTalkers facts without replacing occurrence evidence", () => {
  const event = {
    title: "Macintalkers weekly meeting",
    date: "2026-09-30",
    time: "5:30 PM",
    endTime: "7:30 PM",
    venue: "Apple Inc",
    address: "1 Infinite Loop, Cupertino",
    url: "https://www.meetup.com/d101tm/events/123456789/",
  };

  const corrected = applyVerifiedMeetupEventOverride(event, { groupUrlname: "d101tm" });
  assert.equal(corrected.title, "MacinTalkers Toastmasters");
  assert.equal(corrected.time, "5:40 PM");
  assert.equal(corrected.endTime, "7:00 PM");
  assert.equal(corrected.venue, "Apple, Inc.");
  assert.equal(corrected.address, "1 Infinite Loop, Cupertino, CA 95014");
  assert.equal(corrected.url, event.url);
  assert.equal(corrected.date, event.date);
  assert.equal(
    corrected.organizerUrl,
    "https://www.toastmasters.org/Find-a-Club/00007430-macintalkers-club",
  );

  const other = { title: "Sunnyvale Speakeasies weekly meeting", time: "7:00 PM" };
  assert.equal(
    applyVerifiedMeetupEventOverride(other, { groupUrlname: "d101tm" }),
    other,
  );
});

test("preserves a date-specific MacinTalkers venue when a future meeting moves", () => {
  const event = {
    title: "Macintalkers weekly meeting",
    venue: "Apple Park Visitor Center",
    address: "10600 N Tantau Ave, Cupertino",
  };
  const corrected = applyVerifiedMeetupEventOverride(event, { groupUrlname: "d101tm" });

  assert.equal(corrected.venue, event.venue);
  assert.equal(corrected.address, event.address);
});

test("labels the Los Gatos festival meetup as a walk from its meeting point", () => {
  const event = {
    title: "Los Gatos Art & Wine Festival",
    venue: "Safeway - Los Gatos",
    date: "2026-09-27",
    time: "10:00 AM",
    url: "https://www.meetup.com/30-chill-women-trying-to-figure-shit-out-make-friends/events/316047950/",
  };
  const corrected = applyVerifiedMeetupEventOverride(event);
  assert.equal(corrected.title, "Group walk to Los Gatos Art & Wine Festival");
  assert.equal(corrected.venue, "Safeway meetup point");
  assert.match(corrected.description, /Civic Center Lawn/);
  assert.equal(corrected.date, event.date);
  assert.equal(corrected.time, event.time);
  assert.equal(corrected.url, event.url);
});

test("keeps meetings inside the briefing week and rejects agenda-only tense upgrades", () => {
  assert.equal(meetingWithinBriefingWindow({ date: "2026-09-14" }, "2026-09-07", "2026-09-14"), true);
  assert.equal(meetingWithinBriefingWindow({ date: "2026-09-15" }, "2026-09-07", "2026-09-14"), false);

  const items = [{ headline: "Council to hear an appeal", summary: "The council was scheduled to hear it." }];
  assert.equal(hasProspectiveCityHallUpgrade("The council heard an appeal.", items), true);
  assert.equal(hasProspectiveCityHallUpgrade("The council was scheduled to hear an appeal.", items), false);

  const agendaItems = [{
    headline: "Fire truck manufacturers listed in closed-session agenda",
    summary: "The September 22 City Council agenda listed a potential case involving fire truck manufacturers.",
  }];
  assert.equal(hasProspectiveCityHallUpgrade("The council weighed a legal case against fire truck makers.", agendaItems), true);
  assert.equal(hasProspectiveCityHallUpgrade("The Planning Commission's October 12 session eyed expanding Peery Park's offices, R&D and housing.", agendaItems), true);
  assert.equal(hasProspectiveCityHallUpgrade("The Planning Commission's October 12 agenda listed a proposed expansion of Peery Park's offices, R&D and housing.", agendaItems), false);
  assert.equal(hasProspectiveCityHallUpgrade("The agenda listed a potential case involving fire truck manufacturers.", agendaItems), false);

  assert.equal(hasProspectiveCityHallUpgrade("City Council held closed talks over the Finch Avenue property.", agendaItems), true);
  assert.equal(hasProspectiveCityHallUpgrade("The library held a book sale; the council agenda listed property negotiations.", agendaItems), false);
  const permit = [{
    headline: "Chabad seeks permit for Sunnyvale worship space",
    summary: "A use permit application before the Zoning Administrator would allow a religious assembly space.",
  }];
  assert.equal(hasProspectiveCityHallUpgrade("A September 30 zoning hearing weighed a worship-space permit.", permit), true);
  assert.equal(hasProspectiveCityHallUpgrade("The September 30 zoning agenda listed a worship-space permit.", permit), false);
});

test("dated meeting announcements cannot establish completed city hall actions", () => {
  const announcement = [{
    headline: "Peery Park plan may add offices, R&D space, housing",
    summary: "A Planning Commission special study session was scheduled for October 12 to review a proposed amendment to the Peery Park Specific Plan.",
  }];
  assert.equal(hasProspectiveCityHallUpgrade("The Planning Commission's October 12 session eyed expanding Peery Park's offices, R&D and housing.", announcement), true);
  assert.equal(hasProspectiveCityHallUpgrade("The October 12 Planning Commission agenda listed a proposed Peery Park amendment.", announcement), false);
  for (const framing of ["set", "expected", "slated"]) {
    assert.equal(hasProspectiveCityHallUpgrade("The council approved the amendment.", [{
      summary: `The council was ${framing} for October 12 to consider the amendment.`,
    }]), true);
  }
  assert.equal(hasProspectiveCityHallUpgrade("The council approved the amendment.", [{
    summary: "The council met on October 12 and approved the amendment.",
  }]), false);
});

test("a limited briefing selection cannot establish event totals", () => {
  assert.equal(hasEventSelectionCount("Heritage Theatre hosts three Durga Puja events including a fashion show."), true);
  assert.equal(hasEventSelectionCount("The library offers 2 watercolor workshops Saturday."), true);
  assert.equal(hasEventSelectionCount("Heritage Theatre hosts Durga Puja programs including a fashion show."), false);
  assert.equal(hasEventSelectionCount("Two Concerts for Kids runs Saturday.", [{ title: "Two Concerts for Kids" }]), false);
  assert.equal(hasEventSelectionCount("The Chamber celebrates its 100th anniversary Saturday."), false);
  assert.equal(hasEventSelectionCount("October 10, the library offers watercolor workshops."), false);
  assert.equal(hasEventSelectionCount("A 10 AM concert runs at the library."), false);
  assert.equal(hasEventSelectionCount("A 10:30 AM concert runs at the library."), false);
  assert.equal(hasEventSelectionCount("October 10, the library offers two watercolor workshops."), true);
  assert.equal(hasEventSelectionCount("Frost brings Taking Back Sunday twice Saturday, with Thrice and Saves the Day."), true);
  assert.equal(hasEventSelectionCount("The band performs 2 times Saturday."), true);
  assert.equal(hasEventSelectionCount("Taking Back Sunday plays with Thrice and Saves the Day Saturday."), false);
  assert.equal(hasEventSelectionCount("Twice Upon a Time plays Saturday.", [{ title: "Twice Upon a Time" }]), false);
});

test("city highlights exclude full and closed programs without excluding available reservations", () => {
  assert.equal(isBriefingEventAvailable({ registration: "full" }), false);
  assert.equal(isBriefingEventAvailable({ registration: "closed" }), false);
  assert.equal(isBriefingEventAvailable({ registration: "none", attendanceStatus: "needs-confirmation" }), false);
  assert.equal(isBriefingEventAvailable({ registration: "required", attendanceStatus: "needs-confirmation" }), false);
  assert.equal(isBriefingEventAvailable({
    date: "2026-10-31", url: "https://www.meetup.com/san-jose-diet-meetup-group/events/316878539/",
  }), false, "sparse retained records must honor the verified schedule conflict");
  assert.equal(isBriefingEventAvailable({ registration: "required" }), true);
  assert.equal(isBriefingEventAvailable({}), true);
});

test("city highlights honor Gamble's explicit sold-out notice before signup fields are refreshed", () => {
  const event = {
    source: "Gamble Garden", title: "Halloween Magic", date: "2026-10-24",
    description: "Sold out. Don't miss Gamble Garden's annual Halloween event.",
  };
  for (const registration of [undefined, "none", "required"]) {
    assert.equal(isBriefingEventAvailable({ ...event, registration }), false);
  }
  assert.equal(isBriefingEventAvailable({
    ...event, description: "Last year's Halloween event sold out. Join us this year.",
  }), true);
  assert.equal(isBriefingEventAvailable({
    ...event, description: "Join us in the garden.",
  }), true, "a source reopening must not inherit a frozen closure");
});

test("city highlights honor verified closures even when an older snapshot has no signup state", () => {
  const older = {
    title: "Multi-Level ESL Class Session", date: "2026-10-14",
    url: "https://sccl.bibliocommons.com/events/6a5a9d66f4e5db3d00c27e15",
  };
  for (const registration of [undefined, "none", "required"]) {
    const event = { ...older, registration };
    assert.equal(isBriefingEventAvailable(event), false);
    assert.equal(event.registration, registration);
  }
  assert.equal(isBriefingEventAvailable({ ...older, date: "2027-10-14" }), true);
  assert.equal(isBriefingEventAvailable({ ...older, url: "https://sccl.bibliocommons.com/events/another-class" }), true);
});

test("event refresh removes newly unavailable briefing occurrences without rewriting the lead", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sbt-briefing-availability-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "briefing.json");
  const event = {
    title: "ESL Conversation Club", city: "cupertino", date: "2026-10-20",
    displayDate: "Tue, Oct 20", time: "10:30 AM", url: "https://library.example/events/esl",
    registration: "closed",
  };
  const highlight = { type: "event", title: event.title, url: event.url, when: briefingEventWhen(event) };
  const nextDay = { ...highlight, when: "Wed, Oct 21 · 10:30 AM" };
  const otherTime = { ...highlight, when: "Tue, Oct 20 · 1:30 PM" };
  const otherUrl = { ...highlight, url: "https://library.example/events/other" };
  const fullEvent = { ...event, title: "Book Club", registration: "full" };
  const fullHighlight = { ...highlight, title: fullEvent.title };
  const unconfirmedEvent = { ...event, title: "Drum Circle", registration: "none", attendanceStatus: "needs-confirmation" };
  const unconfirmedHighlight = { ...highlight, title: unconfirmedEvent.title };
  const council = { ...highlight, type: "council" };
  const input = {
    generatedAt: "2026-10-20T03:00:00Z", weekStart: "2026-10-19", weekEnd: "2026-10-26",
    cities: {
      cupertino: { summary: "Tuesday's council agenda lists a second reading.", highlights: [highlight, fullHighlight, unconfirmedHighlight, nextDay, otherTime, otherUrl, council] },
      campbell: { summary: "Another city.", highlights: [highlight] },
    },
  };
  writeFileSync(path, JSON.stringify(input));
  assert.equal(refreshBriefingAvailability(path, [event, fullEvent, unconfirmedEvent]), 3);
  const expected = structuredClone(input);
  expected.cities.cupertino.highlights = [nextDay, otherTime, otherUrl, council];
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), expected);
  const bytes = readFileSync(path, "utf8");
  assert.equal(refreshBriefingAvailability(path, [event, fullEvent, unconfirmedEvent]), 0);
  assert.equal(readFileSync(path, "utf8"), bytes);
});

test("available events and absent feed rows do not change a briefing snapshot", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sbt-briefing-available-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "briefing.json");
  assert.equal(refreshBriefingAvailability(path, []), 0, "a missing briefing is not created");
  const event = { title: "ESL", city: "cupertino", date: "2026-10-20", url: "https://library.example/esl", registration: "required" };
  const input = { weekStart: "2026-10-19", weekEnd: "2026-10-26", cities: {
    cupertino: { highlights: [{ type: "event", title: event.title, url: event.url, when: briefingEventWhen(event) }] },
  } };
  const bytes = JSON.stringify(input);
  writeFileSync(path, bytes);
  assert.equal(refreshBriefingAvailability(path, [event]), 0);
  assert.equal(refreshBriefingAvailability(path, []), 0);
  assert.equal(refreshBriefingAvailability(path, [{ ...event, date: "2027-10-20", registration: "closed" }]), 0);
  assert.equal(readFileSync(path, "utf8"), bytes);
});

test("the Vasona walk keeps its verified Oak Meadow meeting point through ingest", () => {
  const event = {
    title: "Green Exercise Walk / Hike Los Gatos Vasona Lake", date: "2026-11-07",
    url: "https://www.meetup.com/bay-area-hiking-walking-wellness-club/events/316788593/",
    venue: "Bay Area Hiking, Walking, Wellness Club", address: "233 Blossom Hill Rd, Los Gatos",
    time: "1:30 PM", endTime: "4:30 PM", city: "los-gatos",
  };
  assert.deepEqual(applyVerifiedMeetupEventOverride(event), { ...event, venue: "Oak Meadow Park parking lot" });
  assert.equal(applyVerifiedMeetupEventOverride({ ...event, date: "2026-11-08" }).venue, event.venue);
  assert.equal(applyVerifiedMeetupEventOverride({ ...event, url: event.url.replace("316788593", "316788594") }).venue, event.venue);
  assert.equal(event.venue, "Bay Area Hiking, Walking, Wellness Club");
});

test("ordinary performance dates cannot become opening or closing dates in a briefing", () => {
  const performances = [{ title: "Private Lives" }, { title: "Once Upon a Mattress" }];
  assert.equal(hasUnsupportedEventMilestone('"Private Lives" closes out at The Pear Theatre Friday.', performances), true);
  assert.equal(hasUnsupportedEventMilestone("Once Upon a Mattress opens at Saratoga Civic Theater Friday.", performances), true);
  assert.equal(hasUnsupportedEventMilestone("Private Lives plays Friday and Once Upon a Mattress runs Saturday.", performances), false);
  assert.equal(hasUnsupportedEventMilestone("Postcard Exhibit Opening Reception opens Friday.", [
    { title: "Postcard Exhibit Opening Reception" },
  ]), false);
});

test("briefings cannot assign one event's venue to both named events", () => {
  const events = [
    { title: "Monthly Chat with Mayor Moore", venue: null },
    { title: 'Flex Prep "College Admissions in the Age of AI: Policies, Ethics, and Impact"', venue: "Cupertino Library" },
  ];
  const shared = 'Chat with Mayor Moore and a "College Admissions in the Age of AI" discussion both land at Cupertino Library Wednesday.';
  assert.equal(hasUnsupportedSharedEventVenue(shared, events), true);
  assert.equal(hasUnsupportedSharedEventVenue(shared, [
    { ...events[0], venue: "Quinlan Community Center" }, events[1],
  ]), true);
  assert.equal(hasUnsupportedSharedEventVenue(shared, [
    { ...events[0], venue: "Cupertino Library" }, events[1],
  ]), false);
  assert.equal(hasUnsupportedSharedEventVenue(
    'Chat with Mayor Moore is Wednesday; Cupertino Library hosts "College Admissions in the Age of AI" Wednesday.',
    events,
  ), false);
  assert.equal(hasUnsupportedSharedEventVenue(
    'Chat with Mayor Moore is at Quinlan Community Center Wednesday, while "College Admissions in the Age of AI" is at Cupertino Library Wednesday.',
    [{ ...events[0], venue: "Quinlan Community Center" }, events[1]],
  ), false);
  // Different occurrences of the same program do not establish two named events.
  assert.equal(hasUnsupportedSharedEventVenue(
    "Monthly Chat with Mayor Moore runs on both days at Cupertino Library.",
    [events[0], { ...events[0], venue: "Cupertino Library" }],
  ), false);
  assert.equal(hasUnsupportedSharedEventVenue("Both workshops are at Cupertino Library.", events), false);
  assert.equal(hasUnsupportedSharedEventVenue(null, events), false);
});

test("rejects stale and timestamp-less snapshots", () => {
  assert.equal(inspectSnapshot({
    name: "playwright",
    data: { events: [{}] },
    timestamp: "2026-07-18T00:00:00.000Z",
    now: NOW,
    maxAgeHours: 30,
  }).status, "stale");
  assert.equal(inspectSnapshot({
    name: "inbound",
    data: { events: [{}] },
    timestamp: null,
    now: NOW,
  }).status, "invalid");
});

test("strict input health accepts retired Meetup credentials being absent", () => {
  const env = { TICKETMASTER_API_KEY: "present" };
  const result = strictRefreshInputHealth({
    env,
    playwright: { _meta: { generatedAt: "2026-07-20T02:00:00.000Z" }, events: [{}] },
    inbound: { _meta: { pulledAt: "2026-07-20T01:00:00.000Z" }, events: [{}] },
    now: NOW,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});

test("classifies rate limits and 5xx as transient source errors", () => {
  assert.equal(isTransientSourceError(new Error("429")), true);
  assert.equal(isTransientSourceError("Heritage Theatre is error: 429"), true);
  assert.equal(isTransientSourceError(new Error("503")), true);
  assert.equal(isTransientSourceError(new TypeError("terminated")), true);
  assert.equal(isTransientSourceError(new Error("403")), false);
  assert.equal(isTransientSourceError(new Error("parser exploded")), false);
});

test("an opted-in optional source retains verified rows after an interrupted response without disguising permanent errors", () => {
  const source = { id: "fetchGambleGardenEvents", label: "Gamble Garden", preserveOnTransientFailure: true };
  const previous = [{ id: "harvest-social", source: "Gamble Garden", date: "2026-10-29", time: "4:00 PM" }];
  const { results, carried } = carryForwardTransientCriticalSources(
    [source], [{ status: "rejected", reason: new TypeError("terminated") }], previous,
  );
  assert.deepEqual(results[0].value, previous);
  assert.notEqual(results[0].value[0], previous[0]);
  assert.deepEqual(carried, [{ id: source.id, label: source.label, count: 1, error: "terminated" }]);
  for (const reason of [new Error("403"), new Error("parser exploded")]) {
    const failed = { status: "rejected", reason };
    assert.equal(carryForwardTransientCriticalSources([source], [failed], previous).results[0], failed);
  }
  const empty = { status: "fulfilled", value: [] };
  assert.equal(carryForwardTransientCriticalSources([source], [empty], previous).results[0], empty);
  assert.equal(carryForwardTransientCriticalSources([source], [{ status: "rejected", reason: new Error("terminated") }], []).carried.length, 0);
});

test("carries forward cached critical rows after a transient upstream failure", () => {
  const sources = [
    { id: "fetchTicketmasterEvents", label: "Ticketmaster", critical: true },
    { id: "fetchHeritageTheatreEvents", label: "Heritage Theatre", critical: false },
  ];
  const previousEvents = [
    { id: "tm-1", source: "Ticketmaster", date: "2026-08-10" },
    { id: "tm-2", source: "Ticketmaster", date: "2026-08-11" },
    { id: "ht-1", source: "Heritage Theatre", date: "2026-08-12" },
  ];
  const { results, carried } = carryForwardTransientCriticalSources(
    sources,
    [
      { status: "rejected", reason: new Error("429") },
      { status: "rejected", reason: new Error("429") },
    ],
    previousEvents,
  );

  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[0].value.length, 2);
  assert.equal(results[1].status, "rejected");
  assert.deepEqual(carried, [{
    id: "fetchTicketmasterEvents",
    label: "Ticketmaster",
    count: 2,
    error: "429",
  }]);

  const health = buildSourceHealth(sources, results);
  assert.equal(sourceProblems(health).blocking.length, 0);
});

test("source health blocks a critical empty source but absorbs a broken optional one", () => {
  const health = buildSourceHealth(
    [
      { id: "broad", label: "Broad feed", critical: true },
      { id: "seasonal", label: "Seasonal feed", critical: false },
      { id: "broken", label: "Broken feed", critical: false },
    ],
    [
      { status: "fulfilled", value: [] },
      { status: "fulfilled", value: [] },
      { status: "rejected", reason: new Error("upstream 503") },
    ],
  );
  const result = sourceProblems(health);
  assert.deepEqual(result.blocking, ["Broad feed is empty"]);
  assert.deepEqual(result.tolerated, ["Broken feed is error: upstream 503"]);
  assert.equal(result.toleranceExceeded, false);
});

test("a handful of dead optional feeds never blocks the refresh", () => {
  // The Jul/Aug 2026 outage: four sports/theatre adapters 403/400'd and took
  // down a 4,000-event refresh — and five days of newsletters with it.
  const definitions = ["Earthquakes", "Bay FC", "Santa Cruz Warriors", "Palo Alto Players"]
    .map((label, i) => ({ id: `s${i}`, label, critical: false }));
  const health = buildSourceHealth(
    [{ id: "tm", label: "Ticketmaster", critical: true }, ...definitions],
    [
      { status: "fulfilled", value: [{ date: "2026-08-05" }] },
      ...definitions.map(() => ({ status: "rejected", reason: new Error("403") })),
    ],
  );
  const result = sourceProblems(health);
  assert.deepEqual(result.blocking, []);
  assert.equal(result.tolerated.length, 4);
});

test("a systemic outage still blocks even when no source is marked critical", () => {
  const definitions = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, label: `Feed ${i}`, critical: false }));
  const health = buildSourceHealth(
    definitions,
    definitions.map(() => ({ status: "rejected", reason: new Error("ETIMEDOUT") })),
  );
  const result = sourceProblems(health);
  assert.equal(result.toleranceExceeded, true);
  assert.equal(result.blocking.length, 9);
  assert.deepEqual(result.tolerated, []);
});

test("detects meaningful source or event-count regressions", () => {
  const previous = { sources: Array.from({ length: 20 }, (_, i) => `s${i}`), eventCount: 100 };
  assert.match(eventRegressionProblem({ previous, nextSourceCount: 15, nextEventCount: 95 }), /regressed/);
  assert.match(eventRegressionProblem({ previous, nextSourceCount: 19, nextEventCount: 50 }), /regressed/);
  assert.equal(eventRegressionProblem({ previous, nextSourceCount: 19, nextEventCount: 90 }), null);
});

test("records dated source baselines and blocks a masked single-source collapse", () => {
  const definitions = [{ id: "music", label: "Town concert schedule", critical: false }];
  const previous = buildSourceHealth(definitions, [{
    status: "fulfilled",
    value: [
      { date: "2026-07-18" },
      { date: "2026-07-22" },
      { date: "2026-07-29" },
      { date: "2026-08-05" },
      { date: "2026-08-12" },
      { date: "2026-08-19" },
    ],
  }]);
  const next = buildSourceHealth(definitions, [{
    status: "fulfilled",
    value: [{ date: "2026-07-22" }],
  }]);

  assert.deepEqual(previous[0].dateCounts, {
    "2026-07-18": 1,
    "2026-07-22": 1,
    "2026-07-29": 1,
    "2026-08-05": 1,
    "2026-08-12": 1,
    "2026-08-19": 1,
  });
  assert.deepEqual(sourceRegressionProblems({
    previousSourceHealth: previous,
    nextSourceHealth: next,
    today: "2026-07-20",
  }), ["Town concert schedule retained only 1 of 5 still-upcoming source records (20%)"]);
});

test("source baselines age out seasonal events instead of requiring an allowlist", () => {
  const previous = [{
    id: "seasonal",
    label: "Seasonal series",
    status: "ok",
    count: 3,
    dateCounts: { "2026-07-01": 1, "2026-07-08": 1, "2026-07-15": 1 },
  }];
  const next = [{
    id: "seasonal",
    label: "Seasonal series",
    status: "empty",
    count: 0,
    dateCounts: {},
  }];
  assert.deepEqual(sourceRegressionProblems({
    previousSourceHealth: previous,
    nextSourceHealth: next,
    today: "2026-07-20",
  }), []);
});

test("blocks an adapter that drops every still-upcoming source record", () => {
  const previous = [{
    id: "official",
    label: "Official calendar",
    status: "ok",
    count: 3,
    dateCounts: { "2026-08-01": 1, "2026-08-08": 1, "2026-08-15": 1 },
  }];
  const next = [{
    id: "official",
    label: "Official calendar",
    status: "empty",
    count: 0,
    dateCounts: {},
  }];
  assert.deepEqual(sourceRegressionProblems({
    previousSourceHealth: previous,
    nextSourceHealth: next,
    today: "2026-07-20",
  }), ["Official calendar lost 3 still-upcoming source records"]);
});
