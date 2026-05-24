// ---------------------------------------------------------------------------
// South Bay Today — Daily Newsletter
// Shared helpers: env, Resend API, data loaders, HTML renderer.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadEnvLocal } from "../lib/env.mjs";
import { ARTIFACTS, DATA_DIR, REPO_ROOT } from "../lib/paths.mjs";

loadEnvLocal();

// ── Resend ─────────────────────────────────────────────────────────────────

const RESEND_BASE = "https://api.resend.com";

export async function resendFetch(path, init = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing — add to .env.local");
  const res = await fetch(`${RESEND_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === "object" && body?.message ? body.message : text;
    throw new Error(`Resend ${init.method || "GET"} ${path} → ${res.status}: ${msg}`);
  }
  return body;
}

// ── Date helpers (Pacific Time) ────────────────────────────────────────────

export function todayPT() {
  // YYYY-MM-DD for "today" in America/Los_Angeles
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
}

export function formatLongDate(isoDate) {
  // "Wednesday, May 6, 2026" — interpret as PT to avoid TZ drift
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12)); // noon UTC ≈ stable
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(dt);
}

// ── Data loaders ───────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadSocialSchedule() {
  return readJson(join(DATA_DIR, "social-schedule.json"));
}

export function loadDefaultPlans() {
  return readJson(join(DATA_DIR, "default-plans.json"));
}

export function loadEvents() {
  return readJson(ARTIFACTS.events);
}

export function loadOpenings() {
  return readJson(ARTIFACTS.foodOpenings);
}

export function loadAirQuality() {
  return readJson(ARTIFACTS.airQuality);
}

// ── Weather (Open-Meteo, no key) ───────────────────────────────────────────

const WMO = {
  0:  ["☀️", "Clear sky"], 1:  ["🌤", "Mostly clear"], 2:  ["⛅", "Partly cloudy"], 3:  ["☁️", "Overcast"],
  45: ["🌫️", "Fog"], 48: ["🌫", "Freezing fog"],
  51: ["🌦", "Light drizzle"], 53: ["🌦", "Drizzle"], 55: ["🌧", "Heavy drizzle"],
  61: ["🌧", "Light rain"], 63: ["🌧", "Rain"], 65: ["🌧", "Heavy rain"],
  71: ["🌨", "Light snow"], 73: ["🌨", "Snow"], 75: ["🌨", "Heavy snow"],
  80: ["🌦", "Rain showers"], 81: ["🌧", "Rain showers"], 82: ["⛈", "Heavy showers"],
  95: ["⛈", "Thunderstorm"], 96: ["⛈", "Thunderstorm + hail"], 99: ["⛈", "Thunderstorm + hail"],
};

function forecastEmoji(code, cloudCoverMean, rainPct) {
  if (code >= 51) return WMO[code] || ["🌡", "Unknown"];
  if ((rainPct ?? 0) >= 50) return WMO[code >= 51 ? code : 61] || ["🌧", "Rain"];
  const cc = cloudCoverMean ?? -1;
  if (cc < 0) {
    if (code === 0) return ["☀️", "Sunny"];
    if (code === 1) return ["☀️", "Mostly sunny"];
    if (code === 2) return ["🌤", "Mostly sunny"];
    if (code === 3) return ["⛅", "Partly cloudy"];
    return WMO[code] || ["🌡", "Unknown"];
  }
  if (cc < 25) return ["☀️", "Sunny"];
  if (cc < 55) return ["🌤", "Mostly sunny"];
  if (cc < 80) return ["⛅", "Partly cloudy"];
  return ["☁️", "Cloudy"];
}

export async function fetchWeather() {
  // Campbell, CA — same anchor the site uses.
  const url = "https://api.open-meteo.com/v1/forecast?latitude=37.2872&longitude=-121.95"
    + "&current=temperature_2m,weather_code"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloud_cover_mean"
    + "&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles&forecast_days=2";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const tempNow = Math.round(data.current.temperature_2m);
    const codeNow = data.current.weather_code;
    const [emoji] = WMO[codeNow] || ["🌡"];
    const high = Math.round(data.daily.temperature_2m_max[0]);
    const low = Math.round(data.daily.temperature_2m_min[0]);
    const rainPct = data.daily.precipitation_probability_max[0];
    const cc = data.daily.cloud_cover_mean?.[0];
    const [, dayDesc] = forecastEmoji(data.daily.weather_code[0], cc, rainPct);
    return { emoji, tempNow, high, low, rainPct, dayDesc };
  } catch {
    return null;
  }
}

export function loadMeetings() {
  return readJson(ARTIFACTS.meetings);
}

export function loadRedditPulse() {
  return readJson(ARTIFACTS.redditPulse);
}

// Reuses the regex-based parser from generate-sv-history.mjs.
export function loadMilestones() {
  const src = readFileSync(join(DATA_DIR, "tech-companies.ts"), "utf8");
  const startIdx = src.indexOf("export const TECH_MILESTONES");
  if (startIdx === -1) return [];
  const nextExport = src.indexOf("\nexport ", startIdx + 1);
  const section = nextExport !== -1 ? src.slice(startIdx, nextExport) : src.slice(startIdx);

  const milestones = [];
  const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  while ((match = objectPattern.exec(section)) !== null) {
    const block = match[0];
    const getStr = (k) => {
      const m = block.match(new RegExp(`${k}:\\s*["'\`]([\\s\\S]*?)["'\`]\\s*[,}]`));
      return m ? m[1] : null;
    };
    const getNum = (k) => {
      const m = block.match(new RegExp(`${k}:\\s*(\\d+)`));
      return m ? parseInt(m[1]) : null;
    };
    const id = getStr("id");
    const month = getNum("month");
    const day = getNum("day");
    if (!id || month === null || day === null) continue;
    milestones.push({
      id, company: getStr("company") || id, city: getStr("city") || "",
      foundedYear: getNum("foundedYear") || 0, month, day,
      tagline: getStr("tagline") || "", anniversaryNote: getStr("anniversaryNote") || "",
      url: getStr("url") || "",
    });
  }
  return milestones;
}

// ── Today's content assembler ──────────────────────────────────────────────

export async function assembleNewsletterData(date, opts = {}) {
  const editorialEnabled = opts.editorial ?? shouldRunEditorialPass();
  const defaultPlans = loadDefaultPlans();
  const dayPlan = makeNewsletterPlan(defaultPlans.plans?.adults, date);

  const allEvents = loadEvents().events || [];
  const todayEvents = allEvents
    .filter((e) => e.date === date && !e.ongoing)
    .filter((e) => e.time && !/^12:00\s*am/i.test(e.time))
    .sort((a, b) => parseTimeMinutes(a.time) - parseTimeMinutes(b.time));

  const openings = loadOpenings();
  const recentOpenings = (openings.opened || [])
    .filter((o) => daysBetween(o.date, date) >= 0 && daysBetween(o.date, date) <= 10)
    .slice(0, 6);

  const meetings = loadMeetings().meetings || {};
  const tonightMeetings = Object.entries(meetings)
    .filter(([, m]) => m?.date === date)
    .map(([city, m]) => ({ city, ...m }));

  const [, monthStr, dayStr] = date.split("-");
  const milestones = loadMilestones();
  const todayHistory = milestones.filter(
    (m) => m.month === parseInt(monthStr) && m.day === parseInt(dayStr)
  );

  const redditCandidates = pickRedditPosts(loadRedditPulse().posts || [], 10);
  const redditPosts = redditCandidates.slice(0, 4);
  const weather = await fetchWeather();
  const tonightPick = pickTonightEvent(todayEvents);
  const featuredEvents = pickFeaturedEvents(todayEvents, { dayPlan, tonightPick, limit: 10 });
  const dayPlanBlurb = dayPlan ? buildDayPlanBlurb(dayPlan, weather) : "";
  const tonightPickBlurb = tonightPick ? buildTonightBlurb(tonightPick) : "";

  const data = {
    date,
    longDate: formatLongDate(date),
    dayPlan, dayPlanBlurb,
    tonightPick, tonightPickBlurb,
    todayEvents,
    featuredEvents,
    recentOpenings,
    tonightMeetings,
    weather,
    todayHistory,
    redditPosts,
    editorial: null,
    editorialMeta: { status: editorialEnabled ? "pending" : "disabled" },
  };

  if (!editorialEnabled) return data;

  return applyEditorialPass(data, {
    eventCandidates: pickEditorialEventCandidates(todayEvents, { dayPlan, limit: 36 }),
    openingCandidates: recentOpenings,
    redditCandidates,
  });
}

function makeNewsletterPlan(plan, date) {
  if (!plan?.cards?.length) return null;
  return {
    ...plan,
    planDate: plan.planDate || date,
    cityName: cityName(plan.city),
    planUrl: "https://southbaytoday.org/",
  };
}

function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return Infinity;
  const from = new Date(`${fromDate}T12:00:00Z`).getTime();
  const to = new Date(`${toDate}T12:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Infinity;
  return Math.round((to - from) / 86400000);
}

const BUCKET_LABEL = {
  breakfast: "Breakfast",
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  evening: "Evening",
};
const BUCKET_ORDER = ["breakfast", "morning", "lunch", "afternoon", "dinner", "evening"];

function orderedCards(plan) {
  const cards = plan?.cards || [];
  return [...cards].sort((a, b) => {
    const ai = BUCKET_ORDER.indexOf(a.bucket);
    const bi = BUCKET_ORDER.indexOf(b.bucket);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return parseTimeMinutes(a.eventTime || a.timeBlock) - parseTimeMinutes(b.eventTime || b.timeBlock);
  });
}

function humanList(items) {
  const clean = items.filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean.at(-1)}`;
}

function buildDayPlanBlurb(plan, weather) {
  const cards = orderedCards(plan);
  const cities = [...new Set(cards.map((c) => cityName(c.city)).filter(Boolean))].slice(0, 3);
  const standout = cards.find((c) => c.source === "event") || cards.find((c) => c.bucket === "evening") || cards[0];
  const dayDesc = weather?.dayDesc ? lowerFirst(weather.dayDesc) : "steady weather";
  const weatherBit = weather
    ? `${dayDesc}, high ${weather.high}°`
    : "a full day of options";
  const cityBit = cities.length ? `around ${humanList(cities)}` : "around the South Bay";
  const standoutBit = standout
    ? ` The one I would notice first: ${standout.name}${standout.blurb ? `, ${lowerFirst(trimPeriod(standout.blurb))}` : ""}.`
    : "";
  return `Today's plan is a flexible menu ${cityBit}: a place to start, somewhere to wander, and a dinner/evening idea if the day keeps going. Weather looks like ${weatherBit}.${standoutBit}`;
}

function lowerFirst(s) {
  if (!s) return "";
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function trimPeriod(s) {
  return String(s || "").trim().replace(/[.。]+$/, "");
}

function buildTonightBlurb(event) {
  const why = event.blurb || event.description || "";
  const where = event.venue
    ? `at ${event.venue}${event.city ? ` in ${cityName(event.city)}` : ""}`
    : (event.city ? `in ${cityName(event.city)}` : "");
  const lead = [
    event.cost === "free" ? "Free" : null,
    event.time ? `at ${event.time}` : null,
    where,
  ].filter(Boolean).join(" ");
  const detail = why
    ? trimPeriod(why).slice(0, 220)
    : "A specific, low-friction evening option if you want one clear answer";
  return `${lead ? `${lead}. ` : ""}${detail}.`;
}

function pickTonightEvent(events) {
  const choices = events
    .filter((e) => !e.virtual)
    .filter((e) => parseTimeMinutes(e.time) >= 16 * 60)
    .filter((e) => e.url)
    .filter((e) => !/\b(board|commission|committee|meeting|study session|webinar|book club)\b/i.test(e.title || ""))
    .map((e) => ({ event: e, score: scoreEvent(e, true) }))
    .sort((a, b) => b.score - a.score);
  return choices[0]?.event || null;
}

function pickFeaturedEvents(events, { dayPlan, tonightPick, limit }) {
  const used = new Set();
  for (const c of orderedCards(dayPlan)) {
    used.add(normalizeComparable(c.name));
    used.add(normalizeComparable(c.id));
  }
  if (tonightPick) used.add(normalizeComparable(tonightPick.title));
  return events
    .filter((e) => !used.has(normalizeComparable(e.title)) && !used.has(normalizeComparable(e.id)))
    .map((e) => ({ event: e, score: scoreEvent(e, false) }))
    .sort((a, b) => b.score - a.score || parseTimeMinutes(a.event.time) - parseTimeMinutes(b.event.time))
    .slice(0, limit)
    .map((x) => x.event);
}

const LOCAL_REDDIT_SUBS = new Set([
  "SanJose", "sanjose", "Sunnyvale", "sunnyvale", "santaclara", "mountainview",
  "PaloAlto", "paloalto", "Cupertino", "LosGatos", "campbell", "Milpitas",
]);
const LOCAL_REDDIT_TERMS = /\b(san jose|south bay|santa clara|sunnyvale|mountain view|palo alto|cupertino|campbell|los gatos|saratoga|los altos|milpitas|morgan hill|gilroy)\b/i;

function pickRedditPosts(posts, limit) {
  return posts
    .map((post, index) => ({ post, score: scoreRedditPost(post, index) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.post);
}

function scoreRedditPost(post, index) {
  const title = `${post.displayTitle || post.title || ""} ${post.summary || ""}`;
  let score = Math.max(0, 40 - index);
  if (LOCAL_REDDIT_SUBS.has(post.sub)) score += 45;
  if (LOCAL_REDDIT_TERMS.test(title)) score += 30;
  if (post.numComments) score += Math.min(25, Math.log2(post.numComments + 1) * 5);
  if (post.score) score += Math.min(15, Math.log2(post.score + 1) * 2);
  if (!LOCAL_REDDIT_SUBS.has(post.sub) && !LOCAL_REDDIT_TERMS.test(title)) score -= 70;
  return score;
}

function normalizeComparable(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreEvent(e, tonight) {
  let score = 0;
  const hour = parseTimeMinutes(e.time);
  if (Number.isFinite(hour) && hour < 9999) score += 10;
  if (tonight && hour >= 17 * 60) score += 10;
  if (e.image) score += 5;
  if (e.blurb) score += 8;
  if (e.cost === "free") score += 4;
  if (e.kidFriendly) score += 2;
  if (e.virtual) score -= 20;
  if (/\b(board|commission|committee|meeting|study session|webinar)\b/i.test(e.title || "")) score -= 15;
  if (/\b(book club|storytime|story time|support group|office hours)\b/i.test(e.title || "")) score -= 6;
  return score;
}

function shouldRunEditorialPass() {
  const v = String(process.env.SBT_NEWSLETTER_EDITORIAL || "1").toLowerCase();
  return !["0", "false", "off", "no"].includes(v);
}

function pickEditorialEventCandidates(events, { dayPlan, limit }) {
  const used = new Set();
  for (const c of orderedCards(dayPlan)) {
    used.add(normalizeComparable(c.name));
    used.add(normalizeComparable(c.id));
  }

  const eligible = events
    .filter((e) => e.url)
    .filter((e) => !used.has(normalizeComparable(e.title)) && !used.has(normalizeComparable(e.id)))
    .map((event) => ({ event, score: scoreEvent(event, false) + editorialEventBoost(event) }));

  const topOverall = [...eligible].sort((a, b) => b.score - a.score).slice(0, Math.ceil(limit * 0.75));
  const evening = [...eligible]
    .filter(({ event }) => parseTimeMinutes(event.time) >= 16 * 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  const chronological = [...eligible]
    .sort((a, b) => parseTimeMinutes(a.event.time) - parseTimeMinutes(b.event.time))
    .slice(0, 8);

  const seen = new Set();
  const merged = [];
  for (const { event } of [...topOverall, ...evening, ...chronological]) {
    const key = normalizeComparable(event.id || event.title);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
    if (merged.length >= limit) break;
  }
  return merged;
}

function editorialEventBoost(e) {
  let score = 0;
  if (/\b(concert|jazz|festival|market|launch|opening|workshop|tour|hike|dance|film|comedy|theater|theatre)\b/i.test(e.title || "")) score += 8;
  if (/\b(farmers'? market|storytime|reading buddies|book club|office hours)\b/i.test(e.title || "")) score -= 4;
  if (parseTimeMinutes(e.time) >= 17 * 60) score += 3;
  if (e.venue) score += 2;
  return score;
}

async function applyEditorialPass(data, candidates) {
  const packet = buildEditorialPacket(data, candidates);
  const prompt = buildEditorialPrompt(packet);
  const raw = await callClaudeNewsletterEditor(prompt);
  const edit = parseClaudeJson(raw);
  const revised = applyEditorialJson(data, candidates, edit);
  revised.editorialMeta = {
    status: "claude",
    model: process.env.SBT_NEWSLETTER_CLAUDE_MODEL || "opus",
    eventCandidates: candidates.eventCandidates.length,
    openingCandidates: candidates.openingCandidates.length,
    redditCandidates: candidates.redditCandidates.length,
    generatedAt: new Date().toISOString(),
  };
  return revised;
}

function buildEditorialPacket(data, candidates) {
  return {
    date: data.longDate,
    editorialMemory: newsletterMemoryForPrompt(loadNewsletterEditorialMemory()),
    weather: data.weather ? {
      now: `${data.weather.tempNow}F`,
      high: data.weather.high,
      low: data.weather.low,
      rainPct: data.weather.rainPct,
      description: data.weather.dayDesc,
    } : null,
    dayPlan: data.dayPlan ? {
      city: data.dayPlan.cityName || cityName(data.dayPlan.city),
      cards: orderedCards(data.dayPlan).map((c, idx) => ({
        idx,
        slot: BUCKET_LABEL[c.bucket] || c.timeBlock || "Idea",
        name: c.name,
        time: c.eventTime || c.timeBlock || "",
        venue: c.venue || "",
        city: cityName(c.city),
        cost: c.cost === "free" ? "free" : (c.costNote || c.kidsCostNote || ""),
        blurb: compactText(c.blurb, 180),
      })),
    } : null,
    eventCandidates: candidates.eventCandidates.map((e, idx) => compactEventForEditor(e, idx)),
    openingCandidates: candidates.openingCandidates.map((o, idx) => ({
      idx,
      name: o.name,
      city: o.cityName || o.cityId || "",
      address: o.address || "",
      opened: o.date || "",
      blurb: compactText(o.blurb, 180),
    })),
    meetings: data.tonightMeetings.map((m, idx) => ({
      idx,
      city: cityName(m.city),
      body: m.bodyName || "Meeting",
      time: m.time || "",
      location: m.location || "",
    })),
    history: data.todayHistory.map((h, idx) => ({
      idx,
      company: h.company,
      city: h.city,
      year: h.foundedYear,
      note: compactText(h.anniversaryNote || h.tagline, 240),
    })),
    redditCandidates: candidates.redditCandidates.map((p, idx) => ({
      idx,
      sub: p.sub || "",
      title: p.displayTitle || p.title || "",
      score: p.score || 0,
      comments: p.numComments || 0,
      summary: compactText(p.summary, 180),
    })),
  };
}

const NEWSLETTER_HISTORY_FILE = join(DATA_DIR, "newsletter-send-history.jsonl");
const NEWSLETTER_MEMORY_FILE = join(DATA_DIR, "newsletter-editorial-memory.json");

function loadNewsletterEditorialMemory() {
  try {
    return JSON.parse(readFileSync(NEWSLETTER_MEMORY_FILE, "utf8"));
  } catch {
    return null;
  }
}

function newsletterMemoryForPrompt(memory) {
  if (!memory) return null;
  return {
    guidance: (memory.guidance || []).slice(-10),
    recentReflections: (memory.reflections || []).slice(-5).map((r) => ({
      date: r.date,
      score: r.score,
      keepDoing: r.keepDoing,
      improveNext: r.improveNext,
      avoid: r.avoid,
    })),
  };
}

function compactEventForEditor(e, idx) {
  return {
    idx,
    id: e.id || "",
    title: e.title || "",
    time: e.time || "",
    venue: e.venue || "",
    city: cityName(e.city),
    category: e.category || "",
    cost: e.cost || "",
    audience: e.audienceAge || (e.kidFriendly ? "kids/family" : ""),
    blurb: compactText(e.blurb || e.description, 220),
  };
}

function buildEditorialPrompt(packet) {
  return `You are the morning editor for South Bay Today, a genuinely useful local briefing for Santa Clara County.

Thesis: we have an excellent pile of local data and access to strong AI, so the email should feel edited, selective, and coherent. The target reaction is: "oh damn, this is my morning South Bay briefing."

Your job:
- Read the editor packet.
- Use the editorialMemory notes when present; they are lessons from prior sends.
- Choose what belongs in the email.
- Cut boring, overly generic, repetitive, or awkward items.
- Write the morning note and section blurbs.
- Return structured JSON only.

Voice:
- Smart, warm, specific, lightly opinionated. A competent local friend who actually read the calendar.
- Useful beats hype. If the day is quiet, say so plainly and still make the useful parts easy to see.
- No corporate newsletter voice. No "unlock", "curated just for you", "vibrant", "hidden gem", or "don't miss."
- Avoid em dashes. Use commas, periods, or parentheses.

Fact rules:
- Use only facts in the packet. Do not infer addresses, prices, ages, quality, or popularity.
- Do not claim "every event." This is a selected briefing.
- Selected indexes must come from the arrays provided.
- If a section has weak material, select fewer items.

Selection guidance:
- Pick one evening item only if it is specific, local, and plausible as a good answer to "what should I do tonight?"
- Featured events should be balanced: adult/family/free/outdoor/culture when available. Do not let generic library items crowd out stronger citywide events unless the day is genuinely family-heavy.
- Reddit items should be South Bay-specific conversation, not generic Bay Area chatter.
- Openings should be readable; skip raw or overly bureaucratic entries if they make the email worse.

Return JSON with exactly these keys:
{
  "briefing": "2-3 sentences opening the morning. Mention the strongest patterns or tradeoffs in today's material.",
  "dayPlanHeadline": "short headline for the field guide",
  "dayPlanBlurb": "2-3 sentences making the plan feel intentional, without pretending it is perfect",
  "tonightPickIdx": 0,
  "tonightPickBlurb": "1-2 sentences why this is the evening pick, using only packet facts",
  "featuredEventIdxs": [0, 1, 2, 3, 4, 5],
  "eventsHeading": "short section heading",
  "eventsNote": "1 sentence explaining the shape of the selected events",
  "openingIdxs": [0, 1],
  "openingsHeading": "short section heading",
  "openingsNote": "1 sentence, or empty string if not useful",
  "redditIdxs": [0, 1, 2, 3],
  "conversationHeading": "short section heading",
  "conversationNote": "1 sentence framing the local chatter"
}

Use null for tonightPickIdx if none is strong enough. Use empty arrays for weak optional sections.

EDITOR PACKET:
${JSON.stringify(packet, null, 2)}
`;
}

const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || "/opt/homebrew/bin/claude";

async function callClaudeNewsletterEditor(instructions) {
  const model = process.env.SBT_NEWSLETTER_CLAUDE_MODEL || "opus";
  const timeoutMs = Number(process.env.SBT_NEWSLETTER_CLAUDE_TIMEOUT_MS || 120_000);
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(value);
    };
    const proc = spawn(CLAUDE_CLI, [
      "-p",
      "--model", model,
      "--output-format", "text",
      "--no-session-persistence",
    ], { cwd: "/tmp", timeout: timeoutMs });
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => finish(new Error(`claude spawn failed: ${err.message}`)));
    proc.on("close", (code, signal) => {
      if (signal) return finish(new Error(`claude killed by ${signal}: ${(stderr || stdout).slice(0, 500)}`));
      if (code !== 0) return finish(new Error(`claude exit ${code}: ${(stderr || stdout).slice(0, 500)}`));
      finish(null, stdout);
    });
    proc.stdin.end(instructions);
  });
}

function parseClaudeJson(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error(`Claude editor returned non-JSON: ${cleaned.slice(0, 500)}`);
  }
}

function applyEditorialJson(data, candidates, edit) {
  const eventByIdx = new Map(candidates.eventCandidates.map((e, idx) => [idx, e]));
  const openingByIdx = new Map(candidates.openingCandidates.map((o, idx) => [idx, o]));
  const redditByIdx = new Map(candidates.redditCandidates.map((p, idx) => [idx, p]));

  const tonightIdx = integerOrNull(edit.tonightPickIdx);
  const tonightPick = tonightIdx === null ? null : eventByIdx.get(tonightIdx) || null;
  const featured = pickByIndexes(eventByIdx, edit.featuredEventIdxs, 10)
    .filter((e) => !tonightPick || normalizeComparable(e.id || e.title) !== normalizeComparable(tonightPick.id || tonightPick.title));
  const fallbackFeatured = data.featuredEvents
    .filter((e) => !tonightPick || normalizeComparable(e.id || e.title) !== normalizeComparable(tonightPick.id || tonightPick.title));

  const openings = pickByIndexes(openingByIdx, edit.openingIdxs, 6);
  const reddit = pickByIndexes(redditByIdx, edit.redditIdxs, 4);

  return {
    ...data,
    dayPlanBlurb: limitedString(edit.dayPlanBlurb, 650) || data.dayPlanBlurb,
    tonightPick: tonightPick || data.tonightPick,
    tonightPickBlurb: limitedString(edit.tonightPickBlurb, 500) || (tonightPick ? buildTonightBlurb(tonightPick) : data.tonightPickBlurb),
    featuredEvents: featured.length ? uniqueItems(featured, 10) : uniqueItems(fallbackFeatured, 10),
    recentOpenings: openings.length ? openings : data.recentOpenings,
    redditPosts: reddit.length ? reddit : data.redditPosts,
    editorial: {
      briefing: limitedString(edit.briefing, 800),
      dayPlanHeadline: limitedString(edit.dayPlanHeadline, 120),
      eventsHeading: limitedString(edit.eventsHeading, 80),
      eventsNote: limitedString(edit.eventsNote, 240),
      openingsHeading: limitedString(edit.openingsHeading, 80),
      openingsNote: limitedString(edit.openingsNote, 220),
      conversationHeading: limitedString(edit.conversationHeading, 80),
      conversationNote: limitedString(edit.conversationNote, 220),
    },
  };
}

function integerOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function pickByIndexes(map, raw, limit) {
  const out = [];
  const seen = new Set();
  const indexes = Array.isArray(raw) ? raw : [];
  for (const value of indexes) {
    const idx = Number(value);
    if (!Number.isInteger(idx)) continue;
    if (seen.has(idx)) continue;
    const item = map.get(idx);
    if (!item) continue;
    seen.add(idx);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function uniqueItems(items, max) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = normalizeComparable(item?.id || item?.title || item?.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function limitedString(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function compactText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Ask Claude to rewrite social copy as a newsletter blurb.
export async function rewriteForEmail(text, kind /* "plan" | "pick" */) {
  if (!text) return "";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing — add to .env.local");

  const SYSTEM = "You're an editor for South Bay Today, a hyperlocal Santa Clara County newsletter. Voice: smart, well-informed neighbor — direct, warm, never corporate. You take social copy and rewrite it for the morning email.";

  const guidance = kind === "pick"
    ? "This is the 'tonight's pick' blurb for a single event. 1-3 sentences. Email gets an image + a CTA button below the text, so don't say things like 'tap the link' or 'see below'."
    : "This is the 'plan for your day' blurb covering 5-8 stops. 2-4 sentences. Email gets an image of the schedule + a 'See the full plan' button below the text, so don't repeat the URL or say 'all linked here'.";

  const prompt = `${guidance}

Strip @-handles, hashtags, and trailing URL-dependent CTAs. Use natural place names ("Ridge Vineyards" not "@RidgeVineyards"). Keep specifics — venue names, times, what people will do. Read like a friend telling them what's on.

Original social copy:
"""
${text}
"""

Return ONLY the rewritten blurb, no quotes, no preamble.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content?.[0]?.text || "").trim().replace(/^["']|["']$/g, "");
}

function parseTimeMinutes(timeStr) {
  if (!timeStr) return 9999;
  const m = timeStr.match(/^(\d+)(?::(\d+))?\s*(am|pm)/i);
  if (!m) return 9999;
  let h = parseInt(m[1]);
  const min = m[2] ? parseInt(m[2]) : 0;
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h * 60 + min;
}

// ── HTML rendering ─────────────────────────────────────────────────────────

const PALETTE = {
  ink: "#1a1a2e",
  muted: "#5b6478",
  faint: "#9099a8",
  border: "#e4e6ee",
  bg: "#ffffff",
  card: "#f7f6fb",
  blue: "#3b4ef0",
  purple: "#7c3aed",
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const CITY_LABEL = {
  "san-jose": "San Jose", "santa-clara": "Santa Clara", "sunnyvale": "Sunnyvale",
  "mountain-view": "Mountain View", "palo-alto": "Palo Alto", "cupertino": "Cupertino",
  "campbell": "Campbell", "los-gatos": "Los Gatos", "saratoga": "Saratoga",
  "los-altos": "Los Altos", "milpitas": "Milpitas", "morgan-hill": "Morgan Hill",
  "gilroy": "Gilroy", "santa-clara-county": "Santa Clara County",
};
const cityName = (id) => CITY_LABEL[id] || (id || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export function renderEmail(data) {
  const subject = `South Bay Today — ${data.longDate}`;
  const html = wrapShell(subject, [
    headerBlock(data),
    weatherStrip(data.weather),
    briefingBlock(data.editorial?.briefing),
    dayPlanBlock(data.dayPlan, data.dayPlanBlurb, data.editorial),
    tonightPickBlock(data.tonightPick, data.tonightPickBlurb),
    eventsBlock(data.featuredEvents, data.todayEvents.length, data.editorial),
    openingsBlock(data.recentOpenings, data.date, data.editorial),
    meetingsBlock(data.tonightMeetings),
    historyBlock(data.todayHistory),
    conversationBlock(data.redditPosts, data.editorial),
    footerBlock(),
  ].filter(Boolean).join("\n"));
  return { subject, html };
}

function wrapShell(subject, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PALETTE.card};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${PALETTE.ink};">
<div style="max-width:620px;margin:0 auto;background:${PALETTE.bg};">
${body}
</div>
</body>
</html>`;
}

function headerBlock(data) {
  return `<div style="padding:28px 28px 12px 28px;border-bottom:1px solid ${PALETTE.border};">
  <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;">South Bay Today</div>
  <div style="font-size:22px;font-weight:700;margin-top:4px;color:${PALETTE.ink};">${esc(data.longDate)}</div>
</div>`;
}

function weatherStrip(w) {
  if (!w) return "";
  const rain = w.rainPct >= 30 ? ` · ${w.rainPct}% rain` : "";
  return `<div style="padding:14px 28px;background:${PALETTE.card};font-size:14px;color:${PALETTE.muted};">
  ${esc(w.emoji)} <strong style="color:${PALETTE.ink};">${esc(w.tempNow)}°F</strong> ${esc((w.dayDesc || "").toLowerCase())} · high ${esc(w.high)}°, low ${esc(w.low)}°${rain}
</div>`;
}

function briefingBlock(briefing) {
  if (!briefing) return "";
  return `<div style="padding:22px 28px;border-bottom:1px solid ${PALETTE.border};">
  <div style="font-size:16px;line-height:1.6;color:${PALETTE.ink};">${esc(briefing)}</div>
</div>`;
}

function dayPlanBlock(plan, blurb, editorial = null) {
  if (!plan) return "";
  const cards = orderedCards(plan);
  if (!cards.length) return "";
  const rows = cards.map(planCardRow).join("\n");
  const headline = editorial?.dayPlanHeadline || "A flexible South Bay day";
  const cta = plan.planUrl
    ? `<a href="${esc(plan.planUrl)}" style="display:inline-block;background:${PALETTE.blue};color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;font-size:15px;margin-top:18px;">Open the live guide →</a>`
    : "";
  return `<div style="padding:28px;">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:8px;">Today's field guide</div>
  <div style="font-size:18px;font-weight:700;color:${PALETTE.ink};margin-bottom:8px;">${esc(headline)}</div>
  <div style="font-size:15px;line-height:1.6;color:${PALETTE.ink};margin-bottom:16px;">${esc(blurb)}</div>
  <table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>
  ${cta}
</div>`;
}

function tonightPickBlock(pick, blurb) {
  if (!pick) return "";
  const meta = eventMeta(pick);
  const ticketUrl = pick.url || null;
  const ctaLabel = pick.cost === "paid" ? "Get tickets →" : "Event details →";
  const cta = ticketUrl
    ? `<a href="${esc(ticketUrl)}" style="display:inline-block;background:${PALETTE.blue};color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;font-size:15px;margin-top:14px;">${esc(ctaLabel)}</a>`
    : "";
  return `<div style="padding:0 28px 28px 28px;border-top:1px solid ${PALETTE.border};padding-top:28px;">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:8px;">Tonight's pick</div>
  <div style="font-size:18px;font-weight:700;color:${PALETTE.ink};">${esc(pick.title)}</div>
  ${meta ? `<div style="font-size:13px;color:${PALETTE.muted};margin-top:4px;">${esc(meta)}</div>` : ""}
  <div style="font-size:15px;line-height:1.6;color:${PALETTE.ink};margin-top:12px;">${esc(blurb)}</div>
  ${cta}
</div>`;
}

function planCardRow(card) {
  const label = BUCKET_LABEL[card.bucket] || card.timeBlock || "Idea";
  const name = card.url || card.mapsUrl
    ? `<a href="${esc(card.url || card.mapsUrl)}" style="color:${PALETTE.ink};text-decoration:none;font-weight:700;">${esc(card.name)}</a>`
    : `<span style="color:${PALETTE.ink};font-weight:700;">${esc(card.name)}</span>`;
  const meta = [
    card.eventTime || card.timeBlock,
    card.venue,
    card.city ? cityName(card.city) : null,
    card.cost === "free" ? "Free" : (card.costNote || card.kidsCostNote),
  ].filter(Boolean).join(" · ");
  const blurb = card.blurb
    ? `<div style="font-size:13px;color:${PALETTE.muted};line-height:1.45;margin-top:3px;">${esc(card.blurb)}</div>`
    : "";
  return `<tr>
    <td width="92" style="padding:10px 12px 10px 0;border-bottom:1px solid ${PALETTE.border};vertical-align:top;">
      <div style="font-size:12px;color:${PALETTE.faint};font-weight:700;text-transform:uppercase;letter-spacing:0.7px;">${esc(label)}</div>
    </td>
    <td style="padding:10px 0;border-bottom:1px solid ${PALETTE.border};vertical-align:top;">
      <div style="font-size:15px;line-height:1.35;">${name}</div>
      ${meta ? `<div style="font-size:13px;color:${PALETTE.muted};margin-top:3px;">${esc(meta)}</div>` : ""}
      ${blurb}
    </td>
  </tr>`;
}

function eventMeta(e) {
  return [
    e.time,
    e.venue,
    e.city ? cityName(e.city) : null,
    e.cost === "free" ? "Free" : null,
  ].filter(Boolean).join(" · ");
}

function eventsBlock(events, totalCount = events?.length || 0, editorial = null) {
  if (!events?.length) return "";
  const rows = events.map((e) => {
    const title = e.url
      ? `<a href="${esc(e.url)}" style="color:${PALETTE.ink};text-decoration:none;font-weight:600;">${esc(e.title)}</a>`
      : `<span style="color:${PALETTE.ink};font-weight:600;">${esc(e.title)}</span>`;
    const meta = eventMeta(e);
    const blurb = e.blurb
      ? `<div style="font-size:13px;color:${PALETTE.muted};line-height:1.45;margin-top:3px;">${esc(e.blurb)}</div>`
      : "";
    return `<tr><td style="padding:8px 0;border-bottom:1px solid ${PALETTE.border};vertical-align:top;">
      <div>${title}</div>
      ${meta ? `<div style="font-size:13px;color:${PALETTE.muted};margin-top:2px;">${esc(meta)}</div>` : ""}
      ${blurb}
    </td></tr>`;
  }).join("\n");
  const heading = editorial?.eventsHeading || "More good options today";
  const countNote = editorial?.eventsNote || (totalCount > events.length
    ? `The site has ${totalCount} timed events for today; these are the ones most likely to be useful.`
    : "A short list of timed events worth checking before you make plans.");
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:6px;">${esc(heading)}</div>
  <div style="font-size:13px;color:${PALETTE.muted};line-height:1.45;margin-bottom:12px;">${esc(countNote)} <a href="https://southbaytoday.org/#events" style="color:${PALETTE.blue};text-decoration:none;">Open the full calendar →</a></div>
  <table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>
</div>`;
}

function openingsBlock(openings, date, editorial = null) {
  if (!openings?.length) return "";
  const items = openings.map((o) => {
    const cityId = (o.cityId || o.cityName || "").toLowerCase().replace(/ /g, "-");
    const locParts = [o.address, cityName(cityId)].filter(Boolean);
    const loc = locParts.length ? ` <span style="color:${PALETTE.muted};">— ${esc(locParts.join(", "))}</span>` : "";
    const age = openingAge(o.date, date);
    const blurb = o.blurb ? `<div style="font-size:13px;color:${PALETTE.muted};line-height:1.45;margin-top:2px;">${esc(o.blurb)}</div>` : "";
    return `<div style="margin-bottom:10px;">
      <div style="font-size:15px;color:${PALETTE.ink};"><strong>${esc(o.name)}</strong>${loc}</div>
      ${age ? `<div style="font-size:12px;color:${PALETTE.faint};margin-top:2px;">${esc(age)}</div>` : ""}
      ${blurb}
    </div>`;
  }).join("");
  const heading = editorial?.openingsHeading || "Recently opened";
  const note = editorial?.openingsNote
    ? `<div style="font-size:13px;color:${PALETTE.muted};line-height:1.45;margin-bottom:12px;">${esc(editorial.openingsNote)}</div>`
    : "";
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:6px;">${esc(heading)}</div>
  ${note}
  ${items}
</div>`;
}

function openingAge(openedDate, todayDate) {
  const days = daysBetween(openedDate, todayDate);
  if (!Number.isFinite(days)) return "";
  if (days === 0) return "Opened today";
  if (days === 1) return "Opened yesterday";
  return `Opened ${days} days ago`;
}

function meetingsBlock(meetings) {
  if (!meetings?.length) return "";
  const rows = meetings.map((m) => {
    const link = m.url ? `<a href="${esc(m.url)}" style="color:${PALETTE.blue};text-decoration:none;">${esc(m.bodyName || "Meeting")}</a>` : esc(m.bodyName || "Meeting");
    return `<div style="font-size:14px;margin-bottom:6px;"><strong>${esc(cityName(m.city))}</strong> — ${link}${m.location ? ` <span style="color:${PALETTE.muted};">· ${esc(m.location)}</span>` : ""}</div>`;
  }).join("");
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:14px;">Civic meetings tonight</div>
  ${rows}
</div>`;
}

function historyBlock(history) {
  if (!history?.length) return "";
  const items = history.map((h) => {
    const link = h.url ? `<a href="${esc(h.url)}" style="color:${PALETTE.blue};text-decoration:none;">${esc(h.company)}</a>` : esc(h.company);
    return `<div style="margin-bottom:10px;">
      <div style="font-weight:600;">${link} <span style="color:${PALETTE.muted};font-weight:400;">· ${esc(h.foundedYear)} · ${esc(h.city)}</span></div>
      <div style="font-size:14px;color:${PALETTE.ink};line-height:1.5;margin-top:2px;">${esc(h.anniversaryNote || h.tagline)}</div>
    </div>`;
  }).join("");
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:14px;">On this day in Silicon Valley</div>
  ${items}
</div>`;
}

function conversationBlock(posts, editorial = null) {
  if (!posts?.length) return "";
  const items = posts.map((p) => {
    const title = p.displayTitle || p.title || "";
    const sub = p.sub ? `r/${p.sub}` : "";
    const meta = [
      sub,
      p.score ? `↑ ${p.score}` : null,
      p.numComments ? `💬 ${p.numComments}` : null,
    ].filter(Boolean).join(" · ");
    const thumb = p.image
      ? `<img src="${esc(p.image)}" alt="" width="64" height="64" style="width:64px;height:64px;display:block;border-radius:6px;object-fit:cover;">`
      : "";
    const titleHtml = p.permalink
      ? `<a href="${esc(p.permalink)}" style="color:${PALETTE.ink};text-decoration:none;font-weight:600;line-height:1.4;">${esc(title)}</a>`
      : `<span style="color:${PALETTE.ink};font-weight:600;line-height:1.4;">${esc(title)}</span>`;
    const summary = p.summary
      ? `<div style="font-size:13px;color:${PALETTE.muted};line-height:1.45;margin-top:3px;">${esc(p.summary)}</div>`
      : "";
    return `<tr>
      <td width="64" style="padding:10px 0;border-bottom:1px solid ${PALETTE.border};vertical-align:top;">${thumb}</td>
      <td style="padding:10px 0 10px 12px;border-bottom:1px solid ${PALETTE.border};vertical-align:top;">
        <div>${titleHtml}</div>
        ${summary}
        <div style="font-size:12px;color:${PALETTE.faint};margin-top:4px;letter-spacing:0.3px;">${esc(meta)}</div>
      </td>
    </tr>`;
  }).join("\n");
  const heading = editorial?.conversationHeading || "The Conversation";
  const note = editorial?.conversationNote || "What people are talking about across the South Bay (via Reddit).";
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:6px;">${esc(heading)}</div>
  <div style="font-size:13px;color:${PALETTE.muted};margin-bottom:14px;">${esc(note)}</div>
  <table style="width:100%;border-collapse:collapse;"><tbody>${items}</tbody></table>
</div>`;
}

function footerBlock() {
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};font-size:14px;color:${PALETTE.muted};line-height:1.6;">
  <p style="margin:0 0 10px 0;">Thanks for letting us into your morning ☀️</p>
  <p style="margin:0 0 10px 0;">If you spot something we missed — a new restaurant, a great event, a story worth telling — just hit reply. We read everything.</p>
  <p style="margin:14px 0 0 0;color:${PALETTE.ink};">— Stephen 👋</p>
  <p style="margin:18px 0 0 0;font-size:12px;color:${PALETTE.faint};">South Bay Today · <a href="https://southbaytoday.org" style="color:${PALETTE.faint};">southbaytoday.org</a> · <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${PALETTE.faint};">unsubscribe</a></p>
</div>`;
}

// ── Discord DM + self-improvement loop ─────────────────────────────────────

export async function publishNewsletterArchive(data, html) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN missing for newsletter HTML archive");

  const { del, put } = await import("@vercel/blob");
  const pathname = `newsletters/${data.date}.html`;

  try {
    await del(pathname, { token });
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!/not.?found|404|BlobNotFoundError/i.test(msg)) throw err;
  }

  const result = await put(pathname, archiveNewsletterHtml(html), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/html; charset=utf-8",
    token,
    cacheControlMaxAge: 0,
  });
  return result.url;
}

export async function sendNewsletterDiscordDm(data, subject, archiveUrl = null) {
  const content = renderDiscordDm(data, subject, archiveUrl);
  await sendDiscordDmChunks(content);
}

export async function recordNewsletterSend({ data, subject, broadcastId = null, archiveUrl = null }) {
  const sentAt = new Date().toISOString();
  appendFileSync(NEWSLETTER_HISTORY_FILE, JSON.stringify({
    sentAt,
    date: data.date,
    subject,
    broadcastId,
    archiveUrl,
    editorialMeta: data.editorialMeta,
    selections: newsletterSelectionSnapshot(data),
  }) + "\n");

  try {
    await reflectOnNewsletter({ data, subject, sentAt });
  } catch (err) {
    console.warn(`editorial reflection failed: ${err.message}`);
  }
}

function archiveNewsletterHtml(html) {
  return String(html || "")
    .replace(
      /<a href="\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}"[^>]*>unsubscribe<\/a>/gi,
      "unsubscribe from the email"
    )
    .replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, "https://southbaytoday.org");
}

function renderDiscordDm(data, subject, archiveUrl) {
  const lines = [`📬 **${subject}**`];
  const blurb = newsletterDmBlurb(data);
  if (blurb) lines.push("", blurb);
  if (archiveUrl) lines.push("", `Full email: ${archiveUrl}`);
  return lines.join("\n");
}

function newsletterDmBlurb(data) {
  const drafted = data.editorial?.briefing || data.dayPlanBlurb || "";
  if (drafted) return compactText(drafted, 900);

  const bits = [];
  if (data.dayPlan?.cards?.length) {
    const cities = [...new Set(orderedCards(data.dayPlan).map((c) => cityName(c.city)).filter(Boolean))].slice(0, 3);
    bits.push(`Today's field guide has ${data.dayPlan.cards.length} stops${cities.length ? ` around ${humanList(cities)}` : ""}.`);
  }
  if (data.tonightPick) {
    bits.push(`Tonight's pick is ${data.tonightPick.title}${data.tonightPick.time ? ` at ${data.tonightPick.time}` : ""}.`);
  }
  if (data.featuredEvents?.length) {
    const totalEvents = data.todayEvents?.length || data.featuredEvents.length;
    bits.push(`${totalEvents} timed events are on the board, led by ${humanList(data.featuredEvents.slice(0, 3).map((e) => e.title))}.`);
  }
  if (data.recentOpenings?.length) {
    bits.push(`Food radar has ${humanList(data.recentOpenings.slice(0, 2).map((o) => o.name))}.`);
  }

  return compactText(bits.join(" ") || "Today's South Bay Today email is ready, with the field guide, events, openings, civic notes, and local conversation.", 900);
}

function renderDiscordDigest(data, subject) {
  const lines = [`📬 **${subject}**`];
  if (data.editorial?.briefing) lines.push("", data.editorial.briefing);
  if (data.weather) {
    lines.push("", `**Weather:** ${data.weather.tempNow}° now, high ${data.weather.high}°, low ${data.weather.low}°, ${String(data.weather.dayDesc || "").toLowerCase()}.`);
  }
  if (data.dayPlan?.cards?.length) {
    lines.push("", `**${data.editorial?.dayPlanHeadline || "Today's field guide"}**`);
    if (data.dayPlanBlurb) lines.push(data.dayPlanBlurb);
    for (const c of orderedCards(data.dayPlan).slice(0, 6)) {
      const meta = [c.eventTime || c.timeBlock, c.venue, c.city ? cityName(c.city) : null].filter(Boolean).join(" · ");
      lines.push(`• ${markdownLink(c.name, c.url || c.mapsUrl)}${meta ? ` — ${meta}` : ""}`);
    }
  }
  if (data.tonightPick) {
    lines.push("", `**Tonight:** ${markdownLink(data.tonightPick.title, data.tonightPick.url)}`);
    const meta = eventMeta(data.tonightPick);
    if (meta) lines.push(meta);
    if (data.tonightPickBlurb) lines.push(data.tonightPickBlurb);
  }
  if (data.featuredEvents?.length) {
    lines.push("", `**${data.editorial?.eventsHeading || "More good options today"}**`);
    if (data.editorial?.eventsNote) lines.push(data.editorial.eventsNote);
    for (const e of data.featuredEvents) {
      const meta = eventMeta(e);
      lines.push(`• ${markdownLink(e.title, e.url)}${meta ? ` — ${meta}` : ""}`);
    }
  }
  if (data.recentOpenings?.length) {
    lines.push("", `**${data.editorial?.openingsHeading || "Recently opened"}**`);
    if (data.editorial?.openingsNote) lines.push(data.editorial.openingsNote);
    for (const o of data.recentOpenings.slice(0, 5)) {
      lines.push(`• ${o.name}${o.cityName ? ` — ${o.cityName}` : ""}${o.blurb ? `: ${o.blurb}` : ""}`);
    }
  }
  if (data.tonightMeetings?.length) {
    lines.push("", "**Civic meetings tonight**");
    for (const m of data.tonightMeetings) lines.push(`• ${cityName(m.city)} — ${m.bodyName || "Meeting"}`);
  }
  if (data.todayHistory?.length) {
    lines.push("", "**On this day in Silicon Valley**");
    for (const h of data.todayHistory) lines.push(`• ${h.company} (${h.foundedYear}, ${h.city}): ${h.anniversaryNote || h.tagline}`);
  }
  if (data.redditPosts?.length) {
    lines.push("", `**${data.editorial?.conversationHeading || "The Conversation"}**`);
    if (data.editorial?.conversationNote) lines.push(data.editorial.conversationNote);
    for (const p of data.redditPosts) {
      const meta = [p.sub ? `r/${p.sub}` : null, p.numComments ? `${p.numComments} comments` : null].filter(Boolean).join(" · ");
      lines.push(`• ${markdownLink(p.displayTitle || p.title, p.permalink)}${meta ? ` — ${meta}` : ""}`);
    }
  }
  lines.push("", "https://southbaytoday.org");
  return lines.join("\n");
}

function newsletterSelectionSnapshot(data) {
  return {
    briefing: data.editorial?.briefing || "",
    dayPlan: orderedCards(data.dayPlan).map((c) => c.name),
    tonightPick: data.tonightPick?.title || null,
    featuredEvents: (data.featuredEvents || []).map((e) => e.title),
    openings: (data.recentOpenings || []).map((o) => o.name),
    meetings: (data.tonightMeetings || []).map((m) => `${cityName(m.city)} ${m.bodyName || "Meeting"}`),
    history: (data.todayHistory || []).map((h) => h.company),
    reddit: (data.redditPosts || []).map((p) => p.displayTitle || p.title),
  };
}

async function reflectOnNewsletter({ data, subject, sentAt }) {
  const prompt = `You are improving South Bay Today's daily newsletter generator.

Read the newsletter that just went out. Give a concise editorial critique that will make TOMORROW'S newsletter better.

Return JSON only:
{
  "score": 1-10,
  "keepDoing": ["specific thing to preserve"],
  "improveNext": ["specific instruction for tomorrow's editor pass"],
  "avoid": ["pattern to avoid"],
  "guidance": ["short reusable rule for future prompt memory"]
}

Be specific. Do not praise generic structure. Focus on selection quality, local usefulness, awkward copy, repetition, over/under-indexing family events, and whether the email feels like a real morning briefing.

NEWSLETTER:
${renderDiscordDigest(data, subject)}
`;
  const raw = await callClaudeNewsletterEditor(prompt);
  const reflection = parseClaudeJson(raw);
  saveNewsletterReflection({ reflection, data, subject, sentAt });
}

function saveNewsletterReflection({ reflection, data, subject, sentAt }) {
  const current = loadNewsletterEditorialMemory() || { guidance: [], reflections: [] };
  const entry = {
    date: data.date,
    subject,
    sentAt,
    score: numberInRange(reflection.score, 1, 10),
    keepDoing: stringArray(reflection.keepDoing, 4, 180),
    improveNext: stringArray(reflection.improveNext, 6, 220),
    avoid: stringArray(reflection.avoid, 6, 180),
  };
  const guidance = [
    ...(current.guidance || []),
    ...stringArray(reflection.guidance, 8, 220),
    ...entry.improveNext,
  ].slice(-24);
  const output = {
    _meta: { updatedAt: new Date().toISOString(), generator: "newsletter self-reflection" },
    guidance,
    reflections: [...(current.reflections || []), entry].slice(-30),
  };
  writeFileSync(NEWSLETTER_MEMORY_FILE, JSON.stringify(output, null, 2) + "\n");
}

function numberInRange(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function stringArray(value, limit, maxLen) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => limitedString(v, maxLen))
    .filter(Boolean)
    .slice(0, limit);
}

function markdownLink(label, url) {
  const clean = escapeMarkdown(label || "");
  if (!url) return clean;
  return `[${clean}](${url})`;
}

function escapeMarkdown(s) {
  return String(s || "").replace(/([\\`*_{}[\]()#+.!|>~-])/g, "\\$1");
}

function resolveDiscordBotToken() {
  try {
    const txt = readFileSync(join(homedir(), ".claude/channels/discord/.env"), "utf8");
    const match = txt.match(/DISCORD_BOT_TOKEN\s*=\s*"?([^"\n]+)"?/);
    if (match) return match[1].trim();
  } catch {}
  return process.env.CAT_SIGNAL_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || null;
}

async function sendDiscordDmChunks(content) {
  const token = resolveDiscordBotToken();
  const channel = process.env.DISCORD_DM_CHANNEL || process.env.STEPHEN_DM_CHANNEL_ID || "1486102002474811524";
  if (!token) throw new Error("DISCORD_BOT_TOKEN missing for newsletter DM");
  const chunks = splitDiscordMessage(content, 1850);
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : "";
    const res = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: `${prefix}${chunks[i]}`.slice(0, 1990) }),
    });
    if (!res.ok) {
      throw new Error(`Discord DM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }
}

function splitDiscordMessage(content, maxLen) {
  const chunks = [];
  let cur = "";
  for (const para of String(content || "").split("\n")) {
    const next = cur ? `${cur}\n${para}` : para;
    if (next.length <= maxLen) {
      cur = next;
    } else {
      if (cur) chunks.push(cur);
      cur = para.length > maxLen ? para.slice(0, maxLen) : para;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ── Newsletter config (audience id stored locally) ─────────────────────────

export const CONFIG_PATH = join(DATA_DIR, "newsletter-config.json");

export function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8")); }
  catch { return {}; }
}

export const FROM_ADDRESS = "The South Bay Today <stephen@southbaytoday.org>";
export const REPLY_TO = "stephen@stanwood.dev";
