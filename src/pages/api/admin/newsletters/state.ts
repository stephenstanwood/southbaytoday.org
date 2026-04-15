/**
 * Read-only tracker state endpoint for the admin page's live poller.
 *
 * GET /api/admin/newsletters/state?key=<ADMIN_KEY>
 *
 * Returns the full tracker doc. The client polls this every ~20s and
 * patches only the rows that changed (status / counts / timestamps).
 */

import type { APIRoute } from "astro";
import { readTracker } from "../../../../lib/lookout/tracker.ts";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const expected = process.env.ADMIN_KEY ?? "";
  const provided = url.searchParams.get("key") ?? "";
  if (!expected || provided !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const doc = await readTracker();
  return new Response(JSON.stringify({ ok: true, doc }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
