#!/bin/bash
set -euo pipefail

REPO="/Users/stephenstanwood/Projects/southbaytoday.org"
DOMAIN="gui/$(id -u)"
MODE="${1:-all}"

install_agent() {
  local label="$1"
  local source="$2"
  local target="/Users/stephenstanwood/Library/LaunchAgents/${label}.plist"
  local loaded=0

  if [[ ! -f "$source" ]]; then
    echo "missing $source" >&2
    exit 1
  fi

  plutil -lint "$source"
  if launchctl print "$DOMAIN/$label" >/dev/null 2>&1; then
    loaded=1
  fi

  if [[ ! -f "$target" ]] || ! cmp -s "$source" "$target"; then
    if [[ "$loaded" -eq 1 ]]; then
      launchctl bootout "$DOMAIN/$label"
    fi
    cp "$source" "$target"
    launchctl bootstrap "$DOMAIN" "$target"
  elif [[ "$loaded" -eq 0 ]]; then
    launchctl bootstrap "$DOMAIN" "$target"
  fi

  launchctl enable "$DOMAIN/$label"
  launchctl print "$DOMAIN/$label" | grep -E 'state =|runs =|last exit code' || true
}

case "$MODE" in
  all)
    install_agent \
      "org.southbaytoday.events-refresh" \
      "$REPO/scripts/events/events-refresh.plist"
    install_agent \
      "org.southbaytoday.events-refresh-watchdog" \
      "$REPO/scripts/events/events-refresh-watchdog.plist"
    ;;
  --refresh-only)
    install_agent \
      "org.southbaytoday.events-refresh" \
      "$REPO/scripts/events/events-refresh.plist"
    ;;
  --watchdog-only)
    install_agent \
      "org.southbaytoday.events-refresh-watchdog" \
      "$REPO/scripts/events/events-refresh-watchdog.plist"
    ;;
  *)
    echo "usage: $0 [--refresh-only|--watchdog-only]" >&2
    exit 2
    ;;
esac

echo "Verified SBT event refresh agents ($MODE)."
echo "Primary: daily 19:15 with 20:45 retry. Watchdog: every 3 hours."
echo "Force now: /opt/homebrew/bin/node $REPO/scripts/events/scheduled-refresh.mjs --force"
