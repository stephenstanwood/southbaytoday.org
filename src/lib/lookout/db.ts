/**
 * Neon Postgres client for the lookout / newsletter tracker.
 *
 * Uses @neondatabase/serverless so the same client works in Vercel functions
 * (HTTP-based, no pool to drain) and in local Node scripts.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Run `vercel env pull` or set DATABASE_URL in your environment."
    );
  }
  cached = neon(url);
  return cached;
}
