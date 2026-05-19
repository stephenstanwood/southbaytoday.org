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
    """DELETE the Discord webhook message. Returns True on 2xx or 404."""
    if not SOCIAL_WEBHOOK or not message_id:
        return False
    url = f"{SOCIAL_WEBHOOK}/messages/{message_id}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": DISCORD_UA},
        method="DELETE",
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
        return True
    except urllib.error.HTTPError as e:
        # 404 = already deleted, count as success
        if e.code == 404:
            return True
        print(f"discord_delete {message_id} → HTTP {e.code}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"discord_delete {message_id} → {e}", file=sys.stderr)
        return False


def transition(message_id: str, new_status: str) -> dict | None:
    """Move a draft from 'posted' to new_status. Returns the updated draft,
    or None if no match / wrong starting state."""
    return _transition_many([message_id], new_status).get(message_id)


def _transition_many(message_ids: list[str], new_status: str) -> dict[str, dict]:
    """Batch transition — atomic on drafts.jsonl, then network deletes
    outside the lock. Returns map of message_id → updated draft."""
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
    for mid in to_delete:
        discord_delete(mid)
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
  kbd { background: #eee; border: 1px solid #ddd; border-radius: 3px;
    padding: 1px 5px; font-size: 11px; margin: 0 2px;
    font-family: ui-monospace, "SF Mono", monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #181715; --fg: #f0ece5; --muted: #888; --line: #2a2826; }
    .card { background: #211f1c; box-shadow: none; }
    .reply-target { background: #2a2826; }
    .reply-target .snippet { color: #999; }
    .variant { background: #1c1b18; }
    kbd { background: #2a2826; border-color: #3a3835; color: #ccc; }
  }
</style>
</head>
<body>
  <header>
    <h1>social-cat</h1>
    <span class="count" id="count">—</span>
  </header>
  <div class="deck" id="deck"></div>
  <div class="keymap">← drop · → approve · <kbd>J</kbd>/<kbd>K</kbd> also work</div>
  <div class="actions">
    <button class="btn-reject" id="rejectBtn" disabled>✕ Drop</button>
    <button class="btn-approve" id="approveBtn" disabled>✓ Approve</button>
  </div>

<script>
const PLATFORM_EMOJI = {
  twitter: "🐦", x: "🐦", bluesky: "🦋", threads: "🧵",
  instagram: "📸", mastodon: "🐘", facebook: "📘",
};
const esc = (s) => (s || "").replace(/[<&]/g, c => ({"<":"&lt;","&":"&amp;"}[c]));

let queue = [];   // array of group objects from /api/pending
let current = null;
let busy = false;

async function fetchPending() {
  const r = await fetch("/api/pending");
  if (!r.ok) return [];
  return r.json();
}

function renderCount() {
  const el = document.getElementById("count");
  if (!queue.length) {
    el.textContent = "all caught up";
    return;
  }
  const variantCount = queue.reduce((n, g) => n + (g.drafts || []).length, 0);
  el.textContent = `${queue.length} topic${queue.length === 1 ? "" : "s"} · ${variantCount} variant${variantCount === 1 ? "" : "s"}`;
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

function render() {
  const deck = document.getElementById("deck");
  deck.innerHTML = "";
  if (!queue.length) {
    deck.innerHTML = `<div class="empty"><h2>🐈 caught up</h2><p>nothing to swipe — new batch every 3h</p></div>`;
    document.getElementById("rejectBtn").disabled = true;
    document.getElementById("approveBtn").disabled = true;
    current = null;
    renderCount();
    return;
  }
  current = queue[0];
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
        <div class="handle">${url ? `<a href="${url}" target="_blank" rel="noopener">↳ replying to ${handle}</a>` : `↳ replying to ${handle}`}</div>
        <div class="snippet">${snippet}</div>
      </div>`;
  }

  const srcLinks = (current.sources || [])
    .filter(s => s.url)
    .slice(0, 4)
    .map(s => `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.source)}</a>`)
    .join(" · ");

  const why = current.why_trending
    ? `<div class="why">${esc(current.why_trending)}</div>` : "";

  const variantsCount = (current.drafts || []).length;
  const kindLabel = current.kind === "reply"
    ? `${variantsCount} reply` : `${variantsCount} platform${variantsCount === 1 ? "" : "s"}`;
  const topic = esc(current.topic || (current.kind === "reply" ? "Bluesky reply" : "trend"));

  card.innerHTML = `
    <div class="kind">${current.kind === "reply" ? "Reply" : "Trend"} · ${kindLabel}</div>
    <div class="topic">${topic}</div>
    ${why}
    ${replyHtml}
    <div class="variants">
      ${(current.drafts || []).map(variantHtml).join("")}
    </div>
    ${srcLinks ? `<div class="meta">${srcLinks}</div>` : ""}
  `;
  deck.appendChild(card);
  document.getElementById("rejectBtn").disabled = false;
  document.getElementById("approveBtn").disabled = false;
  renderCount();
  bindGestures(card);
}

function bindGestures(card) {
  let startX = 0, startY = 0, dx = 0, dy = 0, tracking = false;
  card.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
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
    if (dx > 100) decide("approved");
    else if (dx < -100) decide("rejected");
    else { card.style.transform = ""; dx = 0; }
  });
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
  queue = queue.filter(g => g.group_id !== groupId);
  setTimeout(() => { render(); busy = false; }, 220);
  setTimeout(refresh, 1500);
}

async function refresh() {
  const fresh = await fetchPending();
  const currentId = current?.group_id;
  queue = fresh;
  if (currentId && queue.find(g => g.group_id === currentId)) {
    queue = [queue.find(g => g.group_id === currentId)].concat(
      queue.filter(g => g.group_id !== currentId)
    );
  }
  if (!busy) render();
}

document.getElementById("rejectBtn").onclick = () => decide("rejected");
document.getElementById("approveBtn").onclick = () => decide("approved");
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "j") decide("rejected");
  else if (e.key === "ArrowRight" || e.key.toLowerCase() === "k") decide("approved");
});

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
