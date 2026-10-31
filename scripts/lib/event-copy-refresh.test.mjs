import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { cleanTitle, polishDescription } from "../generate-events.mjs";
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
const audits = [fixture, eveningFixture, nightFixture, morningFixture, refreshFixture, middayFixture, eveningRefreshFixture, nightRefreshFixture, postRefreshFixture, october31Fixture];
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
        ...occurrence, title: reviewedTitle, source: row.source, [row.field]: row.refreshed,
        date: "2026-11-01", time: "3:30 PM", endTime: "5:00 PM",
        cost: "low", costNote: "$75", attendanceNote: "Registration required; 30 tickets.",
      };
      const untouched = structuredClone(original);
      const refresh = () => polishReviewedEventCopy({
        ...original,
        [row.field]: row.field === "description" ? polishDescription(row.refreshed)
          : row.field === "title" ? cleanTitle(row.refreshed) : row.refreshed,
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
