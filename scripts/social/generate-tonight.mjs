#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Signal — Tonight Generator
// Afternoon post: 3-5 things to do tonight
// Runs daily at 3:30 PM PT
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllCandidates, tonightCandidates } from "./lib/data-loader.mjs";
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
  logStep("🌆", `Tonight in the South Bay — ${today}`);

  // 1. Load and filter for tonight
  const allCandidates = loadAllCandidates();
  const tonight = tonightCandidates(allCandidates);
  logStep("🌙", `${tonight.length} candidates for tonight`);

  if (tonight.length < 2) {
    logSkip("Not enough tonight candidates — skipping");
    process.exit(0);
  }

  // 2. Score
  const history = flattenHistory(recentHistory(3));
  const scored = scoreAndRank(tonight, history);

  // 3. Select diverse picks
  const selected = diverseSelect(scored, 4);

  if (selected.length < 2) {
    logSkip("Not enough quality picks — skipping");
    process.exit(0);
  }

  // Check threshold
  const totalScore = selected.reduce((sum, s) => sum + s.score, 0);
  logStep("📈", `Total score: ${totalScore.toFixed(1)} (threshold: ${CONFIG.THRESHOLDS.tonight})`);

  if (totalScore < CONFIG.THRESHOLDS.tonight) {
    logSkip(`Below threshold — skipping`);
    process.exit(0);
  }

  for (const item of selected) {
    logScore(item.title, item.score);
  }

  // 4. Generate copy
  logStep("✍️", "Generating copy...");
  const url = `${CONFIG.SBS_BASE_URL}/?tab=events`;
  const copy = await generateCopy("tonight", selected, url);

  // 5. Generate card
  logStep("🖼️", "Generating card...");
  let cardPath = null;
  try {
    cardPath = await generateAndSaveCard("tonight", selected, today);
    logStep("🖼️", `Card saved: ${cardPath}`);
  } catch (err) {
    logError(`Card generation failed: ${err.message}`);
  }

  // 6. Write post JSON
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const postPath = join(OUTPUT_DIR, `tonight-${today}.json`);
  const post = {
    postType: "tonight",
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
  logSuccess(`Tonight post written to ${postPath}`);
  console.log(`\nPOST_FILE=${postPath}`);
}

main().catch((err) => {
  logError(err.message);
  console.error(err);
  process.exit(1);
});
