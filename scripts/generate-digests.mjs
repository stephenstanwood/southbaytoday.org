#!/usr/bin/env node
/**
 * generate-digests.mjs
 *
 * Pre-generates council meeting digest summaries for all configured South Bay cities.
 * Scrapes agendas from CivicEngage and Legistar, summarizes with Claude Haiku,
 * and writes results to src/data/south-bay/digests.json.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-digests.mjs
 *
 * Or with .env file:
 *   node --env-file=.env scripts/generate-digests.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "digests.json");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const CLAUDE_HAIKU = "claude-haiku-4-5-20251001";
const UA = "SouthBaySignal/1.0 (stanwood.dev; public information aggregator)";

// ── City configs (mirrored from agendaScraperFactory.ts) ──

const AGENDA_CITIES = [
  // CivicEngage
  { city: "campbell", cityName: "Campbell", platform: "civicengage", agendaUrl: "https://www.campbellca.gov/AgendaCenter/City-Council-10", baseUrl: "https://www.campbellca.gov", body: "City Council", schedule: "1st and 3rd Tuesday" },
  { city: "saratoga", cityName: "Saratoga", platform: "civicengage", agendaUrl: "https://www.saratoga.ca.us/AgendaCenter/City-Council-13", baseUrl: "https://www.saratoga.ca.us", body: "City Council", schedule: "1st and 3rd Wednesday" },
  { city: "los-altos", cityName: "Los Altos", platform: "civicengage", agendaUrl: "https://www.losaltosca.gov/AgendaCenter/City-Council-4", baseUrl: "https://www.losaltosca.gov", body: "City Council", schedule: "2nd and 4th Tuesday" },
  // Legistar
  { city: "san-jose", cityName: "San José", platform: "legistar", agendaUrl: "https://sanjose.legistar.com/Calendar.aspx", baseUrl: "https://sanjose.legistar.com", body: "City Council", schedule: "1st and 3rd Tuesday", legistarClientId: "sanjose" },
  { city: "mountain-view", cityName: "Mountain View", platform: "legistar", agendaUrl: "https://mountainview.legistar.com/Calendar.aspx", baseUrl: "https://mountainview.legistar.com", body: "City Council", schedule: "2nd and 4th Tuesday", legistarClientId: "mountainview" },
  { city: "sunnyvale", cityName: "Sunnyvale", platform: "legistar", agendaUrl: "https://sunnyvaleca.legistar.com/Calendar.aspx", baseUrl: "https://sunnyvaleca.legistar.com", body: "City Council", schedule: "2nd and 4th Tuesday", legistarClientId: "sunnyvaleca" },
  { city: "cupertino", cityName: "Cupertino", platform: "legistar", agendaUrl: "https://cupertino.legistar.com/Calendar.aspx", baseUrl: "https://cupertino.legistar.com", body: "City Council", schedule: "1st and 3rd Tuesday", legistarClientId: "cupertino" },
  { city: "santa-clara", cityName: "Santa Clara", platform: "legistar", agendaUrl: "https://santaclara.legistar.com/Calendar.aspx", baseUrl: "https://santaclara.legistar.com", body: "City Council", schedule: "2nd and 4th Tuesday", legistarClientId: "santaclara" },
];

// ── Fetch helpers ──

async function fetchTimeout(url, opts = {}, ms = 15_000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

// ── CivicEngage scraper ──

async function scrapeCivicEngage(config) {
  const filePattern = /\/AgendaCenter\/ViewFile\/Agenda\/_(\d{8})-(\d+)/;
  const datePattern = /<h3[^>]*>\s*([\w]+\s+\d{1,2},?\s+\d{4})\s*<\/h3>/gi;

  const res = await fetchTimeout(config.agendaUrl);
  if (!res.ok) return null;

  const html = await res.text();
  const agendaLinks = [...html.matchAll(new RegExp(`<a[^>]*href="([^"]*${filePattern.source})"[^>]*>`, "gi"))];
  if (agendaLinks.length === 0) return null;

  const href = agendaLinks[0][1];
  const pdfUrl = href.startsWith("http") ? href : `${config.baseUrl}${href}`;

  let dateStr = "Unknown date";
  const dateMatch = href.match(filePattern);
  if (dateMatch) {
    const raw = dateMatch[1];
    dateStr = `${raw.substring(0, 2)}/${raw.substring(2, 4)}/${raw.substring(4, 8)}`;
  }
  const headings = [...html.matchAll(datePattern)];
  if (headings.length > 0) dateStr = headings[0][1].trim();

  return { ...config, date: dateStr, title: `${config.cityName} ${config.body} — ${dateStr}`, url: config.agendaUrl, pdfUrl };
}

// ── Legistar scraper ──

async function scrapeLegistar(config) {
  const clientId = config.legistarClientId;
  const bodyName = config.body;
  const filter = `EventBodyName eq '${bodyName}'`;
  const eventsUrl = `https://webapi.legistar.com/v1/${clientId}/Events?$filter=${encodeURIComponent(filter)}&$orderby=EventDate desc&$top=5`;

  const res = await fetchTimeout(eventsUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;

  let events;
  try { events = await res.json(); } catch { return null; }
  if (!Array.isArray(events) || events.length === 0) return null;

  const now = new Date();
  const recentEvent = events.find((e) => new Date(e.EventDate) <= now) ?? events[0];
  if (!recentEvent) return null;

  const dateStr = new Date(recentEvent.EventDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const meetingUrl = recentEvent.EventInSiteURL ?? `${config.baseUrl}/MeetingDetail.aspx?ID=${recentEvent.EventId}`;

  return {
    ...config,
    date: dateStr,
    title: `${config.cityName} ${config.body} — ${dateStr}`,
    url: meetingUrl,
    pdfUrl: recentEvent.EventAgendaFile ?? meetingUrl,
    legistarEventId: recentEvent.EventId,
    legistarClientId: clientId,
  };
}

// ── Content extraction ──

async function fetchAgendaContent(pdfUrl) {
  const res = await fetchTimeout(pdfUrl);
  if (!res.ok) return null;
  const html = await res.text();
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 12_000);
}

async function fetchLegistarContent(clientId, eventId) {
  const filter = `EventItemEventId eq ${eventId}`;
  const url = `https://webapi.legistar.com/v1/${clientId}/EventItems?AgendaNote=1&$filter=${encodeURIComponent(filter)}&$orderby=EventItemAgendaSequence asc`;

  const res = await fetchTimeout(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;

  let items;
  try { items = await res.json(); } catch { return null; }
  if (!Array.isArray(items) || items.length === 0) return null;

  const lines = [];
  for (const item of items) {
    if (!item.EventItemTitle) continue;
    const num = item.EventItemAgendaNumber ? `${item.EventItemAgendaNumber}. ` : "";
    lines.push(`${num}${item.EventItemTitle}`);
    if (item.EventItemAgendaNote) {
      const note = String(item.EventItemAgendaNote).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 500);
      if (note) lines.push(`   ${note}`);
    }
  }
  return lines.length === 0 ? null : lines.join("\n").substring(0, 12_000);
}

// ── Claude summarization ──

async function summarize(agenda, content) {
  const prompt = `You are summarizing a ${agenda.cityName}, CA ${agenda.body} meeting agenda for residents.

Given the following agenda text, produce a JSON object with these fields:
- "meetingDate": the date of the meeting (string)
- "title": a short title like "${agenda.cityName} ${agenda.body} — ${agenda.date}" (string)
- "summary": a 2-3 sentence plain-English summary of what this meeting covers (string)
- "keyTopics": an array of 3-6 short bullet points about the main agenda items (string[])
- "nextMeeting": when the next meeting likely is based on the ${agenda.schedule} pattern, or null (string|null)

Write for a general audience. No jargon. Be specific about what's being discussed.

Agenda text:
${content}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_HAIKU,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }

  const msg = await res.json();
  const text = msg.content?.find((c) => c.type === "text")?.text ?? "";
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

// ── Main ──

async function generateDigest(config) {
  console.log(`  ⏳ ${config.cityName}...`);

  // 1. Scrape agenda
  const agenda = config.platform === "legistar"
    ? await scrapeLegistar(config)
    : await scrapeCivicEngage(config);

  if (!agenda) {
    console.log(`  ⚠️  ${config.cityName}: no agenda found`);
    return null;
  }

  // 2. Get content
  let content = null;
  if (agenda.legistarEventId && agenda.legistarClientId) {
    content = await fetchLegistarContent(agenda.legistarClientId, agenda.legistarEventId);
  }
  if (!content) {
    content = await fetchAgendaContent(agenda.pdfUrl);
  }
  if (!content) {
    console.log(`  ⚠️  ${config.cityName}: no content extracted`);
    return null;
  }

  // 3. Summarize
  const parsed = await summarize(agenda, content);

  const digest = {
    city: agenda.city,
    cityName: agenda.cityName,
    body: agenda.body,
    meetingDate: parsed.meetingDate ?? agenda.date,
    title: parsed.title ?? agenda.title,
    summary: parsed.summary ?? "",
    keyTopics: parsed.keyTopics ?? [],
    nextMeeting: parsed.nextMeeting ?? null,
    schedule: agenda.schedule,
    sourceUrl: agenda.url,
    generatedAt: new Date().toISOString(),
  };

  console.log(`  ✅ ${config.cityName}: ${digest.meetingDate}`);
  return digest;
}

async function main() {
  console.log("Generating council digests for all cities...\n");

  const digests = {};
  for (const config of AGENDA_CITIES) {
    try {
      const digest = await generateDigest(config);
      if (digest) digests[config.city] = digest;
    } catch (err) {
      console.error(`  ❌ ${config.cityName}: ${err.message}`);
    }
    // Be polite — small delay between cities
    await new Promise((r) => setTimeout(r, 500));
  }

  writeFileSync(OUT_PATH, JSON.stringify(digests, null, 2) + "\n");
  console.log(`\nDone — ${Object.keys(digests).length} digests written to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
