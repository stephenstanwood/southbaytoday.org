# Council digest source recovery

Digest attribution and summarization read the same ingested agenda:
`fullAgendaText` when Stoa supplies it, otherwise its legacy `excerpt`.
The official calendar and agenda-item matching still decide which body met;
missing or ambiguous evidence still carries the previous digest forward.
Legistar source links point to the matched event's own meeting page.
The per-city page names that verified body in the digest heading as well.

## October 21, 2026: Milpitas

The fact check found Milpitas still displaying September 15, now 36 days old.
Stoa's October 6 and October 20 records were portal stubs. The configured
first-party fallback retrieved the real agendas but parsed no public items:
`ADJOURN TO CLOSED SESSION` prematurely ended the agenda body, and the parser
did not recognize Milpitas's `C1.` consent-item prefix.

The parser now distinguishes that explicit closed-session recess from final
adjournment, reads consent and regular items in the same flat outline, and
uses the source's staff-contact boundary to join wrapped titles. It removes
running page headers. The CivicClerk fallback also excludes sittings whose
names mark them cancelled or postponed before spending its document budget.

The captured October 20 agenda and event row are in
`scripts/lib/fixtures/milpitas-2026-10-20/`. Tests exercise the complete
fallback, eight recovered public items, the $130,000 recommendation, final
adjournment, future/deleted/cancelled/closed exclusions, failed downloads, and
the existing two-substantive-item floor. The Los Altos and Saratoga parsing
regressions remain covered.

The live fallback now retrieves the October 20 agenda using one events query
and one agenda download. Only Milpitas's digest was refreshed, citing its
[own meeting page](https://milpitasca.portal.civicclerk.com/event/2944/files).
Its summary describes agenda proposals, not votes or adopted actions. No
full-data or paid-model regeneration was necessary.

## September 12, 2026: San José

Alert `1548312020678610946` reported three `body-unresolved` carries. The selected
September 9 record was Stoa ID 85, from Legistar event 8094: the Rules and Open
Government Committee and Committee of the Whole. Other bodies had calendar
entries that day, so choosing the first committee would have been unsafe.

Stoa had the full agenda locally but dropped it when syncing to `council_search`
and serving its API. Its 500-character excerpt contained only one numbered
item, below the existing two-item attribution requirement. Restoring the
ingested agenda through Stoa's database/API provides three independent numbered matches.
The real-source regression fixture pins both outcomes: the clipped record is
unresolved; the complete source identifies event 8094. Tied agendas and failed
calendar requests remain blocked.

The actual morning caller was the Mini's `routine-fallback.sh`, dispatched by
cron at 05:35 on September 12. It ran the `southbaysignal-data-refresh` task
using `~/.claude/scheduled-tasks/southbaysignal-data-refresh/SKILL.md`. Evidence:
`~/logs/routine-fallback.log` and
`~/logs/routine-fallback/southbaysignal-data-refresh-20260912-053507.log`.
The latter records the failed September 9 attribution and commit `60ef6d7e`.
The enabled Claude task normally runs at 20:00; the fallback recovered that
missed run. `sbt-digest-refresh/run.sh` and its April log are legacy artifacts.
The separate events-refresh launchd unit is not the digest caller.

After merging generator repairs, fast-forward the Mini's SBT checkout under
`~/.claude/scheduled-tasks/lib/repo-lock.sh`; a Vercel deployment does not install
code on the Mini. Preserve alert evidence, verify the regenerated public digest,
and only then acknowledge all exact alert IDs for the resolved failure.

## October 3, 2026: Saratoga

Alert `1555801813146542101` reported three `source-regressed` carries of the
September 16 digest. Stoa's newest usable record was August 19. The direct
CivicEngage fallback examined September 30, September 19, then a Chinese
September 19 PDF; none met its existing content requirements, so it never
reached the English September 16 agenda. Holding the published card was correct.

The city's index links each translated PDF twice: a title that identifies the
language and a generic `Agenda` download link. Filtering individual link text
allowed the generic alias to reintroduce the rejected PDF. The parser now
collects translation evidence from visible and accessible labels for each URL,
then excludes every alias before applying the three-document limit.

The real-source fixtures in `scripts/lib/fixtures/saratoga-2026-10-03/` reproduce
the index and PDF path. September 19 and 30 are single-topic law enforcement
town halls and still fail the two-substantive-item requirement. September 16
remains the newest eligible digest source; October 7 is still in the future.
The repair restores source access without changing the meeting date, content
floor, body verification, regression guard, or 35-day freshness floor.

The full `npm run generate-digests` recovery run generated all 11 cities with
no freshness alerts. Only Saratoga's successful regeneration metadata is
published here: its existing edited wording and every other city's digest are
preserved. The complete raw generation is retained with the incident evidence.

The failing run was the Mini's cron-dispatched `routine-fallback.sh` invocation
of `southbaysignal-data-refresh` at 21:35 PT on October 2. Its digest log was
`/tmp/sbt-data-refresh-_9qqe47g/generate-digests.mjs.log`; the permanent caller log
is `~/logs/routine-fallback/southbaysignal-data-refresh-20261002-213511.log`.
The alert, previous digest, API response, official source bytes, and run evidence
were preserved before acknowledgment in
`~/Documents/Codex/2026-10-03/saratoga-digest-recovery/` on the MacBook.

## October 8, 2026: Santa Clara

Alert `1557591734295470101` reported three `body-unresolved` carries of the
September 22 card. Stoa record 112, dated October 5, contains only the city's
legal disclosures. That date had a cancelled Neighborhood-University Relations
Committee sitting, the Board of Library Trustees, and the Cultural Commission;
the record cannot identify a council meeting. The existing attribution refusal
is correct and remains unchanged.

Santa Clara's official council body is `City Council and Authorities Concurrent`,
which the old fallback's exact `City Council` filter could not retrieve. The
configured provider name now retrieves the real October 6 agenda, event 4890,
and cites its own [meeting page](https://santaclara.legistar.com/MeetingDetail.aspx?LEGID=4890&GID=693&G=51628CB4-1CB3-4C6E-87AA-7605356B8A63).
A recent Stoa record that fails body verification may try the official council
source. The replacement must independently pass the same calendar check and
cannot predate the published card. An older Stoa record also triggers retrieval
before the existing regression guard, so the next run can still recover October
6 even while Stoa remains at October 5.

The direct record retains the complete agenda for attribution and summarization,
including the long numbered item on data center water use and grid support.
The two-substantive-item content floor, cancelled/future-meeting exclusions,
two-item attribution requirement, carry-forward behavior, and 35-day freshness
floor remain in place. The real-source fixture and focused tests reproduce the
failed Stoa attribution, official recovery, and failure/regression boundaries.

The full live generation produced all 11 cities with no freshness alerts.
Only Santa Clara's regenerated October 6 card is published; the other ten
edited cards are preserved. Its wording describes agenda items and requests
for future discussion without claiming votes or completed council action.

The actual October 7 caller was native Claude `CCDScheduledTasks`, running the
enabled `southbaysignal-data-refresh` task with cron expression `0 20 * * *`.
`~/Library/Logs/Claude/main.log` records its spawn, renderer acknowledgment,
and confirmed run at 20:10:31 PT. The live registry records
`lastRunAt: 2026-10-08T03:10:31.458Z`; the alert followed at 03:13:28 UTC.
Neither the retired digest runner nor the separate events launch agent was
changed. The Mini still requires an explicit fast-forward under its repo lock
after the GitHub merge.

## October 18, 2026: upcoming meetings and contended refreshes

Four consecutive evening `southbaysignal-data-refresh` attempts (October 14–17)
correctly deferred behind `sbs-fact-check`, but no follow-up ran after the mutex
was released. The scheduler's recorded firing did not establish data freshness;
the meetings file still contained October 13 rows on October 18.

The existing caller now uses `scripts/data-refresh-recovery.mjs wait` to wait up
to 25 minutes for the same cooperative mutex, without changing other callers or
stealing an occupied lock. A deferred request persists outside Git and remains
pending until an existing canonical run publishes freshly validated meetings.
`check` validates dates, confirmations and all 11 provider outcomes; `complete`
requires local artifact bytes matching committed and pushed main before clearing
pending recovery. Meetings run first in the existing pipeline. The versioned
Mini prompt and installation notes are in `ops/mini/data-refresh/`.

Santa Clara's upcoming-meetings query now uses the same verified `City Council
and Authorities Concurrent` name as the council-digest source, recovering its
October 20 meeting. A live generator probe confirmed eight future council rows.
Los Gatos's HTTP transport still failed while normal browser navigation showed
the October 20 Town Council meeting at 7 p.m. Its automated provider outcome
remains explicitly `error`; browser access does not establish an unattended
source recovery. Error text reports only the current failure, rather than
claiming a User-Agent denial or current robots policy from historical evidence.

Source publication and production verification remain separate: install the
merged code on the Mini under its mutex, install and byte-check the versioned
prompt, run the canonical scoped civic recovery, then verify the deployed Gov
and city data. Never overwrite Mini data with a different checkout's artifact.
