const CHCP_DOUBLE_HAPPINESS_URL = "https://www.chcp.org/event-6795488";

const CANONICAL_EVENT_URLS = new Map([
  // The current listing verifies the date; its Book Now URL still contains
  // December 2024. Link the organizer's current evidence.
  ["History Park Heritage Holiday Tea", "https://historysanjose.org/programs-events/"],
  ["Chicano Soul Fest 2026", "https://historysanjose.org/event/chicano-soul-fest/"],
  ["NAMI Walks Silicon Valley 2026", "https://historysanjose.org/event/nami-walks-silicon-valley/"],
  ["Low Times Car Show", "https://historysanjose.org/event/low-times-car-show/"],
  ["Slash and Sip: Adult Pumpkin Carving at San Pedro Square Market", "https://historysanjose.org/event/slash-and-sip-adult-pumpkin-carving-at-san-pedro-square-market/"],
  ["Children's Halloween Haunt 2026", "https://historysanjose.org/event/childrens-halloween-haunt/"],
  ["San José Roots", "https://historysanjose.org/event/san-jose-roots/"],
]);

/** Read only the card's visible date paragraph, never image paths or hrefs. */
export function parseHistorySjDateRange(block = "") {
  const paragraph = String(block).match(
    /<div\b[^>]*class=["'][^"']*\bevent-content\b[^"']*["'][^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i,
  )?.[1];
  if (!paragraph) return null;
  const text = paragraph.replace(/<[^>]+>/g, " ");
  const matches = [...text.matchAll(/(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/g)];
  if (matches.length < 1 || matches.length > 2) return null;
  const dates = matches.map(([, month, day, year]) => {
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const parsed = new Date(`${iso}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
  });
  if (dates.some((date) => !date) || (dates[1] && dates[1] < dates[0])) return null;
  return { startDate: dates[0], endDate: dates[1] || null };
}

export function canonicalHistorySjUrl(title = "", scrapedUrl = "") {
  const normalizedTitle = String(title).replace(/[’]/g, "'").replace(/^\*|\*$/g, "").trim();
  return CANONICAL_EVENT_URLS.get(normalizedTitle) || scrapedUrl;
}

/**
 * Classify only cost language the History San José listing actually publishes.
 * Missing price text stays unknown; it must never default to paid.
 */
export function inferHistorySjCost(text = "", eventUrl = "") {
  if (eventUrl === CHCP_DOUBLE_HAPPINESS_URL) return "free";

  const copy = String(text).replace(/\s+/g, " ").trim();
  if (/\bcost\s*:\s*(?:free|\$0(?:\.00)?)\b/i.test(copy)) return "free";
  if (
    /\bcost\s*:\s*\$\s*\d/i.test(copy)
    || /\$\s*\d+(?:\.\d{2})?\s*(?:[-–]\s*\$?\s*\d+)?\s*(?:registration fee|ga|general admission)?\b/i.test(copy)
    || /\bincluded in (?:the )?ticket price\b/i.test(copy)
  ) return "paid";

  return null;
}

export function historySjEndTime(eventUrl, scrapedEndTime) {
  return eventUrl === CHCP_DOUBLE_HAPPINESS_URL ? "3:30 PM" : scrapedEndTime;
}
