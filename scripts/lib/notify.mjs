import { queueNotification } from "./notification-intake.mjs";
// Direct Discord cat-signal alerts from generator scripts.
//
// Use case: a script gets a hard error mid-run (API out of credits, hard 401, etc.)
// but recovers via cache/fallback so the run "succeeds" overall. The downstream
// Stop hook never sees a failure and Stephen doesn't get DM'd. This helper
// pings #tasks directly so the failure isn't silent.
//
// Per-key cooldown via /tmp so a noisy run only fires one DM. Best-effort —
// never throws, never blocks the caller.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { writeFileAtomic } from "./io.mjs";

const COOLDOWN_MIN = 60;

function cooldownFile(key) {
  const safe = key.replace(/[^a-z0-9-]/gi, "_");
  return join(tmpdir(), `sbt-notify-${safe}.ts`);
}

function inCooldown(key) {
  try {
    const f = cooldownFile(key);
    if (!existsSync(f)) return false;
    const last = parseInt(readFileSync(f, "utf8"), 10) || 0;
    return (Date.now() - last) / 60000 < COOLDOWN_MIN;
  } catch {
    return false;
  }
}

function stampCooldown(key) {
  try { writeFileAtomic(cooldownFile(key), String(Date.now())); } catch {}
}

/** Ping target for alert embeds. Unset means the embed posts without a ping. */


/**
 * Fire a red Discord DM. Returns immediately if cooldown active or no webhook.
 *
 * @param {object} opts
 * @param {string} opts.key   - Cooldown key (e.g. "recraft-credits"). One DM per key per hour.
 * @param {string} opts.title - Short bold title.
 * @param {string} opts.body  - Plain body. Markdown OK.
 */
export async function catSignal({ key, title, body }) {
  if (inCooldown(key)) return;
  try {
    await queueNotification(`${title}\n${body}`, { producer: `southbaytoday-${key}` });
    stampCooldown(key);
  } catch (error) {
    console.error(`[cat-signal] intake failed; source retained: ${error.message}`);
  }
}
