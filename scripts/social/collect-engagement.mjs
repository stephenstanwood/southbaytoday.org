#!/usr/bin/env /opt/homebrew/bin/node
// ---------------------------------------------------------------------------
// South Bay Today — Engagement Collector
// Walks every recently-published post on every platform and records:
//   • likes / favourites (count + actors where API allows)
//   • reposts / boosts / shares (count + actors where API allows)
//   • quotes / quote-tweets (count + actor + text where API allows)
//   • replies / comments (count + author + text)
//   • mentions (Bluesky / Mastodon / X)
//
// Output: src/data/south-bay/social-engagement.json
// Powers the unified "Engagement" dashboard at /engagement on the review server.
//
// Usage: node scripts/social/collect-engagement.mjs [--dry-run] [--days=14]
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-approved-queue.json");
const SCHEDULE_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-schedule.json");
const PUBLISH_LOG = "/tmp/sbt-publish.log";
const PUBLISH_LOG_ALT = "/tmp/sbs-publish.log";
const OUT_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-engagement.json");

const BSKY_API = "https://bsky.social/xrpc";
const THREADS_API = "https://graph.threads.net/v1.0";
const FB_API = "https://graph.facebook.com/v25.0";
const X_API = "https://api.twitter.com";
const IG_API = "https://graph.instagram.com/v25.0";
const MASTODON_INSTANCE = process.env.MASTODON_INSTANCE || "https://mastodon.social";
const MASTODON_API = `${MASTODON_INSTANCE}/api/v1`;
const PINTEREST_API = "https://api.pinterest.com/v5";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const daysArg = args.find((a) => a.startsWith("--days="));
const LOOKBACK_DAYS = daysArg ? Number(daysArg.split("=")[1]) || 30 : 30;

// Load .env.local if present (idempotent — launchd already passes --env-file)
try {
  const envPath = join(__dirname, "..", "..", ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Load posts ───────────────────────────────────────────────────────────

function platformKeys(publishedTo) {
  // Dedup by actual platform post IDs — these are stable across schedule/log/queue
  // sources, unlike postKey which uses timestamp + title (drifts by seconds).
  return (publishedTo || [])
    .filter((e) => e.ok)
    .map((e) => `${e.platform}:${e.uri || e.postId || e.id || ""}`)
    .filter((k) => k.length > k.indexOf(":") + 1);
}

function loadRecentPublished() {
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const out = [];
  const seen = new Set();
  const seenPlatformIds = new Set();

  function addIfNew(p) {
    const pkey = postKey(p);
    if (seen.has(pkey)) return false;
    const platIds = platformKeys(p.publishedTo);
    if (platIds.some((k) => seenPlatformIds.has(k))) return false;
    seen.add(pkey);
    platIds.forEach((k) => seenPlatformIds.add(k));
    out.push(p);
    return true;
  }

  // 1) Queue-style entries (older publish path).
  if (existsSync(QUEUE_FILE)) {
    const queue = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
    for (const p of queue) {
      if (!p.published || !p.publishedAt) continue;
      if (p.publishResult && p.publishResult !== "ok") continue;
      if (!Array.isArray(p.publishedTo) || !p.publishedTo.length) continue;
      if (new Date(p.publishedAt).getTime() < cutoff) continue;
      addIfNew(p);
    }
  }

  // 2) Schedule-style entries (current publish path: publish-from-queue mints
  // a post from the day's slot and stashes publishedTo back on the slot).
  if (existsSync(SCHEDULE_FILE)) {
    const schedule = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
    for (const [date, day] of Object.entries(schedule.days || {})) {
      for (const [slotType, slot] of Object.entries(day || {})) {
        if (slotType.startsWith("_")) continue;
        if (!slot || slot.status !== "published" || !slot.publishedAt) continue;
        if (!Array.isArray(slot.publishedTo) || !slot.publishedTo.length) continue;
        if (new Date(slot.publishedAt).getTime() < cutoff) continue;
        const item = slot.item || { title: slot.cityName ? `${slot.cityName} Day Plan` : slot.slotType };
        const synthetic = {
          item,
          publishedAt: slot.publishedAt,
          publishedTo: slot.publishedTo,
          targetUrl: slot.planUrl || item.url || null,
          generatedAt: slot.generatedAt,
          approvedAt: slot.copyApprovedAt || slot.imageApprovedAt,
          _scheduleSource: { date, slotType },
        };
        addIfNew(synthetic);
      }
    }
  }

  // 3) Tail of the publish log — backfill posts published before the schedule
  // file started stashing publishedTo. Looks for `PUBLISH_SUMMARY:{...}` lines.
  for (const logPath of [PUBLISH_LOG, PUBLISH_LOG_ALT]) {
    if (!existsSync(logPath)) continue;
    let txt;
    try {
      txt = readFileSync(logPath, "utf8");
    } catch {
      continue;
    }
    const lines = txt.split("\n");
    let lastTimestamp = null;
    for (const line of lines) {
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
      if (dateMatch) lastTimestamp = `${dateMatch[1]} ${dateMatch[2]}`;
      if (!line.startsWith("PUBLISH_SUMMARY:")) continue;
      let parsed;
      try {
        parsed = JSON.parse(line.slice("PUBLISH_SUMMARY:".length));
      } catch {
        continue;
      }
      for (const item of parsed.items || []) {
        const publishedAt = lastTimestamp ? new Date(lastTimestamp).toISOString() : new Date().toISOString();
        if (new Date(publishedAt).getTime() < cutoff) continue;
        const publishedTo = Object.entries(item.postIds || {}).map(([platform, id]) => {
          const entry = { platform, ok: true };
          if (platform === "bluesky") {
            entry.uri = id;
            entry.postId = id;
          } else {
            entry.id = id;
            entry.postId = id;
          }
          return entry;
        });
        if (!publishedTo.length) continue;
        const synthetic = {
          item: { title: item.title, url: null },
          publishedAt,
          publishedTo,
          targetUrl: null,
          _logSource: true,
        };
        addIfNew(synthetic);
      }
    }
  }

  return out;
}

function postKey(p) {
  // Stable per-post identifier across runs. Prefer approvedAt + title; fall back to publishedAt.
  const t = p.item?.title || "untitled";
  const stamp = p.approvedAt || p.publishedAt || p.generatedAt;
  return `${stamp}|${t}`.slice(0, 240);
}

// ── Bluesky ──────────────────────────────────────────────────────────────

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
  if (!res.ok) throw new Error(`Bluesky auth ${res.status}: ${await res.text()}`);
  _bskySession = await res.json();
  return _bskySession;
}

function bskyPermalink(uri) {
  const parts = uri.split("/");
  return `https://bsky.app/profile/${parts[2]}/post/${parts[parts.length - 1]}`;
}

async function bskyPaged(path, params, token, key) {
  const out = [];
  let cursor;
  for (let i = 0; i < 5; i++) {
    const qs = new URLSearchParams({ ...params, limit: "100", ...(cursor ? { cursor } : {}) });
    const res = await fetch(`${BSKY_API}/${path}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    if (Array.isArray(data[key])) out.push(...data[key]);
    cursor = data.cursor;
    if (!cursor) break;
    await sleep(150);
  }
  return out;
}

async function fetchBlueskyEngagement(uri, ownReplies = []) {
  const session = await bskySession();
  const token = session.accessJwt;
  const ownHandle = (process.env.BLUESKY_HANDLE || "").toLowerCase();
  const ownUriSet = new Set(ownReplies);

  // Likes
  const likesRaw = await bskyPaged("app.bsky.feed.getLikes", { uri }, token, "likes");
  const likes = likesRaw.map((l) => ({
    author: l.actor?.handle || "unknown",
    displayName: l.actor?.displayName || null,
    at: l.createdAt || l.indexedAt || null,
    profile: l.actor?.handle ? `https://bsky.app/profile/${l.actor.handle}` : null,
  }));

  // Reposts
  const repostsRaw = await bskyPaged("app.bsky.feed.getRepostedBy", { uri }, token, "repostedBy");
  const reposts = repostsRaw.map((a) => ({
    author: a.handle || "unknown",
    displayName: a.displayName || null,
    profile: a.handle ? `https://bsky.app/profile/${a.handle}` : null,
  }));

  // Quote posts
  const quotesRaw = await bskyPaged("app.bsky.feed.getQuotes", { uri }, token, "posts");
  const quotes = quotesRaw.map((p) => ({
    author: p.author?.handle || "unknown",
    displayName: p.author?.displayName || null,
    at: p.record?.createdAt || p.indexedAt || null,
    text: p.record?.text || "",
    permalink: bskyPermalink(p.uri),
  }));

  // Replies (depth 6 captures nested)
  const threadRes = await fetch(
    `${BSKY_API}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=6`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const replies = [];
  if (threadRes.ok) {
    const data = await threadRes.json();
    const walk = (node) => {
      for (const r of node?.replies || []) {
        const post = r?.post;
        if (post) {
          // Exclude our own replies (URL self-reply + bucket-thread replies)
          // from the engagement tally so Social Signal shows real audience
          // engagement, not publisher noise. Belt + suspenders: filter by
          // author handle AND by the tracked URI set from publish-from-queue.
          const replyAuthor = (post.author?.handle || "").toLowerCase();
          const isOwn =
            (ownHandle && replyAuthor === ownHandle) || ownUriSet.has(post.uri);
          if (!isOwn) {
            replies.push({
              author: post.author?.handle || "unknown",
              displayName: post.author?.displayName || null,
              at: post.record?.createdAt || post.indexedAt || null,
              text: post.record?.text || "",
              permalink: bskyPermalink(post.uri),
            });
          }
        }
        if (r?.replies?.length) walk(r);
      }
    };
    walk(data.thread);
  }

  return {
    counts: { likes: likes.length, reposts: reposts.length, quotes: quotes.length, replies: replies.length },
    likes,
    reposts,
    quotes,
    replies,
  };
}

// ── Threads ──────────────────────────────────────────────────────────────

async function fetchThreadsEngagement(mediaId) {
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) return null;

  // Insights (count metrics)
  let counts = { likes: 0, reposts: 0, quotes: 0, replies: 0, views: 0 };
  try {
    const insightFields = "likes,replies,reposts,quotes,views";
    const r = await fetch(
      `${THREADS_API}/${mediaId}/insights?metric=${insightFields}&access_token=${token}`
    );
    if (r.ok) {
      const data = await r.json();
      for (const m of data.data || []) {
        const v = m.values?.[0]?.value ?? 0;
        if (m.name === "likes") counts.likes = v;
        else if (m.name === "replies") counts.replies = v;
        else if (m.name === "reposts") counts.reposts = v;
        else if (m.name === "quotes") counts.quotes = v;
        else if (m.name === "views") counts.views = v;
      }
    }
  } catch {}

  // Reply contents (when permitted)
  const replies = [];
  let repliesFetched = false;
  try {
    const fields = "id,text,username,timestamp,permalink,is_reply_owned_by_me";
    const r = await fetch(
      `${THREADS_API}/${mediaId}/replies?fields=${fields}&access_token=${token}`
    );
    if (r.ok) {
      repliesFetched = true;
      const data = await r.json();
      for (const reply of data.data || []) {
        if (reply.is_reply_owned_by_me) continue;
        replies.push({
          author: reply.username || "unknown",
          at: reply.timestamp || null,
          text: reply.text || "",
          permalink: reply.permalink || null,
        });
      }
    }
  } catch {}

  // Insights.replies counts EVERY reply including our own URL/seed self-
  // replies. The replies array filters those out via is_reply_owned_by_me,
  // so re-derive the count from the filtered array. Only override when the
  // array fetch actually succeeded — a transient 5xx shouldn't zero the
  // count we got from insights.
  if (repliesFetched) counts.replies = replies.length;

  return {
    counts,
    likes: [], // Threads API doesn't expose actors
    reposts: [],
    quotes: [],
    replies,
  };
}

// ── X (Twitter) ──────────────────────────────────────────────────────────

function xPercentEncode(str) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function xMakeOAuthHeader(method, url, queryParams = [], creds) {
  const oauthParams = [
    ["oauth_consumer_key", creds.apiKey],
    ["oauth_nonce", randomBytes(16).toString("hex")],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", Math.floor(Date.now() / 1000).toString()],
    ["oauth_token", creds.accessToken],
    ["oauth_version", "1.0"],
  ];
  const allParams = [...oauthParams, ...queryParams];
  const sorted = [...allParams].sort((a, b) => a[0].localeCompare(b[0]));
  const paramStr = sorted.map(([k, v]) => `${xPercentEncode(k)}=${xPercentEncode(v)}`).join("&");
  const baseString = `${method.toUpperCase()}&${xPercentEncode(url)}&${xPercentEncode(paramStr)}`;
  const key = `${xPercentEncode(creds.apiSecret)}&${xPercentEncode(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", key).update(baseString).digest("base64");
  oauthParams.push(["oauth_signature", signature]);
  return (
    "OAuth " +
    oauthParams.map(([k, v]) => `${xPercentEncode(k)}="${xPercentEncode(v)}"`).join(", ")
  );
}

function getXCreds() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) return null;
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

async function xGet(url, queryParams, creds) {
  const auth = xMakeOAuthHeader("GET", url, queryParams, creds);
  const qs = queryParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const res = await fetch(qs ? `${url}?${qs}` : url, { headers: { Authorization: auth } });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`X ${url} ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchXEngagement(tweetId, creds, ownReplies = []) {
  let counts = { likes: 0, reposts: 0, quotes: 0, replies: 0, impressions: 0 };
  let bookmarks = 0;

  // Counts via public_metrics on the tweet itself (free tier)
  try {
    const data = await xGet(
      `${X_API}/2/tweets/${tweetId}`,
      [["tweet.fields", "public_metrics,non_public_metrics"]],
      creds
    );
    const pm = data.data?.public_metrics || {};
    counts.likes = pm.like_count ?? 0;
    counts.reposts = pm.retweet_count ?? 0;
    counts.quotes = pm.quote_count ?? 0;
    counts.replies = pm.reply_count ?? 0;
    // X's free-tier API only returns reply COUNT, not individual replies, so
    // we can't filter by author. Instead the publisher persists the IDs of
    // every reply we authored (URL self-reply + seed reply) on the published
    // entry; subtract that here. Clamp at 0 in case of state drift.
    if (ownReplies.length && counts.replies > 0) {
      counts.replies = Math.max(0, counts.replies - ownReplies.length);
    }
    bookmarks = pm.bookmark_count ?? 0;
    counts.impressions = pm.impression_count ?? data.data?.non_public_metrics?.impression_count ?? 0;
  } catch (err) {
    if (err.status === 429 || err.status === 403) {
      // Rate-limited or paid-tier endpoint — counts unavailable this run.
    } else {
      console.log(`   x: tweet ${tweetId} metrics failed: ${err.message}`);
    }
  }

  // Quote tweets (free up to a limit; fall back gracefully)
  const quotes = [];
  try {
    const data = await xGet(
      `${X_API}/2/tweets/${tweetId}/quote_tweets`,
      [
        ["max_results", "20"],
        ["tweet.fields", "created_at,author_id,text"],
        ["expansions", "author_id"],
        ["user.fields", "username,name"],
      ],
      creds
    );
    const userMap = new Map((data.includes?.users || []).map((u) => [u.id, u]));
    for (const t of data.data || []) {
      const u = userMap.get(t.author_id);
      quotes.push({
        author: u?.username || t.author_id,
        displayName: u?.name || null,
        at: t.created_at || null,
        text: t.text || "",
        permalink: `https://x.com/${u?.username || "i"}/status/${t.id}`,
      });
    }
  } catch (err) {
    if (err.status !== 429 && err.status !== 403) {
      console.log(`   x: quote_tweets ${tweetId} failed: ${err.message}`);
    }
  }

  // Replies (search the conversation; uses recent search — free tier limited)
  // We skip this for now (X's recent-search reply endpoint requires a paid tier).

  return { counts, bookmarks, likes: [], reposts: [], quotes, replies: [] };
}

// ── Instagram ────────────────────────────────────────────────────────────

async function fetchInstagramEngagement(mediaId, shortcode, tokenOverride) {
  const token = tokenOverride || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return null;
  // SBT IG token is from the IG-app (graph.instagram.com); HHSS IG token is
  // FB-Page-derived (graph.facebook.com). The two APIs reject each other's
  // tokens with "Cannot parse access token", so route accordingly.
  const apiBase = tokenOverride ? FB_API : IG_API;

  let counts = { likes: 0, reposts: 0, quotes: 0, replies: 0 };
  try {
    const r = await fetch(
      `${apiBase}/${mediaId}?fields=like_count,comments_count&access_token=${token}`
    );
    if (r.ok) {
      const data = await r.json();
      counts.likes = data.like_count ?? 0;
      counts.replies = data.comments_count ?? 0;
    }
  } catch {}

  const replies = [];
  try {
    const r = await fetch(
      `${apiBase}/${mediaId}/comments?fields=id,text,username,timestamp&access_token=${token}`
    );
    if (r.ok) {
      const data = await r.json();
      for (const c of data.data || []) {
        replies.push({
          author: c.username || "unknown",
          at: c.timestamp || null,
          text: c.text || "",
          permalink: `https://www.instagram.com/p/${shortcode || mediaId}/`,
        });
      }
    }
  } catch {}

  return { counts, likes: [], reposts: [], quotes: [], replies };
}

// ── Mastodon ─────────────────────────────────────────────────────────────

async function mastoPaged(url, headers) {
  const out = [];
  let next = url;
  for (let i = 0; i < 5 && next; i++) {
    const r = await fetch(next, { headers });
    if (!r.ok) break;
    out.push(...(await r.json()));
    const link = r.headers.get("link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
    if (next) await sleep(150);
  }
  return out;
}

async function fetchMastodonEngagement(statusId) {
  const token = process.env.MASTODON_ACCESS_TOKEN;
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}` };

  // Status itself for counts
  let counts = { likes: 0, reposts: 0, quotes: 0, replies: 0 };
  try {
    const r = await fetch(`${MASTODON_API}/statuses/${statusId}`, { headers });
    if (r.ok) {
      const s = await r.json();
      counts.likes = s.favourites_count ?? 0;
      counts.reposts = s.reblogs_count ?? 0;
      counts.replies = s.replies_count ?? 0;
    }
  } catch {}

  // Favourited by
  const likesRaw = await mastoPaged(`${MASTODON_API}/statuses/${statusId}/favourited_by?limit=80`, headers);
  const likes = likesRaw.map((a) => ({
    author: a.acct || a.username,
    displayName: a.display_name || null,
    profile: a.url || null,
  }));

  // Reblogged by
  const reblogsRaw = await mastoPaged(`${MASTODON_API}/statuses/${statusId}/reblogged_by?limit=80`, headers);
  const reposts = reblogsRaw.map((a) => ({
    author: a.acct || a.username,
    displayName: a.display_name || null,
    profile: a.url || null,
  }));

  // Replies (descendants)
  const replies = [];
  try {
    const r = await fetch(`${MASTODON_API}/statuses/${statusId}/context`, { headers });
    if (r.ok) {
      const ctx = await r.json();
      const ourAccount = process.env.MASTODON_ACCOUNT_ID;
      for (const d of ctx.descendants || []) {
        if (ourAccount && d.account?.id === ourAccount) continue;
        replies.push({
          author: d.account?.acct || d.account?.username || "unknown",
          displayName: d.account?.display_name || null,
          at: d.created_at || null,
          text: (d.content || "").replace(/<[^>]+>/g, ""),
          permalink: d.url || d.uri || null,
        });
      }
    }
  } catch {}

  return { counts, likes, reposts, quotes: [], replies };
}

// ── Orchestrator ────────────────────────────────────────────────────────

/**
 * Pinterest analytics for a single pin. Pinterest's engagement model is
 * fundamentally different from feed platforms — saves (durable), pin clicks
 * (image taps), outbound clicks (the gold metric — taps to our destination),
 * and impressions (reach). We map saves → counts.likes so the dashboard's
 * cross-platform "likes" total stays meaningful, and expose the full
 * Pinterest-specific shape under `pinterestMetrics` for an expanded view.
 *
 * Gracefully returns zeros (with a `_engagementBlocked` flag) if the token
 * is read-only and the analytics endpoint is gated.
 */
async function fetchPinterestEngagement(pinId) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) return null;

  // Pinterest analytics endpoint wants a start/end date range. We pull
  // "last 30 days" — covers our recent-post window and Pinterest's pin
  // metrics start day-1 anyway.
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const url = `${PINTEREST_API}/pins/${encodeURIComponent(pinId)}/analytics`
    + `?start_date=${fmt(start)}&end_date=${fmt(end)}`
    + `&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    // 403 = wrong scope (read-only token before write-scope upgrade);
    // 404 = pin deleted by Stephen. Both are "no data" — return a
    // structured "blocked" record so the dashboard knows we tried.
    return {
      counts: { likes: 0, reposts: 0, quotes: 0, replies: 0 },
      _engagementBlocked: true,
      _blockReason: `Pinterest analytics ${res.status}`,
      pinterestMetrics: { saves: 0, pinClicks: 0, outboundClicks: 0, impressions: 0 },
    };
  }

  const data = await res.json();
  // Pinterest analytics response shape: { all: { lifetime_metrics: {...},
  // daily_metrics: [...] } } when summary_status=true (the default).
  const lifetime = data.all?.lifetime_metrics || data.lifetime_metrics || data;
  const saves         = Number(lifetime.SAVE          ?? lifetime.save          ?? 0) || 0;
  const pinClicks     = Number(lifetime.PIN_CLICK     ?? lifetime.pin_click     ?? 0) || 0;
  const outboundClicks= Number(lifetime.OUTBOUND_CLICK?? lifetime.outbound_click?? 0) || 0;
  const impressions   = Number(lifetime.IMPRESSION    ?? lifetime.impression    ?? 0) || 0;

  return {
    // Map saves → likes so the dashboard's cross-platform totals stay
    // numerically meaningful — saves are the most-comparable engagement
    // signal across platforms.
    counts: { likes: saves, reposts: 0, quotes: 0, replies: 0 },
    pinterestMetrics: { saves, pinClicks, outboundClicks, impressions },
  };
}

async function processPost(post, xCreds) {
  const platforms = {};
  const brand = post._brand || "SBT";
  const igToken = post._igToken;

  for (const entry of post.publishedTo || []) {
    if (!entry.ok) continue;
    const id = entry.postId || entry.id || entry.uri;
    if (!id) continue;


    try {
      let result = null;
      let permalink = null;

      switch (entry.platform) {
        case "bluesky": {
          const uri = entry.uri || entry.postId;
          if (!uri) break;
          permalink = bskyPermalink(uri);
          result = await fetchBlueskyEngagement(uri, entry.ownReplies || []);
          break;
        }
        case "threads": {
          permalink = `https://www.threads.net/@southbaytoday/post/${id}`;
          result = await fetchThreadsEngagement(id);
          break;
        }
        case "facebook": break; // FB hidden from dashboard — Meta App Review walls off pages_read_engagement
        case "x": {
          if (!xCreds) break;
          permalink = `https://x.com/southbaytoday/status/${id}`;
          result = await fetchXEngagement(id, xCreds, entry.ownReplies || []);
          break;
        }
        case "instagram": {
          permalink = `https://www.instagram.com/p/${entry.shortcode || id}/`;
          result = await fetchInstagramEngagement(id, entry.shortcode, igToken);
          break;
        }
        case "mastodon": {
          permalink = `${MASTODON_INSTANCE}/@southbaytoday/${id}`;
          result = await fetchMastodonEngagement(id);
          break;
        }
        case "pinterest": {
          permalink = `https://www.pinterest.com/pin/${encodeURIComponent(id)}/`;
          result = await fetchPinterestEngagement(id);
          break;
        }
      }

      if (result) {
        platforms[entry.platform] = {
          id,
          permalink,
          ...result,
        };
      }
    } catch (err) {
      console.log(`   ${brand}/${entry.platform} ${id}: ${err.message}`);
    }
  }


  // Upstream publisher bug emits "null Day Plan" / "null Tonight Pick" when
  // cityName is missing — sanitize before storing.
  let title = post.item?.title || "Untitled";
  title = title.replace(/^null\s+/i, "").replace(/\s+null\s+/g, " ").trim() || "Untitled";

  const result = {
    key: `${brand}|${postKey(post)}`,
    brand,
    title,
    publishedAt: post.publishedAt,
    targetUrl: post.targetUrl || post.item?.url || null,
    cardPath: post.cardPath || null,
    platforms,
  };
  // HHSS cross-posts to FB; expose the FB permalink so the dashboard can
  // surface a small deep-link icon next to the IG pill. We deliberately don't
  // poll FB engagement (Meta App Review wall) — link-only.
  if (post._fbPermalink) result.fbPermalink = post._fbPermalink;
  return result;
}

// ── HHSS: enumerate posts directly from IG account ──────────────────────
// HHSS doesn't go through the SBT publish queue. FB is hidden from the
// dashboard, so we only pull IG.

async function loadHHSSPosts() {
  const igToken = process.env.HHSS_IG_ACCESS_TOKEN;
  const igUserId = process.env.HHSS_IG_USER_ID || "17841437664741474";
  const fbPageId = process.env.HHSS_FB_PAGE_ID;
  const fbPageToken = process.env.HHSS_FB_PAGE_ACCESS_TOKEN;

  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const out = [];

  if (!igToken) {
    console.log("   HHSS/instagram: skipped (no HHSS_IG_ACCESS_TOKEN)");
    return out;
  }

  // 1) Fetch FB page feed first so we can attach a cross-post permalink to
  //    each IG entry. We don't poll FB engagement (Meta App Review wall on
  //    pages_read_engagement) — this is link-only so the dashboard can deep-
  //    link to the matching FB post next to the IG pill.
  let fbPosts = [];
  if (fbPageId && fbPageToken) {
    try {
      const r = await fetch(
        `${FB_API}/${fbPageId}/posts?fields=id,created_time,permalink_url&limit=50&access_token=${fbPageToken}`
      );
      if (r.ok) {
        const data = await r.json();
        fbPosts = (data.data || [])
          .filter((p) => p.permalink_url && p.created_time)
          .map((p) => ({ ts: new Date(p.created_time).getTime(), url: p.permalink_url }));
      } else {
        const body = await r.text();
        console.log(`   HHSS/facebook (link-only): feed fetch failed (${r.status}) ${body.slice(0, 120)}`);
      }
    } catch (err) {
      console.log(`   HHSS/facebook (link-only): ${err.message}`);
    }
  }
  // Find the FB post whose created_time is within ±5 min of the IG timestamp.
  // Cross-posts from IG to FB land within seconds in practice; widening to
  // 5 min covers manual-cross-post lag without false positives.
  const FB_MATCH_WINDOW_MS = 5 * 60 * 1000;
  function fbPermalinkFor(igTimestamp) {
    if (!fbPosts.length) return null;
    const target = new Date(igTimestamp).getTime();
    let best = null;
    let bestDelta = FB_MATCH_WINDOW_MS + 1;
    for (const p of fbPosts) {
      const delta = Math.abs(p.ts - target);
      if (delta < bestDelta) {
        best = p;
        bestDelta = delta;
      }
    }
    return bestDelta <= FB_MATCH_WINDOW_MS ? best.url : null;
  }

  try {
    // IG Business uses graph.facebook.com (not graph.instagram.com) when the
    // token is a Page Access Token derived through FB.
    const r = await fetch(
      `${FB_API}/${igUserId}/media?fields=id,caption,timestamp,permalink,shortcode&limit=50&access_token=${igToken}`
    );
    if (r.ok) {
      const data = await r.json();
      for (const m of data.data || []) {
        if (new Date(m.timestamp).getTime() < cutoff) continue;
        out.push({
          item: { title: (m.caption || "Untitled").split("\n")[0].slice(0, 90), url: m.permalink || null },
          publishedAt: m.timestamp,
          publishedTo: [{ platform: "instagram", ok: true, id: m.id, postId: m.id, shortcode: m.shortcode }],
          targetUrl: m.permalink || null,
          _brand: "HHSS",
          _igToken: igToken,
          _fbPermalink: fbPermalinkFor(m.timestamp),
        });
      }
    } else {
      const body = await r.text();
      console.log(`   HHSS/instagram: media fetch failed (${r.status}) ${body.slice(0, 120)}`);
    }
  } catch (err) {
    console.log(`   HHSS/instagram: ${err.message}`);
  }

  return out;
}

// Load prior engagement file so historical posts persist across runs even
// when they fall out of the three live sources. Without this the dashboard
// loses ~everything every morning at 5am, when the daily plist regen
// (regenerate-publish-plist.mjs → launchctl bootout/bootstrap) re-opens
// /tmp/sbs-publish.log in truncate mode.
function loadPriorByKey() {
  if (!existsSync(OUT_FILE)) return new Map();
  try {
    const data = JSON.parse(readFileSync(OUT_FILE, "utf8"));
    const map = new Map();
    for (const entry of data.posts || []) {
      if (entry.key) map.set(entry.key, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

// Re-shape a stored engagement entry back into the "source post" form so we
// can re-poll its platform IDs with processPost.
function priorToSourcePost(entry) {
  const publishedTo = [];
  for (const [platform, info] of Object.entries(entry.platforms || {})) {
    if (!info?.id) continue;
    const e = { platform, ok: true };
    if (platform === "bluesky") {
      e.uri = info.id;
      e.postId = info.id;
    } else {
      e.id = info.id;
      e.postId = info.id;
    }
    if (info.shortcode) e.shortcode = info.shortcode;
    publishedTo.push(e);
  }
  if (!publishedTo.length) return null;
  return {
    item: { title: entry.title || "Untitled", url: entry.targetUrl || null },
    publishedAt: entry.publishedAt,
    publishedTo,
    targetUrl: entry.targetUrl || null,
    cardPath: entry.cardPath || null,
    _brand: entry.brand || "SBT",
    _fbPermalink: entry.fbPermalink || null,
  };
}

async function main() {
  const priorByKey = loadPriorByKey();

  const sbtPosts = loadRecentPublished().map((p) => ({ ...p, _brand: "SBT" }));
  const hhssPosts = await loadHHSSPosts();

  // Reconstruct posts that were captured in a prior run but aren't in the
  // current live sources, and re-poll them. Dedupe by `${brand}|${postKey}`
  // AND by overlapping platform IDs — when timestamp precision drifts between
  // sources (e.g. log-tail minute-aligned vs schedule millisecond) the prior
  // key can linger as a ghost record pointing at the same Bluesky/X/etc post.
  const liveKeys = new Set(
    [...sbtPosts, ...hhssPosts].map((p) => `${p._brand}|${postKey(p)}`)
  );
  const seenPlatformIds = new Set();
  for (const p of [...sbtPosts, ...hhssPosts]) {
    for (const k of platformKeys(p.publishedTo)) seenPlatformIds.add(k);
  }
  const hhssToken = process.env.HHSS_IG_ACCESS_TOKEN;
  const historical = [];
  for (const [key, entry] of priorByKey) {
    if (liveKeys.has(key)) continue;
    const sp = priorToSourcePost(entry);
    if (!sp) continue;
    const platIds = platformKeys(sp.publishedTo);
    if (platIds.some((k) => seenPlatformIds.has(k))) continue;
    platIds.forEach((k) => seenPlatformIds.add(k));
    if (sp._brand === "HHSS" && hhssToken) sp._igToken = hhssToken;
    historical.push(sp);
  }

  const posts = [...sbtPosts, ...hhssPosts, ...historical];
  console.log(
    `engagement: ${posts.length} posts (SBT live=${sbtPosts.length} HHSS live=${hhssPosts.length} retained=${historical.length}, lookback=${LOOKBACK_DAYS}d)`
  );

  const xCreds = getXCreds();
  if (!xCreds) console.log("   x: skipped (no X credentials)");

  // Platforms we deliberately don't poll (Meta App Review wall on FB
  // pages_read_engagement). Don't fall back to prior data for these — keeps
  // the file clean of stale FB engagement.
  const SKIP_FALLBACK = new Set(["facebook"]);

  const out = [];
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const result = await processPost(p, xCreds);

    // Backfill any platform whose fetch failed/skipped this run with the
    // last known engagement data. Otherwise transient errors (X rate-limit,
    // momentary network hiccup) silently zero out the post and may hide it
    // from the dashboard since we filter zero-engagement posts.
    const prior = priorByKey.get(result.key);
    if (prior) {
      for (const [platform, prev] of Object.entries(prior.platforms || {})) {
        if (SKIP_FALLBACK.has(platform)) continue;
        if (!result.platforms[platform]) result.platforms[platform] = prev;
      }
    }

    out.push(result);
    if ((i + 1) % 10 === 0) console.log(`   ${i + 1}/${posts.length}…`);
  }

  // Sort newest published first
  out.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));

  const totals = out.reduce(
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

  const data = {
    lastUpdated: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    postCount: out.length,
    totals,
    posts: out,
  };

  if (dryRun) {
    console.log("\n[dry-run] would write:", JSON.stringify(totals, null, 2));
  } else {
    writeFileSync(OUT_FILE, JSON.stringify(data, null, 2) + "\n");
    console.log(
      `wrote ${OUT_FILE} — likes=${totals.likes} reposts=${totals.reposts} quotes=${totals.quotes} replies=${totals.replies}`
    );
  }
}

main().catch((err) => {
  console.error("collect-engagement failed:", err);
  process.exit(1);
});
