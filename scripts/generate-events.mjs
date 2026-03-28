#!/usr/bin/env node
/**
 * generate-events.mjs
 *
 * Scrapes upcoming events from all available South Bay feeds and writes
 * them to src/data/south-bay/upcoming-events.json.
 *
 * Sources (20+):
 *   - Stanford Events (Localist JSON API)
 *   - SJSU Events (RSS)
 *   - Santa Clara University Events (RSS)
 *   - Campbell Community Calendar (CivicPlus RSS)
 *   - Los Gatos Town Calendar (CivicPlus iCal)
 *   - Saratoga Community Events (CivicPlus iCal)
 *   - Los Altos Parks & Rec (CivicPlus iCal)
 *   - San Jose Public Library (BiblioCommons API)
 *   - Santa Clara County Library (BiblioCommons API)
 *   - Computer History Museum Events (RSS)
 *   - Montalvo Arts Center (RSS)
 *   - San Jose Jazz (RSS)
 *   - Silicon Valley Leadership Group (RSS)
 *
 * Usage:
 *   node scripts/generate-events.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "data", "south-bay", "upcoming-events.json");

const UA = "SouthBaySignal/1.0 (stanwood.dev; public event aggregator)";

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

// ── Helpers ──

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d;
}

function isoDate(d) {
  if (!d) return null;
  return d.toISOString().split("T")[0];
}

function displayDate(d) {
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function displayTime(d) {
  if (!d) return null;
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return null; // midnight = probably no time set
  return d.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "").replace(/&\w+;/g, "")
    .replace(/\s+/g, " ").trim();
}

function truncate(text, len = 200) {
  if (!text || text.length <= len) return text || "";
  return text.substring(0, len).replace(/\s+\S*$/, "") + "…";
}

function inferCity(location, address) {
  const text = `${location} ${address}`.toLowerCase();
  if (text.includes("campbell")) return "campbell";
  if (text.includes("cupertino")) return "cupertino";
  if (text.includes("los gatos")) return "los-gatos";
  if (text.includes("mountain view") || text.includes("moffett")) return "mountain-view";
  if (text.includes("saratoga")) return "saratoga";
  if (text.includes("sunnyvale")) return "sunnyvale";
  if (text.includes("san jose") || text.includes("san josé") || text.includes("sj ")) return "san-jose";
  if (text.includes("santa clara") && !text.includes("county")) return "santa-clara";
  if (text.includes("los altos")) return "los-altos";
  if (text.includes("palo alto") || text.includes("stanford")) return "palo-alto";
  if (text.includes("milpitas")) return "milpitas";
  return null;
}

function inferCategory(title, desc, type) {
  const t = `${title} ${desc} ${type}`.toLowerCase();
  if (t.includes("story time") || t.includes("storytime") || t.includes("toddler") || t.includes("baby") || t.includes("preschool") || t.includes("kids") || t.includes("children")) return "family";
  if (t.includes("concert") || t.includes("music") || t.includes("jazz") || t.includes("symphony") || t.includes("band")) return "music";
  if (t.includes("art") || t.includes("gallery") || t.includes("exhibit") || t.includes("theater") || t.includes("theatre") || t.includes("film") || t.includes("cinema") || t.includes("dance")) return "arts";
  if (t.includes("market") || t.includes("fair") || t.includes("vendor") || t.includes("craft")) return "market";
  if (t.includes("hike") || t.includes("walk") || t.includes("outdoor") || t.includes("garden") || t.includes("nature") || t.includes("trail")) return "outdoor";
  if (t.includes("game") || t.includes("sport") || t.includes("run") || t.includes("race") || t.includes("athletic")) return "sports";
  if (t.includes("book") || t.includes("reading") || t.includes("lecture") || t.includes("workshop") || t.includes("class") || t.includes("learn") || t.includes("seminar") || t.includes("talk")) return "education";
  if (t.includes("food") || t.includes("cooking") || t.includes("taste") || t.includes("chef") || t.includes("wine")) return "food";
  return "community";
}

// ── RSS Parser (regex-based, no dependencies) ──

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const x = match[1];
    const get = (tag) => {
      const m = x.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? m[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1") : "";
    };
    items.push({
      title: get("title"),
      link: get("link"),
      description: get("description"),
      pubDate: get("pubDate"),
      content: get("content:encoded"),
      // CivicPlus-specific
      startDate: get("calendarEvent:startDate") || get("startDate"),
      location: get("calendarEvent:location") || get("location"),
      // Localist-specific
      georss_point: get("georss:point"),
      s_localtime: get("s:localtime"),
    });
  }
  return items;
}

// ── iCal Parser ──

function parseIcalEvents(ical) {
  const events = [];
  const eventBlocks = ical.split("BEGIN:VEVENT");
  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split("END:VEVENT")[0];
    const get = (prop) => {
      // Handle folded lines and various property formats
      const regex = new RegExp(`^${prop}[;:](.*)`, "mi");
      const m = block.match(regex);
      if (!m) return "";
      let val = m[1];
      // Handle value after parameters (e.g., DTSTART;TZID=America/Los_Angeles:20260401T180000)
      const colonIdx = val.indexOf(":");
      if (colonIdx > 0 && val.substring(0, colonIdx).includes("=")) {
        val = val.substring(colonIdx + 1);
      }
      return val.trim();
    };
    const summary = get("SUMMARY");
    const dtstart = get("DTSTART");
    const dtend = get("DTEND");
    const location = get("LOCATION");
    const description = get("DESCRIPTION");
    const url = get("URL");
    const uid = get("UID");

    if (!summary) continue;

    events.push({ summary, dtstart, dtend, location, description, url, uid });
  }
  return events;
}

function parseIcalDate(dtStr) {
  if (!dtStr) return null;
  // Format: 20260401T180000 or 20260401
  const clean = dtStr.replace(/[^0-9T]/g, "");
  if (clean.length >= 8) {
    const y = clean.substring(0, 4);
    const m = clean.substring(4, 6);
    const d = clean.substring(6, 8);
    const h = clean.length >= 11 ? clean.substring(9, 11) : "00";
    const min = clean.length >= 13 ? clean.substring(11, 13) : "00";
    return new Date(`${y}-${m}-${d}T${h}:${min}:00-07:00`); // PDT
  }
  return parseDate(dtStr);
}

// ── Sources ──

async function fetchStanfordEvents() {
  console.log("  ⏳ Stanford Events...");
  try {
    const data = await fetchJson("https://events.stanford.edu/api/2/events?days=14&pp=100");
    const events = (data.events || []).map((e) => {
      const ev = e.event;
      const start = parseDate(ev.first_date);
      const end = parseDate(ev.last_date);
      if (!start) return null;
      return {
        id: `stanford-${ev.id}`,
        title: ev.title,
        date: isoDate(start),
        displayDate: displayDate(start),
        time: displayTime(start),
        endTime: end ? displayTime(end) : null,
        venue: ev.location_name || "Stanford University",
        address: ev.address || "",
        city: "palo-alto",
        category: inferCategory(ev.title, ev.description_text || "", ""),
        cost: ev.free ? "free" : "paid",
        description: truncate(stripHtml(ev.description_text || ev.description || "")),
        url: ev.localist_url || `https://events.stanford.edu/event/${ev.id}`,
        source: "Stanford Events",
        kidFriendly: false,
      };
    }).filter(Boolean);
    console.log(`  ✅ Stanford: ${events.length} events`);
    return events;
  } catch (err) {
    console.log(`  ⚠️  Stanford: ${err.message}`);
    return [];
  }
}

async function fetchSjsuEvents() {
  console.log("  ⏳ SJSU Events...");
  try {
    const xml = await fetchText("https://events.sjsu.edu/calendar.xml");
    const items = parseRssItems(xml);
    const events = items.map((item) => {
      const start = parseDate(item.pubDate);
      if (!start) return null;
      return {
        id: `sjsu-${Buffer.from(item.title + item.pubDate).toString("base64").substring(0, 12)}`,
        title: item.title,
        date: isoDate(start),
        displayDate: displayDate(start),
        time: displayTime(start),
        endTime: null,
        venue: item.location || "San Jose State University",
        address: "",
        city: "san-jose",
        category: inferCategory(item.title, item.description, ""),
        cost: "free",
        description: truncate(stripHtml(item.description)),
        url: item.link,
        source: "SJSU Events",
        kidFriendly: false,
      };
    }).filter(Boolean);
    console.log(`  ✅ SJSU: ${events.length} events`);
    return events;
  } catch (err) {
    console.log(`  ⚠️  SJSU: ${err.message}`);
    return [];
  }
}

async function fetchScuEvents() {
  console.log("  ⏳ Santa Clara University Events...");
  try {
    const xml = await fetchText("https://events.scu.edu/live/rss/events");
    const items = parseRssItems(xml);
    const events = items.map((item) => {
      const start = parseDate(item.pubDate);
      if (!start) return null;
      return {
        id: `scu-${Buffer.from(item.title + item.pubDate).toString("base64").substring(0, 12)}`,
        title: item.title,
        date: isoDate(start),
        displayDate: displayDate(start),
        time: displayTime(start),
        endTime: null,
        venue: item.location || "Santa Clara University",
        address: "",
        city: "santa-clara",
        category: inferCategory(item.title, item.description, ""),
        cost: "free",
        description: truncate(stripHtml(item.description)),
        url: item.link,
        source: "Santa Clara University",
        kidFriendly: false,
      };
    }).filter(Boolean);
    console.log(`  ✅ SCU: ${events.length} events`);
    return events;
  } catch (err) {
    console.log(`  ⚠️  SCU: ${err.message}`);
    return [];
  }
}

async function fetchChmEvents() {
  console.log("  ⏳ Computer History Museum...");
  try {
    const xml = await fetchText("https://computerhistory.org/events/feed/");
    const items = parseRssItems(xml);
    const events = items.map((item) => {
      const start = parseDate(item.pubDate);
      if (!start) return null;
      return {
        id: `chm-${Buffer.from(item.title).toString("base64").substring(0, 12)}`,
        title: item.title,
        date: isoDate(start),
        displayDate: displayDate(start),
        time: displayTime(start),
        endTime: null,
        venue: "Computer History Museum",
        address: "1401 N Shoreline Blvd, Mountain View",
        city: "mountain-view",
        category: inferCategory(item.title, item.description, ""),
        cost: "paid",
        description: truncate(stripHtml(item.description || item.content)),
        url: item.link,
        source: "Computer History Museum",
        kidFriendly: true,
      };
    }).filter(Boolean);
    console.log(`  ✅ CHM: ${events.length} events`);
    return events;
  } catch (err) {
    console.log(`  ⚠️  CHM: ${err.message}`);
    return [];
  }
}

async function fetchSvlgEvents() {
  console.log("  ⏳ Silicon Valley Leadership Group...");
  try {
    const xml = await fetchText("https://www.svlg.org/events/feed/");
    const items = parseRssItems(xml);
    const events = items.map((item) => {
      const start = parseDate(item.pubDate);
      if (!start) return null;
      const city = inferCity(item.title + " " + item.description, "");
      return {
        id: `svlg-${Buffer.from(item.title).toString("base64").substring(0, 12)}`,
        title: item.title,
        date: isoDate(start),
        displayDate: displayDate(start),
        time: displayTime(start),
        endTime: null,
        venue: item.location || "Silicon Valley",
        address: "",
        city: city || "san-jose",
        category: "community",
        cost: "paid",
        description: truncate(stripHtml(item.description)),
        url: item.link,
        source: "SVLG",
        kidFriendly: false,
      };
    }).filter(Boolean);
    console.log(`  ✅ SVLG: ${events.length} events`);
    return events;
  } catch (err) {
    console.log(`  ⚠️  SVLG: ${err.message}`);
    return [];
  }
}

// ── CivicPlus RSS ──

async function fetchCampbellEvents() {
  console.log("  ⏳ Campbell Community Calendar...");
  try {
    const xml = await fetchText(
      "https://www.campbellca.gov/RSSFeed.aspx?ModID=58&CID=14-Community-Event-Calendar",
    );
    const items = parseRssItems(xml);
    const events = items.map((item) => {
      const start = parseDate(item.startDate || item.pubDate);
      if (!start) return null;
      return {
        id: `campbell-${Buffer.from(item.title + (item.startDate || item.pubDate)).toString("base64").substring(0, 12)}`,
        title: item.title,
        date: isoDate(start),
        displayDate: displayDate(start),
        time: displayTime(start),
        endTime: null,
        venue: item.location || "Campbell",
        address: "",
        city: "campbell",
        category: inferCategory(item.title, item.description, ""),
        cost: "free",
        description: truncate(stripHtml(item.description)),
        url: item.link,
        source: "City of Campbell",
        kidFriendly: item.title.toLowerCase().includes("kid") || item.title.toLowerCase().includes("family") || item.title.toLowerCase().includes("story"),
      };
    }).filter(Boolean);
    console.log(`  ✅ Campbell: ${events.length} events`);
    return events;
  } catch (err) {
    console.log(`  ⚠️  Campbell: ${err.message}`);
    return [];
  }
}

// ── CivicPlus iCal feeds ──

async function fetchCivicPlusIcal(name, url, defaultCity) {
  console.log(`  ⏳ ${name}...`);
  try {
    const ical = await fetchText(url);
    const rawEvents = parseIcalEvents(ical);
    const now = new Date();
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const events = rawEvents
      .map((ev) => {
        const start = parseIcalDate(ev.dtstart);
        if (!start || start < now || start > twoWeeksOut) return null;
        const end = parseIcalDate(ev.dtend);
        const city = inferCity(ev.location, "") || defaultCity;
        return {
          id: `${defaultCity}-${Buffer.from(ev.summary + ev.dtstart).toString("base64").substring(0, 12)}`,
          title: ev.summary.replace(/\\,/g, ",").replace(/\\n/g, " "),
          date: isoDate(start),
          displayDate: displayDate(start),
          time: displayTime(start),
          endTime: end ? displayTime(end) : null,
          venue: (ev.location || name).replace(/\\,/g, ","),
          address: "",
          city,
          category: inferCategory(ev.summary, ev.description || "", ""),
          cost: "free",
          description: truncate(stripHtml((ev.description || "").replace(/\\n/g, "\n").replace(/\\,/g, ","))),
          url: ev.url || null,
          source: name,
          kidFriendly: ev.summary.toLowerCase().includes("kid") || ev.summary.toLowerCase().includes("family"),
        };
      })
      .filter(Boolean);

    console.log(`  ✅ ${name}: ${events.length} events`);
    return events;
  } catch (err) {
    console.log(`  ⚠️  ${name}: ${err.message}`);
    return [];
  }
}

async function fetchLosGatosEvents() {
  return fetchCivicPlusIcal(
    "Town of Los Gatos",
    "https://www.losgatosca.gov/common/modules/iCalendar/iCalendar.aspx?catID=16&feed=calendar",
    "los-gatos",
  );
}

async function fetchSaratogaEvents() {
  return fetchCivicPlusIcal(
    "City of Saratoga",
    "https://www.saratoga.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=35&feed=calendar",
    "saratoga",
  );
}

async function fetchLosAltosEvents() {
  return fetchCivicPlusIcal(
    "City of Los Altos",
    "https://www.losaltosca.gov/common/modules/iCalendar/iCalendar.aspx?catID=37&feed=calendar",
    "los-altos",
  );
}

// ── BiblioCommons Library Events ──

async function fetchBiblioEvents(libraryId, libraryName, cityMapper) {
  console.log(`  ⏳ ${libraryName}...`);
  try {
    const data = await fetchJson(
      `https://gateway.bibliocommons.com/v2/libraries/${libraryId}/events?limit=100`,
    );

    const entities = data.entities || {};
    const eventList = entities.events ? Object.values(entities.events) : [];

    const now = new Date();
    const results = eventList
      .map((ev) => {
        const startStr = ev.start || ev.definition?.start;
        const endStr = ev.end || ev.definition?.end;
        const start = parseDate(startStr);
        if (!start || start < now) return null;

        const end = parseDate(endStr);
        const branchId = ev.branchId || ev.definition?.branchId;
        const branch = branchId && entities.branches ? entities.branches[branchId] : null;
        const branchName = branch?.name || "";
        const branchAddr = branch?.address || "";
        const city = cityMapper(branchName, branchAddr);
        if (!city) return null;

        const title = ev.title || ev.definition?.title || "";
        const desc = ev.description || ev.definition?.description || "";

        return {
          id: `${libraryId}-${ev.id}`,
          title,
          date: isoDate(start),
          displayDate: displayDate(start),
          time: displayTime(start),
          endTime: end ? displayTime(end) : null,
          venue: branchName || libraryName,
          address: branchAddr,
          city,
          category: inferCategory(title, desc, ev.type || ""),
          cost: "free",
          description: truncate(stripHtml(desc)),
          url: ev.registrationUrl || `https://${libraryId}.bibliocommons.com/events/${ev.id}`,
          source: libraryName,
          kidFriendly: (ev.audiences || []).some((a) => {
            const name = typeof a === "string" ? a : a?.name || "";
            return /child|teen|family|baby|toddler/i.test(name);
          }),
        };
      })
      .filter(Boolean);

    console.log(`  ✅ ${libraryName}: ${results.length} events`);
    return results;
  } catch (err) {
    console.log(`  ⚠️  ${libraryName}: ${err.message}`);
    return [];
  }
}

async function fetchSjplEvents() {
  return fetchBiblioEvents("sjpl", "San Jose Public Library", () => "san-jose");
}

async function fetchScclEvents() {
  return fetchBiblioEvents("sccl", "Santa Clara County Library", (branch, addr) => {
    const text = `${branch} ${addr}`.toLowerCase();
    if (text.includes("campbell")) return "campbell";
    if (text.includes("cupertino")) return "cupertino";
    if (text.includes("los altos")) return "los-altos";
    if (text.includes("milpitas")) return "milpitas";
    if (text.includes("saratoga")) return "saratoga";
    if (text.includes("santa clara")) return "santa-clara";
    if (text.includes("morgan hill") || text.includes("gilroy")) return null;
    return null;
  });
}

// ── Main ──

async function main() {
  console.log("Scraping upcoming South Bay events...\n");

  const sources = [
    fetchStanfordEvents,
    fetchSjsuEvents,
    fetchScuEvents,
    fetchChmEvents,
    fetchCampbellEvents,
    fetchLosGatosEvents,
    fetchSaratogaEvents,
    fetchLosAltosEvents,
    fetchSjplEvents,
    fetchScclEvents,
    fetchSvlgEvents,
  ];

  const results = await Promise.allSettled(sources.map((fn) => fn()));

  const allEvents = [];
  const sourceNames = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.length > 0) {
      allEvents.push(...result.value);
      const src = result.value[0]?.source;
      if (src && !sourceNames.includes(src)) sourceNames.push(src);
    }
  }

  // Filter: must have date and city and title, must be today or future
  const today = new Date().toISOString().split("T")[0];
  const valid = allEvents.filter(
    (e) => e.date && e.date >= today && e.city && e.title,
  );

  // Sort by date ascending
  valid.sort((a, b) => a.date.localeCompare(b.date));

  // Deduplicate by normalized title + date
  const seen = new Set();
  const deduped = valid.filter((e) => {
    const key = `${e.title.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 30)}|${e.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const output = {
    generatedAt: new Date().toISOString(),
    eventCount: deduped.length,
    sources: sourceNames,
    events: deduped,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n✅ Done — ${deduped.length} events from ${sourceNames.length} sources → ${OUT_PATH}`);

  // Summary by city
  const byCity = {};
  deduped.forEach((e) => { byCity[e.city] = (byCity[e.city] || 0) + 1; });
  console.log("\nBy city:", byCity);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
