import { stripHtml } from "./event-html.mjs";
import { isoDate } from "./dates.mjs";

export const PUBLIC_SQUARESPACE_CALENDARS = new Set([
  "https://www.moah.org/moahevents",
  "https://www.keplers.org/upcoming-events-internal",
  "https://www.eastwestbooks.org/events",
]);

/** Read only links in the public calendar's upcoming-event cards. */
export function parseSquarespacePublicCalendar(html, calendarUrl) {
  if (!/\beventlist--upcoming\b/.test(html)) throw new Error("Squarespace calendar markup not recognized");
  const listings = [];
  for (const match of html.matchAll(/<article\b[^>]*class=["'][^"']*\beventlist-event--upcoming\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi)) {
    const card = match[1];
    const link = card.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\beventlist-title-link\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const date = card.match(/<time\b[^>]*class=["']event-date["'][^>]*datetime=["'](\d{4}-\d{2}-\d{2})["']/i)?.[1];
    if (!link || !date) throw new Error("Squarespace occurrence missing title, URL or date");
    const url = new URL(link[1], calendarUrl);
    if (url.origin !== new URL(calendarUrl).origin || !url.pathname.startsWith(new URL(calendarUrl).pathname + "/") || url.search || url.hash) {
      throw new Error("Squarespace occurrence is not a public detail page");
    }
    const excerpt = card.match(/<div\b[^>]*class=["'][^"']*\beventlist-excerpt\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    listings.push({ title: stripHtml(link[2]), date, url: url.href, excerpt });
  }
  return listings;
}

/** Parse event data, never execute scripts from a fetched page. */
export function parseSquarespacePublicDetail(html, listing) {
  const events = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(match[1]); } catch { continue; }
    events.push(...(Array.isArray(data) ? data : data["@graph"] || [data]));
  }
  const heading = stripHtml(html.match(/<h1\b[^>]*class=["'][^"']*\beventitem-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const event = events.find((item) => item?.["@type"] === "Event"
    && Number.isFinite(Date.parse(item.startDate)) && isoDate(new Date(item.startDate)) === listing.date
    && heading === listing.title
    && (stripHtml(item.name) === listing.title || stripHtml(item.name).startsWith(listing.title + " — ")
      // East West's schema names the collection; its visible detail heading
      // and dated calendar card identify the event itself.
      || (new URL(listing.url).hostname === "www.eastwestbooks.org" && item.name === "All Events")));
  if (!event) throw new Error(`Squarespace detail identity mismatch: ${listing.url}`);
  const startDate = Date.parse(event.startDate);
  const endDate = event.endDate ? Date.parse(event.endDate) : null;
  if (event.endDate && (!Number.isFinite(endDate) || endDate <= startDate)) throw new Error(`Squarespace closing time invalid: ${listing.url}`);
  const content = html.match(/<div\b[^>]*class=["'][^"']*\beventitem-column-content\b[^"']*["'][^>]*>([\s\S]*?)<div\b[^>]*class=["'][^"']*\beventitem-content-footer\b/i)?.[1];
  if (content === undefined) throw new Error(`Squarespace event body missing: ${listing.url}`);
  const body = [...content.matchAll(/<div\b[^>]*class=["'][^"']*\bsqs-html-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)].map((m) => m[1]).join(" ");
  const location = event.location || {};
  const address = typeof location.address === "string" ? location.address : [
    location.address?.streetAddress, location.address?.addressLocality,
    location.address?.addressRegion, location.address?.postalCode,
  ].filter(Boolean).join(", ");
  return {
    title: listing.title, fullUrl: listing.url, startDate,
    ...(endDate ? { endDate } : {}), excerpt: listing.excerpt, body,
    location: { addressTitle: stripHtml(location.name || ""), addressLine1: address.replace(/\\n|\n/g, ", ") },
  };
}

export async function fetchSquarespacePublicItems(calendarUrl, { fetchImpl = globalThis.fetch, headers = {}, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  async function read(url) {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Squarespace HTTP ${response.status}`);
    return response.text();
  }
  const listings = parseSquarespacePublicCalendar(await read(calendarUrl), calendarUrl);
  const items = [];
  for (const listing of listings) {
    // One ordinary public page at a time; these sites publish no crawl delay.
    await wait(1100);
    items.push(parseSquarespacePublicDetail(await read(listing.url), listing));
  }
  return items;
}
