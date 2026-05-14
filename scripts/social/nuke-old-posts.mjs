#!/usr/bin/env node
// Delete ALL SBT posts older than a cutoff from every platform.
//
// Cutoff modes (mutually exclusive; default: --max-age-days=7):
//   --all-before-now        Delete everything published before the moment
//                           the script starts. Used by the Saturday weekly
//                           cron to start each week fresh.
//   --cutoff YYYY-MM-DD     Delete posts with createdAt before midnight UTC
//                           of this date.
//   --max-age-days=N        Cutoff = (today PT - N days) at midnight UTC.
//
// All comparisons are timestamp-based (ms); we don't string-compare UTC date
// fragments any more. That misbehaves at the Pacific/UTC date boundary —
// e.g. a Friday-8pm-PT post has UTC date == Saturday, so cutoff=Saturday
// would have kept it under the old logic. With --all-before-now and timestamp
// math, "Friday night" really means "before Saturday morning".
//
// Used as the Saturday 3:30am weekly purge via scripts/social/weekly-purge.plist
// → org.southbaytoday.weekly-purge.

import { readFileSync, writeFileSync, renameSync } from "node:fs";
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
const notify = args.includes("--notify");
const allBeforeNow = args.includes("--all-before-now");
const cutoffIdx = args.indexOf("--cutoff");
const maxAgeArg = args.find((a) => a.startsWith("--max-age-days="));

// Per-platform tallies for the notify summary
const platformStats = {
  bluesky: { deleted: 0, failed: 0 },
  x: { deleted: 0, failed: 0 },
  threads: { deleted: 0, failed: 0 },
  facebook: { deleted: 0, failed: 0 },
  instagram: { deleted: 0, failed: 0 },
  mastodon: { deleted: 0, failed: 0 },
};

// IDs we've successfully deleted on each platform. Used by pruneRecords()
// at end of run to update schedule.json + queue.json + engagement.json so
// the Social Signal dashboard doesn't show zombie entries pointing at
// just-deleted posts.
const deletedIds = {
  bluesky: new Set(),
  x: new Set(),
  threads: new Set(),
  facebook: new Set(),
  instagram: new Set(),
  mastodon: new Set(),
};

// Compute the cutoff as a millisecond timestamp. Display string is for the
// startup banner + the Discord notification only.
function computeCutoff() {
  if (allBeforeNow) {
    const ms = Date.now();
    return { ms, display: new Date(ms).toISOString() };
  }
  if (cutoffIdx >= 0) {
    const dateStr = args[cutoffIdx + 1];
    const ms = new Date(`${dateStr}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(ms)) {
      console.error(`Bad --cutoff value: ${dateStr}. Expected YYYY-MM-DD.`);
      process.exit(2);
    }
    return { ms, display: dateStr };
  }
  const days = maxAgeArg ? Number(maxAgeArg.split("=")[1]) || 7 : 7;
  // Anchor to today PT (midnight) then walk back N days. The PT anchor keeps
  // the rolling window human-meaningful regardless of run hour.
  const todayPtStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const ms = new Date(`${todayPtStr}T00:00:00.000Z`).getTime() - days * 24 * 60 * 60 * 1000;
  return { ms, display: new Date(ms).toISOString().slice(0, 10) };
}
const { ms: cutoffMs, display: cutoffDisplay } = computeCutoff();

// Guardrail: refuse cutoffs in the future (with a small grace for clock skew).
// --all-before-now sets cutoff exactly == Date.now(), which is fine — it just
// won't delete a post that gets published mid-run.
if (!force && cutoffMs > Date.now() + 60_000) {
  console.error(`Refusing to run: cutoff ${cutoffDisplay} is in the future. Pass --force to override.`);
  process.exit(2);
}

function isBeforeCutoff(iso) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < cutoffMs;
}

console.log(`Deleting all posts before ${cutoffDisplay}${dryRun ? " (DRY RUN)" : ""}\n`);

const BSKY_API = "https://bsky.social/xrpc";

// All timeline-enumerating platforms (Bluesky, Threads, Mastodon, X) use this
// multi-pass shape: walk the full feed, delete anything before cutoff, then
// loop and re-walk to catch survivors. Bluesky deserves this in particular
// because its delete API returns 200 even for already-deleted records, and
// the engagement collector treats deleted posts as "still alive but zero
// counts" — so we want strong confirmation that the feed is actually empty
// of old posts before we stop.
const MAX_PASSES = 3;

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

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    // Walk the entire feed first so we know the full target count before
    // we start deleting. Lets us bail cleanly if pass 2+ shows zero survivors.
    const targets = []; // { uri, createdAt, text }
    let cursor = undefined;
    do {
      const url = `${BSKY_API}/app.bsky.feed.getAuthorFeed?actor=${did}&limit=50${cursor ? "&cursor=" + cursor : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) break;
      const data = await res.json();
      const feed = data.feed || [];
      for (const item of feed) {
        const post = item.post;
        const createdAt = post.record?.createdAt || "";
        if (isBeforeCutoff(createdAt)) {
          targets.push({ uri: post.uri, createdAt, text: (post.record?.text || "").slice(0, 60) });
        }
      }
      cursor = data.cursor;
      if (feed.length === 0) break;
    } while (cursor);

    if (targets.length === 0) {
      if (pass === 1) console.log("  Nothing to delete");
      else console.log(`  Pass ${pass}: clean (feed has 0 old posts)`);
      break;
    }

    console.log(`  Pass ${pass}: ${targets.length} post(s) older than cutoff`);
    let deletedThisPass = 0;
    for (const t of targets) {
      const displayDate = t.createdAt.slice(0, 10);
      if (dryRun) {
        console.log(`  Would delete: ${displayDate} ${t.text}`);
        deletedThisPass++;
        continue;
      }
      const rkey = t.uri.split("/").pop();
      const delRes = await fetch(`${BSKY_API}/com.atproto.repo.deleteRecord`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", rkey }),
      });
      console.log(`  ${delRes.ok ? "Deleted" : "Failed"}: ${displayDate} ${t.text}`);
      if (delRes.ok) { deletedThisPass++; platformStats.bluesky.deleted++; deletedIds.bluesky.add(t.uri); }
      else { platformStats.bluesky.failed++; }
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`  Pass ${pass}: ${deletedThisPass} deleted`);
    if (dryRun) break;
  }
}

// ── X (Twitter) ──
// Enumerates the user's tweet timeline via X API v2 and deletes anything
// older than the cutoff. This is the only platform where we previously
// relied on our own publish records — that left orphan tweets visible on
// x.com because not every published tweet got recorded (or pre-pipeline
// posts existed). Now we trust X as the source of truth.
//
// Repeats up to MAX_PASSES if the first pass leaves anything behind (e.g.
// after a 429 rate-limit retry burns through our budget). X DELETE is
// capped at 50/15min per user, so 55+ tweets means we will hit 429 once
// and need to wait.
async function nukeX() {
  console.log("=== X ===");
  const { deletePost, getMyUserId, listUserTweets } = await import(
    "./lib/platforms/x.mjs"
  );

  let userId;
  try {
    userId = await getMyUserId();
  } catch (e) {
    console.log(`  Failed to get user ID: ${e.message}`);
    return;
  }

  const MAX_PASSES = 3;
  let totalDeleted = 0;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    let timeline;
    try {
      timeline = await listUserTweets(userId);
    } catch (e) {
      console.log(`  Pass ${pass}: timeline fetch failed: ${e.message}`);
      break;
    }
    const targets = timeline.filter((t) => isBeforeCutoff(t.created_at));
    if (targets.length === 0) {
      if (pass === 1) console.log("  Nothing to delete");
      else console.log(`  Pass ${pass}: clean (timeline has 0 old tweets)`);
      break;
    }

    console.log(`  Pass ${pass}: ${targets.length} tweet(s) older than cutoff`);

    let deletedThisPass = 0;
    let rateLimitedAt = null;
    for (const t of targets) {
      const displayDate = (t.created_at || "").slice(0, 10);
      const text = (t.text || "").slice(0, 60).replace(/\n/g, " ");

      if (dryRun) {
        console.log(`  Would delete: ${displayDate} ${t.id} ${text}`);
        deletedThisPass++;
        continue;
      }

      let result;
      try {
        result = await deletePost(t.id);
      } catch (e) {
        console.log(`  Failed: ${displayDate} ${t.id} ${e.message}`);
        platformStats.x.failed++;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      if (result.rateLimited) {
        rateLimitedAt = result.resetEpoch;
        const resetIso = result.resetEpoch
          ? new Date(result.resetEpoch * 1000).toISOString()
          : "unknown";
        console.log(`  Rate limited at ${displayDate} ${t.id} — reset ${resetIso}`);
        // Pause until reset (capped at 16min) and break this pass so the
        // next listUserTweets refresh picks up any tweets that vanished
        // mid-loop via the X retry-after window.
        const waitMs = result.resetEpoch
          ? Math.max(5000, result.resetEpoch * 1000 - Date.now() + 5000)
          : 15 * 60_000;
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 16 * 60_000)));
        break;
      }

      if (result.deleted) {
        console.log(`  Deleted: ${displayDate} ${t.id} ${text}`);
        deletedThisPass++;
        totalDeleted++;
        platformStats.x.deleted++;
        deletedIds.x.add(t.id);
      } else {
        console.log(`  Skipped (no-op): ${displayDate} ${t.id}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log(`  Pass ${pass}: ${deletedThisPass} deleted`);
    // If we didn't hit a rate limit and we deleted everything we set out
    // to delete, one more verification pass next iteration will confirm
    // empty and exit. If we hit a rate limit, the next pass continues.
    if (!rateLimitedAt && deletedThisPass === targets.length) {
      // Fall through to one more verification pass; if X has tweets
      // remaining (eg. cache lag / out-of-band publishes) it'll re-target.
      continue;
    }
  }

  console.log(`  Total deleted: ${totalDeleted}\n`);
}

// ── Threads ──
async function nukeThreads() {
  console.log("=== THREADS ===");
  const token = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!token || !userId) { console.log("  No credentials"); return; }

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const targets = []; // { id, timestamp, text }
    let url = `https://graph.threads.net/v1.0/${userId}/threads?fields=id,text,timestamp&limit=50&access_token=${token}`;
    while (url) {
      const res = await fetch(url);
      if (!res.ok) { console.log("  Fetch failed:", res.status); break; }
      const data = await res.json();
      for (const post of (data.data || [])) {
        if (isBeforeCutoff(post.timestamp || "")) {
          targets.push({ id: post.id, timestamp: post.timestamp, text: (post.text || "").slice(0, 60) });
        }
      }
      url = data.paging?.next || null;
    }

    if (targets.length === 0) {
      if (pass === 1) console.log("  Nothing to delete");
      else console.log(`  Pass ${pass}: clean (feed has 0 old posts)`);
      break;
    }

    console.log(`  Pass ${pass}: ${targets.length} post(s) older than cutoff`);
    let deletedThisPass = 0;
    for (const t of targets) {
      const displayDate = (t.timestamp || "").slice(0, 10);
      if (dryRun) {
        console.log(`  Would delete: ${displayDate} ${t.text}`);
        deletedThisPass++;
        continue;
      }
      const delRes = await fetch(`https://graph.threads.net/v1.0/${t.id}?access_token=${token}`, { method: "DELETE" });
      console.log(`  ${delRes.ok ? "Deleted" : "Failed"}: ${displayDate} ${t.text}`);
      if (delRes.ok) { deletedThisPass++; platformStats.threads.deleted++; deletedIds.threads.add(t.id); }
      else { platformStats.threads.failed++; }
      await new Promise(r => setTimeout(r, 500));
    }
    console.log(`  Pass ${pass}: ${deletedThisPass} deleted`);
    if (dryRun) break;
  }
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
            targets.push({ id, publishedAt: s.publishedAt });
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
          targets.push({ id, publishedAt: p.publishedAt });
        }
      }
    }
  }

  let deleted = 0;
  for (const t of targets) {
    if (!isBeforeCutoff(t.publishedAt)) continue;
    const displayDate = (t.publishedAt || "").slice(0, 10);
    if (dryRun) {
      console.log(`  Would delete: ${displayDate} ${t.id}`);
      deleted++;
    } else {
      const delRes = await fetch(`https://graph.facebook.com/v21.0/${t.id}?access_token=${token}`, { method: "DELETE" });
      const body = delRes.ok ? "" : ` (${await delRes.text().then(s => s.slice(0,80))})`;
      console.log(`  ${delRes.ok ? "Deleted" : "Failed"}: ${displayDate} ${t.id}${body}`);
      if (delRes.ok) { deleted++; platformStats.facebook.deleted++; deletedIds.facebook.add(t.id); }
      else { platformStats.facebook.failed++; }
      await new Promise(r => setTimeout(r, 500));
    }
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
      const timestamp = post.timestamp || "";
      const displayDate = timestamp.slice(0, 10);
      const text = (post.caption || "").slice(0, 60);

      if (isBeforeCutoff(timestamp)) {
        if (dryRun) {
          console.log(`  Would delete: ${displayDate} ${text}`);
          deleted++;
        } else {
          const delRes = await fetch(`https://graph.instagram.com/v25.0/${post.id}?access_token=${token}`, { method: "DELETE" });
          console.log(`  ${delRes.ok ? "Deleted" : "Failed"}: ${displayDate} ${text}`);
          if (delRes.ok) { deleted++; platformStats.instagram.deleted++; deletedIds.instagram.add(post.id); }
          else { platformStats.instagram.failed++; }
          await new Promise(r => setTimeout(r, 500));
        }
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

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const targets = []; // { id, createdAt, text }
    let maxId = undefined;
    while (true) {
      const url = `${instance}/api/v1/accounts/${me.id}/statuses?limit=40${maxId ? "&max_id=" + maxId : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) break;
      const statuses = await res.json();
      if (statuses.length === 0) break;
      for (const status of statuses) {
        if (isBeforeCutoff(status.created_at || "")) {
          targets.push({
            id: status.id,
            createdAt: status.created_at,
            text: (status.content || "").replace(/<[^>]*>/g, "").slice(0, 60),
          });
        }
      }
      maxId = statuses[statuses.length - 1].id;
    }

    if (targets.length === 0) {
      if (pass === 1) console.log("  Nothing to delete");
      else console.log(`  Pass ${pass}: clean (timeline has 0 old statuses)`);
      break;
    }

    console.log(`  Pass ${pass}: ${targets.length} status(es) older than cutoff`);
    let deletedThisPass = 0;
    let failedThisPass = 0;
    for (const t of targets) {
      const displayDate = (t.createdAt || "").slice(0, 10);
      if (dryRun) {
        console.log(`  Would delete: ${displayDate} ${t.text}`);
        deletedThisPass++;
        continue;
      }

      // Up to 2 attempts: first try, then wait-for-reset and retry once
      for (let attempt = 0; attempt < 2; attempt++) {
        const delRes = await fetch(`${instance}/api/v1/statuses/${t.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (delRes.ok) {
          console.log(`  Deleted: ${displayDate} ${t.text}`);
          deletedThisPass++;
          platformStats.mastodon.deleted++;
          deletedIds.mastodon.add(t.id);
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
        console.log(`  Failed: ${displayDate} ${t.text} (${delRes.status})`);
        failedThisPass++;
        platformStats.mastodon.failed++;
        break;
      }
      await new Promise(r => setTimeout(r, 400));
    }
    console.log(`  Pass ${pass}: ${deletedThisPass} deleted, ${failedThisPass} failed`);
    if (dryRun) break;
  }
}

await nukeBluesky();
await nukeX();
await nukeThreads();
await nukeFacebook();
await nukeInstagram();
await nukeMastodon();

// ── Prune state files so Social Signal (engagement dashboard) reflects reality ──
//
// The engagement collector (collect-engagement.mjs) is otherwise too forgiving:
// Bluesky's getLikes/getReposts/etc. return success-with-zero for deleted
// posts (not a clean 404), so the collector can't tell a post is gone. It
// keeps historical entries in priorByKey forever and the dashboard fills
// with zombie posts pointing at deleted URIs.
//
// Easier than teaching the collector to detect deletions: have the purge
// directly clean up the three state files it just invalidated.
//
//   1. social-schedule.json   — strip deleted platform entries from each
//      slot's publishedTo. If the array empties out, collector's existing
//      `!publishedTo.length` guard hides the slot from future engagement
//      runs. Slot itself stays for audit / publish-history.
//   2. social-approved-queue.json — same treatment for the older queue
//      shape (each entry has its own publishedTo).
//   3. social-engagement.json — drop platform entries with matching IDs
//      from every post's `platforms` map. If a post ends up with no
//      platforms, drop the post entry entirely. Recompute totals.
//
// All writes are atomic temp+rename. The collector writes the same files,
// so we accept a small race on the last few seconds; worst case is one
// stale refresh, the next cycle stabilises.

function pruneRecords() {
  // We strip on a union of two criteria:
  //   (a) the entry's platform-id is in deletedIds → we just deleted it
  //   (b) the parent slot/queue/post's publishedAt is older than cutoffMs →
  //       it's in the "should have been deleted" window, even if some
  //       per-platform deletes failed (FB stuck, Mastodon rate-limited, etc.)
  //
  // (b) is the bulk path: on the Saturday 3:30am cron with --all-before-now,
  // every old slot's publishedTo gets cleared regardless of per-platform
  // delete outcomes. We lose engagement tracking on partial-failure posts
  // (FB stuck on older app, etc.), but FB engagement isn't surfaced on the
  // dashboard anyway, so it's a fine trade.

  function platformIdsForEntry(e) {
    const id = e.uri || e.id || e.postId;
    return id ? [id] : [];
  }

  function entryWasDeleted(e) {
    const set = deletedIds[e.platform];
    if (!set || set.size === 0) return false;
    for (const id of platformIdsForEntry(e)) {
      if (set.has(id)) return true;
    }
    return false;
  }

  function isOldEnoughToPrune(publishedAt) {
    if (!publishedAt) return false;
    const t = new Date(publishedAt).getTime();
    return Number.isFinite(t) && t < cutoffMs;
  }

  function atomicWrite(path, json) {
    const tmp = path + ".tmp";
    writeFileSync(tmp, JSON.stringify(json, null, 2) + "\n");
    renameSync(tmp, path);
  }

  const DATA_DIR = join(__dirname, "..", "..", "src", "data", "south-bay");
  console.log("\n=== PRUNE STATE FILES ===");

  // 1) Schedule
  const schedFile = join(DATA_DIR, "social-schedule.json");
  let schedTouched = 0;
  try {
    const sched = JSON.parse(readFileSync(schedFile, "utf8"));
    for (const day of Object.values(sched.days || {})) {
      for (const [slotType, slot] of Object.entries(day || {})) {
        if (slotType.startsWith("_")) continue;
        if (!Array.isArray(slot?.publishedTo)) continue;
        const before = slot.publishedTo.length;
        if (isOldEnoughToPrune(slot.publishedAt)) {
          slot.publishedTo = [];
        } else {
          slot.publishedTo = slot.publishedTo.filter((e) => !entryWasDeleted(e));
        }
        if (slot.publishedTo.length !== before) schedTouched++;
      }
    }
    if (schedTouched > 0) atomicWrite(schedFile, sched);
    console.log(`  schedule: ${schedTouched} slots updated`);
  } catch (err) {
    console.log(`  schedule prune failed: ${err.message}`);
  }

  // 2) Queue
  const queueFile = join(DATA_DIR, "social-approved-queue.json");
  let queueTouched = 0;
  try {
    const queue = JSON.parse(readFileSync(queueFile, "utf8"));
    if (Array.isArray(queue)) {
      for (const p of queue) {
        if (!Array.isArray(p.publishedTo)) continue;
        const before = p.publishedTo.length;
        if (isOldEnoughToPrune(p.publishedAt)) {
          p.publishedTo = [];
        } else {
          p.publishedTo = p.publishedTo.filter((e) => !entryWasDeleted(e));
        }
        if (p.publishedTo.length !== before) queueTouched++;
      }
      if (queueTouched > 0) atomicWrite(queueFile, queue);
    }
    console.log(`  queue: ${queueTouched} entries updated`);
  } catch (err) {
    console.log(`  queue prune failed: ${err.message}`);
  }

  // 3) Engagement file (Social Signal source of truth)
  const engFile = join(DATA_DIR, "social-engagement.json");
  let engTouched = 0;
  let engDropped = 0;
  try {
    const eng = JSON.parse(readFileSync(engFile, "utf8"));
    eng.posts = (eng.posts || []).filter((p) => {
      // Never touch HHSS — separate publish pipeline, we didn't purge it.
      if (p.brand && p.brand !== "SBT") return true;
      // Whole-post drop if old enough
      if (isOldEnoughToPrune(p.publishedAt)) {
        engDropped++;
        return false;
      }
      // Otherwise, strip per-platform entries we just deleted
      const beforeKeys = Object.keys(p.platforms || {}).length;
      p.platforms = Object.fromEntries(
        Object.entries(p.platforms || {}).filter(([plat, info]) => {
          const id = info?.id;
          return !id || !deletedIds[plat]?.has(id);
        })
      );
      const afterKeys = Object.keys(p.platforms).length;
      if (afterKeys !== beforeKeys) engTouched++;
      if (afterKeys === 0) { engDropped++; return false; }
      return true;
    });
    eng.postCount = eng.posts.length;
    eng.totals = eng.posts.reduce(
      (acc, p) => {
        for (const v of Object.values(p.platforms || {})) {
          acc.likes += v.counts?.likes || 0;
          acc.reposts += v.counts?.reposts || 0;
          acc.quotes += v.counts?.quotes || 0;
          acc.replies += v.counts?.replies || 0;
        }
        return acc;
      },
      { likes: 0, reposts: 0, quotes: 0, replies: 0 }
    );
    eng.lastUpdated = new Date().toISOString();
    atomicWrite(engFile, eng);
    console.log(`  engagement: ${engTouched} posts modified, ${engDropped} dropped, ${eng.postCount} remain`);
  } catch (err) {
    console.log(`  engagement prune failed: ${err.message}`);
  }
}

if (!dryRun) pruneRecords();

console.log("Done");

// Cat-signal DM after a recurring purge so Stephen can clean up the
// platforms where API delete is partial (FB) or fully blocked (IG).
// Bypasses the 60-min cooldown via a unique per-run key.
if (notify && !dryRun) {
  try {
    const { catSignal } = await import("../lib/notify.mjs");
    const lines = [];
    for (const [plat, s] of Object.entries(platformStats)) {
      if (!s.deleted && !s.failed) continue;
      const tag = s.failed > 0 ? "⚠️" : "✅";
      lines.push(`${tag} **${plat}**: ${s.deleted} deleted${s.failed ? `, ${s.failed} failed` : ""}`);
    }
    const igStuck = platformStats.instagram.failed;
    const fbStuck = platformStats.facebook.failed;
    const manualWork = [];
    if (fbStuck > 0) manualWork.push(`FB has **${fbStuck}** stuck post${fbStuck === 1 ? "" : "s"} — clean via the FB Page UI`);
    if (igStuck > 0) manualWork.push(`IG has **${igStuck}** post${igStuck === 1 ? "" : "s"} the API can't touch — clean via the IG mobile app`);
    await catSignal({
      key: `weekly-purge-${cutoffDisplay}`,
      title: "Weekly social purge ran",
      body:
        `Cutoff: \`${cutoffDisplay}\` (posts older than this were targeted)\n\n` +
        (lines.length ? lines.join("\n") + "\n\n" : "") +
        (manualWork.length ? "**Needs manual cleanup:**\n" + manualWork.map((m) => `• ${m}`).join("\n") : "Everything cleaned via API. No manual work needed."),
    });
  } catch (err) {
    console.log(`Notify failed: ${err.message}`);
  }
}
