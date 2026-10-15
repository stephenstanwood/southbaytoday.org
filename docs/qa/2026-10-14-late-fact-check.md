# South Bay Today fact check — October 14, 2026, late pass

Reviewed `main` at `93d7db7b` under the `sbs-fact-check` repository lock.
The deterministic preflight required work; the superseded relative-time exit
was not used. Read the twelve required data files, inspected the latest twenty
commits, and compared the latest copy edit with the preceding fact-check.
Source retrieval was read-only, with no Discord messages or paid model calls.

## Corrections

### Company headcounts and geography

Replaced thirteen materially stale global headcounts with dated company filing
figures. These are historical snapshots on the dates shown, rather than claims
about today's exact staffing. Full-time scope and the issuers' approximation
qualifiers are retained. The SCC-local estimates in `TECH_COMPANIES` were not
derived from these global figures.

| Company | Before | Corrected global figure | Primary source |
| --- | --- | --- | --- |
| Broadcom | 40K+ | approximately 33,000, November 2, 2025 | [FY 2025 10-K](https://www.sec.gov/Archives/edgar/data/1730168/000173016825000121/avgo-20251102.htm) |
| Fortinet | 13K | 15,109, December 31, 2025 | [FY 2025 10-K](https://www.sec.gov/Archives/edgar/data/1262039/000126203926000007/ftnt-20251231.htm) |
| Cadence | 10K | approximately 13,800, December 31, 2025 | [FY 2025 10-K](https://www.sec.gov/Archives/edgar/data/813672/000081367226000016/cdns-20251231.htm) |
| Synopsys | 20K | approximately 28,000, October 31, 2025, including Ansys | [FY 2025 10-K](https://www.sec.gov/Archives/edgar/data/883241/000088324125000028/snps-20251031.htm) |
| Everpure | 5K | approximately 6,400, February 1, 2026 | [FY 2026 10-K](https://www.sec.gov/Archives/edgar/data/1474432/000147443226000027/pstg-20260201.htm) |
| Intuitive Surgical | 12K | approximately 17,021 full-time, December 31, 2025 | [FY 2025 10-K](https://www.sec.gov/Archives/edgar/data/1035267/000103526726000010/isrg-20251231.htm) |
| Cerebras | 500 | 708 full-time, December 31, 2025 | [IPO S-1](https://www.sec.gov/Archives/edgar/data/2021728/000162828026025762/cerebras-sx1april2026.htm) |
| Lumentum | approximately 6K | approximately 13,757 full-time, June 27, 2026 | [FY 2026 10-K](https://www.sec.gov/Archives/edgar/data/1633978/000162828026057358/lite-20260627.htm) |
| SanDisk | approximately 8K | approximately 11,100, July 2026 | [FY 2026 10-K](https://www.sec.gov/Archives/edgar/data/2023554/000162828026057406/sndk-20260703.htm) |
| Western Digital | approximately 12K | approximately 40,000, FY 2026 | [FY 2026 10-K](https://investor.wdc.com/static-files/12a72667-a479-42d3-abfa-5046fa1050a0) |
| Netflix | approximately 13,000 | approximately 16,000 full-time, December 31, 2025 | [FY 2025 10-K](https://www.sec.gov/Archives/edgar/data/1065280/000106528026000034/nflx-20251231.htm) |
| Arm | approximately 7,000 | 9,584, March 31, 2026 | [FY 2026 20-F](https://www.sec.gov/Archives/edgar/data/1973239/000197323926000097/arm-20260331.htm) |
| Zscaler | approximately 7K | more than 8,700, July 31, 2026 | [FY 2026 10-K](https://www.sec.gov/Archives/edgar/data/1713683/000171368326000157/zs-20260731.htm) |

Added each citation beside its data entry and strengthened the `employeesNote`
comment to distinguish global, local, total and full-time counts. Removed the
duplicate stale Netflix count from its tagline.

Lumentum's filing identifies its principal offices at **1001 Ridder Park Drive,
San José**, rather than Milpitas. Corrected its city and headquarters wording,
and replaced the unsupported implication that its phone components are made
locally with its documented 3D-sensing and optical-networking products.
Zscaler's same filing supports **over 50% of the Fortune 500**, replacing the
undated 40% claim; the new claim is labeled FY 2026.

### Recurring events

- **San José Greek Festival:** changed free admission to the organizer's
  **$5 general admission for 2026**, retaining the published exemptions for
  children under 12 and seniors over 65. The
  [organizer's admission page](https://www.sanjosegreekfestival.com/attend)
  confirms the May 29–31 dates, location and charge. Free parking and free
  admission are different facts; the TypeScript comment now makes this clear.
- **Downtown Ice:** replaced the incorrect Rotary rink / Plaza de César
  Chávez location with **Circle of Palms Plaza, 120 S Market Street**.
  [SJDA's venue record](https://sjdowntown.com/dticecelebration/)
  and the [rink's own site](https://www.skateunderthepalms.com/)
  support the location. Removed the unverified **$12 plus rental** figure and
  the fixed season-date claim. The old `downtownicesj.com` URL is parked;
  the organizer's `sjdowntownice.com` URL redirects to `skateunderthepalms.com`,
  which answered an identified ordinary GET with HTTP 200. Python's TLS
  failure and an HTTP 405 to HEAD were not treated as successful retrievals.
  The rink site still advertises the prior season's February 2026 extension;
  no new 2026–27 occurrence dates or prices were inferred from it.

### Generated concert copy

- **Journey USA, February 19, 2027:** removed the claim that its vocalists
  toured with Journey's actual lineup. The
  [Heritage Theatre occurrence page](https://www.heritagetheatre.org/events/journey-usa-the-hits-of-journey)
  describes a singer's work for Steve Perry's solo career and former members
  of Great White and The Babys. That does not establish the deleted touring
  claim. The replacement says the band performs Journey songs at the venue.
- **Merry-Achi Christmas, November 27–28:** corrected the performer identity
  in both published occurrences. Merry-Achi Christmas is the show;
  [Hammer's official ticket page](https://plugin.vbotickets.com/v5.0/event.asp?eid=198571&s=4db75629-dc9f-47d2-9305-bf5b4a7e7f10)
  names **José Hernández and Mariachi Sol de México**. Added a sourced
  description instead of naming the production as a Grammy-nominated band.

Corrected both cached blurbs and added dated upstream source-fact overrides.
The regression test checks sparse refresh input, a rotated VBO session URL,
idempotence, and isolation from another year or venue. Event titles, IDs,
dates and slugs are unchanged; no retirement-ledger update is needed.

## Reviewed without additional corrections

- **Curated scope:** 19 development projects, 53 recurring event/market/sports
  records, 18 anchor employers, 51 spotlights and 146 funding rows. Existing
  developer/status uncertainty notes and SCC job-estimate qualifications
  remain. Unchanged historical claims were inspected but were not all
  independently re-sourced in this pass.
- **Latest copy edit:** 157 changed event rows, comprising 138 descriptions,
  37 titles and five blurbs, with overlap. No additions, removals, occurrence
  dates, clocks, venue geography, categories, admission fields or source URLs
  changed. Numeric description tokens are unchanged. The 37 title edits are
  grammar, punctuation and spacing corrections.
- **Published feed:** 1,844 unique IDs and a matching metadata count. No
  invalid required clocks, road races filed as sports, raw-address display
  venues, invitation-only titles, verified-fact drift, blurb/source conflicts,
  contradictory weekday/series/time-of-day claims, or blocking location
  contradictions. Six generic venue/no-address warnings remain advisory.
  Raw inbound geography for a Saratoga-published hike does not overwrite its
  correctly resolved Cupertino location in the public feed.
- **Suspicious blurb follow-up:** the full Festival Por La Paz page confirms
  more than 20 live artists; SCU's structured location confirms the AIM
  workshop's 20-person limit. Neither number was fabricated. Saratoga's
  paperback-sale page confirms the October 18 date, 10 AM–4 PM hours and
  Sunday bag sale; its full two-day description legitimately names both
  sessions. A blurb-only rotation guard must not be applied to that entire
  source description.
- **Civic copy:** all 11 digests, all 11 briefings and eight Around Town
  items. Fresh ordinary HTTP retrievals of the San José joint agenda,
  Mountain View October 13 agenda, Sunnyvale Peery Park agenda and Cupertino
  Administrative Hearing record support their stated topics and proposal
  wording. Cupertino's three lot sizes sum to **32,691 square feet**.
  All 22 event highlights agree with the current feed or generation-time
  snapshot; Campbell's remaining K-5th/K-5 title difference is cosmetic.
  Preserved the Campbell and SB 707 exceptions.
- **Food:** one ID-bounded county query returned all 24 displayed source
  records. All 12 inspection dates and 12 plan-approval dates match their
  cities; no coming-soon row has a final inspection. `opened` remains empty.
- **Permits:** read both city snapshots and checked their displayed values
  against the earlier October 14 audit evidence. The Equinix tenant
  improvement and the two Yoshino filings retain the corrected descriptions
  and valuations. This run did not independently re-certify the historical
  aggregate counts: San José's robots.txt disallows `/api/`, so that API was
  not requested; its published CSV download returned HTTP 403. The earlier
  same-day source checks remain in `2026-10-14-evening-fact-check.md`.
- **Budgets:** all 11 stored General Fund-per-capita values agree with
  rounded General Fund / population arithmetic; verified totals are at least
  their General Funds. Differing fund/transfer definitions retain their
  source notes, and Sunnyvale's unverified total remains null. Unchanged
  historical budget PDFs were not downloaded again.
- **Staleness:** meetings and weekend picks were generated October 13
  evening Pacific time; the weekend window is October 16–18. Known agenda
  source-access limitations remain recorded. Removed transit, real-estate,
  sports-team, freeway and lane-closure files remain absent.
- **Company link audits before and after:** each checked 197 links, with
  191 available and six access-blocked; zero moved and zero dead. Blocked
  company homepages were not treated as verified factual evidence.

Detailed HTTP responses, input comparisons and machine-readable checks are
retained outside Git in this automation run's evidence directory. Editorial
corrections preserve ingestion timestamps. No unresolved issue requires a
human decision.

## Validation

- `node --test src/lib/south-bay/eventSourceFacts.test.mjs src/lib/south-bay/eventBlurbs.test.mjs`:
  **75 passed**, zero failures, cancellations or skips.
- `npm run build`: passed after the final edits, including both mandatory
  homepage and tech-logo prebuild gates. The unrelated full test suite was
  not rerun.
- Full-feed read-only checks: 1,844 unique IDs, zero hard published-event
  findings, zero location blockers, zero blurb fact/time/series conflicts,
  all 22 highlight comparisons and all 11 budget arithmetic checks passed.
- Before/after assertions confirm exactly thirteen changed employee notes,
  unchanged local-estimate and funding arrays, three corrected public event
  occurrences, and unchanged event IDs, titles, dates, clocks, venues,
  cities, URLs, counts and ingestion timestamps.
- `git diff --check`: passed. No title changes or displaced event slugs.
