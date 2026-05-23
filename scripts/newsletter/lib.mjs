// ---------------------------------------------------------------------------
// South Bay Today — Daily Newsletter
// Shared helpers: env, Resend API, data loaders, HTML renderer.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
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

export async function assembleNewsletterData(date) {
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

  const redditPosts = pickRedditPosts(loadRedditPulse().posts || [], 4);
  const weather = await fetchWeather();
  const tonightPick = pickTonightEvent(todayEvents);
  const featuredEvents = pickFeaturedEvents(todayEvents, { dayPlan, tonightPick, limit: 10 });
  const dayPlanBlurb = dayPlan ? buildDayPlanBlurb(dayPlan, weather) : "";
  const tonightPickBlurb = tonightPick ? buildTonightBlurb(tonightPick) : "";

  return {
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
  };
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
    dayPlanBlock(data.dayPlan, data.dayPlanBlurb),
    tonightPickBlock(data.tonightPick, data.tonightPickBlurb),
    eventsBlock(data.featuredEvents, data.todayEvents.length),
    openingsBlock(data.recentOpenings, data.date),
    meetingsBlock(data.tonightMeetings),
    historyBlock(data.todayHistory),
    conversationBlock(data.redditPosts),
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

function dayPlanBlock(plan, blurb) {
  if (!plan) return "";
  const cards = orderedCards(plan);
  if (!cards.length) return "";
  const rows = cards.map(planCardRow).join("\n");
  const cta = plan.planUrl
    ? `<a href="${esc(plan.planUrl)}" style="display:inline-block;background:${PALETTE.blue};color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;font-size:15px;margin-top:18px;">Open the live guide →</a>`
    : "";
  return `<div style="padding:28px;">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:8px;">Today's field guide</div>
  <div style="font-size:18px;font-weight:700;color:${PALETTE.ink};margin-bottom:8px;">A flexible South Bay day</div>
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

function eventsBlock(events, totalCount = events?.length || 0) {
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
  const countNote = totalCount > events.length
    ? `The site has ${totalCount} timed events for today; these are the ones most likely to be useful.`
    : "A short list of timed events worth checking before you make plans.";
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:6px;">More good options today</div>
  <div style="font-size:13px;color:${PALETTE.muted};line-height:1.45;margin-bottom:12px;">${esc(countNote)} <a href="https://southbaytoday.org/#events" style="color:${PALETTE.blue};text-decoration:none;">Open the full calendar →</a></div>
  <table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>
</div>`;
}

function openingsBlock(openings, date) {
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
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:14px;">Recently opened</div>
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

function conversationBlock(posts) {
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
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:6px;">The Conversation</div>
  <div style="font-size:13px;color:${PALETTE.muted};margin-bottom:14px;">What people are talking about across the South Bay (via Reddit).</div>
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

// ── Newsletter config (audience id stored locally) ─────────────────────────

export const CONFIG_PATH = join(DATA_DIR, "newsletter-config.json");

export function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8")); }
  catch { return {}; }
}

export const FROM_ADDRESS = "The South Bay Today <stephen@southbaytoday.org>";
export const REPLY_TO = "stephen@stanwood.dev";
