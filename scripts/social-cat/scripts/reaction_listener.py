#!/usr/bin/env python3
"""Poll Discord for reactions on posted drafts; sync state.

Cron: every 5 min.

For each draft with status='posted' and message_id set:
  - Fetch reactions via Discord REST API
  - If Stephen (user id from STEPHEN_DISCORD_ID env) reacted 👍 → approved
  - If Stephen reacted ❌ → rejected (or any of the X-marker emoji variants)
  - Approve wins over reject if both present
  - On transition: delete the Discord message + record decided_at

Sync: this is the Discord half of the bidirectional state machine. The
swiper UI does the same job for browser/swipe gestures. The transition()
function is shared logic; calling it again on an already-decided record
is a no-op (idempotent).
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DRAFTS_PATH = DATA_DIR / "drafts.jsonl"

# Stephen's Discord user ID (from ~/.claude/channels/discord/access.json
# allowFrom list — the only paired user).
STEPHEN_ID = os.environ.get("STEPHEN_DISCORD_ID", "968482169431396422")
CHANNEL_ID = os.environ.get("SOCIAL_CHANNEL_ID", "1505960332646940812")
BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
SOCIAL_WEBHOOK = os.environ.get("SOCIAL_WEBHOOK", "")
UA = "social-cat/0.1 (reaction-listener)"

# Emoji to status mapping. URL-encoded for the reactions endpoint.
APPROVE_EMOJI = "👍"
REJECT_EMOJI_NAMES = ("❌", "❎", "✖️", "✖", "🚫")

_drafts_lock = threading.Lock()


def load_env():
    """Load env from project .env so the listener can run from cron/SSH."""
    for p in [ROOT / ".env", Path.home() / ".claude/channels/discord/.env"]:
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip("'\"")
            if k and k not in os.environ:
                os.environ[k] = v
    # Re-pick after env load
    globals()["BOT_TOKEN"] = os.environ.get("DISCORD_BOT_TOKEN", "")
    globals()["SOCIAL_WEBHOOK"] = os.environ.get("SOCIAL_WEBHOOK", "")


def load_drafts() -> list[dict]:
    if not DRAFTS_PATH.exists():
        return []
    items = []
    with DRAFTS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


def save_drafts(drafts: list[dict]):
    tmp = DRAFTS_PATH.with_suffix(".jsonl.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for d in drafts:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    tmp.replace(DRAFTS_PATH)


def discord_get(path: str):
    url = f"https://discord.com/api/v10{path}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bot {BOT_TOKEN}",
            "User-Agent": UA,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def discord_delete_webhook_msg(message_id: str) -> bool:
    if not SOCIAL_WEBHOOK:
        return False
    req = urllib.request.Request(
        f"{SOCIAL_WEBHOOK}/messages/{message_id}",
        headers={"User-Agent": UA},
        method="DELETE",
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
        return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return True
        return False
    except Exception:
        return False


def fetch_message_reactions(message_id: str) -> dict:
    """Return the reactions array from a message (or [] if none/missing)."""
    try:
        msg = discord_get(f"/channels/{CHANNEL_ID}/messages/{message_id}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"_deleted": True}
        raise
    return msg


def stephen_reacted_with(msg: dict, names: tuple[str, ...]) -> bool:
    """Did Stephen react to msg with any of the given emoji names?"""
    reactions = msg.get("reactions") or []
    matching = [r for r in reactions if r.get("emoji", {}).get("name") in names]
    if not matching:
        return False
    # Confirm Stephen is in the reactors. Fetch users for each matching emoji.
    for r in matching:
        emoji_name = r["emoji"]["name"]
        try:
            users = discord_get(
                f"/channels/{CHANNEL_ID}/messages/{msg['id']}"
                f"/reactions/{urllib.parse.quote(emoji_name)}"
            )
        except Exception:
            continue
        for u in users:
            if u.get("id") == STEPHEN_ID:
                return True
    return False


import urllib.parse  # used in stephen_reacted_with


def transition(message_id: str, new_status: str) -> dict | None:
    """Atomic move of one draft out of 'posted' state. Idempotent."""
    with _drafts_lock:
        drafts = load_drafts()
        target = None
        for d in drafts:
            if d.get("message_id") == message_id:
                target = d
                break
        if not target:
            return None
        if target.get("status") != "posted":
            return target  # already transitioned
        target["status"] = new_status
        target["decided_at"] = datetime.now(timezone.utc).isoformat()
        save_drafts(drafts)
    discord_delete_webhook_msg(message_id)
    return target


def main():
    load_env()
    if not BOT_TOKEN:
        print("[listener] DISCORD_BOT_TOKEN not set — aborting", file=sys.stderr)
        return 1

    drafts = load_drafts()
    posted = [d for d in drafts if d.get("status") == "posted" and d.get("message_id")]
    print(f"[listener] checking {len(posted)} posted drafts")

    approved = 0
    rejected = 0
    gone = 0
    for d in posted:
        mid = d["message_id"]
        try:
            msg = fetch_message_reactions(mid)
        except Exception as e:
            print(f"  fetch {mid} failed: {e}", file=sys.stderr)
            continue
        if msg.get("_deleted"):
            # Discord message gone (probably deleted by the other surface).
            # Don't transition automatically — the deletion was paired with a
            # state change. Skip; if status is still 'posted' it'll be cleaned
            # up by the publisher's expiry pass.
            gone += 1
            continue
        # Approve wins over reject if both present.
        if stephen_reacted_with(msg, (APPROVE_EMOJI,)):
            transition(mid, "approved")
            approved += 1
        elif stephen_reacted_with(msg, REJECT_EMOJI_NAMES):
            transition(mid, "rejected")
            rejected += 1
        time.sleep(0.15)  # polite — Discord global rate limit is 50/sec

    print(f"[listener] approved={approved} rejected={rejected} gone={gone}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
