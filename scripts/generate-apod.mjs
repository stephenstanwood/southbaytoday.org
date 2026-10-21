#!/usr/bin/env node
// NASA's legacy API follows retired daily URLs to a generic page after the
// NASA Science migration. Read the dated articles linked by NASA itself.
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { writeFileAtomic } from "./lib/io.mjs";
import { APOD_ARCHIVE, parseApodArchive, parseApodArticle, validateApodItems } from "./lib/apod.mjs";

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "src/data/south-bay/apod.json");
const BLOCKED_DATES = new Set(["2026-03-28"]); // Stephen's existing photo exclusion

export async function generateApod({ outPath = OUT_PATH, fetchImpl = fetch,
  now = new Date(), pause = delay, report = console.log } = {}) {
  // NASA publishes APOD on the US Eastern calendar. Never inherit the host TZ.
  const endDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const startDate = new Date(Date.parse(`${endDate}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
  async function getPage(url) {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "SouthBayToday/1.0 (southbaytoday.org; public data)" },
      signal: AbortSignal.timeout(30_000),
      redirect: "error", // A retired permalink must never become today's page.
    });
    if (!res.ok) throw Error(`NASA APOD HTTP ${res.status}: ${url}`);
    if (res.url && res.url !== url) throw Error(`NASA APOD redirected: ${url}`);
    if (!res.headers.get("content-type")?.includes("text/html")) throw Error(`NASA APOD expected HTML: ${url}`);
    return res.text();
  }

  report(`Fetching NASA APOD archive (${startDate} → ${endDate})…`);
  const entries = parseApodArchive(await getPage(APOD_ARCHIVE), { startDate, endDate });
  if (!entries.length || Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${entries[0].date}T00:00:00Z`) > 2 * 86_400_000) {
    throw Error("NASA APOD archive has no current dated entries; preserving existing output");
  }
  const items = [];
  for (const entry of entries) {
    if (BLOCKED_DATES.has(entry.date)) continue;
    await pause(1_000); // One sequential request per second; no retry storm.
    const item = parseApodArticle(await getPage(entry.sourceUrl), entry);
    if (!item) { report(`  Skipping video: ${entry.date}`); continue; }
    items.push(item);
    if (items.length === 12) break;
  }
  validateApodItems(items, { startDate, endDate });
  const output = { items, generatedAt: now.toISOString(),
    source: "NASA Astronomy Picture of the Day", sourceUrl: "https://science.nasa.gov/apod/" };
  // Every source/page/semantic check finishes before the only mutation.
  writeFileAtomic(outPath, JSON.stringify(output, null, 2) + "\n");
  report(`✅ ${items.length} verified APOD images written`);
  items.forEach(item => report(`  • ${item.date}: ${item.title}`));
  return output;
}

async function main(args) {
  if (args[0] === "--check" && args.length <= 2) {
    const data = JSON.parse(readFileSync(args[1] || OUT_PATH, "utf8"));
    validateApodItems(data.items);
    console.log(`Verified ${data.items.length} APOD images`);
  } else if (!args.length || (args[0] === "--output" && args.length === 2)) {
    await generateApod(args.length ? { outPath: resolve(args[1]) } : {});
  } else throw Error("Use generate-apod.mjs [--output PATH | --check [PATH]]");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
