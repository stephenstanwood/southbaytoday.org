import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyFinalInspection,
  discardConflictingFoodPhotos,
  isAddressDerivedBusinessName,
  isVerifiedOpeningRecord,
  normalizeSouthBayAddress,
  normalizeComingSoonDiscovery,
} from "./scc-food-openings.mjs";
import { cleanName, shouldSkip } from "../generate-scc-food-openings.mjs";

test("county business names retain meaningful trailing numbers", () => {
  // SCC record SR0881159, 735 Villa St, Mountain View. The name's 101 is
  // not the street number or a permit code.
  assert.equal(cleanName("FIESTA DEL MAR-DUMPLING 101"), "Fiesta Del Mar-Dumpling 101");
  assert.equal(cleanName("PHO 54"), "Pho 54");
});

test("numeric business names still lose explicit permit and entity suffixes", () => {
  assert.equal(cleanName("E-DUMPLING 101 - RESTAURANT T.I."), "Dumpling 101");
  assert.equal(cleanName("RTI DUMPLING 101 LLC"), "Dumpling 101");
  assert.equal(cleanName("DUMPLING 101 PC03"), "Dumpling 101");
});

test("newer school, mobile-food and vending finals remain intentional exclusions", () => {
  for (const record of [
    { record_id: "SR0880433", business_name: "E-SANTA CLARA HIGH SCHOOL POOL UPGRADE", city: "SANTA CLARA" },
    { record_id: "SR0879270", business_name: "E-EL BOMBERO 408 INC MFF", site_location: "MFF" },
    { record_id: "SR0882279", business_name: "E-HILTON SANTA CLARA VENDING", city: "SANTA CLARA" },
  ]) assert.equal(shouldSkip(record), true);
  assert.equal(shouldSkip({ business_name: "CAFE BISTRO", city: "MOUNTAIN VIEW" }), false);
});

test("food photos shared across different cities are suppressed across feed groups and cached as missing", () => {
  const inspection = {
    sourceId: "SR0884734", name: "Bonbon Matcha", cityId: "palo-alto",
    photoRef: "places/shared-place/photos/inspection-photo",
  };
  const comingSoon = {
    sourceId: "SR0885773", name: "More Yogurt", cityId: "cupertino",
    photoRef: "places/shared-place/photos/another-photo",
  };
  const unrelated = {
    sourceId: "other", name: "Another Cafe", cityId: "cupertino",
    photoRef: "places/another-place/photos/photo", image: "https://example.com/fallback.webp",
  };
  const cache = Object.fromEntries([inspection, comingSoon, unrelated].map((item) => [item.sourceId, item.photoRef]));

  const conflicts = discardConflictingFoodPhotos([inspection, comingSoon, unrelated], cache);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].placeId, "shared-place");
  assert.equal(inspection.photoRef, undefined);
  assert.equal(comingSoon.photoRef, undefined);
  assert.equal(cache.SR0884734, null);
  assert.equal(cache.SR0885773, null);
  assert.equal(unrelated.photoRef, "places/another-place/photos/photo");
  assert.equal(unrelated.image, "https://example.com/fallback.webp");
  assert.equal(cache.other, unrelated.photoRef);
  assert.deepEqual(discardConflictingFoodPhotos([inspection, comingSoon, unrelated], cache), []);
});

test("food photos shared at one locality and records without a known locality remain unchanged", () => {
  const items = [
    { cityId: "palo-alto", photoRef: "places/same-place/photos/a" },
    { cityName: "PALO ALTO", photoRef: "places/same-place/photos/b" },
    { photoRef: "places/same-place/photos/c" },
    { cityId: "cupertino", image: "https://example.com/illustration.webp" },
  ];
  const before = structuredClone(items);
  assert.deepEqual(discardConflictingFoodPhotos(items), []);
  assert.deepEqual(items, before);
});

test("canonical food data never assigns one Google place's photos across different cities", () => {
  const data = JSON.parse(readFileSync(
    new URL("../../src/data/south-bay/scc-food-openings.json", import.meta.url), "utf8",
  ));
  assert.deepEqual(discardConflictingFoodPhotos([
    ...(data.opened || []), ...(data.inspections || []), ...(data.comingSoon || []),
  ]), []);
});

test("the verified operating Holger Way Target does not reappear as coming soon", () => {
  assert.equal(shouldSkip({
    record_id: "SR0879489", business_name: "E-TARGET SAN JOSE NORTH GROCERY",
    site_location: "95 HOLGER WY., SAN JOSE, CA 95134", city: "SAN JOSE",
    date_plan_approved: "2026-10-08T00:00:00.000",
  }), true);
  assert.equal(shouldSkip({
    record_id: "SR0879490", business_name: "E-TARGET SAN JOSE NORTH STARBUCKS RESTAURANT",
    site_location: "95 HOLGER WY., SAN JOSE, CA 95134", city: "SAN JOSE",
    date_plan_approved: "2026-10-08T00:00:00.000",
  }), true);
});

test("abbreviated sink and milkshake station filings remain equipment work", () => {
  for (const business_name of [
    "TASTY NOODLE - 3 COMP SINK INSTALL",
    "E-AMERICAN CAFE MILKSHAKE STATION",
  ]) assert.equal(shouldSkip({ business_name, city: "SAN JOSE" }), true);
  for (const business_name of ["TASTY NOODLE", "AMERICAN CAFE", "MILKSHAKE CAFE"]) {
    assert.equal(shouldSkip({ business_name, city: "SAN JOSE" }), false);
  }
});

test("Reddit discovery dates and blurbs cannot become verified opening claims", () => {
  const lead = {
    name: "Example Cafe", cityId: "san-jose", date: "2026-10-09",
    blurb: "Opening Friday, October 9 with the city's largest food hall.",
    source: "https://www.reddit.com/r/SanJose/comments/example/",
    discoveryMethod: "reddit-pulse",
  };
  const result = normalizeComingSoonDiscovery(lead);
  assert.equal(result.date, null);
  assert.equal(result.blurb, null);
  assert.equal(result.source, lead.source);
  assert.equal(lead.date, "2026-10-09");
  const permit = { ...lead, discoveryMethod: undefined };
  assert.equal(normalizeComingSoonDiscovery(permit), permit);
});

test("SPARK Social uses its own coming-soon page without the Reddit opening date", () => {
  const lead = {
    name: "Spark Social San Jose", cityId: "san-jose", date: null,
    blurb: "A food hall opening on Friday, October 9.",
    discoveryMethod: "reddit-pulse",
  };
  const result = normalizeComingSoonDiscovery(lead);
  assert.equal(result.source, "https://visitsparksocial.com/san-jose/");
  assert.equal(result.date, null);
  assert.match(result.blurb, /food-truck park/);
  assert.doesNotMatch(result.blurb, /October 9|food hall/);
  assert.equal(normalizeComingSoonDiscovery({ ...lead, cityId: "santa-clara" }).blurb, null);
  assert.deepEqual(normalizeComingSoonDiscovery(result), result);
});

test("normalizes De Anza street names from SCC permit spelling", () => {
  assert.equal(normalizeSouthBayAddress("1655 S Deanza Blvd"), "1655 S De Anza Blvd");
  assert.equal(normalizeSouthBayAddress("South Deanza Boulevard"), "South De Anza Boulevard");
});

test("repairs the SCC Santa Row typo to Santana Row", () => {
  assert.equal(normalizeSouthBayAddress("355 Santa Row #1060"), "355 Santana Row #1060");
  assert.equal(normalizeSouthBayAddress("377 Santana Row"), "377 Santana Row");
  assert.equal(normalizeSouthBayAddress("82-96 E Santa Clara St."), "82-96 E Santa Clara St.");
});

test("collapses a street number SCC repeated at the front of the address", () => {
  // Spice Fusion, Sunnyvale, 2026-08-12 shipped as "1026 1026 W Evelyn Ave".
  assert.equal(normalizeSouthBayAddress("1026 1026 W Evelyn Ave"), "1026 W Evelyn Ave");
  assert.equal(normalizeSouthBayAddress("1205 1205 Camino Ramon"), "1205 Camino Ramon");
});

test("leaves address numbers that only look duplicated alone", () => {
  assert.equal(normalizeSouthBayAddress("1 1st St"), "1 1st St");
  assert.equal(normalizeSouthBayAddress("82-96 E Santa Clara St."), "82-96 E Santa Clara St.");
  assert.equal(normalizeSouthBayAddress("1205 Camino Ramon"), "1205 Camino Ramon");
  // A repeat that isn't at the front is real data, not a concatenation artifact.
  assert.equal(normalizeSouthBayAddress("100 W 100 Ave"), "100 W 100 Ave");
});

test("rejects the two SCC records whose deduped prefix recreated Great American P", () => {
  const siteLocation = "4988 GREAT AMERICAN PY., SANTA CLARA, CA 95054";

  assert.equal(
    isAddressDerivedBusinessName("E-4988 GREAT AMERICAN P CAFE", siteLocation),
    true,
  );
  assert.equal(
    isAddressDerivedBusinessName("E-4988 GREAT AMERICAN P COFFEE BAR", siteLocation),
    true,
  );
});

test("rejects both full and truncated address-only display names", () => {
  assert.equal(
    isAddressDerivedBusinessName("14612 Big Basin Wy", "14612 BIG BASIN WY., SARATOGA, CA"),
    true,
  );
  assert.equal(
    isAddressDerivedBusinessName("4988 Great American P", "4988 Great American Pkwy"),
    true,
  );
});

test("keeps numeric restaurant brands that do not encode their site address", () => {
  assert.equal(
    isAddressDerivedBusinessName("7 Leaves Cafe", "7 Leaves Ln, San Jose, CA"),
    false,
  );
  assert.equal(
    isAddressDerivedBusinessName("99 Ranch Market", "925 Blossom Hill Rd, San Jose, CA"),
    false,
  );
  assert.equal(
    isAddressDerivedBusinessName("10 Butchers Korean BBQ", "10 E Hamilton Ave, Campbell, CA"),
    false,
  );
});

test("a county final inspection alone is not an opening", () => {
  const record = classifyFinalInspection({
    sourceId: "SR0884792",
    name: "Fugetsu Market & Goods",
    inspectionDate: "2026-07-13",
  });

  assert.equal(record.status, "inspection-complete");
  assert.equal(record.inspectionDate, "2026-07-13");
  assert.equal(record.date, undefined);
  assert.equal(record.openingEvidence, undefined);
  assert.equal(isVerifiedOpeningRecord(record), false);
});

test("a separate first-party source establishes the true opening date", () => {
  const record = classifyFinalInspection(
    {
      sourceId: "SR0884792",
      name: "Fugetsu Market & Goods",
      inspectionDate: "2026-07-13",
    },
    {
      date: "2026-03-15",
      url: "https://www.instagram.com/p/DVz2HnDlNAJ/",
      source: "Fugetsu Market",
    },
  );

  assert.equal(record.status, "opened");
  assert.equal(record.date, "2026-03-15");
  assert.equal(record.inspectionDate, "2026-07-13");
  assert.equal(isVerifiedOpeningRecord(record), true);
  assert.notEqual(record.date, record.inspectionDate);
});

test("canonical food data keeps inspections out of the verified openings feed", () => {
  const data = JSON.parse(readFileSync(
    new URL("../../src/data/south-bay/scc-food-openings.json", import.meta.url),
    "utf8",
  ));

  assert.equal((data.opened || []).every(isVerifiedOpeningRecord), true);
  assert.equal((data.inspections || []).every((record) => (
    record.status === "inspection-complete"
    && record.date === undefined
    && /^\d{4}-\d{2}-\d{2}$/.test(record.inspectionDate)
  )), true);
  assert.equal((data.opened || []).some((record) => record.sourceId === "SR0884792"), false);
});

test("canonical food data ships business names, not permit jargon", () => {
  const data = JSON.parse(readFileSync(
    new URL("../../src/data/south-bay/scc-food-openings.json", import.meta.url),
    "utf8",
  ));
  const names = [...(data.opened || []), ...(data.comingSoon || []), ...(data.inspections || [])]
    .map((record) => record.name || "");

  // Tenant-improvement codes, in front of or behind the name. "Restaurant Ti -
  // Alpha X" and "Tiny Croissanterie Ti" both reached the Food tab on
  // 2026-08-27 because the existing rules required a period or a dash.
  const permitJargon = names.filter((name) => (
    /^(?:restaurant|kitchen|food)\s+t\.?\s?i\.?\b/i.test(name)
    || /\bt\.?\s?i\.?\s*$/i.test(name)
  ));
  assert.deepEqual(permitJargon, []);

  // A pumps-and-snacks counter is not a restaurant opening, brand word or not.
  const fuelMarts = names.filter((name) => (
    /\bfast\s*fill\b|\bgas\s*(?:&|and)\s*wash\b|\bfuel\s+(?:mart|stop|center)\b/i.test(name)
  ));
  assert.deepEqual(fuelMarts, []);

  // The permit's purpose also arrives as a bare trailing noun with no dash and
  // no qualifier. "Relish Cafe Equipment" and "Be Hai Que Nha Restaurant
  // Improvement" both shipped as coming-soon business names on 2026-08-28.
  const purposeSuffix = names.filter((name) => (
    /\s(?:equipment|improvements?)\s*$/i.test(name) && name.trim().split(/\s+/).length >= 3
  ));
  assert.deepEqual(purposeSuffix, []);
});

test("minor remodels and single-fixture adds are not openings", () => {
  assert.equal(shouldSkip({
    business_name: "PANDA EXPREESS-MINOR REMODEL",
    site_location: "1720 STORY RD., #40, SAN JOSE",
    city: "SAN JOSE",
    record_id: "SR0881779",
  }), true);
  assert.equal(shouldSkip({
    business_name: "SUPREME DONUTS - ADD SINK",
    site_location: "1093 FOXWORTHY AVE, SAN JOSE",
    city: "SAN JOSE",
    record_id: "SR0882223",
  }), true);
});

test("an existing restaurant's kitchen upgrade is not a coming opening", () => {
  const record = {
    business_name: "RTI ZINGSTERS KITCHEN UPGRADE",
    site_location: "220B UNIVERSITY AV., PALO ALTO, CA 94301",
    city: "PALO ALTO",
    record_id: "SR0885884",
  };
  assert.equal(shouldSkip(record), true);
  assert.equal(shouldSkip({ ...record, business_name: "ZINGSTERS" }), false);
});

test("corporate cafeterias stay out while real public venues survive", () => {
  assert.equal(shouldSkip({
    business_name: "TESLA HANOVER CAFE",
    site_location: "3000 HANOVER ST, PALO ALTO",
    city: "PALO ALTO",
    record_id: "SR0885335",
  }), true);
  assert.equal(shouldSkip({
    business_name: "ITALIAN CELLAR SPEAKEASY-OUTDOOR PIAZZA SATELLITE BAR",
    site_location: "323 SHARKS WAY, SAN JOSE",
    city: "SAN JOSE",
    record_id: "SR0885404",
  }), false);
});
