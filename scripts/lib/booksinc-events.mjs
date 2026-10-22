import { decodeHTML } from "entities";
import { isoDate, isoDateParts } from "./dates.mjs";

const CITY_NAMES = [
  ["mountain view", "mountain-view"],
  ["palo alto", "palo-alto"],
  ["town & country", "palo-alto"],
  ["campbell", "campbell"],
  ["pruneyard", "campbell"],
  ["saratoga", "saratoga"],
];

const text = (value) => decodeHTML(String(value || "")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function occurrence(value) {
  const raw = String(value || "");
  try { isoDateParts(raw.slice(0, 10)); } catch { return null; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { date: raw, time: null };
  // A clock needs an explicit offset; never interpret the runner's timezone.
  if (!/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    date: isoDate(date),
    time: date.toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", hour12: true,
    }),
  };
}

/** The live Elfsight cards now publish dates, offsets, times, and store addresses. */
export function parseBooksIncEvents(scripts, { today } = {}) {
  const stack = scripts.flatMap((script) => {
    try { return [JSON.parse(script)]; } catch { return []; }
  });
  const raw = [];
  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== "object") continue;
    const types = [].concat(item["@type"] || []);
    if (types.includes("Event")) raw.push(item);
    for (const child of Object.values(item)) {
      if (child && typeof child === "object") stack.push(...(Array.isArray(child) ? child : [child]));
    }
  }
  if (!raw.length) throw new Error("Books Inc: no Event JSON-LD after calendar hydration");

  const events = [], seen = new Set();
  let dated = 0;
  for (const item of raw) {
    const start = occurrence(item.startDate);
    const title = text(item.name);
    if (!start || !title) continue;
    dated++;
    if (start.date < today || /EventCancelled|EventPostponed/i.test(item.eventStatus || "")) continue;
    const venue = text(item.location?.name);
    const postal = item.location?.address;
    const address = text(typeof postal === "string" ? postal : (postal?.name || [
      postal?.streetAddress, postal?.addressLocality, postal?.addressRegion, postal?.postalCode,
    ].filter(Boolean).join(", ")));
    const locality = `${venue} ${address}`.toLowerCase();
    const city = CITY_NAMES.find(([name]) => locality.includes(name))?.[1];
    if (!city) continue;
    const key = `${start.date}|${start.time}|${title}|${venue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const end = occurrence(item.endDate);
    events.push({
      title, ...start,
      endTime: end?.date === start.date && Date.parse(item.endDate) > Date.parse(item.startDate) ? end.time : null,
      venue, address, city,
      url: item.url || "https://www.booksinc.com/pages/events",
      source: "Books Inc", category: "arts", cost: null,
      kidFriendly: /\b(kid|child|family|storytime|youth|teen|toddler|baby|preschool|picture\s+book)\b/i.test(title),
    });
  }
  if (!dated) throw new Error(`Books Inc parser drift: ${raw.length} Event object(s), no usable dated titles`);
  return events;
}
