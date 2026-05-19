"""Append-only log of every social post published from social-cat.

JSONL at data/post_log.jsonl (gitignored — per-Mini state). Each line:
    {"ts": "...", "platform": "bluesky", "type": "standalone|reply",
     "category": "tech", "topic": "...", "uri": "at://...",
     "reply_to_uri": "at://..." (only for replies),
     "text": "first 500 chars"}

Used by reflect.py to score what actually got engagement and bias
future trend-picking + reply-pool toward what's landed.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

LOG_PATH = Path(__file__).resolve().parent.parent / "data" / "post_log.jsonl"


def log(
    *,
    platform: str,
    type_: str,
    text: str = "",
    topic: str | None = None,
    category: str | None = None,
    uri: str | None = None,
    reply_to_uri: str | None = None,
    **extra,
) -> None:
    """Best-effort append. Never raises — logging failure must not break a post."""
    try:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "platform": platform,
            "type": type_,
            "text": (text or "")[:500],
        }
        if topic is not None:
            entry["topic"] = topic
        if category is not None:
            entry["category"] = category
        if uri is not None:
            entry["uri"] = uri
        if reply_to_uri is not None:
            entry["reply_to_uri"] = reply_to_uri
        if extra:
            entry.update(extra)
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"[post_log] write failed (non-fatal): {e}", file=sys.stderr)
