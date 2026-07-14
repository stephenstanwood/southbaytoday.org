import { test } from "node:test";
import assert from "node:assert/strict";
import { isNationalChain } from "./chains.mjs";

test("flags commodity chains", () => {
  for (const name of [
    "Starbucks Coffee Company",
    "Peet's Coffee",
    "Peet’s Coffee", // curly apostrophe as Google returns it
    "Elements Massage",
    "Baskin-Robbins",
    "Panera Bread",
    "Chipotle Mexican Grill",
    "Barnes & Noble",
    "AMC Saratoga 14",
    "Target",
    "REI",
  ]) {
    assert.ok(isNationalChain(name), `${name} should be flagged as a chain`);
  }
});

test("leaves local places alone", () => {
  for (const name of [
    "Deer Hollow Farm",
    "Iraklis Restaurant",
    "Recycle Bookstore",
    "Rei do Gado Brazilian Steakhouse", // 'REI' must not match inside local names
    "Michael's on Main",
    "Apple Park Visitor Center",
    "Orchard City Kitchen",
    "Pruneyard Cinemas",
    "Philz-adjacent Local Roasters", // only exact brand phrases match
    "Targett Family Vineyards",
  ]) {
    assert.ok(!isNationalChain(name), `${name} should NOT be flagged as a chain`);
  }
});
