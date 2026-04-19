/**
 * Newsletter subscription tracker — Postgres edition.
 *
 * Tracks the state of every newsletter / mailing list we've tried to
 * subscribe `sandcathype@gmail.com` to. Backed by Neon Postgres
 * (`newsletter_targets` + `tracker_audit`) — the previous Vercel Blob
 * single-document store kept getting wiped by read/modify/write races.
 *
 * Public API kept stable so existing callers (mark/delete/state endpoints,
 * reconcile cron, intake webhook) keep working.
 */

import { sql } from "./db.ts";

// ── Types ───────────────────────────────────────────────────────────────────

export type SubscribeStatus =
  | "not-attempted"
  | "signup-posted"
  | "confirmed"
  | "receiving"
  | "failed"
  | "needs-manual"
  | "retry"
  | "blocked";

export type ProviderType =
  | "civicplus_notifyme"
  | "mailchimp"
  | "constant_contact"
  | "squarespace"
  | "chambermaster"
  | "libraryaware"
  | "generic_html_form"
  | "unknown";

export interface NewsletterTarget {
  id: string;
  name: string;
  signupUrl: string;
  city?: string;
  category:
    | "city"
    | "chamber"
    | "library"
    | "museum"
    | "parks"
    | "arts"
    | "business-district"
    | "school"
    | "transit"
    | "other";
  provider: ProviderType;
  priority: 1 | 2 | 3;
  notes?: string;

  status: SubscribeStatus;
  attemptedAt?: string;
  confirmedAt?: string;
  lastReceivedAt?: string;
  receivedCount: number;
  seenFromAddresses: string[];
  seenFromDomains: string[];
  seenMessageIds?: string[];
  lastError?: string;
}

export interface NewsletterTrackerDoc {
  version: 1;
  updatedAt: string;
  targets: NewsletterTarget[];
  /** Soft-deleted target ids — kept for back-compat with callers that filter on this. */
  deletedIds?: string[];
}

// ── Row mapping ─────────────────────────────────────────────────────────────

interface TargetRow {
  id: string;
  name: string;
  signup_url: string;
  city: string | null;
  category: string;
  provider: string;
  priority: number;
  notes: string | null;
  status: string;
  attempted_at: string | null;
  confirmed_at: string | null;
  last_received_at: string | null;
  received_count: number;
  seen_from_addresses: string[];
  seen_from_domains: string[];
  seen_message_ids: string[];
  last_error: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  updated_at: string;
}

function rowToTarget(r: TargetRow): NewsletterTarget {
  const t: NewsletterTarget = {
    id: r.id,
    name: r.name,
    signupUrl: r.signup_url,
    category: r.category as NewsletterTarget["category"],
    provider: r.provider as ProviderType,
    priority: r.priority as 1 | 2 | 3,
    status: r.status as SubscribeStatus,
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

// ── Public read API ─────────────────────────────────────────────────────────

export async function readTracker(): Promise<NewsletterTrackerDoc> {
  const q = sql();
  const rows = (await q`
    SELECT id, name, signup_url, city, category, provider, priority, notes,
           status, attempted_at, confirmed_at, last_received_at,
           received_count, seen_from_addresses, seen_from_domains,
           seen_message_ids, last_error, is_deleted, deleted_at, updated_at
    FROM newsletter_targets
    WHERE is_deleted = FALSE
    ORDER BY category, name
  `) as TargetRow[];

  const deletedRows = (await q`
    SELECT id FROM newsletter_targets WHERE is_deleted = TRUE
  `) as Array<{ id: string }>;

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    targets: rows.map(rowToTarget),
    deletedIds: deletedRows.map((r) => r.id),
  };
}

// ── Public write API ────────────────────────────────────────────────────────

/**
 * Write a full tracker document. Used by the reconcile cron and other
 * legacy callers that read-mutate-write the whole doc. Each target is
 * upserted; deletedIds become soft-delete flags. Wrapped in a transaction.
 *
 * For simple status changes, prefer `setTargetStatus(id, status)` — it's
 * a single targeted UPDATE with no race window.
 */
export async function writeTracker(doc: NewsletterTrackerDoc): Promise<void> {
  const q = sql();
  const targets = doc.targets ?? [];
  const deletedIds = doc.deletedIds ?? [];

  for (const t of targets) {
    await q`
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
        updated_at = now()
    `;
  }

  if (deletedIds.length > 0) {
    await q`
      UPDATE newsletter_targets
      SET is_deleted = TRUE,
          deleted_at = COALESCE(deleted_at, now()),
          updated_at = now()
      WHERE id = ANY(${deletedIds}) AND is_deleted = FALSE
    `;
  }
}

/**
 * Granular status change. Single UPDATE, no read/modify/write window.
 * Returns true if the row existed and was updated, false otherwise.
 */
export async function setTargetStatus(
  id: string,
  status: SubscribeStatus
): Promise<{ updated: boolean; fromStatus?: SubscribeStatus }> {
  const q = sql();
  const at = new Date().toISOString();
  const rows = (await q`
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
  `) as Array<{ prior_status: string }>;

  if (rows.length === 0) return { updated: false };
  const fromStatus = rows[0].prior_status as SubscribeStatus;

  await q`
    INSERT INTO tracker_audit (action, target_id, from_status, to_status)
    VALUES ('status-change', ${id}, ${fromStatus}, ${status})
  `;

  return { updated: true, fromStatus };
}

// ── Matching ────────────────────────────────────────────────────────────────
// Senders rarely come from the signup domain — they come from the mailing
// platform's infrastructure (ccsend.com, libraryaware.com, list-manage.com,
// etc.) with the org identity embedded in a subdomain or display name.
// Score-based matcher with a high threshold.

function parseFromHeader(raw: string): { address: string; displayName: string; domain: string } {
  if (!raw) return { address: "", displayName: "", domain: "" };
  const trimmed = raw.trim();
  const m = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  const address = (m ? m[2] : trimmed).toLowerCase().trim();
  const displayName = m ? m[1].replace(/^["']|["']$/g, "").trim() : "";
  const domain = address.split("@")[1] ?? "";
  return { address, displayName, domain };
}

function normalizeKey(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const STOPWORDS = new Set([
  "www", "mail", "mailer", "mails", "email", "emails", "news", "newsletter",
  "info", "hello", "contact", "subscribe", "updates", "update", "noreply",
  "donotreply", "bounces", "list", "lists", "campaign", "campaigns", "relay",
  "smtp", "ccsend", "mailchimpapp", "mailgun", "sendgrid", "sparkpost",
  "constantcontact", "hubspot", "klaviyo", "mailjet", "mandrill", "postmark",
  "squarespace", "wix", "civicplus", "opengov", "libraryaware",
  "com", "org", "net", "edu", "gov", "info", "biz", "co",
  "city", "town", "county", "the", "and", "for", "inc",
]);
function tokenize(s: string): string[] {
  return (s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

function senderIdentityFragments(domain: string): string[] {
  const parts = domain.toLowerCase().split(".").filter(Boolean);
  const skip = new Set(["www", "mail", "mailer", "news", "email", "em", "m", "smtp", "relay", "ccsend", "ccsend2", "list-manage", "list", "lt", "campaign", "go", "click", "e"]);
  const filtered = parts.filter((p) => !skip.has(p));
  if (filtered.length > 1) filtered.pop();
  return filtered;
}

interface SenderInfo {
  address: string;
  displayName: string;
  domain: string;
}

function scoreMatch(target: NewsletterTarget, s: SenderInfo): number {
  if ((target.seenFromAddresses ?? []).some((a) => a.toLowerCase() === s.address)) return 1000;
  if (s.domain && (target.seenFromDomains ?? []).some((d) => d.toLowerCase() === s.domain)) return 900;

  if (target.signupUrl) {
    try {
      const host = new URL(target.signupUrl).hostname.toLowerCase().replace(/^www\./, "");
      if (host === s.domain) return 850;
    } catch {
      /* ignore */
    }
  }

  const targetKey = normalizeKey(target.name);
  const targetIdKey = normalizeKey(target.id);

  const fragments = [
    ...senderIdentityFragments(s.domain),
    normalizeKey(s.displayName),
    normalizeKey((s.address.split("@")[0] || "")),
  ].filter((f) => f.length >= 5);

  let best = 0;
  for (const frag of fragments) {
    const fragKey = normalizeKey(frag);
    if (!fragKey) continue;
    if (fragKey === targetKey || fragKey === targetIdKey) best = Math.max(best, 700);
    else if (targetKey.includes(fragKey) || fragKey.includes(targetKey)) best = Math.max(best, 650);
    else if (targetIdKey.includes(fragKey) || fragKey.includes(targetIdKey)) best = Math.max(best, 600);
  }
  if (best > 0) return best;

  const senderTokens = new Set<string>([
    ...tokenize(s.displayName),
    ...tokenize(s.domain),
    ...tokenize(s.address.split("@")[0] || ""),
  ]);
  const targetTokens = new Set<string>([...tokenize(target.name), ...tokenize(target.id)]);
  let overlap = 0;
  for (const t of senderTokens) if (targetTokens.has(t)) overlap++;
  if (overlap >= 2) return 450 + overlap * 20;

  return 0;
}

const MATCH_THRESHOLD = 450;

function findTrackerMatch(targets: NewsletterTarget[], fromEmail: string): NewsletterTarget | null {
  if (!fromEmail) return null;
  const sender = parseFromHeader(fromEmail);
  if (!sender.address) return null;

  let bestScore = 0;
  let best: NewsletterTarget | null = null;
  for (const t of targets) {
    const s = scoreMatch(t, sender);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}

/**
 * Called by the intake webhook when a REAL newsletter email arrives.
 * Bumps lastReceivedAt + receivedCount and auto-promotes the row to
 * "receiving" on first send. Single targeted UPDATE — no read/write race.
 */
export async function noteInboundFromSender(
  fromEmail: string,
  receivedAt: string
): Promise<string | null> {
  const { address, displayName, domain } = parseFromHeader(fromEmail);
  if (!address) return null;

  const doc = await readTracker();
  const match = findTrackerMatch(doc.targets, fromEmail);

  if (!match) {
    console.warn(
      `[tracker] unmatched inbound sender: ${fromEmail} (address=${address}, domain=${domain}, displayName=${JSON.stringify(displayName)})`
    );
    return null;
  }

  const promotable = new Set<SubscribeStatus>([
    "signup-posted",
    "confirmed",
    "needs-manual",
    "retry",
    "not-attempted",
    "failed",
  ]);
  const newStatus = promotable.has(match.status) ? "receiving" : match.status;

  const newAddrs = match.seenFromAddresses.includes(address)
    ? match.seenFromAddresses
    : [...match.seenFromAddresses, address];
  const newDomains = domain && !match.seenFromDomains.includes(domain)
    ? [...match.seenFromDomains, domain]
    : match.seenFromDomains;

  const q = sql();
  await q`
    UPDATE newsletter_targets
    SET last_received_at = ${receivedAt},
        received_count = received_count + 1,
        status = ${newStatus},
        seen_from_addresses = ${newAddrs},
        seen_from_domains = ${newDomains},
        updated_at = now()
    WHERE id = ${match.id} AND is_deleted = FALSE
  `;

  if (newStatus !== match.status) {
    await q`
      INSERT INTO tracker_audit (action, target_id, from_status, to_status)
      VALUES ('status-change', ${match.id}, ${match.status}, ${newStatus})
    `;
  }

  return match.id;
}

/**
 * @deprecated kept as a no-op stub.
 */
export async function noteConfirmationClicked(_fromEmail: string): Promise<string | null> {
  return null;
}

/**
 * Upsert a target row. Used by the subscribe script. Refuses to resurrect
 * rows that have been soft-deleted.
 */
export async function upsertTarget(
  target: Omit<NewsletterTarget, "receivedCount" | "seenFromAddresses" | "seenFromDomains"> & {
    receivedCount?: number;
    seenFromAddresses?: string[];
    seenFromDomains?: string[];
  }
): Promise<void> {
  const q = sql();
  const tombstoned = (await q`
    SELECT 1 FROM newsletter_targets WHERE id = ${target.id} AND is_deleted = TRUE
  `) as Array<unknown>;
  if (tombstoned.length > 0) return;

  await q`
    INSERT INTO newsletter_targets (
      id, name, signup_url, city, category, provider, priority, notes,
      status, attempted_at, confirmed_at, last_received_at, received_count,
      seen_from_addresses, seen_from_domains, last_error, updated_at
    ) VALUES (
      ${target.id}, ${target.name}, ${target.signupUrl}, ${target.city ?? null},
      ${target.category}, ${target.provider}, ${target.priority}, ${target.notes ?? null},
      ${target.status}, ${target.attemptedAt ?? null}, ${target.confirmedAt ?? null},
      ${target.lastReceivedAt ?? null}, ${target.receivedCount ?? 0},
      ${target.seenFromAddresses ?? []}, ${target.seenFromDomains ?? []},
      ${target.lastError ?? null}, now()
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
      last_error = EXCLUDED.last_error,
      updated_at = now()
  `;
}

/**
 * Soft-delete a target. Single UPDATE — no race window.
 */
export async function markDeleted(id: string): Promise<void> {
  const q = sql();
  const prior = (await q`
    SELECT status FROM newsletter_targets WHERE id = ${id} AND is_deleted = FALSE
  `) as Array<{ status: string }>;
  await q`
    UPDATE newsletter_targets
    SET is_deleted = TRUE, deleted_at = now(), updated_at = now()
    WHERE id = ${id}
  `;
  await q`
    INSERT INTO tracker_audit (action, target_id, from_status)
    VALUES ('delete', ${id}, ${prior[0]?.status ?? null})
  `;
}

// ── Audit log ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  at: string;
  action: "status-change" | "delete";
  id: string;
  fromStatus?: SubscribeStatus;
  toStatus?: SubscribeStatus;
}

/**
 * Append an audit entry. Most callers don't need to invoke this directly
 * — setTargetStatus / markDeleted / noteInboundFromSender already log
 * their own audit entries inline. Kept for back-compat with code that
 * wants to log a custom entry alongside a writeTracker() call.
 */
export async function writeAuditEntry(entry: AuditEntry): Promise<void> {
  const q = sql();
  await q`
    INSERT INTO tracker_audit (at, action, target_id, from_status, to_status)
    VALUES (${entry.at}, ${entry.action}, ${entry.id}, ${entry.fromStatus ?? null}, ${entry.toStatus ?? null})
  `;
}
