#!/usr/bin/env node
// One-off: post the Campbell Library Grand Reopening across the 5-platform
// pipeline with Stephen's photo of the kids area. Runs on the Mini.
//
// Photo source on Mini: /tmp/campbell-library-source.jpg (scp'd from laptop).
// Outputs: PNG buffer (resized) for direct uploads, JPG-on-Blob for Threads URL.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

// Load .env.local manually (matches pattern used by other social scripts).
function loadEnv() {
  try {
    const envPath = join(REPO_ROOT, ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    }
  } catch (err) {
    console.warn(`[env] couldn't load .env.local: ${err.message}`);
  }
}
loadEnv();

const SOURCE = "/tmp/campbell-library-source.jpg";
const URL = "https://sccl.bibliocommons.com/events/69eaa404f29b90618eff4e24";

const COPY = {
  x:
    "Campbell Library reopens today — lion dancers at 9:45, Elephant & Piggie storytime at 11, bubble show on the grass at 1, live organ at 2. We previewed it this week and the new kids play area is a real treat.\n\n#Campbell #SouthBay\n" +
    URL,
  bluesky:
    "Campbell Library reopens today — lion dancers at 9:45, Elephant & Piggie storytime at 11, bubble show at 1, organ trio at 2. We previewed it this week and the new kids play area is great.\n\n#Campbell #SouthBay\n" +
    URL,
  threads:
    "Campbell Library reopens this morning, 10 AM–6 PM. We snuck in for a preview earlier this week and the new kids play area is genuinely lovely — well worth bringing the kids by.\n\nToday: lion dancers at 9:45, Elephant & Piggie storytime at 11, public art talk with Sheri Simons at 11:30, bubble show at 1, live organ at 2. Library tours throughout.\n\n#Campbell #SouthBay #SCCLD #LibraryLove\n" +
    URL,
  facebook:
    "The Campbell Library reopens today, and the lineup is worth showing up for. Lion dancers at 9:45 AM, welcome remarks at 10, doors open at 10:15. Coffee and juice out front (donated by Silicon Valley Clean Energy) until 11:30. Then Elephant and Piggie storytime at 11, a public art talk with artist Sheri Simons at 11:30, photos with Elephant and Piggie at noon, a paper-pinwheel craft, a bubble show on the grass at 1, and live music with Thee Organ Trio at 2. Library tours throughout the day.\n\nWe snuck in for a preview earlier this week, and the new kids play area is a real treat — well worth a visit if you've got little ones. @SCCLD did a beautiful job with this rebuild.\n\n" +
    URL,
  mastodon:
    "Campbell Library reopens today, 10 AM–6 PM. We got a preview this week and the new kids play area is a real treat — well worth a visit with the little ones.\n\nToday's lineup: lion dancers at 9:45, Elephant & Piggie storytime at 11, public art talk at 11:30, bubble show at 1, live organ at 2. Library tours throughout.\n\n#Campbell #CampbellCA #SouthBay #BayArea #SCCLD #Library #SiliconValley\n" +
    URL,
};

const ALT_TEXT =
  "Children's play area at the newly reopened Campbell Library: a tall wooden water-tower character with a smiling face, a blue tube slide curling out of it, and hopscotch on a red carpet, with picture-book stacks visible in the background.";

console.log(`[campbell] Reading ${SOURCE}`);
const sourceBuffer = readFileSync(SOURCE);
console.log(`[campbell] Source size: ${(sourceBuffer.length / 1024).toFixed(0)} KB`);

console.log(`[campbell] Re-encoding to PNG (1080w, compressed)...`);
const pngBuffer = await sharp(sourceBuffer)
  .rotate()
  .resize({ width: 1080, withoutEnlargement: true })
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();
console.log(`[campbell] PNG size: ${(pngBuffer.length / 1024).toFixed(0)} KB`);

console.log(`[campbell] Re-encoding to JPEG (1200w, q82) for Blob URL...`);
const jpgBuffer = await sharp(sourceBuffer)
  .rotate()
  .resize({ width: 1200, withoutEnlargement: true })
  .jpeg({ quality: 82, progressive: true })
  .toBuffer();
console.log(`[campbell] JPEG size: ${(jpgBuffer.length / 1024).toFixed(0)} KB`);

const { put } = await import("@vercel/blob");
const blob = await put(
  `posters/2026-05-09-campbell-library-${Date.now()}.jpg`,
  jpgBuffer,
  {
    access: "public",
    contentType: "image/jpeg",
    allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  },
);
console.log(`[campbell] Blob URL: ${blob.url}`);

const results = {};

async function tryPublish(name, fn) {
  try {
    const r = await fn();
    results[name] = { ok: true, ...r };
    console.log(`✅ ${name}: ${JSON.stringify(r).slice(0, 200)}`);
  } catch (err) {
    results[name] = { ok: false, error: err.message };
    console.error(`❌ ${name}: ${err.message}`);
  }
}

const x = await import(join(REPO_ROOT, "scripts/social/lib/platforms/x.mjs"));
const bsky = await import(join(REPO_ROOT, "scripts/social/lib/platforms/bluesky.mjs"));
const fb = await import(join(REPO_ROOT, "scripts/social/lib/platforms/facebook.mjs"));
const mas = await import(join(REPO_ROOT, "scripts/social/lib/platforms/mastodon.mjs"));
const threads = await import(join(REPO_ROOT, "scripts/social/lib/platforms/threads.mjs"));

await tryPublish("x", () => x.publish(COPY.x, pngBuffer));
await new Promise((r) => setTimeout(r, 800));
// Bluesky has a 2MB blob limit — PNG of a real photo blows past it. Use JPEG.
// The publish() wrapper hardcodes image/png, so call uploadImage + createPost directly.
await tryPublish("bluesky", async () => {
  const blob = await bsky.uploadImage(jpgBuffer, "image/jpeg");
  return bsky.createPost(COPY.bluesky, blob, ALT_TEXT);
});
await new Promise((r) => setTimeout(r, 800));
await tryPublish("facebook", () => fb.publish(COPY.facebook, pngBuffer));
await new Promise((r) => setTimeout(r, 800));
await tryPublish("mastodon", () => mas.publish(COPY.mastodon, pngBuffer, ALT_TEXT));
await new Promise((r) => setTimeout(r, 800));
await tryPublish("threads", () => threads.publish(COPY.threads, blob.url));

console.log("\n=== SUMMARY ===");
for (const [k, v] of Object.entries(results)) {
  console.log(`${v.ok ? "✅" : "❌"} ${k}: ${v.ok ? "posted" : v.error}`);
}

const failed = Object.values(results).filter((r) => !r.ok).length;
process.exit(failed > 0 ? 1 : 0);
