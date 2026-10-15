# South Bay Today fact check — October 14, 2026, evening follow-up

Reviewed `main` at `7ff7a8c0` under the `sbs-fact-check` repository lock.
The deterministic preflight required a review; the obsolete two-hour exit
was not used. Read the twelve required datasets and the latest twenty commits.

## Corrections

- **Delphian Lectures, October 16:** replaced the blurb's invented **royal
  dynasties** topic with **composer families**. The
  [library's program](https://sjpl.bibliocommons.com/events/6a50095d0d65ac36003e9c50)
  describes musical instruments and lists the Bach, Mozart, Schumann,
  Mendelssohn and Strauss families. The ordinary identified HTTP response
  contains that description and the October 16, 11 AM–noon occurrence;
  the web reader returned an incomplete page, which was not treated as
  verification. Corrected the cached blurb and its description fingerprint.
- Corrected **Santori Hall → Suntory Hall** in the same speaker biography.
  The [hall's official site](https://www.suntory.com/culture-sports/suntoryhall/)
  confirms its name and Tokyo location. Added the exact name correction to
  the existing description normalizer. Added a narrowly scoped source-fact
  check that rejects royalty claims for this composer-family series while
  preserving supported royal topics and claims about separate programs.

Only that live event's description and blurb changed. Its title, ID, date,
time, location, URL and slug are unchanged. Ingestion and cache timestamps
retain their original values; this was an editorial correction, not a refresh.

## Reviewed without additional corrections

- **Curated:** 19 development projects, 53 recurring event/market/sports
  records, 18 anchor employers, 51 spotlights and 146 funding records.
  Local-job estimates remain separate from dated global headcounts. Existing
  uncertainty and source notes remain. Unchanged historical claims were
  inspected but not all independently re-sourced this pass.
- **Recent copy edit:** all 256 changed event rows changed descriptions
  only. No additions, removals, occurrence facts or source URLs changed.
  The two numeric-token differences are date punctuation and the correction
  of a zero in Cornelio's name; neither introduces a new numeric claim.
- **Events:** all 1,844 IDs are unique and match the metadata count. No bad
  required clocks, road races tagged sports, raw-address display venues,
  invitation-only titles, verified-fact drift, source/blurb fact conflicts,
  time-of-day/weekday/series conflicts or blocking location contradictions.
  Six generic venue/no-address warnings remain advisory. Monte Sereno's
  city-map warning and the raw inbound publisher-city/virtual-description
  findings do not establish errors in the public feed.
- **Civic:** read all 11 digests, 11 briefings and eight Around Town items.
  All 22 event highlights agree with the live feed or generation-time
  `8f1c19fd` snapshot, allowing the existing K-5th/K-5 title normalization.
  Fresh ordinary HTTP requests returned Cupertino's parcel sizes and
  Mountain View's agenda; Cupertino's areas sum to **32,691 square feet**.
  Preserved the Campbell and SB 707 exceptions.
- **Food:** one query bounded to the 24 displayed county record IDs returned
  all 24. All 12 inspection dates and 12 approval dates match their cities;
  no coming-soon record has a final inspection. `opened` remains empty.
- **Permits/budgets:** both city permit snapshots remain internally plausible;
  the corrected Equinix tenant-improvement and Yoshino entries are intact.
  Historical aggregate permit counts were not re-certified against a mutable
  current feed. All 11 budget per-capita calculations match; source notes
  retain fund-definition limits and Sunnyvale's unverified total stays null.
  Unchanged historical budget PDFs were not downloaded again.
- **Source spot checks:** primary responses support Juanes' 26 Latin Grammy
  awards, the Festival Por La Paz artist count, SCU's 20-person AIM capacity,
  and the Come From Away premise. Official NVIDIA, Hark, Adobe, Vinci and
  Lumentum sources support the retained recent company claims. The company
  URL audit checked **197 links: 191 available, six blocked, zero moved/dead**.
  Blocked pages were not treated as verified company facts.
- **Staleness only:** meetings and weekend picks are approximately 22 hours
  old; the weekend window and all four picks cover **October 16–18**.
  Existing source-health limitations remain recorded. Retired transit,
  real-estate, sports-team, freeway and lane-closure files remain absent.

## Validation

- **111 focused tests passed**, no failures/cancellations/skips, covering
  description normalization, source facts and blurb resolution.
- **Production build passed**, including the homepage and tech-logo gates.
  The built Delphian page contains composer families and neither old error.
- Full-feed integrity, 22 highlight comparisons, 11 budget arithmetic checks,
  exact changed-field assertions and `git diff --check` passed. The unrelated
  full test suite was not rerun.
- HTTP responses, comparisons and test/build logs are retained outside Git in
  this automation run's evidence directory. No paid model calls, mail actions
  or Discord notifications were made. No human decision remains.
