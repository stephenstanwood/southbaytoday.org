/**
 * One-shot: add (or upsert) a row in the prod tracker.
 *
 * Usage:
 *   node scripts/lookout/add-tracker-row.mjs <id>
 *
 * Reads the entry from scripts/lookout/targets.json and writes a tracker
 * row with status `signup-posted` (i.e. signed up, awaiting first email).
 * Idempotent — if a row with the id already exists, it just flips status.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { upsertTarget, sql } from "./_tracker-pg.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const id = process.argv[2];
if (!id) {
  console.error("usage: node scripts/lookout/add-tracker-row.mjs <id>");
  process.exit(1);
}

const targetsPath = join(__dirname, "targets.json");
const { targets } = JSON.parse(readFileSync(targetsPath, "utf8"));
const target = targets.find((t) => t.id === id);
if (!target) {
  console.error(`target not found in targets.json: ${id}`);
  process.exit(1);
}

const tomb = await sql`SELECT 1 FROM newsletter_targets WHERE id = ${id} AND is_deleted = TRUE`;
if (tomb.length > 0) {
  console.error(`refusing to add tombstoned target: ${id}. Un-tombstone it in Postgres first.`);
  process.exit(1);
}

await upsertTarget({
  ...target,
  status: "signup-posted",
  attemptedAt: new Date().toISOString(),
});

const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM newsletter_targets WHERE NOT is_deleted`;
console.log(`upserted ${id} → signup-posted. tracker now has ${count} live targets.`);
