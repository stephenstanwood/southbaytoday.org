/**
 * Hourly flush for batched deploys (vercel.json crons).
 *
 * scripts/vercel-ignore-build.mjs holds automated fact-check and copy-edit
 * commits for up to two hours instead of deploying each one. This cron asks
 * Vercel to build main whenever the live deployment is behind it, so a held
 * batch ships even when no other commit lands. The Ignored Build Step still
 * decides whether the batch has waited long enough. See CLAUDE.md
 * ("Deployment").
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; manual runs
 * can use ?key=<ADMIN_KEY>.
 */

import type { APIRoute } from "astro";
import { flushBatchedDeploy } from "../../../lib/deployFlush.mjs";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  const adminKey = process.env.ADMIN_KEY ?? "";
  const providedKey = url.searchParams.get("key") ?? "";
  const authed = (cronSecret && bearer === cronSecret) || (adminKey && (providedKey === adminKey || bearer === adminKey));
  if (!authed) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const result = await flushBatchedDeploy({
    liveSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    hookUrl: process.env.DEPLOY_FLUSH_HOOK_URL ?? "",
  });
  console.info(JSON.stringify({ event: "deploy-flush", ...result }));
  return Response.json({ ok: true, ...result });
};
