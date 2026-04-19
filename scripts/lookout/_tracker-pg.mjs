/**
 * Postgres-backed tracker helpers for standalone .mjs scripts.
 *
 * Mirrors the public API of src/lib/lookout/tracker.ts so the subscribe /
 * resync / replay scripts can swap their old @vercel/blob helpers for
 * `import { readTracker, writeTracker, upsertTarget, markDeleted } from
 * "./_tracker-pg.mjs"` with minimal other changes.
 *
 * The blob document the old scripts produced is gone — the source of
 * truth is now `newsletter_targets` + `tracker_audit` in Neon.
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Env loading ─────────────────────────────────────────────────────────────
// Node 24 has process.loadEnvFile, but be defensive in case scripts are
// invoked under an older binary on the Mini.
const envPath = join(__dirname, "..", "..", ".env.local");
if (existsSync(envPath)) {
  if (typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(envPath); } catch { /* ignore */ }
  }
  // Always also do a manual pass — loadEnvFile won't override already-set
  // vars and skips lines it can't parse, but the manual pass is a safety
  // net for whatever shape .env.local is in.
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const DB_URL =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;
if (!DB_URL) {
  throw new Error(
    "DATABASE_URL not set. Run `vercel env pull` or set DATABASE_URL in .env.local."
  );
}

const sql = neon(DB_URL);

// ── Row mapping ─────────────────────────────────────────────────────────────

function rowToTarget(r) {
  const t = {
    id: r.id,
    name: r.name,
    signupUrl: r.signup_url,
    category: r.category,
    provider: r.provider,
    priority: r.priority,
    status: r.status,
    receivedCount: r.received_count ?? 0,
    seenFromAddresses: r.seen_from_addresses ?? [],
    seenFromDomains: r.seen_from_domains ?? [],
  };
  if (r.city) t.city = r.city;
  if (r.notes) t.notes = r.notes;
  if (r.attempted_at) t.attemptedAt = r.attempted_at;
  if (r.confirmed_at) t.confirmedAt = r.confirmed_at;
  if (r.last_received_at) t.lastReceivedAt = r.last_received_at;
  if (r.seen_message_ids?.length) t.seenMessageIds = r.seen_message_ids;
  if (r.last_error) t.lastError = r.last_error;
  return t;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function readTracker() {
  const rows = await sql`
    SELECT id, name, signup_url, city, category, provider, priority, notes,
           status, attempted_at, confirmed_at, last_received_at,
           received_count, seen_from_addresses, seen_from_domains,
           seen_message_ids, last_error
    FROM newsletter_targets
    WHERE is_deleted = FALSE
    ORDER BY category, name
  `;
  const deletedRows = await sql`
    SELECT id FROM newsletter_targets WHERE is_deleted = TRUE
  `;
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    targets: rows.map(rowToTarget),
    deletedIds: deletedRows.map((r) => r.id),
  };
}

/**
 * Bulk write — upserts every target and applies deletedIds as soft-delete.
 * Provided for back-compat with scripts that still mutate a whole-doc.
 * For one-row updates prefer upsertTarget()/setTargetStatus()/markDeleted().
 */
export async function writeTracker(doc) {
  const targets = doc.targets ?? [];
  for (const t of targets) {
    await upsertTarget(t);
  }
  const deletedIds = doc.deletedIds ?? [];
  if (deletedIds.length > 0) {
    await sql`
      UPDATE newsletter_targets
      SET is_deleted = TRUE,
          deleted_at = COALESCE(deleted_at, now()),
          updated_at = now()
      WHERE id = ANY(${deletedIds}) AND is_deleted = FALSE
    `;
  }
}

/**
 * Upsert a single target. Refuses to resurrect tombstoned rows.
 */
export async function upsertTarget(t) {
  const tomb = await sql`
    SELECT 1 FROM newsletter_targets WHERE id = ${t.id} AND is_deleted = TRUE
  `;
  if (tomb.length > 0) return;

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
      attempted_at = COALESCE(EXCLUDED.attempted_at, newsletter_targets.attempted_at),
      confirmed_at = COALESCE(EXCLUDED.confirmed_at, newsletter_targets.confirmed_at),
      last_received_at = COALESCE(EXCLUDED.last_received_at, newsletter_targets.last_received_at),
      received_count = GREATEST(EXCLUDED.received_count, newsletter_targets.received_count),
      seen_from_addresses = EXCLUDED.seen_from_addresses,
      seen_from_domains = EXCLUDED.seen_from_domains,
      seen_message_ids = EXCLUDED.seen_message_ids,
      last_error = EXCLUDED.last_error,
      updated_at = now()
  `;
}

/**
 * Granular status change. Single UPDATE, no race window.
 */
export async function setTargetStatus(id, status) {
  const at = new Date().toISOString();
  const rows = await sql`
    WITH old AS (
      SELECT status FROM newsletter_targets WHERE id = ${id} AND is_deleted = FALSE
    )
    UPDATE newsletter_targets t
    SET status = ${status},
        attempted_at = ${at},
        updated_at = now()
    FROM old
    WHERE t.id = ${id} AND t.is_deleted = FALSE
    RETURNING old.status AS prior_status
  `;
  if (rows.length === 0) return { updated: false };
  const fromStatus = rows[0].prior_status;
  await sql`
    INSERT INTO tracker_audit (action, target_id, from_status, to_status)
    VALUES ('status-change', ${id}, ${fromStatus}, ${status})
  `;
  return { updated: true, fromStatus };
}

export async function markDeleted(id) {
  const prior = await sql`
    SELECT status FROM newsletter_targets WHERE id = ${id} AND is_deleted = FALSE
  `;
  await sql`
    UPDATE newsletter_targets
    SET is_deleted = TRUE, deleted_at = now(), updated_at = now()
    WHERE id = ${id}
  `;
  await sql`
    INSERT INTO tracker_audit (action, target_id, from_status)
    VALUES ('delete', ${id}, ${prior[0]?.status ?? null})
  `;
}

/**
 * Append a custom audit entry. Most callers don't need this — the
 * mutations above log their own entries inline.
 */
export async function writeAuditEntry(entry) {
  await sql`
    INSERT INTO tracker_audit (at, action, target_id, from_status, to_status, details)
    VALUES (
      ${entry.at ?? new Date().toISOString()},
      ${entry.action},
      ${entry.id ?? entry.targetId},
      ${entry.fromStatus ?? null},
      ${entry.toStatus ?? null},
      ${entry.details ?? null}
    )
  `;
}

/**
 * Escape hatch for scripts that want to run their own SQL.
 */
export { sql };
