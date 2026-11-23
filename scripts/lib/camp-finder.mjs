// ---------------------------------------------------------------------------
// Camp Finder → South Bay Today: normalize the sourced camp records
// ---------------------------------------------------------------------------
// The camp records come from the private `stephenstanwood/camp-finder-data`
// repository, which the Ventures operator grows batch by batch: one JSON line
// per camp program at one site for one season, every field carrying the camp
// page it came from and the date it was checked. This module turns those lines
// into the two files the site builds from:
//
//   camp-finder.json        every program with its sources (build time only:
//                           /camps/<id>, city, interest and operator pages)
//   camp-finder-index.json  the slim list the /camps directory island ships
//
// Facts only. Names are tidied for display (an all-caps name gets title case)
// but nothing is invented: a field the camp hasn't posted stays empty and the
// pages say so.

export const TOPIC_LABELS = {
  stem: "STEM",
  sports: "Sports",
  arts: "Arts",
  general: "All-around",
  animals: "Animals",
  academic: "Academic",
  adventure: "Adventure",
  nature: "Nature",
  culinary: "Cooking",
  music: "Music",
  swim: "Swim",
  language: "Language",
  faith: "Faith-based",
  "special-needs": "Special needs",
};

// Words that stay in capitals when an all-caps camp name gets title case.
const KEEP_UPPER = new Set([
  "STEM", "STEAM", "AI", "ICC", "YMCA", "USA", "US", "NASA", "LEGO", "DIY",
  "3D", "VR", "AR", "ESL", "TK", "CIT", "LIT", "JCC", "SJ", "MV", "PE", "II", "III",
]);
const KEEP_LOWER = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with", "vs"]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ASCII slug: "San José" → "san-jose", "Happy Hollow Park & Zoo" → "happy-hollow-park-zoo". */
export function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The site writes San José with its accent everywhere; camp pages write it
// both ways.
const CITY_DISPLAY = { "san-jose": "San José" };

export function canonicalCity(raw) {
  const name = String(raw ?? "").trim();
  if (!name) return null;
  const slug = slugify(name);
  return { slug, name: CITY_DISPLAY[slug] ?? name };
}

function titleWord(word, index) {
  const bare = word.replace(/[^A-Za-z0-9]/g, "");
  if (KEEP_UPPER.has(bare)) return word;
  const lower = word.toLowerCase();
  if (index > 0 && KEEP_LOWER.has(lower)) return lower;
  return lower.replace(/[a-z]/, (c) => c.toUpperCase());
}

/** Display form of a camp's own name: whitespace tidied, all-caps names in
 *  title case ("STEAM: OUTER SPACE ( 5-6 YEAR OLDS)" → "STEAM: Outer Space
 *  (5-6 Year Olds)"). Mixed-case names keep the camp's own casing. */
export function displayName(name) {
  let text = String(name ?? "").replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    text = text.split(" ").map(titleWord).join(" ");
  }
  return text;
}

/** "2027-03-01" → "Mar 1, 2027" */
export function formatIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return String(iso);
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** A posted rate label as readers see it: "full_day_early_bird_5_day_week_through_2027-03-01"
 *  → "Full day early bird 5 day week through Mar 1, 2027". */
export function rateLabel(label) {
  const text = String(label ?? "")
    .replace(/_/g, " ")
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (iso) => formatIsoDate(iso))
    .replace(/\s+/g, " ")
    .trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "Posted rate";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function days(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
}

function normalizeAddress(address) {
  if (!address || typeof address !== "object") return null;
  if (Array.isArray(address.locations)) {
    const locations = address.locations
      .filter((l) => l && typeof l === "object" && l.city)
      .map((l) => ({ street: l.street ?? "", city: l.city, state: l.state ?? "CA", zip: l.zip ?? "" }));
    return locations.length ? { multiple: locations } : null;
  }
  if (!address.city) return null;
  return { street: address.street ?? "", city: address.city, state: address.state ?? "CA", zip: address.zip ?? "" };
}

function addressCity(address) {
  if (!address) return null;
  return address.multiple ? address.multiple[0].city : address.city;
}

function normalizeAges(ages) {
  if (!ages || typeof ages !== "object") return null;
  const min = Number(ages.min);
  const max = Number(ages.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  return { min, max, unit: ages.unit === "grades" ? "grades" : "years" };
}

function normalizeSessions(dates) {
  if (!Array.isArray(dates)) return [];
  return dates
    .filter((d) => d && ISO_DATE.test(d.start) && ISO_DATE.test(d.end) && d.start <= d.end)
    .map((d) => ({ start: d.start, end: d.end }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function normalizePrice(price) {
  if (!price || typeof price !== "object" || !price.rates || typeof price.rates !== "object") return null;
  const rates = Object.entries(price.rates)
    .filter(([, cents]) => Number.isInteger(cents) && cents > 0)
    .map(([label, cents]) => ({ label: rateLabel(label), cents }));
  if (!rates.length) return null;
  return { unit: price.unit === "week" ? "week" : "session", rates };
}

function normalizeRegistration(registration) {
  if (!registration || typeof registration !== "object") return null;
  const out = {};
  if (ISO_DATE.test(registration.opens)) out.opens = registration.opens;
  if (ISO_DATE.test(registration.deadline)) out.deadline = registration.deadline;
  return Object.keys(out).length ? out : null;
}

const SOURCE_FIELDS = ["name", "operator", "kind", "address", "ages", "season", "dates", "price", "registration", "financialAid", "topics", "url"];

/**
 * One raw camp-finder line → the site's program record, or a reason it can't
 * be shown. `urls` is the shared URL table (a Map from URL to index) the
 * snapshot's per-field sources point into.
 */
export function normalizeRecord(raw, urls) {
  if (!raw || typeof raw !== "object") return { problem: "not an object" };
  const id = String(raw.id ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return { problem: `bad id ${JSON.stringify(raw.id)}` };
  if (!raw.name || !raw.operator) return { problem: `${id}: missing name or operator` };
  if (!/^https?:\/\//.test(String(raw.url ?? ""))) return { problem: `${id}: missing the camp's own page` };
  const address = normalizeAddress(raw.address);
  const city = canonicalCity(addressCity(address));
  if (!city) return { problem: `${id}: no city` };
  const season = Number(raw.season);
  if (!Number.isInteger(season)) return { problem: `${id}: no season` };

  const indexOf = (url) => {
    if (!urls.has(url)) urls.set(url, urls.size);
    return urls.get(url);
  };
  const src = {};
  for (const field of SOURCE_FIELDS) {
    const s = raw.sources?.[field];
    if (s && /^https?:\/\//.test(String(s.url ?? "")) && ISO_DATE.test(s.checked)) {
      src[field] = [indexOf(s.url), s.checked];
    }
  }
  const checked = Object.values(src).map(([, d]) => d).sort().at(-1) ?? null;
  const sessions = normalizeSessions(raw.dates);
  const topics = (Array.isArray(raw.topics) ? raw.topics : []).filter((t) => t in TOPIC_LABELS);
  const aid = raw.financialAid === "yes" || raw.financialAid === "no" ? raw.financialAid : "not stated";

  return {
    program: {
      id,
      name: displayName(raw.name),
      operator: String(raw.operator).trim(),
      operatorSlug: slugify(raw.operator),
      kind: raw.kind === "overnight" ? "overnight" : "day",
      city: city.name,
      citySlug: city.slug,
      address,
      ages: normalizeAges(raw.ages),
      season,
      sessions,
      price: normalizePrice(raw.price),
      registration: normalizeRegistration(raw.registration),
      financialAid: aid,
      topics,
      url: String(raw.url),
      urlIndex: indexOf(String(raw.url)),
      checked,
      src,
    },
  };
}

/** Monday of the week holding an ISO date. */
function mondayOf(iso) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  const dow = new Date(t).getUTCDay(); // 0 Sun … 6 Sat
  const back = dow === 0 ? 6 : dow - 1;
  return new Date(t - back * DAY_MS).toISOString().slice(0, 10);
}

function addDays(iso, n) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** "Jun 7–11", "Jun 28–Jul 2" */
export function weekLabel(start, end) {
  const [, sm, sd] = start.split("-").map(Number);
  const [, em, ed] = end.split("-").map(Number);
  return sm === em ? `${MONTHS[sm - 1]} ${sd}–${ed}` : `${MONTHS[sm - 1]} ${sd}–${MONTHS[em - 1]} ${ed}`;
}

/** The Monday-to-Friday summer weeks (June through August) that hold at least
 *  one posted session for `season`. */
export function summerWeeks(programs, season) {
  const mondays = new Set();
  for (const p of programs) {
    if (p.season !== season) continue;
    for (const s of p.sessions) {
      for (let monday = mondayOf(s.start); monday <= s.end; monday = addDays(monday, 7)) {
        const month = Number(monday.slice(5, 7));
        const friday = addDays(monday, 4);
        if (friday < s.start) continue;
        if (Number(friday.slice(5, 7)) >= 6 && month <= 8) mondays.add(monday);
      }
    }
  }
  return [...mondays].sort().map((start) => {
    const end = addDays(start, 4);
    return { start, end, label: weekLabel(start, end) };
  });
}

function priceRange(price, sessions) {
  if (!price) return null;
  const cents = price.rates.map((r) => r.cents);
  // A session that runs one week reads as a weekly price.
  const oneWeek = sessions.length > 0 && sessions.every((s) => days(s.start, s.end) <= 7);
  return { min: Math.min(...cents), max: Math.max(...cents), per: price.unit === "week" || oneWeek ? "week" : "session" };
}

// Registration platforms that host many unrelated camps: their first path
// segment names the organization, so it is part of the site key.
const SHARED_HOSTS = /(^|\.)(activecommunities\.com|perfectmind\.com|active\.com|ultracamp\.com|campminder\.com|campbrainregistration\.com)$/;

/** Which camp website a URL belongs to: its host without "www.", plus the
 *  organization's path segment on shared registration platforms. */
export function siteKey(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (SHARED_HOSTS.test(host)) return `${host}/${(u.pathname.split("/").filter(Boolean)[0] ?? "").toLowerCase()}`;
    return host;
  } catch {
    return null;
  }
}

const plain = (text) => String(text).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'").toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();

/**
 * The camps the site listed by hand for summer 2026 (src/data/south-bay/
 * camps-data.ts) that the sourced directory doesn't cover yet: no program on
 * the same camp website, and no operator whose name the listing carries. They
 * stay on /camps as "more camps to check" until the operator sources them.
 */
export function stillToCheck(legacy, snapshot) {
  const sites = new Set(snapshot.urls.map(siteKey).filter(Boolean));
  const operators = [...new Set(snapshot.programs.map((p) => plain(p.operator)))].filter((o) => o.length >= 8);
  return legacy
    .filter((l) => /^https?:\/\//.test(l.url))
    .filter((l) => !sites.has(siteKey(l.url)) && !operators.some((o) => plain(l.name).includes(o)))
    .map((l) => ({ name: l.name, city: l.city.replace(/\bSan Jose\b/g, "San José"), url: l.url }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** {name, cityName, registerUrl} out of camps-data.ts without importing TypeScript. */
export function parseLegacyCamps(source) {
  const camps = [];
  for (const block of String(source).split(/^\s*\{/gm)) {
    const name = block.match(/\bname:\s*"([^"]+)"/)?.[1];
    const city = block.match(/\bcityName:\s*"([^"]+)"/)?.[1];
    const url = block.match(/\bregisterUrl:\s*"([^"]+)"/)?.[1];
    if (name && city && url) camps.push({ name, city, url });
  }
  return camps;
}

/**
 * Raw JSONL lines → { snapshot, index, problems }. Duplicate ids keep the
 * newest season (the operator updates a program in place when next summer
 * posts; a stale twin must not shadow it).
 */
export function buildSnapshot(lines, { dataCommit = null, region, regionName, legacy = [] }) {
  const problems = [];
  const urls = new Map();
  const byId = new Map();
  lines.forEach((line, i) => {
    let raw;
    try {
      raw = typeof line === "string" ? JSON.parse(line) : line;
    } catch {
      problems.push(`line ${i + 1}: not JSON`);
      return;
    }
    const { program, problem } = normalizeRecord(raw, urls);
    if (problem) {
      problems.push(problem);
      return;
    }
    const existing = byId.get(program.id);
    if (existing && existing.season > program.season) return;
    byId.set(program.id, program);
  });

  // Rebuild the URL table from the kept programs only, so a dropped twin
  // leaves no orphan URLs behind.
  const kept = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const oldUrls = [...urls.keys()];
  const table = new Map();
  const remap = (i) => {
    const url = oldUrls[i];
    if (!table.has(url)) table.set(url, table.size);
    return table.get(url);
  };
  for (const p of kept) {
    p.urlIndex = remap(p.urlIndex);
    for (const field of Object.keys(p.src)) p.src[field] = [remap(p.src[field][0]), p.src[field][1]];
  }

  const latestSeason = kept.reduce((max, p) => Math.max(max, p.season), 0);
  const posted = (p) => p.season === latestSeason && p.sessions.length > 0 && p.price;
  const checkedThrough = kept.map((p) => p.checked).filter(Boolean).sort().at(-1) ?? null;
  const counts = {
    programs: kept.length,
    operators: new Set(kept.map((p) => p.operatorSlug)).size,
    cities: new Set(kept.map((p) => p.citySlug)).size,
    latestSeason,
    inLatestSeason: kept.filter((p) => p.season === latestSeason).length,
    postedLatestSeason: kept.filter(posted).length,
  };

  const snapshot = {
    schema: 1,
    region,
    regionName,
    dataCommit,
    checkedThrough,
    counts,
    urls: [...table.keys()],
    programs: kept,
  };

  // The directory island's list: what a card and the filters need, nothing else.
  const operators = [...new Map(kept.map((p) => [p.operatorSlug, p.operator])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([slug, name]) => ({ slug, name }));
  const opIndex = new Map(operators.map((o, i) => [o.slug, i]));
  const cities = [...new Map(kept.map((p) => [p.citySlug, p.city])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([slug, name]) => ({ slug, name }));
  const index = {
    schema: 1,
    checkedThrough,
    latestSeason,
    weeks: summerWeeks(kept, latestSeason),
    operators,
    cities,
    stillToCheck: stillToCheck(legacy, snapshot),
    programs: kept.map((p) => {
      const row = {
        id: p.id,
        name: p.name,
        op: opIndex.get(p.operatorSlug),
        city: p.citySlug,
        season: p.season,
        topics: p.topics,
      };
      if (p.ages) row.ages = [p.ages.min, p.ages.max];
      if (p.ages?.unit === "grades") row.grades = true;
      if (p.sessions.length) row.sessions = p.sessions.map((s) => [s.start, s.end]);
      const price = priceRange(p.price, p.sessions);
      if (price) row.price = [price.min, price.max, price.per];
      if (p.financialAid === "yes") row.aid = true;
      if (p.kind === "overnight") row.overnight = true;
      if (p.registration?.opens) row.opens = p.registration.opens;
      if (p.registration?.deadline) row.deadline = p.registration.deadline;
      return row;
    }),
  };

  return { snapshot, index, problems };
}
