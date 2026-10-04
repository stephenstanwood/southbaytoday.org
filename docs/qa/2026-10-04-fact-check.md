# October 4, 2026 fact-check

Audited main after the recent October 3 data/copy updates, including `74314856` and `058ab190`, under the `sbs-fact-check` repository lock. Read all twelve scheduled audit files and the last twenty commits. Structural checks cover the full event feed; source verification focused on changed and suspicious records rather than independently re-verifying every historical occurrence.

## Verified corrections

- **Campbell Annual Citywide Garage Sale:** corrected Sunday, October 4 to **Saturday, October 3, 8 AM–4 PM**, matching the [city's organizer page](https://www.campbellca.gov/597/Community-Garage-Sale). Corrected the event feed, weekend pick, and Campbell briefing together. The generator applies this dated correction before excluding past events, so the stale newsletter timestamp cannot promote yesterday's sale on Sunday.
- **Family category errors:** changed four October 21–24 **SJSU Theatre presents Sanctuary City** performances and **All Greg's Kids Come Home — Staged Reading** to arts. Mentions of children in a play's title or plot are insufficient evidence of children's programming. Sanctuary City's existing `kidFriendly: false` remains unchanged; removed the staged reading's unsupported `kidFriendly: true`.
- **Adult library programs:** changed **Mystery Book Club: All the Sinners Bleed** to arts and **Bring Your Product Ideas to Life Using AI** to education. Their published source-audience fields target adults; children appear incidentally in the novel's plot and the presenter's app description. [Cupertino library listing](https://sccl.bibliocommons.com/events/6a580197f213992f00c4878e), [Palo Alto library listing](https://paloalto.bibliocommons.com/events/6aa486587825b40064068b1b).
- **Stanford staged reading:** restored the apostrophe in **All Greg's Kids Come Home**, including its description, and added the missing [Stanford Live program link](https://live.stanford.edu/events/26-27season/studio/chinaka-hodge/). The organizer confirms October 17 at 7 PM in The Studio. Retained its accurate existing blurb under the corrected title/description cache key.
- **Saratoga fruit-tree workshop:** added the missing [official September 18 city newsletter](https://www.saratoga.ca.us/CivicSend/ViewMessage/message/301201) link. It confirms October 3, 10–11:30 AM at Saratoga Heritage Orchard, free admission, and advance registration. Corrected the missing cost and registration fields; the city briefing now links to the same source.
- **Downtown Palo Alto Farmers' Market:** added the missing [organizer link](https://www.pafarmersmarket.org/home), which confirms Saturday, 8 AM–noon on Gilman Street. Updated the corresponding city-briefing highlight.

## Durable generation and URL handling

- Category inference treats staged readings and theater presentations as arts before matching incidental child-related words, while preserving explicitly named children's theater. Structured adult-only library audiences suppress the broad family rule; mixed adult/child audiences retain their existing behavior.
- Occurrence corrections require the exact date and a matching ID, official URL, or both title and venue. They do not apply to another year or an unrelated event on the same day. Existing restrictions on unknown times and source access remain intact.
- The old garage-sale date and staged-reading spelling each enter the retired-slug ledger. Verified facts also apply during retired-page resolution, allowing the wrong-date URL to redirect to the correct occurrence without relaxing the same-day matching rule for recurring IDs. If a corrected successor disappears, the retired leaf retains verified facts.
- No new events or projects were added. Raw inbound extraction data was left intact; offline regression fixtures exercise its wrong-date record directly.

## Reviewed without additional corrections

- `development-data.ts`: 19 projects, with existing status, timeline, developer, and source qualifications.
- `events-data.ts`: 53 recurring entries, including market schedules and the sports-season block.
- `tech-companies.ts`: 18 anchor companies' SCC local-job estimates remain explicitly separate from global headcounts. Reviewed 51 spotlights and 140 funding records. Recent PaleBlueDot, GMI Cloud, NVIDIA/Hugging Face, and Adobe leadership claims agree with their primary announcements: [PaleBlueDot](https://www.prnewswire.com/news-releases/palebluedot-ai-raises-200m-series-c-round-to-scale-super-intelligence-infrastructure-platform-302896601.html), [GMI company release via Business Wire syndication](https://markets.financialcontent.com/lightport.lightport8/article/bizwire-2026-9-30-gmi-cloud-raises-over-660-million-to-accelerate-global-ai-infrastructure-expansion), [NVIDIA](https://blogs.nvidia.com/blog/nvidia-to-acquire-hugging-face/), [Adobe](https://news.adobe.com/news/2026/09/adobe-announces-anil-chakravarthy-to-become-president-and-ceo). Announcements are not rewritten as completed transactions.
- `digests.json`: all 11 city entries reviewed. Agenda-only claims remain qualified; expected Campbell feed lag is not a fabrication flag. Saratoga's September 16 entry remains valid after the source-adapter recovery; the official city newsletter confirms the later September 19/30 meetings were single-topic town halls.
- `around-town.json`: seven items retain meeting-body provenance and agenda-only framing; featured permit amounts agree with `permit-pulse.json`.
- `permit-pulse.json`: San Jose/Palo Alto notable-permit subsets are not confused with total counts. Unpublished Palo Alto valuations remain unknown rather than asserted project costs.
- `city-budgets.json`: all 11 general-fund per-capita calculations equal rounded general-fund millions divided by population. Historical fiscal years and source qualifications remain labeled; Sunnyvale's unverified total stays null.
- `scc-food-openings.json`: no inspection-only record is asserted to have opened. Twelve inspection records and twelve coming-soon records retain their source qualifications; the opened list remains empty.
- The remaining event, city-briefing, and weekend-pick records showed no additional confirmed issue in this review. All 1,914 event IDs remain unique, with no road-race event categorized as sports and no raw-address venue names.
- `upcoming-meetings.json` and `weekend-picks.json` are freshly generated for the relevant dates/weekend. Staleness checks do not bypass the recorded Los Gatos source rejection.

## Validation

- Targeted inbound, category, library-detail, source-fact, and retired-slug tests passed before the production checks. An additional retired-date regression confirms the corrected garage-sale redirect and preserves recurring-ID isolation.
- `npm test`: **1,202 tests passed**, zero failures and zero skips across 100 test invocations.
- `npm run build`: passed, including the locked-home import and tech-logo prebuild gates. The local run used Node 26; the Vercel adapter selected the repository's Node 24 production runtime.
- Generated Vercel routes confirm **301 redirects** from `/event/2026-10-04-annual-citywide-garage-sale` to its October 3 URL and from `/event/2026-10-17-all-gregs-kids-come-home-staged-reading` to the apostrophe-corrected spelling. Both destinations exist; neither superseded URL has a stale static page.
- Read-only data checks confirmed ten corrected event records, seven category corrections, unchanged event count, ID uniqueness, no road-race category misfires, no raw-address venues, and agreement between the corrected feed, briefings, and weekend pick.
