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
