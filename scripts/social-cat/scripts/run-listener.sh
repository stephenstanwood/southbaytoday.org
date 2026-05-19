#!/bin/bash
# social-cat reaction listener — every 5 min via cron.
# Polls Discord for 👍/❌ reactions on posted drafts, syncs state to
# drafts.jsonl, deletes the matching Discord message on transition.
#
# Cron entry:
#   */5 * * * * /Users/stephenstanwood/Projects/southbaytoday.org/scripts/social-cat/scripts/run-listener.sh >> /Users/stephenstanwood/logs/social-cat-listener.log 2>&1

set -eo pipefail

REPO_DIR="$HOME/Projects/southbaytoday.org/scripts/social-cat"
DISCORD_ENV="$HOME/.claude/channels/discord/.env"
SBT_ENV="$HOME/Projects/southbaytoday.org/.env.local"

if [ -f "$DISCORD_ENV" ]; then
  set -a; . "$DISCORD_ENV"; set +a
fi
if [ -f "$SBT_ENV" ]; then
  set -a; . "$SBT_ENV"; set +a
fi
if [ -f "$REPO_DIR/.env" ]; then
  set -a; . "$REPO_DIR/.env"; set +a
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$REPO_DIR"

/opt/homebrew/bin/python3 scripts/reaction_listener.py
