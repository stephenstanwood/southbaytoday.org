import assert from "node:assert/strict";
import test from "node:test";

import { hoursStatusOnDate } from "../../src/lib/south-bay/mealService.mjs";
import { repairNewsletterEventFacts } from "./lib.mjs";
import {
  applyQaVerdict,
  buildQaPrompt,
  collectQaTargets,
  deterministicVerdict,
  emptyVerdict,
  fetchSourceExcerpt,
  itemKey,
  mergeVerdicts,
  pageLooksCancelled,
  parseQaVerdict,
  qaEnabled,
  runPreSendQa,
  stripHtmlExcerpt,
} from "./pre-send-qa.mjs";

function issue(overrides = {}) {
  return {
    date: "2026-09-08",
    longDate: "Tuesday, September 8, 2026",
    dayPlan: null,
    dayPlanBlurb: "",
    tonightPick: null,
    tonightPickBlurb: "",
    todayEvents: [],
    featuredEvents: [],
    recentOpenings: [],
    civicMeetings: [],
    todayHistory: [],
    redditPosts: [],
    visuals: {},
    editorial: { briefing: "Good morning.", eventsNote: "A few things tonight." },
    ...overrides,
  };
}

const beauty = {
  id: "inbound-b60351612d66d165",
  title: "Disney's Beauty and the Beast",
  date: "2026-09-08",
  time: "7:30 PM",
  venue: "San Jose Center for the Performing Arts",
  url: "https://www.broadwaysanjose.com/events/disneys-beauty-and-the-beast/",
  blurb: "with pre-show activities for Family Night",
};

test("hoursStatusOnDate treats omitted Places days as closed", () => {
  const hours = { mon: "14:45-18:30", sat: "10:30-14:00" };
  assert.equal(hoursStatusOnDate(hours, "2026-09-14"), "open"); // Monday
  assert.equal(hoursStatusOnDate(hours, "2026-09-13"), "closed"); // Sunday omitted
  assert.equal(hoursStatusOnDate(hours, "2026-09-19"), "open"); // Saturday
  assert.equal(hoursStatusOnDate({}, "2026-09-08"), "unknown");
  assert.equal(hoursStatusOnDate({ sun: "closed" }, "2026-09-13"), "closed");
});

test("qaEnabled honors the explicit flag and env", () => {
  assert.equal(qaEnabled({ enabled: false }), false);
  assert.equal(qaEnabled({ enabled: true }), true);
  const prior = process.env.SBT_NEWSLETTER_PRE_SEND_QA;
  process.env.SBT_NEWSLETTER_PRE_SEND_QA = "0";
  assert.equal(qaEnabled({}), false);
  process.env.SBT_NEWSLETTER_PRE_SEND_QA = "1";
  assert.equal(qaEnabled({}), true);
  if (prior === undefined) delete process.env.SBT_NEWSLETTER_PRE_SEND_QA;
  else process.env.SBT_NEWSLETTER_PRE_SEND_QA = prior;
});

test("stripHtmlExcerpt drops chrome and keeps readable text", () => {
  const text = stripHtmlExcerpt("<html><script>void 0</script><style>p{}</style><p>Family Night on <b>Wednesday</b></p>");
  assert.match(text, /Family Night on Wednesday/);
  assert.doesNotMatch(text, /script|style|void/);
});

test("pageLooksCancelled matches the generator's tight phrases only", () => {
  assert.equal(pageLooksCancelled("This event has been cancelled."), true);
  assert.equal(pageLooksCancelled("Unfortunately, the Event Organizer has had to cancel your event."), true);
  assert.equal(pageLooksCancelled("No registration or sign up required. There will be no charge for this event."), false);
  assert.equal(pageLooksCancelled("Cancel Culture Book Club meets tonight."), false);
});

test("collectQaTargets de-dupes tonight pick from featured", () => {
  const data = issue({
    tonightPick: beauty,
    featuredEvents: [beauty, { ...beauty, id: "other", title: "Craft Tuesdays" }],
    dayPlan: { cards: [{ id: "place:abc", name: "Stan's Donut Shop", url: "https://www.stansdonutshop.com/" }] },
    recentOpenings: [{ id: "open-1", name: "New Cafe" }],
  });
  const targets = collectQaTargets(data);
  assert.equal(targets.events.length, 2);
  assert.equal(targets.cards.length, 1);
  assert.equal(targets.openings.length, 1);
});

test("deterministicVerdict drops a wrong-date listing and a cancelled page", () => {
  const data = issue({
    tonightPick: { ...beauty, date: "2026-09-09" },
    featuredEvents: [beauty, { ...beauty, date: "2026-09-09" }],
  });
  const reports = [{
    kind: "event",
    id: beauty.id,
    title: beauty.title,
    ok: true,
    status: 200,
    text: "This event has been cancelled. Refunds will be issued.",
  }];
  const verdict = deterministicVerdict(data, reports, new Map());
  assert.ok(verdict.dropTonightPick);
  assert.ok(verdict.dropEventIds.includes(beauty.id));
  assert.ok(verdict.findings.some((row) => /cancelled/i.test(row.reason)));
});

test("deterministicVerdict keeps an item when the fetch fails", () => {
  const data = issue({ featuredEvents: [beauty] });
  const verdict = deterministicVerdict(data, [{
    kind: "event",
    id: beauty.id,
    ok: false,
    status: null,
    error: "TimeoutError",
    text: "",
  }], new Map());
  assert.deepEqual(verdict.dropEventIds, []);
});

test("deterministicVerdict drops a 404 event and a closed meal venue", () => {
  const card = {
    id: "place:ChIJStan",
    name: "Stan's Donut Shop",
    bucket: "breakfast",
    role: "paired-meal",
  };
  const data = issue({
    featuredEvents: [beauty],
    dayPlan: { selectionModel: "pillar-pairs-v1", cards: [card] },
  });
  const placesById = new Map([["ChIJStan", { id: "ChIJStan", hours: { mon: "06:00-14:00" } }]]);
  const verdict = deterministicVerdict(data, [{
    kind: "event",
    id: beauty.id,
    title: beauty.title,
    ok: false,
    status: 404,
    text: "",
  }], placesById);
  assert.ok(verdict.dropEventIds.includes(beauty.id));
  assert.equal(verdict.dropDayPlan, true); // 2026-09-08 is a Tuesday, hours omit tue
});

test("applyQaVerdict cuts the Family Night listing and blanks the lede", () => {
  const data = issue({
    tonightPick: beauty,
    tonightPickBlurb: "Bring kids for Family Night pre-show activities.",
    featuredEvents: [beauty],
    todayEvents: [beauty],
    editorial: {
      briefing: "Beauty and the Beast opens with Family Night pre-show activities if you're bringing kids.",
      eventsNote: "Family Night is tonight.",
    },
  });
  applyQaVerdict(data, {
    ...emptyVerdict(),
    dropEventIds: [beauty.id],
    dropTonightPick: true,
    blankEditorialKeys: ["briefing", "eventsNote"],
  });
  assert.equal(data.tonightPick, null);
  assert.equal(data.featuredEvents.length, 0);
  assert.equal(data.todayEvents.length, 0);
  assert.equal(data.editorial.briefing, "");
  assert.equal(data.editorial.eventsNote, "");
});

test("applyQaVerdict drops an entire pillar-pairs plan when one card is contradicted", () => {
  const hike = { id: "event:hike", name: "Sky Island Tour", role: "pillar", bucket: "morning" };
  const meal = { id: "place:blvd", name: "Blvd Coffee", role: "paired-meal", bucket: "breakfast" };
  const data = issue({
    dayPlan: { selectionModel: "pillar-pairs-v1", cards: [hike, meal] },
    dayPlanBlurb: "Hike then pancakes.",
    editorial: { briefing: "Start on Umunhum, then Blvd." },
  });
  applyQaVerdict(data, { ...emptyVerdict(), dropEventIds: ["event:hike"] });
  assert.equal(data.dayPlan, null);
  assert.equal(data.dayPlanBlurb, "");
  assert.equal(data.editorial.briefing, "");
});

test("parseQaVerdict and mergeVerdicts union cuts", () => {
  const parsed = parseQaVerdict(`\`\`\`json
  {"dropEventIds":["a"],"dropDayPlan":true,"blankEditorialKeys":["briefing"],"findings":[{"item":"A","action":"drop","reason":"cancelled"}]}
  \`\`\``);
  const merged = mergeVerdicts(parsed, { ...emptyVerdict(), dropEventIds: ["b"], dropTonightPick: true });
  assert.deepEqual(new Set(merged.dropEventIds), new Set(["a", "b"]));
  assert.equal(merged.dropDayPlan, true);
  assert.equal(merged.dropTonightPick, true);
  assert.deepEqual(merged.blankEditorialKeys, ["briefing"]);
});

test("fetchSourceExcerpt records 404 and network failure without throwing", async () => {
  const gone = await fetchSourceExcerpt("https://example.com/missing", {
    fetchImpl: async () => ({ ok: false, status: 404, url: "https://example.com/missing", text: async () => "<p>Not found</p>" }),
  });
  assert.equal(gone.ok, false);
  assert.equal(gone.status, 404);
  assert.match(gone.text, /Not found/);

  const miss = await fetchSourceExcerpt("https://example.com/timeout", {
    fetchImpl: async () => { throw new Error("TimeoutError"); },
  });
  assert.equal(miss.ok, false);
  assert.equal(miss.status, null);
  assert.match(miss.error, /TimeoutError/);
});

test("runPreSendQa applies a review cut and fails open when review throws", async () => {
  const live = issue({
    featuredEvents: [beauty],
    todayEvents: [beauty],
    editorial: { briefing: "Family Night is tonight." },
  });
  const pages = {
    [beauty.url]: {
      ok: true,
      status: 200,
      url: beauty.url,
      text: async () => "<p>Family Night on Broadway on Wednesday, September 9</p>",
    },
  };
  const fetchImpl = async (url) => pages[url] || { ok: false, status: 500, url, text: async () => "" };

  const cut = await runPreSendQa(structuredClone(live), {
    persistDefects: false,
    placesById: new Map(),
    fetchImpl,
    reviewFn: async () => JSON.stringify({
      dropEventIds: [beauty.id],
      blankEditorialKeys: ["briefing"],
      findings: [{ item: beauty.title, action: "drop", reason: "Family Night is September 9" }],
    }),
    log: () => {},
  });
  assert.equal(cut.data.featuredEvents.length, 0);
  assert.equal(cut.data.editorial.briefing, "");
  assert.equal(cut.qa.status, "ok");

  const kept = await runPreSendQa(structuredClone(live), {
    persistDefects: false,
    placesById: new Map(),
    fetchImpl,
    reviewFn: async () => { throw new Error("model down"); },
    log: () => {},
  });
  assert.equal(kept.data.featuredEvents.length, 1);
  assert.equal(kept.qa.status, "ok");
  assert.equal(kept.qa.via, "deterministic");
});

test("disabled QA leaves the assembled issue untouched", async () => {
  const data = issue({ featuredEvents: [beauty] });
  const result = await runPreSendQa(data, { enabled: false, persistDefects: false });
  assert.equal(result.qa.status, "disabled");
  assert.equal(result.data.featuredEvents[0].id, beauty.id);
});

test("buildQaPrompt names the issue date and listed ids", () => {
  const prompt = buildQaPrompt(issue({
    tonightPick: beauty,
    featuredEvents: [beauty],
    editorial: { briefing: "Family Night is tonight.", eventsNote: "One show." },
  }), [{ kind: "event", id: beauty.id, ok: true, url: beauty.url, text: "Wednesday, September 9" }]);
  assert.match(prompt, /2026-09-08/);
  assert.match(prompt, /inbound-b60351612d66d165/);
  assert.match(prompt, /Wednesday, September 9/);
});

test("repair still runs after QA so a leftover walk-up claim is blanked", () => {
  const data = issue({
    featuredEvents: [{
      id: "scan-1",
      title: "Community Preservation Lab Scanning Service",
      date: "2026-09-08",
      blurb: "just show up and digitize the shoebox",
    }],
    editorial: { briefing: "just show up at the History Center" },
  });
  applyQaVerdict(data, emptyVerdict());
  repairNewsletterEventFacts(data);
  assert.equal(data.featuredEvents[0].blurb === "" || !/just show up/i.test(data.editorial.briefing), true);
});
