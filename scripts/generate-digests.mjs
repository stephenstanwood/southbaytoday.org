#!/usr/bin/env node
/**
 * generate-digests.mjs
 *
 * Pulls pre-ingested council meeting data from stoa.works/api/council-meetings,
 * summarizes the most recent meeting per city with Claude Haiku, and writes
 * results to src/data/south-bay/digests.json.
 *
 * Much faster than re-scraping Legistar/CivicEngage — Stoa already has the data.
 *
 * Usage:
 *   node --env-file=.env.local scripts/generate-digests.mjs
 */

import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "./lib/env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "digests.json");

loadEnvLocal();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const CLAUDE_HAIKU = "claude-haiku-4-5-20251001";

// ── City config (SBS city IDs → Stoa city names + schedule) ──

// `legistar` is the public *.legistar.com subdomain (used to build agenda links).
// `legistarApi` is the Web API client name (often the same, but Sunnyvale +
// Palo Alto differ). Both are needed because the public site and the Web API
// don't always agree.
const CITIES = [
  { city: "campbell",      stoaCity: "Campbell",      cityName: "Campbell",      schedule: "1st and 3rd Tuesday",   agendaUrl: "https://www.campbellca.gov/AgendaCenter/City-Council-10" },
  { city: "saratoga",      stoaCity: "Saratoga",      cityName: "Saratoga",      schedule: "1st and 3rd Wednesday", agendaUrl: "https://saratoga-ca.municodemeetings.com/" },
  { city: "los-altos",     stoaCity: "Los Altos",     cityName: "Los Altos",     schedule: "2nd and 4th Tuesday",   agendaUrl: "https://losaltos-ca.municodemeetings.com/" },
  { city: "los-gatos",     stoaCity: "Los Gatos",     cityName: "Los Gatos",     schedule: "1st and 3rd Monday",    agendaUrl: "https://losgatos-ca.municodemeetings.com/" },
  { city: "san-jose",      stoaCity: "San Jose",      cityName: "San José",      schedule: "1st and 3rd Tuesday",   agendaUrl: "https://sanjose.legistar.com/Calendar.aspx",      legistar: "sanjose",      legistarApi: "sanjose" },
  { city: "mountain-view", stoaCity: "Mountain View", cityName: "Mountain View", schedule: "2nd and 4th Tuesday",   agendaUrl: "https://mountainview.legistar.com/Calendar.aspx", legistar: "mountainview", legistarApi: "mountainview" },
  { city: "sunnyvale",     stoaCity: "Sunnyvale",     cityName: "Sunnyvale",     schedule: "2nd and 4th Tuesday",   agendaUrl: "https://sunnyvale.legistar.com/Calendar.aspx",    legistar: "sunnyvale",    legistarApi: "sunnyvaleca" },
  { city: "cupertino",     stoaCity: "Cupertino",     cityName: "Cupertino",     schedule: "1st and 3rd Tuesday",   agendaUrl: "https://cupertino.legistar.com/Calendar.aspx",    legistar: "cupertino",    legistarApi: "cupertino" },
  { city: "santa-clara",   stoaCity: "Santa Clara",   cityName: "Santa Clara",   schedule: "2nd and 4th Tuesday",   agendaUrl: "https://santaclara.legistar.com/Calendar.aspx",   legistar: "santaclara",   legistarApi: "santaclara" },
  { city: "milpitas",      stoaCity: "Milpitas",      cityName: "Milpitas",      schedule: "1st and 3rd Tuesday",   agendaUrl: "https://www.ci.milpitas.ca.gov/government/council/" },
  { city: "palo-alto",     stoaCity: "Palo Alto",     cityName: "Palo Alto",     schedule: "1st and 3rd Monday",    agendaUrl: "https://www.cityofpaloalto.org/Government/City-Clerk/Meetings-Agendas-Minutes", legistar: "paloalto", legistarApi: "paloalto" },
];

// If Stoa's most recent record for a city is older than this many days, we try
// to pull the latest past meeting directly from Legistar.
const STOA_STALENESS_DAYS = 21;

// ── Helpers ──

/** For Legistar cities, construct a calendar URL filtered to a specific meeting date. */
function legistarMeetingUrl(subdomain, date) {
  const [year, month, day] = date.split("-");
  const d = `${parseInt(month)}%2F${parseInt(day)}%2F${year}`;
  return `https://${subdomain}.legistar.com/Calendar.aspx?From=${d}&To=${d}`;
}

// ── Fetch Stoa data ──

async function fetchStoaMeetingsForCity(stoaCity) {
  // Try typed query first, then fall back to untyped (some cities lack type tags)
  for (const typeParam of ["&type=City+Council", ""]) {
    const url = `https://www.stoa.works/api/council-meetings?city=${encodeURIComponent(stoaCity)}${typeParam}&limit=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": "SouthBaySignal/1.0 (stanwood.dev; internal data sharing)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) continue;
    const data = await res.json();
    let records = data.records ?? [];
    // If untyped, filter to likely City Council records by title
    if (!typeParam && records.length > 0) {
      const council = records.filter((r) => {
        const title = (r.title || "").toLowerCase();
        return title.includes("city council") || title.includes("council meeting") ||
               title.includes("please scroll") || title.includes("live translation");
      });
      records = council.length > 0 ? council : records;
    }
    if (records.length > 0) return records;
  }
  return [];
}

async function fetchStoaMeetings() {
  console.log("Fetching from stoa.works/api/council-meetings (per-city)...");
  const allRecords = [];
  for (const config of CITIES) {
    const records = await fetchStoaMeetingsForCity(config.stoaCity);
    allRecords.push(...records);
  }
  console.log(`  Got ${allRecords.length} records total\n`);
  return allRecords;
}

// ── Legistar past-meeting fallback ──
//
// When Stoa hasn't ingested a city's most recent agenda yet, hit the Legistar
// Web API directly. Returns a record shaped like a Stoa record so the rest of
// the pipeline (hasRealContent, summarize, etc.) treats it the same way.
const LEGISTAR_UA = "SouthBaySignal/1.0 (stanwood.dev; civic data aggregator)";

async function fetchLegistarPastMeeting(client) {
  const today = new Date().toISOString().split("T")[0];
  const url =
    `https://webapi.legistar.com/v1/${client}/Events` +
    `?$filter=EventBodyName eq 'City Council' and EventDate lt datetime'${today}T23:59:59'` +
    `&$orderby=EventDate desc&$top=3`;

  const res = await fetch(url, {
    headers: { "User-Agent": LEGISTAR_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const events = await res.json();
  if (!events?.length) return null;

  for (const ev of events) {
    const itemsRes = await fetch(
      `https://webapi.legistar.com/v1/${client}/Events/${ev.EventId}/EventItems`,
      { headers: { "User-Agent": LEGISTAR_UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
    );
    if (!itemsRes.ok) continue;
    const items = await itemsRes.json();
    const substantive = items
      .map((i) => (i.EventItemTitle || "").split(/\r?\n/)[0].trim())
      .filter((t) => t.length > 25 && t.length < 300)
      .filter((t) => !/^(roll call|call to order|pledge of allegiance|adjournment|closed session|public comment|consent calendar|recess)/i.test(t))
      .filter((t) => t !== t.toUpperCase());
    if (substantive.length < 2) continue;

    const excerpt = substantive.slice(0, 12).join(". ");
    return {
      id: `legistar-${client}-${ev.EventId}`,
      city: null,
      date: new Date(ev.EventDate).toISOString().split("T")[0],
      meetingType: "City Council",
      title: `City Council — ${ev.EventDate}`,
      excerpt,
      keywords: substantive.slice(0, 5),
      source: "legistar-direct",
    };
  }
  return null;
}

// ── Claude summarization ──

async function summarize(config, meeting) {
  const isYouTubeTranscript = meeting.source === "youtube-transcript";
  // Strip the VTT metadata prefix that appears in YouTube transcript records
  const rawExcerpt = (meeting.excerpt || "").replace(/^Kind:\s*captions\s+Language:\s*\w+\s*/i, "").trim();

  const contentBlock = isYouTubeTranscript
    ? `Meeting transcript (partial — opening segment only): ${rawExcerpt}`
    : `Agenda highlights: ${rawExcerpt}`;

  const transcriptNote = isYouTubeTranscript
    ? `Note: the content above is the opening segment of the meeting transcript. It may only capture roll call and procedural items. Summarize what you can and be honest if the substantive agenda items aren't captured.`
    : "";

  const prompt = `Summarize this ${config.cityName}, CA City Council meeting for residents in plain English.

Meeting date: ${meeting.date}
${contentBlock}
Keywords: ${meeting.keywords.join(", ")}
${transcriptNote}

Return JSON with:
- "summary": 2-3 sentence plain-English overview of what was discussed (no jargon)
- "keyTopics": array of 3-5 short bullet strings (specific topics, not generic)

Be concrete. Write for someone who wants to know what's happening in their city.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_HAIKU,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status} ${await res.text()}`);

  const msg = await res.json();
  const text = msg.content?.find((c) => c.type === "text")?.text ?? "";
  // Extract the first JSON object from the response (handles trailing text/preamble)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in Claude response: ${text.substring(0, 100)}`);
  return JSON.parse(jsonMatch[0]);
}

// ── Main ──

async function main() {
  const records = await fetchStoaMeetings();

  // Group by city name (keep most recent City Council meeting per city)
  const today = new Date().toISOString().split("T")[0];
  const PLACEHOLDER_EXCERPTS = [
    "meeting agenda available",
    "search for specific items",
    "no items",
  ];
  // Boilerplate phrases that indicate the excerpt is meeting logistics, not substance
  const BOILERPLATE_PHRASES = [
    "how to observe the meeting",
    "cable channel",
    "live translations in over",
    "wordly.ai",
    "americans with disabilities act",
    "scroll to the end for information about",
    "rules of conduct of the meeting",
  ];
  function hasRealContent(r) {
    const ex = (r.excerpt || "").toLowerCase().trim();
    if (ex.length <= 80) return false;
    if (PLACEHOLDER_EXCERPTS.some((p) => ex.includes(p))) return false;
    // If 2+ boilerplate phrases appear, it's meeting logistics not substance
    const boilerplateHits = BOILERPLATE_PHRASES.filter((p) => ex.includes(p)).length;
    if (boilerplateHits >= 2) return false;
    return true;
  }

  // Group by city — prefer most recent meeting with real content
  const byCity = {};
  for (const r of records) {
    if (r.date > today) continue;
    if (r.meetingType !== "City Council") continue;
    // Stoa mislabels some commission meetings as "City Council" — skip them
    const titleLower = (r.title || "").toLowerCase();
    if (titleLower.includes("commission") && !titleLower.includes("council")) continue;
    if (titleLower.includes("board of") && !titleLower.includes("council")) continue;
    const existing = byCity[r.city];
    // Prefer records with real content; among those, take most recent
    const rReal = hasRealContent(r);
    if (!existing) {
      if (rReal) { byCity[r.city] = r; }
      continue;
    }
    const exReal = hasRealContent(existing);
    if (rReal && !exReal) { byCity[r.city] = r; continue; }
    if (!rReal && exReal) continue;
    if (r.date > existing.date) byCity[r.city] = r;
  }

  // Don't show meetings older than 9 months — stale data is worse than no data
  const STALE_CUTOFF = new Date();
  STALE_CUTOFF.setMonth(STALE_CUTOFF.getMonth() - 9);
  const staleIso = STALE_CUTOFF.toISOString().split("T")[0];

  const digests = {};

  // Cutoff: if Stoa's record is older than this, try Legistar fallback
  const stoaStaleCutoff = new Date(Date.now() - STOA_STALENESS_DAYS * 86_400_000)
    .toISOString().split("T")[0];

  for (const config of CITIES) {
    let meeting = byCity[config.stoaCity];

    const stoaStale = !meeting || meeting.date < stoaStaleCutoff;
    if (stoaStale && config.legistarApi) {
      const stoaDateLabel = meeting ? meeting.date : "none";
      process.stdout.write(`  ↻ ${config.cityName}: Stoa stale (${stoaDateLabel}), trying Legistar...`);
      try {
        const fallback = await fetchLegistarPastMeeting(config.legistarApi);
        if (fallback && (!meeting || fallback.date > meeting.date)) {
          meeting = fallback;
          console.log(` ✅ got ${fallback.date}`);
        } else {
          console.log(` — no newer record`);
        }
      } catch (e) {
        console.log(` ⚠️  ${e.message}`);
      }
    }

    if (!meeting) {
      console.log(`  ⚠️  ${config.cityName}: no recent City Council meeting from any source`);
      continue;
    }
    if (meeting.date < staleIso) {
      console.log(`  ⏭️  ${config.cityName}: most recent record is ${meeting.date} (>9 months old, skipping)`);
      continue;
    }

    console.log(`  ⏳ ${config.cityName} (${meeting.date})...`);
    try {
      const parsed = await summarize(config, meeting);

      const meetingDateFormatted = new Date(meeting.date + "T12:00:00").toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      });

      // Use meetingType from Stoa (not hardcoded) so mislabeled records are
      // surfaced rather than masked. Falls back to "City Council" if absent.
      const bodyLabel = meeting.meetingType ?? "City Council";
      digests[config.city] = {
        city: config.city,
        cityName: config.cityName,
        body: bodyLabel,
        meetingDate: meetingDateFormatted,
        meetingDateIso: meeting.date,
        title: `${config.cityName} ${bodyLabel} — ${meetingDateFormatted}`,
        summary: parsed.summary ?? "",
        keyTopics: parsed.keyTopics ?? meeting.keywords.slice(0, 5),
        schedule: config.schedule,
        sourceUrl: config.legistar ? legistarMeetingUrl(config.legistar, meeting.date) : config.agendaUrl,
        generatedAt: new Date().toISOString(),
      };

      console.log(`  ✅ ${config.cityName}: ${meetingDateFormatted}`);
    } catch (err) {
      console.error(`  ❌ ${config.cityName}: ${err.message}`);
    }

    // Be polite — small delay between Claude calls
    await new Promise((r) => setTimeout(r, 300));
  }

  // Preserve existing file if no digests were generated (e.g. API credits exhausted)
  if (Object.keys(digests).length === 0) {
    console.warn("\n⚠️  No digests generated — preserving existing digests.json");
    return;
  }

  writeFileSync(OUT_PATH, JSON.stringify(digests, null, 2) + "\n");
  console.log(`\nDone — ${Object.keys(digests).length} digests written to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
