import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlanBlurbDrift, applyPlanBlurbFixes } from "./plan-blurb-drift.mjs";

const cache = {
  blurbs: {
    A: { blurb: "Milpitas sattvic vegetarian buffet priced by weight." },
    B: { blurb: "Campbell drop-in studio — workshops and classes." },
  },
};

function plans(aBlurb) {
  return {
    plans: {
      adults: {
        cards: [
          { id: "event:x", name: "Harvest Festival", blurb: "not a place" },
          { id: "place:A", name: "Sri Radha's", blurb: aBlurb },
          { id: "place:B", name: "Studio", blurb: "Campbell drop-in studio — workshops and classes." },
          { id: "place:MISSING", name: "Unknown", blurb: "whatever" },
        ],
      },
    },
  };
}

test("no drift when baked blurbs match the cache", () => {
  assert.deepEqual(findPlanBlurbDrift(plans("Milpitas sattvic vegetarian buffet priced by weight."), cache), []);
});

test("reports a place card whose baked blurb differs from the cache; ignores events and uncached places", () => {
  const drift = findPlanBlurbDrift(plans("Milpitas plant-based spot for plant-based bowls."), cache);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].id, "place:A");
  assert.equal(drift[0].index, 1);
  assert.equal(drift[0].cache, "Milpitas sattvic vegetarian buffet priced by weight.");
});

test("applyPlanBlurbFixes re-bakes only the drifted cards and leaves the input untouched", () => {
  const input = plans("stale");
  const drift = findPlanBlurbDrift(input, cache);
  const fixed = applyPlanBlurbFixes(input, drift);
  assert.equal(fixed.plans.adults.cards[1].blurb, "Milpitas sattvic vegetarian buffet priced by weight.");
  assert.equal(input.plans.adults.cards[1].blurb, "stale");
  assert.equal(fixed.plans.adults.cards[3].blurb, "whatever");
  assert.deepEqual(findPlanBlurbDrift(fixed, cache), []);
});
