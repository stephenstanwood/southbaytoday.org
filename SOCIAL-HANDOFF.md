# South Bay Signal Social Automation — Session Handoff

## What Was Built (Session 1, April 4 2026)

### Infrastructure (COMPLETE, committed, pushed)
A full social posting pipeline lives in `scripts/social/`. It includes:

- **Platform clients** for X (OAuth 1.0a), Bluesky (AT Protocol), and Threads (Meta Graph API) in `scripts/social/lib/platforms/`
- **Data loader** (`lib/data-loader.mjs`) that reads all SBS JSON data files and normalizes them into candidate items
- **Scoring engine** (`lib/scoring.mjs`) that ranks candidates by relevance, timeliness, usefulness, novelty, specificity, public appeal, and source confidence, with penalties for dupes, stale items, and admin noise
- **Diversity constraints** (`lib/diversity.mjs`) to prevent one city or category from dominating
- **Dedup/history** (`lib/dedup.mjs`) with fuzzy title matching and 30-day rolling history in `src/data/south-bay/social-post-history.json`
- **Copy generation** (`lib/copy-gen.mjs`) via Claude Haiku — reworked for single-item posts with all voice learnings baked in
- **URL validation** (`lib/url-check.mjs`) — verifies URLs are specific, reachable, and not generic homepages; rejects Legistar calendar pages, bare domains, ugly query-param URLs
- **Fact-check step** (`lib/fact-check.mjs`) — Claude pass before publishing to catch wrong dates, past events, jargon, wrong venue/city combos, unverified claims
- **Card generation** (`lib/card-gen.mjs`) using satori + sharp, producing 1200x675 branded PNG cards
- **Publisher** (`publish.mjs`) with `--dry-run` flag and per-platform targeting
- **Copy review server** (`copy-review-server.mjs`) — a swipe-left/swipe-right tool at localhost:3456 for evaluating generated copy
- **Single-item pipeline** (`generate-posts.mjs`) — the NEW unified generator that replaces the old roundup format scripts. Runs the full pipeline: load candidates → filter past events → score → URL validate → fact-check → generate single-item copy → write post JSONs

### Accounts
- **X**: @southbaysignal — profile complete (name, bio, header, avatar, professional account as "Community"), developer API active on free tier (1500 posts/mo), OAuth 1.0a credentials in .env.local on both MacBook and Mac Mini
- **Bluesky**: @southbaysignal.bsky.social — profile complete, app password in .env.local on both machines
- **Instagram**: @southbaysignal — created with stephen@southbaysignal.org
- **Threads**: BLOCKED — requires Meta developer app, which requires Facebook login
- **Facebook**: PERMANENTLY DISABLED. Meta disabled Stephen's personal Facebook account for "account integrity" after a dormant-account reactivation + video selfie. No further appeal allowed. Options: create a brand new FB account with a different email, or skip Meta entirely.

### Email
- hello@southbaysignal.org forwards to stephen@stanwood.dev via ImprovMX
- stephen@southbaysignal.org also forwards (used for Instagram signup)
- DNS records (MX + TXT) configured in Vercel

### Scheduled Tasks on Mac Mini
4 tasks created, all in DRY_RUN mode. These still reference the OLD roundup scripts and need to be updated to use `generate-posts.mjs`:
- `sbs-social-daily-pulse` — Daily ~7 AM PT
- `sbs-social-tonight` — Daily ~3:30 PM PT
- `sbs-social-weekend` — Friday ~9 AM PT
- `sbs-social-civic` — Tue/Thu ~8:30 AM PT

### Bio (used across all platforms)
"What's happening in San Jose, Palo Alto, Campbell, Los Gatos, and across the South Bay. Events, civic updates, and a few good reasons to leave the house."

---

## What Was Already Done in Session 1 (don't redo these)

These items from the original spec were COMPLETED and tested:
- ✅ Single-item pipeline (`generate-posts.mjs`) replaces old roundup format
- ✅ URL validation step (fetch URL, check 200, reject homepages/Legistar/ugly params)
- ✅ Fact-check step (Claude pass catches wrong times, past events, jargon, wrong venues)
- ✅ Time awareness (current PT time, filters past events, morning/afternoon/evening framing)
- ✅ Copy gen prompts reworked with all voice learnings from 5 rounds of swipe review
- ✅ Tested end-to-end: 567 candidates → 525 timely → 7 URL-valid → 7 fact-checked → 3 posts generated with direct source URLs

---

## What Was Done in Session 2 (April 4 2026)

### Meta / Facebook / Threads Setup (COMPLETE)
- **Facebook Page**: "The South Bay Signal" created via family member's account, Stephen has admin access through Meta Business Suite
- **Meta Developer App**: "The South Bay Signal" (app ID in developer portal), Threads API + Pages API use cases configured
- **Threads**: @southbaysignal tester invite accepted, long-lived access token generated and saved
- **Facebook Page API**: Page access token generated via Graph API Explorer, Page ID `1057203394142664`
- **Instagram**: @southbaysignal converted to professional account (Community category), linked to Meta Business Suite
- **Credentials**: Threads + Facebook tokens saved to `.env.local` on both MacBook and Mac Mini
- **Facebook platform client**: `scripts/social/lib/platforms/facebook.mjs` built (Graph API, text + image posts)
- **Pipeline updates**: copy-gen.mjs now produces 4 variants (X, Threads, Bluesky, Facebook), publisher handles all 4 platforms, constants updated

### Platforms Ready
- **X**: @southbaysignal — OAuth 1.0a, ready
- **Bluesky**: @southbaysignal.bsky.social — app password, ready
- **Threads**: @southbaysignal — long-lived token, ready
- **Facebook Page**: The South Bay Signal — page token, ready

---

## What Needs to Happen Next (Session 3)

### 0. First Real Posts (April 5, ~4 AM PT)
Stephen wants to start sharing content across all 4 platforms. Regroup at that time to:
- Generate a batch with `generate-posts.mjs --max 3`
- Review the output
- Publish to X, Bluesky, Threads, and Facebook
- Verify link previews render, copy reads well, no errors on each platform

### 1. More Swipe Review
Continue calibrating voice with the copy-review-server:
```bash
# Option A: generate real posts with the pipeline, then review
node --env-file=.env.local scripts/social/generate-posts.mjs --max 8

# Option B: generate a batch of variants for swipe review
# (generate a batch by writing candidates to /tmp/sbs-social-review.json, then:)
node scripts/social/copy-review-server.mjs
# Go to localhost:3456, arrow keys to swipe
# Results saved to /tmp/sbs-social-review-results.json
```

Key things to keep testing:
- Does the single-item format feel right at scale (5-8 posts per day)?
- Are the emoji and warmth levels correct?
- Do any posts still sound like ad copy or PR?
- Are civic/government posts useful enough with available URLs?

### 2. Update Scheduled Tasks on Mini
The 4 existing tasks use old roundup scripts. Consolidate into 2-3 tasks that run `generate-posts.mjs`:
- Morning run (~7 AM): `generate-posts.mjs --max 3` → generates morning posts
- Afternoon run (~2 PM): `generate-posts.mjs --max 3` → generates afternoon/tonight posts
- Evening run (~5:30 PM): `generate-posts.mjs --max 2` → generates evening posts
Each run → pipe post JSONs to `publish.mjs`

### 3. Test Real Posts to X + Bluesky
- Pick one strong item from `generate-posts.mjs` output
- Post it live to X and Bluesky
- Verify: link preview renders, copy reads well, no errors
- Decide: use our branded image card, or let the source's link preview do the work? (For single-item posts, source link previews are probably better — more authentic, shows the venue's own imagery)

### 4. ~~Decide on Meta / Facebook / Threads~~ DONE — See Session 2

### 5. Best-URL Finder (ENHANCEMENT)
The URL check rejects bad URLs but doesn't try to FIND better ones. Build a step that:
- For sports: constructs specific match-day URLs (Earthquakes: `/matches/sjvssd-MM-DD-YYYY/`)
- For restaurants: looks up the actual restaurant website instead of permit data URLs
- For civic: finds the agenda PDF or specific meeting item page
- This is the "we do the legwork" step

### 6. URL Shortener for Civic Links (ENHANCEMENT)
Some civic URLs that ARE specific are still ugly (long Legistar paths, encoded params). Consider:
- A simple redirect through SBS (`southbaysignal.org/go/abc123` → actual URL)
- Or just skip items where the URL would look bad in a tweet

### 7. Go Live
- Flip `DRY_RUN: false` in `scripts/social/lib/constants.mjs`
- Monitor first 3 days of output
- Tune scoring thresholds based on what's actually getting posted
- Watch for: wrong URLs, past events, jargon leaks, repetitive content

### 8. Clean Up
- Delete old roundup format scripts (generate-daily-pulse.mjs, generate-tonight.mjs, generate-weekend-roundup.mjs, generate-civic-signal.mjs) once new pipeline is proven
- Delete SOCIAL-HANDOFF.md once it's no longer needed
- Consider: should card generation still exist for single-item posts, or is it only useful for occasional roundup/summary posts?

---

## Key Files

```
scripts/social/
  lib/
    constants.mjs        — DRY_RUN flag, model, thresholds, config
    scoring.mjs          — candidate scoring engine
    dedup.mjs            — post history, fuzzy dedup
    diversity.mjs        — city/category diversity constraints
    copy-gen.mjs         — Claude copy generation (REWORKED for single-item)
    card-gen.mjs         — satori + sharp image cards
    data-loader.mjs      — loads + normalizes all SBS data
    url-check.mjs        — URL validation (reachability + specificity)
    fact-check.mjs       — Claude fact-check pass
    logger.mjs           — structured console logging
    platforms/
      x.mjs              — X/Twitter OAuth 1.0a client
      bluesky.mjs        — Bluesky AT Protocol client
      threads.mjs        — Threads Meta Graph API client (not yet active)
  generate-posts.mjs         — NEW: single-item pipeline (USE THIS)
  generate-daily-pulse.mjs   — OLD: roundup format (deprecated)
  generate-tonight.mjs       — OLD: roundup format (deprecated)
  generate-weekend-roundup.mjs — OLD: roundup format (deprecated)
  generate-civic-signal.mjs  — OLD: roundup format (deprecated)
  publish.mjs                — publisher, supports --dry-run + --platform
  copy-review-server.mjs     — swipe review tool (localhost:3456)
  generate-header.mjs        — header image generator

src/data/south-bay/
  social-post-history.json    — rolling 30-day post history
  social-blacklist.json       — blocked venues/sources/topics/phrases
```

## Env Vars (on both MacBook and Mac Mini .env.local)

```
# X / Twitter
X_API_KEY=ACdlMcoAqwDNST29XcnMDnqzM
X_API_SECRET=<set>
X_ACCESS_TOKEN=<set>
X_ACCESS_TOKEN_SECRET=<set>

# Bluesky
BLUESKY_HANDLE=southbaysignal.bsky.social
BLUESKY_APP_PASSWORD=<set>

# Threads (NOT YET — blocked on Meta)
THREADS_ACCESS_TOKEN=
THREADS_USER_ID=
```

---

## Stephen's Core Philosophy for SBS Social

> "The model is that we give people the most useful info possible, not just that we try to drive straight back to our site at every turn. If we consistently deliver, they trust us and then will seek us out."

This means:
- Every post should be genuinely useful to the person reading it
- Link to the source, not to SBS (~90% external, ~10% SBS)
- Do the legwork — find the specific URL, the agenda PDF, the match page
- Trust builds through consistent value, not click funnels
- One post = one item = one link. No combos.
- Sound like a friend who went there and liked it, not the venue's PR team
- We inform, we don't endorse
- If we can't do it right (bad URL, unverified facts, stale data), skip it
- Social must be 110% rock-solid — source data is occasionally fallible
