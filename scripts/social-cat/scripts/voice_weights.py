"""Read-side of the reflection loop.

`scripts/reflect.py` writes `data/voice_weights.json` nightly based on
real Bluesky engagement. This module is the read-side that draft.py
(trend picker, prompt builder) imports.

Defaults to a no-op when the file is missing or malformed — social-cat
runs unchanged on day 1 before any reflection pass has happened.

Also exposes swiper_feedback_block(): reads drafts.jsonl directly at
draft-time (real-time, no lag) and surfaces recent approved/rejected
examples + aggregate accept rates to Claude. This is the upstream
feedback loop — Stephen's swiper decisions, not post-publication
engagement.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

WEIGHTS_PATH = Path(__file__).resolve().parent.parent / "data" / "voice_weights.json"
DRAFTS_PATH = Path(__file__).resolve().parent.parent / "data" / "drafts.jsonl"

# Voice guardrails — intentional bounds, not heuristics to tune freely.
CATEGORY_FLOOR = 0.5
CATEGORY_CAP = 1.5


def _load() -> dict[str, Any]:
    try:
        return json.loads(WEIGHTS_PATH.read_text())
    except Exception:
        return {}


def category_multiplier(category: str) -> float:
    """Multiplier for a given category. 1.0 by default."""
    data = _load()
    entry = data.get("category", {}).get(category or "", {})
    mult = float(entry.get("multiplier", 1.0))
    return max(CATEGORY_FLOOR, min(CATEGORY_CAP, mult))


def category_multipliers() -> dict[str, float]:
    """Full {category: multiplier} map. Empty when no data."""
    data = _load()
    out: dict[str, float] = {}
    for cat, entry in (data.get("category") or {}).items():
        mult = float(entry.get("multiplier", 1.0))
        out[cat] = max(CATEGORY_FLOOR, min(CATEGORY_CAP, mult))
    return out


def warm_handles(limit: int = 12) -> list[str]:
    """Bluesky handles SBT replied to that engaged back. Bias the reply
    pool toward these accounts next cycle."""
    data = _load()
    warm = data.get("warm_handles") or []
    return [w.get("handle", "") for w in warm if w.get("handle")][:limit]


def summary_line() -> str:
    """One-line summary suitable for the nightly digest."""
    data = _load()
    return data.get("summary", "")


def sample_size() -> int:
    return int(_load().get("sample_size", 0))


# ---- swiper accept/reject feedback (real-time) ---------------------------

ACCEPTED_STATUSES = ("approved", "published")
REJECTED_STATUSES = ("rejected", "expired")
SWIPER_LOOKBACK_DAYS = 21
SWIPER_MIN_JUDGED = 8  # need this many graded groups before we surface signal


def _parse_ts(s: str) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _read_recent_drafts(days: int) -> list[dict]:
    """All drafts within `days` of now (UTC)."""
    if not DRAFTS_PATH.exists():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    with DRAFTS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            ts = _parse_ts(d.get("drafted_at") or "")
            if ts and ts >= cutoff:
                out.append(d)
    return out


def _group_drafts(drafts: list[dict]) -> dict[tuple, dict]:
    """Bundle drafts by (topic, type, drafted_at) so all platform variants
    of one swipe decision aggregate into a single group. Returns a map of
    group_key → {topic, category, type, source, had_image, statuses, sample_text}."""
    groups: dict[tuple, dict] = {}
    for d in drafts:
        topic = d.get("topic") or ""
        tp = d.get("type") or "standalone"
        # Use drafted_at minute precision so same-cycle drafts cluster
        ts = (d.get("drafted_at") or "")[:16]
        key = (topic, tp, ts)
        if key not in groups:
            src = "?"
            sources = d.get("sources") or []
            if sources:
                src = (sources[0].get("source") or "?").lower()
            elif tp == "reply":
                src = "bluesky"
            groups[key] = {
                "topic": topic,
                "category": d.get("category") or "?",
                "type": tp,
                "source": src,
                "had_image": bool(d.get("image_url")),
                "drafted_at": d.get("drafted_at") or "",
                "statuses": set(),
                "sample_texts": [],
            }
        groups[key]["statuses"].add(d.get("status") or "")
        # Keep up to 2 sample text variants per group (for showing what got approved)
        if len(groups[key]["sample_texts"]) < 2:
            txt = (d.get("text") or "").strip()
            if txt:
                groups[key]["sample_texts"].append({
                    "platform": d.get("platform") or "?",
                    "text": txt,
                })
    return groups


def _group_outcome(statuses: set) -> str:
    """Resolve a group's swiper outcome. ACCEPTED takes precedence — a
    published variant in a group of approved/rejected almost certainly
    means Stephen approved the group; the rejected entries are a different
    cycle entry that got expired/rejected later."""
    if any(s in ACCEPTED_STATUSES for s in statuses):
        return "accepted"
    if any(s in REJECTED_STATUSES for s in statuses):
        return "rejected"
    return "in_flight"  # posted/queued — not graded yet


def swiper_feedback_block(approved_examples: int = 8, rejected_examples: int = 8) -> str:
    """Real-time feedback from Stephen's swiper decisions. Reads drafts.jsonl
    directly (no nightly-batch lag). Returns a prompt block with recent
    approved/rejected examples and aggregate accept rates, or empty string
    when sample is too small."""
    drafts = _read_recent_drafts(SWIPER_LOOKBACK_DAYS)
    if not drafts:
        return ""

    groups = _group_drafts(drafts)
    graded = [g for g in groups.values() if _group_outcome(g["statuses"]) in ("accepted", "rejected")]
    if len(graded) < SWIPER_MIN_JUDGED:
        return ""

    # Aggregate accept rates by category / source / type / image presence.
    def rate(items: list[dict]) -> tuple[int, int, float]:
        acc = sum(1 for g in items if _group_outcome(g["statuses"]) == "accepted")
        rej = sum(1 for g in items if _group_outcome(g["statuses"]) == "rejected")
        total = acc + rej
        return acc, rej, (acc / total) if total else 0.0

    by_cat: dict[str, list[dict]] = defaultdict(list)
    by_src: dict[str, list[dict]] = defaultdict(list)
    by_type: dict[str, list[dict]] = defaultdict(list)
    by_img: dict[bool, list[dict]] = defaultdict(list)
    for g in graded:
        by_cat[g["category"]].append(g)
        by_src[g["source"]].append(g)
        by_type[g["type"]].append(g)
        by_img[g["had_image"]].append(g)

    # Recent examples — sorted newest first.
    graded.sort(key=lambda g: g["drafted_at"], reverse=True)
    accepted = [g for g in graded if _group_outcome(g["statuses"]) == "accepted"][:approved_examples]
    rejected = [g for g in graded if _group_outcome(g["statuses"]) == "rejected"][:rejected_examples]

    # Compose the block.
    lines = [
        "================================================================",
        "STEPHEN'S RECENT SWIPER DECISIONS (real-time feedback — pay attention)",
        "================================================================",
        f"Sample: {len(graded)} graded groups over the last {SWIPER_LOOKBACK_DAYS} days "
        f"({sum(1 for g in graded if _group_outcome(g['statuses']) == 'accepted')} accepted, "
        f"{sum(1 for g in graded if _group_outcome(g['statuses']) == 'rejected')} rejected).",
        "",
    ]

    # Accept-rate breakdowns — only surface dimensions with meaningful spread.
    def fmt_breakdown(label: str, table: dict) -> str | None:
        rows = []
        for k, items in sorted(table.items()):
            a, r, p = rate(items)
            if a + r < 3:
                continue
            rows.append(f"    {k}: {int(p*100)}% accept ({a}✓ / {r}✗)")
        if not rows:
            return None
        return f"  {label}:\n" + "\n".join(rows)

    for label, table in [
        ("By category", by_cat),
        ("By source", by_src),
        ("By type (standalone vs reply)", by_type),
    ]:
        blk = fmt_breakdown(label, table)
        if blk:
            lines.append(blk)

    # Image breakdown — only surface if at least 3 of each.
    a_img, r_img, p_img = rate(by_img.get(True, []))
    a_no, r_no, p_no = rate(by_img.get(False, []))
    if (a_img + r_img >= 3) and (a_no + r_no >= 3):
        delta = (p_img - p_no) * 100
        sign = "+" if delta >= 0 else ""
        lines.append(
            f"  Image vs no-image: with-image {int(p_img*100)}% "
            f"({a_img}✓/{r_img}✗), without-image {int(p_no*100)}% "
            f"({a_no}✓/{r_no}✗) — image {sign}{delta:.0f}pp"
        )

    lines.append("")
    lines.append("RECENT APPROVED — patterns that landed (mimic the rhythm/voice, NOT the topic):")
    if accepted:
        for g in accepted:
            sample = g["sample_texts"][0]["text"] if g["sample_texts"] else ""
            sample = sample.replace("\n", " ").strip()
            if len(sample) > 220:
                sample = sample[:217] + "..."
            tag = f"[{g['category']}/{g['type']}{' +img' if g['had_image'] else ''}]"
            lines.append(f"  ✓ {tag} {g['topic'][:80]}")
            if sample:
                lines.append(f"      → {sample}")
    else:
        lines.append("  (none recent enough)")

    lines.append("")
    lines.append("RECENT REJECTED — avoid these shapes/angles (Stephen swiped left):")
    if rejected:
        for g in rejected:
            tag = f"[{g['category']}/{g['type']}{' +img' if g['had_image'] else ''}]"
            lines.append(f"  ✗ {tag} {g['topic'][:80]}")
    else:
        lines.append("  (none recent enough)")

    lines.append("")
    lines.append(
        "Use this as a SOFT prior — Stephen's taste is the ground truth. "
        "If a rejected pattern overlaps with what you'd otherwise draft, find a different angle. "
        "If an accepted pattern fits a current trend, lean toward that shape."
    )
    return "\n".join(lines)


def prompt_bias_block() -> str:
    """A short block to inject into the drafting prompt: which categories
    are landing, and which Bluesky handles to favor. Empty string if no
    learned signal yet (sample too small)."""
    data = _load()
    if not data or int(data.get("sample_size", 0)) < 12:
        return ""

    cat_mults = data.get("category") or {}
    if cat_mults:
        leaders = sorted(
            cat_mults.items(),
            key=lambda x: x[1].get("multiplier", 1.0),
            reverse=True,
        )
        up = [
            f"{name} ({d['multiplier']}×)"
            for name, d in leaders[:3]
            if d.get("multiplier", 1.0) > 1.0
        ]
        down = [
            f"{name} ({d['multiplier']}×)"
            for name, d in leaders[-3:]
            if d.get("multiplier", 1.0) < 1.0
        ]
    else:
        up, down = [], []

    warm = warm_handles(8)

    if not (up or down or warm):
        return ""

    bits = ["LEARNED SIGNAL FROM RECENT ENGAGEMENT (use as a soft prior — pick freely, but lean):"]
    if up:
        bits.append("  - categories that landed lately: " + ", ".join(up))
    if down:
        bits.append("  - categories that didn't: " + ", ".join(down) + " (still draft them when they fit — just don't over-index)")
    if warm:
        bits.append(
            "  - warm Bluesky handles (engaged back when SBT replied — favor as reply targets when their post is in pool B): "
            + ", ".join(f"@{h}" for h in warm)
        )
    return "\n".join(bits)
