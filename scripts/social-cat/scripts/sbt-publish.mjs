#!/usr/bin/env node
// social-cat publisher bridge — uses SBT's battle-tested per-platform
// clients (~/Projects/southbaytoday.org/scripts/social/lib/platforms/*.mjs)
// instead of reimplementing each API in Python.
//
// Reads one JSON request from stdin:
//   {
//     "platform": "bluesky"|"twitter"|"x"|"threads"|"facebook"|"instagram"|"mastodon",
//     "text": "...",
//     "reply_to": {"uri": "at://...", "cid": "..."}   // optional, Bluesky only
//   }
//
// Writes a single JSON result to stdout:
//   {"ok": true,  "url"|"uri"|"id"|"cid": ...}
//   {"ok": false, "error": "..."}

import { readFileSync } from "node:fs";

const SBT_PLATFORMS = "/Users/stephenstanwood/Projects/southbaytoday.org/scripts/social/lib/platforms";

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

  const platform = (req.platform || "").toLowerCase();
  const text = (req.text || "").trim();
  if (!text) {
    emit({ ok: false, error: "empty text" });
    process.exit(2);
  }

  try {
    if (platform === "bluesky") {
      const mod = await import(`${SBT_PLATFORMS}/bluesky.mjs`);
      if (req.reply_to && req.reply_to.uri && req.reply_to.cid) {
        const r = await mod.createReply(text, req.reply_to.uri, req.reply_to.cid);
        emit({ ok: true, uri: r.uri, cid: r.cid });
      } else {
        const r = await mod.createPost(text);
        emit({ ok: true, uri: r.uri, cid: r.cid });
      }
      return;
    }
    if (platform === "twitter" || platform === "x") {
      const mod = await import(`${SBT_PLATFORMS}/x.mjs`);
      const r = await mod.publish(text);
      emit({ ok: true, id: r.id, url: r.url });
      return;
    }
    if (platform === "threads") {
      const mod = await import(`${SBT_PLATFORMS}/threads.mjs`);
      const r = await mod.publish(text);
      emit({ ok: true, id: r.id, url: r.url });
      return;
    }
    if (platform === "facebook") {
      const mod = await import(`${SBT_PLATFORMS}/facebook.mjs`);
      const r = await mod.publish(text);
      emit({ ok: true, id: r.id, url: r.url });
      return;
    }
    if (platform === "instagram") {
      // IG requires an image — social-cat doesn't have an image pipeline
      // yet, so this branch only fires if Stephen manually re-enables IG.
      const mod = await import(`${SBT_PLATFORMS}/instagram.mjs`);
      const r = await mod.publish(text);
      emit({ ok: true, id: r.id, url: r.url });
      return;
    }
    if (platform === "mastodon") {
      const mod = await import(`${SBT_PLATFORMS}/mastodon.mjs`);
      const r = await mod.publish(text);
      emit({ ok: true, id: r.id, url: r.url });
      return;
    }
    emit({ ok: false, error: `unknown platform: ${platform}` });
    process.exit(2);
  } catch (e) {
    emit({ ok: false, error: String(e?.message || e).slice(0, 500) });
    process.exit(1);
  }
}

main();
