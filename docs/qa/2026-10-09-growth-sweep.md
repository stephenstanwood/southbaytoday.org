# South Bay Today growth sweep — October 9, 2026

## Measurement

Complete Pacific-time windows through October 8, from Vercel Web Analytics:

| Window | Visitors | Change | Pageviews | Change |
| --- | ---: | ---: | ---: | ---: |
| October 2–8 vs. September 25–October 1 | 1,465 | +12.3% | 2,128 | −11.6% |
| September 9–October 8 vs. August 10–September 8 | 5,386 | +110.5% | 8,845 | +68.7% |

Google remains the top named referrer (1,163 visitors / 30 days), then
DuckDuckGo (138) and Bing (91). AI referrals stay small: ChatGPT 5,
Perplexity 2, Gemini 1. Home and Events lead; Google-landed day pages
(`/events/2026-09-23`, `-09-21`, `-09-16`) and event leaves (Low Times car
show, Moon Festival) follow. `/404` is still the third most-viewed path.

All public discovery surfaces returned 200 for Googlebot, Bingbot,
OAI-SearchBot, ChatGPT-User, Claude-SearchBot and Claude-User without a
challenge. Community Day: Día de los Muertos, Vintage Media Lab and the
August 2 Gamble Garden tour, flagged last week, now resolve.

## Product finding: Sunnyvale coverage

Sunnyvale is the county's second-largest city and had 35 upcoming events
against Saratoga's 109 and Los Gatos's 137. Its city calendar and library are
deliberately closed to automation (re-checked: 403 on the site and
`robots.txt`; LibCal has no events module). Sunnyvale Community Players sells
its season through the same VBO Tickets plugin as the Pear, and its plugin
answers to the site id published on `sunnyvaleplayers.org/season-calendar/`.

Added `fetchSunnyvalePlayersEvents`: 42 performances across *Alice in
Wonderland* (Oct 24–Nov 8), *Rent*, *Disney's Descendants: The Musical* and
*Mean Girls*, one record per curtain time at Sunnyvale Community Theatre. Links
go to each show's page on the company site. Prices come from VBO's dollar range;
VBO shows "FREE" for *Mean Girls* before tickets go on sale (the show page lists
$44–$53), so that is left unknown rather than published as free. VBO and the
show page disagree on *Rent*'s rating, so ratings only feed the kid flag (G /
Jr. productions) and are not printed. The nightly refresh picks the source up.

Heritage Park Museum was also checked: a WordPress page with two items and no
feed — not worth an adapter.

## Link preservation: rolling runs

Palo Alto Players publishes one record per production and the adapter dates it
"today" for the run, so *A Gentleman's Guide to Love and Murder* moved its slug
every night from September 11 to 27. The archive only receives records that age
out, and the ledger only recorded future slugs, so 16 nightly URLs 404'd (the
September 20 and 27 URLs drew 25 visitors while broken). `retireSlugs` now records a passed
night when the same single record is still live at a later date, marked
`rolled`; `resolveRetired` 301s those entries to that record's next live (or
archived closing-night) leaf. A series that lists several sessions under one id
is excluded, so a past Meetup session never redirects to next week's. The 16
September slugs were backfilled from daily git snapshots; 95 retired slugs now
redirect (was 79).

Also measured, not changed: ~100 events a day leave the feed on their own date
before the archive sees them; since the September 18 ledger they resolve as
passed, noindex leaves. Roughly 5,000 slugs from July 11–September 17 predate
the ledger and still 404. Backfilling them would triple the ledger and add about
5,000 static pages for URLs with no measurable traffic, so they are left alone.

## Verification

- `npm run check`: passed (new `sunnyvale-players-events.test.mjs`, two new
  ledger tests).
- `npx astro check`: 0 errors, 0 warnings.
- `npm run build`: passed; the 16 redirects are in the Vercel config.
- `npm run audit:discovery`: OK — 2,021 sitemap URLs, 1,839 current event
  leaves, 4,182 JSON-LD blocks; 11 event leaves lack a primary-source URL
  (down from 26) and stay warnings, nothing fabricated.
- `git diff --check`: clean.

Health: Los Gatos MuniCode still rejects the crawler (held, no UA spoofing);
APOD is 54h old; Spring Break picks are off-season. Search Console API
credentials remain unavailable; the Tuesday `sbt-seo-sweep` owns GSC.
