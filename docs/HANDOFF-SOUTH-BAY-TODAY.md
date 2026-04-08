# South Bay Today — Session Handoff

**Date:** 2026-04-08
**Status:** Design direction chosen, ready to build the real product

---

## What Happened This Session

### Sprint 1: Operational Triage (DONE)
- Gitignored runtime-mutable social state files (queue, history, analytics, etc.)
- Removed git commit/push from publish-from-queue.mjs — no more dirty repo blocking
- Deleted 5 dead package.json scripts (blotter, 4 deprecated social generators)
- Fixed all tab URLs: `/?tab=gov` → `/#government`, `/?tab=tech` → `/#technology`
- Added central paths config (`scripts/lib/paths.mjs`)
- Added artifact health report (`scripts/health-report.mjs`, `npm run health-report`)
- Fixed watchdog: 60min alert cooldown, fixed popup false positives, fixed JSON escaping
- Updated CLAUDE.md and SOCIAL-HANDOFF.md

### Sprint 2: Homepage Rebuild (DONE, then superseded by pivot)
- Created modular HomepageView replacing 3013-line OverviewView
- Extracted timeHelpers.ts, useHomepageData.ts
- Added PhotoStrip and AroundTown as standalone components
- Old OverviewView preserved but not imported

### Sprint 3: City Pages (DONE)
- `/city/[slug]` pages for all 11 cities
- Pre-rendered at build time via getStaticPaths
- Shows: weather, events, briefing, meetings, civic actions, digest

### Sprint 4: Civic Intelligence (DONE)
- CivicThisWeek component: "Tonight at City Hall" + upcoming meetings + recent civic actions
- Social alignment: all tab URLs fixed in Sprint 1

### The Pivot: South Bay Today
Stephen decided to pivot the entire product:
- **Old:** local news dashboard with tabs
- **New:** "What should we do today?" day-planning engine
- **Domain:** southbaytoday.org (purchased)
- **Design:** Variant 6 "High Contrast Pop + Original Layout" (light Day Dealer)

### Mac Mini Ops
- Social files restored from git history after gitignore change
- Nightly data commit task disabled (social files no longer tracked)
- All launchd services should be functional

---

## What Needs Building Next

### Phase 1: Places Data Pool
**Goal:** Build a database of ~1500-2000 "always there" places across 11 cities.

1. **Google Places API batch scraper** (`scripts/generate-places.mjs`)
   - Query by city + category (restaurants, parks, museums, entertainment, dessert/coffee, etc.)
   - Store: name, address, lat/lon, rating, price level, hours, categories, photos
   - Filter to 4.0+ stars or manually curated
   - Output: `src/data/south-bay/places.json`
   - Budget: ~$50 for initial scrape, monthly refresh

2. **Seed list of anchor places** (manually curated ~100-200)
   - Classic spots every local knows (Treatbot, Vasona Park, SJMA, etc.)
   - Add "why this is great" blurbs that Claude can use in day plans
   - Could be a TypeScript data file like camps-data.ts

3. **Weather integration for place scoring**
   - Outdoor places get bumped on nice days
   - Indoor places get bumped on rain/cold days
   - Already have weather API at `/api/weather`

### Phase 2: Day-Planning Engine
**Goal:** Claude generates a coherent 5-6 card day plan.

1. **API route** (`src/pages/api/plan-day.ts`)
   - Input: city, kids/no-kids, current time, locked items, dismissed items
   - Pulls from: events (upcoming-events.json) + places (places.json) + restaurants + weather
   - Calls Claude Haiku to sequence a coherent day
   - Output: ordered array of cards with time blocks, "why this" blurbs, category, location

2. **Scoring/filtering layer** (pre-Claude)
   - Filter out dismissed items (from localStorage)
   - Respect locked items as anchors
   - Prefer: today-only events > new openings > timely places > evergreen great places
   - Weather-appropriate filtering
   - Geographic clustering (don't zigzag across the region)
   - Category diversity (no two restaurants back-to-back unless lunch+dinner)

3. **Claude prompt engineering**
   - Input: candidate pool (pre-filtered, ~20-30 items) + constraints
   - Output: ordered sequence of 5-6 picks with time blocks and transition reasoning
   - Model: Haiku for cost (~$0.001/plan)

### Phase 3: Homepage Build
**Goal:** Replace current homepage with the South Bay Today card interface.

1. **Core component** — the card deck
   - Design: Variant 6 (High Contrast Pop + dealt-hand layout)
   - White bg, Inter 900, per-card colored borders, 3px black borders
   - Desktop: 3-column with rotations and overlap/cascade
   - Mobile: simple stacked colorful boxes, no rotation
   - Each card: gradient image placeholder (upgrade to real photos later), title, category, time, blurb

2. **Card controls**
   - Green check toggle (upper left): lock this item
   - Skip pill button (upper right, ghost): not today
   - Hide pill button (upper right, filled): never again
   - Instruction line: "Lock what sounds great. Skip what's not for today. Hide what's not for you."

3. **Page controls**
   - Big bold time (snapshot on load, re-snapshot on reshuffle or after 30min idle)
   - "What should we do today?"
   - City pills (11 cities)
   - Kids / No Kids toggle
   - RESHUFFLE button (rainbow animated, prominent)

4. **Interaction logic**
   - Lock: anchors the card, future reshuffles plan around it
   - Skip: card animates out, new card deals in for same time slot, 30-day localStorage cooldown (2nd skip = permanent)
   - Hide: card animates out, new card deals in, permanent localStorage block
   - Reshuffle: all unlocked cards replaced, time re-snapshotted
   - Drag-reorder: cards can be rearranged, times dynamically adjust
   - Page refresh: fresh plan (new shuffle), respects locks from previous session

5. **localStorage schema**
   ```json
   {
     "city": "campbell",
     "kids": true,
     "dismissed": {
       "event:muse-markets-2026-04-08": { "type": "skip", "until": "2026-05-08" },
       "place:tech-museum": { "type": "hide", "permanent": true }
     },
     "locked": ["place:vasona-lake-park"]
   }
   ```

### Phase 4: Rebrand
1. Wire southbaytoday.org to Vercel
2. Update all brand references (The South Bay Signal → South Bay Today)
3. Update social accounts (X, Bluesky, Threads, Facebook)
4. Set up redirects from southbaysignal.org → southbaytoday.org
5. Update OG images, meta tags, social copy prompts

### Phase 5: City Pages Upgrade
- `/city/[slug]` pages use the day-planning engine
- Auto-generate best-possible-day for a resident of each city
- Kids/No Kids toggle available on city pages too

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Persistence | localStorage | No accounts, per-device is fine for v1 |
| Day planning | Claude Haiku API | ~$0.001/plan, great quality, handles sequencing logic |
| Places data | Google Places API batch | ~$50 one-time, monthly refresh, 1500-2000 places |
| Card dismiss | Skip (30d) + Hide (permanent) | Two buttons always visible, no modal/popup |
| Time display | Snapshot on load | Not a ticking clock — reduces anxiety |
| Framework | Astro 6 + React + Vercel | Already in place, no migration needed |
| Kids toggle | Kids / No Kids | Clearer than Family/Not Family |

---

## Files Created/Modified This Session

### New files:
- `scripts/lib/paths.mjs` — central path config
- `scripts/health-report.mjs` — artifact health CLI
- `src/lib/south-bay/timeHelpers.ts` — shared time utilities
- `src/components/south-bay/homepage/HomepageView.tsx` — modular homepage
- `src/components/south-bay/homepage/useHomepageData.ts` — homepage data hook
- `src/components/south-bay/homepage/PhotoStrip.tsx` — photo marquee
- `src/components/south-bay/homepage/AroundTown.tsx` — civic actions
- `src/components/south-bay/homepage/CivicThisWeek.tsx` — civic rollup
- `src/components/south-bay/city/CityPage.tsx` — city page component
- `src/pages/city/[slug].astro` — city page route
- `public/aesthetics.html` — 20-direction aesthetic explorer (can delete)
- `public/south-bay-today-mockups.html` — 6 South Bay Today mockups (reference)

### Modified files:
- `.gitignore` — added social state files
- `package.json` — removed dead scripts, added health-report
- `CLAUDE.md` — updated docs
- `SOCIAL-HANDOFF.md` — updated docs
- `scripts/social/publish-from-queue.mjs` — removed git commit/push
- `scripts/social/lib/constants.mjs` — fixed tab URLs
- `scripts/social/lib/data-loader.mjs` — fixed tab URLs
- `scripts/watchdog.sh` — fixed false positives, added cooldown
- `src/lib/aestheticWeather.ts` — fixed fog emoji
- `src/components/south-bay/SignalApp.tsx` — swapped to HomepageView
- `src/pages/index.astro` — added responsive CSS for new components

---

## What NOT to Break

- Social pipeline on Mac Mini is working — social files are gitignored and on disk
- The nightly data commit task is disabled (social files no longer tracked in git)
- All existing generators still work and produce data
- The old OverviewView.tsx is preserved but not imported — safe rollback if needed
- Existing tab navigation still works for non-homepage tabs (Gov, Events, Sports, etc.)

---

## Immediate Next Step

Start with Phase 1 (Places Data Pool) — the day-planning engine needs a deep pool of "always there" places before it can generate good day plans. Events alone aren't enough.
