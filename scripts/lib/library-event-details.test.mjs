import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { biblioEventOccurrence, libraryEventDetails } from "./library-event-details.mjs";

const ongoingFixture = JSON.parse(readFileSync(new URL("./fixtures/biblio-ongoing-halloween-2026.json", import.meta.url)));
const midnightWindowFixture = JSON.parse(readFileSync(new URL("./fixtures/sccl-teen-burton-2026-10-23.json", import.meta.url)));

const capturedLosGatosLibrary = {
  name: "Los Gatos Library", city: "los-gatos", urls: ["https://library.example.test/calendar"],
  address: "100 Villa Ave, Los Gatos, CA 95030", onsiteLocations: [],
};

test("excluded LibCal tenants have no live collection or verification path", () => {
  for (const path of ["../playwright-scrapers.mjs", "../verify-event-venues.mjs"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /ajax\/calendar\/list|scrapeLibCal|LIBCAL_LIBRARIES/);
  }
});

test("both library adapters honor the captured midnight registration deadline", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-22T23:59:00-07:00") });
  const { fetchBiblioEvents, fetchScclEvents } = await import("../generate-events.mjs");
  const event = structuredClone(midnightWindowFixture.event);
  t.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.hostname, "gateway.bibliocommons.com");
    return Response.json({ entities: { events: request.searchParams.get("page") === "1"
      ? { [event.id]: event } : {} } });
  });
  for (const [now, expected] of [
    ["2026-10-22T23:59:00-07:00", "required"],
    [midnightWindowFixture.fetchedAt, "closed"],
  ]) {
    t.mock.timers.setTime(new Date(now).getTime());
    for (const adapter of [
      () => fetchBiblioEvents("sccl", "Santa Clara County Library", () => "campbell"),
      fetchScclEvents,
    ]) {
      const rows = await adapter();
      assert.equal(rows.length, 1);
      const [actual] = rows;
      assert.equal(actual.registration, expected);
      assert.equal(actual.registrationClosesBy, "2026-10-23T07:00:00.000Z");
      assert.equal(actual.date, "2026-10-24");
      assert.equal(actual.time, "4:00 PM");
      assert.equal(actual.endTime, "5:00 PM");
    }
  }
  assert.equal(midnightWindowFixture.window.window_end, "2026-10-23T00:00:00");
  assert.equal(midnightWindowFixture.window.status, "ENDED");
  assert.deepEqual(event, midnightWindowFixture.event);
});

test("the captured Halloween display survives both library adapters after its midnight opening", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T12:00:00Z") });
  const { fetchBiblioEvents, fetchScclEvents } = await import("../generate-events.mjs");
  const original = structuredClone(ongoingFixture);
  for (const library of ["sjpl", "sccl"]) {
    const event = structuredClone(ongoingFixture.event);
    if (library === "sccl") event.definition.branchLocationId = "SA";
    const cancelled = { ...event, id: "cancelled", definition: { ...event.definition, isCancelled: true } };
    t.mock.method(globalThis, "fetch", async () => Response.json({ entities: {
      ...ongoingFixture.entities,
      events: { [event.id]: event, cancelled },
    } }));
    const rows = library === "sjpl"
      ? await fetchBiblioEvents(library, "San Jose Public Library", () => "san-jose")
      : await fetchScclEvents();
    assert.equal(rows.length, 1, "the active display survives; the cancelled copy does not");
    const [actual] = rows;
    assert.equal(actual.id, `${library}-${event.id}`);
    assert.equal(actual.date, "2026-10-21");
    assert.equal(actual.startDate, "2026-10-21");
    assert.equal(actual.endDate, "2026-10-31");
    assert.equal(actual.time, null);
    assert.equal(actual.endTime, null);
    assert.equal(actual.ongoing, true);
    assert.equal(actual.cost, "free");
    assert.match(actual.description, /interactive display/);
  }
  assert.deepEqual(ongoingFixture, original);
});

test("date-only library runs include their closing day and expire on the next Pacific day", () => {
  const event = ongoingFixture.event;
  const fields = biblioEventOccurrence(event, new Date("2026-10-31T23:30:00-07:00")).fields;
  assert.equal(fields.date, "2026-10-31");
  assert.equal(fields.startDate, "2026-10-21");
  assert.equal(fields.endDate, "2026-10-31");
  assert.equal(fields.time, null);
  assert.equal(biblioEventOccurrence(event, new Date("2026-11-01T00:00:00-07:00")), null);
  assert.equal(biblioEventOccurrence(event, new Date("2026-11-01T01:30:00-08:00")), null);
});

test("library display windows preserve source dates across DST without reopening timed events", () => {
  const now = new Date("2027-03-14T12:00:00-07:00");
  const display = { start: "2027-03-13T17:00", end: "2027-03-14T17:00" };
  const fields = biblioEventOccurrence(display, now).fields;
  assert.equal(fields.ongoing, true, "a 23-hour span still crosses two Pacific dates");
  assert.equal(fields.date, "2027-03-14");
  assert.equal(fields.startDate, "2027-03-13");
  assert.equal(biblioEventOccurrence(display, new Date("2027-03-14T17:00:00-07:00")), null);
  assert.equal(biblioEventOccurrence({ start: "2027-03-14T10:00", end: "2027-03-14T13:00" }, now), null);
  assert.equal(biblioEventOccurrence({ start: "2027-03-13T20:00", end: "2027-03-14T01:00" }, now), null);
  assert.equal(biblioEventOccurrence({ start: "not a date", end: "2027-03-15" }, now), null);
  const future = biblioEventOccurrence({ start: "2027-03-15T10:00", end: "2027-03-15T11:00" }, now).fields;
  assert.equal(future.date, "2027-03-15");
  assert.equal(future.time, "10:00 AM");
  assert.equal(future.endTime, "11:00 AM");
  assert.equal(future.ongoing, undefined);
});

test("availability notices and Spanish appointments retain the organizer's attendance instructions", () => {
  for (const instructions of [
    "We're sorry, this event is full. Contact the librarian for a waitlist for future sessions.",
    "Por cita únicamente. Por favor contactar a la biblioteca para agendar su cita.",
  ]) {
    const actual = libraryEventDetails({ definition: { description: "A library program.",
      registrationInfo: { instructions: `<p>${instructions}</p>` } } });
    assert.equal(actual.attendanceNote, instructions);
  }
  const closure = "Registration is now closed. Please check back in January for our Spring Classes.";
  assert.equal(libraryEventDetails({ definition: { description: `<p>${closure}</p>` } }).attendanceNote, closure);
});
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { requiresAdvanceRegistration, requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";
import { stripHtml } from "./event-html.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/library-attendance-2026-09-06.json", import.meta.url)));
const listFixture = JSON.parse(readFileSync(new URL("./fixtures/library-description-lists-2026-10-20.json", import.meta.url)));

test("real library HTML lists retain equipment, exception dates and attendance through ingestion", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-20T12:00:00Z") });
  const { fetchBiblioEvents, polishDescription } = await import("../generate-events.mjs");
  for (const { library, event } of listFixture.events) {
    const original = structuredClone(event);
    t.mock.method(globalThis, "fetch", async () => Response.json({ entities: {
      events: { [event.id]: event },
      locations: { [event.definition.branchLocationId]: { name: library === "paloalto" ? "Rinconada" : "Edenvale" } },
    } }));
    const [ingested] = await fetchBiblioEvents(library, "Fixture Library", () => library === "paloalto" ? "palo-alto" : "san-jose");
    const actual = polishDescription(ingested.description);
    assert.equal(ingested.id, `${library}-${event.id}`);
    assert.equal(ingested.url, `https://${library}.bibliocommons.com/events/${event.id}`);
    assert.equal(ingested.date, event.definition.start.slice(0, 10));
    assert.equal(ingested.time, library === "paloalto" ? "2:00 PM" : "4:00 PM");
    assert.equal(ingested.endTime, library === "paloalto" ? "4:00 PM" : "6:00 PM");
    assert.equal(ingested.cost, "free");
    if (library === "paloalto") {
      assert.match(actual, /How to Access: Check/);
      assert.match(actual, /What to Bring: Laptop; SD Card, Memory Card; USB Drive, Flash Drive or Memory Stick; External Hard Drive; Your Vintage Media!/);
      assert.match(actual, /a single two-hour appointment per week per person/);
      assert.match(actual, /Book@Rinconada/);
      assert.equal(ingested.registration, "appointment-only");
      assert.match(ingested.attendanceNote, /Space is limited!/);
    } else {
      assert.match(actual, /breaks: September 29th; November 3rd; November 24th\. Homework Club will end on November 17th/);
      assert.match(actual, /Tuesdays each week from 4:00 PM – 6:00 PM/);
      assert.match(actual, /No registration is required; however, Homework Club has a limited capacity/);
      assert.match(actual, /first-come, first-served/);
      assert.doesNotMatch(actual, /\u200B/);
      assert.equal(ingested.registration, undefined);
    }
    assert.equal(polishDescription(actual), actual);
    assert.deepEqual(event, original, "ingestion must not mutate source records");

    // Gateway HTML and the public page's entity-encoded HTML use one path.
    const decoded = event.definition.description.replaceAll("&lt;", "<").replaceAll("&gt;", ">");
    assert.equal(polishDescription(libraryEventDetails({ description: decoded }).description), actual);
    const shorter = { definition: { ...event.definition, description: "<p>New shorter source description. Appointment required.</p>" } };
    assert.equal(polishDescription(libraryEventDetails(shorter).description),
      "New shorter source description. Appointment required.");
  }
});

test("list extraction handles novel, nested and sentence items without changing ordinary HTML cleanup", () => {
  for (const [html, expected] of [
    ["<p>Bring</p><ul><li>Clay</li><li>Water</li></ul><p>Free. Ages 8+.</p>", "Bring: Clay; Water. Free. Ages 8+."],
    ["<ol><li><p>Arrive at 4:30 p.m.</p></li><li>Sign in.</li></ol>", "Arrive at 4:30 p.m. Sign in."],
    ["<p>Bring:</p><ul><li>Media<ul><li>SD card</li><li>USB drive</li></ul></li><li>Paper</li></ul>", "Bring: Media: SD card; USB drive. Paper."],
    ["<p>Use <strong>OpenAI</strong>. Bring your laptop.</p>", "Use OpenAI. Bring your laptop."],
    ["<ul><li>https://example.org/List?name=SDCard</li><li>Paper</li></ul>", "https://example.org/List?name=SDCard; Paper."],
  ]) {
    assert.equal(libraryEventDetails({ description: html }).description, expected);
  }
  assert.equal(stripHtml("<ul><li>Label one</li><li>Label two</li></ul>"), "Label one Label two");
});

test("normal library adapters preserve late attendance paragraphs and structured audiences", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-06T12:00:00Z") });
  const { fetchBiblioEvents } = await import("../generate-events.mjs");
  const { parseLibCalEvents, normalizePlaywrightEvent } = await import("../playwright-scrapers.mjs");
  t.mock.method(globalThis, "fetch", async (url) => {
    const data = String(url).includes("bibliocommons") ? fixture.bibliocommons : fixture.libcal;
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });

  const [rawDerby] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.equal(rawDerby.time, "2:00 PM");
  assert.match(rawDerby.description, /Elementary School Students 5 to 10/);
  assert.match(rawDerby.attendanceNote, /12 tickets.*30 minutes.*12:30 p\.m\./);
  assert.equal(classifyAudienceAge(rawDerby), "kids");
  const derby = applyVerifiedEventFacts(rawDerby);
  assert.equal(requiresAdvanceRegistration(derby), false);
  assert.equal(requiresAttendanceConfirmation(derby), true);
  assert.match(derby.attendanceNote, /confirm pickup timing/);
  assert.doesNotMatch(derby.description + derby.attendanceNote, /12:30|1:30/);

  const [scrapedNarcan] = parseLibCalEvents(fixture.libcal.results, capturedLosGatosLibrary, { today: "2026-09-06" });
  const narcan = normalizePlaywrightEvent(scrapedNarcan);
  assert.equal(narcan.address, "100 Villa Ave, Los Gatos, CA 95030", "use the library entrance rather than the civic center");
  assert.equal(narcan.id, "cbdd438d7fbe", "the occurrence ID must remain stable");
  assert.equal(narcan.time, "4:00 PM");
  assert.equal(narcan.endTime, "5:00 PM");
  assert.deepEqual(narcan.sourceAudiences, ["Adults"]);
  assert.equal(classifyAudienceAge(narcan), "adult");
  assert.match(narcan.description, /how to use Narcan/);
  assert.doesNotMatch(narcan.description, /<p>|&nbsp;/);
  // The audience fix belongs to the adapter, not just the September 6 override.
  assert.equal(classifyAudienceAge({ ...narcan, id: "next-occurrence", date: "2026-10-04" }), "adult");
});

test("LibCal's unopened required-registration category reaches the planner through the retained parser", async (t) => {
  const { parseLibCalEvents, normalizePlaywrightEvent } = await import("../playwright-scrapers.mjs");
  const date = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const rows = [{
    id: 17286098, title: "Still Life Drawing @ NUMU", startdt: `${date} 12:00:00`, start: "12:00pm", end: "1:30pm",
    url: "https://losgatosca.libcal.com/event/17286098", location: "NUMU - 106 E. Main St",
    description: "Join our self-guided still life drawing sessions in NUMU's Flick Studio.",
    registration_enabled: false, in_person_registration: true,
    categories: "Adult, Class or Workshop, Registration Required", categories_arr: [{ name: "Registration Required" }],
  }];
  t.mock.method(globalThis, "fetch", () => { throw new Error("offline LibCal parser attempted a request"); });
  const [raw] = parseLibCalEvents(rows, capturedLosGatosLibrary, { today: date });
  const event = normalizePlaywrightEvent(raw);
  assert.equal(event.registration, "required");
  assert.equal(requiresAdvanceRegistration(event), true);
  assert.equal(event.date, date);
  assert.equal(event.time, "12:00 PM");
  assert.equal(event.endTime, "1:30 PM");
});

test("same-day tickets stay distinct from advance registration and ordinary drop-ins", () => {
  const details = libraryEventDetails({ definition: {
    description: "<p>Learn about cats.</p><p>Limited space; tickets at the Information Desk starting at 1 PM.</p>",
  } });
  assert.equal(details.attendanceNote, "Limited space; tickets at the Information Desk starting at 1 PM.");
  assert.equal(requiresAdvanceRegistration(details), false);
  assert.equal(requiresAttendanceConfirmation(details), false);
  assert.equal(libraryEventDetails({ description: "<p>Drop in for board games.</p>" }).attendanceNote, undefined);
});

test("optional appointments retain the drop-in availability caveat through library ingestion", async (t) => {
  // Captured from the October 21 Santa Teresa occurrence. Its unused booking
  // directions name a different branch; preserve only the access caveat.
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-19T14:00:00Z") });
  const { fetchBiblioEvents } = await import("../generate-events.mjs");
  const event = {
    id: "6a7b58a64cb69d003e201978",
    definition: {
      title: "One-On-One Tech Help (English or Tiếng Việt)",
      start: "2026-10-21T10:00", end: "2026-10-21T12:00",
      branchLocationId: "19",
      description: "<p>Free, No Registration Required</p>",
      registrationInfo: {
        provider: null, cap: null, maxSeats: null,
        instructions: "&lt;p&gt;&lt;strong&gt;Appointment recommended&lt;/strong&gt;. Drop-ins subject to availability.&lt;/p&gt;\n&lt;p&gt;To make an appointment, stop by the Vineland Library or call us at 408-808-3000.&lt;/p&gt;",
      },
    },
  };
  const original = structuredClone(event);
  t.mock.method(globalThis, "fetch", async () => Response.json({
    entities: { events: { [event.id]: event }, locations: { "19": { name: "Santa Teresa" } } },
  }));
  const [result] = await fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
  assert.equal(result.date, "2026-10-21");
  assert.equal(result.time, "10:00 AM");
  assert.equal(result.endTime, "12:00 PM");
  assert.equal(result.venue, "Santa Teresa Library");
  assert.equal(requiresAdvanceRegistration(result), false);
  assert.equal(result.registrationClosesBy, undefined);
  assert.equal(result.attendanceNote, "Drop-ins subject to availability.");
  assert.doesNotMatch(result.attendanceNote, /Vineland|408-808-3000|&lt;|<p>/);
  assert.deepEqual(event, original);
});

test("attendanceNote dedupes a ticket sentence repeated across paragraphs", () => {
  // SJPL After-School STEaM at Almaden (sjpl 6a73854af213992f00c9cfdd): the
  // series note and the week's own paragraph both open with the same two
  // sentences; the 2026-09-15 issue printed them twice in the listing meta.
  const description = [
    "<p>Drop in on Tuesday afternoons at 4:30 p.m. for a new STEaM adventure every week.</p>",
    "<p>Free, with limited capacity. Tickets will be distributed starting 60 minutes before the program.</p>",
    "<p>Sep 15 - Build a bridge. Free, with limited capacity. Tickets will be distributed starting 60 minutes before the program. Children younger than age 9 must be accompanied by an adult caregiver during this program.</p>",
  ].join("");
  const { attendanceNote } = libraryEventDetails({ definition: { description } });
  assert.equal(
    attendanceNote,
    "Free, with limited capacity. Tickets will be distributed starting 60 minutes before the program. Sep 15 - Build a bridge. Children younger than age 9 must be accompanied by an adult caregiver during this program.",
  );
});

test("library descriptions decode Latin named entities without dropping accents", () => {
  const { description } = libraryEventDetails({
    description: "<p>&iexcl;Prep&aacute;rate! &Uacute;nete a Jos&eacute; &amp; Pe&ntilde;a.</p>",
  });
  assert.equal(description, "\u00A1Prep\u00E1rate! \u00DAnete a Jos\u00E9 & Pe\u00F1a.");
});

test("Cookbook Club retains Swedish letters from the organizer's encoded recipe name", () => {
  // Los Gatos Library, October 28, 2026, event/17376578. Dropping these
  // entities changed the published food name from smörgåstårta to smrgstrta.
  assert.equal(libraryEventDetails({
    description: '<p>Think a Swedish <a href="https://en.wikipedia.org/wiki/Sm%C3%B6rg%C3%A5st%C3%A5rta">sm&ouml;rg&aring;st&aring;rta</a> or a savory hand pie.</p>',
  }).description, "Think a Swedish smörgåstårta or a savory hand pie.");
  assert.equal(libraryEventDetails({
    description: "<p>&Aring; &Auml; &Ouml; / &aring; &auml; &ouml; / sm&amp;ouml;rg&amp;aring;st&amp;aring;rta</p>",
  }).description, "Å Ä Ö / å ä ö / smörgåstårta");
});

test("inline email fragments retain visible contact text through ingestion", async () => {
  const { polishDescription } = await import("../generate-events.mjs");
  // The October 15 Hillview occurrence links only the first letter, to a
  // different person's mailto. Its visible text and structured contact agree.
  const { description } = libraryEventDetails({ definition: {
    description: '<p>Email Jin Luong at <a href="mailto:marlene.sanchez@sjlibrary.org">j</a>in.luong@sjlibrary.org.</p>',
  } });
  assert.match(description, /jin\.luong@sjlibrary\.org/);
  assert.doesNotMatch(description, /marlene|j in\.luong/);
  assert.match(polishDescription(description), /jin\.luong@sjlibrary\.org/);

  assert.equal(libraryEventDetails({
    description: '<p>Email <span>j</span><em>in</em>.luong@sjlibrary.org</p>',
  }).description, "Email jin.luong@sjlibrary.org");
  // Whitespace and separate blocks are evidence of separate words.
  assert.equal(libraryEventDetails({
    description: '<p>Ask <a>J</a> Smith at jin.luong@sjlibrary.org</p>',
  }).description, "Ask J Smith at jin.luong@sjlibrary.org");
  assert.equal(libraryEventDetails({
    description: '<p>Email <a>j</a> in.luong@sjlibrary.org</p>',
  }).description, "Email j in.luong@sjlibrary.org");
  assert.equal(libraryEventDetails({
    description: '<p>J</p><p>in.luong@sjlibrary.org</p>',
  }).description, "J in.luong@sjlibrary.org");
});

test("LibCal ingestion preserves a real exhausted occurrence through normalization", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-15T14:00:00Z") });
  const { parseLibCalEvents, normalizePlaywrightEvent } = await import("../playwright-scrapers.mjs");
  // Public Mountain View list row captured October 15; the occurrence page
  // independently confirms the date, farm location, and open waiting list.
  // Live collection is retired. Preserve this regression using mocked fetch
  // and a fixture host. No live LibCal source is registered.
  const capturedLibrary = {
    name: "Mountain View Public Library", city: "mountain-view",
    urls: ["https://library.example.test/calendar"],
    address: "585 Franklin St, Mountain View, CA 94041", onsiteLocations: [],
    offsiteAddresses: { "Deer Hollow Farm": "22500 Cristo Rey Dr, Cupertino, CA" },
  };
  const occurrence = {
    id: 16984474, title: "Deer Hollow Spooky Storytime",
    startdt: "2026-10-16 11:00:00", start: "11:00 am", end: "12:00 pm",
    location: "Offsite", online_event: false,
    url: "https://mountainview.libcal.com/event/16984474",
    description: "<p>Together with our friends at Deer Hollow Farm, our librarians will present a spooky-themed storytime at the farm with books, songs, and rhymes.</p><p>Meet us there: Deer Hollow Farm, 22500 Cristo Rey Dr., Cupertino</p>",
    registration_enabled: true,
    seats: 15, seatsleft: 0, seatsleft_multiple: false, waitlist: "Wait list",
    audiences: [{ name: "Preschoolers" }],
  };
  t.mock.method(globalThis, "fetch", () => { throw new Error("offline LibCal parser attempted a request"); });
  const [scraped] = parseLibCalEvents([occurrence], capturedLibrary, { today: "2026-10-15" });
  const event = normalizePlaywrightEvent(scraped);
  assert.equal(event.registration, "full");
  assert.equal(event.date, "2026-10-16");
  assert.equal(event.time, "11:00 AM");
  assert.equal(event.venue, "Deer Hollow Farm");
  // The adapter retains the publisher's city; the final importer resolves
  // the farm's Cupertino address separately.
  assert.equal(event.city, "mountain-view");
  assert.equal(event.url, occurrence.url);
  assert.equal(requiresAdvanceRegistration(event), true);
});
