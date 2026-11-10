import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { cleanTitle, polishAttendanceNote, polishDescription } from "../generate-events.mjs";
import { isTitleOnlyDescription, polishReviewedEventCopy } from "../../src/lib/south-bay/eventCopyEdits.mjs";
import { eventBlurbCacheKey } from "../../src/lib/south-bay/eventBlurbs.mjs";

// Full before/after copy from the reviewed feed, not expectations constructed
// from the repair table. The original audit and incremental evening/night reviews
// retain complete source copy, attendance conditions, numbers and identifiers.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-29.json", import.meta.url)));
const eveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-29-evening.json", import.meta.url)));
const nightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-29-night.json", import.meta.url)));
const morningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-30.json", import.meta.url)));
const refreshFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-30-morning.json", import.meta.url)));
const middayFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-30-midday.json", import.meta.url)));
const eveningRefreshFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-30-evening.json", import.meta.url)));
const nightRefreshFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-30-night.json", import.meta.url)));
const postRefreshFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-30-post-refresh.json", import.meta.url)));
const october31Fixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-31.json", import.meta.url)));
const storytimeFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-31-storytime.json", import.meta.url)));
const activitiesFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-31-activities.json", import.meta.url)));
const afternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-31-afternoon.json", import.meta.url)));
const lateAfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-31-late-afternoon.json", import.meta.url)));
const october31EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-31-evening.json", import.meta.url)));
const stampClubFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-31-stamp-club.json", import.meta.url)));
const makerStudioFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-31-maker-studio.json", import.meta.url)));
const accessibilityFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-10-31-accessibility.json", import.meta.url)));
const november1Fixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-01.json", import.meta.url)));
const november1PostFactCheckFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-01-post-fact-check.json", import.meta.url)));
const attendanceFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-01-attendance.json", import.meta.url)));
const volunteersFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-01-volunteers.json", import.meta.url)));
const newsletterFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-01-newsletter.json", import.meta.url)));
const afternoonRefreshFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-01-afternoon.json", import.meta.url)));
const november1EveningRefreshFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-01-evening.json", import.meta.url)));
const november2Fixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-02.json", import.meta.url)));
const november2OvernightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-02-overnight.json", import.meta.url)));
const november2MorningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-02-morning.json", import.meta.url)));
const november2AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-02-afternoon.json", import.meta.url)));
const november2EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-02-evening.json", import.meta.url)));
const november2NightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-02-night.json", import.meta.url)));
const november2LateFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-02-late.json", import.meta.url)));
const november3Fixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-03.json", import.meta.url)));
const philosophyFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-03-philosophy.json", import.meta.url)));
const november3AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-03-afternoon.json", import.meta.url)));
const november4OvernightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-04-overnight.json", import.meta.url)));
const november4MorningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-04-morning.json", import.meta.url)));
const november4AttendanceFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-04-attendance.json", import.meta.url)));
const november4MiddayFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-04-midday.json", import.meta.url)));
const november4ClockFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-04-clock.json", import.meta.url)));
const november4AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-04-afternoon.json", import.meta.url)));
const november4EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-04-evening.json", import.meta.url)));
const november4NightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-04-night.json", import.meta.url)));
const november5BrandTitlesFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-05-brand-titles.json", import.meta.url)));
const november5MorningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-05-morning.json", import.meta.url)));
const november5MiddayFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-05-midday.json", import.meta.url)));
const november5AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-05-afternoon.json", import.meta.url)));
const november5EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-05-evening.json", import.meta.url)));
const november5NightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-05-night.json", import.meta.url)));
const november5LateFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-05-late.json", import.meta.url)));
const november6MorningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-06-morning.json", import.meta.url)));
const november6CasingFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-06-casing.json", import.meta.url)));
const november6MiddayFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-06-midday.json", import.meta.url)));
const november6AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-06-afternoon.json", import.meta.url)));
const november6EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-06-evening.json", import.meta.url)));
const november7AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-07-afternoon.json", import.meta.url)));
const november7MarkupFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-07-markup.json", import.meta.url)));
const november7EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-07-evening.json", import.meta.url)));
const november7LateFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-07-late.json", import.meta.url)));
const november8OvernightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-08-overnight.json", import.meta.url)));
const november8MorningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-08-morning.json", import.meta.url)));
const november8AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-08-afternoon.json", import.meta.url)));
const november8LibraryClarityFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-08-library-clarity.json", import.meta.url)));
const november8EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-08-evening.json", import.meta.url)));
const november8NightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-08-night.json", import.meta.url)));
const november9MorningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-09-morning.json", import.meta.url)));
const november9PostRefreshFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-09-post-refresh.json", import.meta.url)));
const november9BilingualFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-09-bilingual.json", import.meta.url)));
const november9LegoFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-09-lego.json", import.meta.url)));
const november9MiddayFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-09-midday.json", import.meta.url)));
const november9PuzzleFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-09-puzzle.json", import.meta.url)));
const november9AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-09-afternoon.json", import.meta.url)));
const november9EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-09-evening.json", import.meta.url)));
const audits = [fixture, eveningFixture, nightFixture, morningFixture, refreshFixture, middayFixture, eveningRefreshFixture, nightRefreshFixture, postRefreshFixture, october31Fixture, storytimeFixture, activitiesFixture, afternoonFixture, lateAfternoonFixture, october31EveningFixture, stampClubFixture, makerStudioFixture, accessibilityFixture, november1Fixture, november1PostFactCheckFixture, attendanceFixture, volunteersFixture, newsletterFixture, afternoonRefreshFixture, november1EveningRefreshFixture, november2Fixture, november2OvernightFixture, november2MorningFixture, november2AfternoonFixture, november2EveningFixture, november2NightFixture, november2LateFixture, november3Fixture, philosophyFixture, november3AfternoonFixture, november4OvernightFixture, november4MorningFixture, november4AttendanceFixture, november4MiddayFixture];
audits.push(november4ClockFixture, november4AfternoonFixture, november4EveningFixture, november4NightFixture);
audits.push(november5BrandTitlesFixture);
audits.push(november5MorningFixture);
audits.push(november5MiddayFixture);
audits.push(november5AfternoonFixture);
audits.push(november5EveningFixture);
audits.push(november5NightFixture);
audits.push(november5LateFixture);
audits.push(november6MorningFixture);
audits.push(november6CasingFixture);
audits.push(november6MiddayFixture);
audits.push(november6AfternoonFixture);
audits.push(november6EveningFixture);
audits.push(november7AfternoonFixture);
audits.push(november7MarkupFixture);
audits.push(november7EveningFixture);
audits.push(november7LateFixture);
audits.push(november8OvernightFixture);
audits.push(november8MorningFixture);
audits.push(november8AfternoonFixture);
audits.push(november8LibraryClarityFixture);
audits.push(november8EveningFixture);
audits.push(november8NightFixture);
audits.push(november9MorningFixture);
audits.push(november9PostRefreshFixture);
audits.push(november9BilingualFixture);
audits.push(november9LegoFixture);
audits.push(november9MiddayFixture);
audits.push(november9PuzzleFixture);
audits.push(november9AfternoonFixture);
audits.push(november9EveningFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-10-brand.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-10-compounds.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-10-punctuation.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-10-reading.json", import.meta.url))));
const reviewedCases = audits.flatMap((audit, auditIndex) => audit.cases.map(row => {
  // A later audit can refine the same complete text. Follow only its captured
  // before/after pair, preserving the earlier audit's original evidence.
  let reviewed = row.reviewed;
  for (const later of audits.slice(auditIndex + 1)) {
    const revision = later.cases.find(candidate => candidate.source === row.source
      && candidate.field === row.field && candidate.refreshed === reviewed);
    if (revision) reviewed = revision.reviewed;
  }
  return { ...row, reviewed };
}));
const latestReviewedCopy = row => reviewedCases.find(candidate => candidate.source === row.source
  && candidate.field === row.field && candidate.refreshed === row.refreshed).reviewed;
const numbers = (text) => text.match(/\d+/g);
const identifiers = (text) => (text.match(/https?:\/\/[^\s]+|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi) || [])
  .map(value => value.replace(/[.,;!?]+$/, ""));

test("evening library grammar and casing retain revised source details and publisher scope", () => {
  const revise = text => text.replaceAll("1-5", "2-7")
    .replaceAll("2nd Friday", "3rd Friday")
    .replaceAll("West Valley Branch Library", "Updated Branch Library")
    .replaceAll("Pearl Avenue Friends", "Updated Branch Friends");
  const suffix = " Registration required; ages 8+; tickets $15. Contact updated@example.org or https://example.org/new-program.";
  for (const row of november9EveningFixture.cases) {
    const original = {
      title: "Updated library program", source: row.source, [row.field]: revise(row.refreshed) + suffix,
      id: "revised-evening-event", date: "2027-01-15", time: "4:00 PM", endTime: "5:30 PM",
      venue: "Updated Branch Library", address: "500 Updated Avenue", city: "san-jose",
      registration: "required", cost: "paid", costNote: "$15", category: "education",
      url: "https://example.org/new-program",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, [row.field]: "New program wording; please register by January 12. Tickets $30." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("afternoon acronyms and list punctuation preserve changed source facts and publisher scope", () => {
  const revise = text => text.replaceAll("November 26, 2026", "November 25, 2027")
    .replaceAll("Thursday, November 26", "Thursday, November 25")
    .replaceAll("$85", "$95").replaceAll("10:30 AM", "11:00 AM")
    .replaceAll("Castlevania", "Metroid").replaceAll("The Legend of Zelda", "Portal 2");
  const suffix = " Register at https://example.org/updated or contact updated@example.org. Ages 16+; tickets $25.";
  for (const row of november9AfternoonFixture.cases) {
    const before = revise(row.refreshed);
    const separator = row.field === "description" && !/[.!?]$/.test(before) ? "." : "";
    const original = {
      title: "Revised public program", source: row.source, [row.field]: before + separator + suffix,
      id: "revised-afternoon-event", date: "2027-11-25", time: "11:00 AM", endTime: "4:00 PM",
      registration: "required", cost: "paid", costNote: "$25", category: "education",
      address: "500 Updated Avenue", url: "https://example.org/updated",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, [row.field]: "New source wording and a new schedule: November 30; $40." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("midday sentence repairs preserve revised fees, attendance details and publisher scope", () => {
  const suffix = " Registration required; ages 8+; contact updated@example.org or https://example.org/revised.";
  for (const row of november9MiddayFixture.cases) {
    const original = {
      source: row.source, description: row.refreshed.replace("$30", "$45") + suffix,
      id: "revised-event", date: "2027-02-13", time: "4:30 PM", endTime: "6:00 PM",
      cost: "paid", costNote: "$45", registration: "required",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, description: row.reviewed.replace("$30", "$45") + suffix });
    assert.deepEqual(numbers(next.description), numbers(original.description));
    assert.deepEqual(identifiers(next.description), identifiers(original.description));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, description: "New workshop and ticket terms; registration closes February 10. Tickets $60." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("bilingual copy repairs preserve revised hours, contacts, attendance and publisher scope", () => {
  const revise = text => text.replaceAll("3:30 PM", "1:15 PM")
    .replaceAll("4:30 PM", "2:45 PM").replaceAll("5:30 PM", "4:00 PM")
    .replaceAll("(408) 294-1237", "(650) 321-9876").replaceAll("408-808-3070", "650-321-7654")
    .replaceAll("sizes from XS-XL", "sizes from S to L").replaceAll("sizes from XS to XL", "sizes from S to L");
  const suffix = " Registration required; ages 16+; tickets $12. Contact revised@example.org or https://example.org/revised.";
  for (const row of november9BilingualFixture.cases) {
    const event = {
      source: row.source, description: revise(row.refreshed) + suffix,
      id: "revised-bilingual-event", date: "2026-12-11", time: "1:15 PM", endTime: "4:00 PM",
      cost: "low", costNote: "$12", registration: "required",
    };
    const next = polishReviewedEventCopy({ ...event, description: polishDescription(event.description) });
    assert.deepEqual(next, { ...event, description: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next.description), numbers(event.description));
    assert.deepEqual(identifiers(next.description), identifiers(event.description));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...event, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("SCU room spacing preserves changed venue details and publisher scope", () => {
  const original = {
    source: "Santa Clara University", venue: "St.Clare Room, Learning Commons, Floor 3",
    id: "revised-event", date: "2026-12-10", time: "4:15 PM", cost: "paid", costNote: "$25",
    address: "500 El Camino Real", url: "https://events.scu.edu/revised",
  };
  assert.deepEqual(polishReviewedEventCopy(original), {
    ...original, venue: "St. Clare Room, Learning Commons, Floor 3",
  });
  for (const venue of ["St.Clareton Room", "St.Clare Hall", "St. Clare Room, New Building"])
    assert.deepEqual(polishReviewedEventCopy({ ...original, venue }), { ...original, venue });
  const otherPublisher = { ...original, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
});

test("afternoon copy repairs preserve revised facts, contacts, and publisher scope", () => {
  for (const row of november8AfternoonFixture.cases) {
    const suffix = " Ages 12+; tickets $25. Contact updated@example.org or visit https://example.org/revised.";
    const original = {
      source: row.source, [row.field]: row.refreshed + suffix,
      id: "revised-event", date: "2026-12-10", time: "4:15 PM", endTime: "5:30 PM",
      registration: "required", cost: "paid", costNote: "$25",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: row.reviewed + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
  const revisedSchedule = {
    source: "San Jose Public Library", description: "Note: No session on 4th Thursday of the month.",
  };
  assert.deepEqual(polishReviewedEventCopy(revisedSchedule), revisedSchedule);
});

test("bridge casing and STEM punctuation preserve revised facts and publisher scope", () => {
  for (const row of november8MorningFixture.cases) {
    const original = {
      source: row.source, description: row.refreshed + " Ages 12+; tickets $25. Register at https://example.org/revised or email updated@example.org.",
      date: "2026-12-10", time: "4:15 PM", endTime: "5:30 PM", registration: "required", cost: "paid",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, description: row.reviewed + " Ages 12+; tickets $25. Register at https://example.org/revised or email updated@example.org." });
    assert.deepEqual(numbers(next.description), numbers(original.description));
    assert.deepEqual(identifiers(next.description), identifiers(original.description));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
  const namedBridge = { source: "San Jose Public Library", description: "Learn about the Golden Gate Bridge. A guest named Bridge will speak." };
  assert.deepEqual(polishReviewedEventCopy(namedBridge), namedBridge);
});

test("ukulele capitalization preserves revised session details and publisher scope", () => {
  const row = november8OvernightFixture.cases[0];
  const revise = text => text.replaceAll("November 10", "December 8")
    .replaceAll("November 17", "December 15").replaceAll("1-hour", "2-hour")
    .replaceAll("ages 10", "ages 12");
  const suffix = " Contact updated@example.org. Register at https://example.org/new-session.";
  const original = { ...row.events[0], date: "2026-12-08", time: "4:00 PM",
    registration: "required", cost: "free", description: revise(row.refreshed) + suffix };
  const next = polishReviewedEventCopy(original);
  assert.deepEqual(next, { ...original, description: revise(row.reviewed) + suffix });
  assert.equal(next.description.toLowerCase(), original.description.toLowerCase());
  assert.deepEqual(polishReviewedEventCopy(next), next);
  const otherPublisher = { ...original, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
});

test("late library copy repairs preserve changed hours, lateness limits, contacts and publisher scope", () => {
  const revise = text => text.replaceAll("11:00 a.m.", "10:30 a.m.")
    .replaceAll("5:00 p.m.", "4:45 p.m.").replaceAll("15-minute", "25-minute")
    .replaceAll("10 minutes late", "5 minutes late").replaceAll("$20", "$30")
    .replaceAll("408-808-3043", "650-555-0199")
    .replaceAll("je.sjpl@sjlibrary.org", "updated@example.org");
  const suffix = " Registration required; ages 12+; tickets $25. See https://example.org/updated.";
  for (const row of november7LateFixture.cases) {
    const original = {
      source: row.source, [row.field]: revise(row.refreshed) + suffix,
      id: "revised-library-event", date: "2026-12-10", time: "10:30 AM",
      endTime: "4:45 PM", registration: "required", cost: "paid", costNote: "$25",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("registration punctuation preserves a continuation and an existing sentence ending", () => {
  for (const description of [
    "To register, please call 650-555-0199 or email updated@example.org or register online.",
    "To register, please call 650-555-0199 or email updated@example.org.",
    "To register, please call 650-555-0199 or email updated@example.org. Registration is required.",
  ]) {
    const event = { source: "San Jose Public Library", description };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("library demo and reading repairs preserve revised limits, contacts and publisher scope", () => {
  const revise = text => text.replaceAll("20 minute", "35 minute").replaceAll("20-minute", "35-minute")
    .replaceAll("6-12", "8-14").replaceAll("6 a 12", "8 a 14")
    .replaceAll("ask@lib.sccgov.org", "updated@example.org")
    .replaceAll("(408) 540-3945", "(650) 555-0199");
  const suffix = " Registration required; tickets $25. See https://example.org/updated.";
  for (const row of november7EveningFixture.cases) {
    const original = {
      source: row.source, description: revise(row.refreshed) + suffix,
      id: "revised-library-event", date: "2026-12-10", time: "2:15 PM",
      endTime: "3:00 PM", registration: "required", cost: "paid", costNote: "$25",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, description: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next.description), numbers(original.description));
    assert.deepEqual(identifiers(next.description), identifiers(original.description));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("markup repairs preserve revised appointments, contacts, notices and publisher scope", () => {
  const revise = text => text.replaceAll("350-3239", "350-9876")
    .replaceAll("8 AM-5 PM", "9 AM-4 PM").replaceAll("Room 201A", "Room 302B")
    .replaceAll("HICAP's goal is to inform and educate", "HICAP's updated goal is to inform and educate");
  const suffix = " Registration required; ages 18+; contact updated@example.org. See https://example.org/new.";
  for (const row of november7MarkupFixture.cases) {
    const original = {
      source: row.source, description: revise(row.refreshed) + suffix,
      id: "revised-markup-event", date: "2026-12-04", time: "11:45 AM",
      endTime: "1:00 PM", registration: "appointment-only", cost: "free",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, description: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next.description), numbers(original.description));
    assert.deepEqual(identifiers(next.description), identifiers(original.description));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("markup repairs preserve footnotes, literal names and incomplete emphasis", () => {
  const examples = [
    { source: "San Jose Public Library", description: "Free referrals*. *Disclaimer: No case management is provided. *Aviso: No se ofrece gestión de casos." },
    { source: "San Jose Public Library", description: "** HICAP Counselors have updated their notice." },
    { source: "Santa Clara County Library", description: "Meet every second Tuesday of the month*. Exceptions: November 17; December 8." },
    { source: "San Jose Theaters", description: "Ha*Ash performs on December 26. Tickets go on sale October 23." },
  ];
  for (const event of examples) assert.deepEqual(polishReviewedEventCopy(event), event);
});

test("November 7 grammar repairs preserve revised counts, schedules, contacts and publisher scope", () => {
  const revise = text => text.replaceAll("10 teams", "8 teams")
    .replaceAll("4 people", "3 people").replaceAll("500-piece", "300-piece")
    .replaceAll("2 hour mark", "3 hour mark").replaceAll("2-hour mark", "3-hour mark")
    .replaceAll("November 13th", "December 4th").replaceAll("10:30 am", "11:45 am");
  const suffix = " Registration required; ages 12+; tickets $25. Contact updated@example.org. See https://example.org/new.";
  for (const row of november7AfternoonFixture.cases) {
    const original = {
      source: row.source, description: revise(row.refreshed) + suffix,
      id: "revised-source-event", date: "2026-12-04", time: "11:45 AM",
      endTime: "1:00 PM", registration: "required", cost: "paid", costNote: "$25",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, description: revise(latestReviewedCopy(row)) + suffix });
    assert.deepEqual(numbers(next.description), numbers(original.description));
    assert.deepEqual(identifiers(next.description), identifiers(original.description));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("evening library copy repairs preserve new schedules, grade ranges and publisher scope", () => {
  const revise = text => text.replaceAll("2nd and 4th Tuesdays", "1st and 3rd Thursdays")
    .replaceAll("K-6", "K-8").replaceAll("ages 5-12", "ages 6-14");
  const suffix = " Registration required; ages 12+; $25. Contact updated@example.org. See https://example.org/new.";
  for (const row of november6EveningFixture.cases) {
    const original = {
      source: row.source, [row.field]: revise(row.refreshed) + suffix,
      id: "revised-source-event", date: "2026-12-03", time: "10:45 AM",
      endTime: "12:00 PM", registration: "required", cost: "paid", costNote: "$25",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(latestReviewedCopy(row)) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("afternoon copy repairs preserve revised source facts and publisher scope", () => {
  for (const row of november6AfternoonFixture.cases) {
    const revise = text => text.replaceAll("first Friday", "second Saturday")
      .replaceAll("9:30 AM", "10:45 AM")
      .replaceAll("Kenneth Nacario Lee", "Dr. Updated Speaker");
    const suffix = row.field === "title" ? "" : " Registration required; ages 12+; $25. Contact updated@example.org. See https://example.org/new.";
    const original = {
      source: row.source, [row.field]: revise(row.refreshed) + suffix,
      id: "revised-source-event", date: "2026-12-12", time: "10:45 AM",
      endTime: "12:00 PM", registration: "required", cost: "paid", costNote: "$25",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("screening grammar and workshop separators preserve revised facts and publisher scope", () => {
  const revise = text => text.replaceAll("November", "December")
    .replaceAll("6th", "4th").replaceAll("20th", "18th")
    .replaceAll("4:00 p.m.", "2:15 p.m.").replaceAll("5:00 p.m.", "3:45 p.m.")
    .replaceAll("December 1989", "December 1990");
  const suffix = " Ages 12+; tickets $25. Register by 12/1 at https://example.org/new or updated@example.org.";
  for (const row of november6MiddayFixture.cases) {
    const original = {
      source: row.source, description: revise(row.refreshed) + suffix,
      id: "revised-source-event", date: "2026-12-04", time: "2:15 PM",
      endTime: "3:45 PM", registration: "required", cost: "paid", costNote: "$25",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, description: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next.description), numbers(original.description));
    assert.deepEqual(identifiers(next.description), identifiers(original.description));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("supervision grammar preserves a revised strict age threshold and publisher scope", () => {
  const original = {
    source: "San Jose Public Library", date: "2026-12-12", registration: "required",
    description: "Parents must supervise children under 9 and younger. Ages 9+; $25. Contact updated@example.org.",
  };
  const next = polishReviewedEventCopy(original);
  assert.deepEqual(next, { ...original,
    description: "Parents must supervise children under 9. Ages 9+; $25. Contact updated@example.org.",
  });
  assert.deepEqual(numbers(next.description), numbers(original.description));
  assert.deepEqual(identifiers(next.description), identifiers(original.description));
  assert.deepEqual(polishReviewedEventCopy(next), next);
  const otherPublisher = { ...original, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  const revised = { ...original, description: "Parents must supervise children 9 and younger. Registration required." };
  assert.deepEqual(polishReviewedEventCopy(revised), revised);
});

test("residency punctuation preserves revised household limits and publisher scope", () => {
  const row = november5LateFixture.cases[0];
  const revise = text => text.replace("five bags", "eight bags").replace("3:00 p.m.", "4:30 p.m.");
  const suffix = " Registration required; ages 18+; $25. Contact updated@example.org.";
  const original = {
    source: row.source, description: revise(row.refreshed) + suffix,
    id: "revised-shredding-event", date: "2026-12-12", time: "9:00 AM", endTime: "4:30 PM",
    cost: "low", costNote: "$25",
  };
  const next = polishReviewedEventCopy(original);
  assert.deepEqual(next, { ...original, description: revise(row.reviewed) + suffix });
  assert.deepEqual(numbers(next.description), numbers(original.description));
  assert.deepEqual(identifiers(next.description), identifiers(original.description));
  assert.deepEqual(polishReviewedEventCopy(next), next);
  const otherPublisher = { ...original, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
});

test("evening copy repairs preserve revised source facts, new details and publisher scope", () => {
  const revise = text => text.replaceAll("$100", "$150")
    .replaceAll("November 22", "November 25").replaceAll("Noviembre 22", "Noviembre 25")
    .replaceAll("November 14", "November 21").replaceAll("10 to 11 a.m.", "9 to 10 a.m.")
    .replaceAll("10350 Torre Ave", "10360 Torre Ave").replaceAll("CA 95014", "CA 95015")
    .replaceAll("K to 5", "K to 6").replaceAll("Vyoma Bhanap", "Updated Dancer")
    .replaceAll("2:00 PM - 2:45 PM", "2:15 PM - 3:00 PM");
  const suffix = " Registration required; ages 12+; $25. Contact updated@example.org. See https://example.org/new.";
  for (const row of november5EveningFixture.cases) {
    const otherPublisher = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const original = { source: row.source, [row.field]: revise(row.refreshed) + suffix,
      id: "revised-source-id", date: "2026-12-12", time: "4:00 PM", costNote: "$25" };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
  }
});

test("dance schedule separators survive dot-formatted source clocks on the first refresh", () => {
  const row = november5EveningFixture.cases.find(row => row.events.some(event => event.id === "sccl-6acea9ef9dbc2b002c8e679d"));
  const original = {
    ...row.events[0],
    date: "2026-11-07", time: "12:50 PM", endTime: "4:45 PM", cost: "free",
    description: row.refreshed.replaceAll(/(\d{1,2}):(\d{2})(?= [AP]M)/g, "$1.$2"),
  };
  const next = polishReviewedEventCopy({ ...original, description: polishDescription(original.description) });
  assert.deepEqual(next, { ...original, description: row.reviewed });
  assert.deepEqual(numbers(next.description), numbers(original.description));
  assert.deepEqual(polishReviewedEventCopy(next), next);
});

test("tech-help copy repairs preserve revised contacts and later attendance conditions", () => {
  const original = {
    source: "San Jose Public Library", id: "revised-tech-session",
    date: "2026-12-14", time: "4:15 PM", cost: "low", costNote: "$25",
    description: "BY Appointment Only Do you need help? Registration Required. Availibility IS NOT Guaranteed. For more information or to make an appointment, please call the branch at (650) 555-0123 or email Updated.Contact+help@example.org Registration required; ages 12+; $25. See https://example.org/new-session.",
  };
  const expected = {
    ...original,
    description: "By appointment only. Do you need help? Registration required. Availability is not guaranteed. For more information or to make an appointment, please call the branch at (650) 555-0123 or email Updated.Contact+help@example.org. Registration required; ages 12+; $25. See https://example.org/new-session.",
  };
  const next = polishReviewedEventCopy(original);
  assert.deepEqual(next, expected);
  assert.deepEqual(polishReviewedEventCopy(next), expected);
  assert.deepEqual(numbers(next.description), numbers(original.description));
  assert.deepEqual(identifiers(next.description), identifiers(original.description));
  const otherPublisher = { ...original, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  const revised = { ...original, description: "Appointments are no longer needed. Walk-ins welcome; call (650) 555-0199." };
  assert.deepEqual(polishReviewedEventCopy(revised), revised);
});

test("midday copy repairs preserve publisher scope and new source information", () => {
  for (const row of november5MiddayFixture.cases) {
    const otherPublisher = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const revise = text => text.replace("Philadelphia Flyers", "Boston Bruins")
      .replace("Friday", "Sunday");
    const suffix = " Registration required; ages 12+; $25. Contact updated@example.org.";
    const event = { source: row.source, [row.field]: revise(row.refreshed) + suffix };
    const next = polishReviewedEventCopy(event);
    assert.deepEqual(next, { ...event, [row.field]: revise(row.reviewed) + suffix });
  }
});

test("complete title echoes ignore accents but retain any added source information", () => {
  const event = {
    id: "sjsu-996707af83523fc9", source: "SJSU Events",
    title: "Football - San José State vs. Northern Illinois",
    description: "Football - San Jose State vs. Northern Illinois",
    date: "2026-11-14", time: "12:30 PM", cost: "paid",
  };
  assert.equal(isTitleOnlyDescription(event.title, event.description), true);
  assert.equal(isTitleOnlyDescription("Resume", "Résumé"), false);
  assert.equal(isTitleOnlyDescription("San Jose Stories", " SAN JOSÉ  STORIES "), true);
  assert.deepEqual(polishReviewedEventCopy(event), { ...event, description: "" });
  for (const description of [
    event.description + ". Registration required; ages 12+; $25.",
    "Football - San Jose State vs. Fresno State",
    "", null,
  ]) {
    const revised = { ...event, description };
    assert.equal(isTitleOnlyDescription(event.title, description), false);
    assert.deepEqual(polishReviewedEventCopy(revised), revised);
  }
});

test("OneInMath grammar preserves source conditions and does not affect other publishers", () => {
  const description = "Student can progress at their own pace in a welcoming and supportive learning environment. Registration is required. Visit the OneInMath website to register. You may be asked to provide personal information to sign up. Please review OneInMath's Privacy Policy before registering. Request an ADA accommodations for this event. Ages 5-8; $10. Contact updated@example.org.";
  const event = { source: "San Jose Public Library", description, date: "2026-12-13", registration: "required" };
  const reviewed = { ...event, description: description.replace("Student can", "Students can")
    .replace("Request an ADA accommodations", "Request ADA accommodations") };
  assert.deepEqual(polishReviewedEventCopy(event), reviewed);
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
  assert.deepEqual(numbers(reviewed.description), numbers(description));
  assert.deepEqual(identifiers(reviewed.description), identifiers(description));
  const otherPublisher = { ...event, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
});

test("night copy repairs retain updated source facts, later instructions and publisher scope", () => {
  const revised = text => text.replaceAll("November 8", "November 10")
    .replaceAll("November 20", "November 21").replaceAll("December 13", "December 14")
    .replaceAll("December 18", "December 19").replaceAll("7-12", "8-13")
    .replaceAll("6-12", "7-13").replaceAll("10-17", "11-18")
    .replaceAll("8+", "9+").replaceAll("FOR 8", "FOR 10")
    .replaceAll("only 8 participants", "only 10 participants");
  const suffix = " Registration required. Ages 12+; $25. Contact updated@example.org.";
  for (const row of november4NightFixture.cases) {
    const otherPublisher = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const original = { source: row.source, [row.field]: revised(row.refreshed) + suffix,
      id: "new-source-id", date: "2026-12-12", time: "4:00 PM", costNote: "$25" };
    // A former title echo becomes substantive when the publisher appends new
    // attendance instructions. It must remain rather than being cleared.
    // Later copy-desk captures can refine this historical wording.
    const latest = reviewedCases.find(candidate => candidate.source === row.source
      && candidate.field === row.field && candidate.refreshed === row.refreshed).reviewed;
    const reviewed = latest === "" ? row.refreshed : latest;
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revised(reviewed) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
  }
});

test("evening punctuation repairs preserve revised facts, contacts and publisher scope", () => {
  for (const row of november4EveningFixture.cases) {
    const otherPublisher = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    if (row.field !== "description") continue;
    const suffix = " Registration required. Ages 12+; $25. Contact updated@example.org.";
    const revised = text => text.replaceAll("3-6", "4-7")
      .replaceAll("7–14", "8–15").replaceAll("$20", "$30")
      .replaceAll("408-808-3075", "408-555-0199")
      .replaceAll("sarah.kishler@sjlibrary.org", "updated@example.org");
    const original = { source: row.source, description: revised(row.refreshed) + suffix, time: "4:00 PM", costNote: "$30" };
    const next = polishReviewedEventCopy(original);
    // The later registration-sentence repair also punctuates a new contact.
    const reviewed = revised(row.reviewed).replace(/email updated@example\.org$/, "email updated@example.org.");
    assert.deepEqual(next, { ...original, description: reviewed + suffix });
    assert.deepEqual(numbers(next.description), numbers(original.description));
    assert.deepEqual(identifiers(next.description), identifiers(original.description));
  }
});

test("winery title punctuation follows revised hours and preserves a later named guest", () => {
  const event = { source: "Mountain Winery", title: "Puppies & Pinot: Santa Paws Edition with 10am-2pm" };
  assert.deepEqual(polishReviewedEventCopy(event), { ...event, title: "Puppies & Pinot: Santa Paws Edition (10 AM-2 PM)" });
  const complete = { ...event, title: "Puppies & Pinot: Santa Paws Edition with a local rescue, 10am-2pm" };
  assert.deepEqual(polishReviewedEventCopy(complete), complete);
});

test("library clock punctuation preserves revised times, prices, contacts and publisher scope", () => {
  const description = "Doors at 12.45 PM; dance at 1.15 pm. Tickets $12.50; ages 5-12. Register by 11/15 at https://example.org/v1.25 or New.Name@example.org.";
  const original = {
    source: "Santa Clara County Library", description,
    time: "12:45 PM", endTime: "2:30 PM", cost: "low", costNote: "$12.50",
  };
  const next = polishReviewedEventCopy(original);
  assert.equal(next.description,
    "Doors at 12:45 PM; dance at 1:15 pm. Tickets $12.50; ages 5-12. Register by 11/15 at https://example.org/v1.25 or New.Name@example.org.");
  assert.equal(original.description, description);
  assert.deepEqual(numbers(next.description), numbers(description));
  assert.deepEqual(identifiers(next.description), identifiers(description));
  assert.deepEqual({ ...next, description: null }, { ...original, description: null });
  assert.deepEqual(polishReviewedEventCopy(next), next);
  const otherPublisher = { ...original, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
});

test("midday copy repairs retain revised schedules, contacts and later source conditions", () => {
  for (const row of november4MiddayFixture.cases) {
    const suffix = " Registration required. Ages 12+; $25. Contact updated@example.org.";
    const fresh = row.refreshed
      .replace("9:00-9:30 Team formation", "9:15-9:45 Team formation")
      .replace("(408) 540-3947 7", "(408) 555-0199")
      .replaceAll("ask@lib.sccgov.org", "updated@example.org") + suffix;
    const original = { source: row.source, [row.field]: fresh, time: "9:15 AM", cost: "low", costNote: "$25" };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(numbers(next[row.field]), numbers(fresh));
    assert.deepEqual(identifiers(next[row.field]), identifiers(fresh));
    assert.ok(next[row.field].endsWith(suffix));
    assert.deepEqual({ ...next, [row.field]: null }, { ...original, [row.field]: null });
    assert.deepEqual(polishReviewedEventCopy(next), next);
  }
});

test("attendance sentence endings preserve changed contacts, qualifiers and publisher scope", () => {
  for (const row of november4AttendanceFixture.cases) {
    const otherPublisher = { source: "Different publisher", attendanceNote: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const extended = {
      source: row.source,
      attendanceNote: row.refreshed + (row.refreshed.endsWith("guaranteed")
        ? " until you receive confirmation."
        : " or register online by 11/5/26."),
    };
    assert.deepEqual(polishReviewedEventCopy(extended), extended);
    const followingSentence = {
      source: row.source,
      attendanceNote: row.refreshed + " Registration opens on 11/5/26.",
    };
    assert.deepEqual(polishReviewedEventCopy(followingSentence), {
      ...followingSentence,
      attendanceNote: row.reviewed + " Registration opens on 11/5/26.",
    });
    if (row.refreshed.includes("@")) {
      const changedContact = {
        source: row.source,
        attendanceNote: row.refreshed.replace(/[\w.]+@[\w.]+/g, "updated@example.org"),
      };
      assert.deepEqual(polishReviewedEventCopy(changedContact), changedContact);
    }
  }
});

test("philosophy typo repair preserves publisher scope and revised wording", () => {
  const row = philosophyFixture.cases[0];
  const markupRow = november7MarkupFixture.cases.find(candidate => candidate.refreshed === row.reviewed);
  assert.ok(markupRow, "the later audit captures the complete wording after the typo repair");
  const otherPublisher = { source: "Different publisher", description: row.refreshed };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  const revised = {
    source: row.source,
    description: row.refreshed.replace("It is impossible to leave the pleasant life", "It is impossible to enjoy a pleasant life"),
  };
  assert.deepEqual(polishReviewedEventCopy(revised), {
    ...revised,
    description: markupRow.reviewed.replace("It is impossible to live the pleasant life", "It is impossible to enjoy a pleasant life"),
  });
  const suffix = " Registration required. Ages 12+; $25. Contact updated@example.org.";
  const extended = { source: row.source, description: row.refreshed + suffix };
  assert.deepEqual(polishReviewedEventCopy(extended), { ...extended, description: markupRow.reviewed + suffix });
});

test("November grammar repairs preserve other publishers and later source instructions", () => {
  for (const row of [...november1Fixture.cases, ...november1PostFactCheckFixture.cases, ...attendanceFixture.cases, ...volunteersFixture.cases, ...newsletterFixture.cases, ...afternoonRefreshFixture.cases, ...november1EveningRefreshFixture.cases, ...november2Fixture.cases, ...november2OvernightFixture.cases, ...november2MorningFixture.cases, ...november2AfternoonFixture.cases, ...november2EveningFixture.cases, ...november2NightFixture.cases, ...november2LateFixture.cases, ...november3Fixture.cases, ...november3AfternoonFixture.cases, ...november4OvernightFixture.cases, ...november4MorningFixture.cases, ...november4MiddayFixture.cases, ...november4AfternoonFixture.cases]) {
    const otherPublisher = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const suffix = " Registration required. Ages 12+; $25. Contact updated@example.org.";
    const event = { source: row.source, [row.field]: row.refreshed + suffix };
    // Earlier captures can receive a later reviewed grammar repair. Use the
    // final approved wording while preserving the new source instructions.
    const reviewed = reviewedCases.find(candidate => candidate.source === row.source
      && candidate.field === row.field && candidate.refreshed === row.refreshed).reviewed;
    assert.deepEqual(polishReviewedEventCopy(event), { ...event, [row.field]: reviewed + suffix });
  }
});

test("storytime and accessibility punctuation preserves publisher scope and updated instructions", () => {
  for (const row of accessibilityFixture.cases) {
    const event = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
  const storytime = {
    source: "San Jose Public Library",
    description: "Hora de cuentos 10:15 - 10:45 am; Stay & Play: 10:45 - 11:15 am. Registration required.",
  };
  assert.deepEqual(polishReviewedEventCopy(storytime), {
    ...storytime,
    description: "Hora de cuentos: 10:15 - 10:45 am; Stay & Play: 10:45 - 11:15 am. Registration required.",
  });
  const updated = {
    source: "Santa Clara County Library",
    description: "For accessibility accommodations (ex. CART), call (408) 555-0199 at least 14 days ahead. ASL is available on request.",
  };
  assert.deepEqual(polishReviewedEventCopy(updated), updated);
});

test("maker studio and craft repairs preserve other publishers' copy", () => {
  for (const row of makerStudioFixture.cases) {
    const event = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("sugar skull punctuation does not alter an expanded source schedule", () => {
  const row = makerStudioFixture.cases.find(candidate => candidate.refreshed.endsWith("3:30 - 5:30 PM"));
  const event = { source: row.source, description: `${row.refreshed}; supplies are limited.` };
  assert.deepEqual(polishReviewedEventCopy(event), event);
});

test("activity blurb repairs leave other publishers' wording unchanged", () => {
  for (const row of activitiesFixture.cases) {
    const event = { source: "Different publisher", blurb: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("afternoon copy repairs leave other publishers' wording unchanged", () => {
  for (const row of afternoonFixture.cases) {
    const event = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

for (const row of reviewedCases) {
  for (const occurrence of row.events) {
    test(`refresh retains reviewed ${row.field}: ${occurrence.id}`, () => {
      // Replay each field with its other copy already reviewed. Historical
      // description/blurb evidence keeps the old title; the title's own case
      // separately replays that original spelling from source.
      const reviewedTitle = reviewedCases.find(candidate => candidate.field === "title"
        && candidate.source === row.source && candidate.refreshed === occurrence.title)?.reviewed
        ?? occurrence.title;
      const original = {
        ...occurrence, title: reviewedTitle, source: row.source,
        date: "2026-11-01", time: "3:30 PM", endTime: "5:00 PM",
        cost: "low", costNote: "$75", attendanceNote: "Registration required; 30 tickets.",
        [row.field]: row.refreshed,
      };
      const untouched = structuredClone(original);
      const refresh = () => polishReviewedEventCopy({
        ...original,
        [row.field]: row.field === "description" ? polishDescription(row.refreshed)
          : row.field === "title" ? cleanTitle(row.refreshed)
          : row.field === "attendanceNote" ? polishAttendanceNote(row.refreshed) : row.refreshed,
      });
      for (let pass = 0; pass < 3; pass++) {
        // Each refresh starts from source/cached copy again, not its output.
        const next = refresh();
        assert.equal(next[row.field], row.reviewed);
        assert.deepEqual(numbers(next[row.field]), numbers(row.refreshed));
        assert.deepEqual(identifiers(next[row.field]), identifiers(row.refreshed));
        assert.deepEqual({ ...next, [row.field]: null }, { ...original, [row.field]: null });
        assert.deepEqual(polishReviewedEventCopy(next), next, "approved copy remains stable");
      }
      assert.deepEqual(original, untouched, "caller/source snapshot is not mutated");
    });
  }
}

test("raw Playwright source spacing and casing are repaired on the first pass", () => {
  for (const { event, reviewed } of fixture.rawSources) {
    assert.equal(polishReviewedEventCopy({ ...event, description: polishDescription(event.description) }).description, reviewed, event.id);
  }
});

test("cache hits receive the same final repair without model generation", async (t) => {
  // Import the real resolver beside an isolated captured cache. This stays
  // valid after the October events age out of the live feed/cache.
  const sandbox = mkdtempSync(join(tmpdir(), "sbt-copy-cache-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  for (const file of ["eventBlurbs.mjs", "eventSourceFacts.mjs", "eventFilters.mjs"]) {
    mkdirSync(join(sandbox, "src/lib/south-bay"), { recursive: true });
    cpSync(join(repo, "src/lib/south-bay", file), join(sandbox, "src/lib/south-bay", file));
  }
  mkdirSync(join(sandbox, "scripts/lib"), { recursive: true });
  cpSync(join(repo, "scripts/lib/io.mjs"), join(sandbox, "scripts/lib/io.mjs"));
  mkdirSync(join(sandbox, "src/data/south-bay"), { recursive: true });
  writeFileSync(join(sandbox, "src/data/south-bay/event-blurb-cache.json"), JSON.stringify(fixture.cachedSource.cache));
  symlinkSync(join(repo, "node_modules"), join(sandbox, "node_modules"), "dir");
  const { resolveEventBlurbs } = await import(pathToFileURL(join(sandbox, "src/lib/south-bay/eventBlurbs.mjs")));
  const event = { ...fixture.cachedSource.event };
  assert.equal(event.source, "NHL");
  const key = eventBlurbCacheKey(event);
  delete event.blurb;
  for (let pass = 0; pass < 2; pass++) {
    const fresh = { ...event };
    const stats = await resolveEventBlurbs([fresh], { enabled: false });
    assert.equal(stats.cache_hits, 1);
    assert.equal(stats.generated, 0);
    assert.equal(eventBlurbCacheKey(fresh), key, "grammar does not invalidate source-text cache identity");
    const next = polishReviewedEventCopy(fresh);
    assert.equal(next.blurb, "Watch the Sharks skate against the Oilers at SAP Center.");
  }
});

test("new source facts and copy replace old wording without an event-ID restore", () => {
  const source = {
    id: "c969bb78abcf", source: "Linden Tree Books",
    description: "New workshop with Jane Li. Ages 12-15; 60 minutes; $95. Bring paper. Email New.Name@example.org.",
    url: "https://example.org/event?price=95", date: "2027-01-12", costNote: "$95",
  };
  assert.deepEqual(polishReviewedEventCopy(source), source);
  const phrase = { ...source, description: "Materials (paper, pens, etc) will be provided. Ages 12-15; 60 minutes; $95." };
  assert.equal(polishReviewedEventCopy(phrase).description,
    "Materials (paper, pens, etc.) will be provided. Ages 12-15; 60 minutes; $95.");
  const otherSource = { ...phrase, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherSource), otherSource);
});

test("a substantive replacement description mentioning a former title echo survives", () => {
  for (const description of ["The Music of ABBA returns with a new ensemble. Tickets $55.", "RSVP Lowrider Art Showcase opens at 10 AM."]) {
    const event = { source: "Montalvo Arts Center", description };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("the diya title repair preserves new titles and other publishers", () => {
  for (const event of [
    { source: "City Newsletter", title: "Celebrate Diwali by Painting Diyas" },
    { source: "City Newsletter", title: "Celebrate Diwali by Painting Diya Designs" },
    { source: "Different publisher", title: "Celebrate Diwali by Painting Diya" },
  ]) {
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("a revised grammatical subject does not inherit a previous pronoun repair", () => {
  for (const [source, description] of [
    ["Gamble Garden", "One of Gamble Garden's most talented gardeners will lead the tour."],
    ["Santa Clara County Library", "Families learn the steps required to secure their future and avoid mistakes."],
    ["Santa Clara County Library", "You will gain the know-how to make your own at home!"],
  ]) {
    const event = { source, description };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("complete accommodation directions survive the truncated-suffix repair", () => {
  const description = "Library storytime. To request an accommodation under the Americans with Disabilities Act for library-sponsored events, please visit https://www.sjpl.org/accessibility.";
  const event = { source: "San Jose Public Library", description };
  assert.deepEqual(polishReviewedEventCopy(event), event);
  const otherPublisher = { source: "Different publisher", description: "Library storytime. To request an accommodation under the Americans with Disabilities Act for library-sponsored events, please visit" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
});

test("contact punctuation repairs preserve later source instructions and address changes", () => {
  for (const [source, description] of [
    ["Santa Clara County Library", "For assistance, email us at ask@lib.sccgov.org or call (408) 540-3945. Register 7 days ahead."],
    ["Santa Clara County Library", "For assistance, email us at ask@sccl.org. New accessibility directions follow here."],
    ["Santa Clara County Library", "For assistance, email us at new.contact@example.org"],
    ["Santa Clara County Library", "Si necesita ayuda, envíenos un correo electrónico a nueva@example.org."],
    ["San Jose Public Library", "For questions, send an email to ab.sjpl@sjlibrary.org or call (408) 808-3040."],
    ["Palo Alto City Library", "Questions? Email neurosphereyouth@gmail.com or register online."],
  ]) {
    const event = { source, description };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("theatre byline punctuation leaves revised dates and ticket instructions intact", () => {
  const event = {
    source: "Santa Clara University",
    description: "By Oscar Wilde Directed by Kimberly Mohne Hill November 20 - 22 (Fri-Sat 7 PM, Sun 1 PM). Tickets $30; ages 8+.",
  };
  const reviewed = {
    ...event,
    description: "By Oscar Wilde. Directed by Kimberly Mohne Hill. November 20 - 22 (Fri-Sat 7 PM, Sun 1 PM). Tickets $30; ages 8+.",
  };
  assert.deepEqual(polishReviewedEventCopy(event), reviewed);
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
});

test("post-refresh library and jazz repairs stay within their supplying source", () => {
  for (const row of postRefreshFixture.cases) {
    const event = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("Stanford seminar repairs preserve other publishers and substantive replacement copy", () => {
  for (const row of october31Fixture.cases) {
    const event = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
  for (const description of [
    "Biology Seminar Series returns with a new speaker. Tickets $15; register by 11/5/26.",
    "Day of the Dead Celebrations | Intimate Conversation w/ Rubí Tsanda Huerta. Registration required; ages 12+.",
    "New energy seminar. The investors have changed their strategy since 2025.",
  ]) {
    const event = { source: "Stanford Events", description };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("citizenship course punctuation follows changed dates without restoring an old schedule", () => {
  const event = {
    source: "San Jose Public Library",
    description: "Course information: Every Wednesday 6:00-7:00 PM 1/6/27-2/17/27 Each week we will cover a different portion of the application process and practice new skills No class 1/20/27",
    date: "2027-01-06", time: "6:00 PM", endTime: "7:00 PM", registration: "optional",
  };
  const reviewed = {
    ...event,
    description: "Course information: Every Wednesday, 6:00-7:00 PM, 1/6/27-2/17/27. Each week we will cover a different portion of the application process and practice new skills. No class 1/20/27.",
  };
  assert.deepEqual(polishReviewedEventCopy(event), reviewed);
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
  assert.deepEqual(numbers(reviewed.description), numbers(event.description));
});

test("stamp club grammar follows changed schedules and stays within its supplying source", () => {
  const description = "Meetings are free to attend and held on the 2nd Thursday at 7:15 PM of the month in a new room. Ages 18+; registration required.";
  const event = { source: "San Jose Public Library", description, date: "2027-01-14", time: "7:15 PM", registration: "required" };
  const reviewed = { ...event, description: "Meetings are free to attend and held on the 2nd Thursday of the month at 7:15 PM in a new room. Ages 18+; registration required." };
  assert.deepEqual(polishReviewedEventCopy(event), reviewed);
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
  assert.deepEqual(numbers(reviewed.description), numbers(description));
  for (const row of stampClubFixture.cases) {
    const otherPublisher = { source: "Different publisher", [row.field]: row.refreshed };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});
