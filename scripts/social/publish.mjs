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
import { queueBump } from "./lib/event-bumps.mjs";

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

/**
 * Build ALT text for the card image attached to this post. Describes the
 * IMAGE for screen readers — doesn't duplicate the caption.
 *
 * Day plan: "South Bay Today day-plan card for [Day] in [Cities]"
 * Tonight pick / single: "[Title] at [Venue] in [City]"
 */
function deriveImageAlt(post) {
  const item = post.item || post.items?.[0] || {};
  const title = item.title || item.name || "";
  const venue = item.venue || "";
  const city = item.cityName || item.city || "";

  if (post.postType === "day-plan") {
    // For day plans the lead item is just one of the cards; describe the card image generically.
    const cityPart = city ? ` in ${city}` : "";
    return `South Bay Today day-plan card${cityPart}`;
  }

  const parts = [];
  if (title) parts.push(title);
  if (venue && !title.toLowerCase().includes(venue.toLowerCase())) parts.push(`at ${venue}`);
  if (city) parts.push(`in ${city}`);
  return parts.join(" ") || "South Bay Today";
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
    logStep("🐘", `Mastodon copy (${post.copy?.mastodon?.length || 0} chars):`);
    console.log(`  ${post.copy?.mastodon || "(none)"}\n`);
    logStep("📸", `Instagram copy (${post.copy?.instagram?.length || 0} chars):`);
    console.log(`  ${post.copy?.instagram || "(none)"}\n`);

    if (post.targetUrl) {
      logStep("🔗", `X + Threads self-reply (2.5min after publish):`);
      console.log(`  More info → ${post.targetUrl}\n`);
    }

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

  // Derive ALT text from post metadata. ALT is used by X (accessibility +
  // ranking + search), Bluesky (feed previews + accessibility), Mastodon
  // (accessibility, also a soft trust signal in the fediverse).
  // Length cap is conservative — X allows 1000 chars but most readers will
  // tap out around 200.
  const imageAlt = deriveImageAlt(post).slice(0, 400);
  if (imageBuffer && imageAlt) {
    logStep("♿", `ALT: ${imageAlt}`);
  }

  const platforms = ["x", "threads", "bluesky", "facebook", "mastodon", "instagram"];
  const published = [];
  const results = {};

  // X and Threads suppress outbound links algorithmically. Strategy: publish
  // the main post link-free (copy-gen leaves the URL out), then after a 2-3
  // min delay reply to ourselves with the link. The algorithm has finished
  // scoring the parent post by then; the reply is scored separately.
  const SELF_REPLY_PLATFORMS = new Set(["x", "threads"]);
  const SELF_REPLY_DELAY_MS = 150_000; // 2.5 min — long enough that the parent has been ranked
  const pendingSelfReplies = []; // [{ platform, parentId, replyText }]

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
      } else if (platform === "instagram") {
        // Instagram requires a public image URL — skip if none available
        if (!post.ogImage) {
          logSkip(`instagram: no public image URL available (required)`);
          continue;
        }
        const result = await client.publish(copy, post.ogImage);
        results[platform] = result;
      } else if (platform === "x" || platform === "bluesky" || platform === "mastodon") {
        // These publishers all accept an imageAlt parameter and set the
        // platform's accessibility metadata when the image is uploaded.
        const result = await client.publish(copy, imageBuffer, imageAlt);
        results[platform] = result;
      } else {
        const result = await client.publish(copy, imageBuffer);
        results[platform] = result;
      }

      logPublish(platform, `Published: ${JSON.stringify(results[platform])}`);
      published.push(platform);

      // Queue a delayed self-reply with the link on link-suppressing platforms
      if (SELF_REPLY_PLATFORMS.has(platform) && post.targetUrl && results[platform]?.id) {
        pendingSelfReplies.push({
          platform,
          parentId: results[platform].id,
          replyText: `More info → ${post.targetUrl}`,
        });
      }
    } catch (err) {
      logError(`${platform}: ${err.message}`);
    }

    // Small delay between platforms
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Self-reply pass: wait for the algorithm to score the parents, then reply
  // with the link in parallel across platforms.
  if (pendingSelfReplies.length > 0) {
    logStep(
      "⏳",
      `Waiting ${Math.round(SELF_REPLY_DELAY_MS / 1000)}s before posting link as self-reply (${pendingSelfReplies.map(p => p.platform).join(", ")})…`
    );
    await new Promise((r) => setTimeout(r, SELF_REPLY_DELAY_MS));

    await Promise.all(
      pendingSelfReplies.map(async (pending) => {
        try {
          const lib = await loadPlatform(pending.platform);
          const replyFn = pending.platform === "x" ? lib.replyToTweet : lib.replyToThread;
          const result = await replyFn(pending.parentId, pending.replyText);
          logPublish(pending.platform, `Self-reply with link posted: ${JSON.stringify(result)}`);
        } catch (err) {
          logError(`${pending.platform} self-reply failed: ${err.message}`);
        }
      })
    );
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

  // Queue an evening "doors-in-30" bump for tonight-pick posts. Bump fires
  // ~30 min before event time as a reply, catching the after-work audience.
  // Skipped automatically if the post has no time, the time has passed, or
  // we didn't get usable parent IDs from X / Threads / Bluesky.
  if (!dryRun && post.postType === "tonight-pick") {
    try {
      const queued = queueBump({ post, results });
      if (queued) logStep("⏰", `Evening bump queued`);
    } catch (err) {
      logError(`Bump queue failed: ${err.message}`);
    }
  }

  const attempted = platforms.filter(
    (p) => CONFIG.PLATFORMS[p] && (!platformFilter || platformFilter.includes(p)) && post.copy?.[p]
  );

  logSuccess(`Published to ${published.length} platform(s): ${published.join(", ") || "none"}`);

  // Structured summary for discord-notify.py
  const failedPlatforms = attempted.filter((p) => !published.includes(p));
  const publishSummary = {
    published: published.length,
    succeeded: published,
    failed: failedPlatforms,
    items: [{
      title: items[0]?.title || "(unknown)",
      platforms: published,
      postIds: Object.fromEntries(
        Object.entries(results).filter(([, r]) => r?.id || r?.uri).map(([p, r]) => [p, r.id || r.uri])
      ),
      copy: (post.copy?.x || Object.values(post.copy || {})[0] || "").slice(0, 100),
    }],
  };
  console.log(`\nPUBLISH_SUMMARY:${JSON.stringify(publishSummary)}`);

  if (attempted.length > 0 && published.length === 0) {
    console.error("PUBLISH_FAILED: No platforms succeeded");
    process.exit(1);
  }
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
