#!/usr/bin/env node
// One-off: regen 2026-05-07 day-plan after deleting the broken DishDash
// 7:30 AM post. Pulls a fresh plan via plan-day API with DishDash blocked,
// generates new copy + Recraft hero, updates schedule + default-plans hero,
// and prints a review summary. Does NOT publish — leaves slot at "draft" so
// Stephen reviews before any new posts go out.
//
//   ssh stephenstanwood@10.0.0.234 \
//     'cd ~/Projects/southbaytoday.org && \
//      /opt/homebrew/bin/node --env-file=.env.local \
//      scripts/social/oneoff/regen-2026-05-07-dayplan.mjs'

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { generateDayPlanCopy } from "../lib/copy-gen.mjs";
import { canonicalizePlanCards } from "../../../src/lib/south-bay/canonicalizeCard.mjs";
import { pickStyle, dayPlanPrompt } from "../lib/poster-styles.mjs";
import { generateAndUpload } from "../lib/recraft.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..", "..");
const SCHEDULE_FILE = join(REPO, "src", "data", "south-bay", "social-schedule.json");
const SHARED_PLANS_FILE = join(REPO, "src", "data", "south-bay", "shared-plans.json");
const PLANS_FILE = join(REPO, "src", "data", "south-bay", "default-plans.json");

const TARGET_DATE = "2026-05-07";
const CITY_SLUG = "sunnyvale";
const CITY_NAME = "Sunnyvale";
const API_BASE = process.env.SBT_API_BASE || "https://southbaytoday.org";
// Block DishDash explicitly — the curated POI has hours: null in the
// deployed places.json so the morning open-hours filter can't reject it.
const BLOCKED = ["DishDash", "Dishdash Middle Eastern Cuisine", "dishdash"];

async function fetchPlan() {
  const res = await fetch(`${API_BASE}/api/plan-day`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city: CITY_SLUG,
      kids: false,
      currentHour: 7,
      planDate: TARGET_DATE,
      blockedNames: BLOCKED,
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
  return { planUrl: `${API_BASE}/plan/${planId}`, planId };
}

(async () => {
  console.log(`📋 Fetching plan for ${CITY_NAME} on ${TARGET_DATE} (DishDash blocked)...`);
  const plan = await fetchPlan();
  console.log(`   Got ${plan.cards.length} stops:`);
  for (const c of plan.cards) console.log(`     ${c.timeBlock} — ${c.name} (${c.city})`);

  // Fail-safe: if DishDash slipped through (deployed API not yet aware of block list),
  // bail loudly rather than re-publish the same mistake.
  if (plan.cards.some((c) => /dishdash/i.test(c.name || ""))) {
    console.error("❌ DishDash still in plan — aborting. Investigate API filter.");
    process.exit(1);
  }

  const { planUrl } = appendSharedPlan(plan, TARGET_DATE);
  console.log(`📎 Plan link: ${planUrl}`);

  console.log(`✍️  Generating copy...`);
  const copy = await generateDayPlanCopy(plan, TARGET_DATE, planUrl);
  console.log(`   X: ${copy.x}`);

  console.log(`🎨 Generating hero image...`);
  const style = await pickStyle();
  const prompt = dayPlanPrompt(plan, TARGET_DATE, style.style);
  const pathname = `posters/${TARGET_DATE}-day-plan-${Date.now()}.png`;
  const { url: imageUrl } = await generateAndUpload({ prompt, pathname, colors: style.colors || undefined });
  console.log(`   ${imageUrl}`);

  // Update social-schedule.json — slot back to draft so Stephen reviews
  const schedule = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
  if (!schedule.days[TARGET_DATE]) schedule.days[TARGET_DATE] = {};
  // Keep the deletion record in _reviewHistory but replace the live slot
  schedule.days[TARGET_DATE]["day-plan"] = {
    status: "draft",
    slotType: "day-plan",
    city: CITY_SLUG,
    cityName: CITY_NAME,
    planUrl,
    plan: { cards: plan.cards, weather: plan.weather },
    copy,
    imageUrl,
    imageStyle: style.id,
    imagePrompt: prompt,
    copyApprovedAt: null,
    imageApprovedAt: null,
    generatedAt: new Date().toISOString(),
    regenReason: "DishDash mis-slotted at 7:30 AM in original draft",
  };
  schedule._meta = { ...(schedule._meta || {}), generatedAt: new Date().toISOString(), generator: "regen-2026-05-07" };
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2) + "\n");
  console.log(`✅ Wrote schedule slot (status=draft).`);

  // Update default-plans.json — this drives the homepage hero
  const plansData = JSON.parse(readFileSync(PLANS_FILE, "utf8"));
  const heroPlan = {
    cards: plan.cards,
    weather: plan.weather,
    city: CITY_SLUG,
    kids: false,
    anchorHour: 9,
    generatedAt: new Date().toISOString(),
  };
  plansData.plans["adults:h9"] = heroPlan;
  plansData._meta = {
    ...(plansData._meta || {}),
    generatedAt: new Date().toISOString(),
    generator: "regen-2026-05-07-dayplan",
  };
  writeFileSync(PLANS_FILE, JSON.stringify(plansData, null, 2) + "\n");
  console.log(`✅ Wrote default-plans.json (homepage hero).`);

  console.log(`\n📋 Review summary:`);
  console.log(`   Plan:  ${planUrl}`);
  console.log(`   Image: ${imageUrl}`);
  console.log(`   X copy: ${copy.x}`);
  console.log(`   Bluesky: ${copy.bluesky}`);
  console.log(`   Threads: ${copy.threads}`);
  console.log(`   Mastodon: ${copy.mastodon}`);
  console.log(`   Facebook: ${copy.facebook}`);
})();
