import assert from "node:assert/strict";
import test from "node:test";

import { foodProfileFromName, inferFoodProfile } from "../generate-place-blurbs.mjs";

test("place blurb matching does not treat Barcelona or tapas as bar terms", () => {
  assert.equal(foodProfileFromName("Barcelona", ""), null);
  assert.deepEqual(
    inferFoodProfile({
      name: "Telefèric Barcelona Los Gatos",
      types: [
        "spanish_restaurant",
        "tapas_restaurant",
        "cocktail_bar",
        "bar",
        "restaurant",
      ],
    }, "Spanish restaurant"),
    {
      label: "Spanish restaurant",
      food: "tapas, paella, and Spanish plates",
    },
  );
});

test("place blurb matching still recognizes standalone beer and bar terms", () => {
  assert.equal(foodProfileFromName("Neighborhood Beer Garden", "")?.label, "beer bar");
  assert.equal(foodProfileFromName("Taps on Main", "")?.label, "beer bar");
  assert.equal(foodProfileFromName("The Corner Bar", "")?.label, "bar and grill");
});

test("embedded nightlife substrings do not match", () => {
  assert.equal(foodProfileFromName("Shahi Darbar Indian Cuisine", ""), null);
  assert.equal(foodProfileFromName("Fairchilds Public House", ""), null);
});

// Sep 16, 2026 issue: "eggs and pancakes at Blvd Coffee of Almaden" — a
// coffee shop Google also tags breakfast_restaurant. The primary type must
// win over secondary tags, and the breakfast copy must not name a dish.
const BREAKFAST = { label: "breakfast and brunch spot", food: "eggs, breakfast plates, and brunch dishes" };
const CAFE = { label: "cafe", food: "coffee, pastries, and cafe bites" };
const BAKERY = { label: "bakery", food: "pastries, cakes, and baked goods" };
const ICE_CREAM = { label: "ice cream shop", food: "ice cream and frozen treats" };

test("a coffee shop with a secondary breakfast_restaurant tag is a cafe, not a breakfast spot", () => {
  assert.deepEqual(
    inferFoodProfile({
      name: "Blvd Coffee of Almaden",
      primaryType: "coffee_shop",
      displayType: "Coffee shop",
      types: ["coffee_shop", "breakfast_restaurant", "cafe", "food_store", "store", "restaurant", "food"],
    }, "Coffee shop"),
    CAFE,
  );
  // Same for a plain cafe that Google also tags sandwich_shop + breakfast_restaurant.
  assert.deepEqual(
    inferFoodProfile({
      name: "Brew Bytes Cafe",
      primaryType: "cafe",
      displayType: "Cafe",
      types: ["cafe", "sandwich_shop", "breakfast_restaurant", "coffee_shop", "restaurant", "food"],
    }, "Cafe"),
    CAFE,
  );
});

test("a donut shop with a secondary breakfast_restaurant tag keeps its bakery profile", () => {
  assert.deepEqual(
    inferFoodProfile({
      name: "Happy Donuts De Anza",
      primaryType: "donut_shop",
      displayType: "Donut shop",
      types: ["donut_shop", "breakfast_restaurant", "bakery", "coffee_shop", "cafe", "food_store", "restaurant", "food"],
    }, "Donut shop"),
    BAKERY,
  );
  // A bakery with a secondary sandwich_shop tag is still a bakery (same root cause).
  assert.deepEqual(
    inferFoodProfile({
      name: "Paris Baguette",
      primaryType: "bakery",
      displayType: "Bakery",
      types: ["bakery", "sandwich_shop", "breakfast_restaurant", "cafe", "coffee_shop", "restaurant", "food"],
    }, "Bakery"),
    BAKERY,
  );
});

test("an ice cream shop named Creamery is ice cream, not breakfast and not tea", () => {
  assert.deepEqual(
    inferFoodProfile({
      name: "Sweet Fix Creamery",
      primaryType: "ice_cream_shop",
      displayType: "Ice cream shop",
      types: ["ice_cream_shop", "dessert_shop", "confectionery", "food_store", "store", "food"],
    }, "Ice cream shop"),
    ICE_CREAM,
  );
  assert.deepEqual(foodProfileFromName("Cold Stone Creamery", ""), ICE_CREAM);
  // A dessert shop whose name says creamery goes the same way.
  assert.deepEqual(
    inferFoodProfile({
      name: "Dumont Creamery & Café",
      primaryType: "dessert_shop",
      displayType: "Dessert shop",
      types: ["dessert_shop", "ice_cream_shop", "coffee_shop", "cafe", "tea_house", "food_store", "food"],
    }, "Dessert shop"),
    ICE_CREAM,
  );
});

test("brand-name breakfast places and breakfast/brunch primaries keep the breakfast profile", () => {
  const generic = ["restaurant", "food", "point_of_interest", "establishment"];
  assert.deepEqual(
    inferFoodProfile({ name: "Holder's Country Inn - Los Altos", primaryType: "restaurant", displayType: "Restaurant", types: generic }, "Restaurant"),
    BREAKFAST,
  );
  assert.deepEqual(
    inferFoodProfile({ name: "Orange Bowl", primaryType: "restaurant", displayType: "Restaurant", types: generic }, "Restaurant"),
    BREAKFAST,
  );
  assert.deepEqual(foodProfileFromName("Breaking Dawn Brunch", ""), BREAKFAST);
  // A brunch restaurant that Google also tags cafe/diner is still brunch.
  assert.deepEqual(
    inferFoodProfile({
      name: "Sweet Maple",
      primaryType: "brunch_restaurant",
      displayType: "Brunch restaurant",
      types: ["brunch_restaurant", "breakfast_restaurant", "californian_restaurant", "american_restaurant", "diner", "cafe", "restaurant", "food"],
    }, "Brunch restaurant"),
    BREAKFAST,
  );
  assert.doesNotMatch(BREAKFAST.food, /pancake/);
});

test("a cuisine primary keeps the legacy haystack so a generic name word cannot beat it", () => {
  // "Asian Street Cafe" is a Chinese noodle restaurant; the primary pass must
  // not fire off the word "Cafe" when the name tier can't vouch for the primary.
  assert.equal(
    inferFoodProfile({
      name: "Asian Street Cafe",
      primaryType: "chinese_restaurant",
      displayType: "Chinese restaurant",
      types: ["chinese_restaurant", "noodle_shop", "vietnamese_restaurant", "coffee_shop", "cafe", "restaurant", "food"],
    }, "Chinese restaurant").label,
    "noodle shop",
  );
});

test("a cocktail bar is cocktails and bar snacks, not a burger bar", () => {
  assert.deepEqual(
    inferFoodProfile({
      name: "Amandine Lounge",
      primaryType: "cocktail_bar",
      displayType: "Cocktail bar",
      types: ["cocktail_bar", "lounge_bar", "night_club", "dessert_restaurant", "bar", "restaurant", "food"],
    }, "Cocktail bar"),
    { label: "cocktail bar", food: "cocktails and bar snacks" },
  );
});
