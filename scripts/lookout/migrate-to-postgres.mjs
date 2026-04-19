/**
 * One-shot: apply Postgres schema, then backfill the newsletter tracker
 * from the current Vercel Blob document.
 *
 * Usage:
 *   node scripts/lookout/migrate-to-postgres.mjs
 *
 * Idempotent — running twice does no harm. CREATE TABLE IF NOT EXISTS,
 * INSERT ... ON CONFLICT DO UPDATE.
 */

import { neon } from "@neondatabase/serverless";
import { head } from "@vercel/blob";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = join(__dirname, "..", "..");
process.loadEnvFile(join(repoRoot, ".env.local"));

const DB_URL =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set. Run `vercel env pull` first.");
  process.exit(1);
}
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN not set in .env.local.");
  process.exit(1);
}

const sql = neon(DB_URL);
const TRACKER_BLOB_KEY = "lookout/newsletter-tracker.json";

// ── 1. Apply schema ─────────────────────────────────────────────────────────
console.log("applying schema...");
const schemaSql = readFileSync(
  join(__dirname, "migrations", "001_init.sql"),
  "utf-8"
);
// Strip line-comments first, then split on `;` at end of line.
const stripped = schemaSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const statements = stripped
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
for (const stmt of statements) {
  await sql.query(stmt);
}
console.log(`  applied ${statements.length} statements`);

// ── 2. Read current blob ────────────────────────────────────────────────────
console.log("\nreading blob tracker...");
const meta = await head(TRACKER_BLOB_KEY, { token: BLOB_TOKEN });
const res = await fetch(meta.url + `?_cb=${Date.now()}`, { cache: "no-store" });
if (!res.ok) {
  console.error(`failed to fetch blob: ${res.status}`);
  process.exit(1);
}
const doc = JSON.parse(await res.text());
console.log(`  ${doc.targets.length} active targets, ${(doc.deletedIds ?? []).length} tombstones`);

// ── 3. Insert / upsert each target ──────────────────────────────────────────
console.log("\nupserting targets...");
let upserted = 0;
for (const t of doc.targets) {
  await sql`
    INSERT INTO newsletter_targets (
      id, name, signup_url, city, category, provider, priority, notes,
      status, attempted_at, confirmed_at, last_received_at, received_count,
      seen_from_addresses, seen_from_domains, seen_message_ids, last_error,
      updated_at
    ) VALUES (
      ${t.id}, ${t.name}, ${t.signupUrl}, ${t.city ?? null}, ${t.category},
      ${t.provider}, ${t.priority}, ${t.notes ?? null},
      ${t.status}, ${t.attemptedAt ?? null}, ${t.confirmedAt ?? null},
      ${t.lastReceivedAt ?? null}, ${t.receivedCount ?? 0},
      ${t.seenFromAddresses ?? []}, ${t.seenFromDomains ?? []},
      ${t.seenMessageIds ?? []}, ${t.lastError ?? null},
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      signup_url = EXCLUDED.signup_url,
      city = EXCLUDED.city,
      category = EXCLUDED.category,
      provider = EXCLUDED.provider,
      priority = EXCLUDED.priority,
      notes = EXCLUDED.notes,
      status = EXCLUDED.status,
      attempted_at = EXCLUDED.attempted_at,
      confirmed_at = EXCLUDED.confirmed_at,
      last_received_at = EXCLUDED.last_received_at,
      received_count = EXCLUDED.received_count,
      seen_from_addresses = EXCLUDED.seen_from_addresses,
      seen_from_domains = EXCLUDED.seen_from_domains,
      seen_message_ids = EXCLUDED.seen_message_ids,
      last_error = EXCLUDED.last_error,
      is_deleted = FALSE,
      deleted_at = NULL,
      updated_at = now()
  `;
  upserted++;
}
console.log(`  upserted ${upserted} target rows`);

// ── 4. Apply tombstones ─────────────────────────────────────────────────────
console.log("\napplying tombstones...");
const deletedIds = doc.deletedIds ?? [];
let tombstoned = 0;

// Look up local targets.json to backfill metadata for tombstoned ids that
// were never written into the blob's targets array (e.g. deleted before
// migration).
let localCatalog = [];
const catalogPath = join(__dirname, "targets.json");
if (existsSync(catalogPath)) {
  try {
    const parsed = JSON.parse(readFileSync(catalogPath, "utf-8"));
    localCatalog = Array.isArray(parsed) ? parsed : (parsed.targets ?? []);
  } catch { /* ignore */ }
}
const catalogById = new Map(localCatalog.map((c) => [c.id, c]));

for (const id of deletedIds) {
  // First make sure a row exists for this id, then mark it deleted.
  const meta = catalogById.get(id);
  if (meta) {
    await sql`
      INSERT INTO newsletter_targets (
        id, name, signup_url, city, category, provider, priority, notes, status
      ) VALUES (
        ${meta.id}, ${meta.name}, ${meta.signupUrl}, ${meta.city ?? null},
        ${meta.category}, ${meta.provider}, ${meta.priority}, ${meta.notes ?? null},
        ${meta.status ?? "not-attempted"}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  } else {
    // No catalog metadata — insert a minimal stub so the tombstone has a row
    // to attach to.
    await sql`
      INSERT INTO newsletter_targets (
        id, name, signup_url, category, provider, priority, status
      ) VALUES (
        ${id}, ${id}, '', 'other', 'unknown', 3, 'blocked'
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
  await sql`
    UPDATE newsletter_targets
    SET is_deleted = TRUE,
        deleted_at = COALESCE(deleted_at, now()),
        updated_at = now()
    WHERE id = ${id}
  `;
  tombstoned++;
}
console.log(`  tombstoned ${tombstoned} ids`);

// ── 5. Verify ───────────────────────────────────────────────────────────────
const counts = await sql`
  SELECT
    COUNT(*) FILTER (WHERE NOT is_deleted) AS live,
    COUNT(*) FILTER (WHERE is_deleted) AS deleted,
    COUNT(*) FILTER (WHERE NOT is_deleted AND status = 'receiving') AS receiving,
    COUNT(*) FILTER (WHERE NOT is_deleted AND status IN ('signup-posted','confirmed')) AS signed_up,
    COUNT(*) FILTER (WHERE NOT is_deleted AND status IN ('not-attempted','needs-manual')) AS ready
  FROM newsletter_targets
`;
const c = counts[0];
console.log("\nverification:");
console.log(`  live=${c.live}  deleted=${c.deleted}`);
console.log(`  receiving=${c.receiving}  signed-up=${c.signed_up}  ready=${c.ready}`);
console.log("\ndone.");
