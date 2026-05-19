#!/usr/bin/env python3
"""Spaced publisher — picks one approved draft per fire and posts it.

Cron: every 30 minutes. So at most 48 posts per day, but typically far fewer
(most cycles will be no-op).

Spacing logic:
  - Each fire, expire any draft with status='approved' that's >24h past
    drafted_at — mark status='expired'.
  - Then pick the OLDEST remaining approved draft and post it.
  - Mark status='published' on success, 'publish_error' on failure (with
    error captured for retry next fire).

For V1 only Bluesky and Mastodon are actually posted to (we have SBT
creds, both APIs are clean). Other platforms (Threads, IG, FB, X) are
marked 'pending_manual' so Stephen can post them by hand from the UI —
once their publishers are wired, they'll auto-flip back to 'approved'
on the next manual review pass (or we can backfill).
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

EXPIRY_HOURS = float(os.environ.get("SOCIAL_EXPIRY_HOURS", "24"))
# All these route through scripts/sbt-publish.mjs → SBT's existing per-platform
# clients in ~/Projects/southbaytoday.org/scripts/social/lib/platforms/*.mjs.
AUTO_PLATFORMS = {"bluesky", "twitter", "x", "threads", "facebook", "mastodon"}
# Instagram requires image upload; no image pipeline yet → manual until images.
MANUAL_PLATFORMS = {"instagram"}
NODE_BIN = os.environ.get("NODE_BIN", "/opt/homebrew/bin/node")
PUBLISH_BRIDGE = str(Path(__file__).resolve().parent / "sbt-publish.mjs")

_drafts_lock = threading.Lock()


def load_env():
    for p in [
        ROOT / ".env",
        Path.home() / "Projects/southbaytoday.org/.env.local",
    ]:
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


def now_utc():
    return datetime.now(timezone.utc)


def parse_ts(s: str) -> datetime | None:
    if not s:
        return None
    try:
        # tolerate both Z-suffixed and +00:00-suffixed isoformats
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


# -----------------------------------------------------------------------------
# Publish bridge — calls SBT's existing per-platform clients via Node
# -----------------------------------------------------------------------------

def _publish_via_bridge(platform: str, text: str, reply_to: dict | None = None) -> dict:
    """Shell out to sbt-publish.mjs which imports SBT's lib/platforms/*.mjs."""
    payload = {"platform": platform, "text": text}
    if reply_to:
        payload["reply_to"] = {
            "uri": reply_to.get("uri"),
            "cid": reply_to.get("cid"),
        }
    proc = subprocess.run(
        [NODE_BIN, PUBLISH_BRIDGE],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=90,
    )
    try:
        result = json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception:
        return {
            "ok": False,
            "error": f"non-json bridge output (rc={proc.returncode}): "
                     f"stdout={proc.stdout[-200:]} stderr={proc.stderr[-200:]}",
        }
    return result


import subprocess  # noqa: E402  (kept local since it's only the bridge's dep)


def publish(draft: dict) -> dict:
    """Publish one draft. Returns updated draft fields to merge."""
    platform = (draft.get("platform") or "").lower()
    text = draft.get("text") or ""
    if not text.strip():
        return {"status": "publish_error", "error": "empty text"}

    if platform in MANUAL_PLATFORMS:
        return {"status": "pending_manual",
                "note": f"no auto-publisher for {platform} yet"}

    if platform not in AUTO_PLATFORMS:
        return {"status": "publish_error",
                "error": f"unknown platform: {platform}"}

    reply_to = None
    if draft.get("type") == "reply" and draft.get("reply_to"):
        rt = draft["reply_to"]
        if rt.get("uri") and rt.get("cid"):
            reply_to = rt
        else:
            return {"status": "publish_error",
                    "error": "reply_to missing uri/cid"}

    result = _publish_via_bridge(platform, text, reply_to)
    if not result.get("ok"):
        return {"status": "publish_error",
                "error": result.get("error", "bridge failure")}

    fields = {
        "status": "published",
        "published_at": now_utc().isoformat(),
    }
    # Carry through whatever the platform returned (id, url, uri, cid).
    for k in ("id", "url", "uri", "cid"):
        if result.get(k):
            fields[f"post_{k}"] = result[k]

    # Append to post_log.jsonl so the nightly reflection loop can score
    # this post. Best-effort; doesn't gate publish success.
    try:
        import post_log
        post_uri = fields.get("post_uri") or fields.get("post_url") or fields.get("post_id")
        post_log.log(
            platform=platform,
            type_=draft.get("type", "standalone"),
            text=text,
            topic=draft.get("topic"),
            category=draft.get("category"),
            uri=post_uri,
            reply_to_uri=(reply_to or {}).get("uri"),
            reply_to_handle=((draft.get("reply_to") or {}).get("author_handle")),
        )
    except Exception as e:
        print(f"[publisher] post_log write failed (non-fatal): {e}",
              file=sys.stderr)
    return fields


def main():
    load_env()
    with _drafts_lock:
        drafts = load_drafts()

    now = now_utc()
    expired_count = 0
    approved_eligible: list[tuple[int, dict]] = []

    for i, d in enumerate(drafts):
        if d.get("status") != "approved":
            continue
        drafted = parse_ts(d.get("drafted_at", ""))
        if drafted is None:
            continue
        age_hours = (now - drafted).total_seconds() / 3600
        if age_hours > EXPIRY_HOURS:
            d["status"] = "expired"
            d["expired_at"] = now.isoformat()
            expired_count += 1
            continue
        approved_eligible.append((i, d))

    if expired_count:
        print(f"[publisher] expired {expired_count} drafts older than {EXPIRY_HOURS}h")

    if not approved_eligible:
        with _drafts_lock:
            save_drafts(drafts)  # save any expirations
        print("[publisher] nothing to publish this fire")
        return 0

    # Sort by drafted_at ascending — FIFO so older approvals go out first.
    approved_eligible.sort(key=lambda t: t[1].get("drafted_at", ""))
    idx, draft = approved_eligible[0]

    platform = (draft.get("platform") or "").lower()
    print(f"[publisher] publishing draft id={draft.get('message_id')} "
          f"platform={platform} type={draft.get('type')}")

    try:
        update = publish(draft)
    except Exception as e:
        update = {"status": "publish_error", "error": str(e)[:300]}

    drafts[idx].update(update)
    with _drafts_lock:
        save_drafts(drafts)

    status = update.get("status")
    if status == "published":
        print(f"[publisher] ✓ published — {update.get('post_uri') or update.get('post_url')}")
    elif status == "pending_manual":
        print(f"[publisher] ↪ pending_manual — {update.get('note')}")
    else:
        print(f"[publisher] ✗ {status}: {update.get('error')}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
