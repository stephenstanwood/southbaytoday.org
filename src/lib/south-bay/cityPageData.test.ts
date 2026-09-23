import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAMPS } from "../../data/south-bay/camps-data";
import { openCampLastDatesForCity } from "./cityCamps";
import {
  getCityPageData,
  selectOpenNowCandidates,
  selectRedditTiles,
  type RawOpenNowCandidate,
  type RawRedditPost,
} from "./cityPageData";

const DE_SAISSET_ID = "ChIJUVuaM6zLj4ARoQSjNyb1ebQ"; // flagged temporarily unavailable

function place(id: string, extra: Partial<RawOpenNowCandidate> = {}): RawOpenNowCandidate {
  return {
    id,
    name: `Place ${id}`,
    displayType: "Cafe",
    category: "food",
    rating: 4.7,
    ratingCount: 250,
    priceLevel: 2,
    hours: { mon: "08:00-17:00" },
    mapsUrl: `https://maps.google.com/?cid=${id}`,
    url: null,
    photoRef: `places/${id}/photos/abc`,
    ...extra,
  };
}

function post(id: string, sub: string, ageHours: number, extra: Partial<RawRedditPost> = {}): RawRedditPost {
  return {
    id,
    sub,
    title: `Post ${id}`,
    summary: "",
    image: `https://img.example/${id}.jpg`,
    score: 10,
    numComments: 3,
    ageHours,
    permalink: `https://reddit.com/${id}`,
    ...extra,
  };
}

test("open-now candidates: only this city, minus unavailable places, trimmed to rendered fields", () => {
  const byCity = {
    "santa-clara": [place("a"), place(DE_SAISSET_ID, { name: "de Saisset Museum" }), place("b", { photoRef: undefined })],
    campbell: [place("c")],
  };
  const out = selectOpenNowCandidates(byCity, "santa-clara");
  assert.deepEqual(out.map((p) => p.id), ["a", "b"]);
  assert.equal("priceLevel" in out[0], false);
  assert.deepEqual(out[0], {
    id: "a",
    name: "Place a",
    displayType: "Cafe",
    category: "food",
    rating: 4.7,
    ratingCount: 250,
    hours: { mon: "08:00-17:00" },
    mapsUrl: "https://maps.google.com/?cid=a",
    url: null,
    photoRef: "places/a/photos/abc",
  });
  // Serializable as-is: no undefined values for JSON.stringify to drop.
  assert.equal(out[1].photoRef, null);
  assert.deepEqual(selectOpenNowCandidates(byCity, "saratoga"), []);
});

test("reddit tiles: local sub, then regional mentioning the city, then bare regional; newest first", () => {
  const posts = [
    post("regional-old", "bayarea", 30),
    post("mention", "bayarea", 40, { summary: "New park opening in Campbell" }),
    post("local-old", "campbell", 20),
    post("local-new", "Campbell", 2, { displayTitle: "Cleaner title" }),
    post("other-city", "SanJose", 1),
    post("no-image", "campbell", 1, { image: null }),
  ];
  const out = selectRedditTiles(posts, "campbell", "Campbell");
  assert.ok(out);
  assert.deepEqual(out.tiles.map((t) => t.id), ["local-new", "local-old", "mention", "regional-old"]);
  assert.equal(out.tiles[0].title, "Cleaner title");
  assert.equal(out.tiles[1].title, "Post local-old");
  assert.equal(out.localSub, "campbell");
});

test("reddit tiles: regional-only grids don't credit a local sub, and one tile isn't a grid", () => {
  const regional = selectRedditTiles([post("r1", "bayarea", 1), post("r2", "AskSF", 2)], "cupertino", "Cupertino");
  assert.equal(regional?.localSub, null);
  assert.equal(selectRedditTiles([post("r1", "bayarea", 1)], "cupertino", "Cupertino"), null);
  const many = Array.from({ length: 12 }, (_, i) => post(`p${i}`, "SanJose", i));
  assert.equal(selectRedditTiles(many, "san-jose", "San José")?.tiles.length, 8);
});

test("camp last dates: one entry per open camp, the last session's end date", () => {
  const sanJose = CAMPS.filter((c) => c.cityId === "san-jose");
  const preseason = openCampLastDatesForCity("san-jose", "2026-01-01");
  assert.equal(preseason.length, sanJose.length);
  for (const [i, camp] of sanJose.entries()) {
    const last = camp.weeks.length ? camp.weeks.map((w) => w.endDate).sort().at(-1) : null;
    assert.equal(preseason[i], last);
  }
  // Only undated (year-round) programs outlast every dated session.
  assert.deepEqual(
    openCampLastDatesForCity("san-jose", "2099-01-01"),
    sanJose.filter((c) => c.weeks.length === 0).map(() => null),
  );
});

test("city page data serializes to island props without losing anything", () => {
  const data = getCityPageData("san-jose", "San José");
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
});

// CityPage is a client:load island: whatever it imports ships to every city
// page. Importing the all-city JSON there once put ~340 KB of other cities'
// data on each page, so its data has to come in through cityPageData.ts.
test("CityPage imports no all-city data (only types from cityPageData)", () => {
  const src = readFileSync(new URL("../../components/south-bay/city/CityPage.tsx", import.meta.url), "utf8");
  const specs = [...src.matchAll(/^import\s+(type\s+)?[\s\S]*?\sfrom\s+"([^"]+)";?$/gm)]
    .map((m) => ({ typeOnly: !!m[1], spec: m[2] }));
  assert.ok(specs.length > 0);
  for (const { typeOnly, spec } of specs) {
    assert.doesNotMatch(spec, /\.json$|\/data\/|cityCamps|placeAvailability/, `CityPage imports ${spec}`);
    if (/cityPageData$/.test(spec)) assert.ok(typeOnly, "CityPage may only `import type` from cityPageData");
  }
});
