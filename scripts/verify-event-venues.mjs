#!/usr/bin/env node
// Live-source verification for event venue resolution.
//
// Checks BiblioCommons calendars for events filed under a building they are
// not held in. Both historic ingest paths retain offline regressions:
//
//   LibCal          scripts/lib/libcal-location.mjs
//   BiblioCommons   scripts/lib/biblio-location.mjs
//
// Records this exists to keep fixed:
//   mountainview.libcal.com/event/16953202   Location: Online       (2026-08-06)
//   mountainview.libcal.com/event/16650443   Location: Pioneer Park (2026-08-06)
//   mountainview.libcal.com/event/17295774   Location: Offsite      (2026-09-03)
//   paloalto.bibliocommons.com/events/68faec5706078d3600744ca3      (2026-09-03)
//
// The earlier version of this harness asserted only that nothing may claim the
// library's STREET ADDRESS unless the library is the venue. Both 2026-09-03
// records carried an EMPTY address, so they slipped straight through it. The
// invariants below are on the venue NAME, which is what a reader acts on.
//
// Read-only: fetches the BiblioCommons listings the nightly refresh loads.
// LibCal coverage is now checked offline only. Run with `npm run verify:venues`.

import { resolveBiblioLocation } from "./lib/biblio-location.mjs";

const UA = "SouthBaySignal/1.0 (southbaytoday.org; public event calendar aggregator)";

let failures = 0;
let checked = 0;
const fail = (msg) => { console.error(`      ✗ ${msg}`); failures++; };

// LibCal live verification retired on 2026-10-24 after both configured
// tenants excluded GPTBot from /. Captured-row location and attendance
// regressions remain in libcal-location.test.mjs and library-event-details.test.mjs.

// ── BiblioCommons ──────────────────────────────────────────────────────────

const BIBLIO = [
  { id: "paloalto", name: "Palo Alto City Library" },
  { id: "sjpl", name: "San Jose Public Library" },
];
const LOCATION_CHANGE = /^\s*[*\s]*(location\s+change|new\s+location|moved|relocated|venue\s+change)\b\s*[:\-—–]/i;

for (const library of BIBLIO) {
  console.log(`\n═══ ${library.name} — BiblioCommons`);
  let nonBranch = 0;
  let fallback = 0;
  let seen = 0;

  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `https://gateway.bibliocommons.com/v2/libraries/${library.id}/events?limit=50&page=${page}`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) throw new Error(`${library.id} gateway: HTTP ${res.status}`);
    const data = await res.json();
    const entities = data.entities || {};
    const events = entities.events ? Object.values(entities.events) : [];
    if (events.length === 0) break;

    for (const ev of events) {
      const definition = ev.definition || {};
      const got = resolveBiblioLocation({ event: ev, entities, libraryName: library.name });
      seen++;
      checked++;

      // An event the feed files at a non-branch place must never resolve to
      // the library system's own name. This is the 2026-09-03 defect.
      if (definition.nonBranchLocationId && (entities.places || {})[definition.nonBranchLocationId]) {
        nonBranch++;
        if (got.venue === library.name) {
          fail(`${library.id}/${ev.id} "${definition.title}" — non-branch place resolved to "${library.name}"`);
        }
        if (!got.address) {
          fail(`${library.id}/${ev.id} "${definition.title}" — non-branch place lost its address`);
        }
      }

      // A listing that announces a move must not name its own institution.
      if (LOCATION_CHANGE.test(definition.title || "") && got.venue === library.name) {
        fail(`${library.id}/${ev.id} "${definition.title}" — announces a move but resolved to "${library.name}"`);
      }

      if (got.kind === "library-fallback") fallback++;
    }
  }
  console.log(`  ${seen} events — ${nonBranch} at non-branch places, ${fallback} with no location in the feed`);
}

console.log(
  failures === 0
    ? `\n✅ ${checked} events checked — no venue violations`
    : `\n❌ ${failures} violation(s) across ${checked} events checked`,
);
process.exit(failures === 0 ? 0 : 1);
