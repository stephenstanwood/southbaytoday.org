#!/usr/bin/env node
// One-off: delete today's day-plan post (DishDash 7:30 AM mistake) from all 6
// platforms and mark the schedule slot as deleted so the publisher won't
// re-fire it. Run on Mini.
//
//   ssh stephenstanwood@10.0.0.234 \
//     'cd ~/Projects/southbaytoday.org && \
//      /opt/homebrew/bin/node --env-file=.env.local \
//      scripts/social/oneoff/delete-2026-05-07-dayplan.mjs'

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULE_FILE = join(__dirname, "..", "..", "..", "src", "data", "south-bay", "social-schedule.json");
const DATE = "2026-05-07";
const SLOT = "day-plan";

const sched = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
const slot = sched.days?.[DATE]?.[SLOT];
if (!slot) {
  console.error(`No ${SLOT} slot found for ${DATE}`);
  process.exit(1);
}
const published = slot.publishedTo || [];
console.log(`Found ${published.length} platform posts to delete:\n`);

for (const result of published) {
  if (!result.ok) continue;
  const { platform } = result;
  const deleteId = platform === "bluesky" ? result.uri : (result.id || result.postId);
  if (!deleteId) {
    console.log(`  ${platform}: no id, skipping`);
    continue;
  }
  console.log(`  ${platform}: ${deleteId}`);
  try {
    const client = await import(`../lib/platforms/${platform}.mjs`);
    await client.deletePost(deleteId);
    console.log(`    ✅ deleted`);
    result.deleted = true;
    result.deletedAt = new Date().toISOString();
  } catch (err) {
    console.log(`    ❌ ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 800));
}

// Mark the slot as deleted so the publisher won't try to send anything else
// for it. Keep the original copy/image around for forensics.
slot.status = "deleted";
slot.deletedAt = new Date().toISOString();
slot.deletedReason = "DishDash mis-slotted at 7:30 AM (closed until 11 AM Thu); regen pending";

writeFileSync(SCHEDULE_FILE, JSON.stringify(sched, null, 2) + "\n");
console.log(`\nMarked ${DATE} ${SLOT} as deleted in social-schedule.json`);
