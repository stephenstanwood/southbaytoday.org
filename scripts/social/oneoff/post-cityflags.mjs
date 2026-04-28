#!/usr/bin/env node
// One-off: post the @cityflags Bay Area flag redesign to all 5 platforms with image attached.
// Threads needs a public image URL (Blob), the others take a buffer.
// Usage: node scripts/social/oneoff/post-cityflags.mjs <imagePath> [--dry-run]

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envPath = join(__dirname, "..", "..", "..", ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const imagePath = args.find((a) => !a.startsWith("--"));

if (!imagePath) {
  console.error("Usage: node post-cityflags.mjs <imagePath> [--dry-run]");
  process.exit(1);
}

const COPY = {
  x: "Just absolutely amazing work by @cityflags on Instagram, who made these fun redesigned flags for 14 Bay Area cities. Each one gets its own visual identity (Los Gatos diamond, Oakland oak, Fremont hills) and they all hang together as a set. https://redd.it/1sxhj5r",
  bluesky: "Just absolutely amazing work by @cityflags on Instagram, who made these fun redesigned flags for 14 Bay Area cities. Each one gets its own visual identity (Los Gatos diamond, Oakland oak, Fremont hills) and they all hang together as a set. https://redd.it/1sxhj5r",
  threads: "Just absolutely amazing work by @cityflags on Instagram, who made these fun redesigned flags for 14 Bay Area cities. Each one ends up with its own visual identity (Los Gatos diamond, Oakland oak, Fremont hills, Palo Alto redwood) and the whole set hangs together as one coherent design system. Found via r/bayarea: https://redd.it/1sxhj5r",
  facebook: "Just absolutely amazing work by @cityflags on Instagram, who made these fun redesigned flags for 14 Bay Area cities. Each one ends up with its own visual identity (Los Gatos diamond, Oakland oak, Fremont hills, Palo Alto redwood) and the whole set hangs together as one coherent design system. Found via the r/bayarea thread: https://www.reddit.com/r/bayarea/comments/1sxhj5r/i_redesigned_the_flags_of_14_bay_area_cities/",
  mastodon: "Just absolutely amazing work by @cityflags on Instagram, who made these fun redesigned flags for 14 Bay Area cities. Each one ends up with its own visual identity (Los Gatos diamond, Oakland oak, Fremont hills, Palo Alto redwood) and the whole set hangs together as one coherent system. Found via https://redd.it/1sxhj5r",
};

const IMAGE_ALT =
  "Grid of redesigned civic flags for 14 Bay Area cities (Cupertino, Foster City, Fremont, Gilroy, Los Gatos, Milpitas, Morgan Hill, Oakland, Palo Alto, San Francisco, San Jose, Santa Clara, Santa Rosa, Sunnyvale) by @cityflags on Instagram.";

async function main() {
  const buffer = readFileSync(imagePath);
  console.log(`Loaded image: ${imagePath} (${buffer.length} bytes)`);

  if (dryRun) {
    console.log("\n=== DRY RUN ===");
    for (const [p, t] of Object.entries(COPY)) {
      console.log(`\n[${p}] (${t.length} chars)`);
      console.log(`  ${t}`);
    }
    return;
  }

  const { uploadToBlob } = await import("../lib/recraft.mjs");
  const blobPath = `social-oneoff/cityflags-${Date.now()}.png`;
  console.log(`\nUploading to Blob: ${blobPath}`);
  const imageUrl = await uploadToBlob(buffer, blobPath);
  console.log(`Image URL: ${imageUrl}`);

  const results = {};

  const x = await import("../lib/platforms/x.mjs");
  const bluesky = await import("../lib/platforms/bluesky.mjs");
  const threads = await import("../lib/platforms/threads.mjs");
  const facebook = await import("../lib/platforms/facebook.mjs");
  const mastodon = await import("../lib/platforms/mastodon.mjs");

  for (const [name, fn] of [
    ["x", () => x.publish(COPY.x, buffer)],
    ["bluesky", () => bluesky.publish(COPY.bluesky, buffer, IMAGE_ALT)],
    ["threads", () => threads.publish(COPY.threads, imageUrl)],
    ["facebook", () => facebook.publish(COPY.facebook, buffer)],
    ["mastodon", () => mastodon.publish(COPY.mastodon, buffer, IMAGE_ALT)],
  ]) {
    try {
      console.log(`\n→ ${name}...`);
      const r = await fn();
      results[name] = { ok: true, ...r };
      console.log(`  ✓ ${JSON.stringify(r)}`);
    } catch (err) {
      results[name] = { ok: false, error: err.message };
      console.error(`  ✗ ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  const succeeded = Object.entries(results).filter(([, r]) => r.ok).map(([p]) => p);
  const failed = Object.entries(results).filter(([, r]) => !r.ok).map(([p]) => p);

  console.log(`\n=== Summary ===`);
  console.log(`Succeeded: ${succeeded.join(", ") || "(none)"}`);
  console.log(`Failed: ${failed.join(", ") || "(none)"}`);

  console.log(
    `\nPUBLISH_SUMMARY:${JSON.stringify({
      published: succeeded.length,
      succeeded,
      failed,
      items: [
        {
          title: "@cityflags Bay Area flag redesign",
          platforms: succeeded,
          postIds: Object.fromEntries(
            Object.entries(results)
              .filter(([, r]) => r.ok && (r.id || r.uri || r.postId))
              .map(([p, r]) => [p, r.id || r.uri || r.postId])
          ),
          copy: COPY.x.slice(0, 100),
        },
      ],
    })}`
  );

  if (failed.length === Object.keys(COPY).length) {
    console.error("PUBLISH_FAILED: No platforms succeeded");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
