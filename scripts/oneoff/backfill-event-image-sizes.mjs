#!/usr/bin/env node
// One-off: resize blob-hosted Recraft event-card images (lossless
// 1280x832, mislabeled image/png) down to 280x180 lossy webp q80, upload to
// new size-suffixed blob paths, and update every upcoming-events.json event
// that referenced the old URL + the matching event-image-cache.json
// byFingerprint entry. Scoped to URLs currently referenced by live events
// (events-archive.json is out of scope and keeps working off the old,
// still-live blob paths). See D46 (2026-07-16).
//
// Run: node --env-file=.env.local scripts/oneoff/backfill-event-image-sizes.mjs

import { readFileSync } from "node:fs";
import { loadEnvLocal } from "../lib/env.mjs";
import { ARTIFACTS, DATA_DIR } from "../lib/paths.mjs";
import { writeFileAtomic } from "../lib/io.mjs";
import { resizeAndUploadToBlob } from "../social/lib/recraft.mjs";
import { join } from "node:path";

loadEnvLocal();

const CACHE_PATH = join(DATA_DIR, "event-image-cache.json");

async function main() {
  const eventsData = JSON.parse(readFileSync(ARTIFACTS.events, "utf8"));
  const cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));

  const events = eventsData.events || [];
  const liveUrls = [...new Set(
    events
      .map((e) => e.image)
      .filter((u) => typeof u === "string" && u.includes("vercel-storage.com/event-images/") && !u.includes("-280.webp")),
  )];

  console.log(`${liveUrls.length} unique blob-hosted event image URLs to backfill.\n`);

  const urlMap = new Map();
  let totalBefore = 0;
  let totalAfter = 0;
  let oversizeCount = 0;
  const OVERSIZE_THRESHOLD = 500_000;

  for (const oldUrl of liveUrls) {
    const res = await fetch(oldUrl);
    if (!res.ok) {
      console.warn(`  ⚠️  fetch ${res.status}: ${oldUrl}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > OVERSIZE_THRESHOLD) oversizeCount++;

    const base = oldUrl.split("/event-images/")[1].replace(/\.png$/i, "");
    const { url, buffer } = await resizeAndUploadToBlob(buf, `event-images/${base}-280.webp`, {
      width: 280,
      height: 180,
      fit: "cover",
    });

    totalBefore += buf.length;
    totalAfter += buffer.length;
    console.log(`  ✓ ${base}: ${buf.length}B → ${buffer.length}B`);
    urlMap.set(oldUrl, url);
    await new Promise((r) => setTimeout(r, 300));
  }

  // Update every event referencing a backfilled URL.
  let eventsUpdated = 0;
  for (const e of events) {
    if (e.image && urlMap.has(e.image)) {
      e.image = urlMap.get(e.image);
      eventsUpdated++;
    }
  }

  // Update matching byFingerprint cache entries so future regens don't
  // re-generate images we already have a resized derivative for.
  let cacheUpdated = 0;
  for (const entry of Object.values(cache.byFingerprint || {})) {
    if (entry?.image && urlMap.has(entry.image)) {
      entry.image = urlMap.get(entry.image);
      cacheUpdated++;
    }
  }

  writeFileAtomic(ARTIFACTS.events, JSON.stringify(eventsData, null, 2) + "\n");
  writeFileAtomic(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");

  console.log(`\n✅ Backfilled ${urlMap.size} unique images.`);
  console.log(`   Events updated: ${eventsUpdated}`);
  console.log(`   Cache entries updated: ${cacheUpdated}`);
  console.log(`   Oversize (>500KB) source images found: ${oversizeCount}`);
  console.log(`   Before: ${(totalBefore / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   After:  ${(totalAfter / 1024 / 1024).toFixed(2)}MB`);
}

main().catch((err) => { console.error(err); process.exit(1); });
