import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { cleanTitle, isPublicEvent, polishAttendanceNote, polishDescription } from "../generate-events.mjs";
import { isTitleOnlyDescription, polishReviewedEventCopy } from "../../src/lib/south-bay/eventCopyEdits.mjs";
import { eventBlurbCacheKey } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { correctSccLibraryAccessibilityContact, libraryEventDetails } from "./library-event-details.mjs";

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
const november10AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-10-afternoon.json", import.meta.url)));
audits.push(november10AfternoonFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-10-evening.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-10-night.json", import.meta.url))));
const november10LateNightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-10-late-night.json", import.meta.url)));
audits.push(november10LateNightFixture);
const november11AttendanceFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-11-attendance.json", import.meta.url)));
audits.push(november11AttendanceFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-11-post-refresh.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-11-balloon-inflators.json", import.meta.url))));
const november12AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-12-afternoon.json", import.meta.url)));
audits.push(november12AfternoonFixture);
const november12PostRefreshFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-12-post-refresh.json", import.meta.url)));
audits.push(november12PostRefreshFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-12-night.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-12-late-night.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-12-2330-refresh.json", import.meta.url))));
const november13AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-13-afternoon.json", import.meta.url)));
audits.push(november13AfternoonFixture);
const november13EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-13-evening.json", import.meta.url)));
audits.push(november13EveningFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-14-evening.json", import.meta.url))));
const hicapFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-14-hicap.json", import.meta.url)));
audits.push(hicapFixture);
const november14NightFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-14-night.json", import.meta.url)));
audits.push(november14NightFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-15-morning.json", import.meta.url))));
const november15EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-15-evening.json", import.meta.url)));
audits.push(november15EveningFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-15-night.json", import.meta.url))));
const november16EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-16-evening.json", import.meta.url)));
audits.push(november16EveningFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-17-morning.json", import.meta.url))));
const november17AfternoonFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-17-afternoon.json", import.meta.url)));
audits.push(november17AfternoonFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-17-grpg.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-17-late-refresh.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-17-post-fact-check.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-17-night.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-18-overnight.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-18-book-discussions.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-18-afternoon.json", import.meta.url))));
const november18EveningFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-18-evening.json", import.meta.url)));
audits.push(november18EveningFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-18-late-refresh.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-overnight.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-morning.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-scu.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-post-refresh.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-late-morning.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-japanese-storytime.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-afternoon-refresh.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-evening-refresh.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-storytime-entry.json", import.meta.url))));
const november19NightRefreshFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-night-refresh.json", import.meta.url)));
audits.push(november19NightRefreshFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-late-scu.json", import.meta.url))));
const branchBuddyFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-19-branch-buddy.json", import.meta.url)));
audits.push(branchBuddyFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-branch-buddy-clarity.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-campus-events.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-screenings-and-crafts.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-basketball-venue.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-library-and-wayv.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-library-lists.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-afternoon-refresh.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-tully-esl.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-edenvale-milpitas-santana.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-20-library-evening.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-21-library-refresh.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-21-midday.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-21-library-logistics.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-21-performers.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-21-library-clarity.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-21-los-altos-storytime.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-library-and-steinbeck.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-library-attendance.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-market-and-coffee.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-alviso-and-hillview.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-library-lists.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-library-eligibility-and-links.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-graphic-novel-club.json", import.meta.url))));
const paloAltoLibraryFixture = JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-palo-alto-library.json", import.meta.url)));
audits.push(paloAltoLibraryFixture);
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-library-sentences.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-library-refresh.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-waiver-and-volunteers.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-library-participation.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-22-library-and-saxophone.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-saratoga-holidays.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-library-capacity-and-playgroup.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-library-crafts-and-stem.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-registration-and-hours.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-dates-and-blurbs.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-library-listings.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-library-and-nightlife.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-winter-workshops-and-storytime.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-human-rights-day.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-evening-library.json", import.meta.url))));
audits.push(JSON.parse(readFileSync(new URL("./fixtures/reviewed-event-copy-2026-11-23-educational-park-esl.json", import.meta.url))));

test("SCU concert copy distinguishes the performances and removes the title echo", () => {
  const cases = [
    ["Santa Clara Chorale Concert", "Santa Clara Chorale's December Concert, Night One", "The Santa Clara Chorale gives the first performance of its December concert."],
    ["Santa Clara Chorale Concert", "Santa Clara Chorale's December Concert Night Two", "The Santa Clara Chorale gives the second performance of its December concert."],
    ["Peninsula Women's Chorus Concert", "Peninsula Women's Chorus's December Concert", ""],
  ];
  for (const [title, raw, description] of cases) {
    const event = { title, source: "Santa Clara University", description: polishDescription(raw) };
    const reviewed = { ...event, description };
    assert.deepEqual(polishReviewedEventCopy(event), reviewed);
    assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
    const expanded = { ...event, description: `${event.description}. The program features holiday music.` };
    assert.deepEqual(polishReviewedEventCopy(expanded), expanded);
  }
});

test("the book sale's conflicting count stays out of refreshed descriptions and cached blurbs", () => {
  const [bookSale] = paloAltoLibraryFixture.cases;
  const event = {
    ...bookSale.events[0], source: bookSale.source,
    description: polishDescription(bookSale.refreshed),
    blurb: "Browse three rooms of over 70,000 used books, CDs, DVDs, and puzzles at Cubberley Community Center.",
  };
  const reviewed = polishReviewedEventCopy(applyVerifiedEventFacts(event));
  assert.deepEqual(reviewed, {
    ...event,
    description: bookSale.reviewed.replace("over 70,000 ", ""),
    blurb: "Browse three rooms of used books, CDs, DVDs, and puzzles at Cubberley Community Center.",
  });
  assert.deepEqual(polishReviewedEventCopy(applyVerifiedEventFacts(reviewed)), reviewed);
  const updated = { ...event, description: event.description.replace("70,000", "50,000"), blurb: undefined };
  assert.deepEqual(applyVerifiedEventFacts(updated), updated);
  const otherSale = { ...event, title: "Other Book Sale" };
  assert.deepEqual(applyVerifiedEventFacts(otherSale), otherSale);
});

test("book sale copy retains updated hours and later notes from the library", () => {
  const [bookSale] = paloAltoLibraryFixture.cases;
  const updateHours = (text) => text.replace("9:30 AM", "10:30 AM").replace("1 PM", "2 PM");
  const note = " Bring your own bags.";
  const event = {
    ...bookSale.events[0], source: bookSale.source,
    description: polishDescription(updateHours(bookSale.refreshed) + note),
  };
  const reviewed = polishReviewedEventCopy(event);
  assert.deepEqual(reviewed, { ...event, description: updateHours(bookSale.reviewed) + note });
  const otherPublisher = { ...event, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
});

test("library sentence repairs survive the first source pass", () => {
  const cases = [
    [
      "San Jose Public Library",
      "Free. Registration not required. Please arrive on time.",
      "Free. No registration is required. Please arrive on time.",
    ],
    [
      "Santa Clara County Library",
      "Calling all non-walking babies ages 0-12 months for a special storytime featuring American Sign Language along with songs and stories and fun! Please bring a blanket for your baby. After storytime please stay or join us to play with age-appropriate toys! Enjoy this socialization for babies and their grownups.",
      "Non-walking babies ages 0-12 months can join a storytime with American Sign Language, songs, and stories. Please bring a blanket for your baby. Stay after storytime or join us for playtime with age-appropriate toys. Babies and their grownups can meet other families.",
    ],
    [
      "Santa Clara County Library",
      'Join us at Saratoga Library for "The North Pole Review," sharing the perfect way to get into the holiday spirit. All ages welcome.',
      'Celebrate the holidays at Saratoga Library with "The North Pole Review." All ages welcome.',
    ],
    [
      "Santa Clara County Library",
      "Learn how to help your child improve sentences and how to expand their idea development when writing. For parents and caregivers with children in third grade and above.",
      "Learn how to help your child write clearer sentences and develop their ideas. For parents and caregivers with children in third grade and above.",
    ],
  ];
  for (const [source, raw, description] of cases) {
    const event = { source, description: polishDescription(raw) };
    const reviewed = polishReviewedEventCopy(event);
    assert.deepEqual(reviewed, { ...event, description });
    assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
    const otherPublisher = { ...event, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }

  const limited = { source: "San Jose Public Library", description: "Registration not required for caregivers." };
  assert.deepEqual(polishReviewedEventCopy(limited), limited);
  const cached = {
    source: "Santa Clara County Library",
    blurb: "Grab your guitar, ukulele, or voice and perform for a welcoming crowd of fellow musicians.",
  };
  assert.deepEqual(polishReviewedEventCopy(cached), {
    ...cached,
    blurb: "Sing or play an instrument for a welcoming crowd of fellow musicians.",
  });
});

test("Palo Alto English classes replace signup instructions after registration closes", () => {
  const [, , series] = paloAltoLibraryFixture.cases;
  const event = {
    ...series.events[0], source: series.source, description: polishDescription(series.sourceText),
  };
  assert.equal(polishReviewedEventCopy({ ...event, registration: "required" }).description, series.reviewed);
  const closed = { ...event, registration: "closed" };
  const reviewed = polishReviewedEventCopy(closed);
  assert.deepEqual(reviewed, {
    ...closed,
    description: series.reviewed.replace(
      "Register once for the full 7-week series and double-check your email address. Registration closes in the 3rd week.",
      "Registration for this series is closed.",
    ),
  });
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
});

test("library signup advice follows availability and keeps waitlist instructions", () => {
  const { source, refreshed, reviewed } = branchBuddyFixture.cases.find(({ field }) => field === "attendanceNote");
  for (const registration of ["full", "closed"]) {
    assert.equal(polishReviewedEventCopy({ source, registration, attendanceNote: refreshed }).attendanceNote, undefined);
    const attendanceNote = `${refreshed} Ask the library about the waitlist.`;
    assert.equal(polishReviewedEventCopy({ source, registration, attendanceNote }).attendanceNote, "Ask the library about the waitlist.");
  }
  assert.equal(polishReviewedEventCopy({ source, registration: "required", attendanceNote: refreshed }).attendanceNote, reviewed);
});
test("Campbell's full Dungeons and Dragons session directs readers to future sessions", () => {
  const { event, copy } = JSON.parse(readFileSync(
    new URL("./fixtures/reviewed-tween-dungeons-and-dragons.json", import.meta.url),
  ));
  const refreshed = { ...event, description: polishDescription(event.description) };
  const reviewed = { ...refreshed, ...copy };

  assert.deepEqual(polishReviewedEventCopy(refreshed), reviewed);
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);

  const reopened = { ...refreshed, registration: "required" };
  const otherPublisher = { ...refreshed, source: "Different publisher" };
  const newerCopy = {
    ...refreshed,
    description: "The library has posted new registration details for future sessions.",
    blurb: "The group plays Dungeons and Dragons at Campbell Library.",
  };
  for (const untouched of [reopened, otherPublisher, newerCopy]) {
    assert.deepEqual(polishReviewedEventCopy(untouched), untouched);
  }
});

const reviewedCases = audits.flatMap((audit, auditIndex) => audit.cases.map(row => {
  // Use later captured copy for the same publisher and field. Some copy
  // changes also apply to earlier occurrences with different surrounding text.
  let reviewed = row.reviewed;
  for (const later of audits.slice(auditIndex + 1)) {
    const revision = later.cases.find(candidate => candidate.source === row.source
      && candidate.field === row.field && candidate.refreshed === reviewed);
    if (revision) reviewed = revision.reviewed;
    for (const phrase of later.priorPhraseEdits ?? []) {
      if (phrase.source === row.source && phrase.field === row.field) {
        reviewed = reviewed.replaceAll(phrase.before, phrase.after);
      }
    }
  }
  return { ...row, reviewed };
}));
const latestReviewedCopy = row => reviewedCases.find(candidate => candidate.source === row.source
  && candidate.field === row.field && candidate.refreshed === row.refreshed).reviewed;
const numbers = (text) => text.match(/\d+/g);
const identifiers = (text) => (text.match(/https?:\/\/[^\s]+|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi) || [])
  .map(value => value.replace(/[.,;!?]+$/, ""));

test("Campbell screening copy survives refresh with the district's accessibility contact", () => {
  const event = {
    source: "Santa Clara County Library",
    description: "The film carries a R rating. No registration is required. Free snacks will be provided while supplies last. We hope you'll join us for an afternoon of great films and community! Vehicle parking may be limited. For accessibility accommodations (e.g., ASL), please fill out the online form at sccld.org/accessibility 7+ days prior to the event. If you need assistance with the form, speak with a staff member at your local library, call (408) 540-3945, or email us at ask@lib.sccgov.org.",
  };
  const reviewed = polishReviewedEventCopy({ ...event, description: polishDescription(event.description) });
  const published = correctSccLibraryAccessibilityContact(reviewed);
  assert.deepEqual(published, {
    ...event,
    description: "The film is rated R. No registration is required. Free snacks are available while supplies last. Parking may be limited. To request accessibility accommodations such as ASL interpretation, submit the form at sccld.org/accessibility at least 7 days before the screening. If you need assistance with the form, speak with a staff member at your local library, call (408) 540-3947, or email us at ask@lib.sccgov.org.",
  });
  assert.deepEqual(polishReviewedEventCopy(published), published);

  // The refresh sees the organizer's abbreviation before the display edits
  // expand it. The source also supplies the accommodation deadline.
  const updatedSource = {
    ...event,
    description: event.description.replace("(e.g., ASL)", "(ex. ASL)").replace("7+ days", "10+ days"),
  };
  const updated = correctSccLibraryAccessibilityContact(polishReviewedEventCopy({
    ...updatedSource,
    description: polishDescription(updatedSource.description),
  }));
  assert.deepEqual(updated, { ...published, description: published.description.replace("at least 7 days", "at least 10 days") });
});

test("restored Ticketmaster copy drops the clipped warning and keeps ticket details", () => {
  const { event, reviewed } = november18EveningFixture.restoredTicketmaster;
  const repaired = { ...event, description: reviewed };
  assert.deepEqual(polishReviewedEventCopy(event), repaired);
  assert.deepEqual(polishReviewedEventCopy(repaired), repaired);
  const updated = { ...event, description: event.description.replace("two days", "three days") };
  assert.deepEqual(polishReviewedEventCopy(updated), { ...updated, description: reviewed.replace("two days", "three days") });
  const complete = { ...event, description: event.description.replace("DO NOT…", "DO NOT purchase resale tickets.") };
  assert.deepEqual(polishReviewedEventCopy(complete), complete);
  const otherPublisher = { ...event, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
});

test("Almaden's source facts and copy survive description normalization", () => {
  const { beforeFacts, refreshed, reviewed, events } = november17AfternoonFixture.cases.find(
    row => row.beforeFacts && row.events[0].id === "sjpl-69f10f4bfb87a3c2e2ac6fec",
  );
  for (const event of events) {
    const verified = applyVerifiedEventFacts({ ...event, description: polishDescription(beforeFacts) });
    assert.equal(verified.description, refreshed);
    assert.deepEqual(polishReviewedEventCopy(verified), { ...verified, description: reviewed });
    assert.equal(verified.registration, event.registration);
  }
});

test("Willow Glen storytime copy preserves the pickup conflict and capacity", () => {
  const { library, published } = JSON.parse(readFileSync(new URL("./fixtures/fact-check-2026-11-07-midday.json", import.meta.url)));
  const details = libraryEventDetails(library);
  const description = polishDescription([
    "Free, with limited capacity. As we navigate pandemic life, here are a few modifications to our Storytime:",
    details.description,
    "A second Storytime session will follow the first if the first session reaches the maximum capacity of 50 participants.",
  ].join(" "));
  const verified = applyVerifiedEventFacts({ ...published, ...details, description });
  const polished = polishReviewedEventCopy(verified);
  assert.equal(polished.description, [
    "Storytime is free, and space is limited. Seating for Storytime is available on a first-come, first-served basis.",
    "The library publishes conflicting ticket pickup instructions (60 or 30 minutes before storytime). Confirm pickup timing with Willow Glen Library.",
    "If the first session reaches 50 participants, the library will hold a second session.",
  ].join(" "));
  assert.equal(polished.attendanceStatus, "needs-confirmation");
  assert.match(polished.attendanceNote, /60 minutes.*30 minutes/);
  assert.deepEqual({ ...polished, description: verified.description }, verified);
});

test("November 16 library copy repairs preserve revised facts, conditions and publisher scope", () => {
  const revise = text => text.replaceAll("$20", "$25").replaceAll("age of 15", "age of 16").replaceAll("under 15", "under 16")
    .replaceAll("5 to 12", "6 to 13").replaceAll("8 AM", "9:30 AM").replaceAll("5 PM", "4:15 PM")
    .replaceAll("(408) 350-3239", "(650) 555-0123");
  for (const row of november16EveningFixture.cases) {
    const original = {
      ...row.events[0], source: row.source, [row.field]: revise(row.refreshed) + " Tickets $45. Register at https://example.org/updated.",
      date: "2027-01-20", time: "11:45 AM", endTime: "1:15 PM", registration: "required",
      venue: "Updated Venue", address: "500 Updated Avenue", city: "san-jose", category: "education",
      cost: "paid", costNote: "$45",
    };
    const untouched = structuredClone(original);
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(latestReviewedCopy(row)) + " Tickets $45. Register at https://example.org/updated." });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    assert.deepEqual(original, untouched);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, [row.field]: "Previous assessment and registration are required. Se requiere una evaluación y registración previa." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("November 15 evening copy repairs preserve source updates and publisher scope", () => {
  for (const row of november15EveningFixture.cases) {
    const revise = text => `Tickets $45. ${text.replaceAll("November", "December")}`;
    const original = {
      ...row.events[0], [row.field]: revise(row.refreshed),
      date: "2027-01-20", time: "11:45 AM", endTime: "1:15 PM", registration: "required",
      venue: "Updated Venue", address: "500 Updated Avenue", city: "san-jose", category: "education",
      cost: "paid", costNote: "$45", url: "https://example.org/new-event",
    };
    const untouched = structuredClone(original);
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(row.reviewed) });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    assert.deepEqual(original, untouched);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, [row.field]: "Updated program details. Registration required; tickets $50." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("Doctor Atomic drops its clipped preview sentence but preserves an expanded source", () => {
  const row = november15EveningFixture.cases.find(candidate => candidate.source === "Opera San José");
  const raw = november15EveningFixture.operaPreview;
  const publish = description => polishReviewedEventCopy({ source: row.source, description: polishDescription(description) }).description;
  assert.equal(publish(raw), row.reviewed);
  assert.equal(publish(row.refreshed), row.reviewed);
  const complete = raw.replace("unprecedented destructive […]", "unprecedented destructive power.");
  const normalized = polishDescription(complete);
  assert.match(normalized, /J\. Robert Oppenheimer and his team/);
  assert.equal(publish(complete), normalized);
  const laterInstructions = `${row.refreshed} Tickets $45; register at https://example.org/updated.`;
  assert.equal(polishReviewedEventCopy({ source: row.source, description: laterInstructions }).description, laterInstructions);
});

test("November 14 night copy repairs preserve revised source facts and publisher scope", () => {
  const revise = text => text.replaceAll("25 years", "30 years").replaceAll("17 years", "19 years")
    .replaceAll("13 years", "15 years").replaceAll("$20", "$25").replaceAll("1-hour", "2-hour")
    .replaceAll("age of 15", "age of 16").replaceAll("November 20th", "December 18th")
    .replaceAll("10:30 am", "11:45 am");
  const suffix = " Register at https://example.org/new-event; tickets cost $30.";
  for (const row of november14NightFixture.cases) {
    const original = {
      ...row.events[0], source: row.source, [row.field]: revise(row.refreshed) + suffix,
      date: "2027-01-20", time: "11:45 AM", endTime: "1:15 PM", registration: "required",
      venue: "Updated Venue", address: "500 Updated Avenue", city: "san-jose", category: "education",
      cost: "paid", costNote: "$30", url: "https://example.org/new-event",
    };
    const untouched = structuredClone(original);
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    assert.deepEqual(original, untouched);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, [row.field]: "Updated program details. Registration required; tickets $40." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("HICAP source refresh preserves reviewed hours grammar and revised appointment facts", () => {
  const row = hicapFixture.cases[0];
  const description = polishDescription(libraryEventDetails({ description: hicapFixture.rawDescription }).description);
  assert.equal(description, row.refreshed);
  const event = { ...row.events[0], description, date: "2026-11-18", time: "10:00 AM", endTime: "12:00 PM", registration: "appointment-only" };
  assert.deepEqual(polishReviewedEventCopy(event), { ...event, description: row.reviewed });

  const revise = text => text.replaceAll("8:00 AM", "9:30 AM").replaceAll("5:00 PM", "4:15 PM")
    .replaceAll("(408) 350-3288", "(650) 555-0123");
  const updated = { ...event, description: revise(description), date: "2027-01-20", time: "1:00 PM", endTime: "3:00 PM", registration: "required" };
  const repaired = polishReviewedEventCopy(updated);
  assert.deepEqual(repaired, { ...updated, description: revise(row.reviewed) });
  assert.deepEqual(numbers(repaired.description), numbers(updated.description));
  assert.deepEqual(polishReviewedEventCopy(repaired), repaired);
  const otherPublisher = { ...event, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  const unrelated = { ...event, description: "The event runs between 8:00 AM - 5:00 PM." };
  assert.deepEqual(polishReviewedEventCopy(unrelated), unrelated);
});

test("the SJPL team-player source repairs its sequence before companion-title punctuation", () => {
  // Normalized source wording from SJPL event 6ada82bbfee2d21deb252643, checked
  // November 14, 2026. The published feed already has the earlier typo repairs.
  const description = polishDescription("This programs is immediately proceeded by: Interviewing with confidence: Managing your emotions in the interview process In partnership with SJSU Department of Communication Studies Free.");
  const event = { source: "San Jose Public Library", description, date: "2026-11-18", time: "12:45 PM", endTime: "1:30 PM", registration: "none" };
  const reviewed = {
    ...event,
    description: 'This program is immediately preceded by "Interviewing with confidence: Managing your emotions in the interview process." In partnership with the SJSU Department of Communication Studies. Free.',
  };
  assert.deepEqual(polishReviewedEventCopy(event), reviewed);
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
});

test("refresh excludes dissertation defenses while retaining advertised public lectures", () => {
  const title = "PhD Dissertation Defense: Danielle Klinger";
  for (const source of ["Stanford Events", "SJSU Events", "Santa Clara University"]) {
    assert.equal(isPublicEvent(title, source, "", "Clark Center"), false);
    assert.equal(isPublicEvent(title, source, "Open to everyone.", "Clark Center"), false);
    assert.equal(isPublicEvent(title, source, "A public lecture on current research.", "Clark Center"), true);
    assert.equal(isPublicEvent(`${title} — Public Lecture`, source, "", "Clark Center"), true);
    assert.equal(isPublicEvent("Public Lecture: Current Research", source, "", "Clark Center"), true);
  }
});

test("November 13 refresh repairs retain revised attendance facts and publisher scope", () => {
  const revise = text => text.replaceAll("November 14, 2026", "December 12, 2027")
    .replaceAll("11 AM-6 PM", "10 AM-4 PM").replaceAll("11 AM to 6 PM", "10 AM to 4 PM")
    .replaceAll("60+", "75+").replaceAll("100+", "120+")
    .replaceAll("2nd grade", "3rd grade").replaceAll("15 participants", "20 participants")
    .replaceAll("7+ days", "10+ days").replaceAll("(408) 540-3945", "(650) 555-0123")
    .replaceAll("ask@lib.sccgov.org", "updated@example.org")
    .replaceAll("No registration is required;", "Registration is now required;")
    .replaceAll("Murray Low", "New Director");
  const suffix = " Register at https://example.org/new-event; tickets cost $25.";
  for (const row of november13AfternoonFixture.cases) {
    const original = {
      ...row.events[0], source: row.source, [row.field]: revise(row.refreshed) + suffix,
      date: "2027-02-14", time: "4:00 PM", endTime: "5:30 PM", registration: "required",
      venue: "Updated Venue", address: "500 Updated Avenue", city: "san-jose", category: "education",
      cost: "paid", costNote: "$25", url: "https://example.org/new-event",
    };
    const untouched = structuredClone(original);
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(latestReviewedCopy(row)) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    assert.deepEqual(original, untouched);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, [row.field]: "New program details. Registration required; tickets $30." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("November 13 evening copy repairs preserve new source facts and publisher scope", () => {
  const revise = text => text.replaceAll("11 to 11:30 a.m.", "9 to 10:15 a.m.")
    .replaceAll("30 minutes", "45 minutes").replaceAll("8-week", "10-week")
    .replaceAll("3rd week", "4th week").replaceAll("2nd week", "3rd week")
    .replaceAll("5 registrants", "8 registrants").replaceAll("1 week", "2 weeks");
  const suffix = " New session: January 14, 2027; tickets $25. Register at https://example.org/new-session.";
  for (const row of november13EveningFixture.cases) {
    const occurrence = row.events[0];
    const reviewedTitle = november13EveningFixture.cases.find(candidate => candidate.field === "title"
      && candidate.source === row.source && candidate.refreshed === occurrence.title)?.reviewed
      ?? occurrence.title;
    const original = {
      ...occurrence, title: reviewedTitle, source: row.source, [row.field]: revise(row.refreshed) + suffix,
      date: "2027-01-14", time: "9:00 AM", endTime: "10:15 AM", registration: "required",
      venue: "New Venue", address: "500 New Avenue", city: "san-jose", category: "education",
      cost: "paid", costNote: "$25", attendanceNote: "Register at https://example.org/new-session.",
      url: "https://example.org/new-session",
    };
    const revision = november19NightRefreshFixture.cases.find(candidate => candidate.source === row.source
      && candidate.field === row.field && candidate.refreshed === row.reviewed);
    const untouched = structuredClone(original);
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(revision?.reviewed ?? row.reviewed) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    assert.deepEqual(original, untouched);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const updatedCopy = { ...original, [row.field]: "New program details. Registration required; tickets $30." };
    assert.deepEqual(polishReviewedEventCopy(updatedCopy), updatedCopy);
  }
});

test("November 12 post-refresh copy repairs retain updated facts and publisher scope", () => {
  const revise = text => text.replaceAll("3–12", "4–11").replaceAll("15 participants", "20 participants")
    .replaceAll("30 minutes", "45 minutes").replaceAll("5-12+", "7-14+")
    .replaceAll("408-808-3052", "650-555-0123").replaceAll("2026", "2027");
  const suffix = " Register by December 15 at https://example.org/register; tickets cost $25.";
  for (const row of november12PostRefreshFixture.cases) {
    const original = {
      source: row.source, [row.field]: revise(row.refreshed) + suffix,
      id: "updated-source-event", date: "2027-02-14", time: "4:00 PM", endTime: "5:30 PM",
      cost: "paid", costNote: "$25", registration: "required", attendanceNote: "Registration required; ages 9+.",
      venue: "Updated Venue", address: "500 Updated Avenue", city: "san-jose", category: "education",
      url: "https://example.org/updated",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, [row.field]: "New source wording; registration required by February 12. Tickets $30." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("November 12 copy repairs preserve revised source facts, attendance and publisher scope", () => {
  const revise = text => text.replaceAll("4 sessions", "6 sessions")
    .replaceAll("6-12", "8-14").replaceAll("ages 7", "ages 9")
    .replaceAll("8-10 days", "10-12 days").replaceAll("7+ days", "10+ days")
    .replaceAll("(408) 540-3945", "(408) 555-0199")
    .replaceAll("ask@lib.sccgov.org", "updated@example.org");
  const suffix = " Register by December 15 at https://example.org/register; tickets cost $25.";
  for (const row of november12AfternoonFixture.cases) {
    const original = {
      source: row.source, description: revise(row.refreshed) + suffix,
      id: "updated-source-event", date: "2027-02-14", time: "4:00 PM", endTime: "5:30 PM",
      cost: "paid", costNote: "$25", attendanceNote: "Registration required; ages 9+.",
      venue: "Updated Branch Library", url: "https://example.org/updated",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, description: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next.description), numbers(original.description));
    assert.deepEqual(identifiers(next.description), identifiers(original.description));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, description: "New source wording: registration required by February 12. Tickets $30." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("attendance grammar repairs preserve changed limits, contact details and publisher scope", () => {
  const revise = text => text.replaceAll("30 participants", "42 participants")
    .replaceAll("25 participants", "22 participants").replaceAll("11 AM", "12 PM")
    .replaceAll("3:30", "2:30").replaceAll("4:45", "3:45").replaceAll("K-8", "K-6");
  const suffix = " Register by December 15 at https://example.org/register or email access@example.org; tickets cost $25.";
  for (const row of november11AttendanceFixture.cases) {
    const original = {
      id: "updated-library-event", source: row.source,
      attendanceNote: revise(row.refreshed) + suffix,
      date: "2027-02-14", time: "4:00 PM", endTime: "5:30 PM", cost: "paid", costNote: "$25",
      venue: "Updated Branch Library", address: "500 Updated Avenue", city: "san-jose",
      category: "education", registration: "required", url: "https://example.org/updated",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, attendanceNote: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next.attendanceNote), numbers(original.attendanceNote));
    assert.deepEqual(identifiers(next.attendanceNote), identifiers(original.attendanceNote));
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, attendanceNote: "New source wording; registration required by February 12. Tickets $30." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
});

test("Tech description repairs preserve revised source facts, later instructions and publisher scope", () => {
  const suffix = " Register by December 15 at https://example.org/register; tickets cost $25.";
  const revise = text => text.replaceAll("50th", "51st").replaceAll("3-D", "4-D");
  for (const row of november10LateNightFixture.cases) {
    const original = {
      id: "updated-tech-event", source: row.source,
      description: revise(row.refreshed) + suffix,
      date: "2027-02-14", time: "4:00 PM", endTime: "5:30 PM",
      cost: "paid", costNote: "$25", venue: "Updated Venue",
      address: "500 Updated Avenue", city: "san-jose", category: "education",
      url: "https://example.org/updated",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, description: revise(row.reviewed) + suffix });
    assert.deepEqual(numbers(next.description), numbers(original.description));
    assert.deepEqual(identifiers(next.description), identifiers(original.description));
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("November 10 afternoon copy repairs preserve publisher scope and revised source facts", () => {
  for (const row of november10AfternoonFixture.cases) {
    const revise = text => text.replaceAll("30 participants", "42 participants")
      .replaceAll("11 AM", "12 PM").replaceAll("25 participants", "22 participants")
      .replaceAll("5 min", "7 min").replaceAll("8-12", "9-14")
      .replaceAll("Yannina.Yang@sjlibrary.org", "Updated.Contact+help@example.org")
      .replaceAll("408-808-3045", "650-555-0123");
    const original = {
      id: "revised-source-event", source: row.source, [row.field]: revise(row.refreshed),
      date: "2027-02-14", time: "4:00 PM", endTime: "5:30 PM", cost: "paid", costNote: "$25",
      venue: "Updated Branch Library", address: "500 Updated Avenue", city: "san-jose",
      category: "education", registration: "required", url: "https://example.org/updated",
    };
    const next = polishReviewedEventCopy(original);
    assert.deepEqual(next, { ...original, [row.field]: revise(latestReviewedCopy(row)) });
    assert.deepEqual(numbers(next[row.field]), numbers(original[row.field]));
    assert.deepEqual(identifiers(next[row.field]), identifiers(original[row.field]));
    assert.deepEqual(polishReviewedEventCopy(next), next);
    const otherPublisher = { ...original, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
    const replacement = { ...original, [row.field]: "New source wording; registration required by February 12. Tickets $30." };
    assert.deepEqual(polishReviewedEventCopy(replacement), replacement);
  }
  const completed = {
    source: "City of Cupertino",
    description: "Schedule a tour with Updated.Contact@example.org. The Classroom tours last 30 minutes. Register at https://example.org/tours.",
  };
  assert.deepEqual(polishReviewedEventCopy(completed), completed, "a completed classroom sentence survives");
  const continued = { ...completed, description: "Schedule a tour. The Classroom is open from 9 AM." };
  assert.deepEqual(polishReviewedEventCopy(continued), continued);
});

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
    assert.deepEqual(next, { ...event, description: revise(latestReviewedCopy(row)) + suffix });
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

test("SCU venue and blurb use the mission's published spelling", () => {
  const event = {
    source: "Santa Clara University", title: "Student Candlelight Mass",
    venue: "Mission Santa Clara de Asis",
    blurb: "Attend Wednesday evening Student Candlelight Mass at Mission Santa Clara de Asis.",
    date: "2026-12-02", time: "8:00 PM",
    url: "https://events.scu.edu/center-for-spirituality-and-faith/event/454607-student-candlelight-mass",
  };
  assert.deepEqual(polishReviewedEventCopy(event), {
    ...event, venue: "Mission Santa Clara de Asís",
    blurb: "Attend Wednesday evening Student Candlelight Mass at Mission Santa Clara de Asís.",
  });
});

test("cached Luka Sulic title retains the band's spelling after normalization", () => {
  const title = "Luka Sulic (formerly of 2CELLOS)";
  const event = { source: "San Jose Theaters", title: cleanTitle(title) };
  assert.deepEqual(polishReviewedEventCopy(event), { ...event, title });
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
    assert.deepEqual(next, { ...original, description: latestReviewedCopy(row) + " Ages 12+; tickets $25. Register at https://example.org/revised or email updated@example.org." });
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
    .replaceAll("8 AM", "9 AM").replaceAll("5 PM", "4 PM").replaceAll("Room 201A", "Room 302B")
    .replaceAll("HICAP's goal is to inform and educate", "HICAP's updated goal is to inform and educate");
  const suffix = " Registration required; ages 18+; contact updated@example.org. See https://example.org/new.";
  for (const row of november7MarkupFixture.cases) {
    const original = {
      source: row.source, description: revise(row.refreshed) + suffix,
      id: "revised-markup-event", date: "2026-12-04", time: "11:45 AM",
      endTime: "1:00 PM", registration: "appointment-only", cost: "free",
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
    assert.deepEqual(next, { ...original, [row.field]: revise(latestReviewedCopy(row)) + suffix });
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

test("complete title echoes tolerate known accents and end punctuation", () => {
  const event = {
    id: "sjsu-996707af83523fc9", source: "SJSU Events",
    title: "Football - San José State vs. Northern Illinois",
    description: "Football - San Jose State vs. Northern Illinois",
    date: "2026-11-14", time: "12:30 PM", cost: "paid",
  };
  assert.equal(isTitleOnlyDescription(event.title, event.description), true);
  assert.equal(isTitleOnlyDescription("Resume", "Résumé"), false);
  assert.equal(isTitleOnlyDescription("San Jose Stories", " SAN JOSÉ  STORIES "), true);
  assert.equal(isTitleOnlyDescription("Divorced Dad Rock Night", "Divorced Dad Rock Night!"), true);
  assert.equal(isTitleOnlyDescription("Divorced Dad Rock Night", "Divorced Dad Rock Night! Ages 21 and up."), false);
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
      // A later edit can link to the prior reviewed text and still replay
      // the organizer's original spelling and punctuation through ingestion.
      const sourceText = row.sourceText ?? row.refreshed;
      const original = {
        ...occurrence, title: reviewedTitle, source: row.source,
        date: "2026-11-01", time: "3:30 PM", endTime: "5:00 PM",
        cost: "low", costNote: "$75", attendanceNote: "Registration required; 30 tickets.",
        [row.field]: sourceText,
      };
      const untouched = structuredClone(original);
      // Compare factual tokens after decoding a duplicated date or glued email.
      const factText = row.tokenRepair ? sourceText.replace(...row.tokenRepair) : sourceText;
      const refresh = () => polishReviewedEventCopy({
        ...original,
        [row.field]: row.field === "description" ? polishDescription(sourceText)
          : row.field === "title" ? cleanTitle(sourceText)
          : row.field === "attendanceNote" ? polishAttendanceNote(sourceText) : sourceText,
      });
      for (let pass = 0; pass < 3; pass++) {
        // Each refresh starts from source/cached copy again, not its output.
        const next = refresh();
        assert.equal(next[row.field], row.reviewed);
        assert.deepEqual(numbers(next[row.field]), numbers(factText));
        assert.deepEqual(identifiers(next[row.field]), identifiers(factText));
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

test("the Books & Bricks listing preserves the library's book pickup instructions on refresh", () => {
  const raw = [
    "We will meet on Monday December 14th at 3:30pm in the Program Room.",
    "If you can attend this meeting, register online and pick up your copy of the book at the Children’s Reference Desk.",
    "Please read the book before our meeting. At the meeting we will discuss the book and do a Lego building activity.",
  ].join(" ");
  const event = {
    source: "Santa Clara County Library",
    time: "3:30 PM",
    registration: "required",
    description: polishDescription(raw + " Special thanks to the Friends of Milpitas Library."),
  };
  const reviewed = {
    ...event,
    description: "We'll meet on Monday, December 14, at 3:30 PM in the Program Room. If you can attend this meeting, register online and pick up your copy of the book at the Children's Reference Desk. Please read the book before the meeting. We'll discuss it and build with LEGO bricks. Special thanks to the Friends of Milpitas Library.",
  };
  assert.deepEqual(polishReviewedEventCopy(event), reviewed);
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
  assert.equal(polishDescription("Discuss the book. Register online."), "Discuss the book.");
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

test("Linden Tree storytime blurbs preserve book-title punctuation on refresh", () => {
  const cases = [
    [
      "Hear author Claire Wrenn Bobrow read her new picture book, Party Pony!, about a pony who has grown tired of parties.",
      "Hear author Claire Wrenn Bobrow read her new picture book \"Party Pony!\" and find out why the pony has grown tired of parties.",
    ],
    [
      "Hear debut author Sahar Shams read her festive picture book, What Does Santa Want for Christmas?, at a Sunday storytime.",
      "At Sunday storytime, Sahar Shams reads her festive debut picture book \"What Does Santa Want for Christmas?\"",
    ],
  ];
  for (const [before, blurb] of cases) {
    const event = { source: "Linden Tree Books", blurb: before };
    const reviewed = { ...event, blurb };
    assert.deepEqual(polishReviewedEventCopy(event), reviewed);
    assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);

    const otherPublisher = { ...event, source: "Different publisher" };
    assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
  }
});

test("Santa Paws copy keeps the photo hours, registration and minimum donation on refresh", () => {
  const description = "DECEMBER 12, 2026  Bring your pet to Park Valencia in Santana Row for a photo with Santa Claus on Saturday, December 12th from 10am to 2pm. All proceeds will benefit Humane Society Silicon Valley. Photos with your pet are a minimum donation of $10! Registration begins at 9:30am.";
  const expected = "Bring your pet for a photo with Santa Claus at Park Valencia in Santana Row on Saturday, December 12, 2026, from 10 AM to 2 PM. All proceeds will benefit Humane Society Silicon Valley. Photos with your pet require a donation of at least $10. Registration begins at 9:30 AM.";
  const event = {
    source: "Santana Row",
    description: polishDescription(description),
    date: "2026-12-12",
    time: "10:00 AM",
    endTime: "2:00 PM",
  };
  const reviewed = polishReviewedEventCopy(event);
  assert.deepEqual(reviewed, { ...event, description: expected });
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);

  const updated = {
    ...event,
    description: event.description.replace("10 AM to 2 PM", "11 AM to 2 PM").replace("$10!", "$12.50!"),
    time: "11:00 AM",
  };
  assert.deepEqual(polishReviewedEventCopy(updated), {
    ...updated,
    description: expected.replace("10 AM to 2 PM", "11 AM to 2 PM").replace("$10.", "$12.50."),
  });

  const differentSource = { ...event, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(differentSource), differentSource);
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
  for (const description of [
    "The Music of ABBA returns with a new ensemble. Tickets $55.",
    "RSVP Lowrider Art Showcase opens at 10 AM.",
    "Charo Christmas returns with a new guest performer.",
  ]) {
    const event = { source: "Montalvo Arts Center", description };
    assert.deepEqual(polishReviewedEventCopy(event), event);
  }
});

test("refreshed holiday and library listings retain reviewed copy", () => {
  const concert = {
    source: "Montalvo Arts Center",
    title: "Charo Have Yourself a Cuchi Little Christmas",
    description: "Charo Christmas",
    date: "2026-12-05",
    url: "https://my.montalvoarts.org/3111/3155",
  };
  const reviewedConcert = {
    ...concert,
    title: "Charo: Have Yourself a Cuchi Little Christmas",
    description: "Charo's holiday show features flamenco guitar, comedy, and dancing.",
  };
  assert.deepEqual(polishReviewedEventCopy(concert), reviewedConcert);
  assert.deepEqual(polishReviewedEventCopy(reviewedConcert), reviewedConcert);

  const dance = {
    source: "San Jose Public Library",
    description: "Get into the rhythm of fitness with our Bollywood Dance program! Join us for this exciting volunteer-led program and learn Bollywood Dance moves for fun and fitness! Walk-ins are welcome.",
  };
  assert.equal(polishReviewedEventCopy(dance).description,
    "This volunteer-led program teaches Bollywood dance moves for fun and fitness. Walk-ins are welcome.");
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

test("Qi Gong schedule copy stays readable after removing the old cancellation notice", () => {
  const event = {
    id: "sccl-65baeaeff664ce330023eafa",
    source: "Santa Clara County Library",
    title: "Qi Gong Meditation & Exercise Class",
    venue: "Milpitas Library",
    date: "2026-12-04",
    time: "1:00 PM",
    endTime: "3:00 PM",
    url: "https://sccl.bibliocommons.com/events/65baeaeff664ce330023eafa",
    description: "Join us for Falun Dafa classes provided by the Classical Arts Foundation. Relieve Stress and anxiety; Increase energy and vitality; Improve physical health. Friday afternoons, 1-3 PM In the Auditorium Please note that there is no class on the following dates in 2025: August 29, September 12, November 28, and December 5. For accessibility accommodations, see sccld.org/accessibility.",
  };
  const verified = applyVerifiedEventFacts(event);
  const reviewed = {
    ...verified,
    description: "Join us for Falun Dafa classes provided by the Classical Arts Foundation. Classes meet Friday afternoons from 1 to 3 PM in the auditorium. For accessibility accommodations, see sccld.org/accessibility.",
  };
  assert.deepEqual(polishReviewedEventCopy(verified), reviewed);
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
});

test("Korean smartphone help copy keeps updated appointment lengths and source details", () => {
  const description = polishDescription(
    "Free 20-minute 1-on-1 sessions with a Technology Consultant who speaks English and Korean, covering help with iPhone, iPad, or Android photos, apps, and settings. Bring your charger.",
  );
  const event = { source: "City Newsletter", description, registration: "appointment-only" };
  const reviewed = {
    ...event,
    description: "Get free 20-minute one-on-one help with photos, apps, and settings on an iPhone, iPad, or Android device. The technology consultant speaks English and Korean. Bring your charger.",
  };
  assert.deepEqual(polishReviewedEventCopy(event), reviewed);
  assert.deepEqual(polishReviewedEventCopy(reviewed), reviewed);
  const otherPublisher = { ...event, source: "Different publisher" };
  assert.deepEqual(polishReviewedEventCopy(otherPublisher), otherPublisher);
});
