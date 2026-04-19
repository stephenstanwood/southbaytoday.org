#!/usr/bin/env node
// ---------------------------------------------------------------------------
// validate-places.mjs
//
// CI/regen-time gate for src/data/south-bay/places.json. Runs the same checks
// as audit-places.mjs but exits NON-ZERO if any hard finding is detected.
//
// Usage:
//   node scripts/validate-places.mjs                 # validate committed file
//   node scripts/validate-places.mjs --path=<file>   # validate alternate file
//
// Exit codes:
//   0 — clean (no hard findings)
//   1 — one or more hard findings (must fix before commit/regen)
//   2 — file missing or JSON parse error
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SLUG_TO_CITY_TOKENS,
  NON_CA_STATES,
  NON_US_COUNTRIES,
} from "./social/lib/content-rules.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_PATH = resolve(ROOT, "src/data/south-bay/places.json");

function hardFindings(place) {
  const out = [];
  const tokens = SLUG_TO_CITY_TOKENS[place.city];
  if (!tokens) {
    out.push(`unknown-slug:${place.city}`);
    return out;
  }
  const addr = place.address || "";
  const addrLower = addr.toLowerCase();

  // Non-CA US state code.
  for (const m of addr.matchAll(/,\s*([A-Z]{2})\s+\d{5}/g)) {
    if (NON_CA_STATES.has(m[1])) out.push(`non-ca-state:${m[1]}`);
  }

  // Non-US country.
  for (const country of NON_US_COUNTRIES) {
    const re = new RegExp(`,\\s*${country.replace(/\s+/g, "\\s+")}\\s*$`, "i");
    if (re.test(addr)) out.push(`non-us-country:${country}`);
  }

  // Slug vs. address-city mismatch — only HARD when address references a
  // different in-area slug's token (catches "campbell slug but address says
  // Santa Clara"). Missing token alone is not hard (curated landmarks).
  if (addr) {
    const addressContainsSlugToken = tokens.some(t => addrLower.includes(t));
    if (!addressContainsSlugToken) {
      for (const [slug, toks] of Object.entries(SLUG_TO_CITY_TOKENS)) {
        if (slug === place.city) continue;
        if (toks.some(t => addrLower.includes(t))) {
          out.push(`slug-mismatch:expected-${place.city}-found-${slug}`);
          break;
        }
      }
    }
  }

  // Empty address.
  if (!addr.trim()) out.push("empty-address");

  return out;
}

function main() {
  const args = process.argv.slice(2);
  const pathArg = args.find(a => a.startsWith("--path="));
  const path = pathArg ? pathArg.slice("--path=".length) : DEFAULT_PATH;

  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`[validate-places] failed to read/parse ${path}: ${err.message}`);
    process.exit(2);
  }

  const violations = [];
  for (const place of data.places || []) {
    const flags = hardFindings(place);
    if (flags.length) {
      violations.push({ id: place.id, name: place.name, city: place.city, address: place.address, flags });
    }
  }

  if (violations.length === 0) {
    console.log(`[validate-places] ok — ${data.places?.length ?? 0} places passed`);
    process.exit(0);
  }

  console.error(`[validate-places] FAIL — ${violations.length} hard finding(s):`);
  for (const v of violations) {
    console.error(`  [${v.flags.join(",")}] ${v.city} | ${v.name} | ${v.address}`);
  }
  console.error(`\nRun \`node scripts/audit-places.mjs\` for full report.`);
  process.exit(1);
}

main();
