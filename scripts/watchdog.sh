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

# Max age thresholds (in minutes) for known SBS processes
# If a matching process has been running longer than this, it's likely hung
declare -A THRESHOLDS=(
  ["publish-from-queue"]="10"
  ["queue-monitor"]="15"
  ["reply-monitor"]="10"
  ["generate-posts"]="20"
  ["generate-events"]="15"
  ["generate-digests"]="30"
  ["generate-around-town"]="15"
  ["generate-restaurant-radar"]="10"
  ["generate-sv-history"]="10"
  ["generate-restaurant-openings"]="10"
  ["copy-review-server"]="0"   # 0 = skip (always running)
  ["threads-refresh"]="5"
  ["collect-metrics"]="10"
)

HUNG_PROCESSES=()

for pattern in "${!THRESHOLDS[@]}"; do
  max_minutes="${THRESHOLDS[$pattern]}"

  # Skip always-on processes
  if [ "$max_minutes" -eq 0 ]; then
    continue
  fi

  # Find matching node processes and their elapsed time
  # ps etime format: [[dd-]hh:]mm:ss
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    pid=$(echo "$line" | awk '{print $1}')
    etime=$(echo "$line" | awk '{print $2}')

    # Parse elapsed time to minutes
    days=0; hours=0; mins=0
    if [[ "$etime" == *-* ]]; then
      days="${etime%%-*}"
      etime="${etime#*-}"
    fi
    # Now etime is [hh:]mm:ss
    IFS=':' read -ra parts <<< "$etime"
    if [ ${#parts[@]} -eq 3 ]; then
      hours="${parts[0]}"
      mins="${parts[1]}"
    elif [ ${#parts[@]} -eq 2 ]; then
      mins="${parts[0]}"
    fi
    total_mins=$(( days * 1440 + hours * 60 + mins ))

    if [ "$total_mins" -gt "$max_minutes" ]; then
      HUNG_PROCESSES+=("**${pattern}** (PID ${pid}) — running ${total_mins}min, expected <${max_minutes}min")
    fi
  done < <(ps -eo pid,etime,command | grep "node.*${pattern}" | grep -v grep | awk '{print $1, $2}')
done

# Also check for macOS system popups that might be blocking
POPUP_PROCS=()
for popup in "Software Update" "UserNotificationCenter" "SecurityAgent" "CoreServicesUIAgent"; do
  if pgrep -f "$popup" > /dev/null 2>&1; then
    POPUP_PROCS+=("$popup")
  fi
done

# Send alert if anything is hung
if [ ${#HUNG_PROCESSES[@]} -gt 0 ] || [ ${#POPUP_PROCS[@]} -gt 0 ]; then
  MSG="⚠️ **Mac Mini Watchdog Alert**\n"

  if [ ${#HUNG_PROCESSES[@]} -gt 0 ]; then
    MSG+="🔴 **Hung SBS processes:**\n"
    for proc in "${HUNG_PROCESSES[@]}"; do
      MSG+="• ${proc}\n"
    done
  fi

  if [ ${#POPUP_PROCS[@]} -gt 0 ]; then
    MSG+="🟡 **System popups detected:**\n"
    for popup in "${POPUP_PROCS[@]}"; do
      MSG+="• ${popup}\n"
    done
  fi

  MSG+="📱 Screen share in to check."

  curl -s -X POST "$DISCORD_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$(echo -e "$MSG")\"}" > /dev/null

  echo "Alert sent: ${#HUNG_PROCESSES[@]} hung process(es), ${#POPUP_PROCS[@]} popup(s)"
else
  echo "$(date '+%Y-%m-%d %H:%M') — all clear"
fi
