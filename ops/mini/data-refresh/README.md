# Mini civic refresh recovery

The existing enabled Claude `southbaysignal-data-refresh` task remains the
canonical caller, at `0 20 * * *`. Its installed prompt is
`~/.claude/scheduled-tasks/southbaysignal-data-refresh/SKILL.md` on the Mini.
This directory versions that prompt; copy it there after merging and installing
the repository code. Preserve the live prompt before installation and inspect
the diff. No registry, cron, launchd, other schedule, or shared mutex change is
required. The prompt's existing notification policy still applies.

Four October 14–17 runs hit fact-check's mutex and returned immediately. The
scheduler recorded a firing rather than successful data publication, leaving
October 13 meetings until October 18. `scripts/data-refresh-recovery.mjs wait`
now waits up to 25 minutes under the existing caller. It probes the existing
helper and only attempts acquisition when free. Contention or an unknown lock
state cannot authorize stealing/releasing another owner's lock. A timed-out
request persists outside Git and is retried by the next existing run.

Meetings run first. `check` refuses stale/past/unconfirmed rows or incomplete
provider outcomes. `complete`, called after push while the same mutex remains
held, requires fresh artifact bytes identical to the committed main version and
an actual remote main SHA matching HEAD. Only then is pending recovery cleared;
the completion receipt preserves unresolved provider errors. A green timer,
attempted generator, or local commit cannot clear the request. This receipt
proves source publication, while incident closeout also verifies Vercel's live
artifact/page. Known source errors are not a claim of full provider recovery.

For a scoped civic incident, run the same wait, generate-upcoming-meetings,
check, scoped publication, complete and release commands from this prompt. Do
not refresh other artifacts or upload data from another checkout. Always read
current Mini data, lock ownership, dirty state and origin/main before mutation.

Focused regressions: `npm run test:civic-refresh`. In addition, exercise wait
against the installed mutex using its existing `SBT_REPO_LOCK` and
`SBT_REPO_LOCK_LOG` overrides pointing to a private temporary directory. Verify
real contention, delayed release, timeout retention, and an old live owner
without touching the production lock.

## Los Gatos meeting source

Los Gatos's MuniCode transport fails, and its calendar/feed access is restricted.
The upcoming-meetings adapter instead reads the town's permitted
[public meetings information page](https://www.losgatosca.gov/3044/Town-Council-Public-Meetings-Information)
and follows its official meeting-schedule PDF. It respects the town's ten-second
crawl delay and keeps the aggregator identity. No MuniCode, calendar, RSS or
iCalendar request is used by this adapter.

Dates come from explicit regular-council rows, including moved dates and
cancellations. The 2026 document, for example, lists Monday November 2 and
cancels Tuesday November 3. This confirms scheduled dates, not agenda retrieval,
special-meeting coverage or per-meeting start times. The confirmation cites the
PDF; the reader link opens the town's meeting information page. Missing links,
non-PDF responses, unknown row formats, stale years and exhausted schedules
remain source errors. No recurring date or time is projected.

Deploy through the existing source PR/main path, then fast-forward the Mini's
clean checkout under its existing repo mutex. Run `npm run test:civic-refresh`
and the installed `generate-upcoming-meetings.mjs`, check the resulting Los Gatos
confirmation, and publish only the meetings artifact. A scoped repair must
preserve a pending full-refresh request owned by an unrelated failure; do not
call `data-refresh-recovery.mjs complete` to clear that request.
