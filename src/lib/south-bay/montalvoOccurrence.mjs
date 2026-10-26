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

// Ticket pages contain unrelated workshop promotions and checkout text. Read
// audience claims only inside the current event's description blocks. Balance
// nested tags, including the nested <p> wrappers Tessitura publishes as HTML.
function contentForClass(source, className) {
  const opening = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\bclass=["'][^"']*\\b${className}(?=[\\s"'])[^"']*["'][^>]*>`, "i").exec(source);
  if (!opening) return "";
  const start = opening.index + opening[0].length;
  const tags = new RegExp(`</?${opening[1]}\\b[^>]*>`, "gi");
  tags.lastIndex = start;
  let depth = 1;
  for (let tag; (tag = tags.exec(source));) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return source.slice(start, tag.index);
  }
  return "";
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
  const prices = [...body.matchAll(/\bdata-tn-price-amount=["'](\d+(?:\.\d+)?)["']/gi)]
    .map((match) => Number(match[1]));
  // A paid adult ticket outranks a free-child tier or a zero in calendar JSON-LD.
  const hasPaidTickets = prices.some((price) => price > 0);
  const isFree = prices.includes(0) || /\bis\s+(?:a\s+)?FREE\b/i.test(visibleText);
  const audienceText = [
    "tn-event-detail__description",
    "tn-production-season-detail-page__description",
    "tn-prod-season-header__description-text-content",
  ].map((className) => textContent(contentForClass(body, className))).join(" ");
  const familyAudience = /\b(?:whole family|family event|family[- ]friendly|activities for kids|school groups|homeschooled students)\b/i.test(audienceText);

  if (!title && !date && !startTime && !endTime) return null;
  return {
    title,
    date,
    time: rangeStart || startTime,
    endTime,
    cost: hasPaidTickets ? "paid" : isFree ? "free" : null,
    ...(familyAudience ? { kidFriendly: true } : {}),
  };
}
