// San Jose Theaters — the four city-owned downtown houses (California Theatre,
// San Jose Civic, Center for the Performing Arts, Montgomery Theater).
//
// sanjosetheaters.org folded into Visit San Jose in September 2026: the root
// now 301s to https://www.sanjose.org/theaters, and the All-in-One Event
// Calendar iCal export the adapter used to read answers HTTP 200 with that
// ~166 KB HTML landing page. parseIcalEvents found no VEVENT blocks in it, the
// adapter reported a healthy empty season, and the per-source regression guard
// (correctly) blocked the whole 2026-09-22 refresh because 59 still-upcoming
// shows had vanished.
//
// The new home is first-party — Team San Jose operates both the venues and
// sanjose.org. Its theaters page is an AngularJS app that GETs the public
// `/event-listings` JSON (every Visit San Jose event, ~180 rows) and keeps the
// rows flagged `field_team_san_jose_theater: "On"` or held at one of the four
// houses. The listing has dates but no clock times, so each show's own detail
// page supplies them: a structured "When" block for single-night bookings, and
// the presenter's per-performance list ("Sat., October 10, 2026 @ 2pm, 7:30pm")
// for runs. robots.txt is stock Drupal and allows both paths; nothing is behind
// a bot challenge.
//
// Everything here fails loudly. A body that is not the JSON listing, a listing
// with no theater rows, or a run of broken detail pages throws, so the refresh
// records a source error (tolerated and reported) instead of an empty success
// the regression guard cannot tell apart from "nothing on".

import { stripHtml } from "./event-html.mjs";

export const SAN_JOSE_THEATERS_ORIGIN = "https://www.sanjose.org";
export const SAN_JOSE_THEATERS_LISTINGS_URL = `${SAN_JOSE_THEATERS_ORIGIN}/event-listings`;
export const SAN_JOSE_THEATERS_PAGE_URL = `${SAN_JOSE_THEATERS_ORIGIN}/theaters`;

// Canonical street addresses. Detail pages carry per-listing address fields
// that are not reliable: a California Theatre listing gives an office park on
// Paragon Dr., and presenter-owned listings give "Symphony San Jose, P.O. Box
// 790". The venue is resolved first, then the address comes from here.
export const SAN_JOSE_THEATER_ADDRESSES = Object.freeze({
  "California Theatre": "345 South 1st Street, San Jose, CA 95113",
  "San Jose Civic": "135 West San Carlos Street, San Jose, CA 95113",
  "Center for the Performing Arts": "255 South Almaden Boulevard, San Jose, CA 95113",
  "Montgomery Theater": "271 South Market Street, San Jose, CA 95113",
});

const THEATER_NAMES = Object.freeze(Object.keys(SAN_JOSE_THEATER_ADDRESSES));

const THEATER_BY_STREET = [
  [/\b345\s+(?:South|S\.?)\s+(?:1st|First)\b/i, "California Theatre"],
  [/\b135\s+(?:West|W\.?)\s+San\s+Carlos\b/i, "San Jose Civic"],
  [/\b255\s+(?:(?:South|S\.?)\s+)?Almaden\b/i, "Center for the Performing Arts"],
  [/\b271\s+(?:South|S\.?)\s+Market\b/i, "Montgomery Theater"],
];

// Multi-night runs from these presenters already reach the feed from a
// dedicated source: fetchOperaSanJoseEvents reads operasj.org itself (Visit San
// Jose's copy of the Don Giovanni schedule disagreed with it on 2026-09-22),
// and Broadway San Jose engagements at the Center for the Performing Arts are
// sold and listed through Ticketmaster under different titles ("The Phantom of
// the Opera (Touring)"), which the title/venue dedup cannot match. Single-night
// bookings from either presenter are still published here, as the old
// sanjosetheaters.org calendar published them.
// No trailing \b: JavaScript's \b is ASCII-only, so it never matches after
// the "é" in "José".
const PRESENTER_OWNED_RUN = [
  /\bOpera\s+San\s+Jos[eé](?![a-zÀ-ɏ])/i,
  /\bBroadway\s+San\s+Jos[eé](?![a-zÀ-ɏ])/i,
];

const MONTHS = Object.freeze({
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
});

const MONTH_DAY_RE =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*(\d{4})\b)?/gi;

const CLOCK_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?|\bnoon\b/gi;

function pad(n) {
  return String(n).padStart(2, "0");
}

function isoFromParts(year, month, day) {
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
  ) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function mdyToIso(value) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value || "").trim());
  return m ? isoFromParts(Number(m[3]), Number(m[1]), Number(m[2])) : null;
}

function text(html) {
  return stripHtml(String(html || "")).replace(/\s+/g, " ").trim();
}

/** "7:30pm", "2 p.m.", "08:00 PM", "noon" → "7:30 PM"-style clock strings. */
export function parseClockTimes(value) {
  const times = [];
  for (const m of String(value || "").matchAll(CLOCK_RE)) {
    if (/^noon$/i.test(m[0])) {
      times.push("12:00 PM");
      continue;
    }
    const hour = Number(m[1]);
    const minute = m[2] === undefined ? 0 : Number(m[2]);
    if (hour < 1 || hour > 12 || minute > 59) continue;
    times.push(`${hour}:${pad(minute)} ${m[3].toUpperCase()}M`);
  }
  return [...new Set(times)];
}

/**
 * Parse the listing JSON body. Throws on anything that is not the expected
 * array — above all an HTML page served with a 200, which is exactly how the
 * old iCal export failed.
 */
export function parseTheaterListings(body) {
  const raw = String(body ?? "").replace(/^﻿/, "").trimStart();
  if (!raw.startsWith("[")) {
    const title = raw.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim();
    const shape = raw.startsWith("<")
      ? `an HTML page${title ? ` titled "${title}"` : ""}`
      : `a body starting ${JSON.stringify(raw.slice(0, 40))}`;
    throw new Error(`sanjose.org /event-listings returned ${shape}, not the JSON event listing`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`sanjose.org /event-listings returned malformed JSON: ${err.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error("sanjose.org /event-listings did not return a JSON array");
  }
  const listings = data.filter(isTheaterListing);
  if (listings.length === 0) {
    throw new Error(
      `sanjose.org /event-listings returned ${data.length} listings but none at the four city theaters`,
    );
  }
  return listings;
}

/** The same test the sanjose.org/theaters page applies to the shared feed. */
export function isTheaterListing(item) {
  if (!item || typeof item !== "object") return false;
  if (typeof item.title !== "string" || typeof item.link !== "string") return false;
  if (item.field_hide_event_from_search === "On" || item.field_show_as_virtaul === "On") return false;
  return item.field_team_san_jose_theater === "On"
    || THEATER_NAMES.includes(item.venue)
    || THEATER_NAMES.includes(item.neighborhood);
}

/** First/last calendar dates a listing covers, from its explicit dates when present. */
export function listingDateRange(item) {
  const explicit = String(item?.events_date || "")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part))
    .sort();
  const start = mdyToIso(item?.start_date) || explicit[0] || null;
  const end = mdyToIso(item?.end_date) || explicit.at(-1) || start;
  return { start, end: end && start && end < start ? start : end, dates: [...new Set(explicit)] };
}

export function listingOverlapsWindow(item, { today, horizon }) {
  const { start, end } = listingDateRange(item);
  if (!start || !end) return false;
  return end >= today && start <= horizon;
}

export function isPresenterOwnedRun(item) {
  const haystack = `${item?.title || ""} | ${item?.venue || ""} | ${stripHtml(item?.categories || "")}`;
  return PRESENTER_OWNED_RUN.some((re) => re.test(haystack));
}

/** Why a listing is skipped before its detail page is fetched, or null. */
export function listingSkipReason(item) {
  const { start, end } = listingDateRange(item);
  if (!start) return "no listing date";
  if (start !== end && isPresenterOwnedRun(item)) return "presenter-owned run (dedicated source)";
  return null;
}

export function listingUrl(item) {
  try {
    return new URL(String(item?.link || ""), SAN_JOSE_THEATERS_ORIGIN).toString();
  } catch {
    return null;
  }
}

function sectionBetween(html, startRe, endRe) {
  const start = html.search(startRe);
  if (start < 0) return "";
  const rest = html.slice(start);
  const end = rest.slice(1).search(endRe);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

/** Read the parts of a sanjose.org event detail page the adapter needs. */
export function parseTheaterEventPage(html) {
  const page = String(html || "");
  if (!/<h3>\s*When\s*<\/h3>/i.test(page)) {
    throw new Error("detail page has no When section");
  }
  const when = sectionBetween(page, /<h3>\s*When\s*<\/h3>/i, /<h3>\s*Where\s*<\/h3>/i);
  const whenFocus = text(when.match(/section--focus">([\s\S]*?)<\/div>/i)?.[1]);
  const whenTimes = [...when.matchAll(/ticket-info">([\s\S]*?)<\/div>/gi)]
    .flatMap((m) => parseClockTimes(text(m[1])));

  const where = sectionBetween(page, /<h3>\s*Where\s*<\/h3>/i, /<h3>/i);
  const whereVenue = text(where.match(/section--focus">([\s\S]*?)<\/div>/i)?.[1]);
  const whereAddress = text(where.replace(/<h3>[\s\S]*?<\/h3>/i, "").replace(/section--focus">[\s\S]*?<\/div>/i, ""));

  const primary = sectionBetween(page, /class="listing-detail--primary"/i, /class="listing-detail--secondary"/i);
  const imageSrc = primary.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] || "";
  let image = null;
  if (imageSrc) {
    try {
      image = new URL(imageSrc.replace(/&amp;/g, "&"), SAN_JOSE_THEATERS_ORIGIN).toString();
    } catch {
      image = null;
    }
  }

  // The first content block is the presenter's copy; the disclaimer block after
  // it ("PLEASE CONFIRM DETAILS…") is boilerplate.
  const descriptionHtml = primary.match(
    /<div class="listing-detail--content--block">([\s\S]*?)<\/div>/i,
  )?.[1] || "";

  return { whenFocus, whenTimes, whereVenue, whereAddress, image, descriptionHtml };
}

/** Resolve which of the four houses a show is in, or null when the page cannot say. */
export function resolveTheaterVenue({ whereVenue, whereAddress, listingVenue, description }) {
  for (const candidate of [whereVenue, listingVenue]) {
    if (THEATER_NAMES.includes(candidate)) return candidate;
  }
  for (const [re, name] of THEATER_BY_STREET) {
    if (re.test(whereAddress || "")) return name;
  }
  const copy = String(description || "");
  const mentioned = THEATER_NAMES
    .map((name) => ({ name, index: copy.search(new RegExp(`\\b${name}\\b`, "i")) }))
    .filter((hit) => hit.index >= 0)
    .sort((a, b) => a.index - b.index);
  return mentioned[0]?.name || null;
}

/**
 * Pull "<weekday>, <Month> <D>, <YYYY> @ <time>[, <time>]" performance lines
 * out of the presenter copy. Only dates inside the listing's own run count, so
 * an on-sale date or a season-announcement date cannot become a show.
 */
export function parsePerformanceLines(descriptionHtml, { start, end }) {
  if (!start || !end) return [];
  const startYear = Number(start.slice(0, 4));
  // Split on the markup before stripping it: stripHtml collapses every run of
  // whitespace, newlines included, so splitting its output would weld an "on
  // sale September 15" sentence onto the performance list that follows it.
  const lines = String(descriptionHtml || "")
    .split(/<br\s*\/?>|<\/(?:p|li|div|h\d)>|<li\b[^>]*>/i)
    .map((chunk) => stripHtml(chunk))
    .filter(Boolean);

  const performances = [];
  const seen = new Set();
  for (const rawLine of lines) {
    if (/\b(?:on[\s-]?sale|pre-?sale)\b/i.test(rawLine)) continue;
    // "(doors 6:30pm)" is not a curtain time.
    const line = rawLine.replace(/\(?\bdoors?\b(?:\s+open)?\s*(?:at|@|:)?\s*[\d:]+\s*[ap]\.?\s*m\.?\)?/gi, " ");
    const dates = [...line.matchAll(MONTH_DAY_RE)];
    dates.forEach((m, i) => {
      const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
      const day = Number(m[2]);
      let year = m[3] ? Number(m[3]) : startYear;
      let date = isoFromParts(year, month, day);
      if (date && !m[3] && date < start) {
        year += 1;
        date = isoFromParts(year, month, day);
      }
      if (!date || date < start || date > end) return;
      const segmentEnd = i + 1 < dates.length ? dates[i + 1].index : line.length;
      for (const time of parseClockTimes(line.slice(m.index + m[0].length, segmentEnd))) {
        const key = `${date}|${time}`;
        if (seen.has(key)) continue;
        seen.add(key);
        performances.push({ date, time });
      }
    });
  }
  return performances.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Concrete (date, time) performances for one listing + its detail page.
 * Returns { performances, skip } where skip names why nothing was emitted.
 */
export function theaterPerformances(item, detail) {
  const early = listingSkipReason(item);
  if (early) return { performances: [], skip: early };
  const range = listingDateRange(item);
  const singleNight = range.start === range.end;

  const fromCopy = parsePerformanceLines(detail.descriptionHtml, range);
  if (singleNight) {
    const times = detail.whenTimes.length
      ? detail.whenTimes.slice(0, 1)
      : fromCopy.filter((p) => p.date === range.start).map((p) => p.time);
    if (!times.length) return { performances: [], skip: "no published show time" };
    return { performances: times.map((time) => ({ date: range.start, time })), skip: null };
  }

  if (!fromCopy.length) return { performances: [], skip: "run has no published performance list" };
  return { performances: fromCopy, skip: null };
}
