#!/usr/bin/env node
/**
 * generate-around-town.mjs
 *
 * Generates "Around the South Bay" items from multiple public-record sources:
 *   1. City Council meetings (via Stoa API)
 *   2. Planning Commission meetings (via Stoa API)
 *   3. Notable building permits (from permit-pulse.json)
 *
 * Usage:
 *   node --env-file=.env.local scripts/generate-around-town.mjs
 */

import { readFileSync, existsSync } from "fs";
import { writeFileAtomic } from "./lib/io.mjs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { loadEnvLocal } from "./lib/env.mjs";
import { legistarMeetingUrl } from "./lib/civic-meetings.mjs";
import { resolveAroundTownMeetingSources, aroundTownSourceForItem } from "./lib/around-town-meetings.mjs";
import { isAroundTownPermitCandidate } from "./lib/around-town-permits.mjs";
import { todayPT } from "./lib/dates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "around-town.json");
const PERMIT_PATH = join(__dirname, "..", "src", "data", "south-bay", "permit-pulse.json");

loadEnvLocal();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const CLAUDE_SONNET = "claude-sonnet-5";

// ── City config ──

const CITIES = [
  { stoaCity: "Campbell",      cityId: "campbell",      cityName: "Campbell",      agendaUrl: "https://www.campbellca.gov/AgendaCenter/City-Council-10",              permitUrl: null },
  // Saratoga + Los Altos: the *-ca.municodemeetings.com hosts now serve a cert
  // for *.teammunicode.com, so they fail TLS verification in a browser. Point at
  // the cities' own agenda portals (same URLs generate-digests.mjs uses).
  { stoaCity: "Saratoga",      cityId: "saratoga",      cityName: "Saratoga",      agendaUrl: "https://www.saratoga.ca.us/AgendaCenter/City-Council-13",              permitUrl: null },
  { stoaCity: "Los Altos",     cityId: "los-altos",     cityName: "Los Altos",     agendaUrl: "https://losaltosca.portal.civicclerk.com/",                            permitUrl: null },
  { stoaCity: "Los Gatos",     cityId: "los-gatos",     cityName: "Los Gatos",     agendaUrl: "https://losgatos-ca.municodemeetings.com/",                            permitUrl: null },
  // legistarApi is the Web API client name, which is NOT always the public
  // subdomain (Sunnyvale's site is "sunnyvale", its API client "sunnyvaleca").
  // It drives the body check below; `legistar` only builds the source link.
  { stoaCity: "San Jose",      cityId: "san-jose",      cityName: "San José",      agendaUrl: "https://sanjose.legistar.com/Calendar.aspx",      legistar: "sanjose",      legistarApi: "sanjose",      permitUrl: "https://sjpermits.org/" },
  { stoaCity: "Mountain View", cityId: "mountain-view", cityName: "Mountain View", agendaUrl: "https://mountainview.legistar.com/Calendar.aspx", legistar: "mountainview",  legistarApi: "mountainview", permitUrl: null },
  { stoaCity: "Sunnyvale",     cityId: "sunnyvale",     cityName: "Sunnyvale",     agendaUrl: "https://sunnyvale.legistar.com/Calendar.aspx",    legistar: "sunnyvale",     legistarApi: "sunnyvaleca",  permitUrl: null },
  { stoaCity: "Cupertino",     cityId: "cupertino",     cityName: "Cupertino",     agendaUrl: "https://cupertino.legistar.com/Calendar.aspx",    legistar: "cupertino",     legistarApi: "cupertino",    permitUrl: null },
  { stoaCity: "Santa Clara",   cityId: "santa-clara",   cityName: "Santa Clara",   agendaUrl: "https://santaclara.legistar.com/Calendar.aspx",   legistar: "santaclara",    legistarApi: "santaclara",   permitUrl: null },
  // Milpitas: ci.milpitas.ca.gov no longer presents a valid cert — milpitas.gov
  // is the live domain. Palo Alto: the cityofpaloalto.org paths 301 to
  // paloalto.gov and 404 there; PermitView is the portal generate-permits.mjs
  // actually reads.
  { stoaCity: "Milpitas",      cityId: "milpitas",      cityName: "Milpitas",      agendaUrl: "https://www.milpitas.gov/129/Agendas-Minutes",                         permitUrl: null },
  // Palo Alto left Legistar: paloalto.legistar.com answers "Invalid parameters!"
  // for the date-filtered Calendar.aspx links this file builds, so `legistar:
  // "paloalto"` here published a dead source link on every Palo Alto item.
  // PrimeGov is the live system of record — same call generate-digests.mjs makes.
  { stoaCity: "Palo Alto",     cityId: "palo-alto",     cityName: "Palo Alto",     agendaUrl: "https://www.paloalto.gov/City-Hall/City-Council/Council-Agendas-Minutes", primegov: "cityofpaloalto.primegov.com", permitUrl: "https://gis.cityofpaloalto.org/PermitView/" },
];

const CITY_BY_STOA = Object.fromEntries(CITIES.map((c) => [c.stoaCity, c]));

// ── Helpers ──

async function claudeJson(prompt, maxTokens = 1024) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_SONNET,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  const msg = await res.json();
  const text = msg.content?.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]);
}

function makeId(cityId, date, headline) {
  // sha1 of the headline keeps the suffix stable across runs while avoiding
  // the collisions the old base64-slice produced for headlines that share a
  // long common prefix ("Council to update ..." → identical 8-char prefix,
  // same ID for two distinct items on the same city+date).
  const hash = createHash("sha1").update(headline).digest("hex").slice(0, 8);
  return `${cityId}-${date}-${hash}`;
}

// ── Boilerplate detection (shared with generate-digests.mjs) ──

const PLACEHOLDER_EXCERPTS = ["meeting agenda available", "search for specific items", "no items", "translation:"];
const BOILERPLATE_PHRASES = [
  "how to observe the meeting",
  "cable channel",
  "live translations in over",
  "wordly.ai",
  "americans with disabilities act",
  "scroll to the end for information about",
  "rules of conduct of the meeting",
  "anyone wishing to address",
  "this meeting is being conducted",
  "this portion of the meeting is reserved",
];

function hasRealContent(r) {
  const ex = (r.excerpt || "").toLowerCase().trim();
  if (ex.length < 60) return false;
  if (PLACEHOLDER_EXCERPTS.some((p) => ex.startsWith(p))) return false;
  const boilerplateHits = BOILERPLATE_PHRASES.filter((p) => ex.includes(p)).length;
  if (boilerplateHits >= 2) return false;
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// SOURCE 1 + 2: Council + Planning Commission meetings from Stoa
// ══════════════════════════════════════════════════════════════════════════════

async function fetchStoaMeetings(meetingType) {
  const label = meetingType.replace("+", " ");
  console.log(`\n📋 Fetching ${label} meetings from Stoa...`);
  const allRecords = [];
  for (const config of CITIES) {
    const url = `https://www.stoa.works/api/council-meetings?city=${encodeURIComponent(config.stoaCity)}&type=${meetingType}&limit=10`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "SouthBaySignal/1.0 (stanwood.dev; internal data sharing)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      allRecords.push(...(data.records ?? []));
    } catch {}
  }
  console.log(`  Got ${allRecords.length} ${label} records`);
  return allRecords;
}

async function findInterestingItems(config, meetings, bodyType, bodies = new Map()) {
  const content = meetings.map((m) => {
    const excerpt = (m.excerpt || "")
      .replace(/^Kind:\s*captions\s+Language:\s*\w+\s*/i, "")
      .trim();
    const body = bodies.get(String(m.id))?.body || bodyType;
    return `Source record ID: ${m.id}\nDate: ${m.date}\nBody: ${body}\nTitle: ${m.title || ""}\nAgenda: ${excerpt}\nKeywords: ${(m.keywords || []).join(", ")}`;
  }).join("\n\n---\n\n");

  const bodyNote = bodyType === "Planning Commission"
    ? "These are Planning Commission meetings — focus on development projects, zoning decisions, design review, and land use changes."
    : "";

  const prompt = `You are reading recent ${config.cityName}, CA ${bodyType} meeting agendas and minutes.
${bodyNote}

Your job: identify items that a South Bay resident would genuinely find interesting, surprising, or worth knowing about.

SKIP: routine approvals, consent calendar, minutes approval, procedural items, public comment with no outcome, generic budget discussions, YouTube/Zoom instructions.

SKIP HARDER: items where the agenda only shows a title (e.g. "Terminal Elevator Replacement Project") without enough substance to summarize. If you'd need to speculate or hedge ("though specifics weren't provided", "details unclear", "this could affect..."), the right move is to leave the item out, not to write a vague summary. A resident reading hedge text feels like they're reading filler.

NEVER FABRICATE: do not invent case names, party names, dollar amounts, vote counts, addresses, agency or regulator names, or any specific fact not present in the agenda data. Closed session line items often list only a citation like "Conf. with Legal Counsel — existing litigation" with no party names — if a name isn't in the source, do not make one up. Skip the item. When the source references compliance with regulations but doesn't name the specific agency, say "regional air quality regulations" or "state requirements" rather than inventing an agency name (e.g. there is no "South Bay Air District" — Bay Area air quality is regulated by BAAQMD).

For a closed-session potential case, named parties alone do not establish the claim or outcome. Do not infer a theory such as antitrust, or say the city is joining another lawsuit, unless the agenda explicitly says so.

NEVER NAME STAFF CONTACTS: Legistar agendas include bureaucratic metadata like "Staff Contact: Jane Doe" or "Project Manager: John Smith" or "Sponsoring Department: …". These identify the city employee handling the paperwork, NOT the subject of the action. Never write "This follows the staff contact listing X", "named X as the new …", or treat a staff-contact name as the appointee/principal of the item. Omit these names entirely.

MATCH THE SOURCE'S FRAMING — DO NOT NARROW: if a council resolution restricts "federal civil enforcement," do not narrow it to "immigration enforcement," "tax enforcement," or any specific subtype unless the agenda explicitly uses that word. Do not invent illustrative examples ("for immigration, tax, or other..."). Stick to the source's wording on sensitive framing.

DO NOT ASSERT THE BODY UNLESS THE AGENDA SUPPORTS IT: each "Body" label belongs only to its source record. Where a city portal verifier is available, the label has been checked against that record's agenda; otherwise upstream labels may be wrong. Never transfer a body or agenda item between records, even on the same date. If the agenda reads as an advisory recommendation TO the council, do not upgrade it to a council action. Name the body supported by that record, or write it body-neutrally ("Palo Alto is weighing …", "city staff recommended …").

NEVER REPORT THE BROWN ACT ATTENDANCE NOTICE: agendas for scoping meetings, study sessions, and joint hearings carry a boilerplate legal notice that members of other bodies "may be in attendance" — it exists to avoid an unnoticed serial meeting, and it says nothing about who actually showed up. Never write "with City Council / Planning Commission / Commission members possibly (or may be) in attendance". It is a disclaimer, not an event detail. Omit it.

DO NOT ASSERT APPROVAL FOR FUTURE OR SAME-DAY MEETINGS: today is ${todayPT()} (Pacific). Any meeting dated ${todayPT()} or later has NOT happened yet — its agenda is a plan, not a record. Never write that the body "held", "met", "approved", "adopted", "discussed", or "voted" for such a meeting; write in the future tense ("is set to hold a study session", "will consider", "is scheduled to review") so the headline and summary agree. Same rule when an earlier-dated agenda reads as forward-looking ("proposed", "to consider", "study session"): don't upgrade it to an outcome.

KEEP: notable development projects (housing, commercial, controversial permits), policy changes affecting residents, contested votes, new programs/ordinances, zoning/land use decisions, physical changes to the city.

Meeting data:
${content}

NO FILLER ADJECTIVES: do not call a project "significant", "substantial", "major", "large-scale", "notable", or "important" without saying *why* the resident should care. Do not write "This represents …", "This reflects ongoing …", "This underscores …" — sentences that gesture at significance instead of stating it. If you can't name the concrete reason (jobs, units, location, price tag, who's affected), drop the second sentence. One useful sentence beats two with one of them puffed up.

Return a JSON array (may be empty if nothing is interesting). Each item:
{
  "sourceRecordId": "ID of the one meeting record supporting this item; never combine records even when they share a date",
  "date": "YYYY-MM-DD",
  "headline": "short plain-English headline (max 12 words, no jargon). NEVER start a number with $; fiscal years like 2026-27 must be written as 'FY 2026-27', not '$2026-27'.",
  "summary": "1-2 sentences. What happened, why it matters. Written for a resident. NEVER use relative time words (tonight, today, this week) — use date or day name. NEVER admit you don't know what happened ('though specifics weren't provided', 'details weren't clear', 'without more details') — if you would have to, return [] instead. NEVER pad with filler significance language (see NO FILLER ADJECTIVES above)."
}

Return [] if nothing is genuinely interesting. Quality over quantity.`;

  return claudeJson(prompt);
}

// Filter out items whose summary admits Claude couldn't tell what happened.
// These slip through occasionally even when the prompt forbids them — a thin
// agenda title gets a hedge summary like "though specific details weren't
// provided" or "this could affect X" without any concrete X. Residents read
// these as filler. Drop them programmatically as a safety net.
const HEDGE_PATTERNS = [
  /\b(?:specifics?|details?|content|substance)\s+(?:was|were|wasn'?t|weren'?t)\s+(?:not\s+)?(?:provided|specified|included|made\s+clear|clear|available)\b/i,
  /\bthough\s+(?:specific\s+)?(?:details?|specifics?)\b/i,
  /\bwithout\s+(?:more|further|additional)\s+details?\b/i,
  /\bagenda\s+(?:didn'?t|did\s+not)\s+(?:provide|specify|include|detail)\b/i,
  /\b(?:exact|specific)\s+(?:nature|content|terms|impact)\s+(?:remains|is)\s+unclear\b/i,
  /\bdetails?\s+(?:remain|are)\s+unclear\b/i,
  /\bstaff\s+contact\b/i,
  /\bproject\s+manager\s+(?:is|listing|listed)\b/i,
  /\bsponsoring\s+department\b/i,
];

function isHedgeSummary(summary) {
  const s = String(summary || "");
  return HEDGE_PATTERNS.some((re) => re.test(s));
}

// AI-speak filler: a trailing sentence that gestures at significance without
// naming a concrete reason. Three real shapes pulled from around-town.json:
//   "This large-scale development represents substantial investment in the city's commercial real estate."
//   "The project reflects ongoing corporate investment in San José's commercial districts."
//   "This represents a significant leadership decision for the city's executive administration."
// First sentences in those items carried real info (dollar amount, address,
// action) — only the second sentence was padding. Strip the padding sentence
// instead of dropping the whole item.
const FILLER_TAIL_PATTERNS = [
  /\bthis\s+(?:represents|reflects|underscores|highlights|demonstrates|marks|signals|suggests|indicates)\b/i,
  /\bthe\s+(?:project|decision|action|move|change|update)\s+(?:represents|reflects|underscores|highlights|demonstrates|marks|signals|suggests|indicates)\b/i,
  /\bthis\s+(?:large[-\s]scale|major|significant|substantial)\s+\w+\s+(?:represents|reflects|underscores)\b/i,
  /\b(?:represents|reflects)\s+(?:ongoing|substantial|significant|continued)\s+\w+\s+in\b/i,
];

// "X and suggests/indicates/signals a major Y in the city/area" — a conjunctive
// AI-hedge tail tacked onto a real first clause. Strip only the trailing clause,
// not the whole sentence, so the concrete info before "and" survives.
const FILLER_CONJUNCTIVE_TAIL =
  /,?\s+and\s+(?:suggests|indicates|signals|points\s+to|reflects)\s+(?:a|an|ongoing|continued|growing|broader|wider)\s+[^.!?]*[.!?]?\s*$/i;

// Brown Act serial-meeting disclaimer, restated as if it were reporting:
// "..., with City Council, Heritage Preservation Commission, and Planning
// Commission members possibly in attendance." The agenda boilerplate exists so
// an incidental quorum isn't an unnoticed meeting; it carries no information
// about the item and no claim about who attended. Strip the clause and keep the
// sentence. Shipped on the Sunnyvale Oakmead Parkway item 2026-08-25.
const ATTENDANCE_DISCLAIMER_TAIL =
  /,?\s+(?:with|and)\s+[^.!?]*\b(?:council|commission|committee|board)\s+members?\s+(?:possibly|potentially|may\s+be|might\s+be)\s+(?:in\s+)?attend(?:ance|ing)\b[^.!?]*/gi;

function stripAttendanceDisclaimer(summary) {
  const s = String(summary || "");
  if (!ATTENDANCE_DISCLAIMER_TAIL.test(s)) return s;
  ATTENDANCE_DISCLAIMER_TAIL.lastIndex = 0;
  return s.replace(ATTENDANCE_DISCLAIMER_TAIL, "").replace(/\s+([.!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

function stripFillerTail(summary) {
  const s = String(summary || "").trim();
  if (!s) return s;
  // Split on sentence-ending punctuation followed by whitespace and a capital.
  const sentences = s.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const trimmed = sentences.length >= 2 && FILLER_TAIL_PATTERNS.some((re) => re.test(sentences[sentences.length - 1]))
    ? sentences.slice(0, -1).join(" ").trim()
    : s;
  // Strip a trailing "and suggests/indicates/signals …" clause from the final sentence.
  return trimmed.replace(FILLER_CONJUNCTIVE_TAIL, (match) => {
    const endsWithPunct = /[.!?]\s*$/.test(match);
    return endsWithPunct ? "." : "";
  });
}

// Permit exports abbreviate the street type ("1803 Bradford Wy", "151
// University Av", "3055 Orchard Dr"; San José also uses "Bl" and "Cl" for
// Boulevard and Circle — "2855 Stevens Creek Bl", "2555 Corde Terra Cl"). Claude usually expands it in the
// headline and then pastes the raw form into the summary, so one item shipped
// as "Bradford Way" up top and "1803 Bradford Wy" in the body. Expand
// deterministically instead of adding another prompt rule.
//
// Anchored to a street number so the abbreviation can only be read as a street
// type: "Dr" after "3055 Orchard" is Drive, "Dr" before a surname is a title
// and never follows a house number.
const STREET_TYPES = {
  av: "Avenue", ave: "Avenue", bl: "Boulevard", blvd: "Boulevard",
  cir: "Circle", cl: "Circle", ct: "Court", dr: "Drive", ln: "Lane",
  pkwy: "Parkway", pl: "Place", rd: "Road", st: "Street", ter: "Terrace",
  wy: "Way", way: "Way",
};
// The street-type token is an explicit alternation built from the keys above,
// in Capitalized and UPPER forms so the [A-Z] street-name guard stays strict
// (an /i flag would loosen it into matching lowercase prose). A generic
// ([A-Za-z]{2,5}) capture looked simpler but only ever expanded single-word
// street names: the lazy name run matched "2855 Stevens" + "Creek", the lookup
// missed, replace() consumed the match, and "Stevens Creek Bl" shipped raw.
const STREET_TYPE_ALT = Object.keys(STREET_TYPES)
  .flatMap((k) => [k[0].toUpperCase() + k.slice(1), k.toUpperCase()])
  .join("|");
const STREET_ADDRESS = new RegExp(
  `\\b(\\d+\\s+(?:[A-Z][A-Za-z'’.-]*\\s+){1,3}?)(${STREET_TYPE_ALT})\\b\\.?`,
  "g",
);

function expandStreetAbbreviations(text) {
  return String(text || "").replace(STREET_ADDRESS, (match, head, abbrev) => {
    const full = STREET_TYPES[abbrev.toLowerCase()];
    // Not a street type, or already spelled out — leave the original alone.
    if (!full || full.toLowerCase() === abbrev.toLowerCase()) return match;
    return `${head}${full}`;
  });
}

async function gatherMeetingItems(meetingType) {
  const label = meetingType.replace("+", " ");
  const sourceTag = meetingType === "City+Council" ? "council" : "planning";
  const records = await fetchStoaMeetings(meetingType);

  // Pacific calendar date, not UTC: the 8pm PT run is already "tomorrow" in
  // UTC, which let Sept 15 council agendas through on the Sept 14 evening run
  // and got them written up in the past tense ("held a study session").
  const today = todayPT();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffIso = cutoff.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

  const SKIP_TYPES = new Set(["closed session", "special meeting"]);
  const items = [];

  for (const config of CITIES) {
    const cityMeetings = records.filter((r) =>
      r.city === config.stoaCity &&
      r.date <= today &&
      r.date >= cutoffIso &&
      hasRealContent(r) &&
      !SKIP_TYPES.has((r.title || "").toLowerCase())
    ).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

    if (!cityMeetings.length) continue;

    console.log(`  ⏳ ${config.cityName} (${label}): evaluating ${cityMeetings.length} meetings...`);

    try {
      // Only the council path needs this — the planning path already asks Stoa
      // for Planning Commission records by type.
      const bodies = sourceTag === "council"
        ? await resolveAroundTownMeetingSources(config, cityMeetings)
        : new Map(cityMeetings.filter((m) => m.id != null).map((m) => [String(m.id), {
          body: label, date: m.date, sourceUrl: m.sourceUrl
            ?? (config.legistar ? legistarMeetingUrl(config.legistar, m.date) : config.agendaUrl),
        }]));
      const verifiedMeetings = cityMeetings.filter((m) => bodies.has(String(m.id)));
      if (!verifiedMeetings.length) continue;
      const found = await findInterestingItems(config, verifiedMeetings, label, bodies);
      for (const item of found) {
        const source = aroundTownSourceForItem(item, bodies);
        if (!source) {
          console.warn(`  ⚠️  ${config.cityName}: dropped highlight without a matching source record`);
          continue;
        }
        const sourceUrl = source.sourceUrl;
        items.push({
          id: makeId(config.cityId, item.date, item.headline),
          cityId: config.cityId,
          cityName: config.cityName,
          date: item.date,
          headline: expandStreetAbbreviations(item.headline),
          sourceRecordId: String(item.sourceRecordId),
          summary: expandStreetAbbreviations(item.summary),
          sourceUrl,
          source: sourceTag,
        });
        console.log(`  ✅ ${config.cityName}: ${item.headline}`);
      }
      if (!found.length) console.log(`  — ${config.cityName}: nothing interesting`);
    } catch (err) {
      console.error(`  ❌ ${config.cityName}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return items;
}

// ══════════════════════════════════════════════════════════════════════════════
// SOURCE 3: Notable building permits from permit-pulse.json
// ══════════════════════════════════════════════════════════════════════════════

async function gatherPermitItems() {
  console.log("\n🏗️  Scanning permits...");
  if (!existsSync(PERMIT_PATH)) {
    console.log("  ⏭️  permit-pulse.json not found, skipping");
    return [];
  }

  const data = JSON.parse(readFileSync(PERMIT_PATH, "utf8"));
  const allNotable = [];

  for (const [cityId, cityData] of Object.entries(data.cities || {})) {
    const config = CITIES.find((c) => c.cityId === cityId);
    if (!config) continue;

    const permits = (cityData.permits || []).filter(isAroundTownPermitCandidate);

    if (permits.length) {
      // No second truncation here. generate-permits.mjs already caps each city
      // at its top 10 notable permits, and slicing to 8 silently hid the tail:
      // on 2026-08-10 San José had three Villa Homes prefab ADUs at 3180 Rubino
      // Dr (#121/#123/#125), #125 fell outside the slice, and the item shipped
      // as "Two prefab ADUs permitted at same Rubino Drive complex".
      allNotable.push({ config, permits });
    }
  }

  if (!allNotable.length) {
    console.log("  — No notable permits found");
    return [];
  }

  // San José's open-data feed uses a house number of 0 for lots that have no
  // address assigned yet. On 2026-09-15 that shipped verbatim as "at 0 Seely
  // Avenue" — a street number nobody can look up. Hand the model the street
  // with an explicit note instead of the placeholder.
  const permitAddressForPrompt = (address) => {
    const raw = (address || "").trim();
    if (!raw) return "unknown address";
    const m = raw.match(/^0\s+(.+)$/);
    return m ? `${m[1]} (no street number assigned yet)` : raw;
  };

  // Batch all notable permits into one Claude call per city
  const items = [];
  for (const { config, permits } of allNotable) {
    const permitText = permits.map((p) =>
      // `subtype` carries the permit's use type ("School/Daycare",
      // "Medical/Dental Clinic", "Commercial/Industrial"). It used to be
      // withheld, so on 2026-09-03 a $28.6M School/Daycare permit at 4333
      // Rincon Av shipped as a generic "commercial project" whose summary
      // guessed at the use from the unit count ("No unit count is listed,
      // suggesting a non-residential build") — a guess the source could have
      // answered outright. Pass it through.
      `- ${p.categoryLabel || p.category}${p.subtype ? ` [use type: ${p.subtype}]` : ""}: ${p.description || "No description"} at ${permitAddressForPrompt(p.address)} ($${(p.valuation || 0).toLocaleString()}, ${p.units || 0} units, issued ${p.issueDate})`
    ).join("\n");

    // Counting is the one thing the model reliably gets wrong, so do it here
    // and hand it the answer. On 2026-09-09 the seven ADU permits at 584 N 2nd
    // St (#9 through #15, none missing) shipped as "Six detached ADUs … (#9
    // through #15, minus one)" — a wrong tally plus a gap inferred from the
    // unit numbers. Group by street address, ignoring the unit/suite suffix.
    const byStreet = new Map();
    for (const p of permits) {
      const street = (p.address || "unknown address").replace(/\s*[#,]\s*\S+\s*$/, "").trim();
      byStreet.set(street, (byStreet.get(street) || 0) + 1);
    }
    const sharedAddresses = [...byStreet.entries()].filter(([, n]) => n > 1);
    const countsText = sharedAddresses.length
      ? `\n\nVERIFIED COUNTS (authoritative — use these numbers verbatim, do not recount):\n${sharedAddresses
          .map(([street, n]) => `- ${street}: exactly ${n} permits in the list above`)
          .join("\n")}`
      : "";
    const aduCount = permits.filter((p) => /\bADU\b|accessory dwelling unit/i.test(`${p.subtype || ""} ${p.description || ""}`)).length;
    const aduCountsText = aduCount
      ? `\n\nVERIFIED ADU COUNT: exactly ${aduCount} ADU permits in the supplied notable-permit list. This is not a citywide total; say \"the feed lists ${aduCount} ADU permits\" if you report it.`
      : "";

    console.log(`  ⏳ ${config.cityName}: evaluating ${permits.length} notable permits...`);

    try {
      const found = await claudeJson(`These are recently issued building permits in ${config.cityName}, CA. Pick the 1-2 most interesting ones that a resident would care about — new businesses, new housing, large construction projects, or anything unusual. Skip routine renovations and ADUs unless they fit a broader pattern worth pointing out.

Permits:
${permitText}${countsText}${aduCountsText}

IMPORTANT — a permit being issued does not establish whether construction has started. Never assert either that work has begun or that it has not yet begun. Do NOT write "breaks ground", "groundbreaking", "construction begins", "construction starts", or "launches". Use language like "permitted", "receives building permit", "permit issued for". Do NOT label projects as "affordable", "workforce", or "luxury" unless that wording appears in the permit description.

ADDRESSES: an address given as "<street> (no street number assigned yet)" is a new lot without a house number. Write it as "on <street>" — never print a leading "0" as if it were a street number.

USE TYPE OVER INFERENCE: when a permit line carries "[use type: …]", say what the building is for using that use type. Never infer the use from the unit count — "0 units" is what the field says for every non-residential permit, so do not write "no unit count is listed" or reason that a missing unit count "suggests" anything. If there is no use type, describe only what the description states.

NOT NAMES: San José permit descriptions carry a trade-scope code in parentheses — "(Bemp 100%)", "(Bepm100%)", "(Bep 100%)", "(B 100%)", "(B)", and "Srp" prefixes. These are Building/Electrical/Plumbing/Mechanical scope markers, NOT developers, businesses, or project names. Never name them as a party ("developer Bemp"). Ignore them entirely. Only name a developer, owner, or tenant when it appears in the description as an actual name.

COUNTS: the list above is the notable permits only, not every permit issued. If a VERIFIED COUNTS block appears, those totals are authoritative — state them exactly or omit the number; never substitute your own tally. Otherwise prefer wording that does not hinge on a total ("prefab ADUs permitted at…"). Never infer a gap, a missing unit, or a range from the unit/suite numbers in addresses — "#9" through "#15" is a naming scheme, not a sequence, so do not write "minus one", "all but one", "#9 through #15", or any similar range/exception phrasing.

NO FILLER ADJECTIVES: do not call a project "significant", "substantial", "major", "large-scale", "notable", or "important" without saying *why* the resident should care. Do not write "This represents …", "This reflects ongoing …", "This underscores …" — sentences that gesture at significance instead of stating it. If you can't name the concrete reason (square footage, units, tenant, dollar tag in context, neighborhood impact), drop the second sentence. One useful sentence beats two with one of them puffed up.

Return a JSON array. Each item:
{
  "date": "YYYY-MM-DD",
  "headline": "short plain-English headline (max 12 words). Use permit-accurate verbs only.",
  "summary": "1-2 sentences. What's being permitted, where, why it matters. Do not assert construction has started. No filler significance language."
}

Return [] if nothing is genuinely noteworthy.`, 512);

      for (const item of found) {
        items.push({
          id: makeId(config.cityId, item.date, item.headline),
          cityId: config.cityId,
          cityName: config.cityName,
          date: item.date,
          headline: expandStreetAbbreviations(item.headline),
          summary: expandStreetAbbreviations(item.summary),
          sourceUrl: config.permitUrl || config.agendaUrl,
          source: "permit",
        });
        console.log(`  ✅ ${config.cityName}: ${item.headline}`);
      }
      if (!found.length) console.log(`  — ${config.cityName}: no noteworthy permits`);
    } catch (err) {
      console.error(`  ❌ ${config.cityName} permits: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return items;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN: gather, merge, deduplicate, output
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  // Gather from all sources
  const [councilItems, planningItems, permitItems] = await Promise.all([
    gatherMeetingItems("City+Council"),
    gatherMeetingItems("Planning+Commission"),
    gatherPermitItems(),
  ]);
  // Tracker edits are editorial changes, not dated civic actions. A corrected
  // status cannot be reported as if a city approved a project today.
  const allItems = [...councilItems, ...planningItems, ...permitItems];
  console.log(`\n📊 Totals: ${councilItems.length} council, ${planningItems.length} planning, ${permitItems.length} permit`);

  // Hedge-summary filter: drop items where Claude wrote vague "specifics weren't
  // provided / details unclear / could affect..." filler. These slip past even
  // a strict prompt and look like junk on city pages.
  const hedgeFiltered = allItems.filter((item) => {
    if (isHedgeSummary(item.summary)) {
      console.log(`  🪓 dropped hedge summary [${item.cityName}]: ${item.headline}`);
      return false;
    }
    return true;
  });
  if (hedgeFiltered.length < allItems.length) {
    console.log(`  ${allItems.length - hedgeFiltered.length} hedge items dropped`);
  }

  // Filler-tail trim: strip a trailing "This represents …" / "The project
  // reflects ongoing …" sentence so the deploy keeps the useful first sentence
  // without the AI-speak puff. Safety net for the NO FILLER ADJECTIVES prompt
  // rule — same shape as hedge but rewrites rather than drops.
  let trimmed = 0;
  for (const item of hedgeFiltered) {
    const before = item.summary;
    const after = stripFillerTail(stripAttendanceDisclaimer(before));
    if (after !== before) {
      item.summary = after;
      trimmed += 1;
      console.log(`  ✂️  trimmed filler tail [${item.cityName}]: ${item.headline}`);
    }
  }
  if (trimmed) console.log(`  ${trimmed} filler tails trimmed`);

  // Sort by date descending
  hedgeFiltered.sort((a, b) => b.date.localeCompare(a.date));

  // Simple dedup: if two items from the same city have very similar headlines, keep the first (higher priority source)
  const seen = new Set();
  const deduped = hedgeFiltered.filter((item) => {
    const key = `${item.cityId}-${item.headline.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const topItems = deduped.slice(0, 8);

  const output = {
    items: topItems,
    generatedAt: new Date().toISOString(),
  };

  writeFileAtomic(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n✅ Done — ${topItems.length} items written to ${OUT_PATH}`);
  for (const item of topItems) {
    console.log(`  [${item.source}] ${item.cityName} (${item.date}): ${item.headline}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
