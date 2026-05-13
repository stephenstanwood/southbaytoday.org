#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Today — Weekly Social Purge
// Deletes SBT posts older than --max-age-days, gated on engagement: posts
// with replies/reposts/quotes (any) OR likes ≥ MIN_LIKES_TO_KEEP on any
// visible platform are kept.
//
// Sources:
//   - src/data/south-bay/social-engagement.json  (engagement counts; refreshed
//     every 3 min by org.southbaytoday.collect-engagement)
//   - src/data/south-bay/social-schedule.json    (current publish path)
//   - src/data/south-bay/social-approved-queue.json (older publish path)
//
// FB has no engagement visibility (pages_read_engagement wall), but its post
// IDs do appear in schedule/queue — we delete those alongside the rest.
//
// Usage: node scripts/social/weekly-purge.mjs [--dry-run] [--max-age-days=7]
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "src", "data", "south-bay");
const ENGAGEMENT_FILE = join(DATA_DIR, "social-engagement.json");
const SCHEDULE_FILE = join(DATA_DIR, "social-schedule.json");
const QUEUE_FILE = join(DATA_DIR, "social-approved-queue.json");

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

// ── Build canonical post list from schedule + queue ────────────────────────

function loadPublishedGroups() {
  const groups = []; // { publishedAt, title, entries: [{platform, id, uri}] }

  if (existsSync(SCHEDULE_FILE)) {
    const sched = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
    for (const [date, day] of Object.entries(sched.days || {})) {
      for (const [slotType, slot] of Object.entries(day || {})) {
        if (slotType.startsWith("_")) continue;
        if (!slot || slot.status !== "published") continue;
        if (!Array.isArray(slot.publishedTo) || !slot.publishedTo.length) continue;
        groups.push({
          publishedAt: slot.publishedAt,
          title: slot.item?.title || `${date}/${slotType}`,
          entries: slot.publishedTo.filter((e) => e.ok),
        });
      }
    }
  }

  if (existsSync(QUEUE_FILE)) {
    const queue = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
    for (const p of queue) {
      if (!p.published || !Array.isArray(p.publishedTo) || !p.publishedTo.length) continue;
      if (p.publishResult && p.publishResult !== "ok") continue;
      groups.push({
        publishedAt: p.publishedAt,
        title: p.item?.title || "(queue)",
        entries: p.publishedTo.filter((e) => e.ok),
      });
    }
  }

  // Dedupe by overlapping platform IDs (schedule + queue can hold the same post)
  const seen = new Set();
  const deduped = [];
  for (const g of groups) {
    const keys = g.entries.map((e) => `${e.platform}:${e.uri || e.id || e.postId || ""}`);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    deduped.push(g);
  }
  return deduped;
}

// ── Engagement lookup (by platform post ID) ────────────────────────────────

function loadEngagementMap() {
  const map = new Map(); // platformId → counts
  if (!existsSync(ENGAGEMENT_FILE)) return map;
  const data = JSON.parse(readFileSync(ENGAGEMENT_FILE, "utf8"));
  for (const post of data.posts || []) {
    for (const [platform, info] of Object.entries(post.platforms || {})) {
      if (!info?.id) continue;
      map.set(`${platform}:${info.id}`, info.counts || {});
    }
  }
  return map;
}

function groupHasEngagement(group, engagementMap) {
  for (const e of group.entries) {
    const id = e.uri || e.id || e.postId;
    if (!id) continue;
    const counts = engagementMap.get(`${e.platform}:${id}`);
    if (!counts) continue; // platform with no engagement visibility (e.g. FB) — skip
    if ((counts.replies || 0) > 0) return true;
    if ((counts.reposts || 0) > 0) return true;
    if ((counts.quotes || 0) > 0) return true;
    if ((counts.likes || 0) >= MIN_LIKES_TO_KEEP) return true;
  }
  return false;
}

function groupCountsSummary(group, engagementMap) {
  const tot = { likes: 0, reposts: 0, quotes: 0, replies: 0 };
  for (const e of group.entries) {
    const id = e.uri || e.id || e.postId;
    const c = engagementMap.get(`${e.platform}:${id}`);
    if (!c) continue;
    tot.likes += c.likes || 0;
    tot.reposts += c.reposts || 0;
    tot.quotes += c.quotes || 0;
    tot.replies += c.replies || 0;
  }
  return tot;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const cutoffMs = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const cutoffISO = new Date(cutoffMs).toISOString();

  console.log(`Weekly purge — max age ${MAX_AGE_DAYS}d, cutoff ${cutoffISO}${dryRun ? " (DRY RUN)" : ""}`);

  const groups = loadPublishedGroups();
  const engagementMap = loadEngagementMap();
  console.log(`loaded ${groups.length} published post groups, ${engagementMap.size} platform engagement entries\n`);

  let kept = 0;
  let purged = 0;
  let deletedPlatforms = 0;
  let errored = 0;

  for (const group of groups) {
    const pubMs = new Date(group.publishedAt || 0).getTime();
    if (!pubMs || pubMs >= cutoffMs) continue;

    if (groupHasEngagement(group, engagementMap)) {
      const t = groupCountsSummary(group, engagementMap);
      console.log(`KEEP  ${group.publishedAt?.slice(0, 10)} ${group.title.slice(0, 60)}`);
      console.log(`      ↳ likes=${t.likes} reposts=${t.reposts} quotes=${t.quotes} replies=${t.replies}`);
      kept++;
      continue;
    }

    console.log(`PURGE ${group.publishedAt?.slice(0, 10)} ${group.title.slice(0, 60)}`);
    purged++;

    for (const e of group.entries) {
      const id = e.uri || e.id || e.postId;
      if (!id) continue;
      const deleter = DELETERS[e.platform];
      if (!deleter) {
        console.log(`      ↳ ${e.platform}: no deleter — skipping`);
        continue;
      }
      if (dryRun) {
        console.log(`      ↳ ${e.platform}: would delete ${id}`);
        deletedPlatforms++;
        continue;
      }
      try {
        await deleter(id);
        console.log(`      ↳ ${e.platform}: deleted`);
        deletedPlatforms++;
      } catch (err) {
        const msg = err.message || String(err);
        if (/404|not found|does not exist/i.test(msg)) {
          console.log(`      ↳ ${e.platform}: already gone`);
        } else {
          console.log(`      ↳ ${e.platform}: ERROR ${msg}`);
          errored++;
        }
      }
      await sleep(400);
    }
  }

  console.log(`\nSummary: ${purged} posts purged across ${deletedPlatforms} platform-rows, ${kept} kept, ${errored} errors`);
  if (dryRun) console.log("(dry run — no changes)");
}

main().catch((err) => {
  console.error("weekly-purge failed:", err);
  process.exit(1);
});
