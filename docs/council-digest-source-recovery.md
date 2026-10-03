# Council digest source recovery

Digest attribution and summarization read the same ingested agenda:
`fullAgendaText` when Stoa supplies it, otherwise its legacy `excerpt`.
The official calendar and agenda-item matching still decide which body met;
missing or ambiguous evidence still carries the previous digest forward.
Legistar source links point to the matched event's own meeting page.
The per-city page names that verified body in the digest heading as well.

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
