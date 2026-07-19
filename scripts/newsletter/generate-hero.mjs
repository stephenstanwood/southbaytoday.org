#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Newsletter day-plan hero poster (Recraft)
// ---------------------------------------------------------------------------
// Regenerates the designed AI poster the daily email uses as its day-plan hero.
// The old social pipeline produced these (in social-schedule.json); that's shut
// down, so the newsletter owns its own daily generation now. Reuses the poster
// style + prompt machinery from scripts/social/lib (the look we dialed in).
//
// Writes { date, imageUrl, imageStyle, imagePrompt, generatedAt } to
// newsletter-hero.json (gitignored runtime state, lives on the Mini). lib.mjs
// reads it for the hero; on any failure the newsletter falls back to the first
// day-plan card's photo, so a miss never blocks the send.
//
// Idempotent: skips if the date's hero already exists (use --force to override).
//
//   node scripts/newsletter/generate-hero.mjs [YYYY-MM-DD] [--force]
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "../lib/env.mjs";
import { DATA_DIR } from "../lib/paths.mjs";
import { writeFileAtomic } from "../lib/io.mjs";
import { todayPT } from "../lib/dates.mjs";
import sharp from "sharp";

loadEnvLocal();

const HERO_PATH = join(DATA_DIR, "newsletter-hero.json");

/**
 * Generate (and Blob-host) the day-plan hero poster for `date`.
 * @returns {Promise<{date,imageUrl,imageStyle,imagePrompt,generatedAt}|null>}
 */
export async function generateNewsletterHero(date, { force = false } = {}) {
  if (!force && existsSync(HERO_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(HERO_PATH, "utf8"));
      if (existing.date === date && existing.imageUrl) {
        console.log(`newsletter hero: ${date} already generated — skipping (use --force to regen)`);
        return existing;
      }
    } catch { /* unreadable → regenerate */ }
  }

  let plans;
  try {
    plans = JSON.parse(readFileSync(join(DATA_DIR, "default-plans.json"), "utf8"));
  } catch (err) {
    console.warn(`newsletter hero: default-plans unavailable (${err.message}) — skipping`);
    return null;
  }
  const plan = plans.plans?.adults;
  if (!plan?.cards?.length) {
    console.warn("newsletter hero: no adults day-plan cards — skipping");
    return null;
  }

  // Heavy machinery imported lazily so importing this module stays cheap.
  const { pickStyle, dayPlanPrompt, APPROVED_STYLES } = await import("../social/lib/poster-styles.mjs");
  const { generateRecraftImage } = await import("../social/lib/recraft.mjs");

  let style;
  try {
    // The morning email is generated unattended, so it stays inside the
    // human-reviewed pool. Experimental directions belong in a review loop;
    // one named-publisher experiment previously induced a lookalike logo.
    style = await pickStyle({ novelRate: 0 });
  } catch (err) {
    console.warn(`newsletter hero: pickStyle failed (${err.message}) — using default style`);
    style = APPROVED_STYLES[0];
  }

  const prompt = dayPlanPrompt(plan, date, style.style);
  console.log(`🎨 newsletter hero: generating day-plan poster (style: ${style.id})...`);
  const { buffer } = await generateRecraftImage({ prompt, colors: style.colors || undefined });

  // Recraft returns WebP; email clients (notably Outlook) render WebP poorly or
  // not at all, so re-encode to JPEG for reliable cross-client display.
  const jpeg = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
  const { put } = await import("@vercel/blob");
  const pathname = `posters/newsletter-${date}-${Date.now()}.jpg`;
  const { url } = await put(pathname, jpeg, {
    access: "public",
    contentType: "image/jpeg",
    allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const hero = {
    date,
    imageUrl: url,
    imageStyle: style.id,
    imagePrompt: prompt,
    generatedAt: new Date().toISOString(),
  };
  writeFileAtomic(HERO_PATH, JSON.stringify(hero, null, 2) + "\n");
  console.log(`✅ newsletter hero → ${url}`);
  return hero;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const date = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || todayPT();
  const force = process.argv.includes("--force");
  generateNewsletterHero(date, { force }).catch((err) => {
    console.error(`newsletter hero gen failed: ${err.message}`);
    process.exit(1);
  });
}
