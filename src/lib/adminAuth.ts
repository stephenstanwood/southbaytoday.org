// ---------------------------------------------------------------------------
// Admin request authorization
// ---------------------------------------------------------------------------
// Prefers `Authorization: Bearer <ADMIN_KEY>`, which keeps the key OUT of
// request URLs — and therefore out of Vercel access logs, browser history, and
// Referer headers. The admin tracker polls /state every ~20s, so a query-param
// key was being written into the logs continuously.
//
// Falls back to the legacy `?key=` query param so existing bookmarks / the
// initial page-load gate keep working during the transition.
// ---------------------------------------------------------------------------

import { timingSafeEqual } from "node:crypto";

/** Constant-time compare so the key check doesn't leak length/prefix via timing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isAdmin(request: Request): boolean {
  const expected = process.env.ADMIN_KEY ?? import.meta.env.ADMIN_KEY ?? "";
  if (!expected) return false;

  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ") && safeEqual(auth.slice(7), expected)) {
    return true;
  }

  // Legacy fallback — discouraged (leaks into logs), kept for compatibility.
  const provided = new URL(request.url).searchParams.get("key") ?? "";
  return provided.length > 0 && safeEqual(provided, expected);
}
