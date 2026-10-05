# SBT evening fact-check — October 4, 2026

The repo mutex was acquired before any repo work. Data refresh `be9df6ad`
(October 4, 9:50 PM Pacific) was within the two-hour audit window. All twelve
scheduled audit files and the last twenty commits were reviewed. This is a
separate audit from the earlier October 4 receipt.

## Corrections and primary evidence

- **Two Sunnyvale talks were missing their online format.** The October 6 Joe
  Sasto talk and October 8 Carolyn Russo talk now have `venue: "Online"`,
  `virtual: true`, and the [dated library calendar](https://www.library.sunnyvale.ca.gov/events/calendar-month-view/-curm-10/-cury-2026/-direct-true).
  Its indexed official October listings label both ONLINE, 11 AM–noon. The live
  host rejected requests; no alternate access path was used. The Joe Sasto
  highlight and reference were removed from Sunnyvale's local briefing.
- **SPARK Social's October 9 opening claim was unsupported.** The Reddit-derived
  description called it a food hall opening Friday, October 9. The
  [business's own San Jose page](https://visitsparksocial.com/san-jose/) says
  Opening Soon, with no confirmed date, and describes food trucks, a full bar,
  putt-putt and live music at 140 S Montgomery Blvd. The entry now uses those
  first-party facts and link, with the opening date left unknown.
- **Old agenda items were phrased as current decisions.** Sunnyvale's Chabad
  permit summary now says the September 30 agenda listed the proposal rather
  than that its hearing is scheduled now. The [official meeting record](https://sunnyvaleca.legistar.com/MeetingDetail.aspx?LEGID=4568&GID=270&G=FA76FAAA-7A74-41EA-9143-F2DB1947F9A5)
  provides an agenda and draft minutes, without published action results.
  Mountain View's fire-truck litigation and City Attorney headlines now refer
  explicitly to the September 22 agenda; the fire-truck summary no longer
  asserts an actual discussion. Upstream record 7194 lists the closed-session
  legal consultation and employee-appointment items. Its
  [official calendar](https://mountainview.legistar.com/Calendar.aspx?From=9%2F22%2F2026&To=9%2F22%2F2026)
  remains the source. The corresponding city briefing uses the dated headline
  and says the potential legal matter involves the manufacturers, without
  inferring their legal positions or a pending decision.
- **Two newsletter events lacked source links.** The October 4 SUSD Board
  Candidate Forum now links to the [PTAs' event record](https://ptasaratoga.membershiptoolkit.com/calendar/event/95402905)
  (6–7:30 PM, Redwood Middle School). Testarossa's October 4 pasta demo and lunch
  links to its [official homepage](https://www.testarossa.com/), which advertised
  the 11 AM occurrence. Both city-briefing highlights use the same links.

## Generation safeguards

- Exact-date Sunnyvale presentation overrides preserve the verified online
  format through newsletter ingestion. Existing city-briefing selection already
  excludes virtual events. Cross-city and next-year fixtures do not inherit the
  corrections.
- Around Town now rejects old agenda copy with current/upcoming body-action
  language. The prompt applies dated agenda framing to both headline and
  summary. Same-day/future records and transcript-backed reporting retain their
  existing paths.
- Reddit restaurant discoveries can no longer supply model-written opening
  dates or blurbs. Only checked first-party facts supply that copy. The existing
  discovery entry is normalized on later runs as well as on first insertion.
  County inspection and permit records retain their existing interpretation.
- No new events, developments, or openings were added. Event titles, IDs,
  occurrence dates and total count were preserved; no event-slug change was
  required.

## Reviewed without additional corrections

- `development-data.ts`: 19 projects, preserving status, timeline, developer and
  source qualifications.
- `events-data.ts`: 53 recurring entries, including markets and sports seasons.
- `tech-companies.ts`: 18 anchor companies, 51 spotlights and 141 funding records.
  SCC employment estimates remain distinct from global headcounts. The newest
  CScale record agrees with its [September 30 announcement](https://www.cscale.ai/press/cscale-exits-stealth):
  Palo Alto headquarters and a $145 million Series C.
- `digests.json`: 11 city entries retain agenda/body/date qualifications.
  Expected Campbell lag and Saratoga's September 16 source date remain valid.
- `permit-pulse.json`: San Jose's 395 total permits / 18 notable permits and
  Palo Alto's 110 / 6 retain their subset distinction. Unknown Palo Alto
  valuations are not presented as project costs.
- `city-budgets.json`: all 11 per-capita figures equal rounded General Fund
  millions divided by population. Historical fiscal years remain labeled and
  Sunnyvale's unsupported total remains null.
- Remaining generated records: 1,892 unique event IDs; no road races in sports
  and no raw-address venue names. All 11 briefings and six Around Town items
  passed the applicable checks. The food feed retains 12 inspection records,
  13 coming-soon leads and no inspection-only records asserted as opened.
- `upcoming-meetings.json` and `weekend-picks.json`: staleness checks passed for
  the current refresh and October 2–4 weekend. Recorded source failures were
  not converted into invented meetings.

## Verification

- Targeted inbound, Around Town and food-opening tests: **40 passed**.
- `npm run test:event-refresh`: **39 passed**, zero failures/skips.
- `npm run build`: passed, including locked-home and tech-logo prebuild gates.
  The adapter selected Node 24 for production; local Node 26 and existing Vite
  warnings did not fail the build.
- Offline assertions passed for event identity/category/venues, both virtual
  talks, matching event/briefing source links, dated agenda framing, all budget
  arithmetic, inspection/opening separation, and current staleness windows.
- Changed generator syntax checks and `git diff --check` passed. The full test
  suite and a live deployment check were not run for this scoped data audit.
