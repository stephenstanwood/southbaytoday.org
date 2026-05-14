#!/usr/bin/env node
// One-off (2026-05-14): the Social Signal dashboard was showing ~60 zombie
// entries from before the new auto-prune (PR after #107) was wired up. The
// posts had already been deleted from each platform (via the one-time bulk
// purge + Stephen's manual FB/IG cleanup), but the engagement collector
// preserved their historical entries because Bluesky's APIs return
// success-with-zero for deleted posts (not a clean 404).
//
// This script does what the new pruneRecords() would have done if it had
// shipped earlier: drops every engagement-file post whose publishedAt is
// before a cutoff (default: today PT midnight UTC).
//
// Usage: node scripts/social/oneoff/cleanup-engagement-zombies-2026-05-14.mjs [--cutoff YYYY-MM-DD] [--dry-run]

import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..", "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const cutoffIdx = args.indexOf("--cutoff");
const cutoffStr = cutoffIdx >= 0
  ? args[cutoffIdx + 1]
  : new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const cutoffMs = new Date(`${cutoffStr}T00:00:00.000Z`).getTime();

console.log(`Dropping engagement entries with publishedAt < ${cutoffStr} (UTC)${dryRun ? " [DRY RUN]" : ""}`);

function pruneFile(relPath, isEngagement) {
  const path = join(REPO, relPath);
  let data;
  try { data = JSON.parse(readFileSync(path, "utf8")); } catch (err) { console.log(`  ${relPath}: ${err.message}`); return; }

  if (isEngagement) {
    const before = (data.posts || []).length;
    data.posts = (data.posts || []).filter((p) => {
      const t = new Date(p.publishedAt || 0).getTime();
      return Number.isFinite(t) && t >= cutoffMs;
    });
    data.postCount = data.posts.length;
    data.totals = data.posts.reduce((acc, p) => {
      for (const v of Object.values(p.platforms || {})) {
        acc.likes += v.counts?.likes || 0;
        acc.reposts += v.counts?.reposts || 0;
        acc.quotes += v.counts?.quotes || 0;
        acc.replies += v.counts?.replies || 0;
      }
      return acc;
    }, { likes: 0, reposts: 0, quotes: 0, replies: 0 });
    data.lastUpdated = new Date().toISOString();
    console.log(`  ${relPath}: ${before} → ${data.posts.length} posts`);
    if (!dryRun) {
      const tmp = path + ".tmp";
      writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
      renameSync(tmp, path);
    }
    return;
  }

  // Schedule + queue: clear publishedTo arrays on entries older than cutoff
  let touched = 0;
  if (data.days) {
    for (const day of Object.values(data.days)) {
      for (const [slotType, slot] of Object.entries(day || {})) {
        if (slotType.startsWith("_")) continue;
        if (!Array.isArray(slot?.publishedTo) || !slot.publishedAt) continue;
        const t = new Date(slot.publishedAt).getTime();
        if (Number.isFinite(t) && t < cutoffMs && slot.publishedTo.length > 0) {
          slot.publishedTo = [];
          touched++;
        }
      }
    }
  } else if (Array.isArray(data)) {
    for (const p of data) {
      if (!Array.isArray(p.publishedTo) || !p.publishedAt) continue;
      const t = new Date(p.publishedAt).getTime();
      if (Number.isFinite(t) && t < cutoffMs && p.publishedTo.length > 0) {
        p.publishedTo = [];
        touched++;
      }
    }
  }
  console.log(`  ${relPath}: ${touched} entries cleared`);
  if (touched > 0 && !dryRun) {
    const tmp = path + ".tmp";
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
    renameSync(tmp, path);
  }
}

pruneFile("src/data/south-bay/social-engagement.json", true);
pruneFile("src/data/south-bay/social-schedule.json", false);
pruneFile("src/data/south-bay/social-approved-queue.json", false);
