#!/bin/bash
# social-cat publisher — every 30 min via cron.
# Picks one approved draft per fire and posts it. Expires drafts >24h old.
#
# Cron entry:
#   */30 * * * * /Users/stephenstanwood/Projects/southbaytoday.org/scripts/social-cat/scripts/run-publisher.sh >> /Users/stephenstanwood/logs/social-cat-publisher.log 2>&1

set -eo pipefail

LOCK_DIR="/tmp/social-cat-publisher.lock"
if [ -d "$LOCK_DIR" ]; then
  lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0) ))
  if [ "$lock_age" -gt 300 ]; then
    rm -rf "$LOCK_DIR"
  fi
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date -Iseconds): publisher already running, skipping"
  exit 0
fi
trap "rmdir '$LOCK_DIR' 2>/dev/null" EXIT

REPO_DIR="$HOME/Projects/southbaytoday.org/scripts/social-cat"
SBT_ENV="$HOME/Projects/southbaytoday.org/.env.local"

if [ -f "$SBT_ENV" ]; then
  set -a; . "$SBT_ENV"; set +a
fi
if [ -f "$REPO_DIR/.env" ]; then
  set -a; . "$REPO_DIR/.env"; set +a
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$REPO_DIR"

/opt/homebrew/bin/python3 scripts/publisher.py
