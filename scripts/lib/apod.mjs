import { decodeHTML } from "entities";

export const APOD_ARCHIVE = "https://science.nasa.gov/apod/archive/";
const MONTHS = "January February March April May June July August September October November December".split(" ");
const text = html => decodeHTML(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
  .replace(/<br\b[^>]*>|<\/(?:p|div|li)>/gi, " ").replace(/<[^>]*>/g, ""))
  .replace(/\s+/g, " ").trim();
const attr = (tag, name) => decodeHTML(tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"))?.slice(1).find(v => v !== undefined) || "");

function isoDate(year, month, day) {
  const index = MONTHS.findIndex(value => value.toLowerCase() === month.toLowerCase());
  if (index < 0) throw Error("Unknown NASA APOD month");
  const date = `${year}-${String(index + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!validDate(date)) throw Error("Invalid NASA APOD date");
  return date;
}
function validDate(date) {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
function articleUrl(value) {
  const url = new URL(value);
  if (url.origin !== "https://science.nasa.gov" || url.search || url.hash
    || !/^\/image-article\/apod-\d{4}-[a-z]+-\d{1,2}-.+\/$/.test(url.pathname)) {
    throw Error("Expected a dated NASA Science APOD permalink");
  }
  return url.href;
}
// Extract a balanced module, so footer logos and related-story media cannot be
// mistaken for the featured image. Nested divs are common in NASA's new layout.
function moduleByClass(html, className) {
  for (const tag of html.matchAll(/<div\b[^>]*>/gi)) {
    if (!attr(tag[0], "class").split(/\s+/).includes(className)) continue;
    let depth = 0;
    for (const part of html.slice(tag.index).matchAll(/<\/?div\b[^>]*>/gi)) {
      depth += part[0].startsWith("</") ? -1 : 1;
      if (!depth) return html.slice(tag.index + tag[0].length, tag.index + part.index);
    }
    throw Error(`Unclosed NASA APOD module: ${className}`);
  }
  throw Error(`Missing NASA APOD module: ${className}`);
}

export function parseApodArchive(html, { startDate, endDate } = {}) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (!main) throw Error("Missing NASA APOD archive content");
  const entries = new Map();
  for (const anchor of main.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const label = text(anchor[2]).match(/^APOD:\s*(\d{4})\s+(\w+)\s+(\d{1,2})\s+[–—-]\s+(.+)$/);
    if (!label) continue;
    const [, year, month, day, title] = label;
    const date = isoDate(year, month, day);
    const sourceUrl = articleUrl(new URL(attr(anchor[1], "href"), APOD_ARCHIVE).href);
    if (!new URL(sourceUrl).pathname.startsWith(`/image-article/apod-${year}-${month.toLowerCase()}-${Number(day)}-`)) {
      throw Error("NASA APOD archive label/permalink date mismatch");
    }
    if ((startDate && date < startDate) || (endDate && date > endDate)) continue;
    const entry = { date, title, sourceUrl };
    if (entries.has(date) && JSON.stringify(entries.get(date)) !== JSON.stringify(entry)) throw Error(`Conflicting NASA APOD entries: ${date}`);
    entries.set(date, entry);
  }
  if (entries.size > 15) throw Error("Unexpected NASA APOD archive size");
  return [...entries.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// NASA smartens quotes in archive labels independently of article headings.
// Normalize only typographic quotes; dates, words and canonical URLs still
// have to match exactly, and the article supplies the displayed title.
const titleKey = value => value.normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

export function parseApodArticle(html, entry) {
  articleUrl(entry.sourceUrl);
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].find(tag => attr(tag[0], "rel") === "canonical");
  if (!canonical || attr(canonical[0], "href") !== entry.sourceUrl) throw Error(`NASA APOD canonical mismatch: ${entry.date}`);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
  const hero = moduleByClass(main, "hds-media-detail-hero");
  if (!/Astronomy Picture of the Day/.test(text(hero))) throw Error("Missing NASA APOD identity");
  const title = text(hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const metadata = new Map([...hero.matchAll(/<tr\b[^>]*>[\s\S]*?<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)]
    .map(row => [text(row[1]).replace(/:$/, ""), text(row[2])]));
  const dateParts = metadata.get("Date")?.match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!dateParts || isoDate(dateParts[3], dateParts[1], dateParts[2]) !== entry.date || titleKey(title) !== titleKey(entry.title)) {
    throw Error(`NASA APOD article date/title mismatch: ${entry.date}`);
  }
  const media = moduleByClass(hero, "media-detail-hero__media");
  if (/<(?:iframe|video)\b/i.test(media)) return null; // Never use a video thumbnail.
  const image = media.match(/<img\b[^>]*>/i)?.[0];
  const url = attr(image || "", "src");
  const linked = [...media.matchAll(/<a\b[^>]*>/gi)].map(tag => attr(tag[0], "href"))
    .find(href => /\.(?:jpe?g|png|gif|webp|avif)(?:\?|$)/i.test(href));
  const description = [...hero.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)]
    .find(tag => attr(tag[0].match(/^<p\b[^>]*>/i)[0], "class").split(/\s+/).includes("media-detail-hero__description"))?.[0] || "";
  // NASA varies the strong tag, whitespace and entity encoding around this
  // label. Normalize the text before separating explanation from navigation.
  const explanation = text(description).replace(/^Explanation:\s*/, "").split(/\s+Tomorrow['’]s picture:\s*/i)[0];
  const item = { date: entry.date, title, explanation, url, hdurl: linked || url,
    copyright: metadata.get("Credit & Copyright") || metadata.get("Credit") || null, sourceUrl: entry.sourceUrl };
  validateApodItems([item]);
  // Preserve the source resource while encoding Unicode filenames for HTTP.
  item.url = new URL(item.url).href;
  item.hdurl = new URL(item.hdurl).href;
  return item;
}

function imageKey(value) {
  let url;
  try { url = new URL(value); } catch { throw Error("Missing or invalid NASA APOD image URL"); }
  if (url.protocol !== "https:" || !["assets.science.nasa.gov", "apod.nasa.gov"].includes(url.hostname)
    || !url.pathname.includes("/apod/") || /logo|favicon|placeholder/i.test(url.pathname)
    || !/\.(?:jpe?g|png|gif|webp|avif)$/i.test(url.pathname)) throw Error("Generic or non-APOD image URL");
  return `${url.hostname}${url.pathname.replace(/^\/dynamicimage\/assets\//, "/content/dam/")}`;
}

export function validateApodItems(items, { startDate, endDate } = {}) {
  if (!Array.isArray(items) || !items.length || items.length > 12) throw Error("Expected 1–12 verified NASA APOD images");
  const dates = new Set(), titles = new Set(), explanations = new Set(), images = new Set();
  for (const [index, item] of items.entries()) {
    if (!validDate(item?.date) || (startDate && item.date < startDate) || (endDate && item.date > endDate)
      || dates.has(item.date) || (index && item.date >= items[index - 1].date)) throw Error("Invalid, repeated or unordered NASA APOD date");
    dates.add(item.date);
    const title = typeof item.title === "string" ? item.title.replace(/\s+/g, " ").trim().toLowerCase() : "";
    const explanation = typeof item.explanation === "string" ? item.explanation.replace(/\s+/g, " ").trim().toLowerCase() : "";
    if (title.length < 3 || /^(?:nasa(?: science)?|apod|astronomy picture of the day)$/.test(title) || titles.has(title)) throw Error("Generic or repeated NASA APOD title");
    if (explanation.length < 80 || explanations.has(explanation) || /tomorrow['’]s picture:/i.test(explanation)) throw Error("Missing, repeated or unparsed NASA APOD explanation");
    const assets = new Set([imageKey(item.url), imageKey(item.hdurl)]);
    if ([...assets].some(asset => images.has(asset))) throw Error("Repeated NASA APOD image");
    if (item.sourceUrl) {
      const source = new URL(articleUrl(item.sourceUrl)).pathname.match(/^\/image-article\/apod-(\d{4})-([a-z]+)-(\d{1,2})-/);
      if (isoDate(source[1], source[2], source[3]) !== item.date) throw Error("NASA APOD source/date mismatch");
    }
    titles.add(title); explanations.add(explanation); assets.forEach(asset => images.add(asset));
  }
  return items;
}
