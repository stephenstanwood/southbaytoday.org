"""Reflection pass: look at what SBT posted via social-cat recently, see
what got engagement, and write `data/voice_weights.json` so the next
cycle of trend-picking + reply-pool biases (within bounds) toward
what landed.

Runs once a night at 03:00 PT (after the 00:00 PT nightly purge has
snapshotted final per-post engagement to social-engagement-history.jsonl).
Best-effort: API failures are non-fatal; the file is just rewritten
with whatever sample we got. The read-side (voice_weights.py) defaults
to 1.0× multipliers when the file is missing or partial.

Engagement sources (cross-platform — Bluesky, X, Threads, FB, IG, Mastodon):
- src/data/south-bay/social-engagement-history.jsonl — append-only log
  written by nuke-old-posts.mjs RIGHT BEFORE it deletes a day's posts.
  Authoritative for deleted posts. Dedup-by-latest at read time.
- Bluesky public getPosts — live fallback for posts not yet snapshotted
  (e.g. published today, still on the platform). Other platforms can't
  be live-queried without auth; rely on the snapshot.

Learns:
  * per-category multiplier (which kinds of trend land)
  * per-type breakdown (trend vs reply, etc.)
  * warm reply handles (accounts that engaged back when SBT replied —
    bias the reply pool toward them next cycle)

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
# Cross-platform pre-purge engagement snapshot — written by SBT's
# scripts/social/nuke-old-posts.mjs at midnight before deletes.
ENGAGEMENT_HISTORY = ROOT.parent.parent / "src" / "data" / "south-bay" / "social-engagement-history.jsonl"
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


def _fetch_live_bsky(uris: list[str], chunk: int = 10) -> dict[tuple[str, str], dict]:
    """Public getPosts for posts still on Bluesky. Falls back to one-at-a-time
    when a batch fails (typically because one URI was deleted).

    Returns ("bluesky", uri) → counts so the live lookup composes cleanly with
    cross-platform snapshot data."""
    out: dict[tuple[str, str], dict] = {}

    def _record(p: dict):
        out[("bluesky", p["uri"])] = {
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


# Map social-engagement.json field names to reflect.py's internal *_count
# names. `views` is dropped — engagement_score only weighs the action metrics.
def _normalize_counts(raw: dict) -> dict:
    return {
        "like_count": raw.get("likes", 0),
        "reply_count": raw.get("replies", 0),
        "repost_count": raw.get("reposts", 0),
        "quote_count": raw.get("quotes", 0),
    }


def _load_snapshots() -> dict[tuple[str, str], dict]:
    """Read the cross-platform pre-purge snapshot written by SBT's
    scripts/social/nuke-old-posts.mjs. Append-only JSONL: one post per line,
    each with a `platforms` map of platform → {id, counts: {likes/replies/
    reposts/quotes/views}, …}.

    Returns (platform, post_id) → counts (reflect.py's internal *_count
    naming). When the same post key appears multiple times (re-purge, etc.),
    we keep the LATEST snapshot — that's the freshest engagement read."""
    out: dict[tuple[str, str], dict] = {}
    if not ENGAGEMENT_HISTORY.exists():
        return out
    # Track latest snapshotAt per (platform, id) so re-runs don't lose
    # accumulated engagement to an earlier, lower-count snapshot.
    seen_at: dict[tuple[str, str], str] = {}
    for line in ENGAGEMENT_HISTORY.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            e = json.loads(line)
        except Exception:
            continue
        snapshot_at = e.get("snapshotAt", "")
        platforms = e.get("platforms") or {}
        for plat, info in platforms.items():
            post_id = info.get("id")
            counts = info.get("counts")
            if not post_id or not counts:
                continue
            key = (plat, post_id)
            prior = seen_at.get(key)
            if prior is not None and snapshot_at <= prior:
                continue
            seen_at[key] = snapshot_at
            out[key] = _normalize_counts(counts)
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
        if not entry.get("platform"):
            continue
        out.append(entry)
    return out


def _post_id_for_lookup(entry: dict) -> str:
    """Map a post_log entry's `uri` to the post_id used in the engagement
    snapshot. Most platforms publish a URL or numeric ID in post_log; the
    snapshot stores the platform's native id. They match for Bluesky
    (at:// URI) and X/Threads/FB (numeric). Mastodon logs a full URL —
    strip to numeric status id, matching collect-engagement.mjs."""
    uri = entry.get("uri") or ""
    platform = entry.get("platform", "")
    if platform == "twitter":
        platform = "x"
    if platform == "mastodon":
        m = uri.rsplit("/", 1)
        if m and m[-1].isdigit():
            return m[-1]
    return uri


# ---- weight computation --------------------------------------------------

def _counts_for(entry: dict, counts: dict[tuple[str, str], dict]) -> dict:
    plat = entry.get("platform") or ""
    if plat == "twitter":
        plat = "x"
    return counts.get((plat, _post_id_for_lookup(entry)), {})


def _category_multipliers(entries: list[dict], counts: dict[tuple[str, str], dict]) -> dict[str, dict]:
    """Per-category multiplier = avg(score) / global_avg, clamped."""
    by_cat: dict[str, list[float]] = defaultdict(list)
    for e in entries:
        cat = e.get("category") or "other"
        score = engagement_score(_counts_for(e, counts))
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


def _type_breakdown(entries: list[dict], counts: dict[tuple[str, str], dict]) -> dict[str, dict]:
    by_type: dict[str, list[float]] = defaultdict(list)
    for e in entries:
        by_type[e.get("type", "unknown")].append(engagement_score(_counts_for(e, counts)))
    out: dict[str, dict] = {}
    for t, scores in by_type.items():
        avg = sum(scores) / len(scores) if scores else 0
        out[t] = {"avg_score": round(avg, 2), "posts": len(scores)}
    return out


def _platform_breakdown(entries: list[dict], counts: dict[tuple[str, str], dict]) -> dict[str, dict]:
    """Mean engagement score per platform — visibility into which platforms
    actually move for SBT. Not used by draft.py yet, but exposed in voice_weights
    so consumers (or a future drafter mode) can read it."""
    by_plat: dict[str, list[float]] = defaultdict(list)
    for e in entries:
        plat = e.get("platform", "unknown")
        if plat == "twitter":
            plat = "x"
        by_plat[plat].append(engagement_score(_counts_for(e, counts)))
    out: dict[str, dict] = {}
    for p, scores in by_plat.items():
        avg = sum(scores) / len(scores) if scores else 0
        out[p] = {"avg_score": round(avg, 2), "posts": len(scores)}
    return out


def _warm_reply_handles(entries: list[dict], counts: dict[tuple[str, str], dict], limit: int = 12) -> list[dict]:
    """Handles SBT replied to where the target actually engaged back (reply,
    like, repost). Bluesky-only — that's the platform where social-cat's
    drafter biases the reply pool. The reply_to_handle field is logged at
    publish time by publisher.py.
    """
    warm: list[dict] = []
    for e in entries:
        if e.get("type") != "reply":
            continue
        if e.get("platform") != "bluesky":
            continue
        # The reply_to_uri encodes the parent: at://did/app.bsky.feed.post/rkey
        parent_uri = e.get("reply_to_uri") or ""
        if not parent_uri.startswith("at://"):
            continue
        handle = e.get("reply_to_handle")
        if not handle:
            continue
        c = _counts_for(e, counts)
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


def _summary(cat_mults: dict[str, dict], type_break: dict[str, dict], plat_break: dict[str, dict], warm: list[dict], sample: int) -> str:
    if sample < MIN_SAMPLE:
        return f"sample too small ({sample} posts) — running with neutral 1.0× weights"
    leaders = sorted(cat_mults.items(), key=lambda x: x[1]["multiplier"], reverse=True)
    top = [f"{name} ({d['multiplier']}×, n={d['posts']})"
           for name, d in leaders[:3] if d["multiplier"] > 1.0]
    bottom = [f"{name} ({d['multiplier']}×)"
              for name, d in leaders[-2:] if d["multiplier"] < 1.0]
    type_line = " · ".join(
        f"{t}:{d['avg_score']}"
        for t, d in sorted(type_break.items(), key=lambda x: x[1]["avg_score"], reverse=True)
    )
    plat_line = " · ".join(
        f"{p}:{d['avg_score']}(n={d['posts']})"
        for p, d in sorted(plat_break.items(), key=lambda x: x[1]["avg_score"], reverse=True)
    )
    warm_line = ", ".join(f"@{w['handle']}" for w in warm[:5]) if warm else "—"
    parts = []
    if top:
        parts.append("up: " + ", ".join(top))
    if bottom:
        parts.append("down: " + ", ".join(bottom))
    parts.append("avg by type: " + type_line)
    parts.append("avg by platform: " + plat_line)
    parts.append("warm handles: " + warm_line)
    return " | ".join(parts)


# ---- main ----------------------------------------------------------------

def run() -> int:
    entries = _load_log_window(LOOKBACK_DAYS)
    if not entries:
        print("[reflect] no post-log entries in window — nothing to reflect on")
        # Still write an empty weights file so the read-side has a clean state
        WEIGHTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        WEIGHTS_PATH.write_text(json.dumps({
            "updated_ts": datetime.now(timezone.utc).isoformat(),
            "lookback_days": LOOKBACK_DAYS,
            "sample_size": 0,
            "category": {},
            "type": {},
            "platform": {},
            "warm_handles": [],
            "summary": "no posts in window",
        }, indent=2))
        return 0

    print(f"[reflect] reflecting on {len(entries)} post-log entries over {LOOKBACK_DAYS}d "
          f"(platforms: {sorted({e.get('platform','?') for e in entries})})")

    # Snapshot is authoritative for ALL platforms (written before purge).
    # Live Bluesky fetch backfills posts published today that haven't hit
    # the next snapshot yet — other platforms can't be live-queried without
    # auth, so they're snapshot-only.
    snapshots = _load_snapshots()
    bsky_uris_needing_live = [
        e["uri"] for e in entries
        if e.get("platform") == "bluesky"
        and ("bluesky", e["uri"]) not in snapshots
    ]
    live = _fetch_live_bsky(list(set(bsky_uris_needing_live))) if bsky_uris_needing_live else {}
    counts: dict[tuple[str, str], dict] = {**snapshots, **live}
    print(f"[reflect] counts: {len(snapshots)} snapshot + {len(live)} live bsky = {len(counts)} keys")

    qualifying = [e for e in entries if _counts_for(e, counts)]
    print(f"[reflect] qualifying entries with counts: {len(qualifying)}/{len(entries)}")
    cat_mults = _category_multipliers(qualifying, counts)
    type_break = _type_breakdown(qualifying, counts)
    plat_break = _platform_breakdown(qualifying, counts)
    warm = _warm_reply_handles(qualifying, counts)
    summary = _summary(cat_mults, type_break, plat_break, warm, len(qualifying))

    output = {
        "updated_ts": datetime.now(timezone.utc).isoformat(),
        "lookback_days": LOOKBACK_DAYS,
        "sample_size": len(qualifying),
        "category": cat_mults,
        "type": type_break,
        "platform": plat_break,
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
