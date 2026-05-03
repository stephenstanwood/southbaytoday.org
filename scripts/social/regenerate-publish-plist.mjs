#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Regenerate org.southbaytoday.publish.plist with today's randomized fire
// times within ±60 min of the three anchor slots:
//
//   anchor 07:15 PT  →  day-plan
//   anchor 11:45 PT  →  tonight-pick
//   anchor 16:30 PT  →  wildcard
//
// Each anchor's fire time is independently jittered uniformly in [-60, +60]
// minutes. The publisher's currentPublishSlot() resolves any time within
// ±60 min of an anchor back to the right slot type, so the schedule still
// gets matched correctly regardless of the exact fire minute.
//
// Runs daily via org.southbaytoday.publish-jitter (5:00 AM PT). The 5 AM
// firing finishes well before the earliest possible day-plan fire (06:15).
//
// Side effect: launchctl bootout + bootstrap to apply the new plist.
// ---------------------------------------------------------------------------

import { writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const ANCHORS = [
  { type: "day-plan",     hour: 7,  minute: 15 },
  { type: "tonight-pick", hour: 11, minute: 45 },
  { type: "wildcard",     hour: 16, minute: 30 },
];
const JITTER_MIN = 60;

function jitter(anchorHour, anchorMin) {
  const total = anchorHour * 60 + anchorMin;
  const offset = Math.floor(Math.random() * (JITTER_MIN * 2 + 1)) - JITTER_MIN;
  const t = total + offset;
  return { hour: Math.floor(t / 60), minute: t % 60 };
}

const fires = ANCHORS.map((a) => ({ ...a, ...jitter(a.hour, a.minute) }));

const calendarEntries = fires
  .map((f) => `    <dict><key>Hour</key><integer>${f.hour}</integer><key>Minute</key><integer>${f.minute}</integer></dict>`)
  .join("\n");

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>org.southbaytoday.publish</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>--env-file=.env.local</string>
    <string>scripts/social/publish-from-queue.mjs</string>
    <string>--max</string>
    <string>1</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/stephenstanwood/Projects/southbaytoday.org</string>
  <!-- Anchors: 07:15 day-plan, 11:45 tonight-pick, 16:30 wildcard -->
  <!-- Fire times jittered ±60 min daily by regenerate-publish-plist.mjs -->
  <key>StartCalendarInterval</key>
  <array>
${calendarEntries}
  </array>
  <key>StandardOutPath</key>
  <string>/tmp/sbs-publish.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/sbs-publish.log</string>
</dict>
</plist>
`;

const dryRun = process.argv.includes("--dry-run");
const label = "org.southbaytoday.publish";
const plistPath = path.join(os.homedir(), "Library/LaunchAgents", `${label}.plist`);

const stamp = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
const lines = [`[${stamp}] ${dryRun ? "[dry-run] " : ""}publish plist fire times:`];
for (const f of fires) {
  const hh = String(f.hour).padStart(2, "0");
  const mm = String(f.minute).padStart(2, "0");
  lines.push(`  ${f.type.padEnd(13)} ${hh}:${mm}`);
}
const summary = lines.join("\n");
console.log(summary);

if (dryRun) {
  console.log("\n--- plist content ---\n" + plist);
  process.exit(0);
}

await writeFile(plistPath, plist);

const uid = process.getuid();
try {
  execSync(`launchctl bootout gui/${uid}/${label}`, { stdio: "ignore" });
} catch {
  // Wasn't loaded — that's fine.
}
execSync(`launchctl bootstrap gui/${uid} ${plistPath}`, { stdio: "inherit" });

// Append to a log so we can audit how the times trend over time.
const logDir = path.join(os.homedir(), ".sbs-logs");
await mkdir(logDir, { recursive: true });
const logPath = path.join(logDir, "publish-jitter.log");
const { appendFile } = await import("node:fs/promises");
await appendFile(logPath, summary + "\n");
