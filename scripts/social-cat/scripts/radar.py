#!/usr/bin/env python3
"""Trend radar — fetch "what's happening" items from social aggregators.

Polite scraping: User-Agent, modest timeouts. Stdlib only — no requests/bs4.

Sources:
  - Reddit r/popular  (JSON API)
  - Hacker News       (Firebase JSON)
  - BuzzFeed RSS      (RSS 2.0)
  - Mashable RSS      (RSS 2.0)

Output: data/trends_raw.jsonl (overwritten each run).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
OUT_PATH = DATA_DIR / "trends_raw.jsonl"

USER_AGENT = (
    "Mozilla/5.0 (compatible; social-cat/0.1; +https://stanwood.dev; "
    "contact: stephen@stanwood.dev)"
)
TIMEOUT = 20


def http_get(
    url: str,
    accept: str = "application/json",
    *,
    max_attempts: int = 4,
    base_backoff: float = 2.0,
) -> bytes:
    """GET with exponential backoff on 429 / 403 / 5xx.

    Reddit in particular will 403 if hammered too fast — we back off and
    retry rather than fail the whole radar.
    """
    last_err = None
    for attempt in range(max_attempts):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": accept,
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last_err = e
            # Retry on 429 (rate limit), 403 (often masked rate limit at
            # Reddit/Cloudflare), or 5xx. 4xx-other = bail.
            if e.code in (403, 429) or 500 <= e.code < 600:
                wait = base_backoff * (2 ** attempt)
                # Respect Retry-After if present
                retry_after = e.headers.get("Retry-After") if e.headers else None
                if retry_after:
                    try:
                        wait = max(wait, float(retry_after))
                    except (TypeError, ValueError):
                        pass
                if attempt < max_attempts - 1:
                    time.sleep(wait)
                    continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            if attempt < max_attempts - 1:
                time.sleep(base_backoff * (2 ** attempt))
                continue
            raise
    if last_err:
        raise last_err
    raise RuntimeError(f"http_get failed without exception: {url}")


def fetch_reddit_popular(limit: int = 25) -> list[dict]:
    """Reddit r/popular hot posts via .json endpoint."""
    url = f"https://www.reddit.com/r/popular.json?limit={limit}"
    data = json.loads(http_get(url))
    items = []
    for child in data.get("data", {}).get("children", []):
        d = child.get("data", {})
        items.append({
            "source": "reddit",
            "id": d.get("id"),
            "title": d.get("title"),
            "url": f"https://reddit.com{d.get('permalink', '')}",
            "external_url": d.get("url_overridden_by_dest") or d.get("url"),
            "score": d.get("score"),
            "comments": d.get("num_comments"),
            "subreddit": d.get("subreddit"),
            "created_utc": d.get("created_utc"),
            "selftext": (d.get("selftext") or "")[:400],
        })
    return items


def fetch_hn_top(limit: int = 20) -> list[dict]:
    """HN front page — fetch IDs then resolve each one (Firebase API)."""
    ids = json.loads(http_get(
        "https://hacker-news.firebaseio.com/v0/topstories.json"
    ))[:limit]
    items = []
    for i in ids:
        try:
            time.sleep(0.05)  # polite
            d = json.loads(http_get(
                f"https://hacker-news.firebaseio.com/v0/item/{i}.json"
            ))
            items.append({
                "source": "hn",
                "id": str(d.get("id")),
                "title": d.get("title"),
                "url": f"https://news.ycombinator.com/item?id={d.get('id')}",
                "external_url": d.get("url"),
                "score": d.get("score"),
                "comments": d.get("descendants"),
                "by": d.get("by"),
            })
        except Exception as e:
            print(f"hn: skip {i} ({e})", file=sys.stderr)
    return items


def _atom_ns(tag: str) -> str:
    return f"{{http://www.w3.org/2005/Atom}}{tag}"


def fetch_rss(source: str, url: str, limit: int = 15) -> list[dict]:
    """Generic RSS/Atom fetcher. Handles both formats."""
    raw = http_get(url, accept="application/rss+xml")
    root = ET.fromstring(raw)
    items = []
    # RSS 2.0
    for entry in root.iter("item"):
        title = (entry.findtext("title") or "").strip()
        link = (entry.findtext("link") or "").strip()
        desc = (entry.findtext("description") or "").strip()
        pub = (entry.findtext("pubDate") or "").strip()
        if title or link:
            items.append({
                "source": source,
                "id": link or title,
                "title": title,
                "url": link,
                "summary": desc[:400],
                "published": pub,
            })
        if len(items) >= limit:
            break
    # Atom fallback
    if not items:
        for entry in root.iter(_atom_ns("entry")):
            title = (entry.findtext(_atom_ns("title")) or "").strip()
            link_el = entry.find(_atom_ns("link"))
            link = link_el.get("href", "").strip() if link_el is not None else ""
            desc = (entry.findtext(_atom_ns("summary")) or "").strip()
            pub = (entry.findtext(_atom_ns("published")) or "").strip()
            if title or link:
                items.append({
                    "source": source,
                    "id": link or title,
                    "title": title,
                    "url": link,
                    "summary": desc[:400],
                    "published": pub,
                })
            if len(items) >= limit:
                break
    return items


# Local-context search terms for the Bluesky reply pool.
# Covers all 11 in-area cities (matches content-rules.mjs in southbaytoday.org)
# plus the regional terms.
LOCAL_TERMS = [
    "south bay",
    "silicon valley",
    "san jose",
    "santa clara",
    "sunnyvale",
    "mountain view",
    "palo alto",
    "los altos",
    "cupertino",
    "campbell",
    "los gatos",
    "saratoga",
    "milpitas",
]

# Only one self-exclude — we don't want to reply to ourselves.
# (Earlier had a competitor blocklist; Stephen clarified the SBT veto was
# about auto-TAGGING competitors in standalones, not replying to anyone.)
SELF_HANDLES = {"southbaytoday.bsky.social"}

# Terms in LOCAL_TERMS that ALSO name places outside our 11-city South Bay.
# Posts matched on these need an extra negative-geo screen — Boston, LA's
# beach cities, Long Island, and San Diego all use "south bay" too and have
# polluted the reply pool before (e.g. @fanexpoboston posting about AMC
# South Bay in Dorchester triggered a draft pretending it was our AMC).
AMBIGUOUS_TERMS = {"south bay"}

# Substrings that strongly indicate a post is about a DIFFERENT region.
# Lowercased. Multi-word phrases only — bare tokens like "ny" / "ma" / "la"
# false-positive on words like "anymore" / "drama" / "later", so keep those
# out. Checked against author handle + displayName + post text.
NEGATIVE_GEO_SIGNALS = (
    # Boston (AMC South Bay theater + South Bay Center mall in Dorchester)
    "boston", "dorchester", "massachusetts", "brookline",
    "amc south bay", "south bay center",
    # NY metro / Long Island
    "long island", "suffolk county", "nassau county",
    "new york city", "brooklyn",
    # LA South Bay (the beach cities cluster)
    "south bay galleria", "torrance", "redondo beach",
    "hermosa beach", "manhattan beach, ca", "el segundo",
    # San Diego South Bay
    "chula vista", "imperial beach",
)


def wrong_region_signal(
    matched_term: str, handle: str, display_name: str, text: str
) -> str | None:
    """Return the matched substring if matched_term is ambiguous AND the
    post's handle/displayName/text clearly belongs to a different region.
    Returns None when no negative signal found (or matched_term is unambiguous).
    """
    if matched_term not in AMBIGUOUS_TERMS:
        return None
    haystack = " ".join((handle or "", display_name or "", text or "")).lower()
    for sig in NEGATIVE_GEO_SIGNALS:
        if sig in haystack:
            return sig
    return None


_BSKY_BASE = "https://bsky.social/xrpc"


def bluesky_login() -> str:
    """Authenticate to Bluesky as SBT, return access JWT.

    Uses BLUESKY_HANDLE + BLUESKY_APP_PASSWORD from SBT's .env.local
    (e.g. southbaytoday.bsky.social). The public.api.bsky.app endpoint
    blocks our IP via Cloudflare, so we use authenticated bsky.social.
    """
    handle = os.environ.get("BLUESKY_HANDLE") or os.environ.get("BSKY_HANDLE")
    password = (
        os.environ.get("BLUESKY_APP_PASSWORD")
        or os.environ.get("BSKY_APP_PASSWORD")
    )
    if not handle or not password:
        raise RuntimeError(
            "BLUESKY_HANDLE/BLUESKY_APP_PASSWORD not set "
            "(expected in SBT's .env.local)"
        )
    body = json.dumps({"identifier": handle, "password": password}).encode()
    req = urllib.request.Request(
        f"{_BSKY_BASE}/com.atproto.server.createSession",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)["accessJwt"]


def fetch_bluesky_local(terms: list[str], per_term: int = 8) -> list[dict]:
    """Bluesky search for recent posts matching local terms.

    Used as the REPLY POOL: each item carries its AT URI so a V2 listener
    can post a real Bluesky reply once Stephen 👍s a draft.
    """
    items = []
    seen_uris = set()
    token = bluesky_login()
    base = f"{_BSKY_BASE}/app.bsky.feed.searchPosts"
    for term in terms:
        q = urllib.parse.quote_plus(f'"{term}"')
        url = f"{base}?q={q}&sort=top&limit={per_term}"
        try:
            time.sleep(0.2)  # polite
            req = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = json.load(r)
        except Exception as e:
            print(f"  bluesky({term}): ERROR {e}", file=sys.stderr)
            continue
        for post in data.get("posts", []):
            uri = post.get("uri", "")
            if not uri or uri in seen_uris:
                continue
            record = post.get("record", {}) or {}
            author = post.get("author", {}) or {}
            handle = author.get("handle", "")
            display_name = author.get("displayName", "") or ""
            text = record.get("text", "") or ""
            # Skip our own handle (don't reply to ourselves).
            if handle.lower() in SELF_HANDLES:
                continue
            # Skip clearly-wrong-region matches when the term is ambiguous
            # ("south bay" hits Boston/LA/Long Island/SD too).
            bad = wrong_region_signal(term, handle, display_name, text)
            if bad:
                print(
                    f"  bluesky({term}): skip @{handle} — wrong-region '{bad}'",
                    file=sys.stderr,
                )
                continue
            seen_uris.add(uri)
            did = author.get("did", "")
            rkey = uri.rsplit("/", 1)[-1] if "/" in uri else ""
            web_url = (
                f"https://bsky.app/profile/{handle}/post/{rkey}"
                if handle and rkey else ""
            )
            items.append({
                "source": "bluesky",
                "id": uri,
                "uri": uri,
                "cid": post.get("cid"),
                "author_handle": handle,
                "author_did": did,
                "author_name": display_name or None,
                "title": text[:200],
                "text": text,
                "url": web_url,
                "external_url": web_url,
                "likes": post.get("likeCount", 0),
                "reposts": post.get("repostCount", 0),
                "replies": post.get("replyCount", 0),
                "indexed_at": post.get("indexedAt"),
                "matched_term": term,
            })
    return items


def safe_run(name: str, fn):
    try:
        items = fn()
        print(f"  {name}: {len(items)} items")
        return items
    except Exception as e:
        print(f"  {name}: ERROR {e}", file=sys.stderr)
        return []


def main():
    now = datetime.now(timezone.utc).isoformat()
    print(f"[radar] {now}")
    all_items = []
    # Cultural-moment pool (standalones only — must have local angle)
    all_items += safe_run("reddit", lambda: fetch_reddit_popular(25))
    all_items += safe_run("hn", lambda: fetch_hn_top(20))
    all_items += safe_run("buzzfeed",
        lambda: fetch_rss("buzzfeed", "https://www.buzzfeed.com/index.xml", 15))
    all_items += safe_run("mashable",
        lambda: fetch_rss("mashable", "https://mashable.com/feeds/rss/all", 15))
    # Bluesky reply pool (local by construction)
    all_items += safe_run("bluesky",
        lambda: fetch_bluesky_local(LOCAL_TERMS, per_term=8))

    with OUT_PATH.open("w", encoding="utf-8") as f:
        for item in all_items:
            item["fetched_at"] = now
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"[radar] wrote {len(all_items)} items to {OUT_PATH}")


if __name__ == "__main__":
    main()
