// ---------------------------------------------------------------------------
// decisionLog — structured, one-line-per-event JSON log for social pipeline
// decisions (pick, drop, autofix, flag, pad, swap).
//
// Writes to ~/Library/Logs/social-pipeline-decisions.log on the Mini so Stephen
// can grep "FatCats" and see why it was picked or why it was dropped.
//
// Failures are silent — logging must never break the pipeline.
// ---------------------------------------------------------------------------

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

// Override with DECISION_LOG_PATH env var for tests / alt machines.
const LOG_PATH = process.env.DECISION_LOG_PATH
  || join(homedir(), "Library", "Logs", "social-pipeline-decisions.log");

let dirEnsured = false;
function ensureDir() {
  if (dirEnsured) return;
  try {
    const dir = dirname(LOG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    dirEnsured = true;
  } catch {
    // If we can't create the dir, swallow and give up for this process.
    dirEnsured = true;
  }
}

/**
 * Append one decision to the log. All fields go into the JSON line verbatim,
 * plus timestamp + pid. Silent on failure.
 *
 * Recommended fields:
 *   - script:  "plan-day" | "generate-schedule" | "post-gen-review" | "surgery" | ...
 *   - action:  "picked" | "dropped" | "padded" | "flagged" | "autofixed" | "swapped" | "skipped"
 *   - target:  name + id of the thing being decided about (e.g. "FatCats (place:ChIJ...)")
 *   - reason:  one-line human-readable explanation
 *   - meta:    optional free-form object (date, slotType, poolRank, etc.)
 */
export function logDecision({ script, action, target, reason, meta } = {}) {
  try {
    ensureDir();
    const entry = {
      t: new Date().toISOString(),
      pid: process.pid,
      script: script || "unknown",
      action: action || "unknown",
      target: target || "",
      reason: reason || "",
      ...(meta ? { meta } : {}),
    };
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // Never let logging break a pipeline run.
  }
}

export { LOG_PATH };
