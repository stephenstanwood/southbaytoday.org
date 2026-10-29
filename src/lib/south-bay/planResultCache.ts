import { createHash, randomUUID } from "node:crypto";
import { sql } from "../lookout/db";

export const PLAN_PROMPT_VERSION = "pillar-pairs-sonnet-2026-10-29-v1";
const TTL_MS = 5 * 60_000;
const LEASE_MS = 90_000;
const local = new Map<string, { at: number; value: any }>();
const pending = new Map<string, Promise<any>>();
let tableReady: Promise<unknown> | undefined;

// Canonicalize all preferences; the old rounded sum collided for readers with
// different category/cost/outdoor preferences. Date and source version are
// explicit so neither midnight nor a data deployment can reuse stale results.
export function planResultKey(input: unknown): string {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}

export async function planResultCache(key: string, generate: () => Promise<any>, {
  persistent = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING),
  log = (cache: string) => console.log("[plan-cache]", JSON.stringify({ feature: "visitor-plan", cache })),
} = {}): Promise<any> {
  const cached = local.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) { log("memory-hit"); return cached.value; }
  if (pending.has(key)) { log("single-flight"); return pending.get(key); }
  const work = (async () => {
    let db: ReturnType<typeof sql> | undefined;
    let owner: string | undefined;
    if (persistent) {
      try {
        db = sql();
        tableReady ||= db`CREATE TABLE IF NOT EXISTS sbt_plan_result_cache (
          key text PRIMARY KEY, value jsonb, expires_at timestamptz NOT NULL,
          owner text, lease_until timestamptz
        )`.catch(error => { tableReady = undefined; throw error; });
        await tableReady;
        owner = randomUUID();
      } catch { db = undefined; log("persistent-unavailable"); }
    }
    let leased = false;
    if (db && owner) {
      // One lease per canonical request, shared across function instances.
      const deadline = Date.now() + LEASE_MS + 5_000;
      while (!leased) {
        let rows;
        try {
          rows = await db`INSERT INTO sbt_plan_result_cache (key, expires_at, owner, lease_until)
            VALUES (${key}, now(), ${owner}, now() + interval '90 seconds')
            ON CONFLICT (key) DO UPDATE SET owner = ${owner}, lease_until = now() + interval '90 seconds'
            WHERE sbt_plan_result_cache.expires_at <= now()
              AND (sbt_plan_result_cache.lease_until IS NULL OR sbt_plan_result_cache.lease_until < now())
            RETURNING owner`;
          leased = rows.length > 0;
          if (leased) break;
          const hit = await db`SELECT value FROM sbt_plan_result_cache WHERE key = ${key} AND expires_at > now()`;
          if (hit[0]?.value) { log("persistent-hit"); return hit[0].value; }
        } catch { db = undefined; log("persistent-unavailable"); break; }
        if (Date.now() > deadline) throw new Error("An identical plan is still generating; please retry shortly");
        await new Promise(resolve => setTimeout(resolve, 1_500));
      }
    }
    try {
      log("miss");
      const value = await generate();
      // HTTP errors and deterministic emergency fallback must remain retryable.
      if (value.editorialModel) {
        local.set(key, { at: Date.now(), value });
        if (local.size > 100) local.delete(local.keys().next().value!);
        if (db && leased) {
          await db`UPDATE sbt_plan_result_cache SET value = ${JSON.stringify(value)}::jsonb,
            expires_at = now() + interval '5 minutes', lease_until = NULL, owner = NULL
            WHERE key = ${key} AND owner = ${owner}`.catch(() => log("persistent-write-failed"));
          // Bounded lifetime for expired reader results.
          await db`DELETE FROM sbt_plan_result_cache WHERE expires_at < now() - interval '1 day'
            AND (lease_until IS NULL OR lease_until < now())`.catch(() => {});
        }
      }
      return value;
    } finally {
      if (db && leased) await db`DELETE FROM sbt_plan_result_cache WHERE key = ${key} AND owner = ${owner}`.catch(() => {});
    }
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}
