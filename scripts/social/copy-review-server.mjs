#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Signal — Social Copy Review Server
// Shows all 4 platform variants per item, with comment box for feedback.
// Approved posts go to the ready queue, not published immediately.
// Auto-regenerates next batch when current batch is finished.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, statSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { execFile, execFileSync, spawn } from "node:child_process";
import { processComment } from "./lib/action-commands.mjs";

import crypto from "node:crypto";
import { generateDayPlanCopy } from "./lib/copy-gen.mjs";
import { runQualityReview } from "./lib/post-gen-review.mjs";
import { canonicalizePlanCards } from "../../src/lib/south-bay/canonicalizeCard.mjs";
import { findSwapCandidates } from "./lib/swap-candidates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3456;
const POST_DIR = "/tmp/sbs-social";
const QUEUE_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-approved-queue.json");
const REVIEW_HISTORY_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-review-history.json");
const ENGAGEMENT_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-engagement.json");
const SCHEDULE_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-schedule.json");
const SHARED_PLANS_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "shared-plans.json");
const GENERATE_SCRIPT = join(__dirname, "generate-posts.mjs");
const ENV_FILE = join(__dirname, "..", "..", ".env.local");
const PLAN_API_BASE = process.env.SBT_API_BASE || "https://southbaytoday.org";
const BATCH_SIZE = 25;

let isGenerating = false;

// Load all pending post JSONs from /tmp/sbs-social/
function loadPendingPosts() {
  if (!existsSync(POST_DIR)) return [];
  const files = readdirSync(POST_DIR)
    .filter((f) => f.startsWith("post-") && f.endsWith(".json"))
    .sort();
  const posts = files.map((f) => {
    try {
      const data = JSON.parse(readFileSync(join(POST_DIR, f), "utf8"));
      data._file = f;
      return data;
    } catch {
      return null;
    }
  }).filter(Boolean);
  // Sort by event date/time ascending (soonest first)
  posts.sort((a, b) => {
    const dateA = a.item?.date || "9999";
    const dateB = b.item?.date || "9999";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.item?.time || "99:99";
    const timeB = b.item?.time || "99:99";
    return timeA.localeCompare(timeB);
  });
  return posts;
}

function loadQueue() {
  if (!existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  const dir = dirname(QUEUE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2) + "\n");
}

function loadEngagement() {
  if (!existsSync(ENGAGEMENT_FILE)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(ENGAGEMENT_FILE, "utf8"));
  } catch {
    return null;
  }
  // Meta App Review walls off `pages_read_engagement` behind Tech Provider +
  // Business Verification, so we can never get FB engagement reads on either
  // brand. Strip FB from the dashboard entirely. The collector also skips FB;
  // this is a defense-in-depth strip in case stale FB entries linger in the
  // data file.
  const totals = { likes: 0, reposts: 0, quotes: 0, replies: 0 };
  const posts = [];
  for (const post of data.posts || []) {
    const platforms = { ...(post.platforms || {}) };
    delete platforms.facebook;
    if (!Object.keys(platforms).length) continue;
    for (const v of Object.values(platforms)) {
      totals.likes += v.counts?.likes || 0;
      totals.reposts += v.counts?.reposts || 0;
      totals.quotes += v.counts?.quotes || 0;
      totals.replies += v.counts?.replies || 0;
    }
    posts.push({ ...post, platforms });
  }
  return { ...data, posts, totals, postCount: posts.length };
}

function engagementMtime() {
  if (!existsSync(ENGAGEMENT_FILE)) return null;
  try {
    return statSync(ENGAGEMENT_FILE).mtime.toISOString();
  } catch {
    return null;
  }
}

// Race guard: track the mtime we last observed so we can detect concurrent writes
// from surgery scripts / cron jobs that edit social-schedule.json directly.
let lastObservedScheduleMtime = 0;

function loadSchedule() {
  if (!existsSync(SCHEDULE_FILE)) return { days: {} };
  try {
    lastObservedScheduleMtime = statSync(SCHEDULE_FILE).mtimeMs;
    return JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
  } catch {
    return { days: {} };
  }
}

function saveScheduleFile(schedule) {
  // If the file changed on disk since we loaded it, some external script (surgery,
  // cron, manual edit) wrote to it in parallel. Blind-writing our in-memory copy
  // would clobber their changes — so we reload, merge their days[] in, then write.
  try {
    if (existsSync(SCHEDULE_FILE)) {
      const diskMtime = statSync(SCHEDULE_FILE).mtimeMs;
      if (lastObservedScheduleMtime && diskMtime > lastObservedScheduleMtime + 10) {
        console.warn(`[race-guard] schedule.json changed on disk (mtime +${Math.round(diskMtime - lastObservedScheduleMtime)}ms). Merging external edits before write.`);
        try {
          const disk = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
          // Our in-memory slots are authoritative for slots we've touched, but any
          // days/slots that exist on disk and NOT in memory (e.g. a newly padded
          // plan from surgery) must be preserved.
          if (disk && disk.days) {
            for (const [date, dayOnDisk] of Object.entries(disk.days)) {
              if (!schedule.days[date]) {
                schedule.days[date] = dayOnDisk;
              } else {
                for (const slotType of Object.keys(dayOnDisk)) {
                  if (!schedule.days[date][slotType]) schedule.days[date][slotType] = dayOnDisk[slotType];
                }
              }
            }
          }
        } catch (e) {
          console.error(`[race-guard] failed to re-read disk state: ${e.message}. Writing in-memory state anyway.`);
        }
      }
    }
  } catch (e) {
    console.error(`[race-guard] stat check failed: ${e.message}`);
  }
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2) + "\n");
  try { lastObservedScheduleMtime = statSync(SCHEDULE_FILE).mtimeMs; } catch {}
}

// Rewrite all platform copy variants based on edit instructions
async function rewriteCopyWithEdits(originalCopy, editInstructions, item) {
  // Load env for API key
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    try {
      const lines = readFileSync(ENV_FILE, "utf8").split("\n");
      for (const line of lines) {
        const m = line.match(/^ANTHROPIC_API_KEY=(.*)$/);
        if (m) apiKey = m[1].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  if (!apiKey) throw new Error("No ANTHROPIC_API_KEY for edit rewrite");

  const prompt = `You are editing social media posts for South Bay Today, a hyperlocal community tool for the South Bay.

ORIGINAL COPY (per platform):
X: ${originalCopy.x || "(none)"}
Threads: ${originalCopy.threads || "(none)"}
Bluesky: ${originalCopy.bluesky || "(none)"}
Facebook: ${originalCopy.facebook || "(none)"}
Instagram: ${originalCopy.instagram || "(none)"}

EDIT INSTRUCTIONS FROM REVIEWER:
${editInstructions}

Apply the edit instructions to ALL platform variants. Preserve the existing tone, URLs, hashtags, and @mentions. Respect platform character limits:
- X: max 280 chars
- Threads: max 500 chars
- Bluesky: max 300 chars
- Facebook: max 500 chars
- Instagram: max 2200 chars

If the edit only affects wording/phrasing, apply it consistently across all variants.
If the edit adds/removes information, adjust each variant appropriately for its platform constraints.
Keep URLs exactly as they are — never change or remove them.

Return ONLY a JSON object with keys "x", "threads", "bluesky", "facebook", "instagram" — each a string. No other text.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract JSON from edit rewrite response");

  const rewritten = JSON.parse(jsonMatch[0]);

  // Mastodon reuses Bluesky copy
  rewritten.mastodon = rewritten.bluesky || originalCopy.mastodon;

  // Fallback: keep originals for any missing platform
  for (const key of Object.keys(originalCopy)) {
    if (!rewritten[key]) rewritten[key] = originalCopy[key];
  }

  return rewritten;
}

// Clear old post files and generate a new batch
function generateNewBatch() {
  if (isGenerating) return;
  isGenerating = true;
  console.log(`\n🔄 Generating next batch of ${BATCH_SIZE} posts...`);

  // Clear old post files (preserve sv-history and restaurant posts — they have their own dedup)
  if (existsSync(POST_DIR)) {
    for (const f of readdirSync(POST_DIR)) {
      if (f.startsWith("post-") && f.endsWith(".json") && !f.includes("-sv-history-") && !f.includes("-restaurant-")) {
        unlinkSync(join(POST_DIR, f));
      }
    }
  }

  const nodePath = process.execPath;

  // Generate sv-history posts first (quick — only produces output on anniversary dates)
  try {
    execFileSync(nodePath, ["--env-file=" + ENV_FILE, join(__dirname, "generate-sv-history.mjs")], {
      cwd: join(__dirname, "..", ".."),
      timeout: 120_000,
      stdio: "inherit",
    });
  } catch (err) {
    console.error("SV History generation failed:", err.message);
  }

  // Generate restaurant opening posts (quick — only produces output for new openings)
  try {
    execFileSync(nodePath, ["--env-file=" + ENV_FILE, join(__dirname, "generate-restaurant-openings.mjs")], {
      cwd: join(__dirname, "..", ".."),
      timeout: 120_000,
      stdio: "inherit",
    });
  } catch (err) {
    console.error("Restaurant opening generation failed:", err.message);
  }

  execFile(nodePath, ["--env-file=" + ENV_FILE, GENERATE_SCRIPT, "--max", String(BATCH_SIZE)], {
    cwd: join(__dirname, "..", ".."),
    timeout: 300_000,
  }, (err, stdout, stderr) => {
    isGenerating = false;
    if (err) {
      console.error("Generation failed:", err.message);
      if (stderr) console.error(stderr);
      return;
    }
    console.log(stdout);
    const posts = loadPendingPosts();
    console.log(`✅ ${posts.length} new drafts ready for review`);
  });
}

// ─── Engagement dashboard (separate page at /engagement) ─────────────────
const ENGAGEMENT_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Social Signal</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E📡%3C/text%3E%3C/svg%3E">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #faf8f4; color: #1a1a1a; padding: 16px; padding-bottom: 80px; }
  a { color: #4338ca; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .header { max-width: 1100px; margin: 0 auto 18px; display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
  .title { font-size: 11px; letter-spacing: 0.18em; color: #777; text-transform: uppercase; }
  .nav-link { font-size: 12px; color: #4338ca; }
  .last-updated { margin-left: auto; font-size: 11px; color: #999; }
  .totals { max-width: 1100px; margin: 0 auto 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
  .total-card { background: #fff; border: 1px solid #ece8de; border-radius: 8px; padding: 10px 14px; }
  .total-num { font-size: 22px; font-weight: 600; color: #1a1a1a; line-height: 1; }
  .total-label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #888; margin-top: 6px; }
  .controls { max-width: 1100px; margin: 0 auto 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; }
  .pill-btn { padding: 4px 11px; border: 1px solid #d8d2c4; border-radius: 999px; background: #fff; color: #555; cursor: pointer; font-size: 12px; transition: all 0.1s; }
  .pill-btn.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
  .pill-btn:hover:not(.active) { border-color: #999; }
  .toggle { display: flex; align-items: center; gap: 6px; color: #555; cursor: pointer; }
  .refresh-btn { margin-left: auto; padding: 5px 12px; border: 1px solid #d8d2c4; border-radius: 4px; background: #fff; color: #1a1a1a; cursor: pointer; font-size: 12px; }
  .refresh-btn:hover { background: #f3efe7; }
  .posts { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
  .empty { text-align: center; padding: 40px 16px; color: #888; }
  .post-card { background: #fff; border: 1px solid #ece8de; border-radius: 8px; padding: 14px 16px; }
  .post-card.no-engagement { opacity: 0.55; }
  .post-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
  .post-title { font-size: 14px; font-weight: 600; color: #1a1a1a; flex: 1; min-width: 0; }
  .brand-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; color: #fff; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; flex-shrink: 0; }
  .post-meta { font-size: 11px; color: #888; white-space: nowrap; }
  .post-meta a { color: #888; }
  .platform-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .plat-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; background: #f6f2ea; border: 1px solid #ece8de; font-size: 12px; color: #555; cursor: pointer; transition: all 0.1s; }
  .plat-pill:hover { background: #ede7d8; }
  .plat-pill.expanded { background: #fff; border-color: #c7d2fe; }
  .plat-pill.zero { color: #aaa; cursor: default; }
  .plat-pill.zero:hover { background: #f6f2ea; }
  .plat-icon { font-size: 13px; }
  .plat-counts { display: inline-flex; gap: 8px; }
  .plat-count { color: #1a1a1a; font-weight: 600; }
  .plat-count .lbl { font-weight: 400; color: #888; margin-left: 2px; font-size: 10px; }
  .details { display: none; margin-top: 12px; border-top: 1px solid #ece8de; padding-top: 12px; }
  .details.open { display: block; }
  .detail-section { margin-top: 10px; }
  .detail-section:first-child { margin-top: 0; }
  .detail-header { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #888; margin-bottom: 6px; }
  .actor-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .actor-chip { font-size: 11px; padding: 2px 8px; background: #f6f2ea; border-radius: 4px; color: #555; }
  .reply-item, .quote-item { background: #faf8f4; border-left: 2px solid #c7d2fe; padding: 8px 10px; margin-bottom: 6px; border-radius: 0 4px 4px 0; font-size: 12px; }
  .reply-author { font-weight: 600; color: #1a1a1a; font-size: 11px; }
  .reply-time { color: #888; font-size: 10px; margin-left: 6px; }
  .reply-text { color: #333; margin-top: 4px; line-height: 1.4; word-wrap: break-word; }
  .reply-permalink { font-size: 10px; color: #4338ca; margin-top: 4px; display: inline-block; }
  .placeholder { font-size: 11px; color: #aaa; font-style: italic; }
  .fb-cross-link { display: inline-flex; align-items: center; padding: 4px 6px; font-size: 14px; text-decoration: none; opacity: 0.55; transition: opacity 0.1s; line-height: 1; }
  .fb-cross-link:hover { opacity: 1; }
  /* New-since-last-visit highlighting */
  .new-summary { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; font-weight: 600; }
  .new-summary.zero { background: transparent; border-color: transparent; color: #aaa; font-weight: 400; }
  .post-card.has-new { box-shadow: inset 4px 0 0 0 #4f46e5; }
  .plat-pill.has-new { background: #eef2ff; border-color: #c7d2fe; }
  .plat-pill.has-new .plat-count { color: #4338ca; }
  .new-badge { display: inline-block; font-size: 10px; font-weight: 600; color: #4338ca; background: #fff; border: 1px solid #c7d2fe; padding: 1px 6px; border-radius: 999px; margin-left: 6px; letter-spacing: 0.02em; }
  .actor-chip.is-new { background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; }
  .actor-chip.is-old { color: #b8b3a6; background: #f6f2ea; }
  .reply-item.is-new { border-left-color: #4f46e5; background: #f5f3ff; }
  .reply-item.is-old { background: #f9f7f1; border-left-color: #d8d2c4; }
  .reply-item.is-old .reply-author, .reply-item.is-old .reply-text { color: #aaa; }
  /* Default state once a baseline exists: anything that hasn't grown since
     last visit fades out, so new activity pops by contrast. */
  body.has-baseline .post-card:not(.has-new) { opacity: 0.55; transition: opacity 0.15s; }
  body.has-baseline .plat-pill:not(.has-new) { background: transparent; border-color: #ece8de; }
  body.has-baseline .plat-pill:not(.has-new) .plat-count { color: #b8b3a6; font-weight: 500; }
  body.has-baseline .plat-pill:not(.has-new) .lbl { color: #c8c2b3; }
  body.has-baseline .plat-pill:not(.has-new) .plat-icon { opacity: 0.5; }
  body.has-baseline .actor-chip:not(.is-new) { color: #b8b3a6; background: transparent; border: 1px solid #ece8de; }
  body.has-baseline .reply-item:not(.is-new) { background: transparent; border-left-color: #ece8de; }
  body.has-baseline .reply-item:not(.is-new) .reply-author,
  body.has-baseline .reply-item:not(.is-new) .reply-text { color: #b8b3a6; }
  @media (max-width: 600px) {
    .header { flex-direction: column; align-items: flex-start; gap: 4px; }
    .last-updated { margin-left: 0; }
    .post-head { flex-direction: column; align-items: flex-start; gap: 4px; }
  }
</style>
</head>
<body>
<div class="header">
  <span class="title">Social Media Posts</span>
  <span class="new-summary zero" id="new-summary"></span>
  <span class="last-updated" id="last-updated"></span>
</div>

<div class="totals" id="totals"></div>

<div class="controls">
  <span style="color:#888;">Organization:</span>
  <button class="pill-btn" data-brand="all">all</button>
  <button class="pill-btn active" data-brand="SBT">SBT</button>
  <button class="pill-btn" data-brand="HHSS">HHSS</button>
  <span style="color:#888;margin-left:12px;">Platform:</span>
  <button class="pill-btn active" data-platform="all">all</button>
  <button class="pill-btn" data-platform="bluesky">bluesky</button>
  <button class="pill-btn" data-platform="x">x</button>
  <button class="pill-btn" data-platform="threads">threads</button>
  <button class="pill-btn" data-platform="instagram">instagram</button>
  <button class="pill-btn" data-platform="mastodon">mastodon</button>
  <button class="refresh-btn" onclick="load()">refresh</button>
</div>

<div class="posts" id="posts"></div>

<script>
const BASE_TITLE = 'Social Signal';
const ICONS = { bluesky: '🦋', x: '𝕏', threads: '🧵', facebook: '📘', instagram: '📷', mastodon: '🐘' };
// reposts + quotes are both "amplification" — collapsed into shares for display.
const TYPE_ORDER = ['likes', 'shares', 'replies'];
const TYPE_LBL = { likes: 'likes', shares: 'shares', replies: 'replies' };
const sharesOf = (counts) => (counts?.reposts || 0) + (counts?.quotes || 0);
const displayCount = (counts, k) => k === 'shares' ? sharesOf(counts) : (counts?.[k] || 0);
const BRAND_COLORS = { SBT: '#4338ca', HHSS: '#16a34a' };
let DATA = null;
let activePlatform = 'all';
let activeBrand = 'SBT';

// "New since last visit" baseline: snapshot of per-post-per-platform counts
// from the previous visit, plus the timestamp of that visit. Held in memory
// for the whole session so refreshes don't erase highlights — the new
// baseline is only persisted once on first render.
const SEEN_KEY = 'sbt-engagement-seen-v1';
const LAST_VISIT_KEY = 'sbt-engagement-last-visit-v1';
let seenSnapshot = null;
let lastVisitAt = null;
try { seenSnapshot = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch (e) {}
try { lastVisitAt = localStorage.getItem(LAST_VISIT_KEY) || null; } catch (e) {}
let baselineWritten = false;
// Body class drives the "muted by default" CSS — only applied when we
// actually have a previous-visit baseline to compare against.
if (seenSnapshot) document.body.classList.add('has-baseline');

function platTotal(p) {
  const c = (p && p.counts) || {};
  return (c.likes||0)+(c.reposts||0)+(c.quotes||0)+(c.replies||0);
}

function snapshotFromData(data) {
  const snap = {};
  for (const post of (data?.posts || [])) {
    snap[post.key] = {};
    for (const [k, p] of Object.entries(post.platforms || {})) {
      snap[post.key][k] = platTotal(p);
    }
  }
  return snap;
}

function platDelta(postKey, plat, currentTotal) {
  if (!seenSnapshot) return 0; // first ever visit — don't blast everything as new
  const prev = seenSnapshot[postKey] && seenSnapshot[postKey][plat];
  if (prev == null) return currentTotal; // post or platform is new since last visit
  return Math.max(0, currentTotal - prev);
}

function isItemNew(item) {
  if (!lastVisitAt || !item || !item.at) return false;
  return new Date(item.at).getTime() > new Date(lastVisitAt).getTime();
}

// Count of replies (not likes/reposts/quotes) that arrived after the baseline.
// Drives the menu-bar badge count via document.title.
function countNewReplies() {
  if (!DATA || !lastVisitAt) return 0;
  const cutoff = new Date(lastVisitAt).getTime();
  let n = 0;
  for (const post of (DATA.posts || [])) {
    for (const p of Object.values(post.platforms || {})) {
      for (const r of (p.replies || [])) {
        if (r.at && new Date(r.at).getTime() > cutoff) n++;
      }
      for (const q of (p.quotes || [])) {
        if (q.at && new Date(q.at).getTime() > cutoff) n++;
      }
    }
  }
  return n;
}

function updateTitle() {
  const n = countNewReplies();
  const next = n > 0 ? '(' + n + ') ' + BASE_TITLE : BASE_TITLE;
  if (document.title !== next) document.title = next;
}

// Reset baseline so highlights + badge clear. Called when the user actually
// looks at the page (focus / tab becomes visible).
function markSeen() {
  if (!DATA) return;
  seenSnapshot = snapshotFromData(DATA);
  lastVisitAt = new Date().toISOString();
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seenSnapshot));
    localStorage.setItem(LAST_VISIT_KEY, lastVisitAt);
  } catch (e) {}
  document.body.classList.add('has-baseline');
  render();
}

// Per-session set of reply IDs we already fired a native notif for, so the
// 60s poll loop doesn't re-notify on every refresh.
const notifiedReplyKeys = new Set();
function maybeNotifyNewReplies() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!document.hidden && document.hasFocus && document.hasFocus()) return; // looking — skip
  if (!DATA || !lastVisitAt) return;
  const cutoff = new Date(lastVisitAt).getTime();
  for (const post of (DATA.posts || [])) {
    for (const [plat, p] of Object.entries(post.platforms || {})) {
      const items = [
        ...(p.replies || []).map(r => ({ ...r, _kind: 'reply' })),
        ...(p.quotes || []).map(q => ({ ...q, _kind: 'quote' })),
      ];
      for (const r of items) {
        if (!r.at || new Date(r.at).getTime() <= cutoff) continue;
        const key = r.permalink || (post.key + ':' + plat + ':' + r._kind + ':' + (r.author || '') + ':' + r.at);
        if (notifiedReplyKeys.has(key)) continue;
        notifiedReplyKeys.add(key);
        try {
          const label = r._kind === 'quote' ? plat + ' · quote · @' : plat + ' · @';
          const n = new Notification(label + (r.author || 'unknown'), {
            body: (r.text || '').slice(0, 280),
            tag: key,
            requireInteraction: true,
          });
          if (r.permalink) n.onclick = () => { try { window.focus(); } catch (e) {} window.open(r.permalink, '_blank'); };
        } catch (e) {}
      }
    }
  }
}

function isItemOld(item) {
  if (!lastVisitAt || !item || !item.at) return false;
  return new Date(item.at).getTime() <= new Date(lastVisitAt).getTime();
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return 'just now';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 14) return d + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function totalForPost(post) {
  let n = 0;
  for (const p of Object.values(post.platforms || {})) {
    const c = p.counts || {};
    n += (c.likes || 0) + (c.reposts || 0) + (c.quotes || 0) + (c.replies || 0);
  }
  return n;
}

function renderTotals() {
  const t = (DATA && DATA.totals) || { likes: 0, reposts: 0, quotes: 0, replies: 0 };
  const html = TYPE_ORDER.map(k => (
    '<div class="total-card"><div class="total-num">' + displayCount(t, k).toLocaleString() +
    '</div><div class="total-label">' + TYPE_LBL[k] + '</div></div>'
  )).join('');
  document.getElementById('totals').innerHTML = html;
}

function renderPlatformPill(plat, p, expanded, postKey) {
  const counts = p.counts || {};
  const total = (counts.likes||0)+(counts.reposts||0)+(counts.quotes||0)+(counts.replies||0);
  if (total === 0 && !p._engagementBlocked) return ''; // skip silent platforms entirely
  const delta = postKey ? platDelta(postKey, plat, total) : 0;
  const cls = 'plat-pill' + (expanded ? ' expanded' : '') + (delta > 0 ? ' has-new' : '');
  if (p._engagementBlocked) {
    const link = p.permalink ? '<a href="' + p.permalink + '" target="_blank" style="color:inherit;text-decoration:none;">view →</a>' : 'no metrics';
    return '<div class="' + cls + '" data-plat="' + plat + '"><span class="plat-icon">' + (ICONS[plat] || plat) + '</span><span class="plat-counts" style="color:#888;font-style:italic;">' + link + '</span></div>';
  }
  const segs = TYPE_ORDER.filter(k => displayCount(counts, k) > 0).map(k => (
    '<span class="plat-count">' + displayCount(counts, k) + '<span class="lbl">' + TYPE_LBL[k] + '</span></span>'
  )).join('');
  const badge = delta > 0 ? '<span class="new-badge">+' + delta + ' new</span>' : '';
  return '<div class="' + cls + '" data-plat="' + plat + '"><span class="plat-icon">' + (ICONS[plat] || plat) + '</span><span class="plat-counts">' + segs + '</span>' + badge + '</div>';
}

function renderActors(actors) {
  if (!actors || !actors.length) return '<div class="placeholder">no actor list (API restriction)</div>';
  return '<div class="actor-list">' + actors.map(a => {
    const cls = 'actor-chip' + (isItemNew(a) ? ' is-new' : (isItemOld(a) ? ' is-old' : ''));
    const name = a.displayName ? a.displayName + ' (@' + a.author + ')' : '@' + a.author;
    if (a.profile) return '<a class="' + cls + '" href="' + a.profile + '" target="_blank">' + escapeHtml(name) + '</a>';
    return '<span class="' + cls + '">' + escapeHtml(name) + '</span>';
  }).join('') + '</div>';
}

function renderReplies(items, label) {
  if (!items || !items.length) return '';
  return '<div class="detail-section"><div class="detail-header">' + label + '</div>' +
    items.map(r => {
      const cls = 'reply-item' + (isItemNew(r) ? ' is-new' : (isItemOld(r) ? ' is-old' : ''));
      return (
        '<div class="' + cls + '"><span class="reply-author">@' + escapeHtml(r.author || 'unknown') + '</span>' +
        '<span class="reply-time">' + escapeHtml(timeAgo(r.at)) + '</span>' +
        '<div class="reply-text">' + escapeHtml(r.text) + '</div>' +
        (r.permalink ? '<a class="reply-permalink" href="' + r.permalink + '" target="_blank">view →</a>' : '') +
        '</div>'
      );
    }).join('') + '</div>';
}

function renderDetails(plat, p) {
  const sections = [];
  if ((p.counts?.likes || 0) > 0) {
    sections.push('<div class="detail-section"><div class="detail-header">' + p.counts.likes + ' likes</div>' + renderActors(p.likes) + '</div>');
  }
  if ((p.counts?.reposts || 0) > 0) {
    sections.push('<div class="detail-section"><div class="detail-header">' + p.counts.reposts + ' reposts</div>' + renderActors(p.reposts) + '</div>');
  }
  sections.push(renderReplies(p.quotes, (p.counts?.quotes || 0) + ' quotes'));
  sections.push(renderReplies(p.replies, (p.counts?.replies || 0) + ' replies'));
  return sections.filter(Boolean).join('');
}

function renderPost(post) {
  const platforms = post.platforms || {};
  const platKeys = Object.keys(platforms);
  const total = totalForPost(post);
  const brand = post.brand || 'SBT';

  if (activeBrand !== 'all' && brand !== activeBrand) return '';
  const anyBlocked = Object.values(platforms).some(p => p._engagementBlocked);
  if (total === 0 && !anyBlocked) return ''; // hide silent SBT posts; keep HHSS visible
  if (activePlatform !== 'all') {
    const c = platforms[activePlatform]?.counts || {};
    const platTotal = (c.likes||0)+(c.reposts||0)+(c.quotes||0)+(c.replies||0);
    if (platTotal === 0) return '';
    if (!platforms[activePlatform]) return '';
  }

  const filteredPlats = activePlatform === 'all' ? platKeys : platKeys.filter(k => k === activePlatform);

  let postNew = 0;
  for (const k of platKeys) {
    postNew += platDelta(post.key, k, platTotal(platforms[k]));
  }
  const cardCls = 'post-card' + (total === 0 ? ' no-engagement' : '') + (postNew > 0 ? ' has-new' : '');
  const titleHtml = post.targetUrl
    ? '<a href="' + post.targetUrl + '" target="_blank">' + escapeHtml(post.title) + '</a>'
    : escapeHtml(post.title);

  const pills = filteredPlats.map(k => {
    const pill = renderPlatformPill(k, platforms[k], false, post.key);
    // HHSS cross-posts to FB. When the IG pill renders (i.e. has reactions),
    // tack on a small FB deep-link so we can hop to the matching FB post.
    // No counts — engagement reads are walled off by Meta App Review.
    if (k === 'instagram' && pill && post.fbPermalink) {
      return pill + '<a class="fb-cross-link" href="' + post.fbPermalink + '" target="_blank" title="View on Facebook">📘</a>';
    }
    return pill;
  }).join('');
  const brandColor = BRAND_COLORS[brand] || '#888';
  const brandBadge = '<span class="brand-badge" style="background:' + brandColor + ';">' + brand + '</span>';

  return (
    '<div class="' + cardCls + '" data-key="' + escapeHtml(post.key) + '">' +
      '<div class="post-head">' +
        brandBadge +
        '<div class="post-title">' + titleHtml + '</div>' +
        '<div class="post-meta">' + escapeHtml(timeAgo(post.publishedAt)) + '</div>' +
      '</div>' +
      '<div class="platform-row">' + pills + '</div>' +
      '<div class="details" id="details-' + cssId(post.key) + '"></div>' +
    '</div>'
  );
}

function cssId(s) {
  return String(s).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);
}

function render() {
  if (!DATA) return;
  document.getElementById('last-updated').textContent = DATA.lastUpdated
    ? 'updated ' + timeAgo(DATA.lastUpdated) + ' · ' + (DATA.postCount || 0) + ' posts'
    : 'no data yet — run scripts/social/collect-engagement.mjs';

  const summaryEl = document.getElementById('new-summary');
  if (summaryEl) {
    if (!seenSnapshot) {
      summaryEl.textContent = 'first visit — future visits will highlight new activity';
      summaryEl.classList.add('zero');
    } else {
      let totalNew = 0;
      for (const post of (DATA.posts || [])) {
        for (const [k, p] of Object.entries(post.platforms || {})) {
          totalNew += platDelta(post.key, k, platTotal(p));
        }
      }
      if (totalNew === 0) {
        summaryEl.textContent = 'no new activity since last visit';
        summaryEl.classList.add('zero');
      } else {
        summaryEl.textContent = totalNew + ' new ' + (totalNew === 1 ? 'interaction' : 'interactions') + ' since last visit';
        summaryEl.classList.remove('zero');
      }
    }
  }

  renderTotals();

  const html = (DATA.posts || []).map(renderPost).filter(Boolean).join('');
  const list = document.getElementById('posts');
  list.innerHTML = html || '<div class="empty">No posts match your filters.</div>';

  // Persist new baseline once per page load. seenSnapshot/lastVisitAt in
  // memory keep the OLD values, so highlights stay correct for the whole
  // session even as data refreshes every 60s.
  if (!baselineWritten) {
    baselineWritten = true;
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(snapshotFromData(DATA)));
      localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
    } catch (e) {}
  }

  updateTitle();
  maybeNotifyNewReplies();

  list.querySelectorAll('.plat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const plat = pill.dataset.plat;
      const card = pill.closest('.post-card');
      const detailsEl = card.querySelector('.details');
      const key = card.dataset.key;
      const post = DATA.posts.find(p => p.key === key);
      if (!post || !post.platforms[plat]) return;
      const counts = post.platforms[plat].counts || {};
      const total = (counts.likes||0)+(counts.reposts||0)+(counts.quotes||0)+(counts.replies||0);
      if (total === 0) return;
      if (detailsEl.classList.contains('open') && pill.classList.contains('expanded')) {
        detailsEl.classList.remove('open');
        card.querySelectorAll('.plat-pill').forEach(p => p.classList.remove('expanded'));
        return;
      }
      card.querySelectorAll('.plat-pill').forEach(p => p.classList.remove('expanded'));
      pill.classList.add('expanded');
      const plink = post.platforms[plat].permalink;
      const head = plink ? '<div style="margin-bottom:10px;font-size:11px;"><a href="' + plink + '" target="_blank">view post on ' + plat + ' →</a></div>' : '';
      detailsEl.innerHTML = head + renderDetails(plat, post.platforms[plat]);
      detailsEl.classList.add('open');
    });
  });
}

document.querySelectorAll('.pill-btn[data-platform]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill-btn[data-platform]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePlatform = btn.dataset.platform;
    render();
  });
});

document.querySelectorAll('.pill-btn[data-brand]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill-btn[data-brand]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeBrand = btn.dataset.brand;
    render();
  });
});

async function load() {
  try {
    const res = await fetch('/api/engagement');
    DATA = await res.json();
    render();
  } catch (err) {
    document.getElementById('posts').innerHTML = '<div class="empty">Failed to load: ' + err.message + '</div>';
  }
}

load();
setInterval(load, 60000);

// Menu-bar wrapper UX: keep highlights vibrant while the window is open.
// We only reset the baseline when the user closes/dismisses the window
// (blur in menu-bar mode, hidden tab, or page unload). That way new
// replies stay highlighted the entire reading session — not just for a
// few seconds after focus — and the next open shows only what arrived
// since this session ended.
//
// Focus is still where we ask for native notification permission, since
// permission prompts must be tied to a user gesture.
async function onUserLookedAtPage() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) {}
  }
}
function onUserClosedPage() {
  if (DATA) markSeen();
}
window.addEventListener('focus', onUserLookedAtPage);
window.addEventListener('blur', onUserClosedPage);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onUserLookedAtPage();
  else onUserClosedPage();
});
window.addEventListener('beforeunload', onUserClosedPage);
</script>
</body>
</html>`;

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SBT Social Review</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #FAF9F6;
    color: #1A1A1A;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    padding: 32px 20px;
  }
  h1 {
    font-size: 13px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #888;
    margin-bottom: 4px;
  }

  /* Tab navigation */
  .tab-bar {
    display: flex;
    gap: 0;
    max-width: 640px;
    width: 100%;
    margin-bottom: 20px;
    border: 1px solid #E5E2DB;
    border-radius: 8px;
    overflow: hidden;
  }
  .tab-btn {
    flex: 1;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    border: none;
    cursor: pointer;
    background: #fff;
    color: #888;
    transition: background 0.15s, color 0.15s;
  }
  .tab-btn:not(:last-child) { border-right: 1px solid #E5E2DB; }
  .tab-btn.active {
    background: #1a1a1a;
    color: #faf9f6;
  }
  .tab-btn:not(.active):hover { background: #f0efec; }
  .tab-count {
    font-size: 12px;
    font-weight: 400;
    opacity: 0.7;
  }

  .counter {
    font-size: 13px;
    color: #aaa;
    margin-bottom: 8px;
  }
  .queue-badge {
    display: inline-block;
    background: #2c6b4f;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 12px;
    margin-bottom: 16px;
  }
  .queue-badge.low { background: #c0392b; }
  .queue-badge.mid { background: #e6a817; }
  .shortcuts {
    font-size: 12px;
    color: #aaa;
    margin-bottom: 20px;
  }
  kbd {
    display: inline-block;
    background: #eee;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 12px;
    margin: 0 2px;
  }

  .item-header {
    max-width: 640px;
    width: 100%;
    margin-bottom: 16px;
  }
  .item-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .item-meta {
    font-size: 13px;
    color: #888;
    margin-bottom: 4px;
  }
  .item-url {
    font-size: 12px;
    color: #1d9bf0;
    word-break: break-all;
  }
  .item-url a { color: #1d9bf0; text-decoration: none; }

  .platforms {
    max-width: 640px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
    transition: transform 0.3s, opacity 0.3s;
  }
  .platforms.swipe-left { transform: translateX(-120%) rotate(-4deg); opacity: 0; }
  .platforms.swipe-right { transform: translateX(120%) rotate(4deg); opacity: 0; }
  .platform-card {
    background: #fff;
    border: 1px solid #E5E2DB;
    border-radius: 8px;
    padding: 16px 20px;
  }
  .platform-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .platform-label.x { color: #1A1A1A; }
  .platform-label.threads { color: #000; }
  .platform-label.bluesky { color: #0085ff; }
  .platform-label.facebook { color: #1877F2; }
  .platform-icon { font-size: 14px; }
  .platform-text {
    font-size: 15px;
    line-height: 1.5;
    color: #1a1a1a;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .platform-text a { color: #1d9bf0; text-decoration: none; }
  .char-count {
    font-size: 11px;
    color: #bbb;
    margin-top: 6px;
    text-align: right;
  }

  .comment-section {
    max-width: 640px;
    width: 100%;
    margin-bottom: 16px;
  }
  .comment-input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #E5E2DB;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    resize: vertical;
    min-height: 44px;
    max-height: 120px;
    background: #fff;
  }
  .comment-input::placeholder { color: #bbb; }
  .comment-input:focus { outline: none; border-color: #999; }

  .buttons {
    display: flex;
    gap: 12px;
    max-width: 640px;
    width: 100%;
    margin-bottom: 32px;
  }
  .btn {
    flex: 1;
    padding: 14px;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.1s;
  }
  .btn:active { transform: scale(0.96); }
  .btn-reject {
    background: #f5f5f5;
    color: #888;
    border: 1px solid #ddd;
  }
  .btn-reject:hover { background: #eee; }
  .btn-edit {
    background: #f0ead6;
    color: #6b5b3e;
    border: 1px solid #d4c9a8;
    flex: 1.2;
  }
  .btn-edit:hover { background: #e8dfc8; }
  .btn-edit.loading {
    opacity: 0.6;
    pointer-events: none;
  }
  .btn-approve {
    background: #1a1a1a;
    color: #faf9f6;
  }
  .btn-approve:hover { background: #333; }

  .done {
    text-align: center;
    padding: 60px 20px;
    max-width: 640px;
  }
  .done h2 { font-size: 22px; margin-bottom: 12px; }
  .done p { color: #888; line-height: 1.6; font-size: 14px; }
  .stat { margin-top: 20px; }
  .stat-num { font-size: 36px; font-weight: 700; }
  .stat-label { font-size: 13px; color: #888; }

  .generating {
    text-align: center;
    padding: 60px 20px;
    color: #888;
  }
  .generating h2 { font-size: 20px; margin-bottom: 12px; color: #1a1a1a; }
  .spinner {
    display: inline-block;
    width: 24px;
    height: 24px;
    border: 3px solid #eee;
    border-top-color: #1a1a1a;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 16px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .empty {
    text-align: center;
    padding: 80px 20px;
    color: #888;
  }
  .empty h2 { font-size: 20px; margin-bottom: 8px; color: #1a1a1a; }

  /* Calendar View */
  #calendar-view { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
  .cal-day { margin-bottom: 24px; border: 1px solid #E5E2DB; border-radius: 12px; overflow: hidden; }
  .cal-day-header {
    padding: 12px 20px; background: #f5f4f0; border-bottom: 1px solid #E5E2DB;
    display: flex; justify-content: space-between; align-items: center;
  }
  .cal-day-header h3 { font-size: 16px; font-weight: 600; margin: 0; }
  .cal-day-header .cal-date { color: #888; font-size: 13px; }
  .cal-day.today .cal-day-header { background: #1a1a1a; color: #faf9f6; }
  .cal-day.today .cal-date { color: #bbb; }
  .cal-slots { display: flex; flex-direction: column; }
  .cal-slot {
    padding: 0; border-bottom: 1px solid #E5E2DB;
  }
  .cal-slot:last-child { border-bottom: none; }
  .cal-slot-header {
    display: flex; align-items: center; gap: 12px; padding: 12px 20px;
    flex-wrap: wrap;
  }
  .cal-slot-type {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    white-space: nowrap;
  }
  .cal-slot-type.day-plan { color: #d4a017; }
  .cal-slot-type.tonight-pick { color: #8b5cf6; }
  .cal-slot-type.wildcard { color: #059669; }
  .cal-slot-title { font-size: 14px; font-weight: 600; line-height: 1.3; flex: 1; }
  .cal-badges { display: flex; gap: 6px; }
  .cal-badge {
    font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600;
  }
  .cal-badge.draft { background: #fef3c7; color: #92400e; }
  .cal-badge.copy-approved { background: #d1fae5; color: #065f46; }
  .cal-badge.image-approved { background: #dbeafe; color: #1e40af; }
  .cal-badge.published { background: #e5e7eb; color: #4b5563; }
  .cal-badge.empty { background: #f3f4f6; color: #9ca3af; }
  .cal-slot.empty { opacity: 0.5; }
  .cal-slot.empty .cal-slot-title { color: #bbb; font-style: italic; }

  /* Calendar expanded slot */
  .cal-slot.approved-collapsed .cal-slot-header { opacity: 0.6; }
  .cal-slot.approved-collapsed:hover .cal-slot-header { opacity: 1; }
  .cal-expanded {
    padding: 16px 20px 20px; background: #faf9f6;
  }
  .cal-expanded-platforms { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
  .cal-expanded-platform { font-size: 13px; line-height: 1.5; }
  .cal-expanded-platform strong { font-size: 11px; text-transform: uppercase; color: #888; }
  .cal-expanded-image { max-width: 300px; border-radius: 8px; margin-bottom: 16px; }
  .cal-expanded-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .cal-expanded-actions button {
    padding: 8px 16px; border-radius: 6px; border: 1px solid #ddd;
    background: #fff; font-size: 13px; cursor: pointer; font-weight: 500;
  }
  .cal-expanded-actions button:hover { background: #f5f5f5; }
  .cal-expanded-actions .btn-approve-copy { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
  .cal-expanded-actions .btn-approve-image { background: #2563eb; color: #fff; border-color: #2563eb; }
  .cal-expanded-actions .btn-regen { background: #f59e0b; color: #fff; border-color: #f59e0b; }
  .cal-expanded-actions .btn-mj { background: #6d28d9; color: #fff; border-color: #6d28d9; }
  .cal-expanded-actions .btn-mj.copied { background: #059669; border-color: #059669; }
  .cal-edit-area { margin-top: 12px; }
  .cal-edit-input {
    width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;
    font-size: 13px; font-family: inherit; resize: vertical; min-height: 40px;
  }

  /* Review flags / auto-fix notes */
  .cal-review-stack {
    padding: 6px 20px 0; display: flex; flex-direction: column; gap: 4px;
  }
  .cal-review-banner {
    padding: 6px 10px; border-radius: 6px; font-size: 12px; line-height: 1.35;
    display: flex; gap: 8px; align-items: flex-start;
  }
  .cal-review-banner .tag {
    font-weight: 700; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.4px; padding: 1px 6px; border-radius: 4px; flex-shrink: 0;
  }
  .cal-review-banner.flag-hard { background: #fee2e2; color: #7f1d1d; border: 1px solid #fca5a5; }
  .cal-review-banner.flag-hard .tag { background: #b91c1c; color: #fff; }
  .cal-review-banner.flag-soft { background: #fef3c7; color: #78350f; border: 1px solid #fde68a; }
  .cal-review-banner.flag-soft .tag { background: #b45309; color: #fff; }
  .cal-review-banner.autofix { background: #d1fae5; color: #064e3b; border: 1px solid #86efac; }
  .cal-review-banner.autofix .tag { background: #047857; color: #fff; }
  .cal-slot-flag-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    margin-left: 4px; vertical-align: middle;
  }
  .cal-slot-flag-dot.flag-hard { background: #b91c1c; }
  .cal-slot-flag-dot.flag-soft { background: #b45309; }
  .cal-slot-flag-dot.autofix { background: #047857; }

  /* Day-plan card list (swap UI) */
  .cal-plan-cards { padding: 8px 12px; background: #fafaf7; border: 1px solid #e8e5dc; border-radius: 6px; margin-bottom: 10px; }
  .cal-plan-card { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-bottom: 1px solid #eee; }
  .cal-plan-card:last-child { border-bottom: 0; }
  .cal-plan-card-time { font-family: monospace; font-size: 11px; color: #555; min-width: 88px; flex-shrink: 0; }
  .cal-plan-card-body { flex: 1; min-width: 0; }
  .cal-plan-card-name { font-size: 13px; font-weight: 600; color: #222; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cal-plan-card-meta { font-size: 11px; color: #999; text-transform: capitalize; }
  .cal-plan-card-swap { padding: 3px 10px; font-size: 11px; border-radius: 4px; border: 1px solid #ccd; background: #fff; cursor: pointer; color: #4338ca; }
  .cal-plan-card-swap:hover { background: #eef2ff; }

  /* Swap picker modal */
  .swap-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .swap-modal { background: #fff; border-radius: 10px; max-width: 560px; width: 100%; max-height: 80vh; overflow-y: auto; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
  .swap-modal h3 { margin: 0 0 12px; font-size: 16px; }
  .swap-modal-sub { font-size: 12px; color: #888; margin-bottom: 12px; }
  .swap-candidate { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid #eee; border-radius: 6px; margin-bottom: 6px; cursor: pointer; }
  .swap-candidate:hover { background: #f9fafb; border-color: #c7d2fe; }
  .swap-candidate-body { flex: 1; min-width: 0; }
  .swap-candidate-name { font-size: 13px; font-weight: 600; color: #222; }
  .swap-candidate-meta { font-size: 11px; color: #777; }
  .swap-candidate-pick { padding: 4px 10px; font-size: 11px; border-radius: 4px; border: 1px solid #c7d2fe; background: #eef2ff; color: #4338ca; }
  .swap-modal-close { float: right; border: 0; background: transparent; font-size: 20px; color: #888; cursor: pointer; }
</style>
</head>
<body>
<h1>South Bay Today</h1>

<div id="calendar-view">
  <div id="calendar-grid"></div>
</div>

<script>
let posts = [];
let current = 0;
let results = [];
let queueSize = 0;

const PLATFORM_ICONS = { x: '\\ud835\\udd4f', threads: '\\ud83e\\uddf5', bluesky: '\\ud83e\\udd8b', facebook: '\\ud83d\\udcd8', instagram: '\\ud83d\\udcf7', mastodon: '\\ud83d\\udc18' };

function updateQueueBadge(size) {
  queueSize = size;
  const el = document.getElementById('queue-badge');
  if (el) {
    el.textContent = size + ' approved, unpublished';
    el.className = 'queue-badge' + (size < 40 ? ' low' : size < 60 ? ' mid' : '');
  }
}

async function init() {
  loadCalendar();
}

function urlify(text) {
  return text.replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

function escapeHtml(text) {
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function render() {
  if (current >= posts.length) {
    showDone();
    return;
  }

  const post = posts[current];
  const item = post.item || {};
  document.getElementById('counter').textContent = (current + 1) + ' / ' + posts.length;
  document.getElementById('comment').value = '';

  document.getElementById('item-header').innerHTML =
    '<div class="item-title">' + (item.title || 'Untitled') + '</div>' +
    '<div class="item-meta">' + [item.cityName, item.venue, item.date, item.time, item.category].filter(Boolean).join(' \\u00b7 ') + ' \\u00b7 score: ' + (item.score || '?') + '</div>' +
    (item.url ? '<div class="item-url"><a href="' + item.url + '" target="_blank">' + item.url + '</a></div>' : '');

  const copy = post.copy || {};
  const platformDefs = [
    { key: 'x', label: 'X', icon: '\\ud835\\udd4f', maxChars: 280 },
    { key: 'threads', label: 'Threads', icon: '\\ud83e\\uddf5', maxChars: 500 },
    { key: 'bluesky', label: 'Bluesky', icon: '\\ud83e\\udd8b', maxChars: 300 },
    { key: 'facebook', label: 'Facebook', icon: '\\ud83d\\udcd8', maxChars: 500 },
    { key: 'instagram', label: 'Instagram', icon: '\\ud83d\\udcf7', maxChars: 2200 },
    { key: 'mastodon', label: 'Mastodon', icon: '\\ud83d\\udc18', maxChars: 500 },
  ];

  let cardsHtml = '';
  for (const p of platformDefs) {
    const text = copy[p.key] || '';
    if (!text) continue;
    const overLimit = text.length > p.maxChars;
    cardsHtml += '<div class="platform-card">' +
      '<div class="platform-label ' + p.key + '"><span class="platform-icon">' + p.icon + '</span> ' + p.label + '</div>' +
      '<div class="platform-text">' + urlify(text) + '</div>' +
      '<div class="char-count"' + (overLimit ? ' style="color:#c0392b;font-weight:700"' : '') + '>' + text.length + ' / ' + p.maxChars + '</div>' +
      '</div>';
  }
  document.getElementById('platforms').innerHTML = cardsHtml;
  document.getElementById('platforms').className = 'platforms';
}

async function showDone() {
  document.getElementById('review-area').style.display = 'none';
  document.getElementById('shortcuts').style.display = 'none';
  const approved = results.filter(r => r.vote === 'approve');
  const rejected = results.filter(r => r.vote === 'reject');
  const withComments = results.filter(r => r.comment);

  // Save results first
  const saveRes = await fetch('/api/review', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(results) });
  const saveData = await saveRes.json();
  updateQueueBadge(saveData.queueSize || queueSize + approved.length);

  let html = '<h2>Review complete</h2>';
  html += '<div style="display:flex;gap:40px;justify-content:center;margin-top:24px">';
  html += '<div class="stat"><div class="stat-num" style="color:#2c6b4f">' + approved.length + '</div><div class="stat-label">approved</div></div>';
  html += '<div class="stat"><div class="stat-num" style="color:#c0392b">' + rejected.length + '</div><div class="stat-label">skipped</div></div>';
  if (withComments.length > 0) {
    html += '<div class="stat"><div class="stat-num" style="color:#e6a817">' + withComments.length + '</div><div class="stat-label">with notes</div></div>';
  }
  html += '</div>';

  // Show action command results
  if (saveData.actionResults && saveData.actionResults.length > 0) {
    html += '<div style="margin-top:20px;padding:12px 16px;background:#f0f7f4;border:1px solid #c8e6d0;border-radius:8px;text-align:left;max-width:500px;margin-left:auto;margin-right:auto">';
    html += '<div style="font-weight:600;font-size:13px;color:#2c6b4f;margin-bottom:8px">🎯 Actions executed:</div>';
    for (const ar of saveData.actionResults) {
      html += '<div style="font-size:12px;color:#333;margin-bottom:4px">• <strong>' + ar.title + '</strong>: ' + ar.summary + '</div>';
    }
    html += '</div>';
  }

  // Show generating state and trigger new batch
  html += '<div class="generating" id="gen-status" style="margin-top:32px"><div class="spinner"></div><h2>Generating next batch...</h2><p>This takes about a minute. Page will refresh when ready.</p></div>';
  document.getElementById('done').style.display = 'block';
  document.getElementById('done').innerHTML = html;

  // Trigger generation
  fetch('/api/generate', { method: 'POST' });

  // Poll for new posts
  pollForNewPosts();
}

async function pollForNewPosts() {
  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (!data.generating && data.pendingCount > 0) {
        clearInterval(poll);
        // Reset and reload
        current = 0;
        results = [];
        document.getElementById('done').style.display = 'none';
        document.getElementById('review-area').style.display = '';
        document.getElementById('shortcuts').style.display = '';
        init();
      }
      if (attempts > 120) { // 2 min timeout
        clearInterval(poll);
        document.getElementById('gen-status').innerHTML = '<h2>Generation timed out</h2><p>Refresh the page to try again.</p>';
      }
    } catch {}
  }, 2000);
}

// Show "Accept w/ Edits" button when comment has text (only if review swiper is present)
const commentEl = document.getElementById('comment');
if (commentEl) {
  commentEl.addEventListener('input', function() {
    const editBtn = document.getElementById('btn-edit');
    if (editBtn) editBtn.style.display = this.value.trim() ? '' : 'none';
  });
}

function vote(v) {
  const el = document.getElementById('platforms');
  const comment = document.getElementById('comment').value.trim();

  // "edit" = accept with edits — requires comment text
  if (v === 'edit' && !comment) {
    document.getElementById('comment').focus();
    return;
  }

  el.classList.add(v === 'reject' ? 'swipe-left' : 'swipe-right');

  const voteData = {
    file: posts[current]._file,
    title: posts[current].item?.title || '',
    vote: v === 'edit' ? 'edit' : v,
    comment: comment || null,
  };
  results.push(voteData);

  if (v === 'edit') {
    // Show loading state — edits take a moment (Claude rewrite)
    const editBtn = document.getElementById('btn-edit');
    editBtn.classList.add('loading');
    editBtn.textContent = 'Rewriting...';
  }

  // Save immediately — don't wait for batch end
  fetch('/api/vote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(voteData) })
    .then(r => r.json())
    .then(data => {
      if (data.queueSize) updateQueueBadge(data.queueSize);
      if (data.actionResult) {
        console.log('Action:', data.actionResult);
      }
      if (v === 'edit') {
        const editBtn = document.getElementById('btn-edit');
        editBtn.classList.remove('loading');
        editBtn.textContent = 'Accept w/ Edits';
      }
    })
    .catch(() => {
      if (v === 'edit') {
        const editBtn = document.getElementById('btn-edit');
        editBtn.classList.remove('loading');
        editBtn.textContent = 'Accept w/ Edits';
      }
    });

  if (v === 'approve' || v === 'edit') updateQueueBadge(queueSize + 1);
  setTimeout(() => { current++; render(); }, v === 'edit' ? 500 : 300);
}

document.addEventListener('keydown', (e) => {
  // Don't intercept keys when in an input
  if (typeof currentTab !== 'undefined' && currentTab !== 'review') return;
  if (document.activeElement === document.getElementById('comment')) {
    if (e.key === 'Escape') document.getElementById('comment').blur();
    return;
  }
  if (e.key === 'ArrowRight') vote('approve');
  if (e.key === 'ArrowLeft') vote('reject');
  if (e.key === 'e' || e.key === 'E') { vote('edit'); return; }
  if (e.key === 'Tab') {
    e.preventDefault();
    document.getElementById('comment').focus();
  }
});

// --- Calendar ---

let scheduleData = {};
let expandedSlots = {};

const SLOT_META = {
  'day-plan': { label: '7:15 AM — Day Plan', icon: '\\ud83d\\udccb', color: '#d4a017', hour: 7, minute: 15 },
  'tonight-pick': { label: '11:45 AM — Tonight Pick', icon: '\\ud83c\\udf19', color: '#8b5cf6', hour: 11, minute: 45 },
  'wildcard': { label: '4:30 PM — Wildcard', icon: '\\ud83c\\udfb2', color: '#059669', hour: 16, minute: 30 },
};

function nowPT() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
}

function slotIsMissed(dateStr, slotType, slot) {
  // Already published — always show
  if (slot?.status === 'published') return false;
  const now = nowPT();
  const today = todayStr();
  // Past days — all slots missed
  if (dateStr < today) return true;
  // Future days — nothing missed
  if (dateStr > today) return false;
  // Today — check if publish window has passed
  const meta = SLOT_META[slotType];
  const slotMinutes = meta.hour * 60 + meta.minute;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > slotMinutes;
}

const SLOT_ORDER = ['day-plan', 'tonight-pick', 'wildcard'];
const DAY_NAMES_CAL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function loadCalendar() {
  try {
    const res = await fetch('/api/schedule');
    scheduleData = await res.json();
  } catch {
    scheduleData = { days: {} };
  }
  renderCalendar();
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

// Build a {date:slot -> {flags:[], autofixes:[]}} lookup from scheduleData._review.
function buildReviewLookup() {
  const out = {};
  const review = scheduleData && scheduleData._review;
  if (!review) return out;
  const put = (date, slot, bucket, entry) => {
    const k = date + ':' + (slot || '_day');
    if (!out[k]) out[k] = { flags: [], autofixes: [] };
    out[k][bucket].push(entry);
  };
  for (const f of review.flagged || []) put(f.date, f.slotType, 'flags', f);
  for (const a of review.autoFixed || []) put(a.date, a.slotType, 'autofixes', a);
  return out;
}

function renderReviewBanners(lookup, dateStr, slotType) {
  const e = lookup[dateStr + ':' + slotType];
  if (!e) return '';
  let html = '';
  for (const f of e.flags) {
    const cls = f.hardBlock ? 'flag-hard' : 'flag-soft';
    const tag = f.hardBlock ? 'BLOCK' : 'FLAG';
    html += '<div class="cal-review-banner ' + cls + '">' +
      '<span class="tag">' + tag + '</span>' +
      '<span>' + escapeHtml(f.reason || '') + '</span>' +
    '</div>';
  }
  for (const a of e.autofixes) {
    html += '<div class="cal-review-banner autofix">' +
      '<span class="tag">AUTO</span>' +
      '<span>' + escapeHtml(a.kind || '') + ': ' + escapeHtml(a.details || '') + '</span>' +
    '</div>';
  }
  if (!html) return '';
  return '<div class="cal-review-stack">' + html + '</div>';
}

function renderFlagDot(lookup, dateStr, slotType) {
  const e = lookup[dateStr + ':' + slotType];
  if (!e) return '';
  const hard = e.flags.some(f => f.hardBlock);
  if (hard) return '<span class="cal-slot-flag-dot flag-hard" title="Hard block"></span>';
  if (e.flags.length) return '<span class="cal-slot-flag-dot flag-soft" title="Flagged for review"></span>';
  if (e.autofixes.length) return '<span class="cal-slot-flag-dot autofix" title="Auto-fix applied"></span>';
  return '';
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const today = todayStr();
  const days = scheduleData.days || {};
  const reviewLookup = buildReviewLookup();

  // Walk every scheduled date today-or-later — mirrors the gen horizon
  // (today through next-Wed+7) without hardcoding a window.
  const futureDates = Object.keys(days).filter(k => k >= today).sort();
  let html = '';
  for (const dateStr of futureDates) {
    const d = new Date(dateStr + 'T12:00:00');
    const dayName = DAY_NAMES_CAL[d.getDay()];
    const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const isToday = dateStr === today;
    const dayData = days[dateStr] || {};

    // Skip entire day if all slots are missed
    const activeSlots = SLOT_ORDER.filter(st => !slotIsMissed(dateStr, st, dayData[st]));
    if (activeSlots.length === 0) continue;

    // Collect slot badges for the day header
    let headerBadges = '';
    for (const st of SLOT_ORDER) {
      const s = dayData[st];
      if (!s || slotIsMissed(dateStr, st, s)) continue;
      const fullyApproved = s.copyApprovedAt && s.imageApprovedAt;
      const slotLabel = SLOT_META[st].icon;
      if (s.status === 'published') {
        headerBadges += '<span class="cal-badge published" style="margin-left:6px">' + slotLabel + ' Published</span>';
      } else if (fullyApproved) {
        headerBadges += '<span class="cal-badge copy-approved" style="margin-left:6px">' + slotLabel + ' Ready</span>';
      }
    }

    const planUrl = dayData['day-plan']?.planUrl;
    const planLink = planUrl
      ? ' <a href="' + escapeHtml(planUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="margin-left:10px;padding:3px 10px;border:1px solid #1a1a1a;border-radius:999px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#1a1a1a;text-decoration:none;vertical-align:middle">Day Plan ↗</a>'
      : '';
    html += '<div class="cal-day' + (isToday ? ' today' : '') + '">';
    html += '<div class="cal-day-header">';
    html += '<h3>' + dayName + (isToday ? ' (Today)' : '') + planLink + '</h3>';
    html += '<div style="display:flex;align-items:center;gap:4px"><span class="cal-date">' + monthDay + '</span>' + headerBadges + '</div>';
    html += '</div>';
    html += '<div class="cal-slots">';

    for (const slotType of SLOT_ORDER) {
      const slot = dayData[slotType];
      const meta = SLOT_META[slotType];
      const missed = slotIsMissed(dateStr, slotType, slot);

      // Hide missed slots entirely
      if (missed) continue;

      // Hide empty wildcard slots (paused — only SV history on applicable days)
      if (!slot && slotType === 'wildcard') continue;

      const isEmpty = !slot;
      const isPublished = slot && slot.status === 'published';
      const fullyApproved = slot && slot.copyApprovedAt && slot.imageApprovedAt && !isPublished;
      const shouldCollapse = fullyApproved || isPublished;

      html += '<div class="cal-slot' + (isEmpty ? ' empty' : '') + (shouldCollapse ? ' approved-collapsed' : '') + '">';
      html += '<div class="cal-slot-header"' + (shouldCollapse ? ' onclick="toggleCalSlot(\\'' + dateStr + '\\', \\'' + slotType + '\\')" style="cursor:pointer"' : '') + '>';
      html += '<div class="cal-slot-type ' + slotType + '">' + meta.icon + ' ' + meta.label + renderFlagDot(reviewLookup, dateStr, slotType) + '</div>';

      if (slot) {
        // Title + badges inline
        const title = slot.plan ? (slot.cityName || 'Day Plan') :
          (slot.item?.title || slot.item?.name || 'Untitled');
        html += '<span class="cal-slot-title">' + escapeHtml(title) + '</span>';

        html += '<div class="cal-badges">';
        if (slot.status === 'published') {
          html += '<span class="cal-badge published">Published</span>';
        } else {
          html += '<span class="cal-badge ' + (slot.copyApprovedAt ? 'copy-approved' : 'draft') + '">Copy: ' + (slot.copyApprovedAt ? '\\u2713' : 'draft') + '</span>';
          html += '<span class="cal-badge ' + (slot.imageApprovedAt ? 'image-approved' : slot.imageUrl ? 'draft' : 'empty') + '">Image: ' + (slot.imageApprovedAt ? '\\u2713' : slot.imageUrl ? 'review' : 'none') + '</span>';
        }
        html += '</div>';
      } else {
        html += '<span class="cal-slot-title" style="color:#bbb;font-style:italic">No content</span>';
      }

      html += '</div>'; // close cal-slot-header

      // Review banners — always visible (even on collapsed slots) so blocks don't hide.
      html += renderReviewBanners(reviewLookup, dateStr, slotType);

      // Collapse approved/published slots — click to expand
      if (slot && (!shouldCollapse || expandedSlots[dateStr + ':' + slotType])) {
        html += renderExpandedSlot(dateStr, slotType, slot);
      }

      html += '</div>'; // close cal-slot
    }

    html += '</div>'; // close cal-slots
    html += '</div>'; // close cal-day
  }

  grid.innerHTML = html;
  // Autosize all visible copy textareas so full text is visible without scrolling.
  requestAnimationFrame(() => {
    document.querySelectorAll('.cal-copy-textarea').forEach((ta) => calAutosize(ta));
  });
}

function renderExpandedSlot(dateStr, slotType, slot) {
  let html = '<div class="cal-expanded">';

  // Day-plan: render the card list with per-card Swap buttons so Stephen can
  // fix a bad card without pinging Claude.
  if (slotType === 'day-plan' && slot.plan && Array.isArray(slot.plan.cards) && slot.plan.cards.length) {
    html += '<div class="cal-plan-cards">';
    html += '<div style="font-size:11px;font-weight:700;color:#888;margin-bottom:6px;letter-spacing:0.5px">PLAN STOPS (' + slot.plan.cards.length + ')</div>';
    slot.plan.cards.forEach((card, i) => {
      const name = (card.name || '').replace(/</g, '&lt;');
      const tb = (card.timeBlock || '').replace(/</g, '&lt;');
      const cat = (card.category || '').replace(/</g, '&lt;');
      const city = (card.city || '').replace(/</g, '&lt;');
      html += '<div class="cal-plan-card" data-idx="' + i + '">' +
        '<span class="cal-plan-card-time">' + tb + '</span>' +
        '<div class="cal-plan-card-body">' +
          '<div class="cal-plan-card-name">' + name + '</div>' +
          '<div class="cal-plan-card-meta">' + cat + ' · ' + city + '</div>' +
        '</div>' +
        '<button class="cal-plan-card-swap" onclick="openSwapPicker(\\'' + dateStr + '\\', ' + i + '); event.stopPropagation();">Swap</button>' +
      '</div>';
    });
    html += '</div>';
  }

  // Platform copy — full text with char counts
  const CHAR_LIMITS = { x: 280, threads: 500, bluesky: 300, facebook: 500, instagram: 2200, mastodon: 500 };
  if (slot.copy) {
    html += '<div class="cal-expanded-platforms">';
    const platforms = ['x', 'threads', 'bluesky', 'facebook', 'instagram', 'mastodon'];
    for (const p of platforms) {
      if (!slot.copy[p]) continue;
      const len = slot.copy[p].length;
      const limit = CHAR_LIMITS[p] || 500;
      const over = len > limit;
      const textareaId = 'cal-copy-' + dateStr + '-' + slotType + '-' + p;
      html += '<div class="cal-expanded-platform" data-platform="' + p + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
          '<strong>' + p.toUpperCase() + '</strong>' +
          '<span><span class="cal-char-count" id="' + textareaId + '-count" style="font-size:11px;color:' + (over ? '#c0392b;font-weight:700' : '#aaa') + '">' + len + ' / ' + limit + '</span>' +
          '<button class="btn-save-copy" data-pending="0" style="margin-left:8px;padding:3px 10px;border-radius:6px;border:1px solid #ddd;background:#fff;font-size:11px;cursor:pointer" onclick="calSaveCopy(\\'' + dateStr + '\\', \\'' + slotType + '\\', \\'' + p + '\\'); event.stopPropagation();">Save</button></span>' +
        '</div>' +
        '<textarea id="' + textareaId + '" data-limit="' + limit + '" class="cal-copy-textarea" ' +
          'style="width:100%;min-height:80px;font-family:inherit;font-size:13px;line-height:1.45;padding:6px 8px;border:1px solid #E5E2DB;border-radius:6px;background:#fafaf7;box-sizing:border-box;resize:vertical;field-sizing:content;overflow:hidden" ' +
          'onclick="event.stopPropagation()" ' +
          'oninput="calUpdateCount(\\'' + textareaId + '\\'); calAutosize(this)">' + escapeHtml(slot.copy[p]) + '</textarea>' +
      '</div>';
    }
    html += '</div>';
  }

  // Image
  if (slot.imageUrl) {
    html += '<img class="cal-expanded-image" src="' + escapeHtml(slot.imageUrl) + '">';
  }

  // Actions
  html += '<div class="cal-expanded-actions">';
  if (!slot.copyApprovedAt) {
    html += '<button class="btn-approve-copy" onclick="calAction(\\'' + dateStr + '\\', \\'' + slotType + '\\', \\'approve-copy\\'); event.stopPropagation();">Approve Copy</button>';
  }
  if (slot.imageUrl && !slot.imageApprovedAt) {
    html += '<button class="btn-approve-image" onclick="calAction(\\'' + dateStr + '\\', \\'' + slotType + '\\', \\'approve-image\\'); event.stopPropagation();">Approve Image</button>';
  }
  // Approve Both — when copy is approved and image needs approval, or both need approval
  if (slot.imageUrl && (!slot.copyApprovedAt || !slot.imageApprovedAt) && !(slot.copyApprovedAt && slot.imageApprovedAt)) {
    html += '<button style="background:#059669;color:#fff;border-color:#059669" onclick="calApproveBoth(\\'' + dateStr + '\\', \\'' + slotType + '\\'); event.stopPropagation();">Approve Both</button>';
  }
  // Image gen / regen for all slot types
  html += '<button class="btn-regen" onclick="calAction(\\'' + dateStr + '\\', \\'' + slotType + '\\', \\'regen-image\\'); event.stopPropagation();">' + (slot.imageUrl ? 'Regen Image' : 'Gen Image') + '</button>';
  // Copy a Midjourney permutation prompt for hand-crafting a better image.
  if (slot.imageUrl) {
    html += '<button class="btn-mj" onclick="copyMjPrompt(this, \\'' + dateStr + '\\', \\'' + slotType + '\\'); event.stopPropagation();" title="Copy a Midjourney permutation prompt — paste into /imagine to get 5 stylistic variations in one go">\\ud83c\\udfa8 Copy MJ</button>';
  }
  // Regen plan button for day-plan slots
  if (slotType === 'day-plan') {
    html += '<button class="btn-regen" onclick="if(confirm(\\'Regenerate plan + copy for this date?\\')) calAction(\\'' + dateStr + '\\', \\'' + slotType + '\\', \\'regen-plan\\'); event.stopPropagation();">Regen Plan</button>';
  }
  html += '</div>';

  // Image upload
  html += '<div class="cal-upload-area" style="margin-top:12px;padding-top:12px;border-top:1px solid #E5E2DB">';
  html += '<label style="font-size:11px;font-weight:600;text-transform:uppercase;color:#888;display:block;margin-bottom:6px">Upload Image <span style="font-weight:400;text-transform:none">(1080\u00d71350 ideal, 4:5 portrait)</span></label>';
  html += '<input type="file" accept="image/*" id="cal-upload-' + dateStr + '-' + slotType + '" onclick="event.stopPropagation()" style="font-size:12px">';
  html += '<button style="margin-left:8px;padding:6px 14px;border-radius:6px;border:1px solid #ddd;background:#fff;font-size:12px;cursor:pointer" onclick="calUploadImage(\\'' + dateStr + '\\', \\'' + slotType + '\\'); event.stopPropagation();">Upload</button>';
  html += '</div>';

  // Edit area
  html += '<div class="cal-edit-area">';
  html += '<input class="cal-edit-input" id="cal-edit-' + dateStr + '-' + slotType + '" placeholder="Edit instructions..." onclick="event.stopPropagation()" onkeydown="if(event.key===\\'Enter\\'){calEditCopy(\\'' + dateStr + '\\', \\'' + slotType + '\\'); event.preventDefault();}">';
  html += '<button style="margin-top:6px;padding:6px 14px;border-radius:6px;border:1px solid #ddd;background:#fff;font-size:12px;cursor:pointer" onclick="calEditCopy(\\'' + dateStr + '\\', \\'' + slotType + '\\'); event.stopPropagation();">Submit Edits</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

function toggleCalSlot(dateStr, slotType) {
  const key = dateStr + ':' + slotType;
  expandedSlots[key] = !expandedSlots[key];
  renderCalendar();
}

async function openSwapPicker(dateStr, cardIndex) {
  // Build + show a modal with 8 swap candidates for the given card.
  const existing = document.getElementById('swap-modal-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'swap-modal-backdrop';
  backdrop.id = 'swap-modal-backdrop';
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };

  const modal = document.createElement('div');
  modal.className = 'swap-modal';
  modal.innerHTML = '<button class="swap-modal-close" onclick="document.getElementById(\\'swap-modal-backdrop\\').remove()">×</button>' +
                    '<h3>Loading candidates…</h3>';
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  try {
    const res = await fetch('/api/schedule/' + dateStr + '/day-plan/swap-candidates?cardIndex=' + cardIndex);
    const data = await res.json();
    if (!data.ok) {
      modal.innerHTML = '<button class="swap-modal-close" onclick="document.getElementById(\\'swap-modal-backdrop\\').remove()">×</button>' +
                        '<h3>Swap failed</h3><p style="color:#c0392b">' + (data.error || 'unknown error') + '</p>';
      return;
    }
    const c = data.card || {};
    const cands = data.candidates || [];
    let html = '<button class="swap-modal-close" onclick="document.getElementById(\\'swap-modal-backdrop\\').remove()">×</button>' +
               '<h3>Swap ' + (c.name || 'card') + '</h3>' +
               '<div class="swap-modal-sub">' + (c.timeBlock || '') + ' · ' + (c.category || '') + ' · ' + dateStr + '</div>';
    if (!cands.length) {
      html += '<p style="color:#888">No candidates found (may be too restrictive — try a different category or anchor city).</p>';
    } else {
      for (const cand of cands) {
        const meta = (cand.category || '') + ' · ' + (cand.city || '') +
                     (cand.rating ? ' · ★ ' + cand.rating : '') +
                     (cand._distKm ? ' · ' + (cand._distKm * 0.621371).toFixed(1) + 'mi' : '');
        html += '<div class="swap-candidate" onclick="pickSwap(\\'' + dateStr + '\\', ' + cardIndex + ', \\'' + (cand.id || '').replace(/\\'/g, "\\\\'") + '\\', this)">' +
                  '<div class="swap-candidate-body">' +
                    '<div class="swap-candidate-name">' + (cand.name || '').replace(/</g, '&lt;') + '</div>' +
                    '<div class="swap-candidate-meta">' + meta.replace(/</g, '&lt;') + '</div>' +
                  '</div>' +
                  '<button class="swap-candidate-pick">Pick</button>' +
                '</div>';
      }
    }
    modal.innerHTML = html;
  } catch (err) {
    modal.innerHTML = '<button class="swap-modal-close" onclick="document.getElementById(\\'swap-modal-backdrop\\').remove()">×</button>' +
                      '<h3>Swap failed</h3><p style="color:#c0392b">' + err.message + '</p>';
  }
}

async function pickSwap(dateStr, cardIndex, newCardId, el) {
  if (el) { el.style.opacity = '0.5'; el.style.pointerEvents = 'none'; }
  try {
    const res = await fetch('/api/schedule/' + dateStr + '/day-plan/swap-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardIndex, newCardId }),
    });
    const data = await res.json();
    if (!data.ok) {
      alert('Swap failed: ' + (data.error || 'unknown'));
      return;
    }
    const backdrop = document.getElementById('swap-modal-backdrop');
    if (backdrop) backdrop.remove();
    if (data.schedule) {
      scheduleData = data.schedule;
      renderCalendar();
    } else {
      await loadCalendar();
    }
  } catch (err) {
    alert('Swap failed: ' + err.message);
  }
}

function disableButtons(dateStr, slotType) {
  const slot = document.querySelector('.cal-slot:has([id*=\"' + dateStr + '-' + slotType + '\"])') ||
    document.querySelector('[onclick*=\"' + dateStr + '\"][onclick*=\"' + slotType + '\"]')?.closest('.cal-slot');
  if (!slot) return;
  slot.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
}

async function calAction(dateStr, slotType, action) {
  // Disable all buttons in this slot while processing
  document.querySelectorAll('button').forEach(b => {
    if (b.onclick && b.onclick.toString().includes(dateStr) && b.onclick.toString().includes(slotType)) {
      b.disabled = true; b.style.opacity = '0.5'; b.style.cursor = 'wait';
    }
  });
  try {
    const res = await fetch('/api/schedule/' + dateStr + '/' + slotType + '/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.ok) {
      if (data.schedule) {
        scheduleData = data.schedule;
      } else {
        await loadCalendar();
        return;
      }
      renderCalendar();
    } else {
      alert('Action failed: ' + (data.error || 'unknown'));
      renderCalendar(); // re-enable buttons
    }
  } catch (err) {
    alert('Action failed: ' + err.message);
    renderCalendar();
  }
}

async function calApproveBoth(dateStr, slotType) {
  calAction(dateStr, slotType, 'approve-both');
}

function openAllDayPlans() {
  const urls = [];
  const days = (scheduleData && scheduleData.days) || {};
  const today = todayStr();
  for (let offset = 0; offset < 10; offset++) {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    const dateStr = d.toLocaleDateString('en-CA');
    const dp = days[dateStr] && days[dateStr]['day-plan'];
    if (dp && dp.planUrl) urls.push(dp.planUrl);
  }
  if (!urls.length) { alert('No day-plan URLs found.'); return; }
  // Open synchronously via <a> clicks — keeps each open inside the user-gesture
  // window so Chrome/Brave popup blocker doesn't collapse them to one tab.
  for (const url of urls) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function calAutosize(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 2) + 'px';
}

function calUpdateCount(textareaId) {
  const ta = document.getElementById(textareaId);
  if (!ta) return;
  calAutosize(ta);
  const countEl = document.getElementById(textareaId + '-count');
  const limit = parseInt(ta.dataset.limit || '500');
  const len = ta.value.length;
  if (countEl) {
    countEl.textContent = len + ' / ' + limit;
    countEl.style.color = len > limit ? '#c0392b' : '#aaa';
    countEl.style.fontWeight = len > limit ? '700' : '400';
  }
  // Mark the save button as dirty
  const wrap = ta.closest('.cal-expanded-platform');
  const btn = wrap && wrap.querySelector('.btn-save-copy');
  if (btn) {
    btn.dataset.pending = '1';
    btn.style.background = '#fff8e1';
    btn.style.borderColor = '#e0b84c';
  }
}

async function calSaveCopy(dateStr, slotType, platform) {
  const textareaId = 'cal-copy-' + dateStr + '-' + slotType + '-' + platform;
  const ta = document.getElementById(textareaId);
  if (!ta) return;
  const text = ta.value;
  const wrap = ta.closest('.cal-expanded-platform');
  const btn = wrap && wrap.querySelector('.btn-save-copy');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; btn.style.opacity = '0.6'; }
  try {
    const res = await fetch('/api/schedule/' + dateStr + '/' + slotType + '/save-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, text }),
    });
    const data = await res.json();
    if (data.ok) {
      if (data.schedule) scheduleData = data.schedule;
      if (btn) {
        btn.textContent = 'Saved';
        btn.style.background = '#dcfce7';
        btn.style.borderColor = '#10b981';
        btn.dataset.pending = '0';
        setTimeout(() => {
          if (btn) {
            btn.textContent = 'Save';
            btn.style.background = '#fff';
            btn.style.borderColor = '#ddd';
            btn.disabled = false;
            btn.style.opacity = '1';
          }
        }, 1200);
      }
      // Don't re-render — user may be editing another platform
    } else {
      alert('Save failed: ' + (data.error || 'unknown'));
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; btn.style.opacity = '1'; }
    }
  } catch (err) {
    alert('Save failed: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; btn.style.opacity = '1'; }
  }
}

async function calEditCopy(dateStr, slotType) {
  const input = document.getElementById('cal-edit-' + dateStr + '-' + slotType);
  if (!input || !input.value.trim()) return;

  // Disable submit button
  const submitBtn = input.nextElementSibling;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; submitBtn.textContent = 'Editing...'; }

  try {
    const res = await fetch('/api/schedule/' + dateStr + '/' + slotType + '/edit-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: input.value.trim() }),
    });
    const data = await res.json();
    if (data.ok) {
      input.value = '';
      if (data.schedule) {
        scheduleData = data.schedule;
      } else {
        await loadCalendar();
        return;
      }
      renderCalendar();
    }
  } catch (err) {
    alert('Edit failed: ' + err.message);
  }
}

async function calUploadImage(dateStr, slotType) {
  const input = document.getElementById('cal-upload-' + dateStr + '-' + slotType);
  if (!input || !input.files || !input.files[0]) {
    alert('Select an image file first');
    return;
  }
  const file = input.files[0];
  // Disable upload button
  const uploadBtn = input.nextElementSibling;
  if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.style.opacity = '0.5'; uploadBtn.textContent = 'Uploading...'; }

  const formData = new FormData();
  formData.append('image', file);
  try {
    const res = await fetch('/api/schedule/' + dateStr + '/' + slotType + '/upload-image', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.ok) {
      input.value = '';
      if (data.schedule) {
        scheduleData = data.schedule;
      }
      renderCalendar();
    } else {
      alert('Upload failed: ' + (data.error || 'unknown'));
    }
  } catch (err) {
    alert('Upload failed: ' + err.message);
  }
}

// ── Midjourney prompt copy ──────────────────────────────────────────────
// Server distills the post copy into a tight image subject via Claude Haiku
// and returns the full permutation prompt. Client just copies it.
async function copyMjPrompt(btn, dateStr, slotType) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '\\u2026 distilling';
  try {
    const res = await fetch('/api/schedule/' + dateStr + '/' + slotType + '/mj-prompt', { method: 'POST' });
    const data = await res.json();
    if (!data.ok || !data.prompt) throw new Error(data.error || 'no prompt returned');
    try {
      await navigator.clipboard.writeText(data.prompt);
    } catch (clipErr) {
      const ta = document.createElement('textarea');
      ta.value = data.prompt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    btn.classList.add('copied');
    btn.innerHTML = '\\u2713 Copied — paste into /imagine';
  } catch (err) {
    btn.innerHTML = '\\u2715 ' + (err && err.message ? err.message : 'failed');
  }
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = orig;
    btn.disabled = false;
  }, 2200);
}

init();
</script>
</body>
</html>`;

// ─── Midjourney prompt helpers (server-side) ─────────────────────────────
// Style pool mirrors scripts/social/lib/poster-styles.mjs ABSTRACT_AESTHETICS,
// rephrased without internal commas so MJ permutation parsing stays clean.
// Lean abstract + color-forward, occasional monochrome (linocut, sumi-e,
// scandinavian, cyanotype). 5 fresh styles sampled per click.
// Two-pool style system. Skews toward abstract/geometric (10 sampled) while
// keeping wild variety (5 sampled from everything else). Per-click total: 15.
//
// Rules for entries:
// - No internal commas (MJ permutation parser splits on them).
// - No living-artist names (filter risk). Dead artists / movements OK.
// - No psychedelic/kaleidoscope/tie-dye/melting (Stephen's standing rule).
// - Each entry should produce a visually distinct register in MJ.

const MJ_STYLES_GEOMETRIC = [
  // Geometric abstraction & hard-edge
  "Op Art Vasarely moire optical illusion stark contrast",
  "hard-edge painting flat sharp geometric color blocks crisp",
  "Albers homage to the square nested color squares perception",
  "Frank Stella protractor concentric stripes geometric",
  "Sol LeWitt grid systematic wall drawing permutation",
  "Agnes Martin gentle horizontal grid soft graphite quiet",
  "Rothko color field soft rectangles ethereal scale meditative",
  "Donald Judd minimalist box geometry industrial",
  "concrete art swiss geometric pure abstraction",
  "geometric abstraction crisp shapes pure color modernist",
  "abstract expressionism gestural brushwork vivid color blocks",
  "color field painting large flat saturated planes meditative scale",
  // Modernist movements (very geometric)
  "Bauhaus geometric primary shapes structured grid",
  "De Stijl primary rectangles black lines mondrian grid",
  "Cubist faceted planes multiple viewpoints geometric fragmentation",
  "Suprematist floating geometric shapes white void minimalist",
  "Futurist motion lines diagonal energy speed dynamic",
  "Vorticist sharp angular machine-age british modernism",
  "constructivist poster diagonal composition red black and cream",
  "Russian avant-garde rodchenko diagonal red typography revolutionary",
  "Bauhaus typography poster sans-serif primary blocks geometric",
  "Swiss International Style helvetica grid clean asymmetric",
  // Print & relief (geometric-leaning)
  "linocut block print carved texture visible grain 2-3 inks indie feel",
  "woodcut bold black lines stark white space german expressionist",
  "risograph print grainy texture 2-color overprint zine energy",
  "screen print poster halftone dots limited 3-color palette retro",
  "cyanotype blueprint single-tone deep blue ink wash",
  // Decorative geometric patterns
  "Islamic geometric tile tessellation interlocking pattern",
  "sacred geometry mandala precise compass shapes meditative",
  "Persian rug pattern ornate central medallion rich jewel tones",
  "mosaic tessellated stones byzantine gold leaf saturated",
  "stained glass leaded outline jewel-tone color blocks rich saturation",
  "terrazzo pattern cream field scattered small stone chips muted accents",
  // Folk geometric patterns
  "Adinkra stamped pattern earth tones west african symbol",
  "Andean textile geometric warp weft alpaca palette",
  "Aboriginal Australian dot painting tessellated landscape symbolic",
  "Navajo blanket geometric stripes warm earth palette",
  "quilt patchwork geometric blocks faded country fabric",
  "sashiko indigo blue running stitch repair pattern japanese",
  "shibori indigo resist dye organic fold pattern hand-dyed",
  "block print fabric repeating motif handmade indigo textile",
  "Indian Madhubani folk pattern bold outline natural pigments",
  "mola textile applique reverse stitching bold tropical pattern",
  // Modern graphic & poster
  "mid-century jazz album cover blue note bold typography rhythm",
  "art deco travel poster stepped geometry chrome lines rich teal and gold",
  "WPA mid-century travel poster stylized geometry limited palette",
  "Saul Bass film poster bold silhouettes flat shapes stark contrast",
  "Memphis design squiggles confetti dots 80s bold pastels playful",
  "isometric flat illustration architectural spatial depth",
  "minimal line art bold color fills large color fields",
  "Scandinavian minimal generous whitespace muted earth tones thin lines",
  "brutalist raw concrete typography unpolished anti-design",
  "chromatic aberration glitch RGB channel offsets scanlines digital grain",
  "dazzle camouflage geometric bold black white shapes",
  "pixel art 8-bit grid limited palette retro digital",
  "wireframe blueprint geometric architecture line drawing",
  "topographic contour lines abstract landscape pattern",
];

const MJ_STYLES_VARIETY = [
  // Painting traditions
  "watercolor translucent wash bleeding edges paper texture wet-on-wet",
  "gouache painterly texture muted vintage palette",
  "oil impasto thick textured strokes rich post-impressionist",
  "tempera flat matte egg-yolk binder medieval icon vivid pigment",
  "fresco wall painting muted lime-plaster faded pompeii antique",
  "encaustic wax painting layered translucent dimensional surface",
  "fauvist wild color non-realistic palette emotional intensity",
  "pointillism dotted color separation optical mixing scientific",
  "tonalism muted atmosphere soft fog quiet contemplation",
  "luminism quiet glow detailed landscape transcendent light",
  "plein air impressionist quick brushwork outdoor light dappled",
  "ashcan school gritty urban earth tones early 20th century",
  "sumi-e ink wash rice-paper cream broad black brushstrokes single red seal accent",
  // Print techniques (less geometric)
  "etching crosshatch sepia heavy outline antiquarian feel",
  "drypoint scratched copperplate dark ink subtle gradient",
  "mezzotint velvety dark tones gradual fades atmospheric mystery",
  "lithograph chalk crayon rough drawing muted earth tones",
  "stencil street art spray paint stark contrast bold silhouette",
  "monoprint painterly transfer texture single impression spontaneous",
  // Avant-garde (less geometric)
  "Dada collage typography fragmented absurd",
  "Surrealist dreamlike juxtaposition unexpected scale collage absurdist humor",
  "Czech functionalist restrained typography geometric book cover",
  // Decorative & ornamental
  "art nouveau organic curves whiplash lines decorative borders",
  "arts and crafts honest materials nature-inspired ornament",
  "Vienna Secession Klimt gold leaf decorative pattern",
  "illuminated manuscript medieval marginalia gold ink decorative",
  "icon painting byzantine gold leaf stylized halos religious",
  "Russian lacquer miniature gold detail black background fairy tale",
  "tarot card baroque ornamental border symmetrical iconography",
  "Victorian botanical illustration meticulous engraving plant detail",
  "Edwardian theater poster ornate typography muted gilt",
  // International painting
  "Japanese ukiyo-e woodblock flat color fields delicate ink line",
  "Hokusai dynamic wave landscape compositional power",
  "Korean minhwa folk painting flat colors symbolic motifs cheerful",
  "Chinese gongbi meticulous brush detail traditional symbolic",
  "Persian miniature delicate detail gold leaf jewel tones manuscript",
  "Mughal garden painting elaborate detail architecture refined",
  "Mexican papel picado cut paper banner festive primary colors",
  "Maori koru spiral curvilinear pattern earth ochre",
  "Inuit stonecut print bold silhouette arctic palette",
  // Mid-century & pop graphic (less geometric)
  "mid-century modern organic curves muted warm palette atomic-era",
  "Saul Steinberg single-line drawing whimsy intellectual cartooning",
  "Milton Glaser bold curved typography flat color 60s poster",
  "Push Pin Studios flat illustration sophisticated 60s graphic",
  "Polish poster school surreal expressive 60s illustration",
  "Cuban screen-print poster bold limited color graphic energy",
  "Czech film poster surreal hand-drawn melancholic 60s",
  "Lichtenstein ben-day dots comic panel thick outline pop",
  "Warhol silkscreen flat color repeated icon pop",
  // Craft & material-forward (organic side)
  "paper cut collage layered flat shapes subtle shadows craft feel",
  "Matisse cut-paper bold organic shapes clean edges joyful flat color",
  "kintsugi gold-mended cracks broken pottery imperfect repair",
  "embroidery thread texture stitched outline tactile fabric",
  "weaving warp-weft texture earth-tone yarn dimensional grid",
  "vintage zine collage torn paper xerox grain DIY punk energy",
  // Editorial & graphic (less geometric)
  "editorial magazine wide margins single bold accent color sophisticated restraint",
  "folk art naive style hand-drawn whimsical bright colors",
  // Landscape
  "California redwood and fog-gray landscape abstraction stylized hills golden hour",
  "Hudson River School luminous landscape transcendent vista 19th century",
  "Japanese minimalist landscape negative space distant mountains haze",
];

function mjShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Weighted draw: 10 from geometric pool + 5 from variety pool, then shuffled
// so they appear in random order in the prompt. ~67% abstract/geometric, ~33%
// wild variety.
function mjSampleStyles() {
  const g = mjShuffle(MJ_STYLES_GEOMETRIC).slice(0, 10);
  const v = mjShuffle(MJ_STYLES_VARIETY).slice(0, 5);
  return mjShuffle([...g, ...v]);
}

const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || "/opt/homebrew/bin/claude";

// Shell out to Claude Code in print mode — uses Stephen's subscription auth
// (keychain) rather than the API. Runs with cwd=/tmp so it doesn't load this
// project's CLAUDE.md.
async function callClaudeCodeOpus(instructions, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (err, val) => { if (done) return; done = true; err ? reject(err) : resolve(val); };
    const proc = spawn(CLAUDE_CLI, [
      "-p",
      "--model", "opus",
      "--output-format", "text",
      "--no-session-persistence",
    ], { cwd: "/tmp", timeout: timeoutMs });
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => finish(new Error(`claude CLI spawn failed: ${err.message}`)));
    proc.on("close", (code, signal) => {
      if (signal) return finish(new Error(`claude CLI killed by ${signal} (likely timeout)`));
      if (code !== 0) return finish(new Error(`claude CLI exit ${code}: ${(stderr || stdout).slice(0, 300)}`));
      finish(null, stdout);
    });
    proc.stdin.end(instructions);
  });
}

async function distillMjSubject(slot, slotType) {
  const copy = (slot && slot.copy && (slot.copy.x || slot.copy.bluesky || slot.copy.threads || slot.copy.facebook || slot.copy.instagram || slot.copy.mastodon)) || "";
  const cardLine = (slotType === "day-plan" && Array.isArray(slot?.plan?.cards) && slot.plan.cards.length)
    ? `\nSTOPS IN THE DAY PLAN: ${slot.plan.cards.map((c) => c?.name).filter(Boolean).join(", ")}`
    : "";

  const instructions = `You are crafting a Midjourney image-prompt SUBJECT for South Bay Today — a hyperlocal Bay Area community publication. The user has a "Copy MJ" button to upgrade the auto-generated image into something handmade and beautiful via Midjourney.

The post you're working from:
"""${copy}"""${cardLine}

Your output will be wrapped in a permutation of 5 abstract design styles (Bauhaus / Matisse cut-paper / linocut / risograph / art deco / sumi-e / etc.) and submitted to Midjourney. So your subject needs to play nicely with those styles — think gallery-grade still life, atmospheric landscape, and material-rich vignette.

═══ PRINCIPLES ═══

1. STRIP every proper noun. No city names, no venue names, no instructor or performer or team or brand names. Strip all times, dates, prices, RSVP details. Strip editorial filler ("nice way to land into the week", "low-key", "easygoing vibe", "genuinely"). What's left is the EXPERIENCE itself.

2. Translate the experience into 3-4 SENSORY ANCHORS. For each anchor, ask: what would I SEE, what's the LIGHT like, what MATERIALS or TEXTURES are in the room, what COLORS dominate, what's the MOOD? Each anchor is a short visual fragment — 3-6 words each.

3. Each fragment is a self-contained still life or atmospheric vignette. UNUSUAL PAIRINGS beat literal description. "candlelight pooling on rice paper" beats "person meditating". "stadium lights bleeding into pink dusk" beats "people watching baseball."

4. BIAS toward still life, materials, light, atmosphere, and landscape. AVOID verbs that imply human figures in motion — the final image excludes people. If the event involves people doing something, describe the OBJECTS and LIGHT around the activity instead.

5. Concrete details that imply mood. Not "warmth" — "amber light pooling on brass". Not "energy" — "dust caught in late-afternoon sunbeams". Not "calm" — "the hush of a book closing in soft amber". The mood emerges from specific things.

6. Match the event's visual REGISTER:
   - meditation / quiet / library → hush, soft amber light, breath, paper, cloth, dimness
   - music → instruments, smoke, low warm glow, light-as-sound metaphors
   - food → glossy textures, steam, plates, knife-edges of color, glassware
   - sports → kinetic granularity, stadium light, paint stripes, leather grain, foam
   - hike / outdoor → topography, weather, hour-of-day, distant haze, grass
   - markets / fairs → tables of color, paper bags, awnings, midday glare
   - kids / family events → primary colors, simple shapes, warm domestic light

7. ART-CONTENT EVENTS (exhibitions, gallery shows, art classes, art workshops, museum visits, theater, dance, performance, open studios): the subject must render the ART ITSELF — the medium, materials, mark-making, color register, gesture. NEVER render the display setting (gallery walls, framed pieces, museum interiors, plinths, audiences, stages). Translate the art into its essential materials and actions: ink brush curves, watercolor washes, paper-cut petals, palette-knife smears, gold leaf flakes, photographic emulsion, stage light spilling across velvet, calligraphy on cream paper. If the event has a CULTURAL register (AANHPI, Latinx, Black History, etc.), use that culture's visual heritage in materials and color (indigo, persimmon, jade for East Asian; cochineal, marigold, turquoise for Mexican folk; cobalt, ochre, ivory for West African; etc.).

8. Total length: 14-26 words across 3-4 fragments. Tight. Each word earns its place.

═══ EXAMPLES (study the bar) ═══

POST: "Tonight in Los Altos: 20 min guided meditation at Woodland Library, 7 PM, free"
SUBJECT: candlelight pooling on rice paper, a single dropped magnolia petal, the hush of a book closing in soft amber

POST: "Jazz trio tonight at Cafe Stritch, 7pm, \$20 cover. Easygoing vibe + cocktails"
SUBJECT: brushed cymbals catching low amber, the curve of an upright bass against deep velvet, smoke unfurling toward a dim doorway

POST: "Friday in the South Bay: bagels in Mountain View, hike the Dish, Cantor Arts Center, ramen dinner"
SUBJECT: steam rising off a cross-cut bagel, golden grass over coastal hills, marble torso turning in slow gallery light, glossy noodles caught in chopstick tension

POST: "Tonight: SJ Giants vs Fresno Grizzlies at Excite Ballpark, first pitch 7pm"
SUBJECT: stadium lights bleeding into pink dusk, the white seam of a thrown baseball, foam spilling from a paper cup, peanut shells on poured concrete

POST: "Now open: new ramen spot in Mountain View, Sunday opening special"
SUBJECT: clouded broth in a hand-thrown bowl, neon kanji washed onto rain-slick pavement, glossy noodles caught in chopstick lift

POST: "Free flower drawing workshop at Los Altos Library — beginners welcome"
SUBJECT: bare graphite lines branching into a daisy, a tin of colored pencils tipped open, dried botanicals pressed under glass, late-morning library light

POST: "Board game night at Milpitas Library, Friday 6pm, free, all ages"
SUBJECT: scattered wooden meeples in lamplight, the glossy edge of a card mid-shuffle, dice frozen mid-roll on worn felt

POST: "Saturday symphony at Mountain Winery — outdoor amphitheater, 7:30pm"
SUBJECT: distant stage glow against eucalyptus silhouettes, brass instruments catching the last orange light, vineyard rows fading into purple haze

POST: "Sunday: pop-up plant market at the corner of Castro and Dana, 10-2"
SUBJECT: terra-cotta lined up on weathered wood, ferns spilling sideways in midday glare, hand-written tags fluttering, paper bags folded at the edge

POST: "AAPI Teen Art Exhibition at Saratoga Library, free through May, honoring AANHPI Heritage Month"
SUBJECT: overlapping watercolor washes in indigo persimmon and jade, a single calligraphy stroke ascending, gold leaf flakes drifting across cream paper, palette-knife dabs of plum and citron

POST: "Open studio night Friday — local painters showing new work + free wine"
SUBJECT: wet oil dragged across rough canvas, a thumbprint smudge of cadmium red, charcoal lines cutting through underpainting, palette piled with glossy ridges

POST: "Saturday flamenco performance at Mexican Heritage Plaza, 8pm"
SUBJECT: marigold ruffles caught mid-twirl, fingertip-smudged castanets, deep cochineal velvet folding into shadow, a single staccato heel-strike at the floor's edge

═══ OUTPUT FORMAT ═══

Return ONLY the subject phrase. Single line. No quotes, no preamble, no markdown, no "Subject:" prefix, no explanation, no trailing period.`;

  const raw = await callClaudeCodeOpus(instructions);
  let subject = raw.trim();
  // Strip any preamble noise Opus might add despite instructions.
  subject = subject.replace(/^```[\w]*\s*|\s*```\s*$/g, "");
  subject = subject.split("\n").filter((l) => l.trim()).pop() || "";
  subject = subject.replace(/^(SUBJECT|Subject|subject)[:：]\s*/u, "");
  subject = subject.replace(/^["'“‘`]+|["'”’`]+$/g, "");
  subject = subject.replace(/[.。]$/, "");
  subject = subject.trim();
  if (!subject) throw new Error("Opus returned empty subject");
  return subject;
}

async function buildMjPromptForSlot(slot, slotType) {
  const subject = await distillMjSubject(slot, slotType);
  const styles = mjSampleStyles();
  // Style LEADS the prompt — putting the long descriptive subject first makes
  // MJ interpret it as a photographic scene and treat the style as background
  // decoration (e.g. "photo of a room with abstract art on the wall"). Leading
  // with `{style} of <subject>` forces MJ to read the style as the medium.
  // Anti-photo negatives in --no shut down lingering photorealism / gallery
  // wall framing.
  return `{${styles.join(", ")}} of ${subject}, flat graphic illustration, abstract composition --ar 4:5 --no photograph, photo, photorealistic, realism, 3D render, render, framed art, gallery wall, museum interior, exhibition, art show, plinth, hanging artwork, stage, audience, text, words, letters, watermark, signature, logo, people, faces, hands`;
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/posts") {
    const posts = loadPendingPosts();
    const queue = loadQueue();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ posts, queueSize: queue.filter((p) => !p.published).length }));
    return;
  }

  if (req.method === "GET" && req.url === "/api/status") {
    const posts = loadPendingPosts();
    const queue = loadQueue();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ generating: isGenerating, pendingCount: posts.length, queueSize: queue.filter((p) => !p.published).length }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate") {
    generateNewBatch();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, generating: true }));
    return;
  }

  // Immediate per-vote endpoint — saves each swipe as it happens
  if (req.method === "POST" && req.url === "/api/vote") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const r = JSON.parse(body);
        const posts = loadPendingPosts();
        const post = posts.find((p) => p._file === r.file);

        if ((r.vote === "approve" || r.vote === "edit") && post) {
          const queue = loadQueue();
          const cleanPost = { ...post };
          delete cleanPost._file;

          // If "edit" vote, rewrite copy with Claude using the comment as instructions
          if (r.vote === "edit" && r.comment && cleanPost.copy) {
            try {
              const rewritten = await rewriteCopyWithEdits(cleanPost.copy, r.comment, cleanPost.item);
              cleanPost.copy = rewritten;
              console.log(`  ✏️  ${r.title?.slice(0, 50)} → copy rewritten per edits`);
            } catch (err) {
              console.error(`  ⚠️  Edit rewrite failed: ${err.message} — queuing original`);
            }
          }

          const approvedPost = {
            ...cleanPost,
            approvedAt: new Date().toISOString(),
            comment: r.comment || null,
            editApplied: r.vote === "edit",
            published: false,
          };
          // Assign a publish slot based on the event date + current queue
          // occupancy. Falls back to null if no event date or no slot fits.
          try {
            const { assignSlot } = await import("./lib/slot-scheduler.mjs");
            const slot = assignSlot(approvedPost, queue);
            if (slot) {
              approvedPost.scheduledSlot = slot;
              console.log(`     📅 slotted: ${slot.date} @ ${slot.time}${slot.fallback ? " (fallback)" : ""}`);
            }
          } catch (err) {
            console.warn(`     ⚠️  slot assignment failed: ${err.message}`);
          }
          queue.push(approvedPost);
          saveQueue(queue);
          console.log(`  ✅ ${r.title?.slice(0, 50)} → ${r.vote === "edit" ? "approved w/ edits" : "approved"} (queue: ${queue.length})`);
        } else {
          console.log(`  ⏭️  ${r.title?.slice(0, 50)} → skipped`);
        }

        // Save to review history so it never reappears
        let reviewHistory = [];
        try { reviewHistory = JSON.parse(readFileSync(REVIEW_HISTORY_FILE, "utf8")); } catch {}
        reviewHistory.push({
          title: r.title,
          url: post?.item?.url || null,
          postType: post?.postType || null,
          milestoneId: post?.item?.milestoneId || null,
          vote: r.vote,
          comment: r.comment || null,
          reviewedAt: new Date().toISOString(),
        });
        writeFileSync(REVIEW_HISTORY_FILE, JSON.stringify(reviewHistory, null, 2) + "\n");

        // Delete the post file from /tmp so it won't reappear
        if (post?._file) {
          try { unlinkSync(join(POST_DIR, post._file)); } catch {}
        }

        // Process action commands from comments (skip for edit votes — those are edit instructions, not actions)
        let actionResult = null;
        if (r.comment && r.vote !== "edit") {
          const context = {
            title: r.title || post?.item?.title || "",
            source: post?.item?.source || "",
            venue: post?.item?.venue || "",
            city: post?.item?.city || "",
            category: post?.item?.category || "",
            url: post?.item?.url || "",
          };
          try {
            actionResult = await processComment(r.comment, context);
            if (actionResult?.summary) {
              console.log(`     🎯 ${r.title?.slice(0, 40)}: ${actionResult.summary}`);
            }
          } catch (err) {
            console.error(`  ⚠ Action processing failed:`, err.message);
          }
        }

        const queue = loadQueue();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, queueSize: queue.filter((p) => !p.published).length, actionResult: actionResult?.summary || null }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/review") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const results = JSON.parse(body);
      const queue = loadQueue();
      const posts = loadPendingPosts();

      const approved = results.filter((r) => r.vote === "approve");
      const rejected = results.filter((r) => r.vote === "reject");
      const withComments = results.filter((r) => r.comment);

      for (const r of approved) {
        const post = posts.find((p) => p._file === r.file);
        if (!post) continue;
        delete post._file;
        queue.push({
          ...post,
          approvedAt: new Date().toISOString(),
          comment: r.comment || null,
          published: false,
        });
      }
      saveQueue(queue);

      // Persist ALL reviewed items (approved + rejected) to review history
      // so they never show up again in future generation runs
      let reviewHistory = [];
      try { reviewHistory = JSON.parse(readFileSync(REVIEW_HISTORY_FILE, "utf8")); } catch {}
      for (const r of results) {
        const post = posts.find((p) => p._file === r.file);
        reviewHistory.push({
          title: r.title,
          url: post?.item?.url || null,
          vote: r.vote,
          comment: r.comment || null,
          reviewedAt: new Date().toISOString(),
        });
      }
      writeFileSync(REVIEW_HISTORY_FILE, JSON.stringify(reviewHistory, null, 2) + "\n");

      console.log(`\n✅ Review complete!`);
      console.log(`   ${approved.length} approved → queue now ${queue.length}`);
      console.log(`   ${rejected.length} skipped`);
      if (withComments.length > 0) {
        console.log(`   ${withComments.length} with comments:`);
        for (const r of withComments) {
          console.log(`     [${r.vote}] ${r.title}: "${r.comment}"`);
        }
      }

      // Process action commands from comments
      const actionResults = [];
      for (const r of withComments) {
        const post = posts.find((p) => p._file === r.file);
        const context = {
          title: r.title || post?.item?.title || "",
          source: post?.item?.source || "",
          venue: post?.item?.venue || "",
          city: post?.item?.city || "",
          category: post?.item?.category || "",
          url: post?.item?.url || "",
        };
        try {
          const result = await processComment(r.comment, context);
          if (result.summary) {
            actionResults.push({ title: r.title, summary: result.summary });
          }
        } catch (err) {
          console.error(`  ⚠ Action processing failed for "${r.title}":`, err.message);
        }
      }
      if (actionResults.length > 0) {
        console.log(`   🎯 Actions executed:`);
        for (const ar of actionResults) {
          console.log(`     ${ar.title}: ${ar.summary}`);
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, queueSize: queue.filter((p) => !p.published).length, actionResults }));
    });
    return;
  }

  // ── Schedule API endpoints ───────────────────────────────────────────────

  if (req.method === "GET" && req.url === "/api/schedule") {
    const schedule = loadSchedule();
    // Deep-clone before review so auto-fix mutations don't leak to disk state.
    // GET is surface-only — flags/auto-fix notes render in the UI.
    let review = { autoFixed: [], flagged: [] };
    try {
      const cloned = JSON.parse(JSON.stringify(schedule));
      review = runQualityReview(cloned, { resetFlaggedToDraft: false });
    } catch (err) {
      console.error("[review] failed:", err.message);
    }
    // Don't banner the user for things the gen pipeline already auto-resolves
    // (sprawl, hours, <6 cards, no-URL). Only surface true-attention flags
    // (those that can't be machine-resolved). Stephen's preference is "fix
    // don't flag" — the swiper should never see a flag for something we
    // could regen ourselves. Banners persist only for soft "needs-human"
    // flags (none are tagged that way today; we'll add explicit ones later).
    const AUTOFIXABLE_PATTERNS = [
      /too much driving/i,
      /hours mismatch/i,
      /spa saturation/i,
      /only \d+ stops?/i,
      /starts too late/i,
      /no URL/i,
      /generic homepage/i,
    ];
    review.flagged = (review.flagged || []).filter(
      (f) => !AUTOFIXABLE_PATTERNS.some((p) => p.test(f.reason || "")),
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...schedule, _review: review }));
    return;
  }

  // Handle schedule actions: /api/schedule/:date/:slotType/:action
  // Handle image upload: /api/schedule/:date/:slotType/upload-image
  const uploadMatch = req.url?.match(/^\/api\/schedule\/(\d{4}-\d{2}-\d{2})\/(day-plan|tonight-pick|wildcard)\/upload-image$/);
  if (req.method === "POST" && uploadMatch) {
    const [, date, slotType] = uploadMatch;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        const schedule = loadSchedule();
        const slot = schedule.days?.[date]?.[slotType];
        if (!slot) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Slot not found" }));
          return;
        }

        const raw = Buffer.concat(chunks);
        // Parse multipart boundary
        const contentType = req.headers["content-type"] || "";
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Missing multipart boundary" }));
          return;
        }
        const boundary = boundaryMatch[1];
        const parts = raw.toString("binary").split("--" + boundary);

        let fileBuffer = null;
        let mimeType = "image/jpeg";
        for (const part of parts) {
          if (part.includes("filename=")) {
            const mimeMatch = part.match(/Content-Type:\s*(\S+)/i);
            if (mimeMatch) mimeType = mimeMatch[1].trim();
            const headerEnd = part.indexOf("\r\n\r\n");
            if (headerEnd >= 0) {
              const body = part.slice(headerEnd + 4);
              // Remove trailing \r\n
              const trimmed = body.endsWith("\r\n") ? body.slice(0, -2) : body;
              fileBuffer = Buffer.from(trimmed, "binary");
            }
          }
        }

        if (!fileBuffer || fileBuffer.length < 100) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "No valid image file found" }));
          return;
        }

        // Load env for Blob token
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          try {
            const lines = readFileSync(ENV_FILE, "utf8").split("\n");
            for (const line of lines) {
              const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
              if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
            }
          } catch {}
        }

        // Upload to Vercel Blob
        const { put } = await import("@vercel/blob");
        const ext = mimeType.includes("png") ? "png" : "jpg";
        const pathname = `posters/${date}-${slotType}-upload-${Date.now()}.${ext}`;
        const result = await put(pathname, fileBuffer, {
          access: "public",
          contentType: mimeType,
          allowOverwrite: true,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });

        slot.imageUrl = result.url;
        slot.imageStyle = "upload";
        slot.imageApprovedAt = new Date().toISOString(); // auto-approve uploads
        console.log(`  📤 Image uploaded: ${date} ${slotType} → ${result.url.slice(0, 60)}...`);

        saveScheduleFile(schedule);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, schedule }));
      } catch (e) {
        console.error(`  ⚠️  Upload failed: ${e.message}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // GET swap candidates for one card in a day-plan.
  // /api/schedule/:date/day-plan/swap-candidates?cardIndex=N
  const swapCandidatesMatch = req.url?.match(/^\/api\/schedule\/(\d{4}-\d{2}-\d{2})\/day-plan\/swap-candidates\?cardIndex=(\d+)$/);
  if (req.method === "GET" && swapCandidatesMatch) {
    const [, date, idxStr] = swapCandidatesMatch;
    const cardIndex = parseInt(idxStr, 10);
    try {
      const schedule = loadSchedule();
      const slot = schedule.days?.[date]?.["day-plan"];
      if (!slot?.plan?.cards?.[cardIndex]) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Card not found" }));
        return;
      }
      const card = slot.plan.cards[cardIndex];
      const candidates = findSwapCandidates({
        anchorCity: slot.city || card.city || "san-jose",
        category: card.category,
        timeBlock: card.timeBlock,
        planDate: date,
        excludeIds: slot.plan.cards.map((c) => c.id),
        limit: 8,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, candidates, card: { id: card.id, name: card.name, timeBlock: card.timeBlock, category: card.category } }));
    } catch (err) {
      console.error(`[swap-candidates] failed: ${err.message}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // POST swap a card in a day-plan.
  // /api/schedule/:date/day-plan/swap-card  body: { cardIndex, newCardId }
  const swapCardMatch = req.url?.match(/^\/api\/schedule\/(\d{4}-\d{2}-\d{2})\/day-plan\/swap-card$/);
  if (req.method === "POST" && swapCardMatch) {
    const [, date] = swapCardMatch;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { cardIndex, newCardId } = JSON.parse(body || "{}");
        if (typeof cardIndex !== "number" || !newCardId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Missing cardIndex or newCardId" }));
          return;
        }
        const schedule = loadSchedule();
        const slot = schedule.days?.[date]?.["day-plan"];
        if (!slot?.plan?.cards?.[cardIndex]) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Card not found" }));
          return;
        }
        const oldCard = slot.plan.cards[cardIndex];

        // Re-resolve the new candidate by id so we get fresh, canonical fields.
        const pool = findSwapCandidates({
          anchorCity: slot.city || oldCard.city || "san-jose",
          category: oldCard.category,
          timeBlock: oldCard.timeBlock,
          planDate: date,
          excludeIds: slot.plan.cards.filter((_, i) => i !== cardIndex).map((c) => c.id),
          limit: 20,
        });
        const chosen = pool.find((c) => c.id === newCardId);
        if (!chosen) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "newCardId not in candidate pool" }));
          return;
        }

        // Build the replacement card — inherits timeBlock + blurb/why scaffolding
        // from the old card, but we'll regenerate copy below so the blurb matches
        // the new venue.
        const newCard = {
          id: chosen.id,
          name: chosen.name,
          category: chosen.category,
          city: chosen.city,
          address: chosen.address || "",
          timeBlock: oldCard.timeBlock,
          blurb: `Stop by ${chosen.name}.`, // placeholder — regen-copy replaces it
          why: "Swapped in as a fresh pick for this slot.",
          url: chosen.url || "",
          mapsUrl: chosen.mapsUrl || null,
          cost: null,
          costNote: chosen.costNote || null,
          photoRef: chosen.photoRef || null,
          venue: chosen.venue || chosen.name,
          source: chosen.source,
          rationale: `swap:manual | was=${oldCard.name}`,
        };

        slot.plan.cards[cardIndex] = newCard;

        // Re-sync shared-plans.json so /plan/:id reflects the swap immediately.
        if (slot.planUrl) {
          try {
            const planId = slot.planUrl.split("/").pop();
            if (!existsSync(SHARED_PLANS_FILE)) throw new Error("shared-plans.json missing");
            const sharedPlans = JSON.parse(readFileSync(SHARED_PLANS_FILE, "utf8"));
            if (!sharedPlans || typeof sharedPlans !== "object" || Array.isArray(sharedPlans)) {
              throw new Error(`shared-plans.json parsed to ${typeof sharedPlans} (not an object)`);
            }
            if (sharedPlans[planId]) {
              sharedPlans[planId].cards = canonicalizePlanCards(slot.plan.cards);
              sharedPlans[planId].updatedAt = new Date().toISOString();
              const tmpPath = SHARED_PLANS_FILE + ".tmp";
              writeFileSync(tmpPath, JSON.stringify(sharedPlans, null, 2) + "\n");
              renameSync(tmpPath, SHARED_PLANS_FILE);
            }
          } catch (e) {
            console.warn(`[swap-card] shared-plans sync failed: ${e.message}`);
          }
        }

        // Regenerate day-plan copy so blurbs reflect the new card.
        try {
          const copy = await generateDayPlanCopy(slot.plan, date, slot.planUrl || "");
          slot.copy = copy;
          slot.copyApprovedAt = null;
          slot.imageUrl = null;
          slot.imageApprovedAt = null;
          slot.status = "draft";
        } catch (e) {
          console.warn(`[swap-card] copy regen failed: ${e.message}`);
        }

        console.log(`  🔄 Swapped ${date} card[${cardIndex}]: ${oldCard.name} → ${newCard.name}`);
        saveScheduleFile(schedule);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, schedule }));
      } catch (err) {
        console.error(`[swap-card] failed: ${err.message}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // MJ prompt: distill copy → permutation block. Returns the full prompt to the
  // client; client just copies it to clipboard. Fresh styles per call.
  const mjPromptMatch = req.url?.match(/^\/api\/schedule\/(\d{4}-\d{2}-\d{2})\/(day-plan|tonight-pick|wildcard)\/mj-prompt$/);
  if (req.method === "POST" && mjPromptMatch) {
    const [, date, slotType] = mjPromptMatch;
    (async () => {
      try {
        const schedule = loadSchedule();
        const slot = schedule.days?.[date]?.[slotType];
        if (!slot) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Slot not found" }));
          return;
        }
        const prompt = await buildMjPromptForSlot(slot, slotType);
        console.log(`  🎨 MJ prompt distilled for ${date} ${slotType}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, prompt }));
      } catch (err) {
        console.error(`[mj-prompt] failed: ${err.message}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    })();
    return;
  }

  const scheduleMatch = req.url?.match(/^\/api\/schedule\/(\d{4}-\d{2}-\d{2})\/(day-plan|tonight-pick|wildcard)\/(approve-copy|approve-image|approve-both|regen-image|regen-plan|edit-copy)$/);
  if (req.method === "POST" && scheduleMatch) {
    const [, date, slotType, action] = scheduleMatch;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const schedule = loadSchedule();
        const slot = schedule.days?.[date]?.[slotType];
        if (!slot) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Slot not found" }));
          return;
        }

        if (action === "approve-copy") {
          slot.copyApprovedAt = new Date().toISOString();
          slot.status = "copy-approved";
          console.log(`  ✅ Copy approved: ${date} ${slotType}`);

          // Trigger Recraft image generation — skip if image already approved
          if (slot.imageApprovedAt) {
            console.log(`  ⏭️  Image already approved — keeping existing`);
          } else try {
            const { pickStyle, dayPlanPrompt, buildImagePrompt } = await import("./lib/poster-styles.mjs");
            const { generateAndUpload } = await import("./lib/recraft.mjs");
            let prompt;

            if (slotType === "day-plan" && slot.plan) {
              // Day plan: text-heavy poster with style
              const style = await pickStyle();
              prompt = dayPlanPrompt(slot.plan, date, style.style);
              console.log(`  🎨 Generating day plan poster (${style.id})...`);
              const pathname = `posters/${date}-${slotType}.png`;
              const { url } = await generateAndUpload({ prompt, pathname, colors: style.colors || undefined });
              slot.imageUrl = url;
              slot.imageStyle = style.id;
            } else {
              // Tonight pick / wildcard: abstract design, no text, no people
              const postCopy = slot.copy?.x || "";
              const category = slot.item?.category || "";
              prompt = await buildImagePrompt(postCopy, category);
              console.log(`  🎨 Generating abstract image for ${slotType}...`);
              const pathname = `posters/${date}-${slotType}.png`;
              const { url } = await generateAndUpload({ prompt, pathname });
              slot.imageUrl = url;
              slot.imageStyle = "abstract";
            }
            slot.imagePrompt = prompt;
            console.log(`  ✅ Image generated: ${slot.imageUrl.slice(0, 80)}`);
          } catch (err) {
            console.error(`  ⚠️  Recraft generation failed: ${err.message}`);
          }

          saveScheduleFile(schedule);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, schedule }));
          return;
        }

        if (action === "approve-image") {
          slot.imageApprovedAt = new Date().toISOString();
          slot.status = "image-approved";
          console.log(`  ✅ Image approved: ${date} ${slotType}`);

          // Log acceptance to feedback loop
          try {
            const { logFeedback } = await import("./lib/recraft-feedback.mjs");
            logFeedback({ date, slot: slotType, style: slot.imageStyle || "unknown", prompt: slot.imagePrompt || "", outcome: "approved" });
            console.log(`  📊 Logged image approval: ${date} ${slotType} (${slot.imageStyle})`);
          } catch {}

          saveScheduleFile(schedule);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, schedule }));
          return;
        }

        if (action === "approve-both") {
          const now = new Date().toISOString();
          if (!slot.copyApprovedAt) {
            slot.copyApprovedAt = now;
            console.log(`  ✅ Copy approved: ${date} ${slotType}`);

            // Generate image if none exists (same logic as approve-copy)
            if (!slot.imageUrl) {
              try {
                const { pickStyle, dayPlanPrompt, buildImagePrompt } = await import("./lib/poster-styles.mjs");
                const { generateAndUpload } = await import("./lib/recraft.mjs");
                const pathname = `posters/${date}-${slotType}-${Date.now()}.png`;
                if (slotType === "day-plan" && slot.plan) {
                  const style = await pickStyle();
                  const prompt = dayPlanPrompt(slot.plan, date, style.style);
                  const { url } = await generateAndUpload({ prompt, pathname, colors: style.colors || undefined });
                  slot.imageUrl = url;
                  slot.imageStyle = style.id;
                  slot.imagePrompt = prompt;
                } else {
                  const prompt = await buildImagePrompt(slot.copy?.x || "", slot.item?.category || "");
                  const { url } = await generateAndUpload({ prompt, pathname });
                  slot.imageUrl = url;
                  slot.imageStyle = "abstract";
                  slot.imagePrompt = prompt;
                }
                console.log(`  🎨 Image generated: ${slot.imageUrl.slice(0, 60)}`);
              } catch (err) {
                console.error(`  ⚠️  Image gen failed: ${err.message}`);
              }
            }
          }
          if (slot.imageUrl) {
            slot.imageApprovedAt = now;

            // Log acceptance to feedback loop
            try {
              const { logFeedback } = await import("./lib/recraft-feedback.mjs");
              logFeedback({ date, slot: slotType, style: slot.imageStyle || "unknown", prompt: slot.imagePrompt || "", outcome: "approved" });
              console.log(`  📊 Logged image approval: ${date} ${slotType} (${slot.imageStyle})`);
            } catch {}
          }
          slot.status = slot.imageApprovedAt ? "image-approved" : "copy-approved";
          console.log(`  ✅ Both approved: ${date} ${slotType}`);
          saveScheduleFile(schedule);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, schedule }));
          return;
        }

        if (action === "regen-image") {
          // Log rejection of the current image before generating a new one
          try {
            const { logFeedback } = await import("./lib/recraft-feedback.mjs");
            if (slot.imageUrl) {
              logFeedback({ date, slot: slotType, style: slot.imageStyle || "unknown", prompt: slot.imagePrompt || "", outcome: "rejected" });
              console.log(`  📊 Logged image rejection: ${date} ${slotType} (${slot.imageStyle})`);
            }
          } catch {}

          try {
            const { pickStyle, dayPlanPrompt, buildImagePrompt } = await import("./lib/poster-styles.mjs");
            const { generateAndUpload } = await import("./lib/recraft.mjs");
            let prompt;
            const pathname = `posters/${date}-${slotType}-${Date.now()}.png`;

            if (slotType === "day-plan" && slot.plan) {
              const style = await pickStyle();
              prompt = dayPlanPrompt(slot.plan, date, style.style);
              console.log(`  🎨 Regenerating day plan poster (${style.id})...`);
              const { url } = await generateAndUpload({ prompt, pathname, colors: style.colors || undefined });
              slot.imageUrl = url;
              slot.imageStyle = style.id;
            } else {
              const postCopy = slot.copy?.x || "";
              const category = slot.item?.category || "";
              prompt = await buildImagePrompt(postCopy, category);
              console.log(`  🎨 Regenerating abstract image for ${slotType}...`);
              const { url } = await generateAndUpload({ prompt, pathname });
              slot.imageUrl = url;
              slot.imageStyle = "abstract";
            }
            slot.imagePrompt = prompt;
            slot.imageApprovedAt = null; // reset approval on regen
            console.log(`  ✅ Image regenerated: ${slot.imageUrl.slice(0, 80)}`);
          } catch (err) {
            console.error(`  ⚠️  Recraft regeneration failed: ${err.message}`);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err.message }));
            return;
          }
          saveScheduleFile(schedule);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, schedule }));
          return;
        }

        if (action === "regen-plan") {
          // Regenerate the day plan via the live plan API for this date
          if (slotType !== "day-plan") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "regen-plan only works for day-plan slots" }));
            return;
          }
          try {
            const city = slot.city || "san-jose";
            // Collect every other day-plan card name as a block list — without
            // this, regen-plan keeps re-picking the same Greek dinner spot
            // (Dio Deka on 4/29 + 5/2 + 5/3) because the cross-day dedup
            // that lives in generate-schedule's main loop never reaches here.
            const blockedNames = [];
            for (const [otherDate, otherDay] of Object.entries(schedule.days || {})) {
              if (otherDate === date) continue;
              for (const card of (otherDay?.["day-plan"]?.plan?.cards || [])) {
                if (card.name) blockedNames.push(card.name);
              }
            }
            console.log(`  🔄 Regenerating plan for ${city} on ${date} (blocking ${blockedNames.length} cross-day picks)...`);
            const planRes = await fetch(`${PLAN_API_BASE}/api/plan-day`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ city, kids: false, currentHour: 9, planDate: date, blockedNames }),
              signal: AbortSignal.timeout(30000),
            });
            if (!planRes.ok) throw new Error(`Plan API returned ${planRes.status}`);
            const planData = await planRes.json();
            if (!planData.cards?.length) throw new Error("Plan API returned empty plan");

            // Enrich missing venue photos (for in-app plan page display)
            const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
            const placesKey = process.env.GOOGLE_PLACES_API_KEY;
            if (placesKey) {
              for (const card of planData.cards) {
                if (card.photoRef) continue;
                const name = card.venue || card.name;
                if (!name) continue;
                try {
                  const query = card.city ? `${name} ${card.city.replace(/-/g, " ")}` : name;
                  const pRes = await fetch(PLACES_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": placesKey, "X-Goog-FieldMask": "places.photos" },
                    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
                    signal: AbortSignal.timeout(8000),
                  });
                  if (pRes.ok) {
                    const pData = await pRes.json();
                    const ref = pData.places?.[0]?.photos?.[0]?.name;
                    if (ref) card.photoRef = ref;
                  }
                  await new Promise(r => setTimeout(r, 300));
                } catch {}
              }
            }

            // Save to shared-plans.json
            const planId = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, "0")).join("");
            const entry = {
              cards: canonicalizePlanCards(planData.cards),
              city, kids: false, weather: planData.weather,
              planDate: date, createdAt: new Date().toISOString(),
            };
            // Fail loud if shared-plans.json can't be read/parsed — silently
            // falling back to {} would clobber every existing plan (happened
            // 2026-04-25: 910 plans erased when a regen race tripped this path).
            let sharedPlans;
            if (existsSync(SHARED_PLANS_FILE)) {
              try {
                sharedPlans = JSON.parse(readFileSync(SHARED_PLANS_FILE, "utf8"));
              } catch (parseErr) {
                throw new Error(`shared-plans.json exists but failed to parse — refusing to clobber: ${parseErr.message}`);
              }
              if (!sharedPlans || typeof sharedPlans !== "object" || Array.isArray(sharedPlans)) {
                throw new Error(`shared-plans.json parsed to ${typeof sharedPlans} (not an object) — refusing to clobber`);
              }
            } else {
              sharedPlans = {};
            }
            sharedPlans[planId] = entry;
            // Atomic write: stage to temp file then rename, so a crashed write never leaves an empty/partial file.
            const tmpPath = SHARED_PLANS_FILE + ".tmp";
            writeFileSync(tmpPath, JSON.stringify(sharedPlans, null, 2) + "\n");
            renameSync(tmpPath, SHARED_PLANS_FILE);

            const planUrl = `https://southbaytoday.org/plan/${planId}`;

            // Regenerate copy with the new plan
            const copy = await generateDayPlanCopy(planData, date, planUrl);

            slot.plan = { cards: planData.cards, weather: planData.weather };
            slot.planUrl = planUrl;
            slot.copy = copy;
            slot.copyApprovedAt = null;
            slot.imageUrl = null;
            slot.imageApprovedAt = null;
            slot.status = "draft";
            slot.generatedAt = new Date().toISOString();
            console.log(`  ✅ Plan regenerated: ${planData.cards.length} stops → ${planUrl}`);

            // Auto-commit+push shared-plans.json so the plan URL works on prod
            try {
              const repoRoot = join(__dirname, "..", "..");
              const { execSync } = await import("node:child_process");
              const opts = { cwd: repoRoot, stdio: "pipe" };
              execSync("git add src/data/south-bay/shared-plans.json", opts);
              execSync('git commit -m "data: update shared plans from schedule regen"', opts);
              // Pull first in case remote is ahead, then push
              try { execSync("git stash", opts); } catch {}
              try { execSync("git pull --rebase origin main", opts); } catch {}
              try { execSync("git stash pop", opts); } catch {}
              execSync("git push origin main", opts);
              console.log("  📎 shared-plans.json committed and pushed");
            } catch (e) {
              console.warn(`  ⚠️  Failed to auto-push shared-plans.json: ${e.message}`);
            }
          } catch (err) {
            console.error(`  ⚠️  Regen plan failed: ${err.message}`);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err.message }));
            return;
          }
          saveScheduleFile(schedule);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, schedule }));
          return;
        }

        if (action === "save-copy") {
          const params = JSON.parse(body || "{}");
          const { platform, text } = params;
          if (!platform || typeof text !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Missing platform or text" }));
            return;
          }
          if (!slot.copy) slot.copy = {};
          slot.copy[platform] = text;
          // Manual edits reset approval state so the image regen picks up new copy.
          slot.copyApprovedAt = null;
          if (slot.status !== "rejected") slot.status = "draft";
          console.log(`  ✏️  Copy saved: ${date} ${slotType} ${platform} (${text.length} chars)`);
          saveScheduleFile(schedule);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, schedule }));
          return;
        }

        if (action === "edit-copy") {
          const params = JSON.parse(body || "{}");
          if (!params.instructions) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Missing instructions" }));
            return;
          }
          try {
            const rewritten = await rewriteCopyWithEdits(slot.copy, params.instructions, slot.item || {});
            slot.copy = rewritten;
            slot.copyApprovedAt = null; // reset approval after edit
            slot.status = "draft";
            console.log(`  ✏️  Copy edited: ${date} ${slotType}`);
          } catch (err) {
            console.error(`  ⚠️  Edit failed: ${err.message}`);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err.message }));
            return;
          }
          saveScheduleFile(schedule);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, schedule }));
          return;
        }

        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Unknown action" }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── Engagement dashboard ─────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/api/engagement") {
    const data = loadEngagement();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data || { lastUpdated: null, posts: [], totals: { likes: 0, reposts: 0, quotes: 0, replies: 0 }, postCount: 0 }));
    return;
  }

  if (req.method === "GET" && req.url === "/engagement") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(ENGAGEMENT_HTML);
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(HTML);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

server.listen(PORT, () => {
  const posts = loadPendingPosts();
  const queue = loadQueue();
  console.log(`\n🗳️  Social Copy Review: http://localhost:${PORT}`);
  console.log(`   ${posts.length} drafts to review`);
  console.log(`   ${queue.length} in approved queue`);
  console.log(`   ← skip  |  approve →  |  Tab for comment box\n`);
});
