"""Reflection pass: look at what SBT posted via social-cat recently, see
what got engagement, and write `data/voice_weights.json` so the next
cycle of trend-picking + reply-pool biases (within bounds) toward
what landed.

Runs once a night at 02:30 PT (before Stephen wakes). Best-effort:
Bluesky API failures are non-fatal; the file is just rewritten with
whatever sample we got. The read-side (voice_weights.py) defaults to
1.0× multipliers when the file is missing or partial.

V1 scope:
- Only scores Bluesky posts. Twitter/Threads/FB/Mastodon engagement
  reads require per-platform API plumbing — added in V2.
- Learns two axes:
    * per-category multiplier (which kinds of trend land)
    * warm reply handles (Bluesky accounts that engaged back when SBT
      replied — bias the reply pool toward them next cycle)

Voice guardrails (non-negotiable bounds, not heuristics):
- Per-category multiplier clamped to [0.5, 1.5]. No category drops out;
  no category dominates.
- Categories need >= MIN_POSTS_PER_CATEGORY in the window to move.
- Need >= MIN_SAMPLE total qualifying posts before anything adjusts off
  1.0×.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POST_LOG = ROOT / "data" / "post_log.jsonl"
ENGAGEMENT_SNAPSHOT = ROOT / "data" / "post_engagement.jsonl"
WEIGHTS_PATH = ROOT / "data" / "voice_weights.json"

PUBLIC_BSKY = "https://public.api.bsky.app/xrpc"
UA = (
    "Mozilla/5.0 (compatible; social-cat/0.1 reflect; "
    "+https://stanwood.dev; contact: stephen@stanwood.dev)"
)
TIMEOUT = 30

LOOKBACK_DAYS = 14
MIN_POSTS_PER_CATEGORY = 3
MIN_SAMPLE = 12

CATEGORY_FLOOR = 0.5
CATEGORY_CAP = 1.5


# ---- engagement score -----------------------------------------------------

def engagement_score(counts: dict) -> float:
    """Replies and quotes (real conversation) weigh more than likes (passive)."""
    return (
        counts.get("like_count", 0)
        + 2.0 * counts.get("reply_count", 0)
        + 1.5 * counts.get("repost_count", 0)
        + 2.0 * counts.get("quote_count", 0)
    )


# ---- bsky fetch ----------------------------------------------------------

def _http_get(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def _fetch_live(uris: list[str], chunk: int = 10) -> dict[str, dict]:
    """Public getPosts for posts still on Bluesky. Falls back to one-at-a-time
    when a batch fails (typically because one URI was deleted)."""
    out: dict[str, dict] = {}

    def _record(p: dict):
        out[p["uri"]] = {
            "like_count": p.get("likeCount", 0),
            "reply_count": p.get("replyCount", 0),
            "repost_count": p.get("repostCount", 0),
            "quote_count": p.get("quoteCount", 0),
        }

    for i in range(0, len(uris), chunk):
        batch = uris[i : i + chunk]
        params = "&".join(f"uris={urllib.parse.quote(u, safe='')}" for u in batch)
        try:
            data = _http_get(f"{PUBLIC_BSKY}/app.bsky.feed.getPosts?{params}")
            for p in data.get("posts", []):
                _record(p)
        except Exception:
            for u in batch:
                try:
                    data = _http_get(
                        f"{PUBLIC_BSKY}/app.bsky.feed.getPosts"
                        f"?uris={urllib.parse.quote(u, safe='')}"
                    )
                    for p in data.get("posts", []):
                        _record(p)
                except Exception:
                    continue  # deleted / API blip — skip silently
    return out


def _load_snapshots() -> dict[str, dict]:
    """Engagement counts captured before deletion (if/when we add a TTL).
    Authoritative for posts no longer on the platform. Currently empty
    because social-cat doesn't delete; harmless to read either way."""
    out: dict[str, dict] = {}
    if not ENGAGEMENT_SNAPSHOT.exists():
        return out
    for line in ENGAGEMENT_SNAPSHOT.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            e = json.loads(line)
        except Exception:
            continue
        uri = e.get("uri")
        if not uri:
            continue
        out[uri] = {
            "like_count": e.get("like_count", 0),
            "reply_count": e.get("reply_count", 0),
            "repost_count": e.get("repost_count", 0),
            "quote_count": e.get("quote_count", 0),
        }
    return out


# ---- post log loading ----------------------------------------------------

def _load_log_window(days: int) -> list[dict]:
    if not POST_LOG.exists():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    for line in POST_LOG.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except Exception:
            continue
        ts_raw = entry.get("ts", "")
        try:
            ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        except Exception:
            continue
        if ts < cutoff:
            continue
        if not entry.get("uri"):
            continue
        if entry.get("platform") != "bluesky":
            continue  # V1: only Bluesky engagement reads
        out.append(entry)
    return out


# ---- weight computation --------------------------------------------------

def _category_multipliers(entries: list[dict], counts: dict[str, dict]) -> dict[str, dict]:
    """Per-category multiplier = avg(score) / global_avg, clamped."""
    by_cat: dict[str, list[float]] = defaultdict(list)
    for e in entries:
        cat = e.get("category") or "other"
        score = engagement_score(counts.get(e["uri"], {}))
        by_cat[cat].append(score)

    all_scores = [s for ss in by_cat.values() for s in ss]
    if len(all_scores) < MIN_SAMPLE:
        return {
            c: {"multiplier": 1.0, "avg_score": round(sum(v) / max(len(v), 1), 2), "posts": len(v)}
            for c, v in by_cat.items()
        }
    global_avg = sum(all_scores) / len(all_scores)
    if global_avg <= 0:
        return {
            c: {"multiplier": 1.0, "avg_score": 0.0, "posts": len(v)}
            for c, v in by_cat.items()
        }

    out: dict[str, dict] = {}
    for cat, scores in by_cat.items():
        avg = sum(scores) / len(scores)
        if len(scores) < MIN_POSTS_PER_CATEGORY:
            mult = 1.0
        else:
            mult = max(CATEGORY_FLOOR, min(CATEGORY_CAP, avg / global_avg))
        out[cat] = {"multiplier": round(mult, 3), "avg_score": round(avg, 2), "posts": len(scores)}
    return out


def _type_breakdown(entries: list[dict], counts: dict[str, dict]) -> dict[str, dict]:
    by_type: dict[str, list[float]] = defaultdict(list)
    for e in entries:
        by_type[e.get("type", "unknown")].append(engagement_score(counts.get(e["uri"], {})))
    out: dict[str, dict] = {}
    for t, scores in by_type.items():
        avg = sum(scores) / len(scores) if scores else 0
        out[t] = {"avg_score": round(avg, 2), "posts": len(scores)}
    return out


def _warm_reply_handles(entries: list[dict], counts: dict[str, dict], limit: int = 12) -> list[dict]:
    """Bluesky handles SBT replied to where the target actually engaged
    back (reply, like, repost). These are accounts more likely to keep
    engaging — bias the reply pool toward them next cycle.
    """
    warm: list[dict] = []
    for e in entries:
        if e.get("type") != "reply":
            continue
        # The reply_to_uri encodes the parent: at://did/app.bsky.feed.post/rkey
        parent_uri = e.get("reply_to_uri") or ""
        if not parent_uri.startswith("at://"):
            continue
        # The handle isn't in the AT URI directly — log it during publish.
        # If reply_to_handle was logged, use it; otherwise skip warmth.
        handle = e.get("reply_to_handle")
        if not handle:
            continue
        c = counts.get(e["uri"], {})
        score = engagement_score(c)
        # "real engagement" = the target replied back, or > a few likes
        if c.get("reply_count", 0) >= 1 or score >= 2:
            warm.append({
                "handle": handle,
                "score": round(score, 1),
                "reply_count": c.get("reply_count", 0),
                "our_post": e["uri"],
            })
    # Dedupe by handle keeping the highest-scoring instance
    by_handle: dict[str, dict] = {}
    for w in warm:
        prior = by_handle.get(w["handle"])
        if prior is None or w["score"] > prior["score"]:
            by_handle[w["handle"]] = w
    deduped = sorted(by_handle.values(), key=lambda x: x["score"], reverse=True)
    return deduped[:limit]


def _summary(cat_mults: dict[str, dict], type_break: dict[str, dict], warm: list[dict], sample: int) -> str:
    if sample < MIN_SAMPLE:
        return f"sample too small ({sample} bluesky posts) — running with neutral 1.0× weights"
    leaders = sorted(cat_mults.items(), key=lambda x: x[1]["multiplier"], reverse=True)
    top = [f"{name} ({d['multiplier']}×, n={d['posts']})"
           for name, d in leaders[:3] if d["multiplier"] > 1.0]
    bottom = [f"{name} ({d['multiplier']}×)"
              for name, d in leaders[-2:] if d["multiplier"] < 1.0]
    type_line = " · ".join(
        f"{t}:{d['avg_score']}"
        for t, d in sorted(type_break.items(), key=lambda x: x[1]["avg_score"], reverse=True)
    )
    warm_line = ", ".join(f"@{w['handle']}" for w in warm[:5]) if warm else "—"
    parts = []
    if top:
        parts.append("up: " + ", ".join(top))
    if bottom:
        parts.append("down: " + ", ".join(bottom))
    parts.append("avg by type: " + type_line)
    parts.append("warm handles: " + warm_line)
    return " | ".join(parts)


# ---- main ----------------------------------------------------------------

def run() -> int:
    entries = _load_log_window(LOOKBACK_DAYS)
    if not entries:
        print("[reflect] no bluesky post-log entries in window — nothing to reflect on")
        # Still write an empty weights file so the read-side has a clean state
        WEIGHTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        WEIGHTS_PATH.write_text(json.dumps({
            "updated_ts": datetime.now(timezone.utc).isoformat(),
            "lookback_days": LOOKBACK_DAYS,
            "sample_size": 0,
            "category": {},
            "type": {},
            "warm_handles": [],
            "summary": "no posts in window",
        }, indent=2))
        return 0

    uris = list({e["uri"] for e in entries})
    print(f"[reflect] reflecting on {len(uris)} bluesky posts over {LOOKBACK_DAYS}d")

    snapshots = _load_snapshots()
    needs_live = [u for u in uris if u not in snapshots]
    live = _fetch_live(needs_live) if needs_live else {}
    counts = {**snapshots, **live}
    print(f"[reflect] counts: {len(snapshots)} snapshot + {len(live)} live = {len(counts)}/{len(uris)}")

    qualifying = [e for e in entries if e["uri"] in counts]
    cat_mults = _category_multipliers(qualifying, counts)
    type_break = _type_breakdown(qualifying, counts)
    warm = _warm_reply_handles(qualifying, counts)
    summary = _summary(cat_mults, type_break, warm, len(qualifying))

    output = {
        "updated_ts": datetime.now(timezone.utc).isoformat(),
        "lookback_days": LOOKBACK_DAYS,
        "sample_size": len(qualifying),
        "category": cat_mults,
        "type": type_break,
        "warm_handles": warm,
        "summary": summary,
    }
    WEIGHTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    WEIGHTS_PATH.write_text(json.dumps(output, indent=2))
    print(f"[reflect] wrote {WEIGHTS_PATH.name}")
    print(f"[reflect] {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(run())
