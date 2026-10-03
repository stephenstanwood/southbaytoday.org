# October 2 growth report follow-up

The original report is Discord message `1555730917551644755`, published at
2026-10-02 23:59:14.827 UTC. Its exact payload was preserved before acknowledgment
in the local growth-followup evidence archive, with SHA-256
`f793e69191d286248f5915f9d766073f8af4136bb6844d020b1a50215e113ae7`.
This follow-up starts from `991ab8cbcee54442979e7c10853e8be07e99145e`.
The seven verified museum records and their original source snapshot metadata
are unchanged.

## Primary links

Repaired 35 of the 48 URL warnings using dated organizer publications,
registration pages, or the original organizer emails. The complete
[48-row disposition](2026-10-02-primary-url-disposition.json) records each
occurrence, source receipt, repair or hold, and owner. Recipient-specific
newsletter wrappers and credentials are excluded from that committed record.

The intake guard was treating numeric calendar IDs, opaque record keys, and
tracking wrappers as conflicting event titles. It now checks the meaningful
final slug, and checks an embedded destination when a wrapper exposes one.
URLs that clearly name a different event still fail the guard. The JAMsj
`dvcomms.net` wrapper is also recognized and unwrapped before publication.
Date/title overrides keep recovered links through later refreshes. Separate
citizenship dates and wreathmaking sessions retain their own links.

The two Sunnyvale programs use the city's dated public newsletter, which
explicitly lists their October 2 occurrences. The movie's catalog link is a
book/media record and is not used as an event link. The October 17 costume
swap links to the swap, rather than its separate donation period.

BAGI's own October 17 alebrije page confirms 1–3:30 PM and says Sold out.
The event now carries Registration full and the verified end time. The existing
SJMA fact correction also applies to the newly linked newsletter copy of
First Friday, keeping it consistent with the already repaired museum record.
Unknown prices and other unverified fields remain unknown.

Thirteen URLs remain held. Eleven original messages predate the oldest
receiving-API item available during this review (September 4; nine pages,
894 items, no further page). The two available Mountain View emails include
dated Zoe Caron / CSA Homecoming announcements but no matching public event
link. Neighboring links concern other programs. A generic Stanford homepage
and secondary listings are insufficient to fill the remaining gaps.

The owner for these 13 holds is `sbt-growth-sweep`, under
`ops/mini/sbt-growth-sweep/SKILL.md`. Mini's Claude scheduler log confirms its
October 2 run at 02:49:18; the scheduler heartbeat is loaded and last exited 0.
The next sweep should use new primary publications or newly available source
emails, and preserve empty URLs until the occurrence matches. The intake and
guarded events-refresh jobs own persistence of the 35 repairs.

## Meeting and crawl owners

| Item | Disposition | Verified owner and release condition |
| --- | --- | --- |
| Campbell | Restored from the public eScribe calendar. Its agenda confirms the October 5 special meeting, 6:20 PM, Public Works Conference Room. | `southbaysignal-data-refresh`, which runs `generate-upcoming-meetings.mjs`; current Mini scheduler log confirms its October 1 run. |
| Los Gatos | The normal identifying crawler request still fails with `ERR_HTTP2_STREAM_ERROR`. No meeting is inferred from cadence. | The same data-refresh job owns ingestion; Town/MuniCode owns access policy. Resume only with a sanctioned accessible publication or a successful ordinary request. |
| SJMA browser crawl | Source health retains its challenged/failed state and seven carried-forward rows. No successful crawl or new source freshness is claimed. | `org.southbaytoday.events-refresh` and `org.southbaytoday.events-refresh-watchdog`: both loaded on Mini, last exit 0. The guarded refresh must obtain a genuine successful source result before replacing the held snapshot. |
| GSC API | Optional helper credentials remain absent. Measurement has an existing browser owner. | `sbt-seo-sweep` / SBT weekly SEO is ACTIVE, Tuesdays 01:15 Pacific. The September 29 report contains verified browser Search Analytics, sitemap, coverage, security and manual-action checks. These are dated results, not October 2 index-status claims. |

Campbell's confirmed agenda is
<https://pub-campbell.escribemeetings.com/Meeting.aspx?Id=cbe9f3fe-f585-4195-88d7-d31958bdba68&Agenda=Agenda&lang=English>.
The meeting generator was rerun through its normal adapters; its sole current
source error is the deliberate Los Gatos access hold. No User-Agent spoofing,
challenge bypass, retired museum adapter, or synthetic meeting was introduced.

## Dependency compatibility

Updated Astro to 7.3.5, its Vercel adapter to 11.0.11, and the React integration
to 7.0.0. Their Vite dependency is 8.3.2. Esbuild is consistently overridden to
0.28.2. The patched Sharp 0.35.5 and path-to-regexp 6.3.0 overrides remain.
This resolves the original Astro, optional-ISR adapter, and Windows-development
esbuild findings. Live architecture notes now identify Astro 7 / Vite 8.
The configuration explicitly retains Astro 6's HTML-aware whitespace behavior
with `compressHTML: true`, avoiding joined inline text under Astro 7's new
default. The [official migration guide](https://docs.astro.build/en/guides/upgrade-to/v7/#new-default-whitespace-handling-compresshtml-jsx)
documents this compatibility setting.

The current production audit has three high package entries caused by one new
[http-cache-semantics advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
and its two Astro/adapter dependents. The registry's latest version is 4.2.0,
and the advisory has no patched version as of this review. The audit's suggested
Astro 2 downgrade is not a safe maintenance fix.

Astro uses this package in build-time remote-image caching, constructing
`new Request(src)` without incoming user authorization/cookies. This app has
no `astro:assets` imports and uses plain images and its existing Sharp code.
That scopes the current exposure; it does not establish a clean audit.
Upstream package maintainers own the patch. `sbt-growth-sweep` owns the next
dependency update once a patched release is available, followed by build,
API/image, and deployment checks. This is an explicit upstream hold.

## Verification

- `npm run check`: passed, 1,179 tests across 100 invocations.
- `npx astro check`: zero errors and warnings; 97 existing hints.
- Production build: passed. Vercel's configured Node runtime is 24.x.
- Discovery audit: zero errors; 2,091 sitemap URLs, 1,906 event leaves,
  4,325 JSON-LD blocks. Thirteen missing-source warnings and one expected
  server-rendered-page warning remain.
- Ten local desktop/mobile browser cases passed, with hydrated React islands,
  no page exceptions or horizontal overflow, and the sold-out label visible.
- Local API checks preserve JSON feeds/cache headers and anonymous auth/validation
  guards; Sharp PNG/JPEG/AVIF round trips pass.
- The original report and source/API/image/browser receipts are retained in the
  local growth-followup evidence archive. Release requires a verified preview
  and production deployment; acknowledgment follows those checks and the owner
  dispositions above.
