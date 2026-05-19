#!/bin/bash
# social-cat — every-2h trend radar + draft queue to Discord #social.
# Sources Claude OAuth from mini-claude-proxy/.env, plus project .env
# (SOCIAL_WEBHOOK), then runs radar → drafter → poster.
#
# Cron entry:
#   0 */2 * * * /Users/stephenstanwood/Projects/southbaytoday.org/scripts/social-cat/scripts/run-on-mini.sh >> /Users/stephenstanwood/logs/social-cat.log 2>&1

set -eo pipefail

LOCK_DIR="/tmp/social-cat-run.lock"
if [ -d "$LOCK_DIR" ]; then
  lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0) ))
  if [ "$lock_age" -gt 900 ]; then
    echo "$(date -Iseconds): clearing stale lock ($lock_age s old)"
    rm -rf "$LOCK_DIR"
  fi
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date -Iseconds): another run in progress, skipping"
  exit 0
fi
trap "rmdir '$LOCK_DIR' 2>/dev/null" EXIT

REPO_DIR="$HOME/Projects/southbaytoday.org/scripts/social-cat"
PROXY_ENV="$HOME/Projects/mini-claude-proxy/.env"

# Claude OAuth (SSH/cron can't read macOS keychain)
if [ -f "$PROXY_ENV" ]; then
  set -a
  . "$PROXY_ENV"
  set +a
fi

# SBT social creds — Bluesky, Threads, Instagram, Facebook, Mastodon.
# SBT's own .env.local is the source of truth for the brand's accounts.
SBT_ENV="$HOME/Projects/southbaytoday.org/.env.local"
if [ -f "$SBT_ENV" ]; then
  set -a
  . "$SBT_ENV"
  set +a
fi

# Project env (SOCIAL_WEBHOOK + any overrides)
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  . "$REPO_DIR/.env"
  set +a
fi

# PATH for claude CLI + python3
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$REPO_DIR"
echo "=== $(date -Iseconds): social-cat run ==="

echo "→ radar"
/opt/homebrew/bin/python3 scripts/radar.py

echo "→ draft"
/opt/homebrew/bin/python3 scripts/draft.py

echo "→ post"
/opt/homebrew/bin/python3 scripts/post_to_social.py

echo "=== done ==="
