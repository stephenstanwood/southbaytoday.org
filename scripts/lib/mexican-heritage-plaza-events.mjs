import { stripHtml } from "./event-html.mjs";
import { isoDate } from "./dates.mjs";

export const MHP_CALENDAR_URL = "https://mhplaza.org/allevents";

function elements(html, tag, className) {
  return [...html.matchAll(new RegExp(`<${tag}\\b(?=[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'])[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))];
}

export function parseMhpCalendar(html, today) {
  const articles = elements(html, "article", "eventlist-event--upcoming");
  if (!/\beventlist--upcoming\b/.test(html)) throw new Error("MHP calendar markup not recognized");
  return articles.map(([, body]) => {
    const link = elements(body, "a", "eventlist-title-link")[0];
    const dateTag = elements(body, "time", "event-date")[0];
    const href = link?.[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
    const date = dateTag?.[0].match(/\bdatetime=["'](\d{4}-\d{2}-\d{2})["']/i)?.[1];
    if (!href || !date || !stripHtml(link[1])) throw new Error("MHP occurrence missing title, URL or date");
    const url = new URL(href, MHP_CALENDAR_URL);
    if (url.origin !== new URL(MHP_CALENDAR_URL).origin || !url.pathname.startsWith("/allevents/") || url.search) {
      throw new Error("MHP occurrence is not a public detail page");
    }
    return { title: stripHtml(link[1]), date, url: url.href };
  }).filter((item) => item.date >= today);
}

export function parseMhpDetail(html, listing) {
  let event;
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(match[1]); } catch { continue; }
    const items = Array.isArray(data) ? data : data["@graph"] || [data];
    event = items.find((item) => item?.["@type"] === "Event"
      && typeof item.startDate === "string" && Number.isFinite(Date.parse(item.startDate))
      && isoDate(new Date(item.startDate)) === listing.date);
    if (event) break;
  }
  const title = elements(html, "h1", "eventitem-title")[0]?.[1];
  const content = html.match(/<div\b[^>]*class=["'][^"']*\beventitem-column-content\b[^"']*["'][^>]*>([\s\S]*?)<div\b[^>]*class=["'][^"']*\beventitem-content-footer\b/i)?.[1];
  if (!event || !title || !content || !event.location?.name) throw new Error(`MHP detail incomplete: ${listing.url}`);
  if (stripHtml(title) !== listing.title) throw new Error(`MHP detail title mismatch: ${listing.url}`);
  if (event.endDate && (!Number.isFinite(Date.parse(event.endDate)) || Date.parse(event.endDate) <= Date.parse(event.startDate))) {
    throw new Error(`MHP closing time invalid: ${listing.url}`);
  }
  // Only the event's text blocks supply copy; its preview may describe a
  // different event. Image-only programs keep empty copy, never borrowed text.
  // Omit embeds, styles, navigation, tags and the site footer.
  const body = elements(content, "div", "sqs-html-content").map(([, text]) => text).join(" ");
  return {
    title: stripHtml(title), fullUrl: listing.url,
    startDate: Date.parse(event.startDate),
    ...(event.endDate ? { endDate: Date.parse(event.endDate) } : {}),
    location: { addressTitle: event.location.name }, body,
  };
}

export async function fetchMhpItems({ now = new Date(), fetchImpl = globalThis.fetch, headers = {} } = {}) {
  async function read(url) {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`MHP HTTP ${response.status}`);
    return response.text();
  }
  // MHP robots.txt excludes ?format=json. Read the public calendar and dated
  // HTML detail pages instead; no preview text or projected dates are used.
  const listings = parseMhpCalendar(await read(MHP_CALENDAR_URL), isoDate(now));
  const items = [];
  for (const listing of listings) items.push(parseMhpDetail(await read(listing.url), listing));
  return items;
}
