#!/usr/bin/env node
// Delete ALL SBT posts older than a cutoff from every platform.
// Usage: node scripts/social/nuke-old-posts.mjs [--cutoff YYYY-MM-DD | --max-age-days=N] [--dry-run]
// Default: --max-age-days=7
//
// Also wired up as the Monday-morning weekly purge via
// scripts/social/weekly-purge.plist → org.southbaytoday.weekly-purge.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
try {
  const lines = readFileSync(join(__dirname, "..", "..", ".env.local"), "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const cutoffIdx = args.indexOf("--cutoff");
const maxAgeArg = args.find((a) => a.startsWith("--max-age-days="));

function computeCutoff() {
  if (cutoffIdx >= 0) return args[cutoffIdx + 1];
  const days = maxAgeArg ? Number(maxAgeArg.split("=")[1]) || 7 : 7;
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // YYYY-MM-DD in PT
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}
const cutoff = computeCutoff();

// Guardrail: refuse to run with a cutoff that's today or in the future.
// Posts are deleted iff createdAt < cutoff (strict <), so cutoff = today
// deletes everything that isn't today, including this morning's posts —
// which is almost certainly not what we want. Caller has to pass --force
// to override. This was added 2026-05-13 after a background process that
// accidentally ran with the old default (cutoff=today) nuked Mon+Tue.
const todayPT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
if (!force && cutoff >= todayPT) {
  console.error(`Refusing to run: cutoff ${cutoff} is today or later — that would delete posts from today (PT). Pass --force to override, or use --max-age-days=N for a safe age-based cutoff.`);
  process.exit(2);
}

console.log(`Deleting all posts before ${cutoff}${dryRun ? " (DRY RUN)" : ""}\n`);

const BSKY_API = "https://bsky.social/xrpc";

// ── Bluesky ──
async function nukeBluesky() {
  console.log("=== BLUESKY ===");
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) { console.log("  No credentials"); return; }

  const authRes = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password }),
  });
  if (!authRes.ok) { console.log("  Auth failed"); return; }
  const session = await authRes.json();
  const did = session.did;
  const token = session.accessJwt;

  let cursor = undefined;
  let deleted = 0;
  do {
    const url = `${BSKY_API}/app.bsky.feed.getAuthorFeed?actor=${did}&limit=50${cursor ? "&cursor=" + cursor : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    const feed = data.feed || [];

    for (const item of feed) {
      const post = item.post;
      const createdAt = (post.record?.createdAt || "").slice(0, 10);
      const text = (post.record?.text || "").slice(0, 60);

      if (createdAt && createdAt < cutoff) {
        if (dryRun) {
          console.log(`  Would delete: ${createdAt} ${text}`);
        } else {
          const rkey = post.uri.split("/").pop();
          const delRes = await fetch(`${BSKY_API}/com.atproto.repo.deleteRecord`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", rkey }),
          });
          console.log(`  ${delRes.ok ? "Deleted" : "Failed"}: ${createdAt} ${text}`);
          await new Promise(r => setTimeout(r, 200));
        }
        deleted++;
      }
    }

    cursor = data.cursor;
    if (feed.length === 0) break;
  } while (cursor);

  console.log(`  Total: ${deleted}\n`);
}

// ── X (Twitter) ──
async function nukeX() {
  console.log("=== X ===");
  const { deletePost } = await import("./lib/platforms/x.mjs");

  // X API v2 doesn't have a simple "list my tweets" without user ID.
  // Pull IDs from our own publish records (schedule + queue).
  const files = [
    join(__dirname, "..", "..", "src", "data", "south-bay", "social-schedule.json"),
    join(__dirname, "..", "..", "src", "data", "south-bay", "social-approved-queue.json"),
  ];

  const targets = []; // { id, pubDate }
  const seen = new Set();

  for (const f of files) {
    let data;
    try { data = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }

    if (data.days) {
      for (const [_d, day] of Object.entries(data.days)) {
        for (const [slot, s] of Object.entries(day || {})) {
          if (slot.startsWith("_")) continue;
          if (!s?.publishedTo || !s.publishedAt) continue;
          for (const e of s.publishedTo) {
            if (e.platform !== "x" || !e.ok) continue;
            const id = e.id || e.postId;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            targets.push({ id, pubDate: (s.publishedAt || "").slice(0, 10) });
          }
        }
      }
    }

    if (Array.isArray(data)) {
      for (const p of data) {
        if (!Array.isArray(p.publishedTo)) continue;
        for (const e of p.publishedTo) {
          if (e.platform !== "x" || !e.ok) continue;
          const id = e.id || e.postId;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          targets.push({ id, pubDate: (p.publishedAt || "").slice(0, 10) });
        }
      }
    }
  }

  let deleted = 0;
  for (const t of targets) {
    if (t.pubDate && t.pubDate >= cutoff) continue;
    if (dryRun) {
      console.log(`  Would delete: ${t.pubDate} ${t.id}`);
    } else {
      try {
        await deletePost(t.id);
        console.log(`  Deleted: ${t.pubDate} ${t.id}`);
      } catch (e) {
        console.log(`  Failed: ${t.id} ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 200));
    }
    deleted++;
  }
  console.log(`  Total from records: ${deleted}\n`);
}

// ── Threads ──
async function nukeThreads() {
  console.log("=== THREADS ===");
  const token = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!token || !userId) { console.log("  No credentials"); return; }

  let deleted = 0;
  let url = `https://graph.threads.net/v1.0/${userId}/threads?fields=id,text,timestamp&limit=50&access_token=${token}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) { console.log("  Fetch failed:", res.status); break; }
    const data = await res.json();

    for (const post of (data.data || [])) {
      const createdAt = (post.timestamp || "").slice(0, 10);
      const text = (post.text || "").slice(0, 60);

      if (createdAt && createdAt < cutoff) {
        if (dryRun) {
          console.log(`  Would delete: ${createdAt} ${text}`);
        } else {
          const delRes = await fetch(`https://graph.threads.net/v1.0/${post.id}?access_token=${token}`, { method: "DELETE" });
          console.log(`  ${delRes.ok ? "Deleted" : "Failed"}: ${createdAt} ${text}`);
          await new Promise(r => setTimeout(r, 500));
        }
        deleted++;
      }
    }

    url = data.paging?.next || null;
  }
  console.log(`  Total: ${deleted}\n`);
}

// ── Facebook ──
// FB API blocks /feed listing without pages_read_engagement (Meta App Review),
// so pull post IDs from our own publish records (schedule + queue) and delete
// each one we've previously published before the cutoff.
async function nukeFacebook() {
  console.log("=== FACEBOOK ===");
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) { console.log("  No credentials"); return; }

  const files = [
    join(__dirname, "..", "..", "src", "data", "south-bay", "social-schedule.json"),
    join(__dirname, "..", "..", "src", "data", "south-bay", "social-approved-queue.json"),
  ];

  const targets = []; // { id, pubDate }
  const seen = new Set();

  for (const f of files) {
    let data;
    try { data = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }

    // Schedule shape: { days: { date: { slot: { publishedAt, publishedTo: [{platform,id,ok}] } } } }
    if (data.days) {
      for (const [_d, day] of Object.entries(data.days)) {
        for (const [slot, s] of Object.entries(day || {})) {
          if (slot.startsWith("_")) continue;
          if (!s?.publishedTo || !s.publishedAt) continue;
          for (const e of s.publishedTo) {
            if (e.platform !== "facebook" || !e.ok) continue;
            const id = e.id || e.postId;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            targets.push({ id, pubDate: (s.publishedAt || "").slice(0, 10) });
          }
        }
      }
    }

    // Queue shape: [{ publishedAt, publishedTo: [{platform,id,ok}] }, ...]
    if (Array.isArray(data)) {
      for (const p of data) {
        if (!Array.isArray(p.publishedTo)) continue;
        for (const e of p.publishedTo) {
          if (e.platform !== "facebook" || !e.ok) continue;
          const id = e.id || e.postId;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          targets.push({ id, pubDate: (p.publishedAt || "").slice(0, 10) });
        }
      }
    }
  }

  let deleted = 0;
  for (const t of targets) {
    if (t.pubDate && t.pubDate >= cutoff) continue;
    if (dryRun) {
      console.log(`  Would delete: ${t.pubDate} ${t.id}`);
    } else {
      const delRes = await fetch(`https://graph.facebook.com/v21.0/${t.id}?access_token=${token}`, { method: "DELETE" });
      const body = delRes.ok ? "" : ` (${await delRes.text().then(s => s.slice(0,80))})`;
      console.log(`  ${delRes.ok ? "Deleted" : "Failed"}: ${t.pubDate} ${t.id}${body}`);
      await new Promise(r => setTimeout(r, 500));
    }
    deleted++;
  }
  console.log(`  Total from records: ${deleted}\n`);
}

// ── Instagram ──
async function nukeInstagram() {
  console.log("=== INSTAGRAM ===");
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;
  if (!token || !userId) { console.log("  No credentials"); return; }

  let deleted = 0;
  let url = `https://graph.instagram.com/v25.0/${userId}/media?fields=id,caption,timestamp&limit=50&access_token=${token}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) { console.log("  Fetch failed:", res.status, await res.text()); break; }
    const data = await res.json();

    for (const post of (data.data || [])) {
      const createdAt = (post.timestamp || "").slice(0, 10);
      const text = (post.caption || "").slice(0, 60);

      if (createdAt && createdAt < cutoff) {
        if (dryRun) {
          console.log(`  Would delete: ${createdAt} ${text}`);
        } else {
          const delRes = await fetch(`https://graph.instagram.com/v25.0/${post.id}?access_token=${token}`, { method: "DELETE" });
          console.log(`  ${delRes.ok ? "Deleted" : "Failed"}: ${createdAt} ${text}`);
          await new Promise(r => setTimeout(r, 500));
        }
        deleted++;
      }
    }

    url = data.paging?.next || null;
  }
  console.log(`  Total: ${deleted}\n`);
}

// ── Mastodon ──
// Mastodon enforces a separate hard cap on deletions: ~30 per 30 minutes.
// On 429 we read the x-ratelimit-reset header and sleep until it expires
// (capped at 35min) before continuing. Don't run in CI without a long timeout.
async function nukeMastodon() {
  console.log("=== MASTODON ===");
  const token = process.env.MASTODON_ACCESS_TOKEN;
  const instance = process.env.MASTODON_INSTANCE || "https://mastodon.social";
  if (!token) { console.log("  No credentials"); return; }

  const meRes = await fetch(`${instance}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) { console.log("  Auth failed"); return; }
  const me = await meRes.json();

  let deleted = 0;
  let failed = 0;
  let maxId = undefined;

  outer: while (true) {
    const url = `${instance}/api/v1/accounts/${me.id}/statuses?limit=40${maxId ? "&max_id=" + maxId : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const statuses = await res.json();
    if (statuses.length === 0) break;

    for (const status of statuses) {
      const createdAt = (status.created_at || "").slice(0, 10);
      const text = (status.content || "").replace(/<[^>]*>/g, "").slice(0, 60);

      if (!createdAt || createdAt >= cutoff) continue;
      if (dryRun) {
        console.log(`  Would delete: ${createdAt} ${text}`);
        deleted++;
        continue;
      }

      // Up to 2 attempts: first try, then wait-for-reset and retry once
      for (let attempt = 0; attempt < 2; attempt++) {
        const delRes = await fetch(`${instance}/api/v1/statuses/${status.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (delRes.ok) {
          console.log(`  Deleted: ${createdAt} ${text}`);
          deleted++;
          break;
        }
        if (delRes.status === 429 && attempt === 0) {
          const reset = delRes.headers.get("x-ratelimit-reset");
          const waitMs = reset
            ? Math.max(1000, Math.min(35 * 60 * 1000, new Date(reset).getTime() - Date.now() + 5000))
            : 30 * 60 * 1000;
          console.log(`  Rate limited — sleeping ${Math.round(waitMs / 1000)}s until ${reset || "default reset"}…`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        console.log(`  Failed: ${createdAt} ${text} (${delRes.status})`);
        failed++;
        break;
      }
      await new Promise(r => setTimeout(r, 400));
    }

    maxId = statuses[statuses.length - 1].id;
  }
  console.log(`  Total deleted: ${deleted}, failed: ${failed}\n`);
}

await nukeBluesky();
await nukeX();
await nukeThreads();
await nukeFacebook();
await nukeInstagram();
await nukeMastodon();

console.log("Done");
