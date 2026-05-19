#!/usr/bin/env python3
"""Post queued drafts to Discord #social via webhook.

Reads data/drafts.jsonl, posts each row with status='queued', updates
status to 'posted' with the Discord message_id (so a future reaction
listener can match 👍 reactions back to specific drafts).

Env:
  SOCIAL_WEBHOOK  Discord webhook URL for #social
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DRAFTS_PATH = DATA_DIR / "drafts.jsonl"
WEBHOOK_URL = os.environ.get("SOCIAL_WEBHOOK", "")

PLATFORM_EMOJI = {
    "twitter": "🐦",
    "x": "🐦",
    "bluesky": "🦋",
    "threads": "🧵",
    "instagram": "📸",
    "mastodon": "🐘",
    "linkedin": "💼",
}


def format_draft(d: dict) -> str:
    plat = (d.get("platform") or "?").lower()
    emoji = PLATFORM_EMOJI.get(plat, "📝")
    typ = d.get("type", "standalone")
    topic = d.get("topic", "")
    text = d.get("text", "")
    why = d.get("why_trending", "")

    header = f"{emoji} **{plat.capitalize()}** · {typ} · *{topic}*"
    body_lines = [line for line in (text or "").split("\n") if line.strip()]
    body = "\n".join("> " + line for line in body_lines) if body_lines else "> (empty)"

    parts = [header, body]
    if why:
        parts.append(f"_{why}_")

    # Reply context: surface the target so Stephen can judge the reply.
    rt = d.get("reply_to") or {}
    if typ == "reply" and rt:
        target_url = rt.get("url") or ""
        handle = rt.get("author_handle") or ""
        snippet = (rt.get("text_snippet") or "").strip()
        target_label = f"@{handle}" if handle else (rt.get("source") or "target")
        if target_url:
            parts.append(f"↳ replying to [{target_label}]({target_url})")
        else:
            parts.append(f"↳ replying to {target_label}")
        if snippet:
            snippet_one_line = " ".join(snippet.split())[:200]
            parts.append(f"> _{snippet_one_line}_")

    # Inspiration sources (standalones)
    src_links = []
    for s in (d.get("sources") or [])[:3]:
        if s.get("url"):
            src_links.append(f"[{s.get('source')}]({s['url']})")
    if src_links:
        parts.append(" · ".join(src_links))

    parts.append("react 👍 to approve · ❌ to drop")
    return "\n".join(parts)


def post_webhook(content: str) -> str:
    """POST to Discord webhook with ?wait=true → returns the message ID."""
    body = json.dumps({"content": content[:1900]}).encode("utf-8")
    req = urllib.request.Request(
        WEBHOOK_URL + ("&" if "?" in WEBHOOK_URL else "?") + "wait=true",
        data=body,
        headers={
            "Content-Type": "application/json",
            # Discord rejects Python's default Python-urllib/* UA.
            "User-Agent": "social-cat/0.1 (DiscordBot; +https://stanwood.dev)",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        resp = json.loads(r.read())
        return resp.get("id", "")


def main():
    if not WEBHOOK_URL:
        print("post: SOCIAL_WEBHOOK env not set", file=sys.stderr)
        return 1
    if not DRAFTS_PATH.exists():
        print("post: no drafts file yet", file=sys.stderr)
        return 0

    drafts = []
    with DRAFTS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if line:
                drafts.append(json.loads(line))

    posted = 0
    for d in drafts:
        if d.get("status") != "queued":
            continue
        try:
            msg_id = post_webhook(format_draft(d))
            d["status"] = "posted"
            d["message_id"] = msg_id
            posted += 1
            time.sleep(0.6)  # Discord webhook rate limit: ~5/sec safe
        except Exception as e:
            print(f"post: failed ({e})", file=sys.stderr)
            d["status"] = "error"
            d["error"] = str(e)[:300]

    # Rewrite drafts.jsonl with updated statuses
    with DRAFTS_PATH.open("w", encoding="utf-8") as f:
        for d in drafts:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    print(f"[post] posted {posted} drafts")


if __name__ == "__main__":
    sys.exit(main() or 0)
