# South Bay Today — Session Handoff (2026-04-08)

## What Shipped This Session

| Item | File(s) | Status |
|------|---------|--------|
| **places.json** — 2516 places, 11 cities, 24 categories, `photoRef` field | `src/data/south-bay/places.json` | ✅ committed |
| **PhotoStrip memoized** — shuffle no longer restarts scroll animation | `PhotoStrip.tsx` | ✅ |
| **Loading card** — single card replaces 5 skeletons; rainbow accent bar + LoadingVerb centered | `SouthBayTodayView.tsx` | ✅ |
| **Auto-refresh** — plan re-fetches at :00/:30 marks while tab is open; stops after 10pm | `SouthBayTodayView.tsx` | ✅ |
| **City order** — Palo Alto before San Jose (now alphabetical) | `cities.ts` | ✅ |
| **CostNote passthrough** — event candidates now carry their `costNote` into the plan | `plan-day.ts` | ✅ |
| **Richer price labels** — "$ (under $15)" instead of just "$" | `plan-day.ts` | ✅ |
| **Instruction line right-aligned** | `SouthBayTodayView.tsx` | ✅ |
| **Social pipeline rebrand** — southbaysignal.org → southbaytoday.org in all social scripts | Mini | ✅ |

---

## Current State

- **Domain:** southbaytoday.org (live). southbaysignal.org 308-redirects.
- **Places pool:** 2516 entries with `photoRef` (Google Places photo reference). Plan engine uses these.
- **Photo thumbnails:** `photoRef` is present in data but **plan cards still show emoji fallback** — the `/api/place-photo` proxy exists but cards aren't wired up to it yet.
- **Events:** 544 from 25 sources (recovered from 86 after TDZ bug fix last cycle).
- **Plan engine:** `POST /api/plan-day` — scores places + events, calls Haiku to sequence 5-7 cards. 5-min cache by city:kids:hour.

---

## Next: Priority Order

### 1. Wire up photo thumbnails on plan cards ⭐ highest ROI
`places.json` already has `photoRef` on most entries. The `/api/place-photo` proxy is live. Plan cards currently fall back to a category emoji — replace that with an actual photo.

**What to do:**
- In `SouthBayTodayView.tsx`, when rendering a card: if `card.photoRef` exists, fetch `/api/place-photo?ref={photoRef}` and display the image (same slot as the emoji).
- Use a small in-component cache or `useMemo` so the same ref isn't re-fetched.
- Keep emoji as fallback when no `photoRef` or fetch fails.

This is the single change that makes plan cards look like a real product.

---

### 2. Loading card — still needs polish
The loading card (rainbow bar + gray LoadingVerb) is functional but the user flagged it as not compelling enough. The session ran out of context before resolving it.

**What to try:**
- Make the accent bar wider (20–24px instead of 5px) and taller (full card height, already is)
- Verb text: bump to 18px, use `#999` or `#888` instead of `#ccc`
- Consider a faint diagonal stripe or noise texture on the card background to give it texture
- Or: lean into the rainbow — make the entire left ~25% of the card the gradient background, with the verb in white on top of it

---

### 3. Aesthetic polish pass (standing order)
From the vision log standing orders: *"Aesthetics are lacking — fix aggressively."* The design is functional but not beautiful.

Focus areas:
- **Plan cards:** typography hierarchy (time block vs title vs blurb needs more contrast)
- **Buttons:** the traffic light row (✓ → ✕) could be more tactile/satisfying
- **Mobile:** check 375px experience — are card tap targets comfortable?

---

### 4. Events tab UX — 544 events means filtering matters more
With 6× more events since the TDZ fix, the Events tab filtering UX is now a bottleneck.

**From vision log next-3:**
- Category filter chips could be more visual (icons + labels)
- Date group headers (Today / This Week / Later) need stronger hierarchy
- Consider a sticky category bar so you can switch categories without scrolling back up

---

### 5. Neighborhood-level filtering for San José
215 SJ events = 40% of total. Willow Glen, Japantown, Almaden, Rose Garden are distinct communities.

**Approach:** Add a `neighborhood` field to SJ events based on zip code or venue name matching. Add sub-filter chips under the SJ city pill.

---

### 6. Permit Pulse: add Mountain View
Second-densest development corridor. `cityofmountainview.gov` has an open data / GIS portal. Would expand `permit-pulse.json` from PA-only to two cities.

---

### 7. Places pool refresh cadence
`generate-places.mjs` was a one-time run. Places open and close — consider a monthly cron on the Mini to re-scrape and commit fresh `places.json`.

**Easy win:** Add it to the nightly or weekly scheduled tasks on the Mini.

---

### 8. Unsplash on Tech tab
User mentioned trying Unsplash photos on the Tech tab (or other non-Today tabs). The API endpoint and orientation param are already built. The quality concern (grainy Unsplash shots) is less risky on a secondary tab than on the Today hero.

---

## Ongoing / Background

- **Social pipeline:** Running on Mini. 4 platforms (X, Bluesky, Threads, FB). Rebranded to southbaytoday.org this session.
- **Data refresh:** Nightly sync at 11:15pm PT via `sbs-nightly-data-commit`.
- **OSU Summer 2026:** CS 362 + CS 464 start Jun 22 — build speed may drop.
