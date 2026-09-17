#!/usr/bin/env node
// Reports place cards in default-plans.json whose baked blurb no longer
// matches place-blurb-cache.json, and re-bakes them with --fix. See
// scripts/lib/plan-blurb-drift.mjs for why this drifts. Not a build gate:
// the cron that writes default-plans.json runs before copy-edit PRs land, so
// a hard failure would just break the next Vercel build on Stephen's own fix.
//
// Usage: node scripts/check-plan-blurb-drift.mjs [--fix]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARTIFACTS, DATA_DIR } from "./lib/paths.mjs";
import { findPlanBlurbDrift, applyPlanBlurbFixes } from "./lib/plan-blurb-drift.mjs";

const FIX = process.argv.includes("--fix");
const PLANS_PATH = ARTIFACTS.defaultPlans;
const CACHE_PATH = join(DATA_DIR, "place-blurb-cache.json");

const plans = JSON.parse(readFileSync(PLANS_PATH, "utf8"));
const cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
const drift = findPlanBlurbDrift(plans, cache);

if (drift.length === 0) {
  console.log("check-plan-blurb-drift: OK (every baked place blurb matches the cache)");
  process.exit(0);
}

for (const d of drift) {
  console.log(`DRIFT ${d.plan}[${d.index}] ${d.name}\n  baked: ${d.baked}\n  cache: ${d.cache}`);
}

if (FIX) {
  writeFileSync(PLANS_PATH, JSON.stringify(applyPlanBlurbFixes(plans, drift), null, 2));
  console.log(`check-plan-blurb-drift: re-baked ${drift.length} blurb(s) from the cache`);
} else {
  console.log(`check-plan-blurb-drift: ${drift.length} drifted blurb(s); run with --fix to re-bake`);
  process.exit(1);
}
