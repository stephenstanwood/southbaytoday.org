#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Verify every registerUrl in src/data/south-bay/camps-data.ts is reachable.
// Prints a report; exits 0 always so CI wrappers can decide how to react.
// ---------------------------------------------------------------------------
//
// Usage:  node scripts/verify-camp-urls.mjs
//
// Notes:
// - Many .gov sites block bot User-Agents with 403 even though the page works
//   in a browser. Treat 403 as "suspicious" not "broken" — surface it but
//   don't fail the run.
// - mailto: links are skipped.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAMPS_FILE = join(__dirname, "..", "src", "data", "south-bay", "camps-data.ts");

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function extractCamps(src) {
  // Parse registerUrl + name lines out of camps-data.ts without importing TS.
  const camps = [];
  const blocks = src.split(/^\s*\{/gm);
  for (const block of blocks) {
    const nameMatch = block.match(/name:\s*"([^"]+)"/);
    const urlMatch  = block.match(/registerUrl:\s*"([^"]+)"/);
    if (nameMatch && urlMatch) {
      camps.push({ name: nameMatch[1], url: urlMatch[1] });
    }
  }
  return camps;
}

async function check(url) {
  if (url.startsWith("mailto:")) return { code: "SKIP", detail: "mailto" };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    return { code: String(res.status), detail: res.url === url ? "" : `→ ${res.url}` };
  } catch (err) {
    return { code: "ERR", detail: String(err.message ?? err).slice(0, 80) };
  }
}

function classify(code) {
  if (code === "SKIP") return "skip";
  if (code.startsWith("2")) return "ok";
  if (code === "403") return "suspicious"; // bot-blocked but often real
  if (code.startsWith("3")) return "ok";    // unresolved redirect
  return "broken";
}

const src = readFileSync(CAMPS_FILE, "utf8");
const camps = extractCamps(src);
console.log(`Checking ${camps.length} camp URLs...\n`);

const results = [];
for (const camp of camps) {
  const res = await check(camp.url);
  results.push({ ...camp, ...res, bucket: classify(res.code) });
  const icon = { ok: "✓", skip: "○", suspicious: "!", broken: "✗" }[classify(res.code)] ?? "?";
  console.log(`${icon} [${res.code.padEnd(4)}] ${camp.name}\n    ${camp.url}${res.detail ? `\n    ${res.detail}` : ""}\n`);
}

const broken     = results.filter((r) => r.bucket === "broken");
const suspicious = results.filter((r) => r.bucket === "suspicious");
const ok         = results.filter((r) => r.bucket === "ok");
const skipped    = results.filter((r) => r.bucket === "skip");

console.log("─".repeat(60));
console.log(`Summary: ${ok.length} OK · ${suspicious.length} suspicious (403) · ${broken.length} broken · ${skipped.length} skipped`);
if (broken.length) {
  console.log("\nBROKEN — fix these:");
  for (const b of broken) console.log(`  ${b.code} · ${b.name} · ${b.url}`);
}
if (suspicious.length) {
  console.log("\nSUSPICIOUS (bot-blocked, may still work in browser):");
  for (const s of suspicious) console.log(`  ${s.code} · ${s.name} · ${s.url}`);
}
