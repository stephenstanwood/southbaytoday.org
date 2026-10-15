import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { libraryEventDetails } from "./library-event-details.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { requiresAdvanceRegistration, requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/library-attendance-2026-09-06.json", import.meta.url)));

test("normal library adapters preserve late attendance paragraphs and structured audiences", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-06T12:00:00Z") });
  const { fetchBiblioEvents } = await import("../generate-events.mjs");
  const { scrapeLibCal, normalizePlaywrightEvent } = await import("../playwright-scrapers.mjs");
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

  const [scrapedNarcan] = await scrapeLibCal(null, {
    name: "Los Gatos Library", city: "los-gatos", address: "110 E Main St, Los Gatos, CA 95030",
    urls: ["https://losgatosca.libcal.com"], onsiteLocations: [],
  });
  const narcan = normalizePlaywrightEvent(scrapedNarcan);
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

test("LibCal's unopened required-registration category reaches the planner through the scraper", async (t) => {
  const { scrapeLibCal, normalizePlaywrightEvent } = await import("../playwright-scrapers.mjs");
  const date = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  t.mock.method(globalThis, "fetch", async () => Response.json({ total_results: 1, results: [{
    id: 17286098, title: "Still Life Drawing @ NUMU", startdt: `${date} 12:00:00`, start: "12:00pm", end: "1:30pm",
    url: "https://losgatosca.libcal.com/event/17286098", location: "NUMU - 106 E. Main St",
    description: "Join our self-guided still life drawing sessions in NUMU's Flick Studio.",
    registration_enabled: false, in_person_registration: true,
    categories: "Adult, Class or Workshop, Registration Required", categories_arr: [{ name: "Registration Required" }],
  }] }));
  const [raw] = await scrapeLibCal(null, { name: "Los Gatos Library", city: "los-gatos", urls: ["https://losgatosca.libcal.com"] });
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
  const { scrapeLibCal, normalizePlaywrightEvent, LIBCAL_LIBRARIES } = await import("../playwright-scrapers.mjs");
  // Public Mountain View list row captured October 15; the occurrence page
  // independently confirms the date, farm location, and open waiting list.
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
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    total_results: 1, results: [occurrence],
  }), { headers: { "content-type": "application/json" } }));
  const [scraped] = await scrapeLibCal(null, LIBCAL_LIBRARIES[0]);
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
