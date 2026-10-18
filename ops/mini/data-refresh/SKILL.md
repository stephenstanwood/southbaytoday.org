---
name: southbaytoday-data-refresh
description: Refresh South Bay Today static data using the existing daily evening caller
---

## Stephen notification policy - 2026-10-18

Automated Discord DMs and @mentions of Stephen are retired across all projects.
Do authorized work automatically. Send actionable failures, unresolved work and
genuine decisions to existing MILO intake, using
`~/.local/bin/stoa-notify --producer NAME`
with the exact source evidence on stdin. Reuse the actual repair owner; MILO
automatically starts standing-authorized FIX work. Questions and blockers belong
only in the relevant native MILO or FIX chat. Routine success/status stays quiet.
Never fall back to a DM or mention, including when a provider or laptop is
unavailable. This policy overrides older notification clauses below and grants
no new sending, purchase, pursuit or other gated authority.


## 0. Repo lock and pending recovery — acquire FIRST, release LAST

This existing caller owns the complete refresh. Keep its schedule and the shared
`~/.claude/scheduled-tasks/lib/repo-lock.sh` mutex; do not create another timer.

1. Before any repo mutation, run (allow 26 minutes, or retain its running shell
   session while it waits):
   `/opt/homebrew/bin/node /Users/stephenstanwood/Projects/southbaytoday.org/scripts/data-refresh-recovery.mjs wait`
   - Exit 0 means the existing mutex is held by `southbaysignal-data-refresh`.
   - The helper waits up to 25 minutes for another real owner to release. It
     never calls acquire on an occupied lock, including an old lock. Do not
     steal/release another owner's lock or treat waiting as a finished refresh.
   - Exit 75 leaves a durable request in
     `~/.local/state/sbt-data-refresh/pending.json`. Stop repo work, report the
     exact owner, and use `~/.local/bin/stoa-notify --producer southbaysignal-data-refresh`
     for an actionable persistent deferral. The next existing canonical run
     retries that same pending request; do not add another scheduler.
   - Any other error also stops repo work and preserves the pending request.
2. Once acquired, verify the checkout is on `main` and `git status --porcelain`
   is empty. Preserve pre-existing dirty files, staged files, holds and commits;
   if they block a safe refresh, leave recovery pending and report the evidence.
3. As the very last action, and on EVERY early exit/error after acquisition:
   `bash ~/.claude/scheduled-tasks/lib/repo-lock.sh release southbaysignal-data-refresh`
   During long runs refresh only this owner using the helper's `refresh` command.

Refresh all South Bay Today static data files and push to GitHub.

Repo is at: /Users/stephenstanwood/Projects/southbaytoday.org

## Steps

1. Load environment variables from .env.local (uses `set -a; source` because .env.local contains a multiline RSA private key that breaks `export $(... | xargs)`), then unset the Anthropic Console key so the CCD agent itself bills Max OAuth:
```bash
cd /Users/stephenstanwood/Projects/southbaytoday.org
set -a; source .env.local; set +a
unset ANTHROPIC_API_KEY
```
Generate/refresh Node scripts that call the Anthropic SDK must be run as `node --env-file=.env.local scripts/<name>.mjs` (key only in the child process).

2. Pull latest code first:
```bash
git pull --ff-only origin main
```

3. Run each script in order. If a script fails, log the error and continue — do not stop the whole run:
   - `node --env-file=.env.local scripts/generate-upcoming-meetings.mjs`
   - `node scripts/data-refresh-recovery.mjs check` **BLOCKING for meetings**:
     on failure, do not publish that artifact or clear pending recovery. Keep the
     original file from this run's clean HEAD, report the real failure, and
     continue unrelated generators. Explicit `sourceHealth: error` entries are
     retained and reported; they are never relabeled as a calendar recess.
   - `node --env-file=.env.local scripts/generate-permits.mjs`
   - `node --env-file=.env.local scripts/pull-inbound-events.mjs`
   - `node --env-file=.env.local scripts/generate-events.mjs`
   - `node --env-file=.env.local scripts/generate-digests.mjs`
   - `node --env-file=.env.local scripts/generate-around-town.mjs`
   - `node --env-file=.env.local scripts/generate-city-briefings.mjs`  (reads around-town.json — must run AFTER generate-around-town)
   - `node --env-file=.env.local scripts/generate-weekend-picks.mjs`
   - `node --env-file=.env.local scripts/generate-scc-food-openings.mjs`
   - `node --env-file=.env.local scripts/generate-restaurant-radar.mjs`
   - `node --env-file=.env.local scripts/generate-reddit-pulse.mjs`
   - `node --env-file=.env.local scripts/generate-photos.mjs`  (requires FLICKR_API_KEY — loaded from .env.local in step 1)
   - `node --env-file=.env.local scripts/generate-apod.mjs`

4. **Gate the event data — BLOCKING, unlike every other script above.**
```bash
node --env-file=.env.local scripts/audit-events.mjs
```
   - Exit 0 → continue normally.
   - **Non-zero exit** → the refresh produced events that read as virtual but are
     not flagged `virtual`, so every surface would publish them as a physical
     destination with a venue and a map link (the 2026-08-05 CRC newsletter
     error). Do NOT commit the event data:
     `git checkout -- src/data/south-bay/upcoming-events.json src/data/south-bay/inbound-events.json`
     Commit the rest of the refresh normally, and put the audit's `BLOCKED` lines
     verbatim at the TOP of your completion summary.

5. Check if any JSON files changed:
```bash
git status --short src/data/south-bay/
```

6. If files changed, commit and push:
```bash
git checkout main && git pull --rebase
git add src/data/south-bay/
git commit -m "chore: data refresh $(date '+%Y-%m-%d %H:%M PT')"
git push origin main
```

7. After a successful push (or verified no-change run), while still holding
   this task's mutex, run:
   `node scripts/data-refresh-recovery.mjs complete`
   This checks freshness, future confirmed dates, complete provider outcomes,
   the local committed bytes and the actual remote main SHA before clearing
   `pending.json`. A failed generation/check/push keeps the request pending;
   never clear it just because the scheduler fired or a generator exited 0.
   Report any unresolved provider failures from its JSON receipt. Release last.

## Rules
- Only commit if at least one JSON file actually changed (git status shows modified files)
- Do NOT modify source files — run the installed recovery helper and generators and commit only this run's JSON outputs.
- If git push fails due to a conflict, do `git pull --rebase origin main` then push again
- Respect rate limits: if a script prints a rate limit warning, move on without retrying
## Final summary — REQUIRED (Stop hook posts this to #tasks; do NOT call any Discord tool)

Your very last message in this conversation will be posted to the #tasks channel automatically by the Stop hook. Do NOT call `mcp__plugin_discord_discord__reply` or any other Discord tool.

Goal: tell Stephen **what data got refreshed, what changed, and does anything need him to look at it?** Omit `Your move` when not needed.

```
**Agent:** Claude (SBT Data Refresh)
**Scripts:** N ran, M succeeded, K failed [(name: reason) for each failure]
**Data changed:** [specific files + what kind of delta — e.g. "upcoming-events.json (+8 events), around-town.json (2 headlines updated), weekend-picks.json"]
**Pushed:** [commit msg, or "no changes to commit"]
**Your move:** [ONLY if a script failure is persistent (e.g. same script failed yesterday too) or a data source changed shape. OMIT if the run completed cleanly or only had transient failures.]
```

Rules:
- List which scripts failed AND why (not just "1 failed").
- For data changes, mention what kind of change (new events, updated meetings, permits added).
- If nothing changed, say: `**Data changed:** none — nothing to commit`.
- Transient failures (rate limits, network blips) don't need `Your move` — the next run retries. Only flag when something looks persistent or structural.
- Never end on procedural noise ("now let me check") — the summary IS your last message.