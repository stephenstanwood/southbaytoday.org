# South Bay Today growth sweep — October 2, 2026

## Measurement

Complete Pacific-time windows through October 1, from Vercel Web Analytics:

| Window | Visitors | Change | Pageviews | Change |
| --- | ---: | ---: | ---: | ---: |
| September 25–October 1 vs. September 18–24 | 1,304 | −13.1% | 2,407 | +6.1% |
| September 2–October 1 vs. August 3–September 1 | 4,573 | +95.7% | 7,504 | +41.9% |

The report sums daily visitor counts; these are human-oriented analytics,
not a census of crawlers or distinct people across a month. Google is the
largest named referral source: 1,113 visitors / 1,279 pageviews over 30 days.
Direct/unknown accounts for 3,044 visitors / 5,418 pageviews. AI referrals
are small: ChatGPT 5, Perplexity 2, Gemini 1. Filtering AI hosts before the
top-referrer cutoff recovered the latter three visits that the old report
omitted. Leading countries are the US, China, Singapore, Hong Kong, and UK;
country alone does not establish whether a visit is automated.

Home and Events lead actual content traffic. Individual event links and
date pages also matter: the September 19 Moon Festival had 64 pageviews,
November 8 Koyote had 39, and the August 2 Gamble Garden tour had 34 despite
returning 404. The new growth report lists requested URLs on the `/404`
route so repairs do not depend on a broken URL reaching the overall top 12.
Older unattributed `/404` traffic remains identifiable as such.

## Product finding and changes

Useful event coverage was being undermined by a publication handoff gap.
The morning build excluded yesterday from the current feed while the archive
still ended the day before yesterday. All 30 timed October 1 listings and
their date page returned 404. Event leaves, date pages, and retired-slug
resolution now share one pool that keeps recently passed current records
until they are archived. Current facts win over duplicate snapshots; separate
same-title sessions and repeated series dates retain their own URLs.
Passed pages keep their grace banner and omit Event structured data, and
remain outside the current-event sitemap.

Recovered the August 2 Gamble Garden tour from its original published July 23
snapshot (`92654b78`), with its existing organizer link. The organizer's
[tour page](https://www.gamblegarden.org/event/aug2tour/) still confirms the
event date and venue. This recovery preserves the published historical record;
it does not promote the old event into upcoming discovery.

Registration facts already collected by ingestion were absent from event and
day pages. Both now display Reserve ahead, Appointment required, Registration
full, or Registration closed as applicable. Event leaves link to the organizer
from their registration details. Paid Event offers no longer claim `InStock`
without evidence; known full/closed registration is reflected in offer
availability. This follows Google's requirement that
[Event markup agree with the page](https://developers.google.com/search/docs/appearance/structured-data/event).
The AI discovery file now describes the actual daily event refresh cadence.

Reviewed rendered Home, Events, city, Gov, Food, Tech, Camps, and popular
event pages. Existing Food status labels distinguish inspections from confirmed
openings; Camps acknowledges that the 2026 season has ended. No new section or
mission change was warranted. The source corpus has 50 health entries and
1,904 future records across the existing cities, with 1,903 eligible timed
leaves. San Jose and Palo Alto have the largest counts; libraries provide much
of the supply. The most useful immediate change was preserving reliable links
and exposing booking constraints across the existing surfaces.

## Dependency maintenance

Applied compatible dependency updates, including Astro 6.4.8, Vercel adapter
10.0.8, and Vite 7.3.6. Updated Sharp to 0.35.5 and overrode Astro's transitive
Sharp to the same patched version; patched path-to-regexp to 6.3.0.
PNG/JPEG/AVIF encode/decode smoke checks passed with libvips 8.18.7 and
libheif 1.23.5. Production dependency audit findings fell from 23 to three.

Remaining audit findings concern Astro, the Vercel adapter's optional ISR,
and esbuild's Windows development server. The deployed configuration uses
neither ISR nor Astro view transitions, has no custom base, and runs on
Mac/Linux. The critical Astro AVIF advisory is still attached to the Astro
version by the audit, but its
[underlying Sharp/libheif dependency](https://github.com/advisories/GHSA-26w7-cxv4-gfx2)
is patched by the override. These are scoped exposure observations, not a
claim that the audit is clean. The remaining version-level cleanup calls for
a separate Astro 7 / adapter compatibility pass with API and image smoke tests.

## Verification and remaining warnings

- `npm run check`: passed, 1,170 tests across 100 test invocations.
- `npx astro check`: 0 errors, 0 warnings; existing hints remain.
- `npm run build`: passed with the patched dependencies.
- `npm run audit:discovery`: passed; 2,088 sitemap URLs, 1,903 current event
  leaves, 4,319 JSON-LD blocks. Forty-eight event leaves lack a primary-source
  URL; these remain warnings without fabricated `sameAs` links. The newsletter
  index is server-rendered and excluded from this build-output check.
- `git diff --check`: passed.
- Sixteen desktop/mobile browser checks covered passed event/day pages,
  recovered history, all four registration states, canonical URLs, correct
  day-to-leaf links, page errors, and horizontal overflow. Screenshots of both
  changed page types were reviewed.
- Preflight live `/`, `/events`, `/robots.txt`, `/llms.txt`, and
  `/sitemap-index.xml` returned 200. Thirty probes using Googlebot, Bingbot,
  OAI-SearchBot, ChatGPT-User, Claude-SearchBot, and Claude-User returned 200
  without challenges. The sampled 60-page live crawl had no errors.

Health data still reports missing Campbell/Los Gatos meeting-feed results,
an old APOD artifact, the off-season Spring Break artifact, and a manual
curated-photo file without a generation timestamp. Retired/restricted source
boundaries were respected. No source health entry reported an event-refresh
error in this snapshot.

Two older, visited broken leaves could not be recovered from a verified
matching record during this run: October 24 Community Day: Día de los Muertos
(16 historical pageviews) and September 14 Vintage Media Lab (11). The smallest
follow-up is to recover the original primary-source publication, then create
an appropriate live successor or honest retired page. No replacement facts
were invented. This is URL history, not proof of a current indexing loss.

Google Search Console API credentials are unavailable here. Search Analytics
and sitemap acceptance could not be measured; the other checks completed.
Production deployment, post-deploy checks, the single IndexNow submission,
and the Discord completion receipt are recorded by the run after this commit.

## Afternoon follow-up

Repeated measurement through October 1 returned the same complete-window
traffic figures above. Production was healthy at `38d2f19a`, which includes
the morning sweep. A fresh 70-page crawl found no actionable errors, and all
30 public-surface probes for the six search/retrieval user agents returned
200 without a challenge. Rendered Home, Events, Sunnyvale, Gov, Food, Tech,
Camps, Koyote, and First Friday pages had no page errors or horizontal overflow.

The unresolved Community Day link exposed a substantive source defect. SJMA's
browser snapshot stored date labels as times and assumed every program was
paid. Ingestion then either discarded the listing or backfilled noon from the
museum's calendar. Corrected seven existing museum occurrences against these
first-party publications:

- [October 2 First Friday](https://sjmusart.org/event/first-friday-new-ballet-season-preview):
  free, 6–9 PM; the ballet-preview seating instructions are preserved separately.
- [October 24 Community Day](https://sjmusart.org/programs-at-sjma/community-days/dia-de-los-muertos):
  restored, free, 11 AM–4 PM, all ages. Registration is recommended and walk-ins
  are welcome; sugar skull decorating needs its own same-day ticket.
- [October 27 Lua Vollaard lecture](https://sjmusart.org/event/sjsu-art-galleries-tuesday-night-lecture-lua-vollaard):
  free, 2–3 PM, at SJSU ART 133. Removed the incorrect museum directions and photo.
- [October 28 and November 18 naturalist tours](https://sjmusart.org/programs-at-sjma/walk-with-a-naturalist):
  restored, 12:30–1:30 PM. Tours are included with museum admission; they do not
  promise free admission.
- [November 6 First Friday](https://sjmusart.org/event/first-fridays-november-2026)
  and [December 4 holiday program](https://sjmusart.org/event/first-fridays-celebrate-holidays-pride):
  free, 6–9 PM. Updated December's published title and preserved its old leaf URL
  through the retired-slug ledger.

These occurrence-specific facts now apply before time backfill and publication
filtering, and when museum browser rows are normalized. Unknown future times
and prices remain unknown. The browser adapter waits for content rather than
network idle and fails closed on HTTP errors. The source remains challenged;
held rows and the original crawl timestamp/error are preserved. No access
restriction was bypassed or retired HTTP adapter restored.

Recovered September 14 Vintage Media Lab from the original September 13
publication `3da124ce9a03391d130162f70059b2da804cc33a`, carrying its original
[Palo Alto City Library source URL](https://paloalto.bibliocommons.com/events/6aa1e7be4b3b060030829e10).
The current organizer page no longer exposes the past session's facts, so the
matching historical publication controls this recovery. Its exact slug was
verified before insertion into the archive. The resulting page is marked
passed, emits no Event object, and stays outside the current sitemap.

Verification: `npm run check` passed 1,173 tests in 100 invocations;
`npx astro check` returned zero errors and warnings; build and `git diff --check`
passed. Discovery passed with 2,091 static sitemap URLs, 1,906 current event
leaves, and 4,325 JSON-LD blocks. The same 48 source-less event warnings remain.
Eight desktop/mobile browser checks covered the repaired leaves and date page,
correct facts, canonical URLs, passed status, page errors, and overflow;
screenshots were reviewed. The earlier three dependency audit findings remain;
this follow-up does not change dependencies. Search Console API credentials
remain unavailable. Post-push production, IndexNow, and Discord receipts are
saved in the local `.snapshots/growth-sweep-2026-10-02-review/` directory.
