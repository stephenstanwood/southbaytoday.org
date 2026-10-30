---
name: sbt-seo-sweep
description: Weekly combined Search Console, product, editorial, source, traffic, and discovery review for South Bay Today. Fixes what is safe, reports what is not.
---

# South Bay Today weekly SEO and growth review

Runs Tuesday 01:15 Pacific as the native `sbt-seo-sweep` Codex automation on
Stephen's Mac Mini. The scheduled source checkout is
`/Users/stephenstanwood/Projects/southbaytoday.org`; source edits and builds run
in a prepared isolated worktree, never in that shared scheduled checkout.
Inspect Google Search Console in the browser, ship high-confidence technical
and editorial fixes directly to `main`, and report anything genuinely blocked.

South Bay Today is a local news and civic-information site. Its readers arrive
with a job to do: find something to do this weekend, work out what the council
decided, see what opened. Search is how most of them arrive, so discovery is a
product concern, not a marketing one. This single weekly review also owns the former `sbt-growth-sweep` product,
editorial, source, and growth responsibilities. Collect one evidence pack, run
the Search Console/findability pass first, then the substantive product pass.
The separate Friday growth schedule is retired.

## Safe operating contract

0. Node lives at `/opt/homebrew/bin`. Non-interactive SSH does not put it on
   PATH — use a login shell (`zsh -lic`) or export it explicitly.
1. Prepare an isolated source checkout with
   `/opt/homebrew/bin/node /Users/stephenstanwood/Projects/southbaytoday.org/scripts/seo/workspace.mjs prepare`.
   Use the returned `path` for every source edit, build, test, and receipt in
   this run. The command acquires the existing shared repo lock for its bounded
   Git operation and releases it before returning. A busy lock means defer.
   Never keep a terminal read loop or an agent-turn-spanning lock holder alive;
   do not hold the shared lock while browsing, researching, editing, or testing.
   An interrupted run's branch, tracked edits, untracked files and private
   `workspace.json` remain in that worktree for recovery. Never reuse or remove
   another run's worktree automatically. Do not repair a dirty scheduled tree
   by restoring files, stashing unknown work, or bypassing its preflight.
2. Read `AGENTS.md` and `CLAUDE.md`, inspect `git status`, and preserve unrelated work. Fetch
   and merge safely in the isolated worktree before editing. Install its own
   dependencies with `npm ci`. Preparation links the same existing ignored
   `.env.local` into the private worktree without copying or printing keys.
   Keep secrets out of commits and receipts.
   The repo publishes directly to `main` through the guarded command below.
3. Never expose admin routes, never add a paid service, and never invent a
   fact, a source URL, an event, or a quote.
4. Never print tokens, environment variables, or the service-account key.

## Search Console is required

This is a browser-first Codex task. A crawl is useful evidence, but it is not a
substitute for Search Console.

1. Use `mini_native_cua` on the Mini to control normal signed-in Brave. Call
   `prepare_brave` before the first `js` call, then pass its exact returned
   `appPath` to `cua.getApp()` and follow the returned native Computer Use
   instructions. macOS may run Brave from an App Translocation path that differs
   from the installed-app name. Open a task-owned tab; close only this run's
   tabs and preserve the user's app and other tabs. Honor the shared browser
   lease: defer if another task or human login owns it. Preserve required
   script reviews. A lease, controller or review failure does not establish a
   Google login failure. Never use a MacBook browser or execution fallback.
   A single browser can contain several already-signed-in Google accounts. If
   Search Console shows the wrong account, use Google's visible account picker
   and select `stanwoodventures@gmail.com` when already listed. Do not enter
   credentials or inspect cookies, storage, passwords, or browser profiles.
   A signed-out dedicated automation profile is not evidence that normal
   Brave is signed out. Check normal Brave first, then any distinct, already
   connected Mini-local browser instance before declaring an auth block.
2. Open the verified URL-prefix property `https://southbaytoday.org/` under
   `stanwoodventures@gmail.com`. Google `authuser` ordinals are
   browser-profile-relative: this account has appeared as `authuser=0`, but the
   number is not identity proof and must not be treated as stable. Use the exact
   property URL without an ordinal, the account picker, or an ordinal only as a
   routing hint. Require visible Search Console UI to confirm both the account
   email and exact property. Do not use the similarly named unverified property
   under `stephen@stoa.works`, and do not use `/welcome` as a property test.
3. Inspect, at minimum:
   - Search results performance for the latest complete 28 days compared with
     the prior 28 days, including top queries and pages;
   - Page indexing reasons and meaningful changes since the prior run;
   - Sitemaps, their fetch status, errors, and warnings;
   - Core Web Vitals, HTTPS, Breadcrumb, Event, and other enhancement issues,
     plus Security issues and Manual actions when those sections contain
     findings;
   - URL Inspection for the highest-value new, fixed, or suspicious pages.
4. Submit the canonical sitemap index when missing. After a relevant fix is
   deployed and verified live, use **Validate fix** where Google offers it.
   Request indexing for no more than five genuinely new or materially fixed
   high-value URLs per run. Do not request indexing just to manufacture
   activity.
5. Never remove a property or user, change ownership, or use the Indexing API
   for ordinary pages.

Only after normal Mini Brave and every distinct connected Mini-local browser
instance have failed the visible account-and-property check, stop and report
`GSC_BROWSER_LOGIN_REQUIRED` with the exact account and property. Do not call
the run complete, and do not downgrade it to a crawl-only success.

## Measure first

```
npm run seo:sweep -- --write
```

Writes `data/seo/<date>.json` and prints a summary. Two instruments:

- **crawl** — needs no credentials. Walks `sitemap-index.xml` and checks
  status, redirects, titles, descriptions, canonicals, `lang`, `h1`,
  structured data, and internal links. The sitemap carries ~2,000 URLs, so the
  crawl samples 250 per run and rotates through the tail week over week;
  orphan detection self-disables on a sampled crawl.
- **Search Console API helper** — optional. When
  `GSC_SERVICE_ACCOUNT_JSON` exists in `.env.local`, it preloads submitted
  sitemaps, 28-day performance, striking-distance queries, low-CTR pages,
  rising queries, and URL Inspection samples. When it is unavailable, continue
  with the required browser pass; a missing service-account key is not a
  blocker and must not be handed back to Stephen.

Also confirm each week that Google, Bing, OAI-SearchBot, ChatGPT-User,
Claude-SearchBot, and Claude-User can still fetch `/robots.txt`, `/llms.txt`,
`/rss.xml`, and `/sitemap-index.xml` without a challenge.

Add `--inspect 20` to sample URL Inspection on flagged URLs when the API helper
is available. Use `--fix-sitemaps` only when it reports
`sitemap-not-submitted`; the browser may submit the sitemap directly instead.

## Shared traffic and health evidence

- Run `npm run report:growth -- --json` and compare complete trailing 7- and
  30-day windows with their preceding windows. Review top pages, referrers,
  countries, and AI referrers. Treat Vercel Web Analytics as human-oriented
  traffic, not a bot-log census.
- Run `npm run health-report -- --json`.
- Check live status and content for `/`, `/events`, `/robots.txt`, `/llms.txt`,
  `/sitemap-index.xml`, and several currently popular event leaf pages.
- Check that Google, Bing, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, and
  Claude-User can fetch the public discovery surfaces without a challenge.
- Review current official search/AI-publisher guidance only when a material
  behavior or standard may have changed. Prefer primary documentation.


## Review the actual product

Approach this as the weekly product/editorial meeting for South Bay Today, not
as a code-maintenance checklist. Inspect the live experience, source corpus,
generated artifacts, reader behavior, and current South Bay context. Ask:

- What real reader jobs is the site solving well or poorly this week? What
  questions, decisions, cities, audiences, dates, or moments are missing?
- Are the source feeds authoritative, current, resilient, and broad enough?
  Which cities, venues, public agencies, libraries, universities, cultural
  groups, food records, or community calendars are absent or overrepresented?
- Is ingestion, deduplication, categorization, scoring, and ranking choosing
  the most useful material—or merely the easiest material to collect?
- Is each surface showing the right facts in the right place? Review Home day
  plans, Events, city pages, government, food, newsletter, event leaves, cards,
  filters, labels, ordering, links, source credit, and empty/error states.
- What should be promoted, demoted, combined, explained, moved, added, or
  removed? Is important material buried? Is low-value material consuming space?
- What did traffic, searches, feedback, seasonal context, and source failures
  reveal about where the product should go next—not merely which title tag to
  tweak?

Use direct evidence from primary sources and the rendered product. You may
automatically add or repair source integrations, rebalance coverage, improve
ranking/scoring, change fields or presentation within existing surfaces,
remove low-value clutter, and improve reader-facing copy or workflows when the
case is strong and the change is reversible. Reader usefulness, factual
quality, local coverage, and trust come before raw traffic or SEO volume.

When a worthwhile change is too large or subjective to ship automatically,
send Stephen a concise recommendation with the evidence, expected reader
benefit, tradeoffs, and the smallest useful experiment. Do not reduce the
weekly run to a report when a safe, valuable substantive improvement is clear;
also do not manufacture churn just to create a commit.

## Sweep and improve

Inspect the full public site and current code for:

- crawl/indexing regressions, sitemap integrity, canonical/meta/robots errors,
  broken internal links, accidental thin/duplicate pages, and 404 growth;
- structured data validity and agreement with visible content, especially the
  canonical leaf URL, date/status/location/source for each Event;
- answer-friendly factual structure, clear provenance, visible freshness,
  semantic headings, descriptive links, accessibility, RSS/JSON discovery,
  and organization/about/contact signals that help search and answer engines
  understand and cite the publisher;
- obvious performance, security, dependency, and conversion regressions;
- traffic opportunities suggested by real queries/pages/referrers, without
  keyword stuffing, fake FAQs, mass thin pages, or content written for bots.
- substantive source, coverage, editorial-selection, information-placement,
  and reader-usefulness opportunities found in the product review above.

Implement all high-confidence reversible fixes and improvements you can verify.
It is acceptable to make no code change when the evidence does not support one.
Track source-less events as warnings; repair them only from a verified primary
source. Do not fabricate a `sameAs` URL.


## Fix directly (no need to ask)

- Indexable pages linked from the site but absent from the sitemap. The
  sitemap is generated by `@astrojs/sitemap` in `astro.config.mjs`; fix the
  `filter` rather than hand-maintaining URLs. Past-dated `/events/<date>` URLs
  are excluded deliberately — that is correct, leave it.
- Duplicate titles across near-identical pages (commonly an `/event/<slug>`
  and its `/events/<date>` sibling). Decide which URL should rank, make the
  other canonical to it, and make the titles distinct.
- Missing or badly sized titles and meta descriptions on non-event pages.
  Event titles are legitimately long because event names are long; do not
  truncate a real event name to satisfy a character count.
- Missing `lang`, missing `h1`, missing or contradictory canonical.
- Sitemap URLs that redirect or 404.
- Structured data gaps: `Event` on event pages, `Organization` sitewide,
  `BreadcrumbList` where breadcrumbs render. Search Console already reports
  Breadcrumbs and Events enhancements for this property — keep them valid.
- After a deploy that changed the freshness surface, run
  `node scripts/indexnow-ping.mjs` so Bing and friends re-crawl the pages that
  actually changed.

Commit with a short lowercase message describing the real change.

## Pursue opportunities

Read `strikingDistance`, `lowCtrPages`, and `risingQueries`:

- A query ranking 4–20 with real impressions is a page that nearly works. Ask
  whether the reader's actual job is served by the page Google is ranking. If
  it is, sharpen that page; if it is not, the answer is usually a better page,
  not more keywords.
- A top-10 page under 2% CTR is a snippet problem. Rewrite the title and
  description to say what the reader gets.
- Rising queries are early local demand — a venue, a neighborhood, an event
  type, a civic question. If the site can genuinely answer it from real
  sources, that is a page worth generating or a source worth adding.
- Seasonality is real here. Camps, weekend picks, holiday events, and school
  calendars all have lead time; a page that ships the week demand peaks has
  already missed it.

## Ask Stephen, do not decide alone

Report: a browser login or other credential that is actually unavailable; a
paid service; a new top-level section or nav change;
anything touching editorial identity or the mission; de-indexing or removing
existing pages; a redirect affecting an already-ranking URL; and anything
where the honest answer is "this might be wrong".

## Allowlist

The findability pass may change `src/`, `scripts/seo/`, `astro.config.mjs`,
`public/*.txt`, `data/seo/`, and `docs/seo-*.md`. The product pass retains the
former growth workflow authority to repair source adapters, generated source
data, ranking and existing surfaces with their focused tests. Preserve the
existing product constraints; major new sections and mission changes still
require Stephen. Stage only files necessary for the verified improvement.

## Verify and close out

1. Run `npm run check`, `npx astro check`, `npm run build`,
   `npm run audit:discovery`, and `git diff --check`, plus focused tests for
   every source or ranking change. Render each changed page type.
2. Commit only this run's changes in its isolated worktree. Publish with
   `/opt/homebrew/bin/node /Users/stephenstanwood/Projects/southbaytoday.org/scripts/seo/workspace.mjs publish /absolute/returned/worktree/path`.
   This bounded command holds and releases the shared lock itself, verifies the
   registered branch and clean checkouts, and refuses publication if `main`
   advanced. In that case merge `origin/main` into the isolated worktree,
   resolve overlaps while preserving source work, repeat affected validation,
   and retry. Never merge, reset, switch, or edit the scheduled checkout.
   Wait for a healthy Git-connected production deployment
   and verify the changed public surfaces live.
3. Only after live verification, use Search Console **Validate fix** or
   **Request indexing** where warranted; send one changed-URL IndexNow batch.
4. Save one dated receipt under `data/seo/` with the confirmed GSC account and
   property; 28-day search comparison; 7/30-day traffic comparisons; source
   and product findings; changes, checks, deployment proof and unresolved work.
5. Notify Stephen only for shipped changes, a material new finding, or a
   decision/blocker. Combine search and product findings into one concise
   message with `node ops/mini/sbt-seo-sweep/send-seo-dm.mjs --outcome shipped "…"`
   (use `decision` for a required decision).
   For unchanged success, call the same helper with `--outcome no_change` and
   the allowed `🔍 SBT SEO sweep` prefix. This clears any recovered failure
   locally and sends no message; keep the full result in the receipt.
6. A new failure gets one concise message beginning `⚠️ sbt-seo-sweep:`.
   Repeated identical failures remain in receipts without repeat messages.
   Never claim a successful combined audit when the required GSC evidence is
   unavailable. Preserve the native browser-capable Codex runtime.
