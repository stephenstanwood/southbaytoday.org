#!/usr/bin/env node
// One-off: regen May 8 day-plan slot that got nuked by the post-gen-review
// hard-block deletion bug (now fixed). Runs the same plan-day → copy →
// image pipeline as the main schedule generator, but for one slot only.
//
// Usage: node scripts/social/oneoff/regen-may8.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { generateDayPlanCopy } from "../lib/copy-gen.mjs";
import { canonicalizePlanCards } from "../../../src/lib/south-bay/canonicalizeCard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..", "..");
const SCHEDULE_FILE = join(REPO, "src", "data", "south-bay", "social-schedule.json");
const SHARED_PLANS_FILE = join(REPO, "src", "data", "south-bay", "shared-plans.json");

const TARGET_DATE = "2026-05-08";
const CITY_SLUG = "mountain-view";
const CITY_NAME = "Mountain View";
const API_BASE = process.env.SBT_API_BASE || "https://southbaytoday.org";

async function fetchPlan() {
  const res = await fetch(`${API_BASE}/api/plan-day`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city: CITY_SLUG,
      kids: false,
      currentHour: 7,
      planDate: TARGET_DATE,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`plan-day ${res.status}`);
  const data = await res.json();
  if (!data.cards?.length) throw new Error("plan-day returned no cards");
  return data;
}

function generatePlanId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function appendSharedPlan(plan, dateStr) {
  const planId = generatePlanId();
  const entry = {
    cards: canonicalizePlanCards(plan.cards),
    city: plan.cards[0]?.city || CITY_SLUG,
    kids: false,
    weather: plan.weather,
    planDate: dateStr,
    createdAt: new Date().toISOString(),
  };
  const current = JSON.parse(readFileSync(SHARED_PLANS_FILE, "utf8"));
  current[planId] = entry;
  writeFileSync(SHARED_PLANS_FILE, JSON.stringify(current, null, 2) + "\n");
  return `${API_BASE}/plan/${planId}`;
}

(async () => {
  console.log(`📋 Fetching plan for ${CITY_NAME} on ${TARGET_DATE}...`);
  const plan = await fetchPlan();
  console.log(`   Got ${plan.cards.length} stops`);

  const planUrl = appendSharedPlan(plan, TARGET_DATE);
  console.log(`📎 Plan link: ${planUrl}`);

  console.log(`✍️  Generating copy...`);
  const copy = await generateDayPlanCopy(plan, TARGET_DATE, planUrl);

  const schedule = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
  if (!schedule.days[TARGET_DATE]) schedule.days[TARGET_DATE] = {};
  schedule.days[TARGET_DATE]["day-plan"] = {
    status: "draft",
    slotType: "day-plan",
    city: CITY_SLUG,
    cityName: CITY_NAME,
    planUrl,
    plan: { cards: plan.cards, weather: plan.weather },
    copy,
    imageUrl: null,
    imageStyle: null,
    copyApprovedAt: null,
    imageApprovedAt: null,
    generatedAt: new Date().toISOString(),
  };
  schedule._meta = { ...(schedule._meta || {}), generatedAt: new Date().toISOString(), generator: "regen-may8" };
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2) + "\n");
  console.log(`✅ Wrote slot. Image gen left to review portal.`);

  // Commit + push
  try {
    execSync(`git add src/data/south-bay/social-schedule.json src/data/south-bay/shared-plans.json`, { cwd: REPO, stdio: "inherit" });
    execSync(`git commit -m "data: regen 2026-05-08 day-plan"`, { cwd: REPO, stdio: "inherit" });
    execSync(`git push`, { cwd: REPO, stdio: "inherit" });
    console.log(`📎 committed and pushed`);
  } catch (err) {
    console.log(`⚠️  git: ${err.message}`);
  }
})();
