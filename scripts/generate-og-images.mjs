#!/usr/bin/env node
// Generates distinct social-share (og:image) cards for the section pages
// (camps/gov/tech/food) and every covered city, replacing the single shared
// og-image.png default. Each card is a self-contained HTML template (inline
// CSS, brand colors/fonts) screenshotted at 1200x630 via Playwright and saved
// as a JPEG in public/og/.
//
// Google-hosted fonts are used here only at generation time (a one-off local
// render) — shipped site pages continue to self-host fonts.
//
// Every stat printed on a card is read live from the same data files the
// pages themselves render from — nothing here is invented.
//
// Usage: npx tsx scripts/generate-og-images.mjs
//   (tsx is required — it lets this script import the .ts data modules
//   directly, same as the CAMPS/TECH_COMPANIES imports below.)

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { CAMPS } from "../src/data/south-bay/camps-data.ts";
import { TECH_COMPANIES } from "../src/data/south-bay/tech-companies.ts";
import { CITIES } from "../src/lib/south-bay/cities.ts";
import digests from "../src/data/south-bay/digests.json" with { type: "json" };
import foodOpenings from "../src/data/south-bay/scc-food-openings.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_DIR = join(REPO_ROOT, "public", "og");
const WIDTH = 1200;
const HEIGHT = 630;
const JPEG_QUALITY = 80;
const SIZE_BUDGET_BYTES = 80 * 1024;

mkdirSync(OUT_DIR, { recursive: true });

// ── Brand tokens (mirrors SignalShell.astro / CalendarShell.astro) ─────────
const INK = "#13072F";
const MUTED = "#5f5870";
const BG_GRADIENT = "linear-gradient(180deg, #fff8f2 0%, #fff7ff 44%, #f3fbff 100%)";
const SUNRISE_GLOW = "radial-gradient(circle at 8% -12%, rgba(255, 123, 43, 0.28), transparent 40%)";
const ACCENT_RULE = "linear-gradient(90deg, #FF7B2B, #F43F7C, #8738F5, #22C6D3)";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Inter:wght@500;600;700&family=Space+Mono:wght@700&display=swap";

function cardHtml({ kicker, title, subline }) {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS_HREF}" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    font-family: 'Inter', system-ui, sans-serif;
  }
  body {
    position: relative;
    background: ${SUNRISE_GLOW}, ${BG_GRADIENT};
  }
  .dots {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(19,7,47,0.08) 1.6px, transparent 1.6px);
    background-size: 26px 26px;
    background-position: -6px -6px;
    mask-image: radial-gradient(circle at 88% 20%, black 0%, transparent 55%);
    -webkit-mask-image: radial-gradient(circle at 88% 20%, black 0%, transparent 55%);
  }
  .frame {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 88px;
  }
  .kicker {
    font-family: 'Space Mono', monospace;
    font-weight: 700;
    font-size: 20px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #8738F5;
    margin-bottom: 22px;
  }
  .title {
    font-family: 'Playfair Display', Georgia, serif;
    font-weight: 900;
    font-size: 92px;
    line-height: 1.02;
    letter-spacing: -0.01em;
    color: ${INK};
    max-width: 920px;
  }
  .rule {
    width: 132px;
    height: 6px;
    border-radius: 3px;
    background: ${ACCENT_RULE};
    margin: 30px 0 24px;
  }
  .subline {
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    font-size: 30px;
    color: ${MUTED};
    max-width: 820px;
  }
  .wordmark {
    position: absolute;
    right: 88px;
    bottom: 56px;
    font-family: 'Space Mono', monospace;
    font-weight: 700;
    font-size: 18px;
    letter-spacing: 0.08em;
    color: ${INK};
    opacity: 0.55;
  }
</style></head>
<body>
  <div class="dots"></div>
  <div class="frame">
    <div class="kicker">${kicker}</div>
    <div class="title">${title}</div>
    <div class="rule"></div>
    <div class="subline">${subline}</div>
  </div>
  <div class="wordmark">southbaytoday.org</div>
</body></html>`;
}

// ── Honest, data-derived cards ──────────────────────────────────────────────
const govCityCount = Object.keys(digests).length;
const foodUpdateCount = (foodOpenings.opened?.length ?? 0)
  + (foodOpenings.inspections?.length ?? 0)
  + (foodOpenings.comingSoon?.length ?? 0);

const sectionCards = [
  {
    file: "og-camps.jpg",
    kicker: "South Bay Today",
    title: "Summer Camps",
    subline: `${CAMPS.length} camps tracked across the South Bay`,
  },
  {
    file: "og-gov.jpg",
    kicker: "South Bay Today",
    title: "Local Government",
    subline: `${govCityCount} city councils tracked, digested in plain English`,
  },
  {
    file: "og-tech.jpg",
    kicker: "South Bay Today",
    title: "Technology",
    subline: `${TECH_COMPANIES.length} South Bay companies tracked`,
  },
  {
    file: "og-food.jpg",
    kicker: "South Bay Today",
    title: "Food",
    subline: `${foodUpdateCount} food openings and permit updates tracked`,
  },
];

// city/[slug].astro's own meta description reads "events, city council
// meetings, development updates, and local news" — reuse that phrasing here
// rather than invent new copy. santa-cruz is excluded: cities.ts marks it a
// case-by-case pick, not full coverage (also excluded from plan-day's
// VALID_CITIES), so it doesn't get a dedicated section card.
const cityCards = CITIES.filter((c) => c.id !== "santa-cruz").map((c) => ({
  file: `og-city-${c.id}.jpg`,
  kicker: "South Bay Today",
  title: c.name,
  subline: "Events, city council meetings & local news",
}));

const cards = [...sectionCards, ...cityCards];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

const results = [];
for (const card of cards) {
  await page.setContent(cardHtml(card), { waitUntil: "networkidle" });
  const outPath = join(OUT_DIR, card.file);
  const buffer = await page.screenshot({ type: "jpeg", quality: JPEG_QUALITY });
  writeFileSync(outPath, buffer);
  const { size } = statSync(outPath);
  results.push({ file: card.file, bytes: size });
}

await browser.close();

console.table(results.map((r) => ({ file: r.file, KB: (r.bytes / 1024).toFixed(1) })));
const overBudget = results.filter((r) => r.bytes > SIZE_BUDGET_BYTES);
if (overBudget.length > 0) {
  console.warn(
    `⚠ ${overBudget.length} card(s) exceeded the ${SIZE_BUDGET_BYTES / 1024}KB budget:`,
    overBudget.map((r) => r.file).join(", "),
  );
}
console.log(`Wrote ${results.length} OG cards to ${OUT_DIR}`);
