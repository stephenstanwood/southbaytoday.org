#!/usr/bin/env node
/**
 * generate-city-briefings.mjs
 *
 * Generates a city-specific weekly briefing for each South Bay city.
 * Pulls from upcoming events, around-town highlights, and council agenda
 * items, then uses Claude Haiku to write a one-sentence editorial lead.
 *
 * Output: src/data/south-bay/city-briefings.json
 *
 * Run: node --env-file=.env.local scripts/generate-city-briefings.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EVENTS_PATH   = join(__dirname, "..", "src", "data", "south-bay", "upcoming-events.json");
const AROUND_PATH   = join(__dirname, "..", "src", "data", "south-bay", "around-town.json");
const MEETINGS_PATH = join(__dirname, "..", "src", "data", "south-bay", "upcoming-meetings.json");
const OUT_PATH      = join(__dirname, "..", "src", "data", "south-bay", "city-briefings.json");

// Load env if needed
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const lines = readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const CLAUDE_HAIKU = "claude-haiku-4-5-20251001";

const CITIES = [
  { id: "campbell",      name: "Campbell" },
  { id: "cupertino",     name: "Cupertino" },
  { id: "los-gatos",     name: "Los Gatos" },
  { id: "mountain-view", name: "Mountain View" },
  { id: "saratoga",      name: "Saratoga" },
  { id: "sunnyvale",     name: "Sunnyvale" },
  { id: "san-jose",      name: "San Jose" },
  { id: "santa-clara",   name: "Santa Clara" },
  { id: "los-altos",     name: "Los Altos" },
  { id: "palo-alto",     name: "Palo Alto" },
  { id: "milpitas",      name: "Milpitas" },
];

function getWeekRange() {
  const now = new Date();
  const start = now.toISOString().split("T")[0];
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  const endStr = end.toISOString().split("T")[0];
  const label = `${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return { start, end: endStr, label };
}

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_HAIKU,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.content[0].text.trim();
}

function titleCase(str) {
  return str.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

async function generateBriefing(city, events, aroundItems, meetingData) {
  const eventLines = events.slice(0, 5).map((e) =>
    `- ${e.title}${e.venue ? ` at ${e.venue}` : ""}${e.date ? ` (${e.date})` : ""}${e.time ? ` @ ${e.time}` : ""} — ${e.category}`
  ).join("\n");

  const aroundLines = aroundItems.slice(0, 3).map((a) =>
    `- ${a.headline}`
  ).join("\n");

  const agendaLines = meetingData?.agendaItems?.slice(0, 3).map((a) =>
    `- ${a.title}`
  ).join("\n") ?? "";

  const hasSomething = events.length > 0 || aroundItems.length > 0 || (meetingData?.agendaItems?.length ?? 0) > 0;
  if (!hasSomething) return null;

  const parts = [];
  if (eventLines) parts.push(`Upcoming events:\n${eventLines}`);
  if (aroundLines) parts.push(`City hall highlights:\n${aroundLines}`);
  if (agendaLines && meetingData?.displayDate) {
    parts.push(`Next council meeting (${meetingData.displayDate}) agenda:\n${agendaLines}`);
  }

  const prompt = `You are the editorial voice of South Bay Signal, a hyperlocal news site for Silicon Valley residents.

Write ONE sentence (20-30 words) summarizing what's most interesting or noteworthy happening in ${city.name} this week. Tone: crisp, local, specific — like a smart friend texting you what's going on in your city. Mention actual event names or city hall actions if relevant. No fluff.

${parts.join("\n\n")}

Reply with ONLY the sentence, no quotes or preamble.`;

  return callClaude(prompt);
}

async function main() {
  const { events: allEvents } = JSON.parse(readFileSync(EVENTS_PATH, "utf8"));
  const { items: aroundItems } = JSON.parse(readFileSync(AROUND_PATH, "utf8"));
  const meetingsData = JSON.parse(readFileSync(MEETINGS_PATH, "utf8"));
  const { start, end, label } = getWeekRange();

  console.log(`Generating city briefings for ${label}…\n`);

  const result = {};

  for (const city of CITIES) {
    const cityEvents = allEvents.filter(
      (e) => e.city === city.id && !e.ongoing && e.date >= start && e.date <= end
    ).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

    // Filter out non-public events (practices, rehearsals, etc.)
    const BRIEFING_SKIP = /\b(practice|rehearsal|staff meeting|board meeting)\b/i;
    const publicEvents = cityEvents.filter((e) => !BRIEFING_SKIP.test(e.title));

    // Prefer non-sports events for the briefing lead; keep sports as fallback
    const interestingEvents = [
      ...publicEvents.filter((e) => e.category !== "sports"),
      ...publicEvents.filter((e) => e.category === "sports"),
    ].slice(0, 5);

    const cityAroundItems = aroundItems.filter((a) => a.cityId === city.id);
    const cityMeeting = meetingsData.meetings?.[city.id] ?? null;

    if (!interestingEvents.length && !cityAroundItems.length && !cityMeeting?.agendaItems?.length) {
      console.log(`  ${city.name}: no data — skipping`);
      continue;
    }

    try {
      const summary = await generateBriefing(city, interestingEvents, cityAroundItems, cityMeeting);
      if (!summary) {
        console.log(`  ${city.name}: no summary generated — skipping`);
        continue;
      }

      // Build highlight list (up to 3 items for display)
      const highlights = [];
      for (const e of interestingEvents.slice(0, 2)) {
        highlights.push({
          type: "event",
          title: e.title,
          when: e.displayDate ? `${e.displayDate}${e.time ? ` · ${e.time}` : ""}` : e.date,
          venue: e.venue || null,
          category: e.category,
          url: e.url || null,
        });
      }
      if (cityMeeting?.agendaItems?.length) {
        highlights.push({
          type: "council",
          title: cityMeeting.agendaItems[0].title.replace(/\.$/, ""),
          when: cityMeeting.displayDate,
          venue: null,
          category: "government",
          url: cityMeeting.url || null,
        });
      } else if (cityAroundItems.length) {
        highlights.push({
          type: "cityhall",
          title: cityAroundItems[0].headline,
          when: null,
          venue: null,
          category: "government",
          url: cityAroundItems[0].sourceUrl || null,
        });
      }

      result[city.id] = {
        cityId: city.id,
        cityName: city.name,
        summary,
        highlights: highlights.slice(0, 3),
        weekLabel: label,
        generatedAt: new Date().toISOString(),
      };

      console.log(`  ✓ ${city.name}: ${summary}`);
    } catch (err) {
      console.error(`  ✗ ${city.name}: ${err.message}`);
    }

    // Small delay between Claude calls to be polite
    await new Promise((r) => setTimeout(r, 300));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    weekLabel: label,
    weekStart: start,
    weekEnd: end,
    cities: result,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n✅ ${Object.keys(result).length} city briefings written to city-briefings.json`);
}

main().catch((err) => { console.error(err); process.exit(1); });
