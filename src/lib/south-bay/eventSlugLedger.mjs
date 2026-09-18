// ---------------------------------------------------------------------------
// eventSlugLedger.mjs
// ---------------------------------------------------------------------------
// Keeps a published /event/<slug> URL resolving after the event leaves the
// upcoming feed *before* its date. The archive (events-archive.json) only
// catches events that age out on schedule; a listing that is deduped against
// a better source, re-titled by a copy-edit, dropped by a windowed scraper, or
// pulled by the organizer vanishes overnight and every link Google, the
// newsletter, and RSS readers hold to it 404s. In the week ending 2026-09-17,
// 44 of ~1,400 future slugs disappeared this way (7 renames, 37 drops) and
// /404 was still the third most-viewed page on the site.
//
// Two halves:
//   • retireSlugs()  — run by generate-events after each refresh. Any future
//     slug present on disk before the run (or already retired) that the new
//     run no longer publishes is recorded with a slim event snapshot. A slug
//     that comes back is dropped again. Entries expire RETAIN_DAYS after the
//     event date, matching the archive window.
//   • resolveRetired() — run at build time. Each retired slug either 301s to
//     its successor in the live pool (same id, same date + source URL, or same
//     date + near-identical title) or renders as a "no longer listed" leaf.
// ---------------------------------------------------------------------------

import { buildEventSlugs, slugifyTitle } from "./eventSlug.ts";

export const RETAIN_DAYS = 90;

const SNAPSHOT_FIELDS = [
  "id", "title", "date", "time", "endTime", "venue", "address", "city", "url",
  "image", "photoRef", "blurb", "description", "cost", "costNote", "kidFriendly",
  "category", "source", "virtual",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDated(e) {
  return Boolean(e && typeof e.date === "string" && DATE_RE.test(e.date));
}

export function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Trim an event record to the fields a retired leaf needs to render. */
export function snapshotEvent(e) {
  const out = {};
  for (const f of SNAPSHOT_FIELDS) {
    if (e[f] !== undefined && e[f] !== null && e[f] !== "") out[f] = e[f];
  }
  if (typeof out.description === "string" && out.description.length > 600) {
    out.description = `${out.description.slice(0, 597).trimEnd()}…`;
  }
  return out;
}

/** The slugs /event/[slug] publishes for a run: dated, timed, not yet passed. */
export function futureSlugs(events, todayPt) {
  const pool = (events ?? []).filter((e) => isDated(e) && e.date >= todayPt && e.time);
  return buildEventSlugs(pool);
}

/**
 * Same pool /event/[slug] builds from: upcoming future events plus passed
 * archive events, upcoming winning on a date|title collision.
 */
export function liveSlugs(upcomingEvents, archiveEvents, todayPt) {
  const upcoming = (upcomingEvents ?? []).filter((e) => isDated(e) && e.date >= todayPt && e.time);
  const past = (archiveEvents ?? []).filter((e) => isDated(e) && e.date < todayPt && e.time);
  const seen = new Set(upcoming.map((e) => `${e.date}|${e.title}`));
  return buildEventSlugs([...upcoming, ...past.filter((e) => !seen.has(`${e.date}|${e.title}`))]);
}

/**
 * Advance the ledger across one refresh.
 * @param {{entries?: Array<{slug:string, retiredAt:string, event:object}>}} ledger
 * @param {object[]} previousEvents  events on disk before the refresh
 * @param {object[]} currentEvents   events the refresh is about to write
 * @param {string} todayPt           YYYY-MM-DD in Pacific time
 * @param {string} [now]             ISO timestamp for retiredAt
 */
export function retireSlugs(ledger, previousEvents, currentEvents, todayPt, now = new Date().toISOString()) {
  const current = futureSlugs(currentEvents, todayPt);
  const cutoff = shiftDate(todayPt, -RETAIN_DAYS);
  const bySlug = new Map();

  for (const entry of ledger?.entries ?? []) {
    if (!entry?.slug || !isDated(entry.event)) continue;
    bySlug.set(entry.slug, entry);
  }
  for (const [slug, e] of futureSlugs(previousEvents, todayPt)) {
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, retiredAt: now, event: snapshotEvent(e) });
  }

  const entries = [...bySlug.values()]
    .filter((entry) => !current.has(entry.slug) && entry.event.date >= cutoff)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return { updatedAt: now, retainDays: RETAIN_DAYS, count: entries.length, entries };
}

function tokens(title) {
  return new Set(slugifyTitle(title ?? "").split("-").filter((t) => t.length > 1));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function normalizeVenue(venue) {
  return String(venue ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeUrl(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#]+$/, "");
  // A bare host is an organizer homepage, not an event page — too weak to
  // prove two listings are the same event.
  return trimmed.includes("/") ? trimmed : "";
}

/**
 * Find the live slug a retired listing should redirect to, if any.
 * @param {object} retired  snapshot from the ledger
 * @param {Map<string, object>} live  slug → event, from liveSlugs()
 */
export function findSuccessor(retired, live) {
  if (!isDated(retired)) return null;
  const sameDay = [...live].filter(([, e]) => e.date === retired.date);
  if (!sameDay.length) return null;

  if (retired.id) {
    const byId = sameDay.find(([, e]) => e.id && String(e.id) === String(retired.id));
    if (byId) return byId[0];
  }
  const retiredUrl = normalizeUrl(retired.url);
  if (retiredUrl) {
    const byUrl = sameDay.find(([, e]) => normalizeUrl(e.url) === retiredUrl);
    if (byUrl) return byUrl[0];
  }

  const retiredTokens = tokens(retired.title);
  let best = null;
  let bestScore = 0;
  for (const [slug, e] of sameDay) {
    const sim = jaccard(retiredTokens, tokens(e.title));
    if (sim < 0.6 || sim <= bestScore) continue;
    // A near-identical title on the same day is only the same event when the
    // place agrees: two branches' "Storytime" must not redirect to each other.
    const cityOk = !retired.city || !e.city || retired.city === e.city;
    const venueOk = !retired.venue || !e.venue || normalizeVenue(retired.venue) === normalizeVenue(e.venue);
    if (!cityOk || !venueOk) continue;
    bestScore = sim;
    best = slug;
  }
  return best;
}

/**
 * Split retired slugs into 301 redirects and stand-alone "no longer listed"
 * leaves against the live pool.
 */
export function resolveRetired(ledger, upcomingEvents, archiveEvents, todayPt) {
  const live = liveSlugs(upcomingEvents, archiveEvents, todayPt);
  const cutoff = shiftDate(todayPt, -RETAIN_DAYS);
  const redirects = new Map();
  const orphans = [];
  for (const entry of ledger?.entries ?? []) {
    if (!entry?.slug || !isDated(entry.event) || entry.event.date < cutoff) continue;
    if (live.has(entry.slug)) continue;
    const successor = findSuccessor(entry.event, live);
    if (successor) redirects.set(entry.slug, successor);
    else orphans.push({ slug: entry.slug, event: entry.event, retiredAt: entry.retiredAt });
  }
  return { redirects, orphans };
}
