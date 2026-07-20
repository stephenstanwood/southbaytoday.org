#!/bin/bash
set -euo pipefail

REPO="/Users/stephenstanwood/Projects/southbaytoday.org"
SOURCE="$REPO/scripts/events/events-refresh.plist"
TARGET="/Users/stephenstanwood/Library/LaunchAgents/org.southbaytoday.events-refresh.plist"
DOMAIN="gui/$(id -u)"

if [[ ! -f "$SOURCE" ]]; then
  echo "missing $SOURCE" >&2
  exit 1
fi

plutil -lint "$SOURCE"
launchctl bootout "$DOMAIN" "$TARGET" 2>/dev/null || true
cp "$SOURCE" "$TARGET"
launchctl bootstrap "$DOMAIN" "$TARGET"
launchctl enable "$DOMAIN/org.southbaytoday.events-refresh"
launchctl print "$DOMAIN/org.southbaytoday.events-refresh" | grep -E 'state =|runs =|last exit code'

echo "Installed org.southbaytoday.events-refresh (daily 19:15 with 20:45 retry)."
echo "Force now: /opt/homebrew/bin/node $REPO/scripts/events/scheduled-refresh.mjs --force"
