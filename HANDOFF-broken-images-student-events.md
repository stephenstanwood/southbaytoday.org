# Handoff — broken images + student-event filtering (PR #148)

**Date:** 2026-06-02
**Branch:** `claude/broken-images-student-events-4plh9` → PR #148 (draft)
**Why this exists:** a cloud (web) session made the *code* changes but could not run
anything on the Mini or touch GCP. Everything below needs a **local session on the
Mac Mini** (`/Users/stephenstanwood/Projects/southbaytoday.org`, has `.env.local`
with API keys). Run node as `PATH=/opt/homebrew/bin:$PATH node ...`.

---

## TL;DR — what's actually left

| # | Task | Needs | Status |
|---|------|-------|--------|
| 1 | Fix GCP billing on the Places API project | GCP console | ⛔ not done |
| 2 | Refresh expired photoRefs + commit data | Mini + working key | ⛔ not done |
| 3 | Re-run `generate-events` so the student filter takes effect, then refresh day-plans | Mini | ⛔ not done |
| 4 | Confirm `check-photoref-health` cron is alive (it missed a 100% failure) | Mini | ⛔ not done |
| 5 | Merge PR #148 + ensure Mini pulls so nightly jobs use new code | GitHub + Mini | ⛔ not done |

## What IS already done (committed on the branch — do NOT redo)

- **Newsletter image resilience** (`scripts/newsletter/lib.mjs`, wired into `build.mjs`
  + `send.mjs`): `finalizeNewsletterImages()` probes every candidate image at build
  time and drops only *definitively* unreachable ones (4xx / non-image 2xx); transient
  errors are kept. Dead tiles → fall back to the existing text/colspan layout.
- **`/plan/[id]` fallback** (`src/pages/plan/[id].ts`): the `<img>` sits over the emoji
  tile and `onerror`-hides, so a dead photoRef shows the emoji, not a broken glyph.
- **Student-event filter logic** (`scripts/generate-events.mjs`): new
  `STUDENT_ONLY_AUDIENCE` regex added to `isStudentOnlyEvent()` (SJSU + SCU feeds only).
  Catches "for Students", "students only", "during finals week", "valid student ID",
  etc. — including "Free Chair Massages for Students" — without touching genuinely
  public events.
- **Tests** (`scripts/newsletter/lib.test.mjs`): dead-photoRef → colspan; transient →
  keep image. All `.mjs` suites pass.

> ⚠️ These are **code-only** changes. They take effect when (a) Vercel redeploys
> (`/plan` fallback) and (b) the Mini pulls + re-runs its nightly generators
> (newsletter verification + student filter). Until then the live data is unchanged.

---

## 1. Fix GCP billing — the actual root cause

**Finding:** 100% of stored Google Places `photoRef`s return 404 from
`https://southbaytoday.org/api/place-photo?ref=...` — verified against production,
including the source refs in `places.json`. Refs nominally last ~30 days but these
died only ~13 days after the 2026-05-20 refresh, which points at a **lapsed/suspended
billing account on the GCP project that owns `GOOGLE_PLACES_API_KEY`**, not normal
expiry.

The GCP account email is **not stored in the repo** (only a bare key in the Mini's
`.env.local`; no service-account JSON, no project id). Identify the owning account
on the Mini:

```bash
gcloud auth list                                   # logged-in account email(s)
gcloud config get-value project                    # active project
# map the actual key string → its project (project number is embedded in the result):
gcloud services api-keys lookup-key \
  "$(grep -m1 GOOGLE_PLACES_API_KEY ~/Projects/southbaytoday.org/.env.local | cut -d= -f2-)"
```

Then in the Cloud Console for that project: **Billing → reattach/update a valid
billing account**, and confirm **Places API (New)** is enabled and not over quota.

**Verify the fix** (any healthy ref should return an image, not 404):

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  "https://southbaytoday.org/api/place-photo?ref=$(PATH=/opt/homebrew/bin:$PATH node -e '
    const d=require("./src/data/south-bay/places.json");
    process.stdout.write(encodeURIComponent(d.places.find(p=>p.photoRef).photoRef))')&w=144&h=144"
# want: 200 image/jpeg  (currently: 404 text/plain)
```

> Note: the proxy reads `import.meta.env.GOOGLE_PLACES_API_KEY` at runtime on **Vercel**,
> so the key/billing that matters for the live tiles is the one in the **Vercel project
> env**, not just the Mini's `.env.local`. Check both — they should be the same key.

## 2. Refresh expired photoRefs and commit the data

Once billing works, re-fetch fresh refs and propagate them into the data artifacts
(`places.json`, `default-plans.json`, `place-research-cache.json`,
`upcoming-events.json`):

```bash
cd ~/Projects/southbaytoday.org && git pull origin claude/broken-images-student-events-4plh9
PATH=/opt/homebrew/bin:$PATH node scripts/refresh-place-photorefs.mjs --force
```

Spot-check a sample of the new refs against prod (or just confirm tiles load on the
Events tab), then commit the regenerated JSON.

## 3. Re-run event generation so the student filter takes effect

The filter is committed but the *data* still contains the offending events.
Confirmed still present in committed data right now:

```
upcoming-events.json  → "Free Chair Massages for Students"  (still there)
default-plans.json    → same event in a day-plan slot       (still there)
```

Regenerate (this applies `isStudentOnlyEvent` at ingest), then rebuild day-plans so
the live guide drops it too:

```bash
PATH=/opt/homebrew/bin:$PATH node scripts/generate-events.mjs
# day-plans are rebuilt from events by generate-schedule (the default-plans-refresh launchd job):
PATH=/opt/homebrew/bin:$PATH node --env-file=.env.local scripts/social/generate-schedule.mjs --hero-only
```

Verify it's gone, then commit:

```bash
PATH=/opt/homebrew/bin:$PATH node -e '
for (const f of ["upcoming-events.json","default-plans.json"]) {
  const s=JSON.stringify(require("./src/data/south-bay/"+f)).toLowerCase();
  console.log(f, "still has chair massage:", s.includes("chair massage"));  // want: false
}'
```

> If other student-only stragglers show up, widen `STUDENT_ONLY_AUDIENCE` /
> `STUDENT_ONLY_TITLE` in `scripts/generate-events.mjs` (~line 2150) — both are applied
> to the SJSU + SCU feeds only, so audience phrasing like "for students" is safe there.

## 4. Confirm the photoRef health sentinel is actually running

`scripts/check-photoref-health.mjs` samples 20 random refs and DMs via the cat-signal
if >10% fail. A 100% failure should have screamed — it didn't, so the cron/launchd job
is probably not wired up (or its notify path is broken). Check for a launchd plist that
runs it; if none exists, add one (daily). Quick manual run:

```bash
PATH=/opt/homebrew/bin:$PATH node scripts/check-photoref-health.mjs
```

## 5. Merge + propagate the code

- Merge PR #148 (currently draft) so Vercel redeploys the `/plan/[id]` fallback.
- Make sure the Mini's checkout is on the merged `main` before the next nightly run,
  so the newsletter image-verification and the student filter are actually in the code
  path the cron uses.

---

## Quick reference — files touched in PR #148

```
scripts/generate-events.mjs      # STUDENT_ONLY_AUDIENCE filter
scripts/newsletter/lib.mjs       # finalizeNewsletterImages / probe / verify
scripts/newsletter/build.mjs     # await finalizeNewsletterImages(data)
scripts/newsletter/send.mjs      # await finalizeNewsletterImages(data)
scripts/newsletter/lib.test.mjs  # tests
src/pages/plan/[id].ts           # onerror emoji fallback
```
