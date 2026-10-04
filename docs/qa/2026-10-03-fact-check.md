# October 3, 2026 fact-check

Audited the 21:51 PT refresh (`f7d7f0ed`) under the `sbs-fact-check` repository lock. Checked all twelve scheduled-task data files, the last twenty commits, and source/generation paths behind the flagged entries. Existing source retirements and access restrictions remain in effect.

## Verified corrections

- **Sunnyvale Chabad item:** the September 30 source is a **Zoning Administrator Hearing**, not a Planning Commission meeting or an item on the October 6 council agenda. Its agenda lists PLNG-2026-0312 at 645 W. Fremont Avenue, R-1 zoning, and Chabad of Sunnyvale as owner. No finalized minutes or action are published. Changed Around Town to dated, agenda-only language and removed the briefing's transfer of this item onto Tuesday's council agenda. [City agenda](https://sunnyvaleca.legistar.com/MeetingDetail.aspx?G=FA76FAAA-7A74-41EA-9143-F2DB1947F9A5&GID=270&LEGID=4568).
- **Rihab Chaieb:** replaced the invented violinist identity with mezzo-soprano and linked the February 24 recital itself. [Stanford Live](https://live.stanford.edu/events/26-27season/bing-concert-hall/rihab-chaieb-nomad-the-eternal-wanderer/).
- **Jaemin Han, March 10:** corrected 6:30 PM to the **7:30 PM performance**, with a direct source link. [Stanford Live](https://live.stanford.edu/events/26-27season/bing-concert-hall/jaemin-han-cello-recital/).
- **Taimane, February 7:** corrected 6:30 PM to **7:30 PM**; 6:30 PM is explicitly doors, not the show. [Heritage Theatre season](https://www.heritagetheatre.org/2026-2027-season-of-shows).
- **Other winter newsletter timestamps:** corrected the invalid summer UTC offset in the stored November 17 Toast, November 19 Swan Lake, November 20 Harriet, and December 16 Nutcracker occurrences. Each source confirms **7 PM**. These records are not currently selected in the live event pool; the persistent correction also applies if they are selected on a later refresh. [Toast city calendar](https://www.campbellca.gov/m/calendar/event/detail/4008), [Swan Lake performer page](https://worldballetcompany.com/event/heritage-theatre-2/), [Harriet city calendar](https://campbellca.gov/m/calendar/event/detail/4009), [Nutcracker city calendar](https://campbellca.gov/m/calendar/event/detail/3974).
- **Ania Filochowska:** restored the missing `s` in the title and source snapshot. [Stanford Live](https://live.stanford.edu/events/26-27season/studio/renee-qin-and-ania-filochowska-the-world-we-speak-into-being/).
- **300 Paintings:** replaced the invented walk-through activity with Sam Kissajukian's performed comedy show, and linked its program page. [Stanford Live](https://live.stanford.edu/events/26-27season/studio/300-paintings/).
- Replaced the old Stanford homepage URL on **International Guitar Night** with its verified February 21 event page. [Stanford Live](https://live.stanford.edu/events/26-27season/bing-concert-hall/international-guitar-night/).
- Restored **SUSD, CSA, CEFCU, USF, and JT** spelling in six affected title/description records, matching their source initials. Removed the duplicated word in **Milpitas Community Community Center**. Removed Santa Clara's unsupported “week's biggest development story” ranking and preserved its September 22 agenda-only framing.

## Durable generation fixes

- Planning records now use the same official body/source verification as council records. Unverified fallback labels remain body-neutral. Briefing inputs retain the body's name and explicitly prohibit moving old highlights onto the next council agenda.
- Offset-bearing Pacific newsletter timestamps must use the occurrence date's offset. An inconsistent clock stays unknown unless a dated first-party correction supplies a time. UTC timestamps still convert normally.
- Shared occurrence corrections run before inbound deduplication and blurb resolution. Matching requires a real ID, URL, or both title and venue; missing IDs cannot license a date-only match. Corrected copy is also retained in the blurb cache.
- Title and description normalizers preserve the five published initialisms. Retired-slug maintenance preserves links after corrected titles.

## Reviewed without changes

- `development-data.ts`, `events-data.ts`: existing project/source qualifications and recurring-event schedules; no unsupported additions made.
- `tech-companies.ts`: SCC local-jobs fields remain estimates, distinct from global headcount. The new PaleBlueDot October 1 $200M Series C, $3.2B valuation, Palo Alto headquarters, ComputeCore lead, and B Capital participation agree with its [company announcement](https://www.prnewswire.com/news-releases/palebluedot-ai-raises-200m-series-c-round-to-scale-super-intelligence-infrastructure-platform-302896601.html).
- `city-budgets.json`: all eleven per-capita general-fund calculations agree with the stated population and million-dollar units. Sunnyvale's unknown total remains null, and historical fiscal years stay labeled.
- `permit-pulse.json`: displayed notable permits are a subset of totals; zero Palo Alto valuations represent an unpublished source field, not a claim of zero project cost. Around Town's permit amounts agree with the permit records.
- `scc-food-openings.json`: inspection-complete and plan-approved records remain qualified; no inspection is promoted to a confirmed opening date.
- `upcoming-events.json`: all 1,914 records checked for race-category misfires, raw-address venues, duplicate IDs, and missing clocks. No race-category, raw-address, or duplicate-ID issue found. Thirteen records retain explicit unknown times, mostly exhibitions; no clock was invented to fill them. New city-newsletter high-risk listings were source-checked as above; no claim that every historical/library occurrence was independently re-verified.
- Other digest, city-briefing, and Around Town entries: no additional integrity issue found in the reviewed data. Campbell digest lag remains an expected feed limitation.
- `upcoming-meetings.json`, `weekend-picks.json`: current refresh/week dates; staleness checks only. Los Gatos' explicitly rejected automated request remains a source error rather than bypassed access.

## Validation

- 65 targeted meeting-provenance, inbound-time, acronym, source-health, and occurrence-fact tests passed.
- 138 related civic, event-refresh, title/description, time-extraction, farmers-market, and retired-slug regression tests passed.
- Production build passed, including the locked-home and tech-logo prebuild gates. Local Node 26 built successfully; the Vercel adapter selected the repository's Node 24 production runtime. No claim of a Node 24 local run.
- Read-only artifact checks confirmed event count/ID uniqueness, the correction/cache agreement, 18 local-job estimates, and 140 funding entries' date/category formats. Historical budget arithmetic was checked across all eleven cities.
- One changed spelling retired its old future event slug; capitalization-only repairs leave their slugs unchanged.
