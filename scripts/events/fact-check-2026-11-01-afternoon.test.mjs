import test from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, fetchInboundEvents, polishDescription } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

// November city newsletter and the linked MVCPA ticket pages independently
// confirm these six occurrences. Evidence: docs/qa/2026-11-01-2107z-fact-check.md.
const performances = [
  ["2026-11-05", "In Your Wildest Dreams with Seraph Brass and the San Francisco Brass Band", "19:30", "797", "music"],
  ["2026-11-06", "NCCO Presents GROOVE with Marcus Roberts Trio", "19:00", "788", "music"],
  ["2026-11-06", "Best of SF Stand-Up Comedy", "20:00", "796", "arts"],
  ["2026-11-07", "Nutcracker in China", "19:30", "790", "arts"],
  ["2026-11-08", "Nutcracker in China (matinee)", "15:00", "790", "arts"],
  ["2026-11-14", "Music in-Takht", "19:00", "795", "music"],
];

const rawPerformance = ([date, title, time], index = 0) => ({
  id: `mvcpa-november-${index}`, title,
  startsAt: `${date}T${time}:00-08:00`, endsAt: null,
  cityKey: "mountain-view",
  location: "Mountain View Center for the Performing Arts, 500 Castro Street, Mountain View, CA 94041",
  sourceUrl: null, canonicalUrl: null,
  description: title.includes("Seraph")
    ? "Seraph Brass performs Anthony DiLorenzo's Chimera. Ticketed."
    : "A ticketed performance at the Mountain View Center for the Performing Arts.",
});

test("November MVCPA newsletter ingestion retains verified ticket links, paid admission and genres", () => {
  const events = fetchInboundEvents({ today: "2026-11-01", events: performances.map(rawPerformance) });
  assert.equal(events.length, performances.length);
  for (const [index, event] of events.entries()) {
    const [date, , , id, category] = performances[index];
    const corrected = applyVerifiedEventFacts(event);
    assert.equal(corrected.url, `https://tickets.mvcpa.com/eventperformances.asp?evt=${id}`);
    assert.equal(corrected.date, date);
    assert.equal(corrected.time, event.time);
    assert.equal(corrected.endTime, null, "do not infer a closing time from a duration or another organizer's calendar");
    assert.equal(corrected.cost, "paid");
    assert.equal(corrected.category, category);
    assert.equal(corrected.city, "mountain-view");
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }
});

test("MVCPA comedy keeps its adult restriction without changing future editions or unrelated sources", () => {
  const events = fetchInboundEvents({ today: "2026-11-01", events: [rawPerformance(performances[2])] });
  const event = applyVerifiedEventFacts({ ...events[0], audienceAge: "all", kidFriendly: true });
  assert.equal(event.audienceAge, "adult");
  assert.equal(event.kidFriendly, false);
  assert.match(event.attendanceNote, /18.*up.*tickets/i);
  for (const registration of ["closed", "full", "appointment-only"]) {
    assert.equal(applyVerifiedEventFacts({ ...event, registration }).registration, registration);
  }
  for (const other of [
    { ...event, date: "2027-11-06", audienceAge: "all", cost: null },
    { ...event, url: "https://example.org/unrelated", audienceAge: "all", cost: null },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("verified MVCPA facts require the dated occurrence and source or named venue", () => {
  for (const [date, title, , id] of performances) {
    const source = { date, title, venue: "Mountain View Center for the Performing Arts", url: "", cost: null };
    assert.equal(applyVerifiedEventFacts(source).url, `https://tickets.mvcpa.com/eventperformances.asp?evt=${id}`);
    for (const other of [
      { ...source, date: date.replace("2026", "2027") },
      { ...source, venue: "Another Theatre" },
      { ...source, url: "https://example.org/unrelated" },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("source-published NCCO, IBD and Anthony DiLorenzo survive title and prose cleanup", () => {
  for (const title of ["NCCO Presents Groove with Marcus Roberts Trio", "Center for IBD and Celiac Disease's Research Symposium"]) {
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
    assert.equal(polishDescription(`Join the ${title}.`), `Join the ${title}.`);
  }
  for (const copy of ["Hear Anthony DiLorenzo's Chimera.", "Hear Anthony Di Lorenzo's Chimera."]) {
    assert.equal(polishDescription(copy), "Hear Anthony DiLorenzo's Chimera.");
  }
  const brass = { date: performances[0][0], title: performances[0][1],
    url: "https://tickets.mvcpa.com/eventperformances.asp?evt=797",
    blurb: "Hear Anthony Di Lorenzo's Chimera.", description: "Anthony Di Lorenzo's world premiere." };
  const corrected = applyVerifiedEventFacts(brass);
  assert.equal(corrected.blurb, "Hear Anthony DiLorenzo's Chimera.");
  assert.equal(corrected.description, "Anthony DiLorenzo's world premiere.");
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  assert.equal(cleanTitle("Ncco and Ibd are mixed-case source names"), "Ncco and Ibd are mixed-case source names");
  assert.equal(cleanTitle("ANNUAL Performance"), "Annual Performance");
});
