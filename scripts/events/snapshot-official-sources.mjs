#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { fetchLosAltosHistoryEvents, fetchSjJazzEvents } from "../generate-events.mjs";
import { ARTIFACTS } from "../lib/paths.mjs";
import { writeJsonAtomic } from "../lib/io.mjs";
import { inspectOfficialEventSnapshot, OFFICIAL_SNAPSHOT_SOURCES } from "../lib/official-event-snapshot.mjs";

export async function snapshotOfficialSources({
  outputPath = ARTIFACTS.officialEventSources,
  adapters = { fetchLosAltosHistoryEvents, fetchSjJazzEvents },
} = {}) {
  const sources = {};
  // Keep host requests sequential. A failed adapter leaves the prior complete
  // snapshot untouched; it must never acquire a fresh timestamp on old data.
  for (const [id, definition] of Object.entries(OFFICIAL_SNAPSHOT_SOURCES)) {
    const events = await adapters[id]({ live: true });
    sources[id] = { status: "ok", sourceUrl: definition.url, observedAt: new Date().toISOString(), events };
  }
  const snapshot = { version: 1, generatedAt: new Date().toISOString(), sources };
  inspectOfficialEventSnapshot(snapshot);
  writeJsonAtomic(outputPath, snapshot);
  console.log(`Verified official source snapshot → ${outputPath}`);
  return snapshot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  snapshotOfficialSources().catch((error) => { console.error(error); process.exitCode = 1; });
}
