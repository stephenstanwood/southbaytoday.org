/**
 * Seed any missing targets from targets.json into Postgres.
 *
 * Tombstoned ids are preserved (the helper refuses to resurrect them).
 * Rows that already exist are left untouched — this is additive only, no
 * status downgrades.
 *
 * After running this, you can run scripts/lookout/resync-from-resend.mjs to
 * recover "receiving" status from Resend's inbox history.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readTracker, upsertTarget } from "./_tracker-pg.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const targetsPath = join(__dirname, "targets.json");
const { targets } = JSON.parse(readFileSync(targetsPath, "utf8"));

const doc = await readTracker();
const tombstoned = new Set(doc.deletedIds ?? []);
const existingIds = new Set(doc.targets.map((t) => t.id));

console.log(`current: ${doc.targets.length} live targets, ${tombstoned.size} tombstones`);
console.log(`targets.json: ${targets.length} rows`);

let inserted = 0;
let skippedTomb = 0;
let skippedExisting = 0;

for (const t of targets) {
  if (tombstoned.has(t.id)) { skippedTomb++; continue; }
  if (existingIds.has(t.id)) { skippedExisting++; continue; }
  await upsertTarget({
    id: t.id,
    name: t.name,
    signupUrl: t.signupUrl,
    city: t.city,
    category: t.category,
    provider: t.provider,
    priority: t.priority,
    notes: t.notes,
    status: "not-attempted",
    receivedCount: 0,
    seenFromAddresses: [],
    seenFromDomains: [],
  });
  inserted++;
}

console.log(`inserted: ${inserted}`);
console.log(`skipped (tombstoned): ${skippedTomb}`);
console.log(`skipped (already present): ${skippedExisting}`);
