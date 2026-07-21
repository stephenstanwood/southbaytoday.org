import assert from "node:assert/strict";
import test from "node:test";

import { selectDatedDefaultPlan, selectNamedDefaultPlan } from "./defaultPlanSelection.mjs";

const plans = {
  adults: { planDate: "2026-07-20", cards: [{ id: "adult-old" }] },
  "adults:tomorrow": { planDate: "2026-07-21", cards: [{ id: "adult-current" }] },
  kids: { planDate: "2026-07-20", cards: [{ id: "kids-old" }] },
  "kids:tomorrow": { planDate: "2026-07-21", cards: [{ id: "kids-current" }] },
};

test("dated default-plan selection promotes yesterday's tomorrow slot after midnight", () => {
  assert.equal(selectDatedDefaultPlan(plans, "2026-07-21"), plans["adults:tomorrow"]);
  assert.equal(selectDatedDefaultPlan(plans, "2026-07-21", { kids: true }), plans["kids:tomorrow"]);
});

test("dated default-plan selection fails closed instead of relabeling a stale plan", () => {
  assert.equal(selectDatedDefaultPlan(plans, "2026-07-22"), null);
  assert.equal(selectDatedDefaultPlan(plans, "July 22, 2026"), null);
});

test("named selection stays deterministic for build-time SSR", () => {
  assert.equal(selectNamedDefaultPlan(plans), plans.adults);
  assert.equal(selectNamedDefaultPlan(plans, { kids: true }), plans.kids);
});
