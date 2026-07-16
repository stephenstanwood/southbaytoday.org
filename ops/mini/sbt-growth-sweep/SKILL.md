---
name: sbt-growth-sweep
description: Weekly autonomous product, editorial, source, traffic, SEO, discovery, quality, and AI-citation sweep for South Bay Today.
---

# South Bay Today weekly growth sweep

Run every Friday at 2:45am Pacific on Stephen's Mac Mini. Work only in
`/Users/stephenstanwood/Projects/southbaytoday.org`. This is an autonomous
product, editorial, maintenance, and growth task. It is not limited to
technical SEO: ship high-confidence substantive and technical fixes and
improvements directly; ask Stephen only about paid services, credentials,
irreversible external changes, editorial identity, major new top-level product
bets, or genuinely close strategic calls.

## Safe operating contract

0. Mini SSH commands must run in a login shell (`zsh -lic`) or explicitly add
   `/opt/homebrew/bin` to `PATH`; non-interactive SSH does not expose Node/npm.
1. Acquire the shared repository lock before any git operation:
   `bash ~/.claude/scheduled-tasks/lib/repo-lock.sh acquire sbt-growth-sweep`.
   If the lock is busy, stop cleanly and report who holds it. Always release it
   in a trap and explicitly at the end.
2. Read `CLAUDE.md`, inspect `git status`, and preserve unrelated work. Fetch
   and rebase/pull safely before editing. The repo uses direct `main` pushes.
3. Treat the product constraints in `CLAUDE.md` as the current baseline, not a
   reason to skip product thinking. Reversible improvements to sources,
   ranking, fields, labels, placement, and existing sections are in scope.
   Raise major new top-level sections, mission/identity changes, or large
   information-architecture rewrites to Stephen with evidence. Never expose
   admin routes, add paid services, or invent unsupported facts/source URLs.
4. Never print tokens, cookies, environment variables, or credential files.

## Measure first

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

## Verify and ship

Run, at minimum:

1. `npm run check`
2. `npx astro check`
3. `npm run build`
4. `npm run audit:discovery`
5. `git diff --check`

Review the rendered result for any page type you changed. If verification
passes, commit only this task's files with a concise message and push `main`.
Wait for the Vercel production deployment to become healthy, rerun the relevant
live checks, then run `node scripts/indexnow-ping.mjs` once. Never submit the
same unchanged URL batch repeatedly within a run.

## Report

Send Stephen one concise Discord completion note containing:

- 7- and 30-day visitor/pageview trends and top meaningful traffic source;
- the most important product/editorial/source insight from the week;
- what substantive and technical changes shipped and the production commit,
  or why a no-op was correct;
- verification and live-deployment status;
- warnings that need judgment (including any search-console credential gap,
  paid tooling choice, or unexplained high-value indexing loss).

If Google Search Console API credentials are available, include Search
Analytics and sitemap status. If they are not, do not block or repeatedly nag:
record that the rest of the sweep ran and mention the one-time setup only when
it remains the most valuable unresolved measurement gap.
