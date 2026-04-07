#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Signal — Delete Stale Published Posts
// Finds posts that were published AFTER their event date and deletes them
// from all platforms, then marks them as deleted in the queue.
//
// Usage: node scripts/social/delete-stale-posts.mjs [--dry-run]
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-approved-queue.json");

// Load env
try {
  const envPath = join(__dirname, "..", "..", ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const queue = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));

  // Find posts published after their event date
  const stalePublished = queue.filter((p) => {
    if (!p.published || !p.publishedTo) return false;
    const eventDate = p.item?.date || p.date;
    if (!eventDate) return false;
    const publishedDate = p.publishedAt?.split("T")[0];
    if (!publishedDate) return false;
    return publishedDate > eventDate;
  });

  console.log(`Found ${stalePublished.length} posts published after event date:\n`);

  for (const post of stalePublished) {
    const title = post.item?.title || "(unknown)";
    const eventDate = post.item?.date || post.date;
    const publishedDate = post.publishedAt?.split("T")[0];
    console.log(`  📌 ${title}`);
    console.log(`     Event: ${eventDate} | Published: ${publishedDate}`);

    for (const result of post.publishedTo || []) {
      if (!result.ok) continue;
      const postId = result.postId || result.id || result.uri;
      if (!postId) continue;

      console.log(`     ${result.platform}: ${postId}`);

      if (dryRun) {
        console.log(`     🏜️  DRY RUN — would delete from ${result.platform}`);
        continue;
      }

      try {
        const client = await import(`./lib/platforms/${result.platform}.mjs`);
        // Use uri for Bluesky, postId/id for others
        const deleteId = result.platform === "bluesky" ? result.uri : (result.id || result.postId);
        await client.deletePost(deleteId);
        console.log(`     ✅ Deleted from ${result.platform}`);
        result.deleted = true;
      } catch (err) {
        console.log(`     ❌ Delete failed on ${result.platform}: ${err.message}`);
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    // Mark in queue
    if (!dryRun) {
      post.publishResult = "deleted-stale";
    }
    console.log();
  }

  // Also expire all unpublished posts with past dates
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  let expiredCount = 0;
  for (const p of queue) {
    if (p.published) continue;
    const eventDate = p.item?.date || p.date;
    if (eventDate && eventDate < today) {
      if (!dryRun) {
        p.published = true;
        p.publishedAt = new Date().toISOString();
        p.publishResult = "expired-stale";
      }
      expiredCount++;
    }
  }
  console.log(`Expired ${expiredCount} unpublished stale posts`);

  if (!dryRun) {
    writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2) + "\n");
    console.log("\n✅ Queue updated");
  } else {
    console.log("\n🏜️  DRY RUN complete — no changes made");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
