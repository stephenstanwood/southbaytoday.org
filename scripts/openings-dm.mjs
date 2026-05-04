#!/usr/bin/env node
// Daily pre-wakeup check (3:30 AM PT, run from Mac Mini): if anything notable
// is opening today, DM Stephen via the #tasks Discord webhook. Silent on
// empty days.
//
// Sources:
//   1. scc-food-openings.json  → opened[] entries with date == today
//   2. upcoming-events.json    → events with date == today AND title/description
//                                matching opening keywords (grand opening,
//                                grand reopening, ribbon cutting, etc.)
//
// Adding sources later: append a function that returns the same item shape
// ({ kind, emoji, name, blurb, where, url, time }) and concat into `items`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../src/data/south-bay");

const TODAY =
  process.env.TODAY ||
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const NOW_FOR_LABEL = process.env.TODAY
  ? new Date(`${process.env.TODAY}T12:00:00-07:00`)
  : new Date();

const OPENING_RX =
  /\b(grand\s+(re)?opening|grand\s+re-opening|ribbon[\s-]*cutting|opening\s+day|now\s+open|opens\s+today|inauguration)\b/i;

const KIND_PATTERNS = [
  { rx: /library|sccld/i, kind: "Library", emoji: "📚" },
  { rx: /\bpark\b/i, kind: "Park", emoji: "🌳" },
  { rx: /trail/i, kind: "Trail", emoji: "🥾" },
  { rx: /museum|gallery/i, kind: "Museum", emoji: "🏛️" },
  { rx: /school|academy/i, kind: "School", emoji: "🏫" },
  { rx: /theatre|theater/i, kind: "Theater", emoji: "🎭" },
  { rx: /shop|store|market|boutique/i, kind: "Retail", emoji: "🛍️" },
  { rx: /cafe|coffee|restaurant|bar\b|kitchen|eatery/i, kind: "Food", emoji: "🍽️" },
];

function classifyEvent(e) {
  const blob = `${e.title || ""} ${e.venue || ""}`;
  for (const p of KIND_PATTERNS) if (p.rx.test(blob)) return p;
  return { kind: "Event", emoji: "🎉" };
}

function readJson(name) {
  try {
    return JSON.parse(readFileSync(resolve(DATA, name), "utf8"));
  } catch {
    return null;
  }
}

function titleCaseCity(s) {
  return (s || "")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function todaysFood() {
  const food = readJson("scc-food-openings.json");
  if (!food?.opened) return [];
  return food.opened
    .filter((x) => x.date === TODAY)
    .map((x) => ({
      kind: "Restaurant",
      emoji: "🍽️",
      name: x.name,
      blurb: x.blurb || null,
      where: [x.address, titleCaseCity(x.cityName)].filter(Boolean).join(", "),
      url: null,
      time: null,
    }));
}

function dedupKey(e) {
  const city = (e.city || "").toLowerCase();
  const base = (e.venue || e.title || "")
    .toLowerCase()
    .replace(/\s+(grand\s+)?(re)?-?opening.*$/i, "")
    .replace(/\s+ribbon[\s-]?cutting.*$/i, "")
    .replace(/\s+opening\s+day.*$/i, "")
    .trim();
  return `${city}::${base}`;
}

function todaysOpeningEvents() {
  const ev = readJson("upcoming-events.json");
  if (!ev?.events) return [];
  const groups = new Map();
  for (const e of ev.events) {
    if (e.date !== TODAY) continue;
    const blob = `${e.title || ""} ${e.description || ""}`;
    if (!OPENING_RX.test(blob)) continue;
    const key = dedupKey(e);
    const prior = groups.get(key);
    // Prefer entry with URL; otherwise prefer longer blurb/description.
    if (!prior) {
      groups.set(key, e);
    } else {
      const priorScore = (prior.url ? 10 : 0) + (prior.blurb?.length || 0);
      const curScore = (e.url ? 10 : 0) + (e.blurb?.length || 0);
      if (curScore > priorScore) groups.set(key, e);
    }
  }
  return [...groups.values()].map((e) => {
    const { kind, emoji } = classifyEvent(e);
    const blurb =
      e.blurb ||
      (e.description ? e.description.slice(0, 200).replace(/\s+\S*$/, "") + "…" : null);
    return {
      kind,
      emoji,
      name: e.title,
      blurb,
      where: [e.venue, titleCaseCity(e.city)].filter(Boolean).join(", "),
      url: e.url || null,
      time: e.time || null,
    };
  });
}

const items = [...todaysFood(), ...todaysOpeningEvents()];

if (items.length === 0) {
  console.log(`[openings-dm] ${TODAY}: nothing opening — no DM`);
  process.exit(0);
}

const dateLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(NOW_FOR_LABEL);

let body = `🆕 **Opens today — ${dateLabel}**\n`;
for (const it of items) {
  body += `\n${it.emoji} **${it.kind}: ${it.name}**\n`;
  const meta = [it.time, it.where].filter(Boolean).join(" · ");
  if (meta) body += `${meta}\n`;
  if (it.blurb) body += `${it.blurb}\n`;
  if (it.url) body += `${it.url}\n`;
}

if (process.env.DRY_RUN) {
  console.log(body);
  process.exit(0);
}

const webhook = process.env.DISCORD_WEBHOOK;
if (!webhook) {
  console.error("[openings-dm] DISCORD_WEBHOOK not set");
  process.exit(1);
}

const res = await fetch(webhook, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: body.slice(0, 1990) }),
});
if (!res.ok) {
  console.error(`[openings-dm] webhook ${res.status}: ${await res.text()}`);
  process.exit(1);
}
console.log(`[openings-dm] ${TODAY}: posted ${items.length} item(s)`);
