# South Bay Today fact check — October 14, 2026

Audited main at `5775b26bffd7476124e4b6460f725cc0ef297c1e` under the
`sbs-fact-check` repository lock. The deterministic preflight required work;
the obsolete relative-time early-exit gate was not used. Read all twelve
scheduled audit files and the latest twenty commits. Source verification
focuses on changed or suspicious claims; unchanged historical claims were
reviewed without downloading every original document again.

## Corrections and evidence

- **ICA San José:** “We Are California Artists: Wanxin Zhang and Diane Ding”
  was filed as a November 14, 8 PM event. The [exhibition page](https://www.icasanjose.org/current-exhibitions/wearecaliforniaartists/)
  gives an **October 16–November 14 exhibition run**, with a separate October
  16 artists' mixer. Changed both event snapshots to a clock-free ongoing
  exhibition, retaining its actual start and end dates. Removed the wrong
  8 PM backfill-cache entry. The scraper had preferred the range's closing
  date over its opening date, and its normalizer did not retain `ongoing`.
  It now requires a published “On view” range, preserves the run fields,
  and keeps exhibitions out of clock backfill.
- **Santa Clara college-admissions presentation, October 21:** the city's
  newsletter record explicitly says **Online** and **Zoom presentation**, but
  the published record lacked `virtual: true`. Added the flag to the input
  and published record, taught the inbound normalizer the shared virtual
  fallback, and added parenthesized online/virtual markers to the strong
  signals used by pulling, generation and auditing. Its source link is the
  [city calendar occurrence](https://www.santaclaraca.gov/Home/Components/Calendar/Event/113977/).
  The page was not independently retrieved; the correction follows the
  retained first-party newsletter, rather than inventing a location.
- **Two Mountain View category errors:** changed **Monster Bash Halloween
  Festival**, October 24, from `sports` to `family`, and **Paulson Park I
  Housing Application Help Session**, October 15, from `outdoor` to
  `community`. The retained city newsletters describe carnival games and
  Halloween activities for the first, housing-waitlist application help at
  the Rent Stabilization Division office for the second. Added title-based
  category rules so “games” and a housing property's “Park” name cannot
  override the actual activity. The [Monster Bash city page](https://www.mountainview.gov/our-city/departments/community-services/special-events/monster-bash)
  returned 403; that restriction was respected.
- **SCU ServiceNow coffee chat, October 20:** removed the invitation-only
  employer session from the public feed. Both the source title and retained
  description require an invitation; the [SCU occurrence page](https://events.scu.edu/career-center/event/517808-service-now-invite-only-coffee-chat)
  independently retains that title. Added a narrow invitation-only title
  filter; ordinary public coffee chats remain eligible. Feed and metadata
  counts now both equal **1,844**, down from 1,845.
- **SVLG Coffee & Conversation: Larry Klein, December 10:** changed the city
  from **Sunnyvale to San José** and retained the organizer's **2480 N First
  St San Jose, CA** address. The [SVLG calendar](https://svlg.org/events/)
  puts the street address in its venue span; the parser lost that evidence,
  and inference then used Sunnyvale from the speaker's biography. The parser
  now retains bare street text as an address, and generation checks address
  and venue before biography text. No building/room name was invented.
- **SAP Center Military Appreciation, November 11:** renamed the listing
  **Sharks vs Penguins — Military Appreciation** and changed `community` to
  `sports`. The [venue's occurrence page](https://www.sapcenter.com/events/detail/sharks-vs-kings-20)
  gives the matchup in its subtitle and confirms **7 PM**. The misleading
  historical URL slug says Kings, but the actual current page says Penguins.
  The scraper now retains a Sharks/Barracuda matchup when the main headline
  contains only the promotional theme. Corrected the source snapshot and
  public description/blurb together.
- **Sunnyvale Peery Park civic copy:** changed Around Town's claim that the
  October 12 study session “covered” the proposal, and the briefing's claim
  that the commission “held” the session, to what the **October 12 agenda
  listed**. The [Planning Commission record](https://sunnyvaleca.legistar.com/MeetingDetail.aspx?LEGID=4540&GID=270&G=FA76FAAA-7A74-41EA-9143-F2DB1947F9A5)
  and retained source record 33 support the proposed amendment and scoping
  topics, but the cited material does not establish the discussion. Extended
  the agenda-action guard to catch completed claims about dated study/scoping
  sessions. No vote, approval, unit count or office area was inferred.

The slug ledger preserves all three displaced URLs. Military Appreciation's
old URL redirects to the corrected game. The former timed ICA listing and
the private SCU listing remain noindex retired pages; they are absent from
the live event-page pool. Ingestion timestamps were preserved because these
are editorial corrections, rather than a full refresh.

## Reviewed without further corrections

- **Curated data:** 19 development projects; 53 recurring market, event and
  sports records; 18 anchor employers, 51 spotlights and 146 funding entries.
  Existing developer/status uncertainty notes and SCC-local job estimate
  qualifications remain intact. Hark's updated free-app/platform and planned
  2027 hardware claims agree with its [own product FAQ](https://hark.com/using-hark);
  its funding amount, valuation and investors agree with its [funding announcement](https://hark.com/articles/hark-announces-usd700-million-fundraising-round).
  The company URL audit checked **197 links: 192 OK, five access-blocked,
  zero moved and zero dead**. No tech content was changed.
- **Civic summaries:** read all 11 digests, all 11 city briefings and eight
  Around Town items. The San José October 13 joint-meeting record supports
  the El Niño, Anderson Dam, Coyote Creek and Pure Water topics. Mountain
  View's October 13 agenda supports its proclamations, preservation, fiber,
  LinkedIn and detention-facility topics. Cupertino's October 8 Administrative
  Hearing record confirms the body, parcel address and three lot sizes,
  which sum to the stated **32,691 square feet**. Preserved the Campbell and
  SB 707 exceptions.
- **Briefing highlights:** all **22 event highlights** agree with the input
  event snapshot's title, date/time, city, venue, category and URL. Same-day
  events already elapsed in the later refresh were compared with the
  generation-time snapshot, rather than misidentified as fabricated. Of 24
  nonempty highlight links, **22 were available and two returned 403**
  (Sunnyvale costume swap and Santa Clara Unbook Club). No access restriction
  was bypassed or described as a successful fetch.
- **Full event feed:** final **1,844 unique event IDs**, valid required clock
  times, no road races mislabeled sports, no raw-address venue display names,
  no source/blurb fact conflicts, no contradictory weekday/series/time-of-day
  copy, and no blocking venue-location contradiction. Six generic venue
  records without captured street addresses remain advisory. Reviewed the
  118 added and 55 changed rows since the previous fact-check commit.
- **Permits:** a bounded query of the configured San José dataset contains
  all ten displayed permit IDs, with matching dates, valuations and units.
  Equinix remains a tenant improvement at **$48,359,602**; the two Yoshino
  filings total **$94,271,783**, with 372 source-reported units. The current
  live feed yields **527 permits, $173,453,268 and 379 new units** for
  October 6–13; the published October 13 evening snapshot has 445 permits,
  $171,425,348 and the same unit count. A newer mutable feed cannot reproduce
  a historical snapshot exactly; those older aggregate counts were not
  certified against today's feed or retroactively replaced. Palo Alto's
  unavailable valuation/unit figures remain zero/unknown.
- **Food:** all **24 county record IDs** were returned by the existing,
  ID-bounded dataset query. All 12 final-inspection dates and 12 plan-approval
  dates match; no coming-soon record has a county final inspection. `opened`
  remains empty. Permit/inspection dates were not converted into opening dates.
- **Budgets:** all 11 General Fund-per-capita values match rounded stored
  General Fund / population arithmetic. The existing source notes explain
  differing fund/transfer definitions; Sunnyvale's unverified total remains
  null. Unchanged budget PDFs were not downloaded again.
- **Staleness:** meetings and weekend picks were generated October 13
  evening Pacific time; the weekend window correctly covers October 16–18.
  Known source-access limitations remain recorded. Retired real-estate,
  transit, sports-team, freeway and lane-closure files remain absent.

## Validation

- `npm test`: **1,256 passed**, zero failures/cancellations/skips across 101
  test invocations. Focused tests also cover the actual exhibition run,
  normalizer/backfill boundary, SVLG address priority, private coffee chat,
  hockey subtitle, newsletter categories/virtual status and agenda wording.
- `npm run build`: passed, including both mandatory prebuild gates.
- Built Event JSON-LD confirms the hockey game at
  `2026-11-11T19:00:00-08:00`, and the admissions session as
  `OnlineEventAttendanceMode` with a `VirtualLocation`.
- Verified the Military Appreciation 301 and noindex retired ICA/SCU pages
  in `.vercel/output`. Event audit has zero hard findings in the published
  feed; its pre-existing raw inbound publisher-city/weak-description findings
  remain advisory and were not used to overwrite correct published geography.
- `git diff --check` and final full-feed/highlight/budget assertions passed.
- Detailed HTTP responses, test logs and machine-readable audit results are
  retained outside Git in this automation run's local evidence directory.
