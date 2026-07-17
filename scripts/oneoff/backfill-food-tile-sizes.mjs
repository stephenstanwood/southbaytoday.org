#!/usr/bin/env node
// One-off: resize scc-food-openings Recraft fallback tiles (lossless
// 896x1152, mislabeled image/png) down to 450x340 lossy webp q80, upload to
// new size-suffixed blob paths, and update scc-food-image-cache.json + any
// inline `image` refs on scc-food-openings.json. See D45 (2026-07-16).
//
// Run: node --env-file=.env.local scripts/oneoff/backfill-food-tile-sizes.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "../lib/env.mjs";
import { DATA_DIR, ARTIFACTS } from "../lib/paths.mjs";
import { writeFileAtomic } from "../lib/io.mjs";
import { resizeAndUploadToBlob } from "../social/lib/recraft.mjs";

loadEnvLocal();

const IMAGE_CACHE_PATH = join(DATA_DIR, "scc-food-image-cache.json");

async function main() {
  const cache = JSON.parse(readFileSync(IMAGE_CACHE_PATH, "utf8"));
  const openings = JSON.parse(readFileSync(ARTIFACTS.foodOpenings, "utf8"));

  const urlMap = new Map(); // old url -> new url
  let totalBefore = 0;
  let totalAfter = 0;
  let done = 0;

  for (const [sourceId, entry] of Object.entries(cache)) {
    if (!entry?.url || !entry.url.includes("vercel-storage.com")) continue;
    if (entry.url.includes("-450.webp")) continue; // already backfilled

    const res = await fetch(entry.url);
    if (!res.ok) {
      console.warn(`  ⚠️  ${sourceId}: fetch ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const { url, buffer } = await resizeAndUploadToBlob(buf, `food-tiles/${sourceId}-450.webp`, {
      width: 450,
      height: 340,
    });

    totalBefore += buf.length;
    totalAfter += buffer.length;
    console.log(`  ✓ ${sourceId}: ${buf.length}B → ${buffer.length}B`);

    urlMap.set(entry.url, url);
    entry.url = url;
    done++;
    await new Promise((r) => setTimeout(r, 300));
  }

  // Update any inline `image` fields on the live opened/comingSoon items that
  // pointed at an old URL we just resized.
  let inlineUpdated = 0;
  for (const item of [...(openings.opened || []), ...(openings.comingSoon || [])]) {
    if (item.image && urlMap.has(item.image)) {
      item.image = urlMap.get(item.image);
      inlineUpdated++;
    }
  }

  writeFileAtomic(IMAGE_CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
  if (inlineUpdated > 0) {
    writeFileAtomic(ARTIFACTS.foodOpenings, JSON.stringify(openings, null, 2) + "\n");
  }

  console.log(`\n✅ Backfilled ${done} food tiles (${inlineUpdated} inline refs updated).`);
  console.log(`   Before: ${(totalBefore / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   After:  ${(totalAfter / 1024 / 1024).toFixed(2)}MB`);
}

main().catch((err) => { console.error(err); process.exit(1); });
