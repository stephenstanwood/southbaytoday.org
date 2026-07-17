#!/usr/bin/env node
// Daily pre-wakeup check (3:30 AM PT, run from Mac Mini): if anything notable
// is opening today, DM Stephen directly via the cat-signal bot. Silent on
// empty days.
//
// Sources:
//   1. scc-food-openings.json  → opened[] entries with date == today
//   2. upcoming-events.json    → events with date == today AND title/description
//                                matching opening keywords (grand opening,
//                                grand reopening, ribbon cutting, etc.)
//
// Adding sources later: append a function that returns the same item shape
// ({ kind, emoji, name, blurb, where, url, time }) and concat into `items`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { isVerifiedOpeningRecord } from "./lib/scc-food-openings.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../src/data/south-bay");

const TODAY =
  process.env.TODAY ||
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const NOW_FOR_LABEL = process.env.TODAY
  ? new Date(`${process.env.TODAY}T12:00:00-07:00`)
  : new Date();

const OPENING_RX =
  /\b(grand\s+(re)?opening|grand\s+re-opening|re-?opening|reopens|ribbon[\s-]*cutting|opening\s+day|now\s+open|opens\s+today|inauguration|just\s+opened|newly\s+opened)\b/i;

const KIND_PATTERNS = [
  { rx: /library|sccld/i, kind: "Library", emoji: "📚" },
  { rx: /\bpark\b/i, kind: "Park", emoji: "🌳" },
  { rx: /trail/i, kind: "Trail", emoji: "🥾" },
  { rx: /museum|gallery/i, kind: "Museum", emoji: "🏛️" },
  { rx: /school|academy/i, kind: "School", emoji: "🏫" },
  { rx: /theatre|theater/i, kind: "Theater", emoji: "🎭" },
  { rx: /shop|store|market|boutique/i, kind: "Retail", emoji: "🛍️" },
  { rx: /cafe|coffee|restaurant|bar\b|kitchen|eatery/i, kind: "Food", emoji: "🍽️" },
];

function classifyEvent(e) {
  const blob = `${e.title || ""} ${e.venue || ""}`;
  for (const p of KIND_PATTERNS) if (p.rx.test(blob)) return p;
  return { kind: "Event", emoji: "🎉" };
}

function readJson(name) {
  try {
    return JSON.parse(readFileSync(resolve(DATA, name), "utf8"));
  } catch {
    return null;
  }
}

function titleCaseCity(s) {
  return (s || "")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function todaysFood() {
  const food = readJson("scc-food-openings.json");
  if (!food?.opened) return [];
  return food.opened
    .filter((x) => isVerifiedOpeningRecord(x) && x.date === TODAY)
    .map((x) => ({
      kind: "Restaurant",
      emoji: "🍽️",
      name: x.name,
      blurb: x.blurb || null,
      where: [x.address, titleCaseCity(x.cityName)].filter(Boolean).join(", "),
      url: null,
      time: null,
    }));
}

function dedupKey(e) {
  const city = (e.city || "").toLowerCase();
  const base = (e.venue || e.title || "")
    .toLowerCase()
    .replace(/\s+(grand\s+)?(re)?-?opening.*$/i, "")
    .replace(/\s+ribbon[\s-]?cutting.*$/i, "")
    .replace(/\s+opening\s+day.*$/i, "")
    .trim();
  return `${city}::${base}`;
}

function todaysOpeningEvents() {
  const ev = readJson("upcoming-events.json");
  if (!ev?.events) return [];
  const groups = new Map();
  for (const e of ev.events) {
    if (e.date !== TODAY) continue;
    const blob = `${e.title || ""} ${e.description || ""}`;
    if (!OPENING_RX.test(blob)) continue;
    const key = dedupKey(e);
    const prior = groups.get(key);
    // Prefer entry with URL; otherwise prefer longer blurb/description.
    if (!prior) {
      groups.set(key, e);
    } else {
      const priorScore = (prior.url ? 10 : 0) + (prior.blurb?.length || 0);
      const curScore = (e.url ? 10 : 0) + (e.blurb?.length || 0);
      if (curScore > priorScore) groups.set(key, e);
    }
  }
  return [...groups.values()].map((e) => {
    const { kind, emoji } = classifyEvent(e);
    const blurb =
      e.blurb ||
      (e.description ? e.description.slice(0, 200).replace(/\s+\S*$/, "") + "…" : null);
    return {
      kind,
      emoji,
      name: e.title,
      blurb,
      where: [e.venue, titleCaseCity(e.city)].filter(Boolean).join(", "),
      url: e.url || null,
      time: e.time || null,
    };
  });
}

// ── Date extraction for free-text opening claims ─────────────────────────────
// Used by around-town + reddit readers to resolve phrases like "May 9",
// "Saturday, May 21st", "5/9" to ISO calendar dates.
const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

function extractOpeningDate(text, sourceISODate) {
  if (!text) return null;
  const sourceDate = sourceISODate ? new Date(sourceISODate + "T12:00:00-07:00") : new Date();
  const sourceY = sourceDate.getFullYear();
  const sourceM = sourceDate.getMonth();
  const sourceD = sourceDate.getDate();

  // Pattern 1: "May 9" / "May 9th" / "May 9, 2026"
  const m1 = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i
  );
  if (m1) {
    const month = MONTHS[m1[1].toLowerCase().replace(/\.$/, "")];
    const day = parseInt(m1[2], 10);
    let year = m1[3] ? parseInt(m1[3], 10) : sourceY;
    // No explicit year? If the parsed month/day is BEFORE the source, assume next year.
    if (!m1[3]) {
      if (month < sourceM || (month === sourceM && day < sourceD)) year = sourceY + 1;
    }
    if (!Number.isFinite(day) || day < 1 || day > 31) return null;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Pattern 2: "5/9" or "5/9/2026"
  const m2 = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m2) {
    const month = parseInt(m2[1], 10) - 1;
    const day = parseInt(m2[2], 10);
    let year = m2[3] ? (m2[3].length === 2 ? 2000 + parseInt(m2[3], 10) : parseInt(m2[3], 10)) : sourceY;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    if (!m2[3]) {
      if (month < sourceM || (month === sourceM && day < sourceD)) year = sourceY + 1;
    }
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

// Map free-form South Bay city strings to canonical display names.
const CITY_NORMALIZE = {
  "san-jose": "San Jose", "san jose": "San Jose", sj: "San Jose", "san josé": "San Jose",
  "mountain-view": "Mountain View", "mountain view": "Mountain View", mv: "Mountain View",
  sunnyvale: "Sunnyvale",
  "santa-clara": "Santa Clara", "santa clara": "Santa Clara", sc: "Santa Clara",
  cupertino: "Cupertino",
  milpitas: "Milpitas",
  campbell: "Campbell",
  saratoga: "Saratoga",
  "los-gatos": "Los Gatos", "los gatos": "Los Gatos",
  "los-altos": "Los Altos", "los altos": "Los Altos",
  "palo-alto": "Palo Alto", "palo alto": "Palo Alto",
};

function todaysAroundTown() {
  const at = readJson("around-town.json");
  if (!at?.items) return [];
  const out = [];
  for (const it of at.items) {
    const blob = `${it.headline || ""} ${it.summary || ""}`;
    if (!OPENING_RX.test(blob)) continue;
    // Try to extract the actual opening date from the text first; fall back to the
    // item's own date (covers same-day announcements).
    const extracted = extractOpeningDate(blob, it.date);
    const matchDate = extracted || it.date;
    if (matchDate !== TODAY) continue;
    const cityKey = (it.cityId || it.cityName || "").toLowerCase();
    const cityDisplay = CITY_NORMALIZE[cityKey] || it.cityName || "";
    out.push({
      kind: "Civic",
      emoji: "🏛️",
      name: it.headline,
      blurb: it.summary ? it.summary.slice(0, 220).replace(/\s+\S*$/, "") + "…" : null,
      where: cityDisplay,
      url: it.sourceUrl || it.url || null,
      time: null,
      _src: "around-town",
    });
  }
  return out;
}

function todaysReddit() {
  const rd = readJson("reddit-pulse.json");
  if (!rd?.posts) return [];
  const out = [];
  for (const p of rd.posts) {
    const blob = `${p.title || ""} ${p.displayTitle || ""} ${p.summary || ""}`;
    if (!OPENING_RX.test(blob)) continue;
    // Reddit posts include a creation timestamp; use it to anchor relative date phrases.
    let sourceISO = null;
    if (typeof p.createdUtc === "number") {
      sourceISO = new Date(p.createdUtc * 1000).toISOString().slice(0, 10);
    } else if (p.createdAt || p.created) {
      sourceISO = (p.createdAt || p.created).slice(0, 10);
    }
    const extracted = extractOpeningDate(blob, sourceISO);
    if (!extracted) continue;
    if (extracted !== TODAY) continue;
    // Try to pull a city from the subreddit name (e.g. r/Sunnyvale → Sunnyvale).
    const subKey = (p.sub || "").toLowerCase();
    const cityDisplay =
      CITY_NORMALIZE[subKey] ||
      (subKey === "sanjose" ? "San Jose" :
       subKey === "paloalto" ? "Palo Alto" :
       subKey === "losgatos" ? "Los Gatos" :
       subKey === "losaltos" ? "Los Altos" : "");
    // permalink may be absolute (https://www.reddit.com/...) or relative (/r/...).
    const link = p.permalink
      ? (p.permalink.startsWith("http") ? p.permalink : `https://reddit.com${p.permalink}`)
      : (p.externalUrl || p.url || null);
    out.push({
      kind: "Reddit tip",
      emoji: "🗣️",
      name: p.displayTitle || p.title,
      blurb: p.summary ? p.summary.slice(0, 220) : null,
      where: cityDisplay || (p.sub ? `r/${p.sub}` : ""),
      url: link,
      time: null,
      _src: "reddit",
    });
  }
  return out;
}

// ── Chamber of Commerce calendars ───────────────────────────────────────────
// Most South Bay chambers run on one of three platforms; each needs a different
// parser. Per-chamber try/catch so a single chamber being down doesn't kill the
// run. Ribbon cuttings on chamber calendars are rare but additive — they catch
// events that don't surface anywhere else.
//
// COVERAGE: 8 of 11 SB cities.
//   - GrowthZone:  San Jose, Mountain View, Palo Alto, Los Gatos, Los Altos, Campbell
//   - Membee:      Cupertino
//   - ChamberMaster widget: Milpitas
//   - Wix (skipped, JS-rendered): Sunnyvale, Saratoga — covered by other sources
//   - No chamber events page: Santa Clara
const GROWTHZONE_CHAMBERS = [
  { url: "https://web.sjchamber.com/events", city: "San Jose", name: "SJ Chamber" },
  { url: "https://www.chambermv.org/events", city: "Mountain View", name: "MV Chamber" },
  { url: "https://paloaltochamber.com/events", city: "Palo Alto", name: "PA Chamber" },
  { url: "https://www.losgatoschamber.com/events", city: "Los Gatos", name: "LG Chamber" },
  { url: "https://www.losaltoschamber.org/events", city: "Los Altos", name: "LA Chamber" },
  { url: "https://business.campbellchamber.net/events/", city: "Campbell", name: "Campbell Chamber" },
];

const UA = "Mozilla/5.0 (compatible; southbaytoday-openings-dm/1.0; +https://southbaytoday.org)";

function decodeEntities(s) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseTitleHref(c) {
  // GrowthZone has two HTML shapes for event titles depending on theme:
  //   1. <h5 class="card-title gz-card-title"><a href="...">Title</a>
  //   2. <a href="..." class="gz-card-title ...">Title</a>
  return (
    c.match(/gz-card-title[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)</) ||
    c.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*gz-card-title[^"]*"[^>]*>([^<]+)</) ||
    c.match(/<a[^>]+class="[^"]*gz-card-title[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)</)
  );
}

async function fetchGrowthZone(chamber) {
  try {
    const res = await fetch(chamber.url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const events = [];

    // Two themes: modern (date in <span content="YYYY-MM-DD">) and legacy
    // (schema.org/Event microdata with separate gz-start-dt/dy/yr spans, e.g. SJ).
    if (html.includes('schema.org/Event')) {
      const blocks = html.split(/itemtype="http:\/\/schema\.org\/Event"/);
      for (let i = 1; i < blocks.length; i++) {
        const c = blocks[i];
        const titleHref = parseTitleHref(c);
        if (!titleHref) continue;
        const monthMatch = c.match(/gz-start-dt[^>]*>([A-Za-z]+)/);
        const dayMatch = c.match(/gz-start-dy[^>]*>(\d+)/);
        const yearMatch = c.match(/gz-card-yr[^>]*>(\d{4})/) || c.match(/\b(20\d\d)\b/);
        if (!monthMatch || !dayMatch || !yearMatch) continue;
        const month = MONTHS[monthMatch[1].toLowerCase().replace(/\.$/, "")];
        if (month === undefined) continue;
        const day = parseInt(dayMatch[1], 10);
        const year = parseInt(yearMatch[1], 10);
        const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        events.push({
          title: decodeEntities(titleHref[2]).trim(),
          url: titleHref[1],
          date: iso,
          chamber: chamber.name,
          city: chamber.city,
        });
      }
    } else {
      const cards = html.split("gz-events-card").slice(1);
      for (const c of cards) {
        const titleHref = parseTitleHref(c);
        const dateMatch = c.match(/<span\s+content="(\d{4}-\d{2}-\d{2})/);
        if (!titleHref || !dateMatch) continue;
        events.push({
          title: decodeEntities(titleHref[2]).trim(),
          url: titleHref[1],
          date: dateMatch[1],
          chamber: chamber.name,
          city: chamber.city,
        });
      }
    }
    return events;
  } catch {
    return [];
  }
}

// Cupertino runs Membee — the public widget loads an iframe at
// /feeds/events/event.aspx with title links and "Mon DD, YYYY" dates.
async function fetchCupertinoMembee() {
  try {
    const res = await fetch(
      "https://widgets.cupertino-chamber.org/feeds/events/event.aspx?cid=233&wid=501",
      { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const titles = [
      ...html.matchAll(/<a id="ucEvent_[^"]+_hlName"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g),
    ];
    const dates = [
      ...html.matchAll(
        /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?)\s+(\d{1,2}),?\s+(\d{4})\b/g
      ),
    ];
    const events = [];
    for (const t of titles) {
      // Pair each title with the date that immediately precedes it in the HTML.
      let best = null,
        bestDist = Infinity;
      for (const d of dates) {
        if (d.index < t.index && t.index - d.index < bestDist) {
          best = d;
          bestDist = t.index - d.index;
        }
      }
      if (!best) continue;
      const month = MONTHS[best[1].toLowerCase().replace(/\.$/, "")];
      const day = parseInt(best[2], 10);
      const year = parseInt(best[3], 10);
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      events.push({
        title: decodeEntities(t[2]).trim(),
        url: t[1].replace(/&amp;/g, "&"),
        date: iso,
        chamber: "Cupertino Chamber",
        city: "Cupertino",
      });
    }
    return events;
  } catch {
    return [];
  }
}

// Milpitas runs ChamberMaster but the listing page requires a session.
// The chamber's homepage embeds a mini-calendar widget showing the next ~3
// events with structured EvtLink markup — scrape that instead.
async function fetchMilpitasMiniCal() {
  try {
    const res = await fetch("https://www.milpitaschamber.com", {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const blocks = html.split("mini-calendar").slice(1);
    const events = [];
    const today = new Date();
    for (const b of blocks) {
      const a = b.match(/EvtLink[^>]*href="([^"]+)"[^>]*>([^<]+)</);
      const dt = b.match(/EvtDate">([A-Z][a-z]+) (\d+)/);
      if (!a || !dt) continue;
      const month = MONTHS[dt[1].toLowerCase()];
      const day = parseInt(dt[2], 10);
      let year = today.getFullYear();
      // Roll forward if the parsed date already passed this year.
      if (month < today.getMonth() || (month === today.getMonth() && day < today.getDate())) {
        year += 1;
      }
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      events.push({
        title: decodeEntities(a[2]).trim(),
        url: a[1].replace(/&amp;/g, "&"),
        date: iso,
        chamber: "Milpitas Chamber",
        city: "Milpitas",
      });
    }
    return events;
  } catch {
    return [];
  }
}

async function todaysChamberEvents() {
  const [growthZone, cupertino, milpitas] = await Promise.all([
    Promise.all(GROWTHZONE_CHAMBERS.map(fetchGrowthZone)).then((a) => a.flat()),
    fetchCupertinoMembee(),
    fetchMilpitasMiniCal(),
  ]);
  const all = [...growthZone, ...cupertino, ...milpitas];
  const out = [];
  for (const e of all) {
    if (e.date !== TODAY) continue;
    if (!OPENING_RX.test(e.title)) continue;
    out.push({
      kind: "Chamber event",
      emoji: "✂️",
      name: e.title,
      blurb: `Listed on ${e.chamber} calendar.`,
      where: e.city,
      url: e.url || null,
      time: null,
      _src: "chamber",
    });
  }
  return out;
}

// Cross-source dedup. Two items collapse if:
//   1. They share a city (parsed from `where` — strips venue prefixes).
//   2. Their names share at least one significant token after stripping
//      opening boilerplate ("grand opening", "reopening", "library",
//      "public", etc.).
// Prefer the entry with a URL, then the longer blurb.
const DEDUP_NAME_NOISE = /\b(grand|re-?opening|opening|reopens|ribbon|cutting|the|a|an|and|of|at|in|on|for|day|now|today|just|newly|center|grounds|public|library|park|building|community|venue|inauguration)\b/gi;

function nameTokens(name) {
  return (name || "")
    .toLowerCase()
    .replace(DEDUP_NAME_NOISE, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function cityOf(where) {
  if (!where) return "";
  // `where` may be "Venue, City" or just "City". The city is the trailing part.
  const parts = where.split(",").map((s) => s.trim()).filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
}

function dedupAcrossSources(items) {
  const merged = [];
  for (const it of items) {
    const itCity = cityOf(it.where);
    const itTokens = new Set(nameTokens(it.name));
    let mergedIdx = -1;
    for (let i = 0; i < merged.length; i++) {
      const m = merged[i];
      if (cityOf(m.where) !== itCity) continue;
      const mTokens = nameTokens(m.name);
      const overlap = mTokens.filter((t) => itTokens.has(t)).length;
      // If both have no tokens (boilerplate-only), still match within same city.
      if (overlap > 0 || (mTokens.length === 0 && itTokens.size === 0)) {
        mergedIdx = i;
        break;
      }
    }
    if (mergedIdx === -1) {
      merged.push(it);
    } else {
      const prior = merged[mergedIdx];
      const priorScore = (prior.url ? 10 : 0) + (prior.blurb?.length || 0);
      const curScore = (it.url ? 10 : 0) + (it.blurb?.length || 0);
      if (curScore > priorScore) merged[mergedIdx] = it;
    }
  }
  return merged;
}

const items = dedupAcrossSources([
  ...todaysFood(),
  ...todaysOpeningEvents(),
  ...todaysAroundTown(),
  ...todaysReddit(),
  ...(await todaysChamberEvents()),
]);

if (items.length === 0) {
  console.log(`[openings-dm] ${TODAY}: nothing opening — no DM`);
  process.exit(0);
}

const dateLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(NOW_FOR_LABEL);

let body = `🆕 **Opens today — ${dateLabel}**\n`;
for (const it of items) {
  body += `\n${it.emoji} **${it.kind}: ${it.name}**\n`;
  const meta = [it.time, it.where].filter(Boolean).join(" · ");
  if (meta) body += `${meta}\n`;
  if (it.blurb) body += `${it.blurb}\n`;
  if (it.url) body += `${it.url}\n`;
}

if (process.env.DRY_RUN) {
  console.log(body);
  process.exit(0);
}

const botToken = process.env.DISCORD_BOT_TOKEN;
const dmChannel = process.env.DISCORD_DM_CHANNEL;
if (!botToken) {
  console.error("[openings-dm] DISCORD_BOT_TOKEN not set");
  process.exit(1);
}
if (!dmChannel) {
  console.error("[openings-dm] DISCORD_DM_CHANNEL not set");
  process.exit(1);
}

const res = await fetch(
  `https://discord.com/api/v10/channels/${dmChannel}/messages`,
  {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: body.slice(0, 1990) }),
  },
);
if (!res.ok) {
  console.error(`[openings-dm] DM ${res.status}: ${await res.text()}`);
  process.exit(1);
}
console.log(`[openings-dm] ${TODAY}: DM'd ${items.length} item(s)`);
