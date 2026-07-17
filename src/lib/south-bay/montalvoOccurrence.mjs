const MONTH = new Map([
  ["jan", "01"], ["feb", "02"], ["mar", "03"], ["apr", "04"],
  ["may", "05"], ["jun", "06"], ["jul", "07"], ["aug", "08"],
  ["sep", "09"], ["oct", "10"], ["nov", "11"], ["dec", "12"],
]);

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

function textContent(value) {
  return decodeHtml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clock(value) {
  const match = String(value || "").match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return null;
  return `${Number(match[1])}:${match[2] || "00"} ${match[3].replace(/\./g, "").toUpperCase()}`;
}

function isoDateFromDetail(value) {
  const match = String(value || "").match(/\b([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\b/);
  if (!match) return null;
  const month = MONTH.get(match[1].toLowerCase());
  return month ? `${match[3]}-${month}-${String(Number(match[2])).padStart(2, "0")}` : null;
}

/**
 * Parse Montalvo's first-party ticket/occurrence page. Visible occurrence
 * details deliberately outrank head metadata: the Marcus Festival page's
 * meta description still said 10:30 p.m. while its visible schedule said
 * 10:00 p.m.
 */
export function parseMontalvoOccurrencePage(html) {
  const source = String(html || "");
  if (!source) return null;

  const body = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || source.replace(/<head\b[\s\S]*?<\/head>/i, " ");
  const visibleText = textContent(body);
  const headingHtml = source.match(/<h1\b[^>]*id=["']tn-page-heading["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const titleHtml = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = textContent(headingHtml || titleHtml || "").replace(/\s*\|\s*Montalvo Arts Center\s*$/i, "").trim() || null;

  const detailHtml = source.match(/<p\b[^>]*class=["'][^"']*tn-event-detail__display-time[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const detailText = textContent(detailHtml || "");
  const startTime = clock(detailText);
  const date = isoDateFromDetail(detailText);

  const range = visibleText.match(/\bfrom\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\s*(?:to|[-–—])\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))/i);
  const rangeStart = range ? clock(range[1]) : null;
  const endTime = range ? clock(range[2]) : null;
  const isFree = /\bis\s+(?:a\s+)?FREE\b/i.test(visibleText)
    || /data-tn-price-amount=["']0(?:\.0+)?["']/i.test(body);

  if (!title && !date && !startTime && !endTime) return null;
  return {
    title,
    date,
    time: rangeStart || startTime,
    endTime,
    cost: isFree ? "free" : null,
  };
}
