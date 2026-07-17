// Build-time schema.org Event mapping for crawlable surfaces (static date
// pages + JSON-LD head blocks on /events and city pages). Honest fields only:
// nothing is fabricated — missing time means a date-only startDate, a price
// is only ever set from a literal $figure in the data (never guessed for
// "paid"), and location carries exactly the venue / address / city we
// actually have.
import { parseClockTime } from "./calendarLink";

const SITE = "https://southbaytoday.org";

export interface SchemaEventRecord {
  id?: string | null;
  title?: string | null;
  date?: string | null; // "YYYY-MM-DD" (PT)
  time?: string | null; // "6:00 PM"
  endTime?: string | null;
  venue?: string | null;
  address?: string | null;
  city?: string | null; // city id, e.g. "san-jose"
  cityName?: string | null; // pre-resolved display name, optional
  url?: string | null; // primary-source / ticketing URL
  pageUrl?: string | null; // canonical South Bay Today leaf page
  image?: string | null;
  photoRef?: string | null;
  blurb?: string | null;
  description?: string | null;
  cost?: string | null;
  costNote?: string | null; // e.g. "From $30" — a floor, not a fixed price
}

/** UTC offset suffix ("-07:00") for America/Los_Angeles on a given date. */
export function ptOffsetForDate(isoDate: string): string {
  const probe = new Date(`${isoDate}T12:00:00Z`); // noon UTC avoids DST edges
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "longOffset",
  }).formatToParts(probe);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = tz.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "-08:00";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDateTime(date: string, clock: { h: number; m: number }, offset: string): string {
  return `${date}T${pad2(clock.h)}:${pad2(clock.m)}:00${offset}`;
}

function absoluteImage(e: SchemaEventRecord): string | null {
  if (e.image && /^https?:\/\//i.test(e.image)) return e.image;
  if (e.photoRef) {
    return `${SITE}/api/place-photo?ref=${encodeURIComponent(e.photoRef)}&w=640&h=480`;
  }
  return null;
}

function plainDescription(e: SchemaEventRecord): string | null {
  const text = (e.blurb || e.description || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 300 ? `${text.slice(0, 297)}…` : text;
}

/** "From $30" → 30. Never guesses a price from thin air — only a literal $figure. */
function parseLowPrice(note: string | null | undefined): number | null {
  if (!note) return null;
  const m = note.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** One event record → schema.org Event object, or null if it can't be honest. */
export function eventToSchema(e: SchemaEventRecord): Record<string, unknown> | null {
  if (!e.title || !e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return null;

  const offset = ptOffsetForDate(e.date);
  const start = parseClockTime(e.time);
  const end = parseClockTime(e.endTime);
  const attendanceText = [e.title, e.venue, e.address].filter(Boolean).join(" ");
  const isOnline = /\b(?:online|virtual|zoom)\b/i.test(attendanceText);
  const isMixed = isOnline && /\b(?:hybrid|in[ -]person)\b/i.test(attendanceText);

  const schema: Record<string, unknown> = {
    "@type": "Event",
    ...(e.pageUrl ? { "@id": `${e.pageUrl}#event` } : {}),
    name: e.title,
    startDate: start ? isoDateTime(e.date, start, offset) : e.date,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: isMixed
      ? "https://schema.org/MixedEventAttendanceMode"
      : isOnline
        ? "https://schema.org/OnlineEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
  };
  // Only claim an end when it's parseable and actually after the start.
  if (start && end && end.h * 60 + end.m > start.h * 60 + start.m) {
    schema.endDate = isoDateTime(e.date, end, offset);
  }

  const locality = e.cityName || null;
  const address: Record<string, unknown> = {
    "@type": "PostalAddress",
    addressRegion: "CA",
    addressCountry: "US",
  };
  if (e.address) address.streetAddress = e.address;
  if (locality) address.addressLocality = locality;
  const place = {
    "@type": "Place",
    name: e.venue || locality || "South Bay",
    ...(e.address || locality ? { address } : {}),
  };
  const virtualLocation = {
    "@type": "VirtualLocation",
    name: e.venue || "Online",
    ...(e.url ? { url: e.url } : {}),
  };
  schema.location = isMixed ? [place, virtualLocation] : isOnline ? virtualLocation : place;

  const description = plainDescription(e);
  if (description) schema.description = description;
  const image = absoluteImage(e);
  if (image) schema.image = image;
  if (e.pageUrl) schema.url = e.pageUrl;
  else if (e.url) schema.url = e.url;
  if (e.pageUrl && e.url && e.pageUrl !== e.url) schema.sameAs = e.url;
  if (e.cost === "free") {
    schema.isAccessibleForFree = true;
    schema.offers = {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      ...(e.url ? { url: e.url } : {}),
    };
  } else if (e.cost === "paid" || e.cost === "low") {
    // Most listings only know "paid," not a figure — an Offer with no price is
    // still honest. costNote sometimes gives a real floor ("From $30"); when it
    // does, an AggregateOffer's lowPrice says exactly that, not a fixed price.
    const lowPrice = parseLowPrice(e.costNote);
    schema.offers = {
      "@type": lowPrice !== null ? "AggregateOffer" : "Offer",
      availability: "https://schema.org/InStock",
      ...(e.url ? { url: e.url } : {}),
      ...(lowPrice !== null ? { lowPrice, priceCurrency: "USD" } : {}),
    };
  }
  // organizer: the venue is the only field we can honestly call an organizing
  // party without guessing — curation "source" (library newsletter, news
  // aggregator, etc.) describes where we found the listing, not who runs it.
  if (e.venue) {
    schema.organizer = { "@type": "Organization", name: e.venue };
  }
  return schema;
}

/** Events → ItemList JSON-LD string for a <script type="application/ld+json">. */
export function eventListJsonLd(events: SchemaEventRecord[], opts: { name: string; url: string; limit?: number }): string | null {
  const items = events
    .map(eventToSchema)
    .filter((s): s is Record<string, unknown> => s !== null)
    .slice(0, opts.limit ?? 50);
  if (items.length === 0) return null;
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: opts.name,
    url: opts.url,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item,
    })),
  });
}
