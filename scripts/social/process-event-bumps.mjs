#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Today — Event Bump Processor
//
// Runs every 15 min via launchd on the Mac Mini. Reads the pending-bump
// queue, fires any bumps whose trigger time has passed, removes successes,
// drops stale entries (queued > 24h ago).
//
// Idempotency: bumps are removed from the queue ONLY after a fire attempt;
// the queue file is the source of truth. If a platform fails we log and
// drop the entry anyway — reach is time-sensitive, retrying a stale bump
// next cycle would post it visibly late.
//
// Usage: node scripts/social/process-event-bumps.mjs [--verbose]
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { processBumps } from "./lib/event-bumps.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
try {
  const lines = readFileSync(join(__dirname, "..", "..", ".env.local"), "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const verbose = process.argv.includes("--verbose");
const log = (msg) => {
  if (verbose) console.log(msg);
};

async function main() {
  const result = await processBumps({ logFn: log });
  // Only emit a top-line message when there's something to report; silent
  // otherwise so the launchd stdout doesn't fill with no-op noise.
  if (result.fired > 0 || result.removed > 0) {
    console.log(
      `[event-bumps] fired=${result.fired} removed_stale=${result.removed} kept=${result.kept} @ ${new Date().toISOString()}`
    );
  } else if (verbose) {
    console.log(`[event-bumps] no due bumps (kept=${result.kept})`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
