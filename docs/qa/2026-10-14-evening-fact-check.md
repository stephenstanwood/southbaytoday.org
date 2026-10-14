# South Bay Today fact check — October 14, 2026, evening

Audited `main` at `a1ed7ce5` under the `sbs-fact-check` repository lock.
Read all twelve scheduled audit files and the latest twenty commits. The
deterministic preflight required work; the obsolete two-hour early exit was
not used. The earlier October 14 audit remains useful source evidence for
unchanged claims, rather than a substitute for checking the current files.

## Corrections and primary evidence

- **Marvell headcount:** replaced approximately **20,000 globally** with
  **7,480 globally, January 2026**. The company's
  [FY 2026 Form 10-K](https://www.sec.gov/Archives/edgar/data/1835632/000183563226000011/mrvl-20260131.htm)
  reports that count as of January 31, 2026. Dated the displayed figure and
  documented the distinction between companywide counts and SCC estimates.
- **Western Digital history:** replaced the unsupported claim that it had
  operated in San José since 1970 with its verified **Santa Ana founding in
  1970 and present San José headquarters**. Its
  [FY 2021 Form 10-K](https://www.sec.gov/Archives/edgar/data/106040/000010604021000040/wdc-20210702.htm)
  distinguishes the founding location from its headquarters.
- **Arm:** removed the claim that its architecture is inside **most AI
  accelerators**. Arm's [data-center material](https://www.arm.com/markets/cloud-ai/datacenter-ai)
  describes CPUs orchestrating accelerators, without establishing that
  market-share claim. Kept the smartphone architecture and local campus facts.
- **Antora:** removed the unsupported assertion that most of its financing
  would land locally and its unsourced ranking among the year's clean-energy
  rounds. The [funding announcement](https://www.antora.com/insights/series-c)
  supports the $550 million round, San José expansion and a second US
  manufacturing hub, but gives no geographic spending split or funding
  leaderboard. Its factory-size statement is present in the announcement
  and was retained.
- **Nexthop AI and Elorian:** removed their unsourced claims to be among the
  largest South Bay AI or AI seed rounds of 2026. Nexthop's
  [own announcement](https://nexthop.ai/news-and-event/nexthop-ai-accelerates-into-hypergrowth-with-oversubscribed-500m-series-b-funding-catapulting-the-companys-valuation-to-4-2-billion/)
  supports its $500 million round, $4.2 billion valuation and Santa Clara
  headquarters. [Elorian's own site](https://elorian.ai/)
  supports $55 million in backing and the named investors. Neither establishes
  the deleted ranking. No funding amounts or dates were changed.
- **TH Sugarcane & Juice:** corrected **Th Sugercane & Juices** using
  [Great Mall's directory](https://www.simon.com/mall/great-mall/stores/th-sugarcane-juice),
  which also confirms coming-soon status. Added a source-ID name override to
  the existing county generator so another refresh cannot restore the typo.
- **Los Altos Village Farmers Market:** corrected the season's month list
  from **May–October to April–October**. The
  [organizer's schedule](https://www.pcfma.org/market/downtown-los-altos-farmers-market)
  gives April 30–October 29, 2026, Thursdays from 4–8 PM.
- **Who Want the Smoke, November 20:** corrected **Shorline Mafia to
  Shoreline Mafia** and **Kamayiah to Kamaiyah** in the description.
  [Ticketmaster's structured lineup](https://www.ticketmaster.com/who-want-the-smoke-san-jose-california-11-20-2026/event/1C006522E52E3A76)
  spells both artists correctly despite errors in its Event Info paragraph.
  Added date/ID/URL-scoped copy replacements upstream of blurb resolution.
  They repair the known typos without freezing the lineup or changing an
  unrelated occurrence. The event's title, date, venue, time and slug stay
  unchanged.

## Reviewed without additional corrections

- Reviewed **19 development projects, 53 recurring event/market/sports
  entries, 18 anchor employers, 51 spotlights and 146 funding records**.
  SCC-local job estimates remain explicitly qualified. Unchanged historical
  claims were inspected but not all independently re-sourced this run.
- The latest copy edit changed **414 event rows**: 402 descriptions, 26 titles
  and one venue casing, with overlap. There were no event additions/removals
  or changes to dates, clocks, city, category, cost or URLs. Its numeric
  differences remove truncated details or separate a list's numbers; they
  introduce no new numeric claims. Prior event corrections remain intact.
- Checked all **1,844 event IDs** and their metadata count: no duplicates,
  invalid dates, missing required clock times, raw-address venue display names,
  road races tagged sports, private invitation-only titles, source/copy fact
  conflicts, contradictory weekday/series/time-of-day blurbs, or blocking
  location findings. Six generic venue/no-address warnings remain advisory.
  Raw inbound publisher geography and weak virtual-description findings do
  not contradict the corrected published feed.
- Read **11 digests, 11 city briefings and eight Around Town items**. Fresh
  primary checks support Saratoga's $2.5 million Hakone agenda amendment,
  Cupertino's parcel map and lot sizes, and Sunnyvale's Peery Park agenda
  wording. Cupertino's three areas sum to **32,691 square feet**. The web
  tool could not retrieve the latter two pages; ordinary identified HTTP
  requests returned 200 and their actual agenda text. No restriction was
  bypassed. Preserved Campbell and SB 707 exceptions.
- All **22 event highlights** match title, date, clock, city, venue, category
  and URL in the current feed or the generation-time `8f1c19fd` snapshot.
  Empty strings and null optional fields were normalized for comparison.
  Elapsed events absent from the newer feed are not fabricated highlights.
- Fresh ID-bounded queries returned all **24 county food records** and all
  **10 displayed San José permits**. Food dates/cities agree; coming-soon
  records have no final inspection, and `opened` remains empty. Permit dates,
  valuations, dwelling units and work types agree. No mutable current feed
  was used to retroactively certify a historical aggregate. Palo Alto's
  unknown valuations and unit counts remain qualified by the existing data.
- All **11 budget** General Fund/population calculations equal the stored
  rounded per-capita figures. Fund-definition notes remain intact, and
  Sunnyvale's unverified total remains null. Unchanged budget PDFs were not
  downloaded again.
- Meetings and weekend picks were generated October 13 evening Pacific time.
  Weekend picks cover **October 16–18**; retained meeting dates are checked
  against their snapshot time, with the existing source-health restrictions
  preserved. Removed transit, real-estate, sports-team, freeway and lane-closure
  files remain absent.
- Before and after tech URL audits each checked **197 links: 191 available,
  six access-blocked, zero moved and zero dead**. Blocked pages are not
  treated as verified company facts. Fresh official announcements/FAQs also
  support the retained Apple Mac mini, Adobe succession, NVIDIA/Hugging Face,
  Hark and Vinci claims. Meshy's and Scout's superlatives are stated in their
  company-issued releases and were not treated as inventions.

## Validation

- **121 focused tests passed**, zero failures, cancellations or skips.
  Includes a regression case proving the artist correction preserves added
  lineup guests, leaves other dates/URLs untouched, and is idempotent.
- **Production build passed**, including the homepage and tech-logo prebuild
  gates. The entire unrelated test suite was not rerun.
- `git diff --check`, full-feed integrity checks, all 22 highlight comparisons
  and all 11 budget arithmetic checks passed after the edits.
- Source responses, machine-readable findings and test/build logs are retained
  outside Git in this automation run's evidence directory. Data-generation
  timestamps were preserved because these are editorial corrections.

No unresolved item requires Stephen's judgment.
