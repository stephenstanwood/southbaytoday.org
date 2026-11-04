import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { cleanTitle, polishAttendanceNote, polishDescription } from "../generate-events.mjs";
import { polishReviewedEventCopy } from "../../src/lib/south-bay/eventCopyEdits.mjs";
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
const audits = [fixture, eveningFixture, nightFixture, morningFixture, refreshFixture, middayFixture, eveningRefreshFixture, nightRefreshFixture, postRefreshFixture, october31Fixture, storytimeFixture, activitiesFixture, afternoonFixture, lateAfternoonFixture, october31EveningFixture, stampClubFixture, makerStudioFixture, accessibilityFixture, november1Fixture, november1PostFactCheckFixture, attendanceFixture, volunteersFixture, newsletterFixture, afternoonRefreshFixture, november1EveningRefreshFixture, november2Fixture, november2OvernightFixture, november2MorningFixture, november2AfternoonFixture, november2EveningFixture, november2NightFixture, november2LateFixture, november3Fixture, philosophyFixture, november3AfternoonFixture, november4OvernightFixture, november4MorningFixture, november4AttendanceFixture, november4MiddayFixture];
audits.push(november4ClockFixture);
const numbers = (text) => text.match(/\d+/g);
const identifiers = (text) => (text.match(/https?:\/\/[^\s]+|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi) || [])
  .map(value => value.replace(/[.,;!?]+$/, ""));

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
  const otherPublisher = { source: "Different publisher", description: row.refreshed };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  const revised = {
    source: row.source,
    description: row.refreshed.replace("It is impossible to leave the pleasant life", "It is impossible to enjoy a pleasant life"),
  };
  assert.deepEqual(polishReviewedEventCopy(revised), revised);
  const suffix = " Registration required. Ages 12+; $25. Contact updated@example.org.";
  const extended = { source: row.source, description: row.refreshed + suffix };
  assert.deepEqual(polishReviewedEventCopy(extended), { ...extended, description: row.reviewed + suffix });
});

test("November grammar repairs preserve other publishers and later source instructions", () => {
  for (const row of [...november1Fixture.cases, ...november1PostFactCheckFixture.cases, ...attendanceFixture.cases, ...volunteersFixture.cases, ...newsletterFixture.cases, ...afternoonRefreshFixture.cases, ...november1EveningRefreshFixture.cases, ...november2Fixture.cases, ...november2OvernightFixture.cases, ...november2MorningFixture.cases, ...november2AfternoonFixture.cases, ...november2EveningFixture.cases, ...november2NightFixture.cases, ...november2LateFixture.cases, ...november3Fixture.cases, ...november3AfternoonFixture.cases, ...november4OvernightFixture.cases, ...november4MorningFixture.cases, ...november4MiddayFixture.cases]) {
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
