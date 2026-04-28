#!/usr/bin/env node
// One-off backfill (cycle 110): apply SCCL branch venues + the relaxed
// stripRedundantVenueSuffix to the current upcoming-events.json so the
// improvement ships now rather than waiting for the next nightly regen.
//
// Idempotent — runs through the same data twice yield the same output.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { polishDescription } from "./generate-events.mjs"; // forces module load (also a sanity check it exports)

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "..", "src", "data", "south-bay", "upcoming-events.json");

// City slug → SCCL branch display name. Used when the location code isn't
// available (the existing JSON doesn't carry it), so we infer the branch from
// the city slug. Every SCCL slug except los-altos has a single branch in the
// system, so this is exact for those. los-altos collapses Woodland into Los
// Altos — Woodland is a small minority and the next regen will correct it
// using the actual branchLocationId.
const SCCL_CITY_BRANCH = {
  campbell: "Campbell Library",
  cupertino: "Cupertino Library",
  "los-altos": "Los Altos Library",
  "los-gatos": "Los Gatos Library",
  milpitas: "Milpitas Library",
  saratoga: "Saratoga Library",
  "santa-clara": "Santa Clara City Library",
};

// Mirror of the upgraded stripRedundantVenueSuffix in generate-events.mjs.
// Kept inline so this backfill stays self-contained and doesn't need an
// additional named export.
function stripRedundantVenueSuffix(title, venue) {
  if (!title) return title;
  let t = title;

  // Pattern 1: " at <City>, Calif./CA[.]" — SJSU Athletics location tail.
  t = t.replace(
    /\s+at\s+[A-Z][\w\s.'-]+,\s*(?:Calif\.?|CA)\.?$/i,
    "",
  );

  // Pattern 2: " at <Venue>" — relaxed equality so a title's "at <Branch>"
  // collapses against a venue of "<Branch> Library", "<Branch> Branch", or
  // "the <Branch> Library".
  if (venue && typeof venue === "string") {
    const m = t.match(/^(.+?)\s+at\s+(.+?)\s*$/);
    if (m) {
      const [, base, suffix] = m;
      const norm = (s) =>
        s
          .toLowerCase()
          .replace(/[.,]+$/, "")
          .replace(/^\s*the\s+/i, "")
          .replace(/\b(branch|library)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
      if (norm(suffix) === norm(venue) && base.trim().length >= 10) {
        t = base.trim();
      }
    }
  }

  return t;
}

function main() {
  void polishDescription; // no-op, just ensures the module loaded cleanly
  const raw = readFileSync(FILE, "utf8");
  const data = JSON.parse(raw);
  const events = data.events;

  let scclVenueChanged = 0;
  let titleStripped = 0;

  for (const e of events) {
    if (e.source === "Santa Clara County Library") {
      const branchVenue = SCCL_CITY_BRANCH[e.city];
      if (branchVenue && e.venue !== branchVenue) {
        e.venue = branchVenue;
        scclVenueChanged++;
      }
    }
    const before = e.title;
    const after = stripRedundantVenueSuffix(before, e.venue);
    if (after && after !== before) {
      e.title = after;
      titleStripped++;
    }
  }

  writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log(`SCCL venue updates: ${scclVenueChanged}`);
  console.log(`Title strips:       ${titleStripped}`);
}

main();
