#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_REPO_ROOT, pushGeneratedDataCheckout } from "../newsletter/scheduled-preflight.mjs";
import { inspectEventRefreshOutput } from "./event-refresh-health.mjs";

// The workflow has already committed its generated data. The publisher preserves
// remote commits and their side of a generated conflict, then rechecks health
// before each push.
export function publishEventRefresh({
  repoRoot = DEFAULT_REPO_ROOT,
  log = console.log,
  snapshotMaxAgeHours = 8,
  requiredSnapshotNames,
  regenerateAfterOverlap,
} = {}) {
  const outputPath = join(repoRoot, "src/data/south-bay/upcoming-events.json");
  const originalOutput = regenerateAfterOverlap ? readFileSync(outputPath, "utf8") : null;
  let overlappingHead;

  function inspect(output) {
    return inspectEventRefreshOutput({
      data: JSON.parse(output), maxAgeHours: 1, snapshotMaxAgeHours, requiredSnapshotNames,
    });
  }

  function publish() {
    return pushGeneratedDataCheckout({
      repoRoot,
      log,
      verify({ state, originHead }) {
        const output = readFileSync(outputPath, "utf8");
        const health = inspect(output);
        if (!health.ok) {
          if (state === "merged-remote-with-local-data"
            && originalOutput !== null && output !== originalOutput && inspect(originalOutput).ok) {
            overlappingHead = originHead;
          }
          throw new Error(`event publication blocked: ${health.problems.join("; ")}`);
        }
        log(`[events-publication] healthy: ${health.eventCount} events across ${health.sourceCount} adapters`);
      },
    });
  }

  try {
    return publish();
  } catch (error) {
    if (!overlappingHead) throw error;
    log(`[events-publication] merge replaced healthy output (${error.message}); regenerating once from the merged checkout`);
    regenerateAfterOverlap(overlappingHead);
    return publish();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { publishEventRefresh(); } catch (error) {
    console.error(`[events-publication] ${error.message}`);
    process.exitCode = 1;
  }
}
