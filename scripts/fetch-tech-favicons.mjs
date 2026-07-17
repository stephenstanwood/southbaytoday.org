#!/usr/bin/env node
// Self-hosts a small favicon for companies that DON'T have a curated logo in
// tech-logo-manifest.ts (mostly the RECENTLY_FUNDED ticker, which gets new
// startups added faster than the full fetch-tech-logos.mjs pass keeps up).
// Without this, <CompanyLogo> falls all the way through to a live icon.horse
// request on every pageload for each of those companies.
//
// Writes public/logos/favicons/<domain>.png (128x128, from icon.horse with a
// Google s2 fallback) and a manifest at src/lib/south-bay/tech-favicon-manifest.ts
// that CompanyLogo checks before hitting icon.horse live.
//
// Usage: node scripts/fetch-tech-favicons.mjs            (only fetches missing)
//        node scripts/fetch-tech-favicons.mjs --refresh  (re-fetches all)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FAVICON_DIR = path.join(ROOT, "public", "logos", "favicons");
const MANIFEST_PATH = path.join(ROOT, "src", "lib", "south-bay", "tech-favicon-manifest.ts");
const DATA_PATH = path.join(ROOT, "src", "data", "south-bay", "tech-companies.ts");
const LOGO_MANIFEST_PATH = path.join(ROOT, "src", "lib", "south-bay", "tech-logo-manifest.ts");

const REFRESH = process.argv.includes("--refresh");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SUBDOMAIN_STRIP = /^(jobs|careers|invest|investor|developer|developers|store|en-us|www2)\./i;

function urlToDomain(u) {
  if (!u) return "";
  try {
    const host = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "en.wikipedia.org") return "";
    return host.replace(SUBDOMAIN_STRIP, "");
  } catch {
    return "";
  }
}

// Same light TS-source parser fetch-tech-logos.mjs uses.
function extractArrayBlock(src, name) {
  const re = new RegExp(`export\\s+const\\s+${name}[^=]*=\\s*\\[`);
  const m = re.exec(src);
  if (!m) return "";
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    i++;
  }
  return src.slice(start, i - 1);
}

function splitObjectLiterals(body) {
  const items = [];
  let depth = 0;
  let buf = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{") {
      if (depth === 0) buf = "";
      depth++;
      buf += ch;
    } else if (ch === "}") {
      depth--;
      buf += ch;
      if (depth === 0) items.push(buf);
    } else if (depth > 0) {
      buf += ch;
    }
  }
  return items;
}

function matchField(item, field) {
  const re = new RegExp(`\\b${field}\\s*:\\s*"([^"]*)"`);
  const m = re.exec(item);
  return m ? m[1] : null;
}

async function loadDomains() {
  const src = await readFile(DATA_PATH, "utf8");
  const groups = ["TECH_COMPANIES", "SCC_SPOTLIGHT", "RECENTLY_FUNDED", "TECH_MILESTONES", "TECH_CONFERENCES"];
  const domains = new Set();
  for (const g of groups) {
    const body = extractArrayBlock(src, g);
    if (!body) continue;
    for (const item of splitObjectLiterals(body)) {
      const url = matchField(item, "careersUrl") || matchField(item, "url") || matchField(item, "website");
      const domain = urlToDomain(url);
      if (domain) domains.add(domain);
    }
  }
  return [...domains].sort();
}

async function loadCuratedDomains() {
  // Companies with a curated logo (auto-manifest or hand-curated) never hit
  // the live cascade, so skip pre-fetching their favicons.
  if (!existsSync(LOGO_MANIFEST_PATH)) return new Set();
  const raw = await readFile(LOGO_MANIFEST_PATH, "utf8");
  const src = await readFile(DATA_PATH, "utf8");
  const curatedIds = new Set([...raw.matchAll(/^\s+"([^"]+)":/gm)].map((m) => m[1]));
  const groups = ["TECH_COMPANIES", "SCC_SPOTLIGHT", "RECENTLY_FUNDED", "TECH_MILESTONES", "TECH_CONFERENCES"];
  const domains = new Set();
  for (const g of groups) {
    const body = extractArrayBlock(src, g);
    if (!body) continue;
    for (const item of splitObjectLiterals(body)) {
      const id = matchField(item, "id");
      if (!id || !curatedIds.has(id)) continue;
      const url = matchField(item, "careersUrl") || matchField(item, "url") || matchField(item, "website");
      const domain = urlToDomain(url);
      if (domain) domains.add(domain);
    }
  }
  return domains;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchBuffer(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

async function resolveFavicon(domain) {
  // icon.horse first (usually a real apple-touch-icon), Google s2 as backup.
  for (const url of [`https://icon.horse/icon/${domain}`, `https://www.google.com/s2/favicons?domain=${domain}&sz=128`]) {
    try {
      const buf = await fetchBuffer(url);
      if (buf.length < 200) continue; // too small to be a real icon
      const png = await sharp(buf)
        .resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      return png;
    } catch {
      // try next source
    }
  }
  return null;
}

async function main() {
  await mkdir(FAVICON_DIR, { recursive: true });
  const allDomains = await loadDomains();
  const curated = await loadCuratedDomains();
  const needed = allDomains.filter((d) => !curated.has(d));

  const manifest = {};
  if (existsSync(MANIFEST_PATH)) {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const m = /^\s+"([^"]+)":\s*"([^"]+)"/gm;
    let mm;
    while ((mm = m.exec(raw))) manifest[mm[1]] = mm[2];
  }

  console.log(`${needed.length} domains need a self-hosted favicon (${allDomains.length - needed.length} already covered by a curated logo).`);

  let fetched = 0;
  let failed = [];
  for (const domain of needed) {
    if (!REFRESH && manifest[domain]) continue;
    process.stdout.write(`  ${domain.padEnd(32)} `);
    let png;
    try {
      png = await resolveFavicon(domain);
    } catch {}
    if (!png) {
      console.log("skip (no favicon found)");
      failed.push(domain);
      await sleep(200);
      continue;
    }
    const fname = `${domain}.png`;
    await writeFile(path.join(FAVICON_DIR, fname), png);
    manifest[domain] = `/logos/favicons/${fname}`;
    fetched++;
    console.log(`ok -> /logos/favicons/${fname}`);
    await sleep(200); // sequential, polite
  }

  const sortedDomains = Object.keys(manifest).sort();
  const ts = `// AUTO-GENERATED by scripts/fetch-tech-favicons.mjs — do not edit by hand
export const TECH_FAVICON_MANIFEST: Record<string, string> = {
${sortedDomains.map((d) => `  "${d}": "${manifest[d]}",`).join("\n")}
};
`;
  await writeFile(MANIFEST_PATH, ts, "utf8");

  console.log(`\nFetched ${fetched} new favicons (${sortedDomains.length} total in manifest).`);
  if (failed.length) console.log(`No favicon found for: ${failed.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
