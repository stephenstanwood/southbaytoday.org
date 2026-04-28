#!/usr/bin/env node
// Delete posts that went out with the site default og-image.png as image
// (because /plan/[id] pages don't set a plan-specific og:image, so the
// publish-from-queue og-fetch fallback grabbed the brand card).
//
// Filter: published=true + targetUrl includes /plan/ + cardPath null + has publishedTo entries
// Updates queue: marks entries with deletedAt + deletedReason.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE = join(__dirname, "..", "..", "..", "src", "data", "south-bay", "social-approved-queue.json");

if (!process.env.X_API_KEY) {
  try {
    const lines = readFileSync(join(__dirname, "..", "..", "..", ".env.local"), "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const dryRun = process.argv.includes("--dry-run");

const x = await import("../lib/platforms/x.mjs");
const bluesky = await import("../lib/platforms/bluesky.mjs");
const threads = await import("../lib/platforms/threads.mjs");
const facebook = await import("../lib/platforms/facebook.mjs");
const mastodon = await import("../lib/platforms/mastodon.mjs");

const queue = JSON.parse(readFileSync(QUEUE, "utf8"));

const targets = queue.filter(e =>
  e.published === true &&
  e.publishedAt &&
  e.targetUrl && e.targetUrl.includes("/plan/") &&
  (e.cardPath === null || e.cardPath === undefined) &&
  Array.isArray(e.publishedTo) && e.publishedTo.some(p => p.ok) &&
  !e.deletedAt
);

console.log(`Found ${targets.length} posts to delete\n`);

let deletedTotal = 0;
let failedTotal = 0;

for (const entry of targets) {
  console.log(`\n── ${entry.publishedAt}  ${entry.item?.title}`);
  const results = [];

  for (const p of entry.publishedTo) {
    if (!p.ok) continue;
    const id = p.postId || p.id || p.uri;
    if (!id) continue;
    const platform = p.platform;

    if (dryRun) {
      console.log(`  [dry] would delete ${platform}: ${id}`);
      results.push({ platform, id, ok: true, dryRun: true });
      continue;
    }

    try {
      let r;
      if (platform === "x") r = await x.deletePost(id);
      else if (platform === "bluesky") r = await bluesky.deletePost(id);
      else if (platform === "threads") r = await threads.deletePost(id);
      else if (platform === "facebook") r = await facebook.deletePost(id);
      else if (platform === "mastodon") r = await mastodon.deletePost(id);
      else { console.log(`  ? unknown platform ${platform}`); continue; }
      console.log(`  ✓ ${platform}: deleted (${id.slice(0, 40)})`);
      results.push({ platform, id, ok: true });
      deletedTotal++;
    } catch (err) {
      const msg = err.message || String(err);
      console.error(`  ✗ ${platform}: ${msg.slice(0, 200)}`);
      results.push({ platform, id, ok: false, error: msg });
      failedTotal++;
    }
    await new Promise(r => setTimeout(r, 600));
  }

  if (!dryRun) {
    entry.deletedAt = new Date().toISOString();
    entry.deletedReason = "site og-image.png fallback (plan URL had no plan-specific og:image)";
    entry.deletedResults = results;
  }
}

if (!dryRun) {
  writeFileSync(QUEUE, JSON.stringify(queue, null, 2) + "\n");
  console.log(`\nQueue updated.`);
}

console.log(`\n=== Summary ===`);
console.log(`Posts processed: ${targets.length}`);
console.log(`Successful deletes: ${deletedTotal}`);
console.log(`Failed: ${failedTotal}`);
