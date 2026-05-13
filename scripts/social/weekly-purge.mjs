#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Today — Weekly Social Purge
// Deletes SBT posts older than --max-age-days, gated on engagement: posts
// with replies/reposts/quotes (any) OR likes ≥ MIN_LIKES_TO_KEEP are kept.
//
// Source of truth: src/data/south-bay/social-engagement.json (refreshed every
// 3 min by org.southbaytoday.collect-engagement). Posts not in that file
// (>30d old) are out of reach — by the time the recurring job stabilises,
// the rolling window means everything we need is in the file.
//
// Usage: node scripts/social/weekly-purge.mjs [--dry-run] [--max-age-days=7]
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGAGEMENT_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-engagement.json");

// Load env (idempotent when launchd already passes --env-file)
try {
  const envPath = join(__dirname, "..", "..", ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const maxAgeArg = args.find((a) => a.startsWith("--max-age-days="));
const MAX_AGE_DAYS = maxAgeArg ? Number(maxAgeArg.split("=")[1]) || 7 : 7;
const MIN_LIKES_TO_KEEP = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hasEngagement(platformData) {
  const c = platformData?.counts || {};
  if ((c.replies || 0) > 0) return true;
  if ((c.reposts || 0) > 0) return true;
  if ((c.quotes || 0) > 0) return true;
  if ((c.likes || 0) >= MIN_LIKES_TO_KEEP) return true;
  return false;
}

function summariseCounts(post) {
  const tot = { likes: 0, reposts: 0, quotes: 0, replies: 0 };
  for (const v of Object.values(post.platforms || {})) {
    const c = v?.counts || {};
    tot.likes += c.likes || 0;
    tot.reposts += c.reposts || 0;
    tot.quotes += c.quotes || 0;
    tot.replies += c.replies || 0;
  }
  return tot;
}

// ── Platform delete helpers ────────────────────────────────────────────────

const BSKY_API = "https://bsky.social/xrpc";
let _bskySession = null;

async function bskySession() {
  if (_bskySession) return _bskySession;
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) throw new Error("Missing BLUESKY_HANDLE / BLUESKY_APP_PASSWORD");
  const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password }),
  });
  if (!res.ok) throw new Error(`Bluesky auth ${res.status}`);
  _bskySession = await res.json();
  return _bskySession;
}

async function deleteBluesky(uri) {
  const session = await bskySession();
  const rkey = uri.split("/").pop();
  const res = await fetch(`${BSKY_API}/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", rkey }),
  });
  if (!res.ok) throw new Error(`bluesky ${res.status}`);
}

async function deleteThreads(id) {
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) throw new Error("Missing THREADS_ACCESS_TOKEN");
  const res = await fetch(`https://graph.threads.net/v1.0/${id}?access_token=${token}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`threads ${res.status}`);
}

async function deleteFacebook(id) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("Missing FB_PAGE_ACCESS_TOKEN");
  const res = await fetch(`https://graph.facebook.com/v21.0/${id}?access_token=${token}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`facebook ${res.status}`);
}

async function deleteInstagram(id) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error("Missing INSTAGRAM_ACCESS_TOKEN");
  const res = await fetch(`https://graph.instagram.com/v25.0/${id}?access_token=${token}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`instagram ${res.status}`);
}

async function deleteMastodon(id) {
  const token = process.env.MASTODON_ACCESS_TOKEN;
  const instance = process.env.MASTODON_INSTANCE || "https://mastodon.social";
  if (!token) throw new Error("Missing MASTODON_ACCESS_TOKEN");
  const res = await fetch(`${instance}/api/v1/statuses/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`mastodon ${res.status}`);
}

async function deleteX(id) {
  // X uses OAuth 1.0a — defer to the platform client to avoid duplicating that here.
  const { deletePost } = await import("./lib/platforms/x.mjs");
  await deletePost(id);
}

const DELETERS = {
  bluesky: deleteBluesky,
  threads: deleteThreads,
  facebook: deleteFacebook,
  instagram: deleteInstagram,
  mastodon: deleteMastodon,
  x: deleteX,
};

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const data = JSON.parse(readFileSync(ENGAGEMENT_FILE, "utf8"));
  const cutoffMs = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const cutoffISO = new Date(cutoffMs).toISOString();

  console.log(`Weekly purge — max age ${MAX_AGE_DAYS}d, cutoff ${cutoffISO}${dryRun ? " (DRY RUN)" : ""}`);
  console.log(`engagement file: ${data.postCount} posts, last updated ${data.lastUpdated}\n`);

  let kept = 0;
  let deletedPosts = 0;
  let deletedPlatforms = 0;
  let errored = 0;

  for (const post of data.posts || []) {
    // Skip non-SBT (defensive — HHSS doesn't appear here under the SBT job, but be explicit)
    if ((post.brand || "SBT") !== "SBT") continue;

    const pubMs = new Date(post.publishedAt || 0).getTime();
    if (!pubMs || pubMs >= cutoffMs) continue; // too new

    // Engagement gate: any platform with engagement → keep the whole post
    const platforms = post.platforms || {};
    const keep = Object.values(platforms).some(hasEngagement);
    if (keep) {
      const t = summariseCounts(post);
      console.log(`KEEP  ${post.publishedAt?.slice(0, 10)} ${post.title.slice(0, 60)}`);
      console.log(`      ↳ likes=${t.likes} reposts=${t.reposts} quotes=${t.quotes} replies=${t.replies}`);
      kept++;
      continue;
    }

    console.log(`PURGE ${post.publishedAt?.slice(0, 10)} ${post.title.slice(0, 60)}`);
    deletedPosts++;

    for (const [platform, info] of Object.entries(platforms)) {
      const id = info?.id;
      if (!id) continue;
      const deleter = DELETERS[platform];
      if (!deleter) {
        console.log(`      ↳ ${platform}: no deleter — skipping`);
        continue;
      }
      if (dryRun) {
        console.log(`      ↳ ${platform}: would delete ${id}`);
        deletedPlatforms++;
        continue;
      }
      try {
        await deleter(id);
        console.log(`      ↳ ${platform}: deleted`);
        deletedPlatforms++;
      } catch (err) {
        // Treat "already gone" as success-ish to avoid spammy retries.
        const msg = err.message || String(err);
        if (/404|not found|does not exist/i.test(msg)) {
          console.log(`      ↳ ${platform}: already gone`);
        } else {
          console.log(`      ↳ ${platform}: ERROR ${msg}`);
          errored++;
        }
      }
      await sleep(400); // gentle on rate limits
    }
  }

  console.log(`\nSummary: ${deletedPosts} posts purged across ${deletedPlatforms} platform-rows, ${kept} kept, ${errored} errors`);
  if (dryRun) console.log("(dry run — no changes)");
}

main().catch((err) => {
  console.error("weekly-purge failed:", err);
  process.exit(1);
});
