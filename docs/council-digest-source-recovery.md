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
