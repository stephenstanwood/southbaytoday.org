#!/usr/bin/env node
// Manual repost of 2026-05-11 tonight-pick (Trivia Mondays at Dr. Funk) to
// Bluesky only. The original publish at 18:52 PT rejected the 2.3MB PNG poster
// with "blob too big (maximum 2000000)" — the other 5 platforms posted fine.
//
// Now that bluesky.mjs publish() auto-fits oversized buffers via JPEG re-encode,
// this just re-runs the Bluesky leg with the same text and image the rest of the
// fan-out used, then patches social-schedule.json's publishedTo entry from
// {ok:false} to {ok:true, postId}.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEDULE = join(REPO_ROOT, "src/data/south-bay/social-schedule.json");

const DATE = "2026-05-11";
const SLOT_TYPE = "tonight-pick";

const schedule = JSON.parse(readFileSync(SCHEDULE, "utf8"));
const slot = schedule.days?.[DATE]?.[SLOT_TYPE];
if (!slot) throw new Error(`No ${SLOT_TYPE} slot for ${DATE}`);

const bskyEntry = (slot.publishedTo || []).find((p) => p.platform === "bluesky");
if (bskyEntry && bskyEntry.ok) {
  console.log("Bluesky already marked ok — nothing to do.");
  process.exit(0);
}

const text = slot.copy?.bluesky;
const imageUrl = slot.imageUrl;
if (!text || !imageUrl) throw new Error("Slot is missing copy.bluesky or imageUrl");

console.log(`[repost] Slot: ${DATE} / ${SLOT_TYPE}`);
console.log(`[repost] Text (${text.length} chars): ${text}`);
console.log(`[repost] Image: ${imageUrl}`);

console.log(`[repost] Fetching image...`);
const imgRes = await fetch(imageUrl);
if (!imgRes.ok) throw new Error(`Image fetch failed (${imgRes.status})`);
const imgBuf = Buffer.from(await imgRes.arrayBuffer());
console.log(`[repost] Image size: ${(imgBuf.length / 1024).toFixed(0)} KB`);

const bsky = await import(join(REPO_ROOT, "scripts/social/lib/platforms/bluesky.mjs"));
const result = await bsky.publish(text, imgBuf, "Trivia Mondays at Dr. Funk poster");
console.log(`[repost] ✅ Posted: ${JSON.stringify(result)}`);

// Patch the schedule's publishedTo entry in place.
const next = (slot.publishedTo || []).map((p) =>
  p.platform === "bluesky"
    ? { platform: "bluesky", ok: true, postId: result.uri, uri: result.uri, cid: result.cid, text, repostedAt: new Date().toISOString() }
    : p
);
if (!next.some((p) => p.platform === "bluesky")) {
  next.push({ platform: "bluesky", ok: true, postId: result.uri, uri: result.uri, cid: result.cid, text, repostedAt: new Date().toISOString() });
}
slot.publishedTo = next;
writeFileSync(SCHEDULE, JSON.stringify(schedule, null, 2) + "\n");
console.log(`[repost] Updated ${SCHEDULE}`);
