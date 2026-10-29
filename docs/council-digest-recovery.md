# Council digest source recovery

`npm run generate-digests` reads Stoa search records, verifies the body's
identity, and uses a first-party agenda when the search record is stale,
regresses behind the published card, or cannot be attributed safely. Palo
Alto's PrimeGov adapter selects committee 9 **and** a City Council title,
excludes canceled, postponed, future and wholly closed sessions, and reads the
record's own published compiled agenda document. Template IDs are reusable
and do not identify a unique meeting.

The rendered agenda's body/title and printed date must agree with the archive
record. PrimeGov's HTML title timestamp is UTC; the archive's `dateTime` and
the date printed inside the agenda are Pacific. The full numbered business
items feed both attribution and summarization. A short search excerpt or
participation notice cannot establish Council business, discussion, or a vote.

When several other bodies met, their own agenda items can identify an upstream
record that does not name its body. A disproven or unverifiable Council label
still holds the previous digest unless a verified source can recover it. The
published-date floor, content checks, carry-forward streaks and freshness audit
remain in force. Recovery runs before the date-regression guard as well as
after a failed attribution, so the next run can retain the recovered date.

## Mini runtime

As verified October 28, 2026, native Claude `CCDScheduledTasks` runs the enabled
`southbaysignal-data-refresh` at `0 20 * * *`, with dispatch jitter. Its task is
`~/.claude/scheduled-tasks/southbaysignal-data-refresh/SKILL.md`, and actual
firings are logged in `~/Library/Logs/Claude/main.log`. Inspect that task and
the live registry before making runtime changes. The 15-minute watchdog is a
monitor; it does not establish the generator schedule.

Acquire the existing `~/.claude/scheduled-tasks/lib/repo-lock.sh` mutex before
changing the Mini checkout, installing merged code, generating, or publishing.
Preserve another owner's lock and unrelated dirty files. Install merged code
with a fast-forward, run `npm run generate-digests`, review the resulting
body/date/content/source, then commit and push only verified generated changes.
Verify the Mini artifact and the deployed `/gov/palo-alto` page; merging source
alone does not install it on the Mini or prove recovery.

Offline source and publication-preservation checks:

```sh
node --test scripts/lib/civic-meetings.test.mjs scripts/lib/primegov-digest.test.mjs scripts/lib/digest-staleness.test.mjs scripts/generate-digests.test.mjs
```
