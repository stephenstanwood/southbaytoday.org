/**
 * OBSOLETE — kept as a no-op so any cron / docs that still reference it
 * don't crash.
 *
 * The original purpose was to replay per-entry audit blobs (lookout/tracker-audit/*)
 * onto the wiped main tracker blob. The tracker has since moved to Neon
 * Postgres (see scripts/lookout/_tracker-pg.mjs + src/lib/lookout/tracker.ts),
 * which writes its own audit log inline as part of every status mutation —
 * the recovery scenario this script existed for can no longer happen.
 */

console.log("replay-audit.mjs is obsolete. Tracker is on Postgres; audit log is in tracker_audit table.");
console.log("Run `psql $DATABASE_URL -c 'SELECT * FROM tracker_audit ORDER BY at DESC LIMIT 50'` to inspect.");
