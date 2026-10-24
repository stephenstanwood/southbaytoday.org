# Event source refresh reliability

The event database is refreshed by a guarded Mini job and independently checked
by GitHub Actions. Source adapters must fail closed: an unknown fetch or parser
failure must never be represented as a successful empty season.

## Production path

1. `org.southbaytoday.events-refresh` runs on the Mini at 7:15 PM PT, with an
   8:45 PM retry. A success under three hours old coalesces the retry; older
   daytime recoveries never suppress the whole nightly cycle.
2. `scripts/events/scheduled-refresh.mjs` acquires the shared repo lock, refreshes
   Playwright, inbound, and official-source snapshots, runs every adapter in strict mode, commits
   generated data, preflights again, pushes, and writes the success heartbeat.
3. `org.southbaytoday.events-refresh-watchdog` checks hourly. It restores the
   primary launch agent if it is missing and forces one guarded refresh when
   any of the three input snapshots is over four hours old or missing, or when
   the pushed success or generated output is unhealthy. Recovery uses the whole
   producer pipeline: live Playwright/inbound/official fetches, strict generation,
   audit, commit and push, then a fresh health check. It does not restamp old data.
   Recovery passes `--wait-for-lock`, retrying the existing mutex once a minute
   for up to 20 minutes. This lets an active fact-check or copy-edit finish before
   recovery instead of repeatedly deferring at the same hourly phase. A holder
   that outlasts the wait still blocks publication and leaves health unhealthy.
   Normal primary slots and manual `--force` calls still defer immediately.
   The four-hour threshold leaves room for the next hourly check, a busy repo
   lock, and source collection before GitHub's unchanged eight-hour limit.
4. The primary job restores the watchdog if that companion agent disappears.
5. `.github/workflows/refresh-events.yml` runs after the Mini with an eight-hour
   snapshot ceiling. GitHub scheduled starts can be hours late: the October 19
   05:17 UTC check started at 10:42 UTC, after its nightly inputs were 8.4 hours
   old. The Mini now maintains source freshness independently of that schedule.
   GitHub remains an independent strict check and alerts on workflow failure.

Install or repair both Mini agents — and relink the tracked pre-commit hook —
with:

```bash
bash scripts/events/install-mini-refresh.sh
```

## GitHub runtime and regression checks

`.node-version` selects Node 24 LTS for both the independent refresh and
`event-refresh-checks.yml`, which runs on every pull request and main push.
The package requires Node >=22.18.0: Astro 6 needs >=22.12.0, and the generator's
retired-slug ledger imports `eventSlug.ts`, which needs default native type
stripping (available starting with 22.18.0). Both workflows install with
`npm ci --engine-strict` so an unsupported runtime fails at installation.

Run `npm run test:event-refresh` with the declared Node runtime before changing
the workflow or generator. The suite executes the real generator in disposable
offline fixtures without a TypeScript loader, checks publication protection,
and prevents the refresh and PR workflows from choosing different runtimes.
The refresh runs the same checks before contacting sources. Node 20 previously
passed dependency installation with warnings and then failed before generation
with `ERR_UNKNOWN_FILE_EXTENSION` for the transitive `.ts` import.

After a runtime repair ships, dispatch `refresh-events.yml` on `main` and verify
generation, output health, and the data commit/push all succeed before clearing
failure alerts. Keep the eight-hour input snapshot ceiling; stale inputs are a
separate recovery problem, not a reason to relax the workflow.

The workflow publishes through `scripts/events/publish-refresh.mjs`, using the
same guarded Git preflight as the Mini's scheduled publishers. It fetches and
merges competing `main` commits before pushing, retries a rejected push at most
three times, and preserves the remote version of conflicting generated JSON.
Mini snapshots and concurrent editorial/source commits remain in the merged
history. The one-hour output and eight-hour input-snapshot health gates run
again after every merge, including a no-op, so a conflict cannot quietly replace
the checked output with stale or unhealthy remote data. Dirty checkouts and
local source/configuration commits still block publication; no force push or
shared-checkout reset is used.

The Mini uses this same publisher with its unchanged two-hour input ceiling,
and records its success heartbeat only after the merged output passes and is
pushed. A competing edit with older recorded inputs blocks publication even
when the raw snapshot files collected by the Mini are fresh; it never restamps
those older inputs or treats a successful scrape alone as recovery.

Copy repairs must also work on the first source pass. Hammer's Images preview
arrives with `IMAGES` and lowercase `and performance`; its existing sentence
repair runs after prose casing. Re-polishing the published `Images`/`And` form
alone would miss that ordering regression.

## Fail-closed contract

- Projected farmers markets are verified only when their configured season,
  start/end dates, weekday, and closures leave an eligible occurrence within
  the 90-day publication horizon. Expired or out-of-window schedules neither
  fetch nor alert; upcoming and active schedules still fail closed on HTTP or
  wording failures. A known end date never rolls forward into another year.
- Critical-source, per-source future-coverage, and aggregate-regression guards
  apply to **every** `generate-events.mjs` invocation, including the general
  data-refresh job and manual runs without `SBT_STRICT_EVENT_REFRESH=1`. Strict
  mode adds credential and input-snapshot preflight; it is not permission to
  publish incomplete output when omitted. A rejected refresh leaves the event
  database, archive, and retired-slug ledger unchanged.
- Every adapter exception blocks a strict refresh, including errors that legacy
  adapters used to swallow and return as an empty array.
- Shared HTTP fetches (including Ticketmaster Discovery) retry temporary
  network failures, rate limits, and 5xx responses with bounded backoff before
  strict mode fails. Permanent 4xx responses fail immediately.
- If a critical adapter still fails on a transient status after retries, the
  refresh reuses that source's previous rows when available and continues
  without paging. Optional adapters that 429 are absorbed unless many fail at
  once; the heartbeat matches that tolerance so a single Heritage Theatre rate
  limit cannot keep Discord red.
- Missing credentials, stale/empty snapshots, critical empty sources, and
  aggregate event/source regressions block the output write.
- A Playwright task that returns an empty array after previously contributing
  still-future rows is retried once, sequentially. If that retry is also empty,
  it is recorded as an error and only those still-future rows carry forward.
  Sources with no future rows still age out normally; the aggregate regression
  gate and its thresholds remain unchanged.
- Every adapter records per-date raw counts in `sourceHealth`. The next run
  blocks a source that suddenly loses most or all records that were still
  scheduled for the future. Past date buckets age out automatically, so a
  legitimate seasonal ending needs no allowlist.
- Stable primary routes are preferred over year-specific URLs. For example, San
  Jose Jazz starts at `/lineup`; if that official view is semantically empty,
  it tries `/chronological` and the current day pages discovered from the
  first-party menu instead of hardcoding yearly filter slugs.
- Los Altos History Museum and the San Jose Jazz Summer Fest lineup are fetched
  live by the Mini's `scripts/events/snapshot-official-sources.mjs`. Both sites
  returned HTTP 202 SiteGround CAPTCHA interstitials (`sg-captcha: challenge`)
  to GitHub-hosted runners on October 18, including for robots.txt; the Mini
  received their normal public calendar and lineup with the existing honest
  aggregator User-Agent. Do not solve the CAPTCHA, spoof a browser, or probe
  alternate endpoints after a challenge. The scheduled Mini refresh and GitHub
  set `SBT_USE_OFFICIAL_EVENT_SNAPSHOT=1` to read the committed
  `official-event-sources.json` instead. The writer calls the real adapters,
  rejects unrecognized content even without strict mode, and atomically replaces
  the snapshot only after both succeed. A parsed past festival can contribute
  zero future rows; a parser failure cannot. Consumers validate each source,
  its timestamp, and the envelope against the unchanged two-hour Mini/eight-hour
  GitHub ceiling. Missing, failed, or stale snapshots block before publication;
  every consumed snapshot remains visible in `inputSnapshots` and output health.
- San Jose Museum of Art is owned by the Playwright snapshot. Its redundant
  direct HTTP adapter was retired after Cloudflare began returning a managed
  403 challenge; browser failures retain that source's last healthy future rows.
  Calendar date labels are not clock times, and a museum listing does not
  establish paid admission. The browser adapter leaves both unknown unless
  sourced. Verified October–December 2026 detail-page corrections live in
  `eventSourceFacts.mjs`, apply before publication filtering, and preserve free
  admission versus a tour included with paid museum admission. A rejected
  browser request remains an error; these corrections do not imply that the
  live crawl recovered or authorize bypassing the challenge.
- City of Los Altos was retired on 2026-09-20 at Stephen's explicit request
  after its calendar HTML and published Main Calendar iCal both returned a
  managed Cloudflare 403. Do not retry or bypass the city endpoints. The prior
  general refresh had published an empty city source because output guards
  depended on strict mode; those guards now apply to every invocation.
- Los Altos Village Association supplies replacement downtown coverage through
  the public Tribe REST feed advertised by its calendar at
  `https://downtownlosaltos.org/events/list/`. Its robots rules allow that feed,
  and the Mini verified HTTP 200 with nine upcoming listings on 2026-09-20.
  Attribute these events to the association, never to the city government.
  Preserve Pacific dates/times, all-day status, venue, event links, and unknown
  pricing (a blank cost is not free). It is a seasonal organizer source under
  the normal optional-source policy, with a required health row and the same
  per-source future-coverage checks as other adapters. It does not replace city
  meeting or recreation-program coverage. Libraries, the History Museum, Stage
  Company, and Linden Tree continue supplying their own Los Altos events.
- Opera San José retired the CivicPlus iCal at `/events/?ical=1` when the site
  moved to Divi production pages (404 on 2026-09-11). Tribe iCal/REST exports
  are not published; the adapter reads the `26-27-season` lander for current
  `/productions/*` slugs and each page's server-rendered performance rows.
- Mexican Heritage Plaza reads its public `/allevents` HTML calendar and each
  dated detail page. Its robots policy excludes `?format=json`. Preserve the
  detail page's program text and admission terms: the October 2026 calendar
  preview for Fiesta Navideña incorrectly repeated Avenida de Altares. An
  image-only detail keeps empty copy; never substitute another event's preview.
  Missing dates, mismatched details and HTTP/parser failures remain failures.
- San Jose Theaters (California Theatre, San Jose Civic, Center for the
  Performing Arts, Montgomery Theater) moved from sanjosetheaters.org to Visit
  San Jose in September 2026. The old All-in-One Event Calendar iCal export
  began answering HTTP 200 with the `https://www.sanjose.org/theaters` HTML
  landing page; the adapter parsed zero VEVENTs as an empty success and the
  per-source regression guard blocked the 2026-09-22 refresh ("lost 59
  still-upcoming source records") — the guard was right and stays as is. The
  adapter now reads the public `/event-listings` JSON that the theaters page
  itself loads, keeps the rows that page keeps (`field_team_san_jose_theater`
  or one of the four houses), and takes show times from each listing's own
  detail page: the structured When time for single nights, the presenter's
  per-performance list for runs. Multi-night Opera San José and Broadway San
  Jose runs are skipped because fetchOperaSanJoseEvents and Ticketmaster
  already carry them under titles the dedup cannot match. Presenter listings
  that name a P.O. box resolve to the house named in their copy, and addresses
  come from a canonical map, never the listing. Every failure throws (HTML in
  place of JSON, no theater rows, more than a fifth of detail pages failing,
  nothing parsed), so a future move reads as one degraded source rather than a
  blocked refresh. robots.txt is stock Drupal and allows both paths. iCal
  adapters now call `assertIcalCalendar`, so an HTML page served from an old
  export URL is a source error there too.
- SJDA (Downtown San Jose) was retired 2026-08-24, and unlike SJMA the whole
  site is walled rather than one endpoint: the events API, `/events/feed/`,
  `?ical=1` and the sitemap that sjdowntown.com's own robots.txt advertises all
  answer 403 with a Cloudflare interstitial. The refusal is deliberate and
  stated, not just a bot wall — robots.txt names and disallows ClaudeBot, GPTBot,
  CCBot, Bytespider, Amazonbot, Google-Extended and meta-externalagent, and it
  disallows `CloudflareBrowserRenderingCrawler` too, so a headless browser is
  refused as explicitly as an HTTP client. Do not re-register the adapter, give
  it a browser User-Agent, or move it to the Playwright snapshot the way SJMA
  went; every one of those is the sidestep the host has asked us not to make.
  The coverage cost is real — roughly 332 upcoming downtown records, and no other
  adapter covers that beat, though downtown venues with their own adapters (SAP
  Center, San Jose Theaters, City Lights) are unaffected. SJDA does still
  reach us through the sanctioned channel: sjda@sjdowntown.com mails events to
  the inbound intake address, at a couple of events rather than hundreds. If
  downtown coverage needs restoring, ask SJDA for a feed — do not re-scrape.
- Saratoga's direct city-calendar adapter was retired on 2026-10-23 after a
  fresh robots review. Its policy excludes calendar, RSS and iCalendar
  collection paths for named AI crawlers. Do not rely on the configured
  iCalendar URL's mixed casing to escape the lowercase exclusion, or substitute
  another export, host, header or browser. No city calendar content was fetched
  during this review. Preserve the captured winter-clock parser regression
  offline with an example.test feed URL. The nine previously published city
  listings are not established cancellations: correct SMASH against its own
  organizer, leave the others intact, and let the ordinary refresh maintain
  their retired URLs. Newsletter intake and independent organizers remain
  separate source channels; the old source-health row is historical.
- VBO's Pear Theatre, Sunnyvale Community Players and Hammer Theatre adapters
  were retired on 2026-10-24. A normal request to
  `https://plugin.vbotickets.com/robots.txt` returned HTTP 200 with
  `Disallow: /v*/`; all three adapters requested occurrence dates from
  `/v5.0/controls/events.asp`. Remove those request implementations and source
  registrations. Do not substitute another version, host, identity or browser
  for the excluded calendar controls. The separately allowed ticket landing
  pages do not establish every performance's dates; no excluded control was
  requested during review. Keep the pure parsers and their offline fixtures.
  The 103 existing rows from these adapters are not confirmed cancellations;
  leave their facts intact and let ordinary refresh maintain retired URLs when
  they leave the feed. Historical source-health rows describe their earlier
  collection. Independent organizer/newsletter records remain separate channels.
  Restoring direct collection requires an approved source channel.
- Mountain View and Los Gatos Library LibCal collection was retired on
  2026-10-24. Normal requests to each tenant's `/robots.txt` returned HTTP 200
  with `User-agent: GPTBot` and `Disallow: /`. No calendar, occurrence or list
  endpoint was requested after reviewing those exclusions. Remove both source
  registrations and all LibCal request code, including the optional live venue
  verifier. Do not substitute an endpoint, host, header or browser. Retain the
  pure captured-row parser and location/attendance fixtures offline. Existing
  published library rows are not established cancellations; leave their facts
  intact and let ordinary refresh maintain retired URLs when they leave the
  feed. Historical health rows describe earlier collection. Restoring either
  tenant requires an approved source channel; BiblioCommons and independent
  newsletter/organizer records remain separate channels.
  The Playwright coverage baseline explicitly excludes these two retired
  sources only while their tasks are absent. Their 217 historical rows in the
  October 24 snapshot otherwise made every fresh run fail the 60% guard
  (441 to 224 events). Unknown task removals and losses among remaining sources
  retain the same thresholds. Old snapshot bytes are not rewritten or restamped;
  the next complete guarded refresh and slug ledger handle the transition.
- Japanese American Museum of San Jose (JAMsj) live collection was retired on
  2026-10-23. A normal request to `https://www.jamsj.org/robots.txt` returned
  HTTP 200 with `Disallow: /` for GPTBot, ClaudeBot and other named AI agents.
  The generator still registered a Squarespace adapter for that host. Remove
  its request code and registration; do not substitute another export, host,
  header or browser. No content page was fetched after the exclusion was
  observed. The six previously published future listings are not confirmed
  cancellations and are left unchanged; the next ordinary refresh may retire
  their URLs through the existing slug ledger. Historical source-health rows
  describe the earlier run, not restored collection. Any future ingestion
  requires an approved source channel.
- Hicklebee's HTTP adapter recovered on 2026-08-29 by removing spoofed
  Safari headers. At that time Node's default headers returned event HTML
  while browser headers triggered a Cloudflare challenge. Keep that historical
  diagnosis distinct from current access permission: do not add a browser
  User-Agent, Accept, or Sec-Fetch headers. `/events` is current-month-only;
  the old HTTP implementation walked `/events/YYYY/MM` and parsed `event-list__*`,
  rather than the footer's single `event-block__*` widget.
  The obsolete Playwright duplicate was removed on 2026-10-22 after repeated
  `networkidle` timeouts; the generator had already recorded four future
  Hicklebee's rows through its HTTP adapter that morning. No publication or
  carry-forward guard was relaxed.
  **Current access policy (2026-10-22):** a normal Mini request for
  `https://hicklebees.com/robots.txt` returned 200, but its named-agent group now
  disallows GPTBot, ChatGPT, Claude and several other crawlers. The wildcard
  group also requests `crawl-delay: 10`. This differs from the August policy
  recorded here previously. Agent-driven live verification stopped after this
  robots read: do not change identity, headers, hosts, or tools to evade those
  exclusions. Any future live ingestion requires an approved source channel
  and a new decision to restore it. Prior generated rows and passing offline
  tests do not establish source permission.
  With no approved channel available, the HTTP adapter is also retired from
  the scheduled generator. Its request code and registration were removed, so
  the next refresh cannot treat this access gap as fresh Hicklebee's coverage.
  The four previously published rows may leave the feed at that refresh; this
  is an explicit source retirement, not a successful empty season. The pure
  parser and fixtures remain offline. Stephen accepted permanent retirement
  on 2026-10-22; no source-permission or replacement-feed follow-up remains for
  this incident. Close the scraper alert on verified retirement without
  claiming that the venue's live crawl recovered.

## October 22 Playwright zero-source review

The repeated zeros belonged to one health incident, not thirteen independent
outages. These are source dispositions, not an empty-season allowlist. Counts
below come from the same morning's committed output or the scoped live checks;
only date-backed records count as coverage.

| Task(s) | Verified disposition |
| --- | --- |
| City of Mountain View, Sunnyvale, San Jose | Existing blocked CivicPlus paths; direct adapters were already disabled. Browser zeros do not prove a quiet calendar or restored city coverage. Do not bypass the restrictions. |
| The Tech Interactive (legacy) | The Tech Upcoming supplied 11 events in the same snapshot. |
| Hicklebee's | Both live adapters remain retired at Stephen's instruction. This is the accepted incident outcome; no replacement-feed follow-up remains. Four prior future rows may leave the feed on refresh. |
| SCCCFD (Eventbrite) | The generator's structured organizer adapter supplied six rows; this browser parser is redundant coverage. |
| Hammer Theatre | The generator's first-party adapter supplied 61 rows; the legacy browser zero is not a venue outage. |
| Palo Alto Art Center | The configured cityofpaloalto.org host denied a normal robots request with HTTP 403. Treat as an access gap, not an off-season. Do not probe alternate hosts to sidestep it. |
| Downtown Mountain View | `/events` returned 404; the domain's homepage redirected to a real-estate page at galliteam.com. Retired the obsolete task without claiming replacement coverage. |
| California's Great America | Live event index showed only “More Days & More Fun Through 11/1” and “Select Dates thru Nov. 1,” with no enumerated occurrence dates. Do not turn a park-opening promotion into invented calendar entries. |
| Books Inc | Genuine parser drift: the rendered cards dropped the regional-label line required by the old regex. The current calendar's Event JSON-LD carries explicit years, Pacific offsets, clocks and addresses. The repaired adapter recovered six South Bay listings from the live first page; Pruneyard maps to Campbell. Missing prices remain unknown. |
| Barnes & Noble, Half Price Books | Normal robots requests returned HTTP 403 (Akamai / Cloudflare). No alternate endpoint, browser identity, or challenge attempt was used. These zeros are not verified quiet seasons. |

POST separately recovered two events on its existing sequential retry. SJMA's
known 403 retained six still-future listings through the unchanged error guard;
its retired direct HTTP adapter remains retired.

### October 24 follow-up: classify repeated zeros before alerting

The same ten empty tasks recurred in the 15:52 and 16:08 UTC snapshots, which
both retained 224 events from 20 sources. Repetition alone did not establish a
selector regression or a cancellation. The current review supersedes the
October 22 counts and Hammer disposition above:

- Mountain View, Sunnyvale and San Jose still refused normal robots requests
  with HTTP 403. Half Price Books did too. No calendar content or alternate
  identity was requested after those refusals.
- Palo Alto's robots file now returns 200, but excludes the Art Center's
  `Events/*` and `Our-Calendar` paths under its published department paths.
  Do not use a bare path, another department spelling or another host to avoid
  those exclusions. This remains an access gap, not a quiet season.
- Hammer's VBO collector was retired on October 24; the October 22 report of
  61 direct-source rows is historical. A normal request to
  `https://hammertheatre.com/robots.txt` now returns HTTP 403 (error 1010).
  No event page, VBO control or alternate channel was requested in this review.
- The Tech Upcoming supplied ten dated browser rows. The fire department's
  structured organizer adapter supplied four dated rows, two of which were
  published inside the feed's horizon. Their legacy browser zeros are not
  evidence that the corresponding organizations have no events.
- Great America's allowed [event index](https://www.sixflags.com/cagreatamerica/events)
  and its [linked promotion](https://www.sixflags.com/cagreatamerica/events/more-days-more-fun) still offer
  only “More Days & More Fun Through 11/1” / “Select Dates thru Nov. 1”.
  Neither establishes individual event occurrences. Do not invent dates or
  fetch the `/api/` paths excluded by its robots policy.
- Barnes & Noble's store-host robots request now returns 404. Ordinary HTTP
  requests return store-page shells without dated events, while the default
  browser receives 403 from both configured store pages. Stop at that refusal;
  the shells do not establish a successful calendar crawl or a quiet season.
- SJMA still reports its actual HTTP 403 and retains six prior future rows.
  Retention is not a successful live crawl and does not restore its retired
  direct adapter.

The browser wrapper now records main-frame HTTP 401, 403 and 429 responses as
access errors even when an adapter swallows the failure or returns partial
rows. Unrelated resource/iframe refusals do not turn a valid empty calendar
into an error. Existing specific errors, bounded future-row retention,
coverage thresholds and freshness checks remain unchanged.

The Mini's `sbs-playwright-scrape` recipe must classify fresh source health
against the latest review and current date-backed alternate coverage before
notifying MILO. Already reviewed, unchanged gaps and undated promotions stay
visible in source evidence without creating another repair request. New parser
errors, unknown persistent zeros, failed alternate coverage or unexpected loss
of retained future rows still require an exact actionable alert. A source name
in this document is never an empty-season allowlist.

## Other refresh safeguards

- Inbound events arrive as one Vercel Blob shard per intake email (866 as of
  2026-08). Shard reads are bounded to 24 at a time and retry transient
  failures. What still fails is weighed, not simply counted: a subset (up to 5%,
  minimum 2) degrades the pull with a warning and a `shardFailures` stamp in
  `_meta`, while a larger share blocks. This is not a catch-and-empty path — the
  failures are reported, and the zero-events and coverage-regression guards
  still gate the write. A failed shard *listing* always blocks, because without
  a denominator a silent undercount is indistinguishable from a clean read.
  Three unreachable shards out of 860 aborted the 2026-08-23/24 refreshes after
  the 40-minute Playwright stage had already produced good data.
- `eventCount` in `upcoming-events.json` is derived data. `generate-events`
  writes it with `events` so they cannot disagree, but the editing routines
  (fact-check, copy-edit, one-off backfills) mutate `events` directly. The
  tracked `scripts/hooks/pre-commit` hook normalizes the stamp whenever anything
  under `src/data/south-bay/` is staged, and never blocks a commit. It is
  installed by `install-mini-refresh.sh`, which the scheduled refresh runs on
  every pass, so the link self-heals.
- An "empty" source is not automatically an honest off-season. Three of the ten
  reporting `status: "empty"` on 2026-09-01 turned out to be adapters looking in
  the wrong place, and a hand-curated list nobody had a reason to revisit is the
  same failure as a broken selector — it just fails quietly and on a delay:
  - **Heritage Theatre (Campbell)** read Ticketmaster's Discovery feed for venue
    `KovZpZAAnItA`. That id is right — it is the only "Heritage Theatre"
    Ticketmaster lists in California — but the feed returns `totalElements: 0`
    with no date filter at all, and had for long enough that a whole Campbell
    season was invisible: eight shows inside the same 180-day window, Neil
    Diamond Superstar three days out. The adapter now reads the theatre's own
    Wix calendar, which is a primary source and an easier one: `robots.txt`
    allows everything but `*?lightbox=` and advertises
    `event-pages-sitemap.xml`, and every event page carries schema.org Event
    JSON-LD with a Pacific offset on `startDate`. Two shapes to know: a
    sitemap `…/form` entry is the registration form for an event page Wix
    sometimes omits (the live Oct 3 2026 AIM for Seva concert is only reachable
    that way, while the sitemap's bare slug for it points at a cancelled
    duplicate), and `eventStatus` marks scrapped shows *and* retired drafts
    `EventCancelled`, so it is the filter that keeps "Testing Event" out. This
    is not the SJMA/SJDA situation — nothing here is a host refusing automated
    access.
  - **San Jose Giants** asked StatsAPI for `gameType=R`, so the postseason was
    never in scope. On 2026-09-01 the Giants had clinched the California League
    North first half (standings API, `standingsTypes=firstHalf`, 37–29,
    `clinched: true`) and held two home Division Series dates at Excite
    Ballpark, while every remaining regular-season game was in Fresno — the
    source reported "empty" for all of September. The query now spans
    `R,F,D,L,W` and runs to Oct 5. Postseason rows carry the placeholder
    franchise "To Be Determined" (team id 41) on the undecided side, which
    matches no California League market and so hits the same guard that keeps
    Copa de la Diversión promo identities out; and a slot the league has not
    timed yet carries a filler stamp flagged by `status.startTimeTBD` (the
    Sep 8 game reads 3:33 a.m. PT) that must not be published as a clock time.
  - **Santa Clara County Fire Department** was a hardcoded array carrying the
    note "Update annually or when the organizer posts new events," and nobody
    did — every date in it ran Apr–Aug 2026. Eventbrite's
    `/v3/events/search/` API really is gone, which is why the list existed, but
    the organizer page needs no API: it embeds `upcomingEvents` as JSON in
    `__NEXT_DATA__` with dates, times, timezone, venue address, online flag,
    cancellation flag, and minimum ticket price, and `robots.txt` allows `/o/`
    for `User-agent: *`. Two shapes to know: "ON DEMAND" listings are evergreen
    recordings dated whenever they went up (one reads 2025-05-07) and are not
    calendar events, and the organizer packs metadata into its own titles
    ("… | $15 | Campbell | 1.5 hrs - 2026") where the price contradicts the
    card — $15 is the class fee, checkout starts at $17.85 with the Eventbrite
    fee. Monte Sereno has no `City` slug; the canonical `SLUG_TO_CITY_TOKENS`
    map already folds it into Los Gatos, and the venue and street stay as
    published.
- A failed Mini run rolls back only its uncommitted generated data, leaves the
  last known-good database deployed, alerts, and retries.
- Host saturation is reported as host saturation, not as a source outage. A
  pinned Mini makes every `page.goto` burn its full timeout and return zero
  rows, which trips the coverage gate with counts that look like a mass
  adapter failure. The gate still fails closed; its message now carries the
  host's load-per-core and the share of source errors that were timeouts, so
  a saturated machine names itself. On 2026-08-29 the refresh reported
  "22→17 sources, 615→575 events" while load average sat at 84 on 10 cores and
  every "down" venue answered curl with a 200 in under half a second — 23
  leaked Discord plugin `bun` processes (orphaned to PID 1 by exited Claude
  sessions) held ~9 of the 10 cores. Reaping them restored the run to 613
  events from 22 sources in 2 minutes. Check `uptime` on the Mini before
  investigating any adapter that reports a navigation timeout.
- A dirty scheduled checkout names the job that dirtied it. The preflight
  refuses to publish from a tree with tracked changes and that guard is
  deliberate — do not weaken it. What the alert adds is attribution: when this
  run stole a stale lock from a crashed prior holder, the block message says
  whose abandoned output the modified files most likely are. The 2026-08-17
  alert listed 20 modified data files with no hint that
  `southbaysignal-data-refresh` had crashed 124 minutes earlier holding the
  lock; that crash also left `upcoming-events.json` without its
  `inputSnapshots` array, which is what turned the heartbeat red alongside it.

## Shared-lock retries and homepage plans

A source refresh may overlap the homepage-plan retry. A busy plan retry verifies
all four current today/tomorrow plans at the actual `origin/main` tip, including
the shared pillar-pair contract, before deciding whether publication is missing.
Already published plans make that retry a quiet no-op. The check downloads Git
objects without changing HEAD, the index, FETCH_HEAD or remote refs. Missing,
invalid or unverifiable remote plans keep the existing failure alert; local-only
plans never establish publication. Forced refreshes and explicit preflights still
require the shared lock.

## Verification and recovery

Library descriptions preserve HTML list boundaries before tag stripping, then
pass through `polishDescription`. Keep that order: once a list becomes a run
of words, generic prose cleanup cannot recover arbitrary item boundaries.
The shared library extractor covers BiblioCommons and LibCal, including
entity-encoded HTML. Its captured source fixtures and the normalizer tests run
in `npm run test:event-refresh` before publication. They preserve brand names,
month abbreviations, raw and previously split meridiems, equipment acronyms,
exception dates, attendance requirements and identifiers. New shorter source
copy still replaces older wording; the pipeline does not restore historical
descriptions by event ID.

The exported title/body normalizers also keep source-supplied LinkedIn, STAR,
SJ, LCSW and CMEMS spellings. Name abbreviations before English or Spanish
conjunctions (for example, "Super Smash Bros. y más") keep their continuation
case, while genuine following sentences still capitalize. Full reviewed-copy
fixtures cover all six October 20 regressions and repeated normalization.

Offline publication fixtures intentionally produce source failures and must
never reach personal MILO intake. `notification-intake.mjs` rejects uninjected
live transports inside Node test workers. CLI fixtures preserve
`NODE_TEST_CONTEXT` and set `SBT_NOTIFICATION_TEST_DIR` to their own temporary
directory; both notification intents and cooldowns stay there. The fixtures
assert that their blocking alerts were recorded locally and that published
files remain byte-identical. Production callers keep their normal intake route.

```bash
uptime  # load-per-core first: a saturated Mini fakes a mass source outage
node scripts/events/verify-refresh-output.mjs --max-age-hours 30 --snapshot-max-age-hours 30
node --input-type=module <<'NODE'
import fs from "node:fs";
import os from "node:os";
import { inspectMiniEventRefresh } from "./scripts/events/event-refresh-health.mjs";
console.log(inspectMiniEventRefresh({
  state: JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/SouthBayToday/events-refresh-state.json`)),
  data: JSON.parse(fs.readFileSync("src/data/south-bay/upcoming-events.json")),
}));
NODE
node scripts/events/scheduled-refresh.mjs --force
launchctl print gui/$(id -u)/org.southbaytoday.events-refresh
launchctl print gui/$(id -u)/org.southbaytoday.events-refresh-watchdog
tail -n 200 ~/Library/Logs/sbt-events-refresh.log
tail -n 200 ~/Library/Logs/sbt-events-refresh-watchdog.log
```

The module inspection above is read-only. `refresh-watchdog.mjs --check-only`
still ensures the primary launch agent and signals unhealthy output; use it
only when those effects are intended.

When adding a source, register it in the main `sources` array and return actual
event dates. Do not add a degraded catch-and-empty path for strict mode; date
buckets and the health verifier depend on the adapter exposing failures and
future occurrences honestly.
