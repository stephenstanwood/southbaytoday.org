import { test } from "node:test";
import assert from "node:assert/strict";
import { extractName, isEquipmentOnlyPermit, stripBilingualSuffix } from "../generate-restaurant-radar.mjs";

// Every raw string below is a real San Jose FOLDERNAME that reached
// restaurant-radar.json. The four "paperwork" cases shipped to the Food tab as
// restaurant names before this filter existed.
test("extractName pulls real business names out of permit foldernames", () => {
  assert.equal(extractName("Srp (Bemp100%) Cafe Mei"), "Cafe Mei");
  assert.equal(extractName("Srp (Bemp100%) Iniburger Ti #Fc2"), "Iniburger");
  assert.equal(extractName("Lu Cafe (Bepm 100%) Tenant Improvement"), "Lu Cafe");
  assert.equal(extractName("Taco Bell (E 100%) Sign"), "Taco Bell");
  assert.equal(extractName("Jc'S Bbq (Bepm 100%) Interior Ti"), "JC's BBQ");
});

test("extractName reads the coming tenant out of landlord shell work", () => {
  // Live San Jose FOLDERNAME, issued 2026-10-27 at 2855 Stevens Creek Blvd.
  assert.equal(extractName("(Bep100%) Haidilao Landlord Work #A259"), "Haidilao");
  assert.equal(extractName("Srp (Bemp100%) Fomo Ti #A16"), "Fomo");
});

test("equipment work at an open restaurant is not an opening signal", () => {
  for (const folder of [
    "Maggianos (Bem 100%) New Heat Pump Units",
    "Martha's Kitchen Hvac Replacement",
    "Pho Ha (M 100%) Install Rooftop Units",
    "Sushi Bar (B 100%) Walk-In Cooler Replacement",
  ]) assert.equal(isEquipmentOnlyPermit(folder), true, folder);
  for (const folder of [
    "Peets Coffee & Tea (Bepm 100%) Ti",
    "Chick-Fil-A (Bepm 100%) New Construction",
    "Srp (Bep100%) Spartan Brew Cafe Ste C",
    "The Hood Kitchen (Bepm 100%) Ti",
  ]) assert.equal(isEquipmentOnlyPermit(folder), false, folder);
});

test("extractName keeps possessives lowercase after the apostrophe", () => {
  // A bare /\b\w/ title-caser shipped "JC'S BBQ" and "Mary'S Kitchen".
  assert.equal(extractName("Mary'S Kitchen (Bepm 100%) Ti"), "Mary's Kitchen");
  assert.equal(extractName("Luigi'S Pizzeria (B 100%) Interior"), "Luigi's Pizzeria");
});

test("extractName rejects permit paperwork masquerading as a business name", () => {
  assert.equal(extractName("(B) Occupancy Certificate"), null);
  assert.equal(extractName("(Bepm100%) Permit To Final For 23-126633"), null);
  assert.equal(extractName("(Be 100%) Code - Demo Covered Patio"), null);
  assert.equal(
    extractName("(Bepm100%) Permit To Allow Completion -Kushinari Restaurant & Com Kitchen"),
    null,
  );
});

test("extractName still rejects the generic/empty cases", () => {
  assert.equal(extractName("(Bp100%) Demo Restaurant"), null);
  assert.equal(extractName(""), null);
  assert.equal(extractName(null), null);
});

test("stripBilingualSuffix drops a trailing CJK rendering of a Latin name", () => {
  assert.equal(stripBilingualSuffix("Hearth BBQ炉边烧烤"), "Hearth BBQ");
  assert.equal(stripBilingualSuffix("Hearth BBQ 炉边烧烤"), "Hearth BBQ");
  assert.equal(stripBilingualSuffix("Zhangling Malatang·张亮麻辣烫"), "Zhangling Malatang");
});

test("stripBilingualSuffix leaves fully-CJK and plain Latin names alone", () => {
  // An entirely CJK name is the real name, not a bilingual suffix.
  assert.equal(stripBilingualSuffix("炉边烧烤"), "炉边烧烤");
  assert.equal(stripBilingualSuffix("Cafe Mei"), "Cafe Mei");
  assert.equal(stripBilingualSuffix(null), null);
});
