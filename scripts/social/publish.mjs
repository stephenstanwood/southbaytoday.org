#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Signal — Social Publisher
// Takes a generated post JSON and publishes to enabled platforms
// Usage: node scripts/social/publish.mjs <post.json> [--dry-run] [--platform x,bluesky]
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./lib/constants.mjs";
import { recordPost } from "./lib/dedup.mjs";
import { logStep, logPublish, logDryRun, logError, logSuccess, logSkip } from "./lib/logger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envPath = join(__dirname, "..", "..", ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

// Parse args
const args = process.argv.slice(2);
const dryRun = CONFIG.DRY_RUN || args.includes("--dry-run");
const platformArg = args.find((a) => a.startsWith("--platform"));
const platformFilter = platformArg
  ? args[args.indexOf(platformArg) + 1]?.split(",")
  : null;
const postFile = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));

if (!postFile) {
  console.error("Usage: node publish.mjs <post.json> [--dry-run] [--platform x,bluesky,threads]");
  process.exit(1);
}

async function loadPlatform(name) {
  const mod = await import(`./lib/platforms/${name}.mjs`);
  return mod;
}

async function main() {
  const post = JSON.parse(readFileSync(postFile, "utf8"));

  // Normalize: single-item posts have `item`, old roundups have `items`
  const items = post.items || (post.item ? [post.item] : []);

  logStep("📋", `Post type: ${post.postType}`);
  logStep("📝", `Item: ${items[0]?.title || "(unknown)"}`);

  if (dryRun) {
    logDryRun("Dry run mode — no actual publishing");
    logStep("🐦", `X copy (${post.copy?.x?.length || 0} chars):`);
    console.log(`  ${post.copy?.x || "(none)"}\n`);
    logStep("🧵", `Threads copy (${post.copy?.threads?.length || 0} chars):`);
    console.log(`  ${post.copy?.threads || "(none)"}\n`);
    logStep("🦋", `Bluesky copy (${post.copy?.bluesky?.length || 0} chars):`);
    console.log(`  ${post.copy?.bluesky || "(none)"}\n`);
    logStep("📘", `Facebook copy (${post.copy?.facebook?.length || 0} chars):`);
    console.log(`  ${post.copy?.facebook || "(none)"}\n`);

    if (post.cardPath) {
      logStep("🖼️", `Card: ${post.cardPath}`);
    }

    // Record in history even in dry run (for dedup testing)
    recordPost({
      postType: post.postType,
      titles: items.map((i) => i.title),
      cities: [...new Set(items.map((i) => i.city).filter(Boolean))],
      platforms: ["dry-run"],
    });

    logSuccess("Dry run complete");
    return;
  }

  // Load image if card exists
  let imageBuffer = null;
  if (post.cardPath) {
    try {
      imageBuffer = readFileSync(post.cardPath);
      logStep("🖼️", `Loaded card: ${post.cardPath}`);
    } catch (err) {
      logError(`Failed to load card: ${err.message}`);
    }
  }

  const platforms = ["x", "threads", "bluesky", "facebook"];
  const published = [];
  const results = {};

  for (const platform of platforms) {
    // Check if platform is enabled
    if (!CONFIG.PLATFORMS[platform]) {
      logSkip(`${platform} disabled in config`);
      continue;
    }
    if (platformFilter && !platformFilter.includes(platform)) {
      logSkip(`${platform} not in --platform filter`);
      continue;
    }

    const copy = post.copy?.[platform];
    if (!copy) {
      logSkip(`No copy for ${platform}`);
      continue;
    }

    try {
      const client = await loadPlatform(platform);

      if (platform === "threads") {
        // Threads needs a public image URL, not a buffer
        // For now, post text-only on Threads
        const result = await client.publish(copy);
        results[platform] = result;
      } else {
        const result = await client.publish(copy, imageBuffer);
        results[platform] = result;
      }

      logPublish(platform, `Published: ${JSON.stringify(results[platform])}`);
      published.push(platform);
    } catch (err) {
      logError(`${platform}: ${err.message}`);
    }

    // Small delay between platforms
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Record in history
  if (published.length > 0) {
    recordPost({
      postType: post.postType,
      titles: items.map((i) => i.title),
      cities: [...new Set(items.map((i) => i.city).filter(Boolean))],
      platforms: published,
    });
  }

  logSuccess(`Published to ${published.length} platform(s): ${published.join(", ") || "none"}`);

  // Output summary for scheduled task reporting
  console.log(`\n**Social post: ${post.postType}**`);
  console.log(`- Item: ${items[0]?.title || "(unknown)"}`);
  console.log(`- Published: ${published.join(", ") || "none"}`);
  for (const [p, r] of Object.entries(results)) {
    console.log(`- ${p}: ${JSON.stringify(r)}`);
  }
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
