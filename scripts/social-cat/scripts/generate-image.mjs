#!/usr/bin/env node
// social-cat image generator — wraps SBT's Recraft client for trend posts.
//
// Reads one JSON request from stdin:
//   { "prompt": "...", "slug": "trend-2026-05-19-google-io", "size": "1:1" }
//
// Writes one JSON result to stdout:
//   { "ok": true,  "path": "/abs/path/to/data/images/<slug>.png", "url": "https://..." }
//   { "ok": false, "error": "..." }
//
// Reuses the battle-tested generateAndUpload helper at
// scripts/social/lib/recraft.mjs (Recraft V4 + Vercel Blob upload), so we
// inherit retries, env loading, out-of-credit detection.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const IMAGES_DIR = join(ROOT, "data", "images");
const SBT_ROOT = "/Users/stephenstanwood/Projects/southbaytoday.org";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

async function main() {
  let req;
  try {
    req = JSON.parse(readFileSync(0, "utf8"));
  } catch (e) {
    emit({ ok: false, error: `bad stdin json: ${e.message}` });
    process.exit(2);
  }
  const prompt = (req.prompt || "").trim();
  const slug = (req.slug || "").trim().replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  if (!prompt) { emit({ ok: false, error: "empty prompt" }); process.exit(2); }
  if (!slug)   { emit({ ok: false, error: "empty slug"   }); process.exit(2); }

  // Default 1:1 — works for IG/FB/Bluesky/Mastodon/Threads with center crop.
  // X uses 16:9 natively but accepts square.
  const size = req.size || "1:1";

  try {
    const { generateAndUpload } = await import(`${SBT_ROOT}/scripts/social/lib/recraft.mjs`);
    const pathname = `social-cat/${slug}.png`;
    // generateAndUpload signature: { prompt, pathname, colors?, model? }
    // We don't pass colors so Recraft picks; default model is recraftv4.
    const { url, buffer } = await generateAndUpload({ prompt, pathname });

    mkdirSync(IMAGES_DIR, { recursive: true });
    const localPath = join(IMAGES_DIR, `${slug}.png`);
    writeFileSync(localPath, buffer);

    // Note: we override default size by passing it through if generateAndUpload
    // exposes it (currently it doesn't — uses recraft.mjs default 4:5). The
    // wrapper accepts but ignores `size`; that's fine for MVP. Iterate later
    // if 4:5 portraits look off for our use case.
    void size;

    emit({ ok: true, path: localPath, url });
  } catch (e) {
    emit({ ok: false, error: String(e?.message || e).slice(0, 500) });
    process.exit(1);
  }
}

main();
