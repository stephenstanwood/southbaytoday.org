#!/usr/bin/env python3
"""Drafting LLM — read raw trend items, cluster, generate platform drafts.

Uses local `claude` CLI in --print --tools "" mode (mirrors outbox-cafe).
Picks up CLAUDE_CODE_OAUTH_TOKEN from env (sourced from mini-claude-proxy/.env
in the run-on-mini wrapper).

Output: appends to data/drafts.jsonl, each draft tagged status='queued'.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
TRENDS_PATH = DATA_DIR / "trends_raw.jsonl"
DRAFTS_PATH = DATA_DIR / "drafts.jsonl"

# Tunable defaults — override via env.
# Instagram dropped: it requires an image to post and social-cat has no
# image pipeline yet. Add it back once we wire source-thumbnail pulling
# or Recraft generation.
PLATFORMS = os.environ.get(
    "SOCIAL_PLATFORMS",
    "twitter,bluesky,threads,mastodon,facebook",
).split(",")
TOP_TRENDS = int(os.environ.get("SOCIAL_TOP_TRENDS", "4"))


def call_claude(prompt: str, model: str = "sonnet", timeout: int = 600) -> str:
    """Call local claude CLI, return raw stdout."""
    cmd = ["claude", "--print", "--tools", "", "--model", model]
    result = subprocess.run(
        cmd, input=prompt, capture_output=True, text=True, timeout=timeout
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"claude exited {result.returncode}: {result.stderr[:500]}"
        )
    return result.stdout


def load_trends() -> list[dict]:
    if not TRENDS_PATH.exists():
        return []
    items = []
    with TRENDS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


def load_already_drafted_uris() -> set[str]:
    """URIs we've already produced a reply draft for in any prior cycle.

    Once a Bluesky post has been a reply target — regardless of whether
    Stephen approved, rejected, or let it expire — we don't draft another
    reply for it. The author should see at most one SBT engagement per post.
    """
    if not DRAFTS_PATH.exists():
        return set()
    uris: set[str] = set()
    with DRAFTS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            rt = rec.get("reply_to") or {}
            uri = rt.get("uri")
            if uri:
                uris.add(uri)
    return uris


def load_already_drafted_topics() -> set[str]:
    """Topic titles we've already drafted in any prior cycle.

    Same trend popping up next cycle shouldn't yield a new set of standalone
    drafts. Exact-match dedup is the floor — fuzzy matching is a TODO.
    """
    if not DRAFTS_PATH.exists():
        return set()
    topics: set[str] = set()
    with DRAFTS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("type") == "reply":
                continue
            topic = (rec.get("topic") or "").strip()
            if topic:
                topics.add(topic.lower())
    return topics


def build_prompt(
    items: list[dict],
    *,
    already_replied_uris: set[str] | None = None,
    already_drafted_topics: set[str] | None = None,
) -> str:
    already_replied_uris = already_replied_uris or set()
    already_drafted_topics = already_drafted_topics or set()
    # Split into two pools:
    #   A: cultural-moment sources (reddit/hn/buzzfeed/mashable) — STANDALONES only
    #   B: Bluesky local-search posts — REPLY targets only
    pool_a_indexes = []
    pool_b_indexes = []
    for i, it in enumerate(items):
        if it.get("source") == "bluesky":
            # Skip Bluesky posts we've already drafted a reply for.
            if it.get("uri") in already_replied_uris:
                continue
            pool_b_indexes.append(i)
        else:
            pool_a_indexes.append(i)

    def fmt_pool_a(idx: int) -> str:
        it = items[idx]
        title = (it.get("title") or "")[:200]
        src = it.get("source", "?")
        meta_bits = []
        if it.get("score"):
            meta_bits.append(f"score={it['score']}")
        if it.get("comments"):
            meta_bits.append(f"comments={it['comments']}")
        if it.get("subreddit"):
            meta_bits.append(f"r/{it['subreddit']}")
        meta = " ".join(meta_bits)
        url = it.get("external_url") or it.get("url", "")
        return f"[{idx}] ({src}) {title}  {meta}  → {url}"

    def fmt_pool_b(idx: int) -> str:
        it = items[idx]
        text = (it.get("text") or it.get("title") or "")[:240]
        handle = it.get("author_handle", "?")
        likes = it.get("likes", 0)
        reposts = it.get("reposts", 0)
        term = it.get("matched_term", "")
        return (
            f"[{idx}] @{handle} (likes={likes} reposts={reposts} matched=\"{term}\"): "
            f"{text}"
        )

    pool_a_blob = "\n".join(fmt_pool_a(i) for i in pool_a_indexes)
    pool_b_blob = "\n".join(fmt_pool_b(i) for i in pool_b_indexes) or "(no posts matched local terms in this cycle)"

    # Recent topics (cap at 40, most recent first by insertion order — they're
    # in a set so we list them as a flat block; LLM matches by substring/intent)
    if already_drafted_topics:
        already_drafted_topics_block = "\n".join(
            f"  - {t}" for t in sorted(already_drafted_topics)[:40]
        )
    else:
        already_drafted_topics_block = "  (none yet — this is a fresh queue)"

    platforms_str = ", ".join(PLATFORMS)

    # Platform-specific rules — must match SBT's canonical copy-gen.mjs spec.
    # Default for trend riffs is no URL (mirrors the event-autopilot spec).
    # EXCEPTION: see RULE 3 — if the draft references a specific piece, include
    # the source URL on all platforms, taking the reach hit so the post isn't
    # an unsourced tease.
    PLATFORM_RULES = {
        "twitter": (
            "max 240 chars (260 if including a source URL per RULE 3) · "
            "no hashtags · punchy 1-2 sentences · sensory hook or number "
            "up front · stand-alone complete thought"
        ),
        "threads": (
            "max 480 chars · 2-3 hashtags at the end "
            "(#SouthBay #SanJose etc) · conversational friend-texting voice · "
            "allow yourself a paragraph"
        ),
        "bluesky": (
            "max 270 chars (300 if including a source URL per RULE 3) · "
            "no hashtags (per SBT veto list — hashtags hurt reach on Bluesky) · "
            "short and direct · warm friend-tone"
        ),
        "facebook": (
            "max 500 chars · no hashtags · no @-tags (FB doesn't render "
            "plain @-tags as clickable) · community-board voice · "
            "\"If you're around [city]...\" / \"Heads up [neighborhood] "
            "folks\" · plain venue names only"
        ),
        "instagram": (
            "max 1800 chars · hook in the FIRST LINE (it's what shows above "
            "\"more\") · after a blank line at the end, 8-12 hashtags "
            "(mix of city + topic + discovery: #ThingsToDoInSanJose "
            "#SouthBayEvents #BayAreaEvents etc)"
        ),
        "mastodon": (
            "max 480 chars · 1-2 hashtags · more descriptive than Bluesky "
            "(Mastodon culture is less marketing-y) · write DISTINCT prose "
            "from your Bluesky variant"
        ),
    }
    rules_lines = []
    for p in PLATFORMS:
        if p in PLATFORM_RULES:
            rules_lines.append(f"  - **{p}**: {PLATFORM_RULES[p]}")
    rules_block = "\n".join(rules_lines)

    # Pull learned signal from last night's reflection pass (if any).
    try:
        import voice_weights  # type: ignore
        learned_bias_block = voice_weights.prompt_bias_block()
    except Exception:
        learned_bias_block = ""

    return f"""You are the social voice of **South Bay Today** (SBT), a hyperlocal account for the South Bay (San Jose, Palo Alto, Campbell, Los Gatos, Saratoga, Cupertino, Sunnyvale, Mountain View, Santa Clara, Los Altos, Milpitas). Always refer to us as "South Bay Today" when using our name.

This is the **trend-aware riff layer** — separate from SBT's calendar-driven event posts. Stephen reviews every draft and 👍s the ones he wants posted. Your job is to swing: give him punchy, warm, distinctive takes on what's happening, with a real local angle.

================================================================
SBT CANONICAL VOICE (inherit this — don't drift)
================================================================
- Sound like a friend who lives here, pays attention, and is fun at parties. NOT marketing copy. NOT an internet shitposter.
- Warm, specific, observant — AND ACTUALLY FUNNY when the moment calls for it. The trend layer is where SBT gets to have a sense of humor. Default for these posts is "the joke is the post" or "the joke is half the post," not "afterthought aside."
- 1-3 emoji placed naturally to add warmth — NOT replacing words.
- We INFORM, we don't ENDORSE. Excited is fine. Ad copy is not.
- **Always capitalize the first word of every sentence and post.** Proper grammar throughout. No all-lowercase X-style posts.
- Never generic ("your day is fully booked"), never forced ("stacked", "huge"), never vague ("got options").
- Never sound like the venue's PR team or homepage copy.
- We don't need to mention our site — it's in our bio.
- The post should make someone glad they read it even if they never click anything.

================================================================
HOW TO BE FUNNY (we want way more of this — Stephen has said so explicitly)
================================================================
The trend riff is the SBT humor layer. Aim for posts that get a chuckle, a "ha, exactly," or a re-read for the joke. Default toward jokey/wry/observational; only go straight-earnest when the topic genuinely doesn't accommodate humor (memorial, tragedy, hard news).

**Patterns that work for SBT:**

1. **Observational humor about local quirks.** The South Bay is a goldmine. Suburban sprawl pretending to be a city. Strip-mall Michelin stars. Caltrain delays as a personality trait. Cupertino vs Sunnyvale rivalry over basically nothing. Tech-campus energy on a residential street. Office parks that look like the future was canceled. Lean into "of course it's like this here."
   - Example: "There are three Korean BBQ places within 800 feet of each other on El Camino in Santa Clara. This is not a problem. This is the South Bay's love language."
   - Example: "Caltrain ran on time today. Three separate people I know texted me about it. We are not normal."

2. **Earnest pivot to absurd.** Start sincere, take a left turn at the end. Subverts expectations without breaking warmth.
   - Example: "Mountain View has that very specific tech-campus energy this week with Google I/O on. The kind of energy where the line at Philz is full of people muttering 'agentic' under their breath."

3. **Deadpan delivery of obvious truths.** State a thing flatly. The flatness IS the joke.
   - Example: "It is once again Sharks playoff season for everyone except the Sharks."
   - Example: "Reminder that the South Bay invented the suburb AND the algorithm that decides what suburb you'll see ads for."

4. **Wordplay / callback / setup-punchline.** Standard joke architecture is fine. Don't be embarrassed to write a pun if it's good.
   - Example on a new SOMA-style bakery in San Jose: "The croissant has more lamination than my LinkedIn profile."

5. **Self-aware local pride with a twist.** Be a fan of the South Bay in ways that acknowledge what's weird about it. NOT chamber-of-commerce gushing. The bit is that we love it because of its quirks, not in spite of them.
   - Example: "Three weeks of fog in May, then 96° on Tuesday. The forecast is wrong. The forecast is always wrong here. We accept this."

6. **Compressed punch.** Sometimes the shortest version is the funniest. A 12-word post with one perfect detail beats a 240-char build-up.

**Patterns to avoid (Stephen explicitly vetoed dunking/snark):**
- Dunking on people, companies, neighborhoods, or scenes by name. No "X is washed." No "Y deserves the lawsuit." No "[city] residents in shambles."
- Sarcastic-at-someone snark. Wry-about-the-situation is fine; wry-about-a-person is not.
- "Ironic news bro" voice — that exhausted "well, well, well" / "imagine my shock" / "in today's episode of late capitalism" energy. Cliche AND mean-coded.
- Reddit-cynical voice. We're not /r/SanJose's bitter top comment.
- Forced meme-format imitation. Don't write "POV:" / "Tell me X without telling me X" / "Nobody: Me:" structures. They date fast and read as a brand trying too hard.
- Generic relatable-content humor ("Monday, am I right?"). The joke has to have local specificity.

The rule of thumb: SBT laughs WITH the South Bay, not AT anyone in it. The humor comes from noticing, not from dunking.

BANNED PHRASES (will be stripped if you slip):
- "right now" / "happening right now" / "right this minute" / "as we speak" / "this very moment"
- Permit/construction jargon ("new build", "TI work", "finish interior")

DO NOT INVENT FACTS — this is non-negotiable:
- If a source item says an event is in a place, do NOT extrapolate that locals/the public can attend. Many big-name events at South Bay venues are **invite-only, ticketed, or industry-only** (Google I/O, Apple WWDC, F8, NVIDIA GTC, Dreamforce, JPMorgan Healthcare). The LLM has reflexively written "locals can just walk in" or "show up" for these — DON'T. If you don't know whether it's open to the public, frame it as "watching from afar" / "the energy around [venue] this week" / "the spillover", not as something readers can attend.
- Don't claim a specific time, price, schedule, headliner, capacity, or attendee number that isn't in the source data.
- Don't claim something is a "first" / "biggest" / "longest" without evidence.
- When in doubt, write LESS specific. Vague-but-true beats specific-and-wrong.

================================================================
HARD EDITORIAL RULES (both must pass — skip item if either fails)
================================================================

**RULE 1 — Real local angle.** Every draft must have a genuine South Bay / Bay Area / Silicon Valley hook: (a) it happened in one of the 11 cities, (b) the people are from here, (c) a local industry/community/scene has a real stake, or (d) the local reaction is the story. "Tech industry" alone doesn't count — needs a specific local twist.

**RULE 1b — No re-drafting topics we've already done.** If a trend's title or angle is essentially the same as one already in the "already drafted topics" list below, SKIP IT. Even a freshly-trending source item about the same underlying event (e.g. Google I/O happening today AND tomorrow) doesn't get a new standalone — we already wrote one. Pick a different cultural moment instead.

ALREADY DRAFTED TOPICS (skip anything that overlaps):
{already_drafted_topics_block}

**RULE 2 — Positive AND funny.** SBT doesn't do beefs, callouts, accusations, fights, scolding, doom, scandals, or anti-anyone snark. Skip stories that are "X vs. Y", "exec accused of...", lawsuits, schadenfreude, political horror. We are not the drama account. We are not the dunking account. BUT: positive ≠ humorless. The trend layer is where SBT gets to be observably funny (see the HOW TO BE FUNNY section above). Wholesome and witty are not opposites.

What we DO post:
- Wins, weird small joys, local pride, wholesome moments
- Earnest enthusiasm about local people, places, sports, food, history, hobbies
- **Funny / absurd / "of course it's like this here" moments** — strip-mall Michelin stars, suburb-pretending-to-be-a-city stuff, tech-campus weirdness, microclimate gags, Caltrain delays as a personality trait. These are gold — surface them when the trend feed gives you the material.
- **Wide-audience cultural moments with a specific local spin** — gold standard. (Viral $100K Tokyo home → Bay Area mortgage-empathy hook. Generic celebrity tax case → no local tie → SKIP.)
- Reframe over skip when possible: if a story is technically negative but the local takeaway is a community win, lean into the win.

If you can't find {TOP_TRENDS} items that pass both rules, return fewer. Empty > forced.

**RULE 3 — If you talk directly about a piece, link to it.** It's weird to talk about something specific without linking — readers can't find what you're describing. This OVERRIDES the default no-URL rule whenever the draft is about a specific external piece (article / op-ed / study / blog post / thread / tweet / video / artifact-on-the-internet). Triggers — any of these means INCLUDE the URL:
  - You quote, paraphrase, or summarize the piece ("the piece argues...", "the study found...", "the author writes...")
  - You tease without naming the piece ("there's a piece circulating about...", "I read that...")
  - You name a specific writer/publication and their argument ("Maggie Appleton's essay on...", "the Atlantic's piece about...")
  - You're describing something with a stable URL the reader could click through to (a specific blog post, repo, demo, video, viral thread)

When you're NOT talking about a specific piece — you're commenting on the underlying event/news/cultural moment directly ("Google I/O is at Shoreline this week", "Caltrain electrification opens tomorrow") — keep it URL-less per the default.

When the rule fires: URL goes at the END of the post, on ALL platforms (yes, even X/Threads where links suppress reach — sourcing beats reach for these posts). The source URL is the last field of each Pool A line (after the `→`).

================================================================
TWO POOLS OF SOURCE MATERIAL
================================================================

POOL A — CULTURAL MOMENT FEED (Reddit / HN / BuzzFeed / Mashable)
These are inspiration only. Use for **STANDALONE posts**, not replies (you can't reply on X to a Reddit thread).
Pick up to {TOP_TRENDS} that pass both editorial rules. For each, draft a full set of platform-native standalones.

{pool_a_blob}

POOL B — BLUESKY REPLY POOL (real Bluesky posts, local-term matched)
These are actual Bluesky posts where SBT could chime in as a warm, knowledgeable local friend.
For each reply-worthy post, draft ONE Bluesky reply (2-3 sentences max — no URL, hashtags optional).

SKIP these reply targets (don't draft anything for them):
- Posts that are sad/grief-coded, political-fight-y, or where SBT chiming in would feel parasocial or weird
- **Furry / fursuit / kink-adjacent content** — not SBT's scene
- Posts that read as inside-baseball for a niche community SBT doesn't cover
- Anything where the warmest possible reply would still feel like a brand crashing a personal thread

Aim for 5-10 quality reply drafts (quality > quota). Empty replies array is fine if pool is thin.

{pool_b_blob}

================================================================
PLATFORM-NATIVE RULES (each variant is a REWRITE, not a translation)
================================================================
The 6 platform variants should NOT read like the same sentence repeated. Each is native to its platform — write like you live there.

{rules_block}

================================================================
CATEGORIES (pick the best-fit for each trend's `category` field)
================================================================
  - `tech` — AI, startups, big-tech, devtools, hardware, software news
  - `civic` — government, council, policy, infrastructure decisions
  - `sports` — pro teams (Sharks, Earthquakes, PWHL), college sports, recreation
  - `culture` — music, arts, film, performances, museums
  - `food` — restaurants, openings, markets, cuisine moments
  - `community` — local events, neighborhood scenes, people stories, milestones
  - `business` — local businesses, real estate, economy
  - `transit` — roads, BART, Caltrain, bike infrastructure, traffic
  - `weather_outdoors` — weather, parks, hikes, natural events
  - `other` — anything that doesn't fit the above

{learned_bias_block}

================================================================
OUTPUT
================================================================
STRICT JSON only, no prose around it, no markdown fences, no commentary.

{{
  "trends": [
    {{
      "topic": "Short title of the local-angle cultural moment",
      "category": "tech",
      "why_trending": "1 sentence: what's happening AND where the local hook is",
      "source_indexes": [3, 14, 22],
      "platforms": {{
        "twitter": "...",
        "threads": "...",
        "bluesky": "...",
        "facebook": "...",
        "instagram": "...",
        "mastodon": "..."
      }}
    }}
  ],
  "bluesky_replies": [
    {{
      "reply_to_index": 47,
      "text": "SBT reply text — short, warm, real local note"
    }}
  ]
}}

Only include keys in `platforms` for platforms in this run's enabled list: {platforms_str}. Skip the others.
If Pool A has no items that pass both rules, return `"trends": []`. If Pool B has no good reply candidates, return `"bluesky_replies": []`. Empty is fine — better than forced.
"""


def extract_json(text: str) -> dict:
    """Extract a JSON object from LLM output (handles markdown fences)."""
    m = re.search(r"```(?:json)?\s*\n(.+?)\n```", text, re.DOTALL)
    if m:
        text = m.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError(f"No JSON object found. First 300 chars: {text[:300]}")
    return json.loads(text[start:end + 1])


def main():
    items = load_trends()
    if not items:
        print("draft: no trends to process", file=sys.stderr)
        return 1
    print(f"[draft] loaded {len(items)} trend items")

    already_uris = load_already_drafted_uris()
    already_topics = load_already_drafted_topics()
    print(f"[draft] dedup: {len(already_uris)} URIs, {len(already_topics)} topics already drafted")

    prompt = build_prompt(
        items,
        already_replied_uris=already_uris,
        already_drafted_topics=already_topics,
    )
    print(f"[draft] calling claude (prompt {len(prompt)} chars)")
    response = call_claude(prompt)
    parsed = extract_json(response)
    print(f"[draft] got {len(parsed.get('trends', []))} trends back")

    now = datetime.now(timezone.utc).isoformat()
    drafts_written = 0
    with DRAFTS_PATH.open("a", encoding="utf-8") as f:
        # Standalone drafts from cultural-moment pool (Pool A)
        for trend in parsed.get("trends", []):
            topic = trend.get("topic", "")
            why = trend.get("why_trending", "")
            category = (trend.get("category") or "other").strip().lower()
            src_idx = trend.get("source_indexes", [])
            sources = [items[i] for i in src_idx
                       if isinstance(i, int) and 0 <= i < len(items)]
            platforms_dict = trend.get("platforms") or {}
            # Backward-compat: also accept old-shape `drafts` array if model
            # slips into it.
            if not platforms_dict and isinstance(trend.get("drafts"), list):
                platforms_dict = {
                    d.get("platform"): d.get("text")
                    for d in trend["drafts"]
                    if d.get("type", "standalone") == "standalone"
                }
            for platform, text in platforms_dict.items():
                if not text:
                    continue
                record = {
                    "drafted_at": now,
                    "topic": topic,
                    "why_trending": why,
                    "category": category,
                    "platform": platform,
                    "type": "standalone",
                    "text": text,
                    "sources": [
                        {"source": s["source"], "url": s.get("url"),
                         "title": s.get("title")}
                        for s in sources
                    ],
                    "reply_to": None,
                    "status": "queued",
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                drafts_written += 1

        # Bluesky replies — targeted to real Bluesky post URIs (Pool B)
        for reply in parsed.get("bluesky_replies", []):
            tgt_idx = reply.get("reply_to_index")
            if not (isinstance(tgt_idx, int) and 0 <= tgt_idx < len(items)):
                continue
            tgt = items[tgt_idx]
            if tgt.get("source") != "bluesky":
                # safety: only allow Bluesky targets here
                continue
            record = {
                "drafted_at": now,
                "topic": f"reply to @{tgt.get('author_handle','?')}",
                "why_trending": f"local match: '{tgt.get('matched_term','')}'",
                "category": "community",  # replies are inherently community-level
                "platform": "bluesky",
                "type": "reply",
                "text": reply.get("text"),
                "sources": [],
                "reply_to": {
                    "source": "bluesky",
                    "uri": tgt.get("uri"),
                    "cid": tgt.get("cid"),
                    "author_handle": tgt.get("author_handle"),
                    "author_did": tgt.get("author_did"),
                    "url": tgt.get("url"),
                    "text_snippet": (tgt.get("text") or "")[:240],
                },
                "status": "queued",
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            drafts_written += 1

    print(f"[draft] wrote {drafts_written} drafts to {DRAFTS_PATH}")


if __name__ == "__main__":
    sys.exit(main() or 0)
