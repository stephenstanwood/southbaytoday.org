import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAMPS } from "./campFinder";
import { campsForCity } from "./cityCamps";
import {
  getCityPageData,
  selectOpenNowCandidates,
  type RawOpenNowCandidate,
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

test("camps pointer: the city's sourced programs and the page that lists them", () => {
  const sunnyvale = CAMPS.programs.filter((p) => p.citySlug === "sunnyvale").length;
  assert.ok(sunnyvale > 0);
  assert.deepEqual(campsForCity("sunnyvale"), { count: sunnyvale, href: "/camps/city/sunnyvale" });
  assert.equal(campsForCity("no-such-city"), null);
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
