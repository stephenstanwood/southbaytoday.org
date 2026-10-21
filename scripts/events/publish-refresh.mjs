#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_REPO_ROOT, pushGeneratedDataCheckout } from "../newsletter/scheduled-preflight.mjs";
import { inspectEventRefreshOutput } from "./event-refresh-health.mjs";

// The workflow has already committed its generated data. Reuse the bounded
// publisher: it preserves remote commits, takes the remote version of any
// conflicting generated file, and never force-pushes. Recheck health AFTER
// every merge so remote overlap cannot bypass the original publication gate.
export function publishEventRefresh({ repoRoot = DEFAULT_REPO_ROOT, log = console.log, snapshotMaxAgeHours = 8 } = {}) {
  return pushGeneratedDataCheckout({
    repoRoot,
    log,
    verify() {
      const data = JSON.parse(readFileSync(join(repoRoot, "src/data/south-bay/upcoming-events.json"), "utf8"));
      const health = inspectEventRefreshOutput({ data, maxAgeHours: 1, snapshotMaxAgeHours });
      if (!health.ok) throw new Error(`event publication blocked: ${health.problems.join("; ")}`);
      log(`[events-publication] healthy: ${health.eventCount} events across ${health.sourceCount} adapters`);
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { publishEventRefresh(); } catch (error) {
    console.error(`[events-publication] ${error.message}`);
    process.exitCode = 1;
  }
}
