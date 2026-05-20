#!/usr/bin/env node
// One-off: delete today's tonight-pick (Sunnyvale Community Equity Assessment
// Forum) from all 6 platforms + their self-reply children, reset the slot
// to image-approved, then publish-from-queue --force-slot will pick it up
// and re-fire with the MJ image. The schedule's imageUrl already points at
// Stephen's MJ upload (restored after the race-condition wipe earlier today).
//
// Run on Mini:
//   ssh stephenstanwood@10.0.0.234 \
//     'cd ~/Projects/southbaytoday.org && \
//      /opt/homebrew/bin/node --env-file=.env.local \
//      scripts/social/oneoff/delete-and-repost-2026-05-20-tonight-pick.mjs'

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULE_FILE = join(__dirname, "..", "..", "..", "src", "data", "south-bay", "social-schedule.json");
const DATE = "2026-05-20";
const SLOT = "tonight-pick";

const sched = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
const slot = sched.days?.[DATE]?.[SLOT];
if (!slot) {
  console.error(`No ${SLOT} slot for ${DATE}`);
  process.exit(1);
}

const published = slot.publishedTo || [];
console.log(`\n🗑  Deleting ${DATE} ${SLOT} from ${published.length} platforms\n`);

for (const result of published) {
  if (!result.ok) continue;
  const { platform } = result;
  const client = await import(`../lib/platforms/${platform}.mjs`);

  // Self-reply children first (X / Threads URL bumps) so deleting the
  // parent doesn't orphan them.
  for (const childId of result.ownReplies || []) {
    try {
      await client.deletePost(childId);
      console.log(`  ${platform.padEnd(10)} child  ${String(childId).slice(0, 70)} ✅`);
    } catch (err) {
      console.log(`  ${platform.padEnd(10)} child  ${String(childId).slice(0, 70)} ❌ ${err.message.slice(0, 80)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const deleteId = platform === "bluesky" ? result.uri : (result.postId || result.id);
  if (!deleteId) {
    console.log(`  ${platform.padEnd(10)} parent (no id) ⚠️`);
    continue;
  }
  try {
    await client.deletePost(deleteId);
    console.log(`  ${platform.padEnd(10)} parent ${String(deleteId).slice(0, 70)} ✅`);
    result.deleted = true;
    result.deletedAt = new Date().toISOString();
  } catch (err) {
    console.log(`  ${platform.padEnd(10)} parent ${String(deleteId).slice(0, 70)} ❌ ${err.message.slice(0, 80)}`);
    result.deleteError = err.message;
  }
  await new Promise((r) => setTimeout(r, 800));
}

// Archive old publish state, reset for republish. Status flip from "published"
// → "image-approved" lets publish-from-queue's schedule-path selection
// (currentSlot.status !== "published") pick it up again.
slot.publishedTo_deleted = slot.publishedTo;
delete slot.publishedTo;
slot.publishedAt_deleted = slot.publishedAt;
delete slot.publishedAt;
slot.status = "image-approved";
slot.repostReason = "wiped Recraft microphone; reposting with MJ upload (race-condition fix earlier today)";
slot.repostInitiatedAt = new Date().toISOString();

writeFileSync(SCHEDULE_FILE, JSON.stringify(sched, null, 2) + "\n");
console.log(`\n✅ Slot reset to image-approved.`);
console.log(`Next: /opt/homebrew/bin/node --env-file=.env.local scripts/social/publish-from-queue.mjs --max 1 --force-slot tonight-pick`);
