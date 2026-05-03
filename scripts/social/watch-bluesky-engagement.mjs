#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Today — Engagement Watcher (Bluesky)
//
// Polls a curated list of Bluesky accounts for new posts, scores them for
// reply-worthiness, drafts replies via Claude, and pushes drafts to Discord
// for one-tap approval. Approved drafts get published by
// publish-engagement-replies.mjs.
//
// Usage: node scripts/social/watch-bluesky-engagement.mjs [--max N] [--dry-run]
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { getAuthorFeed } from "./lib/platforms/bluesky.mjs";
import { scoreRelevance, draftReply } from "./lib/engagement-drafter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const ACCOUNTS_FILE = join(ROOT, "src/data/south-bay/engagement-accounts.json");
const DRAFTS_FILE = join(ROOT, "src/data/south-bay/engagement-drafts.json");

// Env loader — mirror other social scripts
if (!process.env.ANTHROPIC_API_KEY || !process.env.BLUESKY_HANDLE) {
  try {
    const envPath = join(ROOT, ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const args = process.argv.slice(2);
const maxPerRun = parseInt(args.find((a, i) => args[i - 1] === "--max") || "3");
const dryRun = args.includes("--dry-run");

// Tailscale-accessible review server (override via REVIEW_PORTAL_URL if needed)
const REVIEW_HOST = process.env.REVIEW_PORTAL_URL || "http://100.117.24.89:3456";

// Hard caps so we don't spam the queue
const DAILY_DRAFT_CAP = 5;
const POST_AGE_HOURS = 24;

function loadJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}
function saveJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}
function loadAccounts() {
  return (loadJson(ACCOUNTS_FILE, { accounts: [] }).accounts || []).filter((a) => a.handle);
}
function loadDrafts() { return loadJson(DRAFTS_FILE, { drafts: [] }); }
function saveDrafts(d) { saveJson(DRAFTS_FILE, d); }
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function newId() { return randomBytes(8).toString("hex"); }

function isRecentEnough(post) {
  const ageMs = Date.now() - new Date(post.createdAt).getTime();
  return ageMs < POST_AGE_HOURS * 60 * 60 * 1000;
}
function alreadyDrafted(drafts, postUri) {
  return drafts.some((d) => d.parentUri === postUri);
}
function draftsInLast24h(drafts) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return drafts.filter((d) => new Date(d.draftedAt).getTime() > cutoff);
}

async function postToDiscord(draft, account) {
  const url = process.env.DISCORD_WEBHOOK;
  if (!url) {
    console.log("   (no DISCORD_WEBHOOK set — draft saved but no notification sent)");
    return;
  }

  const approveUrl = `${REVIEW_HOST}/engagement/approve/${draft.id}`;
  const rejectUrl = `${REVIEW_HOST}/engagement/reject/${draft.id}`;

  const embed = {
    title: `Reply candidate: @${draft.parentAuthor}`,
    description:
      `**Original:** ${truncate(draft.parentText, 280)}\n\n` +
      `**Drafted reply:**\n> ${draft.draftText}\n\n` +
      `**Why:** ${draft.angle || "—"}`,
    url: draft.sourcePermalink,
    color: 0x4f46e5,
    fields: [
      { name: "✅ Approve", value: `[tap to publish](${approveUrl})`, inline: true },
      { name: "❌ Reject", value: `[tap to drop](${rejectUrl})`, inline: true },
    ],
    footer: { text: account.label || draft.parentAuthor },
    timestamp: new Date().toISOString(),
  };

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch((err) => console.log(`   discord webhook failed: ${err.message}`));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const accounts = loadAccounts();
  if (!accounts.length) {
    console.log("⚠ No accounts in engagement-accounts.json. Add some Bluesky handles to start.");
    return;
  }

  const draftsData = loadDrafts();
  const recentDrafts = draftsInLast24h(draftsData.drafts);
  if (recentDrafts.length >= DAILY_DRAFT_CAP) {
    console.log(`⏸  Daily cap reached (${recentDrafts.length}/${DAILY_DRAFT_CAP}). Skipping.`);
    return;
  }

  const remainingCap = DAILY_DRAFT_CAP - recentDrafts.length;
  const runCap = Math.min(maxPerRun, remainingCap);
  console.log(`🔍 Watching ${accounts.length} accounts (cap: ${runCap} this run, ${recentDrafts.length}/${DAILY_DRAFT_CAP} drafts in last 24h)`);

  let surfaced = 0;

  for (const account of accounts) {
    if (surfaced >= runCap) break;

    let posts;
    try {
      posts = await getAuthorFeed(account.handle, 10);
    } catch (err) {
      console.log(`   ✗ ${account.handle}: ${err.message}`);
      continue;
    }

    const candidates = posts
      .filter(isRecentEnough)
      .filter((p) => !alreadyDrafted(draftsData.drafts, p.uri));

    if (!candidates.length) continue;

    for (const post of candidates) {
      if (surfaced >= runCap) break;

      console.log(`   • @${post.author}: ${truncate(post.text, 70)}`);

      let score;
      try {
        score = await scoreRelevance(post);
      } catch (err) {
        console.log(`     scoring failed: ${err.message}`);
        continue;
      }

      if (!score.worthReplying) {
        console.log(`     ↳ skip: ${score.reason}`);
        continue;
      }

      let replyText;
      try {
        replyText = await draftReply(post, score.angle);
      } catch (err) {
        console.log(`     drafting failed: ${err.message}`);
        continue;
      }

      const draft = {
        id: newId(),
        platform: "bluesky",
        accountLabel: account.label || account.handle,
        parentUri: post.uri,
        parentCid: post.cid,
        parentAuthor: post.author,
        parentText: post.text,
        sourcePermalink: `https://bsky.app/profile/${post.author}/post/${post.uri.split("/").pop()}`,
        angle: score.angle,
        scoringReason: score.reason,
        draftText: replyText,
        status: "pending", // pending | approved | rejected | published
        draftedAt: new Date().toISOString(),
        approvedAt: null,
        publishedAt: null,
        publishedUri: null,
      };

      console.log(`     ↳ DRAFT (${replyText.length} chars): ${replyText}`);

      if (dryRun) {
        surfaced++;
        continue;
      }

      draftsData.drafts.push(draft);
      saveDrafts(draftsData);
      await postToDiscord(draft, account);
      surfaced++;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✓ Surfaced ${surfaced} draft${surfaced === 1 ? "" : "s"} this run`);
}

main().catch((err) => {
  console.error("watch-bluesky-engagement failed:", err);
  process.exit(1);
});
