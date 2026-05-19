#!/bin/bash
# social-cat — nightly reflection pass.
# Reads the post_log, fetches Bluesky engagement, writes voice_weights.json,
# then posts a one-line summary to Discord #tasks so Stephen sees it in the
# morning digest.
#
# Cron entry (before Stephen's 4am wake — leave buffer):
#   30 2 * * * /Users/stephenstanwood/Projects/southbaytoday.org/scripts/social-cat/scripts/run-nightly.sh >> /Users/stephenstanwood/logs/social-cat-nightly.log 2>&1

set -eo pipefail

LOCK_DIR="/tmp/social-cat-nightly.lock"
if [ -d "$LOCK_DIR" ]; then
  lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0) ))
  if [ "$lock_age" -gt 1800 ]; then
    echo "$(date -Iseconds): clearing stale lock ($lock_age s old)"
    rm -rf "$LOCK_DIR"
  fi
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date -Iseconds): another nightly run in progress, skipping"
  exit 0
fi
trap "rmdir '$LOCK_DIR' 2>/dev/null" EXIT

REPO_DIR="$HOME/Projects/southbaytoday.org/scripts/social-cat"

# Project env (anything relevant, e.g. lookback overrides) — not strictly needed
# since reflect.py talks only to public.api.bsky.app, but keep parity with
# run-on-mini.sh for future-proofing.
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  . "$REPO_DIR/.env"
  set +a
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$REPO_DIR"
echo "=== $(date -Iseconds): social-cat nightly reflect ==="

/opt/homebrew/bin/python3 scripts/reflect.py

# One-line summary → #tasks. Best-effort; never fail the run on Discord error.
SUMMARY=$(/opt/homebrew/bin/python3 -c "import sys; sys.path.insert(0, 'scripts'); import voice_weights; print(voice_weights.summary_line() or 'no signal yet')" 2>/dev/null || echo "")
SAMPLE=$(/opt/homebrew/bin/python3 -c "import sys; sys.path.insert(0, 'scripts'); import voice_weights; print(voice_weights.sample_size())" 2>/dev/null || echo "0")

if [ -n "$SUMMARY" ]; then
  printf "**🪞 social-cat nightly reflect** (n=%s)\n%s" "$SAMPLE" "$SUMMARY" \
    | "$HOME/.claude/scripts/post-to-tasks.sh" || true
fi

echo "=== done ==="
