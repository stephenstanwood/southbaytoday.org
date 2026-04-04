#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Signal — Weekend Roundup Generator
// Friday morning post: 5-10 best weekend events
// Runs Friday at 9:00 AM PT
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllCandidates, weekendCandidates } from "./lib/data-loader.mjs";
import { scoreAndRank } from "./lib/scoring.mjs";
import { diverseSelect } from "./lib/diversity.mjs";
import { recentHistory, flattenHistory } from "./lib/dedup.mjs";
import { generateCopy } from "./lib/copy-gen.mjs";
import { generateAndSaveCard } from "./lib/card-gen.mjs";
import { CONFIG } from "./lib/constants.mjs";
import { logStep, logScore, logSuccess, logSkip, logError } from "./lib/logger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envPath = join(__dirname, "..", "..", ".env.local");
    const lines = (await import("node:fs")).readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const today = new Date().toISOString().split("T")[0];
const OUTPUT_DIR = "/tmp/sbs-social";

async function main() {
  logStep("🗓️", `Weekend Roundup — ${today}`);

  // 1. Load weekend candidates
  const allCandidates = loadAllCandidates();
  const weekend = weekendCandidates(allCandidates);
  logStep("📊", `${weekend.length} weekend candidates`);

  if (weekend.length < 3) {
    logSkip("Not enough weekend candidates — skipping");
    process.exit(0);
  }

  // 2. Score
  const history = flattenHistory(recentHistory(7));
  const scored = scoreAndRank(weekend, history);

  // 3. Select diverse picks — aim for 7, accept 5-10
  const selected = diverseSelect(scored, 7, {
    maxSameCity: 2,
    maxSameCategory: 3,
    minUniqueCities: 3,
  });

  if (selected.length < 4) {
    logSkip("Not enough quality picks — skipping");
    process.exit(0);
  }

  // Check threshold
  const totalScore = selected.reduce((sum, s) => sum + s.score, 0);
  logStep("📈", `Total score: ${totalScore.toFixed(1)} (threshold: ${CONFIG.THRESHOLDS.weekend})`);

  if (totalScore < CONFIG.THRESHOLDS.weekend) {
    logSkip(`Below threshold — skipping`);
    process.exit(0);
  }

  for (const item of selected) {
    logScore(item.title, item.score);
  }

  // 4. Generate copy
  logStep("✍️", "Generating copy...");
  const url = `${CONFIG.SBS_BASE_URL}/?tab=events`;
  const copy = await generateCopy("weekend", selected, url);

  // 5. Generate card
  logStep("🖼️", "Generating card...");
  let cardPath = null;
  try {
    cardPath = await generateAndSaveCard("weekend", selected, today);
    logStep("🖼️", `Card saved: ${cardPath}`);
  } catch (err) {
    logError(`Card generation failed: ${err.message}`);
  }

  // 6. Write post JSON
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const postPath = join(OUTPUT_DIR, `weekend-${today}.json`);
  const post = {
    postType: "weekend",
    date: today,
    generatedAt: new Date().toISOString(),
    items: selected.map((s) => ({
      title: s.title,
      city: s.city,
      cityName: s.cityName,
      venue: s.venue,
      category: s.category,
      score: s.score,
      time: s.time,
    })),
    copy,
    cardPath,
    targetUrl: url,
    totalScore,
  };

  writeFileSync(postPath, JSON.stringify(post, null, 2) + "\n");
  logSuccess(`Weekend Roundup written to ${postPath}`);
  console.log(`\nPOST_FILE=${postPath}`);
}

main().catch((err) => {
  logError(err.message);
  console.error(err);
  process.exit(1);
});
