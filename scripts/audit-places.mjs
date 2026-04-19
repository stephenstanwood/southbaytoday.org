#!/usr/bin/env node
// ---------------------------------------------------------------------------
// audit-places.mjs
//
// Scans src/data/south-bay/places.json for contamination and slug mismatches.
// Produces src/data/south-bay/places-suspected-contamination.json as a tiered
// report (hard / soft / info). Does NOT delete anything — surgeon step is
// separate.
//
// Run: `npm run audit-places` (or `node scripts/audit-places.mjs`)
// Exit code is 0 regardless; use scripts/validate-places.mjs for CI gating.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SLUG_TO_CITY_TOKENS,
  NON_CA_STATES,
  NON_US_COUNTRIES,
} from "./social/lib/content-rules.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PLACES_PATH = resolve(ROOT, "src/data/south-bay/places.json");
const REPORT_PATH = resolve(ROOT, "src/data/south-bay/places-suspected-contamination.json");

// Known CA ZIP range for the South Bay + peninsula. Anything outside this
// is suspicious for an "in-area" place.
// CA overall: 90000–96199. Santa Clara County: 94xxx, 95xxx predominantly.
const CA_ZIP_RE = /,\s*CA\s+(\d{5})(?:-\d{4})?(?:,\s*USA)?\s*$/;

function classify(place) {
  const findings = [];
  const tokens = SLUG_TO_CITY_TOKENS[place.city];
  if (!tokens) {
    findings.push({
      severity: "hard",
      reason: "unknown-slug",
      detail: `slug "${place.city}" is not in the 11-city coverage map`,
    });
  }

  const addr = place.address || "";
  const addrLower = addr.toLowerCase();

  // Hard: non-CA US state code anywhere in the address.
  const stateMatches = [...addr.matchAll(/,\s*([A-Z]{2})\s+\d{5}/g)];
  for (const m of stateMatches) {
    if (NON_CA_STATES.has(m[1])) {
      findings.push({
        severity: "hard",
        reason: "non-ca-state",
        detail: `address contains state code ${m[1]}`,
      });
    }
  }

  // Hard: non-US country at end of address.
  for (const country of NON_US_COUNTRIES) {
    const re = new RegExp(`,\\s*${country.replace(/\s+/g, "\\s+")}\\s*$`, "i");
    if (re.test(addr)) {
      findings.push({
        severity: "hard",
        reason: "non-us-country",
        detail: `address ends in "${country}"`,
      });
    }
  }

  // Soft: address doesn't reference the slug's canonical city token at all.
  // Skip for curated landmark-style entries where the address is a shorthand.
  if (tokens && addr) {
    const addressContainsSlugToken = tokens.some(t => addrLower.includes(t));
    if (!addressContainsSlugToken) {
      // Does the address reference a DIFFERENT in-area city? That's a stronger
      // signal that the slug is actually wrong.
      let otherSlug = null;
      for (const [slug, toks] of Object.entries(SLUG_TO_CITY_TOKENS)) {
        if (slug === place.city) continue;
        if (toks.some(t => addrLower.includes(t))) {
          otherSlug = slug;
          break;
        }
      }
      if (otherSlug) {
        findings.push({
          severity: "hard",
          reason: "slug-mismatch",
          detail: `slug "${place.city}" but address references "${otherSlug}"`,
        });
      } else {
        // Landmark with shorthand ("Stanford Foothills", "Cupertino, CA, USA")
        // or an odd neighborhood entry. Flag soft for eyeballing.
        findings.push({
          severity: "info",
          reason: "address-no-city-token",
          detail: `address does not reference "${tokens[0]}"`,
        });
      }
    }
  }

  // Soft: no CA ZIP at all (might still be a legit shorthand landmark)
  if (addr && !CA_ZIP_RE.test(addr.trim())) {
    findings.push({
      severity: "info",
      reason: "no-ca-zip",
      detail: "address lacks CA ZIP — verify it's not out-of-state",
    });
  }

  // Hard: empty address.
  if (!addr.trim()) {
    findings.push({
      severity: "hard",
      reason: "empty-address",
      detail: "address is blank",
    });
  }

  return findings;
}

function main() {
  const data = JSON.parse(readFileSync(PLACES_PATH, "utf8"));
  const totals = { hard: 0, soft: 0, info: 0 };
  const byReason = {};
  const hardEntries = [];
  const softEntries = [];
  const infoEntries = [];

  for (const place of data.places) {
    const findings = classify(place);
    if (!findings.length) continue;
    const worst = findings.reduce((a, b) => {
      const rank = { hard: 3, soft: 2, info: 1 };
      return rank[a.severity] >= rank[b.severity] ? a : b;
    });
    totals[worst.severity]++;
    for (const f of findings) {
      byReason[f.reason] = (byReason[f.reason] || 0) + 1;
    }
    const record = {
      id: place.id,
      name: place.name,
      city: place.city,
      address: place.address,
      findings,
    };
    if (worst.severity === "hard") hardEntries.push(record);
    else if (worst.severity === "soft") softEntries.push(record);
    else infoEntries.push(record);
  }

  const report = {
    _meta: {
      auditedAt: new Date().toISOString(),
      placesTotal: data.places.length,
      totals,
      byReason,
    },
    hard: hardEntries,
    soft: softEntries,
    info: infoEntries,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  console.log(`Audited ${data.places.length} places.`);
  console.log(`  hard: ${totals.hard}  soft: ${totals.soft}  info: ${totals.info}`);
  console.log(`  by reason:`);
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${reason.padEnd(26)} ${count}`);
  }
  console.log(`\nReport written to ${REPORT_PATH}`);
  if (totals.hard > 0) {
    console.log(`\nHard findings (purge candidates):`);
    for (const e of hardEntries) {
      const reasons = e.findings.filter(f => f.severity === "hard").map(f => f.reason).join(",");
      console.log(`  [${reasons}] ${e.city} | ${e.name} | ${e.address}`);
    }
  }
}

main();
