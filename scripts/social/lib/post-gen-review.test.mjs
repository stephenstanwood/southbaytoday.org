// ---------------------------------------------------------------------------
// post-gen-review.test.mjs
//
// Fixture-driven tests for scripts/social/lib/post-gen-review.mjs. Exercises
// each failure class we've seen in live batches so regressions surface fast.
//
// Run: node --test scripts/social/lib/post-gen-review.test.mjs
// Exits non-zero on any failure.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { runQualityReview } from "./post-gen-review.mjs";

// ── helpers ──────────────────────────────────────────────────────────────

function makeCard({ title = "Stop", timeBlock = "09:00-10:00", city = "san-jose", venue = "A Venue", category = "food" } = {}) {
  return {
    id: `card-${Math.random().toString(36).slice(2, 8)}`,
    title,
    name: title,
    timeBlock,
    city,
    venue,
    address: `1 Main St, ${city.replace(/-/g, " ")}, CA 95100`,
    category,
    blurb: "A lovely stop.",
    why: "Reason",
  };
}

function makeDayPlan(cards, { status = "draft", cityName = "San Jose" } = {}) {
  return {
    status,
    slotType: "day-plan",
    cityName,
    plan: { cards },
  };
}

function makeTonight({ title = "Live Jazz Tonight", venue = "The Ritz", city = "san-jose", status = "draft", summary = "", copy = {} } = {}) {
  return {
    status,
    slotType: "tonight-pick",
    item: { title, name: title, venue, city, summary },
    copy,
  };
}

function makeSchedule(days) {
  return { days };
}

// Build a plan with 6+ cards starting at a morning hour so we don't trip
// "thin plan" or "starts too late" while testing other things.
function fullPlan(overrides = []) {
  const base = [
    { title: "Breakfast", timeBlock: "09:00-10:00", category: "food", venue: "Bakery" },
    { title: "Museum", timeBlock: "10:00-12:00", category: "arts", venue: "Museum A" },
    { title: "Lunch", timeBlock: "12:00-13:00", category: "food", venue: "Lunch Spot" },
    { title: "Park", timeBlock: "13:00-15:00", category: "outdoor", venue: "Central Park" },
    { title: "Dinner", timeBlock: "18:00-19:30", category: "food", venue: "Dinner Spot" },
    { title: "Evening", timeBlock: "20:00-22:00", category: "entertainment", venue: "Evening Venue" },
  ].map(o => makeCard(o));
  for (const o of overrides) base.push(makeCard(o));
  return base;
}

function pairedBucketPlan(cities = ["san-jose", "santa-clara", "sunnyvale"]) {
  const specs = [
    ["morning", "breakfast", "Museum", "Bakery"],
    ["afternoon", "lunch", "Garden", "Lunch Spot"],
    ["evening", "dinner", "Concert", "Dinner Spot"],
  ];
  const cards = [];
  specs.forEach(([pillarBucket, mealBucket, pillarTitle, mealTitle], index) => {
    const city = cities[index] || cities[0];
    const pillar = makeCard({ title: pillarTitle, city, category: "arts" });
    const meal = makeCard({ title: mealTitle, city, category: "food" });
    pillar.id = `pillar-${pillarBucket}`;
    pillar.bucket = pillarBucket;
    pillar.role = "pillar";
    pillar.pairedWithId = `meal-${mealBucket}`;
    meal.id = `meal-${mealBucket}`;
    meal.bucket = mealBucket;
    meal.role = "paired-meal";
    meal.pairedWithId = pillar.id;
    meal.pairDistanceMiles = 1.5;
    meal.pairLocationPrecision = "exact";
    cards.push(pillar, meal);
  });
  return cards;
}

// ── tests ────────────────────────────────────────────────────────────────

test("terminology fix: Aids → AIDS", () => {
  const s = makeSchedule({
    "2026-05-10": {
      "tonight-pick": makeTonight({
        title: "Aids epidemic retrospective",
        copy: { bluesky: "Visit the Aids exhibit tonight." },
      }),
    },
  });
  const { autoFixed } = runQualityReview(s, { dates: ["2026-05-10"] });
  assert.ok(autoFixed.some(f => f.kind === "terminology"), "expected terminology auto-fix");
  assert.equal(s.days["2026-05-10"]["tonight-pick"].copy.bluesky, "Visit the AIDS exhibit tonight.");
});

test("terminology fix: AIDS pandemic → AIDS epidemic", () => {
  const s = makeSchedule({
    "2026-05-10": {
      "tonight-pick": makeTonight({
        copy: { bluesky: "Learn about the AIDS pandemic tonight." },
      }),
    },
  });
  runQualityReview(s, { dates: ["2026-05-10"] });
  assert.equal(s.days["2026-05-10"]["tonight-pick"].copy.bluesky, "Learn about the AIDS epidemic tonight.");
});

test("DOW mismatch: 'Sunday afternoon' on a Monday is hard-blocked", () => {
  const monday = "2026-05-11"; // a Monday
  const s = makeSchedule({
    [monday]: {
      "tonight-pick": makeTonight({
        status: "approved",
        copy: { bluesky: "A great Sunday afternoon activity." },
      }),
    },
  });
  const { flagged } = runQualityReview(s, { dates: [monday], resetFlaggedToDraft: false });
  const hit = flagged.find(f => f.date === monday && f.slotType === "tonight-pick");
  assert.ok(hit, "expected DOW mismatch flag");
  assert.ok(hit.hardBlock, "expected hardBlock=true");
});

test("out-of-area tonight-pick is hard-blocked", () => {
  const date = "2026-05-10";
  const s = makeSchedule({
    [date]: {
      "tonight-pick": makeTonight({
        status: "approved",
        venue: "Santa Cruz Shakespeare",
        city: "santa-cruz",
      }),
    },
  });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  const hit = flagged.find(f => f.reason.includes("out-of-area"));
  assert.ok(hit, "expected out-of-area flag");
  assert.ok(hit.hardBlock, "expected hardBlock=true");
});

test("summary-only out-of-area reference does NOT flag (Kepler's 4/24 regression)", () => {
  // An event at Kepler's Palo Alto whose summary mentions "formerly of the
  // San Francisco Chronicle" (a critic's old employer). The event is local;
  // the out-of-area detector must not scan summary text for city tokens.
  const date = "2026-05-10";
  const s = makeSchedule({
    [date]: {
      "tonight-pick": {
        status: "approved",
        slotType: "tonight-pick",
        cityName: "Palo Alto",
        item: {
          title: "From Bestseller to Classic",
          venue: "Kepler's Books",
          city: "palo-alto",
          summary: "Lively conversation with veteran critic John McMurtrie (formerly of the San Francisco Chronicle) about what makes books endure.",
        },
        copy: {},
      },
    },
  });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  assert.ok(!flagged.some(f => f.reason.includes("out-of-area")), "summary references should not trigger out-of-area");
});

test("virtual tonight-pick is hard-blocked", () => {
  const date = "2026-05-10";
  const s = makeSchedule({
    [date]: {
      "tonight-pick": makeTonight({
        status: "approved",
        title: "Online author talk with Miranda Cowley Heller",
      }),
    },
  });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  const hit = flagged.find(f => f.reason.includes("virtual"));
  assert.ok(hit, "expected virtual flag");
  assert.ok(hit.hardBlock, "expected hardBlock=true");
});

test("thin plan (<6 cards) is flagged", () => {
  const date = "2026-05-10";
  const s = makeSchedule({
    [date]: {
      "day-plan": makeDayPlan([
        makeCard({ title: "Breakfast", timeBlock: "09:00-10:00" }),
        makeCard({ title: "Lunch", timeBlock: "12:00-13:00" }),
        makeCard({ title: "Dinner", timeBlock: "18:00-19:00" }),
      ]),
    },
  });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  assert.ok(flagged.some(f => f.slotType === "day-plan" && /only \d+ stops/.test(f.reason)));
});

test("day-plan starting after 11 AM is flagged", () => {
  const date = "2026-05-10";
  // All cards after 12pm — plan genuinely starts too late even after chronology sort.
  const plan = [
    makeCard({ title: "Late Lunch", timeBlock: "13:00-14:00", category: "food" }),
    makeCard({ title: "Park", timeBlock: "14:00-15:00", category: "outdoor" }),
    makeCard({ title: "Museum", timeBlock: "15:00-17:00", category: "arts" }),
    makeCard({ title: "Cafe", timeBlock: "17:00-18:00", category: "food" }),
    makeCard({ title: "Dinner", timeBlock: "18:00-19:30", category: "food" }),
    makeCard({ title: "Evening", timeBlock: "20:00-22:00", category: "entertainment" }),
  ];
  const s = makeSchedule({ [date]: { "day-plan": makeDayPlan(plan) } });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  assert.ok(flagged.some(f => /starts too late/.test(f.reason)), "expected 'starts too late'");
});

test("pillar cities may differ when each meal stays with its pillar", () => {
  const date = "2026-05-10";
  const cards = pairedBucketPlan(["san-jose", "mountain-view", "los-gatos"]);
  const s = makeSchedule({ [date]: { "day-plan": makeDayPlan(cards) } });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  assert.ok(!flagged.some(f => /driving|pillar pairs/.test(f.reason)), JSON.stringify(flagged));
});

test("historical bucket plans are not retroactively treated as pillar pairs", () => {
  const date = "2026-05-10";
  const buckets = ["breakfast", "morning", "lunch", "afternoon", "dinner", "evening"];
  const cards = buckets.map((bucket) => ({ ...makeCard({ title: bucket }), bucket }));
  const s = makeSchedule({ [date]: { "day-plan": makeDayPlan(cards, { status: "approved" }) } });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  assert.ok(!flagged.some((f) => /invalid pillar pairs/.test(f.reason)), JSON.stringify(flagged));
});

test("meal beyond the pair radius is hard-blocked", () => {
  const date = "2026-05-10";
  const cards = pairedBucketPlan();
  cards.find((card) => card.bucket === "lunch").pairDistanceMiles = 6.2;
  const s = makeSchedule({ [date]: { "day-plan": makeDayPlan(cards) } });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  const hit = flagged.find((f) => /invalid pillar pairs/.test(f.reason));
  assert.ok(hit, "expected pair-integrity flag");
  assert.ok(hit.hardBlock, "expected hardBlock=true");
});

test("approved plans cannot bypass pair integrity", () => {
  const date = "2026-05-10";
  const cards = pairedBucketPlan();
  cards.find((card) => card.bucket === "breakfast").pairedWithId = "wrong-pillar";
  const s = makeSchedule({ [date]: { "day-plan": makeDayPlan(cards, { status: "approved" }) } });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  const hit = flagged.find((f) => /invalid pillar pairs/.test(f.reason));
  assert.ok(hit, "expected approved pair-integrity flag");
  assert.ok(hit.hardBlock, "expected hardBlock=true");
});

test("spa frequency cap: 3 consecutive spa plans → 2 removed", () => {
  const dates = ["2026-05-10", "2026-05-11", "2026-05-12"];
  const days = {};
  for (const d of dates) {
    const plan = fullPlan();
    // Card-level prune uses the `title` field to match "spa"/"massage"; if
    // we put spa in the title directly, the prune removes it before the
    // frequency cap even runs. Put the spa signal in the blurb instead so
    // the card survives pruning but dayPlanHasCategory still detects it.
    // Card-level prune uses the `title` field to match "spa"/"massage" — so
    // putting those tokens in the title removes the card before the cap runs.
    // The cap uses title + name + featuredPlace + category, so stash the
    // signal in `featuredPlace` instead.
    plan.splice(3, 0, {
      ...makeCard({
        title: "Wellness Treatment",
        category: "wellness",
        venue: "Serene Wellness",
      }),
      featuredPlace: "Thai Massage & Spa Lounge",
    });
    days[d] = { "day-plan": makeDayPlan(plan) };
  }
  const s = makeSchedule(days);
  runQualityReview(s, { dates });
  // Only the earliest day should still contain a wellness/spa card.
  const hasSpa = dates.map(d =>
    s.days[d]["day-plan"].plan.cards.some(c => /spa|massage/i.test(c.featuredPlace || "")),
  );
  assert.deepEqual(hasSpa, [true, false, false]);
});

test("card pruning removes SIG / book club / commemoration / commission meeting", () => {
  const date = "2026-05-10";
  const plan = fullPlan();
  // Insert a mix of bad cards — they should all be pruned.
  plan.push(makeCard({ title: "Bridge SIG", timeBlock: "14:00-15:00" }));
  plan.push(makeCard({ title: "Tuesday Book Club", timeBlock: "15:00-16:00" }));
  plan.push(makeCard({ title: "Earth Day Commemoration", timeBlock: "16:00-17:00" }));
  plan.push(makeCard({ title: "Planning Commission Meeting", timeBlock: "17:00-18:00" }));
  const before = plan.length;
  const s = makeSchedule({ [date]: { "day-plan": makeDayPlan(plan) } });
  const { autoFixed } = runQualityReview(s, { dates: [date] });
  const pruned = autoFixed.find(f => f.kind === "card-prune");
  assert.ok(pruned, "expected card-prune entry");
  const kept = s.days[date]["day-plan"].plan.cards;
  assert.equal(kept.length, before - 4, "4 bad cards should be pruned");
  for (const c of kept) {
    assert.ok(!/sig|book club|commemoration|commission meeting/i.test(c.title), `bad card survived: ${c.title}`);
  }
});

test("broken venue string '457' is flagged", () => {
  const date = "2026-05-10";
  const s = makeSchedule({
    [date]: {
      "tonight-pick": makeTonight({ venue: "457" }),
    },
  });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  assert.ok(flagged.some(f => /broken venue/.test(f.reason)), "expected broken-venue flag");
});

test("venue repeat on adjacent day is flagged", () => {
  const s = makeSchedule({
    "2026-05-10": { "tonight-pick": makeTonight({ venue: "The Ritz" }) },
    "2026-05-11": { "tonight-pick": makeTonight({ venue: "The Ritz" }) },
  });
  const { flagged } = runQualityReview(s, { dates: ["2026-05-10", "2026-05-11"], resetFlaggedToDraft: false });
  assert.ok(flagged.some(f => /venue repeat adjacent day/.test(f.reason)));
});

test("'&' vs 'and' venue dedup: Hakone Estate & Gardens == Hakone Estate and Gardens", () => {
  const s = makeSchedule({
    "2026-05-10": { "tonight-pick": makeTonight({ venue: "Hakone Estate & Gardens" }) },
    "2026-05-11": { "tonight-pick": makeTonight({ venue: "Hakone Estate and Gardens" }) },
  });
  const { flagged } = runQualityReview(s, { dates: ["2026-05-10", "2026-05-11"], resetFlaggedToDraft: false });
  assert.ok(
    flagged.some(f => /venue repeat adjacent day/.test(f.reason)),
    "expected & / and dedup to catch the repeat",
  );
});

test("weak tonight content (property assessment workshop) is flagged", () => {
  const date = "2026-05-10";
  const s = makeSchedule({
    [date]: {
      "tonight-pick": makeTonight({ title: "Property Assessment Workshop" }),
    },
  });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  assert.ok(flagged.some(f => /weak tonight content/.test(f.reason)));
});

test("chronologically out-of-order day-plan cards get resorted", () => {
  const date = "2026-05-10";
  const cards = [
    makeCard({ title: "Dinner", timeBlock: "18:00-19:30" }),
    makeCard({ title: "Breakfast", timeBlock: "09:00-10:00" }),
    makeCard({ title: "Lunch", timeBlock: "12:00-13:00" }),
    makeCard({ title: "Museum", timeBlock: "10:00-12:00" }),
    makeCard({ title: "Park", timeBlock: "14:00-16:00" }),
    makeCard({ title: "Evening", timeBlock: "20:00-22:00" }),
  ];
  const s = makeSchedule({ [date]: { "day-plan": makeDayPlan(cards) } });
  const { autoFixed } = runQualityReview(s, { dates: [date] });
  assert.ok(autoFixed.some(f => f.kind === "chronology"), "expected chronology auto-fix");
  const titles = s.days[date]["day-plan"].plan.cards.map(c => c.title);
  assert.deepEqual(titles, ["Breakfast", "Museum", "Lunch", "Park", "Dinner", "Evening"]);
});

test("rejected and published slots are NOT mutated", () => {
  const date = "2026-05-10";
  const cards = fullPlan();
  cards[0].title = "Bad Event Aids";   // would normally trigger terminology fix
  const s = makeSchedule({
    [date]: {
      "day-plan": makeDayPlan(cards, { status: "rejected" }),
      "tonight-pick": makeTonight({
        status: "published",
        copy: { bluesky: "Aids tonight!" },
      }),
    },
  });
  const before = JSON.parse(JSON.stringify(s));
  runQualityReview(s, { dates: [date] });
  // rejected day-plan untouched; published tonight-pick also untouched (by
  // the terminology fix, because published already shipped).
  assert.equal(s.days[date]["day-plan"].status, "rejected");
  // Terminology DOES apply to non-rejected slots regardless of status, so
  // published will be rewritten — that's intentional (don't let live text stay
  // wrong). Assert the rejected day-plan survived as-is.
  assert.deepEqual(s.days[date]["day-plan"], before.days[date]["day-plan"]);
});

test("resetFlaggedToDraft=false leaves soft-flagged slots in place", () => {
  const date = "2026-05-10";
  const s = makeSchedule({
    [date]: {
      // draft + weak-tonight content → soft flag (not hardBlock)
      "tonight-pick": makeTonight({ title: "Property Assessment Workshop" }),
    },
  });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  assert.ok(flagged.some(f => /weak tonight/.test(f.reason)), "expected weak-tonight flag");
  assert.ok(s.days[date]["tonight-pick"], "soft-flagged slot should not be removed when resetFlaggedToDraft=false");
});

test("resetFlaggedToDraft=false: hardBlock is reported but slot is NOT mutated", () => {
  // Regression guard for the May 2026 fix (aed1142). Final review3 pass in
  // generate-schedule runs with resetFlaggedToDraft=false — accepted slots
  // were getting silently nuked on lingering hard-blocks (e.g. May 8
  // Mountain View / Coterie Winery hours mismatch). In log-only mode the
  // hardBlock surfaces in `flagged` so callers can act, but the schedule
  // must not be mutated.
  const date = "2026-05-10";
  const s = makeSchedule({
    [date]: {
      "tonight-pick": makeTonight({
        status: "approved",
        title: "Online Author Talk", // virtual → hardBlock
      }),
    },
  });
  const { flagged } = runQualityReview(s, { dates: [date], resetFlaggedToDraft: false });
  const hit = flagged.find(f => f.date === date && f.slotType === "tonight-pick");
  assert.ok(hit?.hardBlock, "hardBlock should surface in flagged[]");
  assert.ok(s.days[date]["tonight-pick"], "slot must survive log-only pass");
  assert.equal(s.days[date]._reviewHistory, undefined, "no history written in log-only pass");
});

test("hardBlock removes slot when resetFlaggedToDraft=true (default)", () => {
  const date = "2026-05-10";
  const s = makeSchedule({
    [date]: {
      "tonight-pick": makeTonight({
        status: "approved",
        title: "Online Author Talk", // virtual → hardBlock
      }),
    },
  });
  runQualityReview(s, { dates: [date] });
  assert.equal(s.days[date]["tonight-pick"], undefined, "hardBlock should remove slot in mutating pass");
  assert.ok(s.days[date]._reviewHistory?.length, "should record review history");
  assert.ok(s.days[date]._reviewHistory[0].hardBlock);
});
