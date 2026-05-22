#!/usr/bin/env python3
"""social-cat swiper — one-draft-at-a-time review UI.

Mirror surface to the Discord #social queue. Either Discord 👍 or a swipe
right approves a draft; either Discord ❌ or a swipe left rejects.

State machine (status field on each draft record):
  queued    — drafted, not yet posted to Discord
  posted    — posted to Discord, awaiting a decision (this is what the swiper
              shows; also what reaction_listener polls)
  approved  — Stephen 👍'd it; publisher will pick it up
  rejected  — Stephen ❌'d it; ignored
  published — actually went out to the social platform
  expired   — drafted-at was >24h ago without being published; skipped

Sync: any state transition out of "posted" deletes the matching Discord
message (whether the transition was driven by Discord reaction or swiper
gesture), so both surfaces stay in sync.

Run on the Mini under launchd. Bind to 0.0.0.0 so Tailscale-connected
devices can reach it at http://10.0.0.234:PORT.
"""
from __future__ import annotations

import json
import os
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class FastHTTPServer(ThreadingHTTPServer):
    """Skip the 35-second `socket.getfqdn(host)` call during bind.

    On the Mini, reverse DNS for the bound host is extremely slow, which
    blocks ThreadingHTTPServer.__init__ for 35+ seconds before the server
    can serve. Override to bypass.
    """

    def server_bind(self):
        socketserver.TCPServer.server_bind(self)
        host, port = self.server_address[:2]
        self.server_name = host
        self.server_port = port

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DRAFTS_PATH = DATA_DIR / "drafts.jsonl"

# Engagement file lives in the SBT repo root: scripts/social-cat/ → ../.. → repo
ENGAGEMENT_PATH = ROOT.parent.parent / "src" / "data" / "south-bay" / "social-engagement.json"

PORT = int(os.environ.get("SWIPER_PORT", "8765"))
SOCIAL_WEBHOOK = os.environ.get("SOCIAL_WEBHOOK", "")
DISCORD_UA = "social-cat-swiper/0.1 (DiscordBot)"

_drafts_lock = threading.Lock()


def load_env():
    """Load .env from project root if not already in environ."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip("'\"")
        if k and k not in os.environ:
            os.environ[k] = v


def load_engagement() -> dict:
    """Read social-engagement.json and mirror copy-review-server's FB-strip.

    Meta App Review walls off pages_read_engagement, so FB counts are always 0
    and just add visual noise. The Node engagement page strips them on read;
    we mirror that here so the swiper card matches /engagement exactly.
    """
    if not ENGAGEMENT_PATH.exists():
        return {"lastUpdated": None, "posts": [], "totals": {}, "postCount": 0}
    try:
        data = json.loads(ENGAGEMENT_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"lastUpdated": None, "posts": [], "totals": {}, "postCount": 0}
    totals = {"likes": 0, "reposts": 0, "quotes": 0, "replies": 0}
    posts = []
    for post in (data.get("posts") or []):
        platforms = {k: v for k, v in (post.get("platforms") or {}).items()
                     if k != "facebook"}
        if not platforms:
            continue
        for v in platforms.values():
            c = v.get("counts") or {}
            totals["likes"] += c.get("likes", 0) or 0
            totals["reposts"] += c.get("reposts", 0) or 0
            totals["quotes"] += c.get("quotes", 0) or 0
            totals["replies"] += c.get("replies", 0) or 0
        posts.append({**post, "platforms": platforms})
    return {
        **data,
        "posts": posts,
        "totals": totals,
        "postCount": len(posts),
    }


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
    """Atomic rewrite of drafts.jsonl."""
    tmp = DRAFTS_PATH.with_suffix(".jsonl.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for d in drafts:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    tmp.replace(DRAFTS_PATH)


def discord_delete(message_id: str) -> bool:
    """DELETE the Discord webhook message. Returns True on 2xx or 404.

    Retries up to 3 times on 5xx / 429 / network errors with exponential
    backoff (0.5s, 1s, 2s). The listener's sweep_pending_deletes() picks up
    anything that still fails.
    """
    if not SOCIAL_WEBHOOK or not message_id:
        return False
    url = f"{SOCIAL_WEBHOOK}/messages/{message_id}"
    last_err = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": DISCORD_UA},
                method="DELETE",
            )
            urllib.request.urlopen(req, timeout=15).read()
            return True
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return True
            last_err = f"HTTP {e.code}"
            if e.code >= 500 or e.code == 429:
                time.sleep(0.5 * (2 ** attempt))
                continue
            break
        except Exception as e:
            last_err = str(e)
            time.sleep(0.5 * (2 ** attempt))
    print(f"discord_delete {message_id} → {last_err}", file=sys.stderr)
    return False


def transition(message_id: str, new_status: str) -> dict | None:
    """Move a draft from 'posted' to new_status. Returns the updated draft,
    or None if no match / wrong starting state."""
    return _transition_many([message_id], new_status).get(message_id)


def _transition_many(message_ids: list[str], new_status: str) -> dict[str, dict]:
    """Batch transition — atomic on drafts.jsonl, then network deletes
    outside the lock. Returns map of message_id → updated draft.

    Discord deletes that fail (after inline retry) are marked with
    discord_delete_pending=True so the listener sweep can retry them.
    """
    result: dict[str, dict] = {}
    to_delete: list[str] = []
    target_ids = set(message_ids)
    with _drafts_lock:
        drafts = load_drafts()
        now = datetime.now(timezone.utc).isoformat()
        changed = False
        for d in drafts:
            if d.get("message_id") not in target_ids:
                continue
            if d.get("status") == "posted":
                d["status"] = new_status
                d["decided_at"] = now
                changed = True
                to_delete.append(d["message_id"])
            result[d["message_id"]] = d
        if changed:
            save_drafts(drafts)
    failed: list[str] = []
    for mid in to_delete:
        if not discord_delete(mid):
            failed.append(mid)
    if failed:
        with _drafts_lock:
            drafts = load_drafts()
            failed_set = set(failed)
            for d in drafts:
                if d.get("message_id") in failed_set:
                    d["discord_delete_pending"] = True
            save_drafts(drafts)
    return result


def _group_key(d: dict) -> tuple[str, str]:
    """How a draft groups in the swiper.

    Replies → one group per Bluesky reply target (keyed on URI), since each
    targets a distinct upstream post. Standalones → one group per `topic`,
    so all platform variants for "Apple WWDC 2026 at Apple Park" stack
    on a single swipeable card.
    """
    if d.get("type") == "reply":
        rt = d.get("reply_to") or {}
        return ("reply", rt.get("uri") or d.get("message_id") or "")
    return ("topic", d.get("topic") or d.get("message_id") or "")


def build_groups(drafts: list[dict]) -> list[dict]:
    """Bundle posted drafts into swipeable groups."""
    by_key: dict[tuple[str, str], dict] = {}
    order: list[tuple[str, str]] = []
    for d in drafts:
        if d.get("status") != "posted" or not d.get("message_id"):
            continue
        key = _group_key(d)
        if key not in by_key:
            by_key[key] = {
                "kind": key[0],
                "group_id": f"{key[0]}:{key[1]}",
                "topic": d.get("topic") or "",
                "why_trending": d.get("why_trending") or "",
                "reply_to": d.get("reply_to") if d.get("type") == "reply" else None,
                "sources": d.get("sources") or [],
                "drafts": [],
                # newest record's drafted_at — used for sort below
                "drafted_at": d.get("drafted_at") or "",
                # Image is shared across all platform variants in a trend group.
                # First record with an image_path wins; absent for replies.
                "image_url": d.get("image_url") or "",
                "image_prompt": d.get("image_prompt") or "",
            }
            order.append(key)
        bucket = by_key[key]
        bucket["drafts"].append({
            "message_id": d.get("message_id"),
            "platform": d.get("platform"),
            "type": d.get("type", "standalone"),
            "text": d.get("text") or "",
        })
        # Sources cumulative across the group (de-duped by url)
        seen = {s.get("url") for s in bucket["sources"] if s.get("url")}
        for s in (d.get("sources") or []):
            if s.get("url") and s["url"] not in seen:
                bucket["sources"].append(s)
                seen.add(s["url"])
        # Keep group's drafted_at = newest
        if (d.get("drafted_at") or "") > bucket["drafted_at"]:
            bucket["drafted_at"] = d.get("drafted_at") or ""
    # Sort drafts within a group by a stable platform order
    PLATFORM_ORDER = ["twitter", "x", "bluesky", "threads", "facebook",
                      "instagram", "mastodon"]
    def pkey(d):
        p = (d.get("platform") or "").lower()
        return (PLATFORM_ORDER.index(p) if p in PLATFORM_ORDER else 99, p)
    groups = []
    for key in order:
        g = by_key[key]
        g["drafts"].sort(key=pkey)
        groups.append(g)
    # newest-first
    groups.sort(key=lambda g: g["drafted_at"], reverse=True)
    return groups


# -----------------------------------------------------------------------------
# HTTP handlers
# -----------------------------------------------------------------------------

INDEX_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>social-cat swiper</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #FAF9F6;
    --fg: #1A1A1A;
    --muted: #888;
    --line: #E5E2DB;
    --reject: #C0392B;
    --approve: #2C6B4F;
    --accent: #1d9bf0;
  }
  html, body { height: 100%; background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  body { display: flex; flex-direction: column; align-items: center;
    padding: env(safe-area-inset-top) 16px env(safe-area-inset-bottom);
    overscroll-behavior: none; touch-action: pan-y;
  }
  header {
    width: 100%; max-width: 560px;
    padding: 14px 0 8px;
    display: flex; align-items: baseline; justify-content: space-between;
  }
  h1 { font-size: 12px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--muted); font-weight: 700;
  }
  .count { font-size: 12px; color: var(--muted); }
  .deck {
    width: 100%; max-width: 560px; flex: 1;
    display: flex; align-items: center; justify-content: center;
    position: relative; min-height: 60vh;
    margin: 8px 0;
  }
  .card {
    width: 100%;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 22px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.04);
    transition: transform 0.25s ease-out, opacity 0.25s ease-out;
    touch-action: pan-y;
    user-select: none;
  }
  .card.swipe-left { transform: translateX(-120vw) rotate(-8deg); opacity: 0; }
  .card.swipe-right { transform: translateX(120vw) rotate(8deg); opacity: 0; }
  .card .kind { display: flex; gap: 8px; align-items: center;
    font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
    font-weight: 700; color: var(--muted); margin-bottom: 6px;
  }
  .card .topic { font-size: 17px; font-weight: 700; margin-bottom: 6px;
    color: var(--fg); line-height: 1.25;
  }
  .card .why { font-size: 12px; color: var(--muted); font-style: italic;
    margin-bottom: 14px; line-height: 1.4;
  }
  .reply-target {
    background: #F4F1EA; border-left: 3px solid var(--accent);
    padding: 10px 12px; border-radius: 6px; margin-bottom: 14px;
    font-size: 13px;
  }
  .reply-target .handle { color: var(--accent); font-weight: 600; margin-bottom: 4px; }
  .reply-target .snippet { color: #555; font-style: italic; }
  .card .image { margin: 8px 0 14px; border-radius: 8px; overflow: hidden;
    border: 1px solid var(--line); background: #f0ece2;
  }
  .card .image img { display: block; width: 100%; height: auto;
    max-height: 360px; object-fit: cover;
  }
  .variants { display: flex; flex-direction: column; gap: 10px;
    margin: 4px 0 8px;
  }
  .variant {
    border: 1px solid var(--line); border-radius: 8px;
    padding: 12px 14px; background: #FDFCFA;
  }
  .variant-head { display: flex; gap: 6px; align-items: center;
    font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
    font-weight: 700; margin-bottom: 6px;
  }
  .variant-head .emoji { font-size: 14px; }
  .variant-head .label-twitter,
  .variant-head .label-x { color: #1A1A1A; }
  .variant-head .label-bluesky { color: #0085ff; }
  .variant-head .label-threads { color: #000; }
  .variant-head .label-facebook { color: #1877F2; }
  .variant-head .label-mastodon { color: #6364FF; }
  .variant-text { font-size: 15px; line-height: 1.45; white-space: pre-wrap;
    word-wrap: break-word; color: var(--fg);
  }
  .variant-meta { font-size: 10px; color: var(--muted); margin-top: 6px;
    text-align: right;
  }
  .meta { font-size: 11px; color: var(--muted); margin-top: 8px;
    display: flex; flex-wrap: wrap; gap: 8px;
  }
  .meta a { color: var(--accent); text-decoration: none; }
  .actions { width: 100%; max-width: 560px;
    display: flex; gap: 12px; padding: 8px 0 18px;
  }
  button { flex: 1; padding: 16px; font-size: 16px; font-weight: 700;
    border: none; border-radius: 12px; cursor: pointer;
    font-family: inherit;
    transition: transform 0.08s, opacity 0.15s;
  }
  button:active { transform: scale(0.97); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-reject { background: var(--reject); color: #fff; }
  .btn-approve { background: var(--approve); color: #fff; }
  .empty { text-align: center; padding: 60px 20px; color: var(--muted); }
  .empty h2 { font-size: 18px; font-weight: 600; margin-bottom: 6px; color: var(--fg); }
  .keymap { font-size: 11px; color: var(--muted); text-align: center;
    padding: 0 0 12px;
  }
  /* ── Engagement card ─────────────────────────────────────────────── */
  .eng-summary { font-size: 13px; color: #4338ca; background: #eef2ff;
    border: 1px solid #c7d2fe; border-radius: 8px; padding: 8px 12px;
    margin-bottom: 14px; font-weight: 600;
  }
  .eng-post { border: 1px solid var(--line); border-radius: 8px;
    padding: 12px 14px; background: #FDFCFA; margin-bottom: 10px;
  }
  .eng-post:last-child { margin-bottom: 0; }
  .eng-post-head { display: flex; align-items: baseline; gap: 8px;
    margin-bottom: 8px; flex-wrap: wrap;
  }
  .eng-post-title { font-size: 14px; font-weight: 600; flex: 1; min-width: 0;
    color: var(--fg); line-height: 1.3;
  }
  .eng-post-title a { color: inherit; text-decoration: none; }
  .eng-post-title a:hover { text-decoration: underline; }
  .eng-post-meta { font-size: 10px; color: var(--muted); white-space: nowrap; }
  .eng-plat-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .eng-pill { display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 9px; border-radius: 999px;
    background: #eef2ff; border: 1px solid #c7d2fe;
    font-size: 11px; color: #4338ca; font-weight: 600;
    text-decoration: none;
  }
  a.eng-pill:hover { background: #e0e7ff; }
  .eng-pill .icon { font-size: 12px; }
  .eng-pill .plus { font-weight: 700; }
  .eng-items { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .eng-item { background: #f5f3ff; border-left: 2px solid #4f46e5;
    padding: 7px 10px; border-radius: 0 4px 4px 0; font-size: 12px;
  }
  .eng-item-head { display: flex; gap: 6px; align-items: baseline;
    font-size: 11px;
  }
  .eng-item-head .author { font-weight: 600; color: var(--fg); }
  .eng-item-head .kind { letter-spacing: 1.5px; text-transform: uppercase;
    font-size: 9px; color: var(--accent); font-weight: 700;
  }
  .eng-item-head .when { color: var(--muted); margin-left: auto; font-size: 10px; }
  .eng-item .text { color: #333; margin-top: 4px; line-height: 1.4;
    word-wrap: break-word; white-space: pre-wrap;
  }
  .eng-item .link { font-size: 10px; color: #4338ca; margin-top: 4px;
    display: inline-block;
  }
  .eng-foot { font-size: 11px; color: var(--muted); margin-top: 12px;
    text-align: center; padding-top: 10px; border-top: 1px solid var(--line);
  }
  .eng-foot a { color: var(--accent); text-decoration: none; }
  /* ── Fortune cat tile ───────────────────────────────────────────── */
  .fortune { text-align: center; padding: 30px 20px 24px; }
  .fortune .cat { font-size: 48px; line-height: 1; margin-bottom: 14px; }
  .fortune .label { font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--muted); font-weight: 700; margin-bottom: 10px;
  }
  .fortune .line { font-size: 17px; line-height: 1.45; color: var(--fg);
    max-width: 420px; margin: 0 auto 18px;
  }
  .fortune .tap { font-size: 11px; color: var(--muted);
    border: 1px solid var(--line); border-radius: 999px;
    padding: 5px 12px; display: inline-block; cursor: pointer;
    background: transparent; font-family: inherit;
    transition: background 0.1s;
  }
  .fortune .tap:hover { background: var(--line); }
  kbd { background: #eee; border: 1px solid #ddd; border-radius: 3px;
    padding: 1px 5px; font-size: 11px; margin: 0 2px;
    font-family: ui-monospace, "SF Mono", monospace;
  }
  .image-and-variants .variants { margin-top: 0; }
  @media (min-width: 900px) {
    header, .deck, .actions { max-width: 1080px; }
    .image-and-variants.has-image {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 22px;
      align-items: start;
      margin: 4px 0 8px;
    }
    .image-and-variants.has-image .image {
      margin: 0;
      position: sticky;
      top: 16px;
      align-self: start;
    }
    .image-and-variants.has-image .image img {
      max-height: calc(100vh - 120px);
    }
    .image-and-variants.has-image .variants {
      margin: 0;
    }
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #181715; --fg: #f0ece5; --muted: #888; --line: #2a2826; }
    .card { background: #211f1c; box-shadow: none; }
    .reply-target { background: #2a2826; }
    .reply-target .snippet { color: #999; }
    .variant { background: #1c1b18; }
    kbd { background: #2a2826; border-color: #3a3835; color: #ccc; }
    .eng-summary { background: #1e1b3a; border-color: #3730a3; color: #c7d2fe; }
    .eng-post { background: #1c1b18; }
    .eng-pill { background: #1e1b3a; border-color: #3730a3; color: #c7d2fe; }
    .eng-item { background: #1e1b3a; border-left-color: #6366f1; }
    .eng-item .text { color: #d4d4d8; }
  }
</style>
</head>
<body>
  <header>
    <h1>social-cat</h1>
    <span class="count" id="count">—</span>
  </header>
  <div class="deck" id="deck"></div>
  <div class="keymap" id="keymap">← drop · → approve · <kbd>J</kbd>/<kbd>K</kbd> also work</div>
  <div class="actions" id="actions">
    <button class="btn-reject" id="rejectBtn" disabled>✕ Drop</button>
    <button class="btn-approve" id="approveBtn" disabled>✓ Approve</button>
  </div>

<script>
const PLATFORM_EMOJI = {
  twitter: "🐦", x: "𝕏", bluesky: "🦋", threads: "🧵",
  instagram: "📷", mastodon: "🐘", facebook: "📘", pinterest: "📌",
};
const esc = (s) => String(s == null ? "" : s).replace(/[<&"']/g, c => ({"<":"&lt;","&":"&amp;",'"':"&quot;","'":"&#39;"}[c]));
const ENGAGEMENT_DASHBOARD_URL = `${location.protocol}//${location.hostname}:3456/engagement`;
const LS_BASELINE = "sbt-swiper-eng-baseline-v1";
const LS_DISMISSED = "sbt-swiper-eng-dismissed-at-v1";

// Pool of cat-fact + fortune-cookie lines for the terminal "nothing new" tile.
// Keep the list long so swipes/taps feel like a different message each time.
const CAT_LINES = [
  // Cat facts
  "A group of cats is a clowder.",
  "A cat's purr vibrates between 25–150 Hz — the frequency at which bone tissue regrows.",
  "Cats sleep 13–16 hours a day. Aspirational.",
  "The loudest purr ever recorded was 67.8 dB.",
  "A cat has 32 muscles in each ear.",
  "Each cat's nose print is unique, like a human fingerprint.",
  "Cats can rotate their ears 180 degrees.",
  "The first cat in space was Félicette, in 1963.",
  "A cat's whiskers are about as wide as its body.",
  "Cats can't taste sweetness.",
  "Domestic cats share 95.6% of their DNA with tigers.",
  "Cats walk like camels — both right legs, then both left.",
  "A cat's heart beats nearly twice as fast as a human's.",
  "Cats spend roughly 30% of their waking hours grooming.",
  "Adult cats only meow at humans — barely at each other.",
  // South Bay quips
  "The 101 will always be like this.",
  "Somewhere, a Caltrain horn is sounding.",
  "El Camino has more lanes than it needs and not enough left turns.",
  "The fog is on its way.",
  "Lawrence Expressway is technically a road.",
  "Levi's is a stadium most weeks of the year.",
  "Mountain View knows what it did.",
  "Cupertino smells like rosemary in May.",
  "Saratoga has its own microclimate, ask its trees.",
  "Mt. Umunhum sees you.",
  "It is taco Tuesday somewhere in San José.",
  "Coyote Creek Trail at sunset > anything you've ever scrolled.",
  "Almaden Quicksilver knows your secrets.",
  "The Winchester House has more questions than answers.",
  "Capitola is having a beautiful afternoon.",
  // Absurd fortunes
  "A pigeon you have never met thinks fondly of you.",
  "The bug fix you're avoiding is, in fact, the side quest.",
  "Your future self thanks you for committing that thing.",
  "Pop quiz: is it cold-brew o'clock yet.",
  "Somewhere, a printer is working on the first try.",
  "The semicolon was always optional.",
  "Tabs vs spaces is a generational trauma.",
  "There are no shortcuts, but there are aliases.",
  "Refactor when the moon is full. Or don't. Mostly don't.",
  "If you'd written it in Rust, it would still segfault.",
  "Stand up. Right now. You earned it.",
  "Drink water. Even though you don't want to.",
  // Vibes
  "Caught up. Probably.",
  "All clear. The cats have it from here.",
  "Quiet on set. The South Bay sleeps.",
  "Cat is on patrol. You can rest.",
  "Pure signal. No notifications.",
  "Inbox: zero. Heart: full. Battery: 14%.",
];
const CAT_EMOJI = ["🐈", "🐈‍⬛", "🐱", "😸", "😹", "😺", "😻", "🙀", "😼", "😽"];

let draftQueue = [];          // array of group objects from /api/pending
let engagement = null;        // raw payload from /api/engagement
let phase = "drafts";         // "drafts" | "engagement" | "fortune"
let current = null;           // current draft group (only when phase === "drafts")
let engagementMeta = null;    // { posts, newCount } when phase === "engagement"
let busy = false;
let fortunePick = pickFortune();

function pickFortune() {
  const line = CAT_LINES[Math.floor(Math.random() * CAT_LINES.length)];
  const emoji = CAT_EMOJI[Math.floor(Math.random() * CAT_EMOJI.length)];
  return { line, emoji };
}

function hourFloorMs(t) {
  const d = (t instanceof Date) ? new Date(t.getTime()) : new Date(t);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function loadBaseline() {
  try { return JSON.parse(localStorage.getItem(LS_BASELINE) || "null"); } catch (e) { return null; }
}
function loadDismissedAt() {
  try { return localStorage.getItem(LS_DISMISSED) || null; } catch (e) { return null; }
}
function platTotal(p) {
  const c = (p && p.counts) || {};
  return (c.likes||0) + (c.reposts||0) + (c.quotes||0) + (c.replies||0);
}
function snapshotFromEngagement(eng) {
  const snap = {};
  for (const post of (eng?.posts || [])) {
    snap[post.key] = {};
    for (const [k, p] of Object.entries(post.platforms || {})) {
      snap[post.key][k] = {
        likes: p?.counts?.likes || 0,
        reposts: p?.counts?.reposts || 0,
        quotes: p?.counts?.quotes || 0,
        replies: p?.counts?.replies || 0,
      };
    }
  }
  return snap;
}

// Walk current engagement vs baseline (or "all new" when no baseline) and
// surface only posts/platforms with positive deltas. Reply + quote text
// items are filtered to those whose timestamp is after lastDismissedAt
// (or all of them on first visit).
function computeEngagementMeta() {
  if (!engagement || !(engagement.posts || []).length) {
    return { posts: [], newCount: 0 };
  }
  const baseline = loadBaseline();
  const dismissedAt = loadDismissedAt();
  const dismissedMs = dismissedAt ? new Date(dismissedAt).getTime() : 0;
  const posts = [];
  let newCount = 0;
  for (const post of (engagement.posts || [])) {
    const prev = (baseline && baseline[post.key]) || null;
    const plats = [];
    for (const [k, p] of Object.entries(post.platforms || {})) {
      const counts = p?.counts || {};
      const cur = {
        likes: counts.likes || 0,
        reposts: counts.reposts || 0,
        quotes: counts.quotes || 0,
        replies: counts.replies || 0,
      };
      const prevPlat = prev && prev[k] ? prev[k] : null;
      // No baseline at all (first visit) → everything is new.
      // Otherwise compute deltas vs the saved snapshot.
      const deltas = prevPlat
        ? {
            likes: Math.max(0, cur.likes - (prevPlat.likes || 0)),
            reposts: Math.max(0, cur.reposts - (prevPlat.reposts || 0)),
            quotes: Math.max(0, cur.quotes - (prevPlat.quotes || 0)),
            replies: Math.max(0, cur.replies - (prevPlat.replies || 0)),
          }
        : { ...cur };
      const totalDelta = deltas.likes + deltas.reposts + deltas.quotes + deltas.replies;
      const newReplies = (p.replies || []).filter(r =>
        r && r.at && (!dismissedMs || new Date(r.at).getTime() > dismissedMs)
      );
      const newQuotes = (p.quotes || []).filter(q =>
        q && q.at && (!dismissedMs || new Date(q.at).getTime() > dismissedMs)
      );
      if (totalDelta === 0 && newReplies.length === 0 && newQuotes.length === 0) continue;
      plats.push({
        platform: k,
        permalink: p.permalink || "",
        deltas,
        totalDelta,
        newReplies,
        newQuotes,
      });
    }
    if (!plats.length) continue;
    const postTotal = plats.reduce((n, pl) => n + pl.totalDelta, 0);
    newCount += postTotal;
    posts.push({ post, platforms: plats });
  }
  return { posts, newCount };
}

function shouldShowEngagement() {
  const dismissedAt = loadDismissedAt();
  if (dismissedAt) {
    const nowFloor = hourFloorMs(new Date());
    const dismissedFloor = hourFloorMs(dismissedAt);
    if (nowFloor <= dismissedFloor) return null;  // still inside the dismissed hour
  }
  const meta = computeEngagementMeta();
  return meta.newCount > 0 ? meta : null;
}

async function fetchPending() {
  try {
    const r = await fetch("/api/pending");
    return r.ok ? r.json() : [];
  } catch (e) { return []; }
}
async function fetchEngagement() {
  try {
    const r = await fetch("/api/engagement");
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}

function renderCount() {
  const el = document.getElementById("count");
  if (phase === "drafts" && draftQueue.length) {
    const variantCount = draftQueue.reduce((n, g) => n + (g.drafts || []).length, 0);
    el.textContent = `${draftQueue.length} topic${draftQueue.length === 1 ? "" : "s"} · ${variantCount} variant${variantCount === 1 ? "" : "s"}`;
  } else if (phase === "engagement") {
    const n = engagementMeta?.newCount || 0;
    el.textContent = `${n} new interaction${n === 1 ? "" : "s"}`;
  } else {
    el.textContent = "all caught up";
  }
}

function variantHtml(d) {
  const platform = (d.platform || "?").toLowerCase();
  const emoji = PLATFORM_EMOJI[platform] || "📝";
  return `
    <div class="variant">
      <div class="variant-head">
        <span class="emoji">${emoji}</span>
        <span class="label-${platform}">${platform}</span>
      </div>
      <div class="variant-text">${esc(d.text)}</div>
      <div class="variant-meta">${(d.text || "").length} chars</div>
    </div>`;
}

function renderDraft(deck) {
  current = draftQueue[0];
  const card = document.createElement("div");
  card.className = "card";
  card.id = "card";

  let replyHtml = "";
  if (current.kind === "reply" && current.reply_to) {
    const rt = current.reply_to;
    const handle = rt.author_handle ? `@${rt.author_handle}` : (rt.source || "target");
    const url = rt.url || "";
    const snippet = esc(rt.text_snippet);
    replyHtml = `
      <div class="reply-target">
        <div class="handle">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">↳ replying to ${esc(handle)}</a>` : `↳ replying to ${esc(handle)}`}</div>
        <div class="snippet">${snippet}</div>
      </div>`;
  }

  const srcLinks = (current.sources || [])
    .filter(s => s.url)
    .slice(0, 4)
    .map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.source)}</a>`)
    .join(" · ");

  const why = current.why_trending
    ? `<div class="why">${esc(current.why_trending)}</div>` : "";

  const imageHtml = current.image_url
    ? `<div class="image"><img src="${esc(current.image_url)}" alt="${esc(current.image_prompt || "")}" loading="lazy"></div>`
    : "";

  const variantsCount = (current.drafts || []).length;
  const kindLabel = current.kind === "reply"
    ? `${variantsCount} reply` : `${variantsCount} platform${variantsCount === 1 ? "" : "s"}`;
  const topic = esc(current.topic || (current.kind === "reply" ? "Bluesky reply" : "trend"));

  const imageAndVariantsCls = current.image_url ? "image-and-variants has-image" : "image-and-variants";
  card.innerHTML = `
    <div class="kind">${current.kind === "reply" ? "Reply" : "Trend"} · ${kindLabel}</div>
    <div class="topic">${topic}</div>
    ${why}
    ${replyHtml}
    <div class="${imageAndVariantsCls}">
      ${imageHtml}
      <div class="variants">
        ${(current.drafts || []).map(variantHtml).join("")}
      </div>
    </div>
    ${srcLinks ? `<div class="meta">${srcLinks}</div>` : ""}
  `;
  deck.appendChild(card);
  bindGestures(card, "draft");
}

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 14) return d + "d ago";
  return new Date(ts).toLocaleDateString();
}

function engPillHtml(plat, p) {
  const icon = PLATFORM_EMOJI[plat] || "📝";
  const segs = [];
  if (p.deltas.likes > 0) segs.push(`<span class="plus">+${p.deltas.likes}</span> likes`);
  if (p.deltas.reposts > 0) segs.push(`<span class="plus">+${p.deltas.reposts}</span> reposts`);
  if (p.deltas.quotes > 0) segs.push(`<span class="plus">+${p.deltas.quotes}</span> quotes`);
  if (p.deltas.replies > 0) segs.push(`<span class="plus">+${p.deltas.replies}</span> replies`);
  const inner = segs.join(" · ") || `<span class="plus">new</span>`;
  const body = `<span class="icon">${icon}</span>${inner}`;
  return p.permalink
    ? `<a class="eng-pill" href="${esc(p.permalink)}" target="_blank" rel="noopener">${body}</a>`
    : `<span class="eng-pill">${body}</span>`;
}

function engItemHtml(item, kind) {
  const author = "@" + esc(item.author || "unknown");
  const text = esc(item.text || "");
  const link = item.permalink
    ? `<a class="link" href="${esc(item.permalink)}" target="_blank" rel="noopener">view →</a>`
    : "";
  return `
    <div class="eng-item">
      <div class="eng-item-head">
        <span class="kind">${kind}</span>
        <span class="author">${author}</span>
        <span class="when">${esc(timeAgo(item.at))}</span>
      </div>
      <div class="text">${text}</div>
      ${link}
    </div>`;
}

function renderEngagement(deck) {
  const meta = engagementMeta;
  const card = document.createElement("div");
  card.className = "card";
  card.id = "card";

  const postBlocks = meta.posts.map(({ post, platforms }) => {
    const pills = platforms.map(p => engPillHtml(p.platform, p)).join("");
    const items = platforms
      .flatMap(p => [
        ...p.newReplies.map(r => engItemHtml(r, "reply")),
        ...p.newQuotes.map(q => engItemHtml(q, "quote")),
      ])
      .join("");
    // Prefer the first available platform permalink as the title link
    const firstLink = platforms.find(p => p.permalink)?.permalink || "";
    const title = firstLink
      ? `<a href="${esc(firstLink)}" target="_blank" rel="noopener">${esc(post.title)}</a>`
      : esc(post.title);
    return `
      <div class="eng-post">
        <div class="eng-post-head">
          <div class="eng-post-title">${title}</div>
          <div class="eng-post-meta">${esc(timeAgo(post.publishedAt))}</div>
        </div>
        <div class="eng-plat-row">${pills}</div>
        ${items ? `<div class="eng-items">${items}</div>` : ""}
      </div>`;
  }).join("");

  card.innerHTML = `
    <div class="kind">📡 Signal · ${meta.newCount} new</div>
    <div class="eng-summary">${meta.newCount} new interaction${meta.newCount === 1 ? "" : "s"} since you last checked</div>
    ${postBlocks}
    <div class="eng-foot">
      <a href="${esc(ENGAGEMENT_DASHBOARD_URL)}" target="_blank" rel="noopener">open full dashboard →</a>
    </div>
  `;
  deck.appendChild(card);
  bindGestures(card, "engagement");
}

function renderFortune(deck) {
  const card = document.createElement("div");
  card.className = "card";
  card.id = "card";
  card.innerHTML = `
    <div class="fortune">
      <div class="cat">${fortunePick.emoji}</div>
      <div class="label">caught up</div>
      <div class="line">${esc(fortunePick.line)}</div>
      <button class="tap" id="fortuneTap" type="button">🎲 another</button>
    </div>
  `;
  deck.appendChild(card);
  // Tap button re-rolls without leaving the fortune phase (no dismiss).
  const tapBtn = card.querySelector("#fortuneTap");
  if (tapBtn) tapBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fortunePick = pickFortune();
    render();
  });
  bindGestures(card, "fortune");
}

function syncActions() {
  const reject = document.getElementById("rejectBtn");
  const approve = document.getElementById("approveBtn");
  const keymap = document.getElementById("keymap");
  if (phase === "drafts" && draftQueue.length) {
    reject.style.display = "";
    approve.style.display = "";
    reject.disabled = false;
    approve.disabled = false;
    reject.textContent = "✕ Drop";
    approve.textContent = "✓ Approve";
    keymap.innerHTML = "← drop · → approve · <kbd>J</kbd>/<kbd>K</kbd> also work";
  } else if (phase === "engagement") {
    reject.style.display = "none";
    approve.style.display = "";
    approve.disabled = false;
    approve.textContent = "✓ Got it";
    keymap.innerHTML = "← or → to dismiss · click any link to jump to the post";
  } else {
    // fortune
    reject.style.display = "none";
    approve.style.display = "";
    approve.disabled = false;
    approve.textContent = "🎲 Another";
    keymap.innerHTML = "← / → re-rolls · tap the button too";
  }
}

function render() {
  const deck = document.getElementById("deck");
  deck.innerHTML = "";
  // Phase selection: drafts > engagement (if eligible) > fortune
  if (draftQueue.length) {
    phase = "drafts";
    current = null;
    engagementMeta = null;
    renderDraft(deck);
  } else {
    const meta = shouldShowEngagement();
    if (meta) {
      phase = "engagement";
      current = null;
      engagementMeta = meta;
      renderEngagement(deck);
    } else {
      phase = "fortune";
      current = null;
      engagementMeta = null;
      renderFortune(deck);
    }
  }
  syncActions();
  renderCount();
}

function bindGestures(card, kind) {
  let startX = 0, startY = 0, dx = 0, dy = 0, tracking = false;
  card.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    // Don't treat taps on links/buttons as the start of a swipe.
    if (e.target.closest("a, button")) { tracking = false; return; }
    tracking = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    card.style.transition = "none";
  }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (!tracking) return;
    dx = e.touches[0].clientX - startX;
    dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy)) {
      card.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
    }
  }, { passive: true });
  card.addEventListener("touchend", () => {
    if (!tracking) return;
    tracking = false;
    card.style.transition = "transform 0.2s, opacity 0.2s";
    if (dx > 100) action(kind, "right");
    else if (dx < -100) action(kind, "left");
    else { card.style.transform = ""; dx = 0; }
  });
}

// Unified gesture/button handler that routes by phase.
function action(kind, direction) {
  if (busy) return;
  if (kind === "draft") {
    decide(direction === "right" ? "approved" : "rejected");
  } else if (kind === "engagement") {
    dismissEngagement(direction);
  } else {
    // fortune: re-roll
    fortunePick = pickFortune();
    render();
  }
}

function dismissEngagement(direction) {
  busy = true;
  const card = document.getElementById("card");
  if (card) card.classList.add(direction === "right" ? "swipe-right" : "swipe-left");
  try {
    localStorage.setItem(LS_BASELINE, JSON.stringify(snapshotFromEngagement(engagement)));
    localStorage.setItem(LS_DISMISSED, new Date().toISOString());
  } catch (e) {}
  setTimeout(() => {
    fortunePick = pickFortune();
    engagementMeta = null;
    render();
    busy = false;
  }, 220);
}

async function decide(decision) {
  if (busy || !current) return;
  busy = true;
  const groupId = current.group_id;
  const messageIds = (current.drafts || []).map(d => d.message_id);
  const card = document.getElementById("card");
  if (card) card.classList.add(decision === "approved" ? "swipe-right" : "swipe-left");
  try {
    await fetch(`/api/${decision === "approved" ? "approve" : "reject"}`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message_ids: messageIds}),
    });
  } catch (e) {
    console.error(e);
  }
  draftQueue = draftQueue.filter(g => g.group_id !== groupId);
  setTimeout(() => { render(); busy = false; }, 220);
  setTimeout(refresh, 1500);
}

async function refresh() {
  const [fresh, eng] = await Promise.all([fetchPending(), fetchEngagement()]);
  // Preserve the head draft if it's still pending (so a slow refresh doesn't
  // jump us off the card we're looking at).
  const currentId = current?.group_id;
  draftQueue = fresh;
  if (currentId && draftQueue.find(g => g.group_id === currentId)) {
    draftQueue = [draftQueue.find(g => g.group_id === currentId)].concat(
      draftQueue.filter(g => g.group_id !== currentId)
    );
  }
  engagement = eng;
  if (!busy) render();
}

document.getElementById("rejectBtn").onclick = () => {
  if (phase === "drafts") action("draft", "left");
  // hidden in other phases
};
document.getElementById("approveBtn").onclick = () => {
  if (phase === "drafts") action("draft", "right");
  else if (phase === "engagement") action("engagement", "right");
  else action("fortune", "right");
};
window.addEventListener("keydown", (e) => {
  // Ignore arrows / J / K when typing in a form field
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "j") action(phaseKind(), "left");
  else if (e.key === "ArrowRight" || e.key.toLowerCase() === "k") action(phaseKind(), "right");
});
function phaseKind() {
  return phase === "drafts" ? "draft" : phase;
}

refresh();
setInterval(refresh, 30000);
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, content_type: str):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, code: int, payload):
        self._send(code, json.dumps(payload).encode("utf-8"), "application/json")

    def log_message(self, fmt, *args):  # quieter access log
        sys.stderr.write(f"[swiper] {self.address_string()} {fmt % args}\n")

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self._send(200, INDEX_HTML.encode("utf-8"), "text/html; charset=utf-8")
            return
        if self.path == "/api/pending":
            with _drafts_lock:
                drafts = load_drafts()
            groups = build_groups(drafts)
            self._send_json(200, groups)
            return
        if self.path == "/api/engagement":
            self._send_json(200, load_engagement())
            return
        if self.path == "/healthz":
            self._send(200, b"ok\n", "text/plain")
            return
        self._send(404, b"not found\n", "text/plain")

    def do_POST(self):
        if self.path not in ("/api/approve", "/api/reject"):
            self._send(404, b"not found\n", "text/plain")
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "bad json"})
            return
        # Accept either a single message_id or an array of message_ids.
        ids = body.get("message_ids")
        if not ids and body.get("message_id"):
            ids = [body["message_id"]]
        if not ids:
            self._send_json(400, {"error": "message_ids required"})
            return
        new_status = "approved" if self.path.endswith("/approve") else "rejected"
        updated = _transition_many(ids, new_status)
        if not updated:
            self._send_json(404, {"error": "not found"})
            return
        self._send_json(200, {"ok": True, "count": len(updated)})


def main():
    load_env()
    if not SOCIAL_WEBHOOK and not os.environ.get("SOCIAL_WEBHOOK"):
        print("WARNING: SOCIAL_WEBHOOK not set — Discord deletions will be skipped",
              file=sys.stderr)
    # Re-read in case load_env populated it after module load
    globals()["SOCIAL_WEBHOOK"] = os.environ.get("SOCIAL_WEBHOOK", "")
    bind_host = os.environ.get("SWIPER_BIND", "0.0.0.0")
    server = FastHTTPServer((bind_host, PORT), Handler)
    print(f"[swiper] listening on http://{bind_host}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
