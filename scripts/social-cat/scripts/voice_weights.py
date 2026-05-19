"""Read-side of the reflection loop.

`scripts/reflect.py` writes `data/voice_weights.json` nightly based on
real Bluesky engagement. This module is the read-side that draft.py
(trend picker, prompt builder) imports.

Defaults to a no-op when the file is missing or malformed — social-cat
runs unchanged on day 1 before any reflection pass has happened.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

WEIGHTS_PATH = Path(__file__).resolve().parent.parent / "data" / "voice_weights.json"

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
