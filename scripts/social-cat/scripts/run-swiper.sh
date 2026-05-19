#!/bin/bash
# social-cat swiper — long-running HTTP server at :8765 under launchd.
# Mirror surface to Discord #social; tap-driven reviewer for queued drafts.
#
# Launched by ~/Library/LaunchAgents/dev.stanwood.social-cat-swiper.plist
# (KeepAlive=true). The plist invokes this wrapper so SOCIAL_WEBHOOK
# is loaded from SBT .env.local (launchd plists can't source env files).

set -eo pipefail

SBT_ENV="$HOME/Projects/southbaytoday.org/.env.local"
if [ -f "$SBT_ENV" ]; then
  set -a; . "$SBT_ENV"; set +a
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec /opt/homebrew/bin/python3 "$HOME/Projects/southbaytoday.org/scripts/social-cat/scripts/swiper.py"
