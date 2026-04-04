#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Signal — Daily Pulse Generator
// Morning roundup: 2-4 top items + 1 civic/transit + 1 atmospheric
// Runs daily at 7:00 AM PT
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllCandidates, candidatesForDate, upcomingCandidates } from "./lib/data-loader.mjs";
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
  logStep("🌅", `Daily Pulse — ${today}`);

  // 1. Load candidates
  const allCandidates = loadAllCandidates();
  logStep("📊", `Loaded ${allCandidates.length} total candidates`);

  // 2. Filter to today + upcoming (next 2 days)
  const upcoming = upcomingCandidates(allCandidates);
  const todayItems = candidatesForDate(allCandidates, today);
  logStep("📅", `Today: ${todayItems.length}, Upcoming: ${upcoming.length}`);

  // Prefer today's items, but include tomorrow if sparse
  const pool = todayItems.length >= 4 ? todayItems : upcoming.slice(0, 100);

  // 3. Score with dedup history
  const history = flattenHistory(recentHistory(7));
  const scored = scoreAndRank(pool, history);

  // 4. Split into event items and civic items
  const eventItems = scored.filter(
    (c) => c.sourceType === "event" || c.sourceType === "weekend-pick" || c.sourceType === "restaurant"
  );
  const civicItems = scored.filter(
    (c) => c.sourceType === "around-town" || c.sourceType === "digest" || c.sourceType === "permit"
  );

  // 5. Select diverse items
  const mainPicks = diverseSelect(eventItems, 3);
  const civicPick = civicItems.length > 0 ? [civicItems[0]] : [];
  const selected = [...mainPicks, ...civicPick];

  if (selected.length === 0) {
    logSkip("No quality candidates — skipping Daily Pulse");
    process.exit(0);
  }

  // Check threshold
  const totalScore = selected.reduce((sum, s) => sum + s.score, 0);
  logStep("📈", `Total score: ${totalScore.toFixed(1)} (threshold: ${CONFIG.THRESHOLDS.daily_pulse})`);

  if (totalScore < CONFIG.THRESHOLDS.daily_pulse) {
    logSkip(`Below threshold (${totalScore.toFixed(1)} < ${CONFIG.THRESHOLDS.daily_pulse}) — skipping`);
    process.exit(0);
  }

  for (const item of selected) {
    logScore(item.title, item.score);
  }

  // 6. Generate copy
  logStep("✍️", "Generating copy...");
  const url = `${CONFIG.SBS_BASE_URL}/`;
  const copy = await generateCopy("daily_pulse", selected, url);

  logStep("🐦", `X (${copy.x.length} chars)`);
  logStep("🧵", `Threads (${copy.threads.length} chars)`);
  logStep("🦋", `Bluesky (${copy.bluesky.length} chars)`);

  // 7. Generate card
  logStep("🖼️", "Generating card...");
  let cardPath = null;
  try {
    cardPath = await generateAndSaveCard("daily_pulse", selected, today);
    logStep("🖼️", `Card saved: ${cardPath}`);
  } catch (err) {
    logError(`Card generation failed: ${err.message}`);
  }

  // 8. Write post JSON
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const postPath = join(OUTPUT_DIR, `daily-pulse-${today}.json`);
  const post = {
    postType: "daily_pulse",
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
  logSuccess(`Daily Pulse written to ${postPath}`);

  // Print the post file path for publish.mjs
  console.log(`\nPOST_FILE=${postPath}`);
}

main().catch((err) => {
  logError(err.message);
  console.error(err);
  process.exit(1);
});
