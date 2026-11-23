import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, canonicalCity, displayName, rateLabel, summerWeeks, weekLabel } from "./camp-finder.mjs";

const checked = "2026-11-23";
const src = (url) => ({ url, checked });

function record(overrides = {}) {
  return {
    id: "robot-lab-sunnyvale-ca",
    name: "Robot Lab",
    operator: "Example Science Camps",
    kind: "day",
    address: { street: "1 Main St", city: "Sunnyvale", state: "CA", zip: "94087" },
    ages: { min: 7, max: 9, unit: "years" },
    season: 2027,
    dates: [{ start: "2027-07-12", end: "2027-07-16" }],
    price: { currency: "USD", unit: "session", rates: { "Posted camp rate": 61900 } },
    registration: { opens: "2026-12-01" },
    financialAid: "yes",
    topics: ["stem", "not-a-topic"],
    url: "https://camp.example/robot-lab",
    sources: {
      ages: src("https://camp.example/robot-lab"),
      dates: src("https://camp.example/robot-lab"),
      price: src("https://camp.example/rates"),
      financialAid: src("https://camp.example/aid"),
    },
    ...overrides,
  };
}

test("all-caps camp names get title case; acronyms and mixed case stay", () => {
  assert.equal(displayName("STEAM: OUTER SPACE ( 5-6 YEAR OLDS)"), "STEAM: Outer Space (5-6 Year Olds)");
  assert.equal(displayName("AROUND THE WORLD, PHOTOGRAPHY AND MAKERS MARKET"), "Around the World, Photography and Makers Market");
  assert.equal(displayName("Camp Galileo"), "Camp Galileo");
  assert.equal(displayName("iD Tech  Camp"), "iD Tech Camp");
});

test("San Jose and San José are one city, written the site's way", () => {
  assert.deepEqual(canonicalCity("San Jose"), { slug: "san-jose", name: "San José" });
  assert.deepEqual(canonicalCity("San José"), { slug: "san-jose", name: "San José" });
  assert.deepEqual(canonicalCity("Los Altos Hills"), { slug: "los-altos-hills", name: "Los Altos Hills" });
  assert.equal(canonicalCity(""), null);
});

test("rate labels read as words, with dates spelled out", () => {
  assert.equal(rateLabel("full_day_early_bird_5_day_week_through_2027-03-01"), "Full day early bird 5 day week through Mar 1, 2027");
  assert.equal(rateLabel("YMCA member"), "YMCA member");
});

test("weeks run Monday to Friday, starting in June through August", () => {
  assert.equal(weekLabel("2027-06-28", "2027-07-02"), "Jun 28–Jul 2");
  const programs = [
    { season: 2027, sessions: [{ start: "2027-06-14", end: "2027-06-25" }] },
    { season: 2027, sessions: [{ start: "2027-08-30", end: "2027-09-03" }] },
    { season: 2027, sessions: [{ start: "2027-09-06", end: "2027-09-10" }] },
    { season: 2027, sessions: [{ start: "2027-05-17", end: "2027-05-21" }] },
    { season: 2026, sessions: [{ start: "2026-07-06", end: "2026-07-10" }] },
  ];
  assert.deepEqual(summerWeeks(programs, 2027).map((w) => w.start), ["2027-06-14", "2027-06-21", "2027-08-30"]);
});

test("a snapshot keeps facts and their sources, and the index stays slim", () => {
  const { snapshot, index, problems } = buildSnapshot([JSON.stringify(record())], {
    dataCommit: "abc123",
    region: "santa-clara-county-ca",
    regionName: "Santa Clara County",
  });
  assert.deepEqual(problems, []);
  const [p] = snapshot.programs;
  assert.equal(p.city, "Sunnyvale");
  assert.deepEqual(p.topics, ["stem"]);
  assert.deepEqual(p.price, { unit: "session", rates: [{ label: "Posted camp rate", cents: 61900 }] });
  assert.equal(snapshot.urls[p.src.price[0]], "https://camp.example/rates");
  assert.equal(p.src.price[1], checked);
  assert.equal(snapshot.checkedThrough, checked);
  const [row] = index.programs;
  // A one-week session reads as a weekly price.
  assert.deepEqual(row.price, [61900, 61900, "week"]);
  assert.equal(row.aid, true);
  assert.equal(row.opens, "2026-12-01");
  assert.equal(index.operators[row.op].name, "Example Science Camps");
  assert.equal("src" in row, false);
});

test("posted-later fields stay empty instead of guessed", () => {
  const { snapshot } = buildSnapshot(
    [JSON.stringify(record({ dates: "not yet posted", price: "not yet posted", registration: "not stated", financialAid: "not stated" }))],
    { region: "r", regionName: "R" },
  );
  const [p] = snapshot.programs;
  assert.deepEqual(p.sessions, []);
  assert.equal(p.price, null);
  assert.equal(p.registration, null);
  assert.equal(p.financialAid, "not stated");
  assert.equal(snapshot.counts.postedLatestSeason, 0);
});

test("a newer season wins a duplicate id, and broken lines are reported", () => {
  const older = record({ season: 2026, dates: [{ start: "2026-07-13", end: "2026-07-17" }] });
  const newer = record();
  const { snapshot, problems } = buildSnapshot(
    [JSON.stringify(newer), JSON.stringify(older), "{not json", JSON.stringify(record({ id: "Bad Id" }))],
    { region: "r", regionName: "R" },
  );
  assert.equal(snapshot.programs.length, 1);
  assert.equal(snapshot.programs[0].season, 2027);
  assert.equal(problems.length, 2);
});

test("multiple-site camps take their first site's city", () => {
  const { snapshot } = buildSnapshot(
    [JSON.stringify(record({
      address: { kind: "multiple", locations: [
        { street: "477 Fremont Avenue", city: "Los Altos", state: "CA", zip: "94024" },
        { street: "327 Fremont Avenue", city: "Los Altos", state: "CA", zip: "94024" },
      ] },
    }))],
    { region: "r", regionName: "R" },
  );
  assert.equal(snapshot.programs[0].citySlug, "los-altos");
  assert.equal(snapshot.programs[0].address.multiple.length, 2);
});
