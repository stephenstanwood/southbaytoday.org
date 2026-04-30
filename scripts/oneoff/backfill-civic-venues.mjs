// One-off: backfill missing venues on civic-meeting events using the same
// title-based inference as generate-events.mjs's inferCivicVenueFromTitle.
// Safe to delete after the next nightly regen picks up the new logic.
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = join(__dirname, "../../src/data/south-bay/upcoming-events.json");

function inferCivicVenueFromTitle(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  if (
    /\b(town council|city council|council meeting|council\s+study\s+session|study session|public hearing|zoning\s+administrator|planning commission|civic improvement commission|parks (?:and|&)\s+sustainability commission|parks (?:and|&)\s+recreation commission|arts commission|library commission|board meeting|city manager|special meeting)\b/.test(
      t,
    )
  ) {
    return "Council Chambers";
  }
  if (/\bcommission\b/.test(t) && /\b(meeting|hearing)\b/.test(t)) {
    return "Council Chambers";
  }
  return null;
}

const CIVIC_SOURCES = new Set([
  "City of Campbell",
  "City of Cupertino",
  "City of Los Altos",
  "City of Milpitas",
  "City of Mountain View",
  "City of Saratoga",
  "City of Sunnyvale",
  "Town of Los Gatos",
]);

const data = JSON.parse(readFileSync(PATH, "utf8"));
let patched = 0;
for (const ev of data.events) {
  if (ev.venue) continue;
  if (!CIVIC_SOURCES.has(ev.source)) continue;
  const guess = inferCivicVenueFromTitle(ev.title);
  if (guess) {
    ev.venue = guess;
    patched++;
    console.log(`  ${ev.source} → "${ev.title.slice(0, 60)}" → ${guess}`);
  }
}

writeFileSync(PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`\nPatched ${patched} events.`);
