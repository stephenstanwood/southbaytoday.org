const DEFAULT_TIMEOUT_MS = 12_000;

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

export function marketPageText(html) {
  return decodeHtml(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function marketPageConfirmsSchedule(html, evidencePatterns) {
  if (!Array.isArray(evidencePatterns) || evidencePatterns.length < 3) return false;
  const text = marketPageText(html);
  if (!text) return false;
  return evidencePatterns.every((pattern) => {
    if (!(pattern instanceof RegExp)) return false;
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/**
 * Fetch and verify a first-party recurring-market page. This intentionally
 * fails closed: a dead page, generic redirect, or page that no longer states
 * the market name + weekday + hours cannot seed projected occurrences.
 */
export async function verifyMarketScheduleSource(market, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const checkedAt = options.checkedAt || new Date().toISOString();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (!market?.url || typeof fetchImpl !== "function") {
    return { confirmed: false, reason: "missing-source" };
  }
  let sourceUrl;
  try {
    sourceUrl = new URL(market.url);
  } catch {
    return { confirmed: false, reason: "invalid-source-url" };
  }
  if (sourceUrl.protocol !== "https:") {
    return { confirmed: false, reason: "non-https-source" };
  }

  try {
    const response = await fetchImpl(sourceUrl.href, {
      redirect: "follow",
      headers: { "User-Agent": options.userAgent || "southbaytoday.org/data-pipeline" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response?.ok) {
      return { confirmed: false, reason: `http-${response?.status || "error"}` };
    }

    const finalUrl = new URL(response.url || sourceUrl.href);
    if (finalUrl.protocol !== "https:") {
      return { confirmed: false, reason: "non-https-redirect" };
    }
    const html = await response.text();
    if (!marketPageConfirmsSchedule(html, market.evidencePatterns)) {
      return { confirmed: false, reason: "schedule-not-confirmed" };
    }

    return {
      confirmed: true,
      sourceUrl: finalUrl.href,
      checkedAt,
    };
  } catch (error) {
    return { confirmed: false, reason: error?.name === "TimeoutError" ? "timeout" : "fetch-error" };
  }
}

export function marketOccurrenceEvidence(verification, date) {
  if (!verification?.confirmed || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    return null;
  }
  return {
    kind: "first-party-market-schedule",
    sourceUrl: verification.sourceUrl,
    date,
    checkedAt: verification.checkedAt,
  };
}
