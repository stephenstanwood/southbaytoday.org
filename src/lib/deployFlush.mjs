// Hourly flush for batched deploys (scripts/vercel-ignore-build.mjs holds
// automated fact-check and copy-edit commits for up to two hours). The cron
// asks Vercel to build main only when the live deployment is behind it; the
// Ignored Build Step then decides whether the batch has waited long enough.

export const MAIN_REFS_URL = "https://github.com/stephenstanwood/southbaytoday.org.git/info/refs?service=git-upload-pack";

/** main's commit from a git smart-HTTP ref advertisement (no API rate limit, public repo). */
export function mainShaFromRefs(advertisement) {
  return /([0-9a-f]{40}) refs\/heads\/main(?:\n|\0)/.exec(String(advertisement))?.[1] ?? null;
}

/**
 * @returns {Promise<{ flushed: boolean, reason: string, live: string | null, main: string | null }>}
 */
export async function flushBatchedDeploy({ liveSha, hookUrl, fetchImpl = fetch }) {
  if (!hookUrl) return { flushed: false, reason: "DEPLOY_FLUSH_HOOK_URL is not set", live: liveSha || null, main: null };
  let main = null;
  try {
    const response = await fetchImpl(MAIN_REFS_URL, {
      headers: { "User-Agent": "southbaytoday-deploy-flush" },
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) main = mainShaFromRefs(await response.text());
  } catch { /* unknown main: ask for a build; the ignore step still decides */ }
  if (main && liveSha && main === liveSha) {
    return { flushed: false, reason: "the live deployment is main", live: liveSha, main };
  }
  const response = await fetchImpl(hookUrl, { method: "POST", signal: AbortSignal.timeout(8000) });
  return {
    flushed: response.ok,
    reason: response.ok ? "asked Vercel to build main" : `deploy hook answered ${response.status}`,
    live: liveSha || null,
    main,
  };
}
