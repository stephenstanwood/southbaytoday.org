import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cleanTitle, fetchScuEvents, fetchStanfordEvents, inferCategory, isEventTimeBackfillCandidate } from "../generate-events.mjs";
import { libraryEventDetails } from "../lib/library-event-details.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";
import { resolveRetired, retireSlugs } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../lib/fixtures/fact-check-2026-11-16-night.json", import.meta.url)));
const prior = id => structuredClone(fixture.events.find(e => e.id === id));

const SMU_LOCALIST_URL = "https://events.stanford.edu/event/stanford-football-vs-smu-senior-day-fan-appreciation";
const SMU_KICKOFF_NOTE = "Stanford lists 12 PM or 12:30 PM and will announce the official kickoff after November 21. Confirm the time before going.";

test("the confirmed SMU kickoff replaces both the noon listing and the old time notice", async () => {
  const event = {
    ...prior("inbound-40dfe7b5b3daacd1"),
    url: SMU_LOCALIST_URL,
    time: "12:00 PM",
    attendanceStatus: "needs-confirmation",
    attendanceNote: SMU_KICKOFF_NOTE,
  };
  await resolveEventBlurbs([event], { enabled: false });
  assert.equal(event.time, "12:30 PM");
  assert.equal(event.endTime, null);
  assert.equal(event.attendanceNote, null);
  assert.equal(requiresAttendanceConfirmation(event), false);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
});

test("the confirmed SMU kickoff preserves other attendance conditions", () => {
  const event = {
    ...prior("inbound-40dfe7b5b3daacd1"),
    attendanceStatus: "needs-confirmation",
    attendanceNote: SMU_KICKOFF_NOTE + " Contact the venue to confirm accessible seating.",
    registration: "full",
  };
  const fixed = applyVerifiedEventFacts(event);
  assert.equal(fixed.attendanceNote, "Contact the venue to confirm accessible seating.");
  assert(requiresAttendanceConfirmation(fixed));
  assert.equal(fixed.registration, "full");
});

test("the kickoff correction is confined to the verified occurrence and source", () => {
  const event = prior("inbound-40dfe7b5b3daacd1");
  for (const change of [{ date: "2027-11-28" }, { url: "https://example.org/game" }]) {
    const other = { ...event, ...change };
    assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("retired FansGiving and ticket-shop links resolve to the verified kickoff", () => {
  const before = prior("inbound-40dfe7b5b3daacd1");
  const live = applyVerifiedEventFacts({
    ...before, id: "stanford-53632423836256-2026-11-28", url: SMU_LOCALIST_URL,
    title: "Stanford Football vs SMU | Senior Day + Fan Appreciation",
    time: "12:00 PM",
  });
  const ticketAlias = {
    ...before, id: "old-tickets", title: "Stanford Football vs. SMU", time: "7:00 PM",
    url: "https://tickets.gostanford.com/events/football-vs-smu-fauvdl/6aee4789c9f40aa050aa2976",
  };
  assert.equal(isEventTimeBackfillCandidate(live), false);
  const ledger = retireSlugs({ entries: [] }, [before, ticketAlias], [], "2026-11-16", "2026-11-17T04:07:00Z");
  const { orphans, redirects } = resolveRetired(ledger, [live], [], "2026-11-23");
  assert.equal(orphans.length, 0);
  assert.equal(redirects.get("2026-11-28-fansgiving-stanford-football-vs-smu"), "2026-11-28-stanford-football-vs-smu-senior-day-fan-appreciation");
  assert.equal(redirects.get("2026-11-28-stanford-football-vs-smu"), "2026-11-28-stanford-football-vs-smu-senior-day-fan-appreciation");
});

test("Stanford reads mandatory prior registration and declared formats before shortening", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T04:07:00Z") });
  t.mock.method(globalThis, "fetch", async input => {
    assert.equal(String(input), "https://events.stanford.edu/api/2/events?days=60&pp=200");
    return Response.json({ events: fixture.stanfordEvents.map(event => ({ event })) });
  });
  const rows = await fetchStanfordEvents();
  const film = rows.find(e => e.title.startsWith("Malês"));
  assert.equal(film.registration, "required");
  assert.match(film.attendanceNote, /THIS EVENT REQUIRES PREVIOUS REGISTRATION/i);
  assert.equal(film.time, "4:45 PM");
  assert.equal(film.endTime, "7:00 PM");
  assert.equal(film.cost, null);
  assert.equal(rows.find(e => e.title.startsWith("TNT Traysikel")).category, "arts");
  assert.equal(rows.find(e => e.title.startsWith("A Conversation with Kanishka")).category, "education");
});

test("a retained sparse film card preserves its mandatory gate and later closures", async () => {
  for (const registration of [undefined, "full", "closed"]) {
    const event = { ...prior("stanford-54400058337176-2026-11-17"), ...(registration ? { registration, attendanceNote: "Later organizer notice." } : {}) };
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.registration, registration || "required");
    assert.match(event.attendanceNote, /registration/i);
    if (registration) assert.match(event.attendanceNote, /^Later organizer notice\./);
    assert.equal(event.cost, null);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
  }
  const updated = { ...prior("stanford-54400058337176-2026-11-17"), description: "Updated admission: no registration required." };
  assert.deepEqual(applyVerifiedEventFacts(updated), updated);
});

test("SCU's away NCAA soccer matchup is sports despite the university name", async t => {
  t.mock.method(globalThis, "fetch", async input => {
    if (String(input) === "https://events.scu.edu/live/rss/events") return new Response(`<rss><channel><item>
      <title>Santa Clara University Women’s Soccer at Stanford - NCAA Tournament First Round</title>
      <link>https://events.scu.edu/bronco-athletics/event/534233-santa-clara-university-womens-soccer-at-stanford-</link>
      <pubDate>Sat, 21 Nov 2026 02:00:00 +0000</pubDate>
      <description></description><georss:featurename>Stanford, Calif.</georss:featurename>
      <georss:point>37.4275 -122.1697</georss:point>
      <livewhale:categories>Open to the Public,Athletics</livewhale:categories>
    </item></channel></rss>`);
    assert.equal(String(input), "https://events.scu.edu/live/json/events?page=1");
    return Response.json({ meta: { total_pages: 1 }, data: [] });
  });
  const [event] = await fetchScuEvents();
  assert.equal(event.category, "sports");
  assert.equal(event.date, "2026-11-20");
  assert.equal(event.time, "6:00 PM");
});

test("Mandarin children's sessions retain family category and original ticket instructions", () => {
  for (const event of fixture.mandarinEvents) {
    const details = libraryEventDetails(event);
    assert.equal(inferCategory(cleanTitle(event.definition.title), details.description, "", "Calabazas Library", details.sourceAudiences), "family");
    assert.match(details.attendanceNote, /门票将在故事时间开始前 30 分钟在询问处领取/);
    assert.equal(inferCategory("Mandarin Stories and Songs for Adults", "", "", "Calabazas Library", ["Adults, ages 18+"]), "community");
  }
});

test("Seven Trees Library board games are family programming", () => {
  const description = "Play classic board games at Seven Trees Library. Open to all ages.";
  assert.equal(inferCategory("Board Game Zone", description, "", "Seven Trees Library"), "family");
  assert.equal(inferCategory("Board Game Design Class", description, "", "Seven Trees Library"), "education");
});
