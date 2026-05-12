#!/usr/bin/env node
// One-off: delete + repost 2026-05-11 tonight-pick on the 5 platforms where
// the old day-name rewriter mangled idiomatic copy.
//
// Background: until the time-references.mjs split, rewriteTimeReferences()
// used `\b<DayName>\b/gi` and replaced every occurrence with "today" /
// "Today" — turning "out of the house on a Monday" into "out of the house on
// a Today" on X, "kind of Monday night" → "kind of Today night" on Threads,
// "through a Monday than proving" → "through a Today than proving" on
// Facebook, "Monday nights can actually be fun" → "Today nights..." on
// Instagram, and "Monday just got a reason to exist" → "Today just got a
// reason to exist" on Mastodon. Bluesky was reposted clean via the PR #79
// oneoff using copy verbatim, so it's already correct.
//
// This script:
//   1. Reads tonight's slot from social-schedule.json.
//   2. Runs the NEW rewriter on copy.<platform> to get the corrected text.
//   3. Deletes the broken post on each of x/threads/facebook/instagram/mastodon.
//   4. Posts the corrected text + same image.
//   5. Updates publishedTo[platform] in the schedule with the new postId and a
//      `repostedAt` timestamp.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEDULE = join(REPO_ROOT, "src/data/south-bay/social-schedule.json");

const DATE = "2026-05-11";
const SLOT_TYPE = "tonight-pick";
const PLATFORMS_TO_REPOST = ["x", "threads", "facebook", "instagram", "mastodon"];

const schedule = JSON.parse(readFileSync(SCHEDULE, "utf8"));
const slot = schedule.days?.[DATE]?.[SLOT_TYPE];
if (!slot) throw new Error(`No ${SLOT_TYPE} slot for ${DATE}`);

const { rewriteTimeReferences } = await import(join(REPO_ROOT, "scripts/social/lib/time-references.mjs"));
const item = { ...(slot.item || {}), date: DATE };
// Publish-time clock for the rewriter — same instant as the original publish,
// so "this afternoon" → "tonight" decisions match what would have run.
const ptTime = new Date();

// Compute corrected text per platform using the new rewriter.
const correctedCopy = {};
for (const p of PLATFORMS_TO_REPOST) {
  const src = slot.copy?.[p];
  if (!src) { console.warn(`[repost] no copy.${p} — skipping`); continue; }
  correctedCopy[p] = rewriteTimeReferences(src, item, ptTime);
}

console.log("=== Corrected copy ===");
for (const [p, t] of Object.entries(correctedCopy)) {
  console.log(`\n[${p}]\n${t}`);
}

if (!process.argv.includes("--confirm")) {
  console.log("\n[repost] DRY mode — pass --confirm to delete + repost.");
  process.exit(0);
}

// Fetch the image buffer once for the buffer-upload platforms.
const imageUrl = slot.imageUrl;
if (!imageUrl) throw new Error("slot.imageUrl missing");
console.log(`\n[repost] Fetching image: ${imageUrl}`);
const imgRes = await fetch(imageUrl);
if (!imgRes.ok) throw new Error(`Image fetch failed (${imgRes.status})`);
const imgBuf = Buffer.from(await imgRes.arrayBuffer());
console.log(`[repost] Image: ${(imgBuf.length / 1024).toFixed(0)} KB`);

const platformLib = {
  x: await import(join(REPO_ROOT, "scripts/social/lib/platforms/x.mjs")),
  threads: await import(join(REPO_ROOT, "scripts/social/lib/platforms/threads.mjs")),
  facebook: await import(join(REPO_ROOT, "scripts/social/lib/platforms/facebook.mjs")),
  instagram: await import(join(REPO_ROOT, "scripts/social/lib/platforms/instagram.mjs")),
  mastodon: await import(join(REPO_ROOT, "scripts/social/lib/platforms/mastodon.mjs")),
};

function findPublishedEntry(p) {
  return (slot.publishedTo || []).find((e) => e.platform === p);
}

const results = {};

for (const p of PLATFORMS_TO_REPOST) {
  const text = correctedCopy[p];
  if (!text) continue;
  const prev = findPublishedEntry(p);
  if (!prev?.ok) { console.warn(`[${p}] no prior ok-entry, skipping`); continue; }

  // Delete prior post
  try {
    console.log(`\n[${p}] Deleting ${prev.postId} …`);
    await platformLib[p].deletePost(prev.postId);
    console.log(`[${p}] ✅ deleted`);
  } catch (err) {
    console.error(`[${p}] ❌ delete failed: ${err.message}`);
    results[p] = { ok: false, error: `delete: ${err.message}` };
    continue;
  }

  await new Promise((r) => setTimeout(r, 800));

  // Repost
  try {
    let result;
    if (p === "x" || p === "facebook") {
      result = await platformLib[p].publish(text, imgBuf);
    } else if (p === "mastodon") {
      result = await platformLib[p].publish(text, imgBuf, "Trivia Mondays at Dr. Funk poster");
    } else if (p === "threads" || p === "instagram") {
      // These two take a URL, not a buffer.
      result = await platformLib[p].publish(text, imageUrl);
    }
    console.log(`[${p}] ✅ reposted: ${JSON.stringify(result).slice(0, 200)}`);
    results[p] = { ok: true, ...result, text };
  } catch (err) {
    console.error(`[${p}] ❌ repost failed: ${err.message}`);
    results[p] = { ok: false, error: `post: ${err.message}` };
  }

  await new Promise((r) => setTimeout(r, 800));
}

// Patch publishedTo in place.
slot.publishedTo = (slot.publishedTo || []).map((entry) => {
  if (!PLATFORMS_TO_REPOST.includes(entry.platform)) return entry;
  const r = results[entry.platform];
  if (!r) return entry;
  if (!r.ok) {
    return { ...entry, repostAttemptedAt: new Date().toISOString(), repostError: r.error };
  }
  return {
    platform: entry.platform,
    ok: true,
    postId: r.id || r.postId || r.uri || null,
    ...r,
    text: r.text,
    repostedAt: new Date().toISOString(),
    previousPostId: entry.postId,
  };
});

writeFileSync(SCHEDULE, JSON.stringify(schedule, null, 2) + "\n");
console.log(`\n[repost] Updated ${SCHEDULE}`);

console.log("\n=== SUMMARY ===");
for (const p of PLATFORMS_TO_REPOST) {
  const r = results[p];
  if (!r) console.log(`${p}: (skipped)`);
  else if (r.ok) console.log(`✅ ${p}: ${r.id || r.postId || r.uri}`);
  else console.log(`❌ ${p}: ${r.error}`);
}

const failed = Object.values(results).filter((r) => !r.ok).length;
process.exit(failed > 0 ? 1 : 0);
