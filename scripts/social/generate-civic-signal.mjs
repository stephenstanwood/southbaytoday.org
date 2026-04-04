#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Signal — Civic Signal Generator
// Digestible civic/government summary: 1-3 meaningful items
// Runs Tue/Thu at 8:30 AM PT (only if good material exists)
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllCandidates, civicCandidates } from "./lib/data-loader.mjs";
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
  logStep("🏛️", `Civic Signal — ${today}`);

  // 1. Load civic candidates
  const allCandidates = loadAllCandidates();
  const civic = civicCandidates(allCandidates);
  logStep("📊", `${civic.length} civic candidates`);

  if (civic.length === 0) {
    logSkip("No civic candidates — skipping");
    process.exit(0);
  }

  // 2. Filter to recent items (last 14 days)
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const cutoff = twoWeeksAgo.toISOString().split("T")[0];
  const recent = civic.filter((c) => !c.date || c.date >= cutoff);

  if (recent.length === 0) {
    logSkip("No recent civic material — skipping");
    process.exit(0);
  }

  // 3. Score
  const history = flattenHistory(recentHistory(7));
  const scored = scoreAndRank(recent, history);

  // 4. Select 1-3 items, prioritizing diversity across cities
  const selected = diverseSelect(scored, 3, {
    maxSameCity: 1,
    maxSameCategory: 2,
    minUniqueCities: 2,
  });

  if (selected.length === 0) {
    logSkip("No quality civic items — skipping");
    process.exit(0);
  }

  // Check threshold — civic has the highest bar
  const totalScore = selected.reduce((sum, s) => sum + s.score, 0);
  logStep("📈", `Total score: ${totalScore.toFixed(1)} (threshold: ${CONFIG.THRESHOLDS.civic})`);

  if (totalScore < CONFIG.THRESHOLDS.civic) {
    logSkip(`Below threshold — skipping`);
    process.exit(0);
  }

  for (const item of selected) {
    logScore(item.title, item.score);
  }

  // 5. Generate copy
  logStep("✍️", "Generating copy...");
  const url = `${CONFIG.SBS_BASE_URL}/?tab=gov`;
  const copy = await generateCopy("civic", selected, url);

  // 6. Generate card
  logStep("🖼️", "Generating card...");
  let cardPath = null;
  try {
    cardPath = await generateAndSaveCard("civic", selected, today);
    logStep("🖼️", `Card saved: ${cardPath}`);
  } catch (err) {
    logError(`Card generation failed: ${err.message}`);
  }

  // 7. Write post JSON
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const postPath = join(OUTPUT_DIR, `civic-${today}.json`);
  const post = {
    postType: "civic",
    date: today,
    generatedAt: new Date().toISOString(),
    items: selected.map((s) => ({
      title: s.title,
      city: s.city,
      cityName: s.cityName,
      venue: s.venue,
      category: s.category,
      score: s.score,
      summary: s.summary?.slice(0, 200),
    })),
    copy,
    cardPath,
    targetUrl: url,
    totalScore,
  };

  writeFileSync(postPath, JSON.stringify(post, null, 2) + "\n");
  logSuccess(`Civic Signal written to ${postPath}`);
  console.log(`\nPOST_FILE=${postPath}`);
}

main().catch((err) => {
  logError(err.message);
  console.error(err);
  process.exit(1);
});
