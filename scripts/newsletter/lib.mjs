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
  const schedule = loadSocialSchedule();
  const todaySlots = schedule.days?.[date] || {};
  const dayPlan = todaySlots["day-plan"] || null;
  const tonightPick = todaySlots["tonight-pick"] || null;

  const allEvents = loadEvents().events || [];
  const todayEvents = allEvents
    .filter((e) => e.date === date && !e.ongoing)
    .filter((e) => e.time && !/^12:00\s*am/i.test(e.time))
    .sort((a, b) => parseTimeMinutes(a.time) - parseTimeMinutes(b.time));

  const openings = loadOpenings();
  const todaysOpenings = (openings.opened || []).filter((o) => o.date === date);

  const meetings = loadMeetings().meetings || {};
  const tonightMeetings = Object.entries(meetings)
    .filter(([, m]) => m?.date === date)
    .map(([city, m]) => ({ city, ...m }));

  const [, monthStr, dayStr] = date.split("-");
  const milestones = loadMilestones();
  const todayHistory = milestones.filter(
    (m) => m.month === parseInt(monthStr) && m.day === parseInt(dayStr)
  );

  const redditPosts = (loadRedditPulse().posts || []).slice(0, 8);

  // Prefer the email variant baked in by the social copy-gen. Fall back to a
  // live Claude rewrite when the schedule entry was written before the email
  // variant existed.
  const [weather, dayPlanBlurb, tonightPickBlurb] = await Promise.all([
    fetchWeather(),
    dayPlan ? (dayPlan.copy?.email || rewriteForEmail(dayPlan.copy?.facebook || dayPlan.copy?.threads || "", "plan")) : "",
    tonightPick ? (tonightPick.copy?.email || rewriteForEmail(tonightPick.copy?.facebook || tonightPick.copy?.threads || "", "pick")) : "",
  ]);

  return {
    date,
    longDate: formatLongDate(date),
    dayPlan, dayPlanBlurb,
    tonightPick, tonightPickBlurb,
    todayEvents,
    todaysOpenings,
    tonightMeetings,
    weather,
    todayHistory,
    redditPosts,
  };
}

// Ask Claude to rewrite social copy as a newsletter blurb.
async function rewriteForEmail(text, kind /* "plan" | "pick" */) {
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
    eventsBlock(data.todayEvents),
    openingsBlock(data.todaysOpenings),
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
  const img = plan.imageUrl ? `<img src="${esc(plan.imageUrl)}" alt="Today's plan" style="width:100%;display:block;border-radius:8px;">` : "";
  const cta = plan.planUrl
    ? `<a href="${esc(plan.planUrl)}" style="display:inline-block;background:${PALETTE.blue};color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;font-size:15px;margin-top:14px;">See the full plan →</a>`
    : "";
  return `<div style="padding:28px;">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:10px;">A plan for your day</div>
  ${img}
  <div style="font-size:15px;line-height:1.6;color:${PALETTE.ink};margin-top:14px;">${esc(blurb)}</div>
  ${cta}
</div>`;
}

function tonightPickBlock(pick, blurb) {
  if (!pick) return "";
  const img = pick.imageUrl ? `<img src="${esc(pick.imageUrl)}" alt="Tonight's pick" style="width:100%;display:block;border-radius:8px;">` : "";
  const ticketUrl = pick.item?.url || null;
  const ctaLabel = pick.item?.cost === "paid" ? "Get tickets →" : "Event details →";
  const cta = ticketUrl
    ? `<a href="${esc(ticketUrl)}" style="display:inline-block;background:${PALETTE.blue};color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;font-size:15px;margin-top:14px;">${esc(ctaLabel)}</a>`
    : "";
  return `<div style="padding:0 28px 28px 28px;border-top:1px solid ${PALETTE.border};padding-top:28px;">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:10px;">Tonight's pick</div>
  ${img}
  <div style="font-size:15px;line-height:1.6;color:${PALETTE.ink};margin-top:14px;">${esc(blurb)}</div>
  ${cta}
</div>`;
}

function eventsBlock(events) {
  if (!events?.length) return "";
  const rows = events.map((e) => {
    const title = e.url
      ? `<a href="${esc(e.url)}" style="color:${PALETTE.ink};text-decoration:none;font-weight:600;">${esc(e.title)}</a>`
      : `<span style="color:${PALETTE.ink};font-weight:600;">${esc(e.title)}</span>`;
    const meta = [
      e.time ? esc(e.time) : null,
      e.venue ? esc(e.venue) : null,
      e.city ? esc(cityName(e.city)) : null,
      e.cost === "free" ? "Free" : null,
    ].filter(Boolean).join(" · ");
    return `<tr><td style="padding:8px 0;border-bottom:1px solid ${PALETTE.border};vertical-align:top;">
      <div>${title}</div>
      <div style="font-size:13px;color:${PALETTE.muted};margin-top:2px;">${meta}</div>
    </td></tr>`;
  }).join("\n");
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:14px;">All of today's events (${events.length})</div>
  <table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>
</div>`;
}

function openingsBlock(openedToday) {
  if (!openedToday?.length) return "";
  const items = openedToday.map((o) => {
    const cityId = (o.cityId || o.cityName || "").toLowerCase().replace(/ /g, "-");
    const locParts = [o.address, cityName(cityId)].filter(Boolean);
    const loc = locParts.length ? ` <span style="color:${PALETTE.muted};">— ${esc(locParts.join(", "))}</span>` : "";
    const blurb = o.blurb ? `<div style="font-size:13px;color:${PALETTE.muted};line-height:1.45;margin-top:2px;">${esc(o.blurb)}</div>` : "";
    return `<div style="margin-bottom:10px;">
      <div style="font-size:15px;color:${PALETTE.ink};"><strong>${esc(o.name)}</strong>${loc}</div>
      ${blurb}
    </div>`;
  }).join("");
  const heading = openedToday.length === 1 ? "New today" : `New today (${openedToday.length})`;
  return `<div style="padding:28px;border-top:8px solid ${PALETTE.card};">
  <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.purple};font-weight:700;margin-bottom:14px;">${heading}</div>
  ${items}
</div>`;
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
