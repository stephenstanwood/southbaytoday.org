// ---------------------------------------------------------------------------
// South Bay Signal — URL Validation
// Verifies URLs are specific, reachable, and not generic homepages
// ---------------------------------------------------------------------------

import { logStep, logSkip, logError } from "./logger.mjs";

// Patterns that indicate a generic homepage / useless landing
const HOMEPAGE_PATTERNS = [
  /^https?:\/\/[^/]+\/?$/,                    // bare domain
  /^https?:\/\/www\.[^/]+\/?$/,               // www + bare domain
  /legistar\.com\/Calendar\.aspx/,            // Legistar calendar index
  /municodemeetings\.com\/?$/,                 // MuniCode home
];

// URL patterns that are always too ugly for social
const UGLY_URL_PATTERNS = [
  /%2F/i,                                      // encoded slashes
  /Calendar\.aspx\?From=/,                     // Legistar date params
];

/**
 * Check if a URL is specific enough for social posting.
 * Returns { ok: boolean, reason?: string, url: string }
 */
export function isUrlSpecific(url) {
  if (!url || url.trim() === "") {
    return { ok: false, reason: "no URL provided", url: "" };
  }

  for (const pattern of HOMEPAGE_PATTERNS) {
    if (pattern.test(url)) {
      return { ok: false, reason: `generic homepage: ${url}`, url };
    }
  }

  for (const pattern of UGLY_URL_PATTERNS) {
    if (pattern.test(url)) {
      return { ok: false, reason: `ugly/unusable URL: ${url}`, url };
    }
  }

  return { ok: true, url };
}

/**
 * Fetch a URL and check if it returns a valid response.
 * Returns { ok: boolean, status?: number, reason?: string }
 */
export async function isUrlReachable(url, timeout = 8000) {
  if (!url) return { ok: false, reason: "no URL" };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SouthBaySignal/1.0)",
      },
      redirect: "follow",
    });

    clearTimeout(timer);

    if (res.ok) {
      return { ok: true, status: res.status };
    }

    // Some sites block HEAD, try GET
    if (res.status === 405 || res.status === 403) {
      const res2 = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(timeout),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SouthBaySignal/1.0)",
        },
        redirect: "follow",
      });
      if (res2.ok) return { ok: true, status: res2.status };
      return { ok: false, status: res2.status, reason: `HTTP ${res2.status}` };
    }

    return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Full URL validation: check specificity + reachability.
 * Returns { ok: boolean, reason?: string, url: string }
 */
export async function validateUrl(url) {
  const specific = isUrlSpecific(url);
  if (!specific.ok) return specific;

  const reachable = await isUrlReachable(url);
  if (!reachable.ok) {
    return { ok: false, reason: reachable.reason, url };
  }

  return { ok: true, url };
}

/**
 * Filter a list of candidate items, keeping only those with valid URLs.
 * Logs skipped items.
 */
export async function filterByUrl(candidates) {
  const results = [];
  const skipped = [];

  for (const item of candidates) {
    const check = await validateUrl(item.url);
    if (check.ok) {
      results.push(item);
    } else {
      skipped.push({ title: item.title, reason: check.reason });
      logSkip(`URL rejected: ${item.title} — ${check.reason}`);
    }

    // Small delay to be polite
    await new Promise((r) => setTimeout(r, 200));
  }

  if (skipped.length > 0) {
    logStep("🔗", `URL check: ${results.length} passed, ${skipped.length} skipped`);
  }

  return results;
}
