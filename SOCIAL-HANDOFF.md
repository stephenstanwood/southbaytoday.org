# South Bay Signal Social Automation — Session Handoff

## What Was Built (Session 1, April 4 2026)

### Infrastructure (COMPLETE, committed, pushed)
A full social posting pipeline lives in `scripts/social/`. It includes:

- **Platform clients** for X (OAuth 1.0a), Bluesky (AT Protocol), and Threads (Meta Graph API) in `scripts/social/lib/platforms/`
- **Data loader** (`lib/data-loader.mjs`) that reads all SBS JSON data files and normalizes them into candidate items
- **Scoring engine** (`lib/scoring.mjs`) that ranks candidates by relevance, timeliness, usefulness, novelty, specificity, public appeal, and source confidence, with penalties for dupes, stale items, and admin noise
- **Diversity constraints** (`lib/diversity.mjs`) to prevent one city or category from dominating
- **Dedup/history** (`lib/dedup.mjs`) with fuzzy title matching and 30-day rolling history in `src/data/south-bay/social-post-history.json`
- **Copy generation** (`lib/copy-gen.mjs`) via Claude Haiku with SBS voice rules — THIS NEEDS MAJOR REWORK (see below)
- **Card generation** (`lib/card-gen.mjs`) using satori + sharp, producing 1200x675 branded PNG cards with SBS masthead, format label, numbered items, city/venue/time details
- **Publisher** (`publish.mjs`) with `--dry-run` flag and per-platform targeting
- **Copy review server** (`copy-review-server.mjs`) — a swipe-left/swipe-right tool at localhost:3456 for evaluating generated copy
- **Config** (`lib/constants.mjs`) with DRY_RUN flag, thresholds, model selection, blacklist

### Accounts (COMPLETE)
- **X**: @southbaysignal — profile done (name, bio, header, avatar, professional account as "Community"), developer API active on free tier (1500 posts/mo), OAuth 1.0a credentials in .env.local
- **Bluesky**: @southbaysignal.bsky.social — profile done, app password in .env.local
- **Instagram**: @southbaysignal — created with stephen@southbaysignal.org
- **Threads**: Blocked — requires Meta developer app, which requires Facebook, which is in appeal/review after video selfie identity verification. Check status.
- **Facebook Page**: Not yet created — blocked on same FB account review

### Email
- hello@southbaysignal.org forwards to stephen@stanwood.dev via ImprovMX
- DNS records (MX + TXT) configured in Vercel

### Scheduled Tasks on Mac Mini
4 tasks created, all in DRY_RUN mode:
- `sbs-social-daily-pulse` — Daily ~7 AM PT
- `sbs-social-tonight` — Daily ~3:30 PM PT
- `sbs-social-weekend` — Friday ~9 AM PT
- `sbs-social-civic` — Tue/Thu ~8:30 AM PT

These currently use the roundup format (multiple items per post) which needs to be replaced with the single-item model.

### Bio (used across all platforms)
"What's happening in San Jose, Palo Alto, Campbell, Los Gatos, and across the South Bay. Events, civic updates, and a few good reasons to leave the house."

---

## What Needs to Happen Next (Session 2)

### 1. REWORK: Single-Item Post Model
The biggest finding from 5 rounds of copy review: **one post = one item = one link.** The roundup/combo format doesn't work because:
- Mashing divergent events (kids egg hunt + pro soccer + evening vigil) serves no one well
- Two good single posts beat one weird combo post for shareability and actionability
- Each post needs to stand alone — someone shares it to a group chat and it makes complete sense
- Volume goes up (5-8 posts/day instead of 2) but every post is useful to its specific audience

This means reworking:
- `generate-daily-pulse.mjs` → becomes a scheduler that picks individual items throughout the day
- `generate-tonight.mjs` → same, afternoon/evening items posted individually
- `generate-weekend-roundup.mjs` → individual weekend items posted Friday + throughout weekend
- `generate-civic-signal.mjs` → individual civic items when they're good enough
- Or more likely: replace all four with a single `generate-social-posts.mjs` that runs multiple times per day, scores all candidates, and generates individual posts for the top N items that pass quality + URL checks

### 2. ADD: URL Validation Step
Before generating copy for any item, verify the URL:
- Fetch the URL, check for HTTP 200
- Reject homepage-only links (sccl.org, santanarow.com) — need the specific event/page URL
- Reject ugly Legistar calendar URLs with query params — find the actual agenda PDF or skip
- For sports: construct/find the specific match page, not just the schedule index
- For civic: find the actual agenda PDF, meeting minutes, or specific item page — Legistar calendar index pages are useless
- Rule: if we can't link directly to the thing, don't post about it

### 3. ADD: Fact-Check Step
A lightweight Claude pass before copy generation:
- Is this event actually happening on this date/time?
- Is the venue correct?
- For sports: what gender? Don't assume.
- Don't claim things we aren't sure about ("home opener", cuisine type, etc.)
- Source data is occasionally fallible — social must be 110% rock-solid

### 4. ADD: Time Awareness
The system currently knows the date but not the time of day:
- Pass current time into copy gen
- Exclude events whose start time has already passed
- "Tonight" = after 5 PM only
- Morning/afternoon/evening framing must match reality
- Don't promote a 9 AM egg hunt at 3 PM

### 5. ADD: Best-URL Finder
For each candidate item, try to find the most specific URL:
- Events: use the source URL from upcoming-events.json (usually specific)
- Sports: construct match-day URLs (Earthquakes pattern: /matches/sjvssd-MM-DD-YYYY/)
- Restaurants: look up the actual restaurant website, not the permit source
- Civic: find agenda PDFs from Legistar/Stoa, not calendar index pages
- This may require a web fetch step to verify URLs resolve

### 6. REWORK: Copy Generation Prompts
Update `lib/copy-gen.mjs` with all learnings from the review sessions:

**Voice rules (from Stephen's swipe feedback):**
- Warm, specific, personality, natural rhythm
- 1-3 emojis placed naturally, adding warmth not replacing words
- Sound like a friend who went there and liked it, NOT marketing copy
- We inform, we don't endorse
- No generic wrappers, no forced energy, no vague phrasing
- No permit/construction jargon
- No ad copy ("nothing on the menu is there by accident" = too far)

**Link rules:**
- Link to the event/source URL ~90% of the time
- Only link to southbaysignal.org ~10% when it's genuinely the best destination
- SBS is implied — it's in the bio, people find it through consistent value delivery
- Trust > traffic

**Structural rules:**
- One item per post, full detail, one direct link
- Never pair items for different audiences
- Don't connect items just because they share a theme
- Items in a post must work as an actual plan someone would do

### 7. Continue Swipe Review
The copy-review-server.mjs tool works well. Run more rounds to keep calibrating:
```bash
# Generate variants
node --env-file=.env.local scripts/social/generate-review-batch.mjs  # (needs to be built)

# Start review server
node scripts/social/copy-review-server.mjs
# Go to localhost:3456, swipe left/right
# Results saved to /tmp/sbs-social-review-results.json
```

### 8. Test Real Posts
Once copy quality is dialed in:
- Post one real item to X + Bluesky
- Verify link previews render correctly
- Verify image cards look right (or decide to skip cards for single-item posts and let source link previews do the work)
- Delete test posts if needed

### 9. Check Meta Status
- Check if Facebook account appeal was resolved
- If yes: create Meta developer app → add Threads API → generate token → add to .env.local
- Also create Facebook Page for South Bay Signal → get Page Access Token
- Build Facebook Page publishing client (similar to Threads, same Graph API)

### 10. Go Live
- Flip DRY_RUN to false in `scripts/social/lib/constants.mjs`
- Monitor first few days of output
- Tune thresholds and scoring weights based on real performance

---

## Key Files

```
scripts/social/
  lib/
    constants.mjs        — DRY_RUN flag, model, thresholds, config
    scoring.mjs          — candidate scoring engine
    dedup.mjs            — post history, fuzzy dedup
    diversity.mjs        — city/category diversity constraints
    copy-gen.mjs         — Claude copy generation (NEEDS REWORK)
    card-gen.mjs         — satori + sharp image cards
    data-loader.mjs      — loads + normalizes all SBS data
    logger.mjs           — structured console logging
    platforms/
      x.mjs              — X/Twitter OAuth 1.0a client
      bluesky.mjs        — Bluesky AT Protocol client
      threads.mjs        — Threads Meta Graph API client (not yet active)
  generate-daily-pulse.mjs    — NEEDS REWORK → single-item model
  generate-tonight.mjs        — NEEDS REWORK → single-item model
  generate-weekend-roundup.mjs — NEEDS REWORK → single-item model
  generate-civic-signal.mjs   — NEEDS REWORK → single-item model
  publish.mjs                 — publisher, supports --dry-run + --platform
  copy-review-server.mjs      — swipe review tool (localhost:3456)
  generate-header.mjs         — header image generator

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

# Threads (NOT YET)
THREADS_ACCESS_TOKEN=
THREADS_USER_ID=
```

## Stephen's Core Philosophy for SBS Social

> "The model is that we give people the most useful info possible, not just that we try to drive straight back to our site at every turn. If we consistently deliver, they trust us and then will seek us out."

This means:
- Every post should be genuinely useful to the person reading it
- Link to the source, not to SBS
- Do the legwork — find the specific URL, the PDF, the match page
- Trust builds through consistent value, not click funnels
- Two clean single posts > one messy combo post
- If we can't do it right, skip it
