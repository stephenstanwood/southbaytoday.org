#!/usr/bin/env node
/**
 * generate-upcoming-meetings.mjs
 *
 * Queries the Legistar Web API (free, no auth) for each South Bay city's
 * next scheduled council meeting and writes the results to
 * src/data/south-bay/upcoming-meetings.json.
 *
 * Also fetches the top substantive agenda items for each meeting so the
 * Government tab can show a forward-looking preview of what's on the docket.
 *
 * Run: node scripts/generate-upcoming-meetings.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "upcoming-meetings.json");

const UA = "SouthBaySignal/1.0 (stanwood.dev; public civic data aggregator)";

const LEGISTAR_CITIES = [
  { city: "san-jose",      client: "sanjose",      body: "City Council" },
  { city: "mountain-view", client: "mountainview",  body: "City Council" },
  { city: "sunnyvale",     client: "sunnyvaleca",   body: "City Council" },
  { city: "cupertino",     client: "cupertino",     body: "City Council" },
  { city: "santa-clara",   client: "santaclara",    body: "City Council" },
];

// Phrases that indicate a boilerplate/procedural agenda item to skip
const SKIP_PREFIXES = [
  "please scroll", "for live translation", "any member of the public",
  "you may speak", "by email", "members of the public", "to request",
  "the levine act", "how to", "fill out a", "each speaker", "notice to the public",
  "all public records", "page break", "open forum",
];
const SKIP_EXACT = new Set([
  "call to order", "roll call", "pledge of allegiance", "invocation",
  "adjournment", "closed session", "open session", "recess",
  "orders of the day", "postponements and orders of the day",
  "closed session report", "consent calendar", "end of consent calendar",
  "land use consent calendar", "ceremonial items", "strategic support",
  "public safety services", "transportation & aviation services",
  "environmental & utility services", "neighborhood services",
  "community & economic development", "redevelopment – successor agency",
  "land use", "land use - regular agenda", "regular agenda", "open forum",
  "adjournment recognition", "public hearings", "special meeting",
  "closed session, call to order in council chambers",
  "american disability act", "public comment in person only",
  "public comment", "public hearing",
]);

// Prefixes that indicate procedural/non-substantive items
const SKIP_STARTS_WITH = [
  "call to order", "roll call", "regular session,", "closed session,",
  "public comment", "subject:  conference with legal counsel",
  "subject:  conference with real property",
];

function isSubstantiveItem(rawTitle) {
  if (!rawTitle) return false;
  // Use only the first line (some items have addresses/details appended via \r\n)
  const t = rawTitle.split(/\r?\n/)[0].trim();
  if (t.length < 20 || t.length > 300) return false;

  const lower = t.toLowerCase();

  // Skip exact boilerplate
  if (SKIP_EXACT.has(lower)) return false;

  // Skip known boilerplate prefixes
  for (const prefix of SKIP_PREFIXES) {
    if (lower.startsWith(prefix)) return false;
  }

  // Skip SKIP_STARTS_WITH patterns
  for (const prefix of SKIP_STARTS_WITH) {
    if (lower.startsWith(prefix)) return false;
  }

  // Skip all-caps section headers (e.g. "CONSENT CALENDAR", "PUBLIC PARTICIPATION INFORMATION")
  // Check: no lowercase letters present = it's a header/banner
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) return false;

  // Skip items that are just a URL
  if (/^https?:\/\//.test(t)) return false;

  // Skip items that are just phone numbers or generic procedural notices
  if (/^\d/.test(t) && t.length < 40) return false;

  return true;
}

async function fetchAgendaItems(client, eventId) {
  const url = `https://webapi.legistar.com/v1/${client}/Events/${eventId}/EventItems`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const items = await res.json();

    // Filter to substantive items and take up to 5
    return items
      .filter((item) => isSubstantiveItem(item.EventItemTitle))
      .slice(0, 5)
      .map((item) => ({
        title: item.EventItemTitle.split(/\r?\n/)[0].trim(),
        sequence: item.EventItemAgendaSequence,
      }));
  } catch {
    return [];
  }
}

async function fetchNextMeeting(city, client, body) {
  const today = new Date().toISOString().split("T")[0];
  const url =
    `https://webapi.legistar.com/v1/${client}/Events` +
    `?$filter=EventBodyName eq '${body}' and EventDate gt datetime'${today}T00:00:00'` +
    `&$orderby=EventDate asc&$top=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const events = await res.json();
  if (!events.length) return null;

  const ev = events[0];
  const date = new Date(ev.EventDate);

  // Skip placeholder dates more than 60 days out (common Legistar calendar blocker)
  const daysOut = (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysOut > 60) return null;

  const agendaItems = await fetchAgendaItems(client, ev.EventId);

  return {
    date: date.toISOString().split("T")[0],
    displayDate: date.toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      timeZone: "America/Los_Angeles",
    }),
    bodyName: ev.EventBodyName,
    location: ev.EventLocation || null,
    url: `https://${client}.legistar.com/MeetingDetail.aspx?ID=${ev.EventId}&GUID=${ev.EventGuid}`,
    legistarEventId: ev.EventId,
    agendaItems,
  };
}

async function main() {
  console.log("Fetching upcoming council meetings from Legistar...\n");

  const meetings = {};

  for (const { city, client, body } of LEGISTAR_CITIES) {
    process.stdout.write(`  ⏳ ${city}...`);
    try {
      const next = await fetchNextMeeting(city, client, body);
      if (next) {
        meetings[city] = next;
        const itemCount = next.agendaItems?.length ?? 0;
        console.log(` ✅ ${next.displayDate} (${itemCount} agenda items)`);
      } else {
        console.log(` — none scheduled`);
      }
    } catch (err) {
      console.log(` ⚠️  ${err.message}`);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    meetings,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  const count = Object.keys(meetings).length;
  console.log(`\n✅ Done — ${count} cities with upcoming meetings → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
