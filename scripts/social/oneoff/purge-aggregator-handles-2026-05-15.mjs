#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-off cleanup: remove _auto entries from social-handles.json whose
// handles point to event aggregators / community calendars rather than the
// actual venue or performer. The Tier-1 URL scraper was grabbing the
// lister's social handles (footer/header) instead of the event's, then
// attributing them to whatever event was on that page. Those tags then
// leaked into every future post mentioning that event ("@ticketweb" on a
// punk-night card, "@sjdowntown" on a restaurant).
//
// Companion fix lives in handle-lookup.mjs (isThirdPartyEventListing extended
// + handlesAreAggregator guard at save time). This script just cleans the
// state that already accumulated.
//
// Also strips @-handle text from already-approved Facebook copy in
// social-schedule.json. FB doesn't render text @-mentions as clickable
// links anyway, so the @-tags were always cosmetic at best — and when they
// pointed at aggregators, they were embarrassing.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

const HANDLES_FILE = join(REPO_ROOT, "src", "data", "south-bay", "social-handles.json");
const SCHEDULE_FILE = join(REPO_ROOT, "src", "data", "south-bay", "social-schedule.json");

const AGGREGATOR_HANDLES = new Set([
  "ticketweb", "eventbrite", "ticketmaster", "stubhub", "axs",
  "sjdowntown", "sj_downtown", "bibliocommons", "do408", "funcheap",
  "sanjoseca",
]);

function isAggregatorHandle(v) {
  return typeof v === "string" && AGGREGATOR_HANDLES.has(v.toLowerCase());
}

// ── 1. Purge bad _auto entries from social-handles.json ───────────────────

const handlesRaw = JSON.parse(readFileSync(HANDLES_FILE, "utf8"));
let purged = 0;
for (const section of ["venues", "orgs", "performers"]) {
  if (!handlesRaw[section]) continue;
  for (const [name, h] of Object.entries(handlesRaw[section])) {
    if (name.startsWith("_")) continue;
    if (!h?._auto) continue;
    const handleVals = ["x", "instagram", "facebook", "threads", "bluesky", "mastodon"]
      .map((p) => h[p])
      .filter(Boolean);
    if (handleVals.some(isAggregatorHandle)) {
      console.log(`  🗑️  removing ${section}/${name} — handles: ${JSON.stringify(
        Object.fromEntries(Object.entries(h).filter(([k]) => !k.startsWith("_")))
      )}`);
      delete handlesRaw[section][name];
      purged++;
    }
  }
}

if (purged > 0) {
  writeFileSync(HANDLES_FILE, JSON.stringify(handlesRaw, null, 2) + "\n");
  console.log(`\n✅ Purged ${purged} aggregator-handle entries from social-handles.json`);
} else {
  console.log("No aggregator-handle entries to purge.");
}

// ── 2. Strip @-handles from approved Facebook copy in social-schedule.json ─

const schedule = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
let touchedSlots = 0;

// Strip "@handle" patterns from a string. Also tidies trailing "(@handle)"
// parentheticals and double-spaces left behind.
function stripFbHandles(text) {
  if (typeof text !== "string") return text;
  let out = text;
  out = out.replace(/\s*\(@[A-Za-z0-9_.]+\)/g, ""); // "Name (@handle)" → "Name"
  out = out.replace(/@[A-Za-z0-9_.]+/g, ""); // bare @handle
  out = out
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.!?,;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}

for (const [date, slots] of Object.entries(schedule.days || {})) {
  for (const [slotType, slot] of Object.entries(slots)) {
    if (!slot || typeof slot !== "object") continue;
    if (slot.status === "published") continue; // can't change what's already out
    const copy = slot.copy;
    if (!copy || typeof copy.facebook !== "string") continue;
    const before = copy.facebook;
    const after = stripFbHandles(before);
    if (before !== after) {
      copy.facebook = after;
      console.log(`  ✏️  ${date} / ${slotType}: stripped FB @-tags`);
      touchedSlots++;
    }
  }
}

if (touchedSlots > 0) {
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2) + "\n");
  console.log(`\n✅ Stripped FB @-tags from ${touchedSlots} approved schedule slots`);
} else {
  console.log("No approved FB copy needed stripping.");
}
