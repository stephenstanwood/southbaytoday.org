#!/bin/bash
# ---------------------------------------------------------------------------
# South Bay Signal — Hung Process Watchdog
# Checks for SBS launchd processes stuck longer than expected.
# Sends a Discord DM when detected so Stephen can screen share and fix.
#
# Install as launchd agent on Mac Mini:
#   cp scripts/watchdog.plist ~/Library/LaunchAgents/org.southbaysignal.watchdog.plist
#   launchctl load ~/Library/LaunchAgents/org.southbaysignal.watchdog.plist
#
# Runs every 15 minutes.
# ---------------------------------------------------------------------------

set -euo pipefail

# Load env for Discord webhook
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env.local"

if [ -f "$ENV_FILE" ]; then
  DISCORD_WEBHOOK=$(grep '^DISCORD_WEBHOOK=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"'"'")
fi

if [ -z "${DISCORD_WEBHOOK:-}" ]; then
  echo "No DISCORD_WEBHOOK found in .env.local — exiting"
  exit 1
fi

# Process patterns and their max expected runtime in minutes
# Format: "pattern:max_minutes" (0 = skip, always running)
CHECKS="
publish-from-queue:10
queue-monitor:15
reply-monitor:10
generate-posts:20
generate-events:15
generate-digests:30
generate-around-town:15
generate-restaurant-radar:10
generate-sv-history:10
generate-restaurant-openings:10
threads-refresh:5
collect-metrics:10
"

HUNG=""
POPUP=""

# Parse elapsed time string to minutes
# Format: [[dd-]hh:]mm:ss
parse_etime() {
  local etime="$1"
  local days=0 hours=0 mins=0

  if [[ "$etime" == *-* ]]; then
    days="${etime%%-*}"
    etime="${etime#*-}"
  fi

  local IFS=':'
  local parts=($etime)
  if [ ${#parts[@]} -eq 3 ]; then
    hours=$((10#${parts[0]}))
    mins=$((10#${parts[1]}))
  elif [ ${#parts[@]} -eq 2 ]; then
    mins=$((10#${parts[0]}))
  fi

  echo $(( days * 1440 + hours * 60 + mins ))
}

for check in $CHECKS; do
  [ -z "$check" ] && continue
  pattern="${check%%:*}"
  max_minutes="${check##*:}"

  # Find matching node processes and their elapsed time
  ps -eo pid,etime,command 2>/dev/null | grep "node.*${pattern}" | grep -v grep | while IFS= read -r line; do
    [ -z "$line" ] && continue
    pid=$(echo "$line" | awk '{print $1}')
    etime=$(echo "$line" | awk '{print $2}')
    total_mins=$(parse_etime "$etime")

    if [ "$total_mins" -gt "$max_minutes" ]; then
      echo "HUNG:${pattern}:${pid}:${total_mins}:${max_minutes}" >> /tmp/sbs-watchdog-hits.tmp
    fi
  done
done

# Check for macOS system popups that might be blocking
for popup in "Software Update" "UserNotificationCenter" "SecurityAgent" "CoreServicesUIAgent"; do
  if pgrep -f "$popup" > /dev/null 2>&1; then
    POPUP="${POPUP}• ${popup}\n"
  fi
done

# Read hits from temp file
if [ -f /tmp/sbs-watchdog-hits.tmp ]; then
  while IFS= read -r hit; do
    pattern=$(echo "$hit" | cut -d: -f2)
    pid=$(echo "$hit" | cut -d: -f3)
    total=$(echo "$hit" | cut -d: -f4)
    max=$(echo "$hit" | cut -d: -f5)
    HUNG="${HUNG}• **${pattern}** (PID ${pid}) — running ${total}min, expected <${max}min\n"
  done < /tmp/sbs-watchdog-hits.tmp
  rm -f /tmp/sbs-watchdog-hits.tmp
fi

# Send alert if anything is hung
if [ -n "$HUNG" ] || [ -n "$POPUP" ]; then
  MSG="⚠️ **Mac Mini Watchdog Alert**\n"

  if [ -n "$HUNG" ]; then
    MSG+="🔴 **Hung SBS processes:**\n${HUNG}"
  fi

  if [ -n "$POPUP" ]; then
    MSG+="🟡 **System popups detected:**\n${POPUP}"
  fi

  MSG+="📱 Screen share in to check."

  curl -s -X POST "$DISCORD_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$(echo -e "$MSG")\"}" > /dev/null

  echo "Alert sent"
else
  echo "$(date '+%Y-%m-%d %H:%M') — all clear"
fi
