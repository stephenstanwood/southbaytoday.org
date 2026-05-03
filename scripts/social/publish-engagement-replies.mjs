#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Today — Engagement Publisher
//
// Publishes drafts that Stephen has tapped "Approve" on (status='approved')
// to Bluesky in-thread, using the existing bluesky.mjs platform helper.
//
// Usage: node scripts/social/publish-engagement-replies.mjs [--dry-run]
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createReply } from "./lib/platforms/bluesky.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const DRAFTS_FILE = join(ROOT, "src/data/south-bay/engagement-drafts.json");

if (!process.env.BLUESKY_HANDLE || !process.env.BLUESKY_APP_PASSWORD) {
  try {
    const envPath = join(ROOT, ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const dryRun = process.argv.includes("--dry-run");

function loadDrafts() {
  try { return JSON.parse(readFileSync(DRAFTS_FILE, "utf8")); } catch { return { drafts: [] }; }
}
function saveDrafts(d) {
  writeFileSync(DRAFTS_FILE, JSON.stringify(d, null, 2));
}
async function notifyDiscord(text) {
  const url = process.env.DISCORD_WEBHOOK;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  }).catch(() => {});
}

async function main() {
  const data = loadDrafts();
  const approved = data.drafts.filter((d) => d.status === "approved" && !d.publishedAt);

  if (!approved.length) return;

  console.log(`📤 Publishing ${approved.length} approved engagement repl${approved.length === 1 ? "y" : "ies"}…`);

  for (const draft of approved) {
    if (dryRun) {
      console.log(`   [DRY] would reply to @${draft.parentAuthor}: ${draft.draftText}`);
      continue;
    }

    try {
      const result = await createReply(draft.draftText, draft.parentUri, draft.parentCid);
      draft.publishedAt = new Date().toISOString();
      draft.publishedUri = result.uri;
      draft.status = "published";
      saveDrafts(data); // save after each so partial failures don't lose state
      console.log(`   ✓ replied to @${draft.parentAuthor}: ${result.uri}`);
      const preview = draft.draftText.length > 100 ? draft.draftText.slice(0, 100) + "…" : draft.draftText;
      await notifyDiscord(`✅ Replied to @${draft.parentAuthor}: ${preview}`);
    } catch (err) {
      console.error(`   ✗ failed reply to @${draft.parentAuthor}: ${err.message}`);
      await notifyDiscord(`🔴 Engagement reply FAILED for @${draft.parentAuthor}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error("publish-engagement-replies failed:", err);
  process.exit(1);
});
