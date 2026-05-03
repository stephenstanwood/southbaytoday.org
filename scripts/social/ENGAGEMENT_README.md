# Engagement Agent (Bluesky → Discord → in-thread reply)

Polls a curated list of Bluesky accounts every 30 min, scores their new posts for
reply-worthiness, drafts a reply with Claude, and pushes each draft to Discord
with two one-tap links: **Approve** (publishes within 5 min) or **Reject** (drops it).

## Files

| Path | Role |
|------|------|
| `scripts/social/watch-bluesky-engagement.mjs` | Watcher — scores posts + drafts replies + pings Discord |
| `scripts/social/publish-engagement-replies.mjs` | Publisher — posts approved drafts to Bluesky in-thread |
| `scripts/social/lib/engagement-drafter.mjs` | Two-stage Claude logic (Haiku scoring + Sonnet drafting) |
| `scripts/social/lib/platforms/bluesky.mjs` | Added `getAuthorFeed` + `createReply` |
| `scripts/social/copy-review-server.mjs` | Added `/engagement/approve/:id` + `/engagement/reject/:id` routes |
| `src/data/south-bay/engagement-accounts.json` | Curated handles (gitignored — Mini source-of-truth) |
| `src/data/south-bay/engagement-drafts.json` | Draft state file (gitignored, auto-created) |

## Setup on the Mini

### 1. Curate accounts

SSH to the Mini and edit:

```
nano ~/Projects/southbaytoday.org/src/data/south-bay/engagement-accounts.json
```

Add 10–20 Bluesky handles:

```json
{
  "accounts": [
    { "handle": "kqed.bsky.social",       "label": "KQED" },
    { "handle": "sanjosespotlight.com",   "label": "SJ Spotlight" },
    { "handle": "mattmahan.bsky.social",  "label": "Mayor Mahan" }
  ]
}
```

Use whatever handle resolves at `https://bsky.app/profile/{handle}`.

### 2. Test once, dry-run

```bash
cd ~/Projects/southbaytoday.org
node scripts/social/watch-bluesky-engagement.mjs --dry-run --max 1
```

Confirm it fetches the feed, scores a post, and prints a draft.

Then a real run that pushes to Discord:

```bash
node scripts/social/watch-bluesky-engagement.mjs --max 1
```

You should see the embed show up in Discord with Approve / Reject links.

### 3. Tap a link from Discord

Phone or laptop, doesn't matter — Tailscale needs to be on for the link host to resolve.
Default link host is `http://100.117.24.89:3456` (your Mini's Tailscale IP).
Override with `REVIEW_PORTAL_URL` env var if needed.

After tapping Approve, the draft flips to `status: 'approved'` in `engagement-drafts.json`.

### 4. Publish on cycle

```bash
node scripts/social/publish-engagement-replies.mjs
```

This picks up every approved-but-not-yet-published draft and posts it to Bluesky in-thread.

### 5. Wire up launchd (recurring)

Two new launchd jobs, alongside the existing social ones:

**Watcher — every 30 min:**

`~/Library/LaunchAgents/com.sbt.engagement-watch.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.sbt.engagement-watch</string>
  <key>WorkingDirectory</key>  <string>/Users/stephenstanwood/Projects/southbaytoday.org</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/stephenstanwood/.nvm/versions/node/v22.11.0/bin/node</string>
    <string>scripts/social/watch-bluesky-engagement.mjs</string>
  </array>
  <key>StartInterval</key>     <integer>1800</integer>
  <key>StandardOutPath</key>   <string>/tmp/sbt-engagement-watch.log</string>
  <key>StandardErrorPath</key> <string>/tmp/sbt-engagement-watch.err</string>
  <key>RunAtLoad</key>         <false/>
</dict>
</plist>
```

**Publisher — every 5 min:**

`~/Library/LaunchAgents/com.sbt.engagement-publish.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.sbt.engagement-publish</string>
  <key>WorkingDirectory</key>  <string>/Users/stephenstanwood/Projects/southbaytoday.org</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/stephenstanwood/.nvm/versions/node/v22.11.0/bin/node</string>
    <string>scripts/social/publish-engagement-replies.mjs</string>
  </array>
  <key>StartInterval</key>     <integer>300</integer>
  <key>StandardOutPath</key>   <string>/tmp/sbt-engagement-publish.log</string>
  <key>StandardErrorPath</key> <string>/tmp/sbt-engagement-publish.err</string>
  <key>RunAtLoad</key>         <false/>
</dict>
</plist>
```

Verify the node path matches your Mini (`which node` to confirm).

Load:
```bash
launchctl load ~/Library/LaunchAgents/com.sbt.engagement-watch.plist
launchctl load ~/Library/LaunchAgents/com.sbt.engagement-publish.plist
```

Restart copy-review-server too (since it gained the new routes):
```bash
launchctl unload ~/Library/LaunchAgents/com.sbt.copy-review-server.plist
launchctl load   ~/Library/LaunchAgents/com.sbt.copy-review-server.plist
```

## Caps & safety

- **Max 3 drafts per run, 5 per 24h** (hard-coded in watcher) — keeps volume manageable
- **24h post-age cutoff** — won't draft replies to anything older than a day
- **Dedup by parent URI** — same source post never gets two drafts
- Scoring prompt rejects political-partisan, personal-moment, and generic-hype posts
- Drafting prompt enforces 240-char cap, anti-AI-speak rules, no fabricated links

## Tuning

- Loosen/tighten the scoring prompt in `lib/engagement-drafter.mjs` (`SCORING_PROMPT`)
- Adjust draft voice in the same file (`DRAFTING_PROMPT`)
- Change caps via the `DAILY_DRAFT_CAP` and `--max` constants in the watcher
- Add platforms later by adding `getAuthorFeed` + `createReply` to other platform modules and looping over them in the watcher
