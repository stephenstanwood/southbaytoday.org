#!/usr/bin/env node
// One-off: resize the 12 live reddit-pulse tiles (lossless 896x1152 webp,
// mislabeled image/png) down to 400x400 lossy webp q80, upload to new
// size-suffixed blob paths, and update reddit-pulse.json + the image cache
// so the resized derivatives are what ships. See D43 (2026-07-16).
//
// Run: node --env-file=.env.local scripts/oneoff/backfill-reddit-pulse-tile-sizes.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "../lib/env.mjs";
import { DATA_DIR } from "../lib/paths.mjs";
import { writeFileAtomic } from "../lib/io.mjs";
import { resizeAndUploadToBlob } from "../social/lib/recraft.mjs";

loadEnvLocal();

const PULSE_PATH = join(DATA_DIR, "reddit-pulse.json");
const CACHE_PATH = join(DATA_DIR, "reddit-image-cache.json");

async function main() {
  const pulse = JSON.parse(readFileSync(PULSE_PATH, "utf8"));
  const cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));

  let totalBefore = 0;
  let totalAfter = 0;
  let done = 0;

  for (const post of pulse.posts) {
    if (!post.image || !post.image.includes("vercel-storage.com")) continue;
    if (post.image.includes("-400.webp")) continue; // already backfilled

    const res = await fetch(post.image);
    if (!res.ok) {
      console.warn(`  ⚠️  ${post.id}: fetch ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const { url, buffer } = await resizeAndUploadToBlob(buf, `reddit-pulse/${post.id}-400.webp`, {
      width: 400,
      height: 400,
    });

    totalBefore += buf.length;
    totalAfter += buffer.length;
    console.log(`  ✓ ${post.id}: ${buf.length}B → ${buffer.length}B`);

    post.image = url;
    if (cache[post.id]) cache[post.id].url = url;
    done++;
    await new Promise((r) => setTimeout(r, 300));
  }

  writeFileAtomic(PULSE_PATH, JSON.stringify(pulse, null, 2) + "\n");
  writeFileAtomic(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");

  console.log(`\n✅ Backfilled ${done} tiles.`);
  console.log(`   Before: ${(totalBefore / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   After:  ${(totalAfter / 1024 / 1024).toFixed(2)}MB`);
}

main().catch((err) => { console.error(err); process.exit(1); });
