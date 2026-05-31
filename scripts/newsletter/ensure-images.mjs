#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Newsletter per-item image backstop (Recraft)
// ---------------------------------------------------------------------------
// Guarantees every newsletter row (events, openings, conversation) carries a
// real OR crafted image before we render the email. We deliberately do NOT use
// a generic branded fallback icon — a one-size-fits-all logo tile looks worse
// than nothing. Instead, anything still missing an image after the upstream
// generators (generate-events Tier-4, generate-scc-food-openings, reddit-pulse)
// gets a *per-item* Recraft tile here.
//
// This is the "backstop" half of the pipeline: generators craft what they can
// at ingest; this pass catches whatever fell through (no RECRAFT key that run,
// new source, budget cap, etc.) right before send/build.
//
// Crafted tiles are uploaded to Vercel Blob and cached in a COMMITTED cache
// (newsletter-image-cache.json) keyed by a stable per-item fingerprint, so the
// same item is never re-billed across sends. On a cache hit we reuse the URL
// with no network call.
//
// Cost safety:
//   - Cache hit → free, no API call.
//   - No RECRAFT_API_KEY → no-op (items stay imageless; the renderer drops the
//     image cell so the row is text-only, never a generic icon or empty gap).
//   - maxRecraft caps fresh generations per run.
//
//   import { ensureNewsletterImages } from "./ensure-images.mjs";
//   const stats = await ensureNewsletterImages(data);   // mutates data in place
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../lib/paths.mjs";
import { writeFileAtomic } from "../lib/io.mjs";
import { loadEnvLocal } from "../lib/env.mjs";

loadEnvLocal();

const CACHE_PATH = join(DATA_DIR, "newsletter-image-cache.json");

// Same blocklist the renderer's usableImage() applies — keep in sync.
const BLOCKED_IMAGE_PATTERNS = [
  /images\.unsplash\.com\/photo-1585899873671-ade0aa28a821/i,
];

function hasUsableImage(url) {
  const value = String(url || "").trim();
  if (!/^https?:\/\//i.test(value)) return false;
  return !BLOCKED_IMAGE_PATTERNS.some((re) => re.test(value));
}

function loadCache() {
  if (!existsSync(CACHE_PATH)) return { byFingerprint: {}, generatedAt: null };
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    if (!parsed.byFingerprint) parsed.byFingerprint = {};
    return parsed;
  } catch {
    return { byFingerprint: {}, generatedAt: null };
  }
}

function saveCache(cache) {
  cache.generatedAt = new Date().toISOString();
  writeFileAtomic(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

// ── Per-item descriptors: fingerprint (cache key) + Recraft prompt ──────────
// One editorial, photographic, square tile per item. No text/logos/faces so the
// thumbnail reads cleanly at 58–72px. Mirrors the look of the event/reddit tiles
// the generators already produce.

const STYLE_SUFFIX =
  "Editorial photograph, natural composition, rich subtle colors, California light. "
  + "Square 1:1 ratio. No text, no letters, no words, no logos, no faces.";

function eventDescriptor(e) {
  const fp = `event|${slug(`${e.title}|${e.venue || ""}|${e.city || e.cityName || ""}`)}`;
  const venue = e.venue || e.cityName || e.city || "the South Bay";
  const catHints = {
    food: "cozy restaurant scene, warm light, editorial food photography",
    arts: "gallery wall with abstract artwork, soft modern lighting",
    music: "live music stage, colorful stage lights",
    entertainment: "theater or concert-hall interior, warm ambient light",
    outdoor: "California hills and oak trees at golden hour",
    community: "welcoming community gathering space",
    family: "bright playful indoor community space",
    sports: "clean stadium or court, dynamic sports photography",
    education: "modern classroom or workshop setting, warm light",
    wellness: "calm minimalist wellness studio, soft natural light",
    shopping: "artisan market stalls, bright produce and crafts",
    museum: "museum gallery interior, spotlights on exhibits",
    market: "farmers market stall, fresh produce, outdoor light",
  };
  const hint = catHints[String(e.category || "").toLowerCase()]
    || "tasteful scene illustrating a local community event, muted palette";
  const prompt = `Scene illustrating "${e.title}" at ${venue}. ${hint}. ${STYLE_SUFFIX}`;
  return { fp, prompt };
}

function openingDescriptor(o) {
  const fp = `opening|${slug(`${o.name}|${o.cityId || o.cityName || ""}`)}`;
  const where = o.cityName ? `in ${titleCaseCity(o.cityName)}` : "in the South Bay";
  // The blurb is a one-line cuisine description — fold it into the prompt so the
  // tile matches the cuisine (e.g. "Japanese ramen" → ramen shop interior).
  const cuisine = o.blurb ? `${o.blurb} ` : "";
  const prompt = `Inviting storefront or interior of a newly opened food spot ${where}. `
    + `${cuisine}Appetizing, warm, editorial food/restaurant photography. ${STYLE_SUFFIX}`;
  return { fp, prompt };
}

function conversationDescriptor(p) {
  // Reddit posts carry a stable id; key on it so we share tiles with the pulse
  // generator's intent (a topic-specific illustrative tile).
  const fp = `reddit|${slug(p.id || p.permalink || p.displayTitle || p.title)}`;
  const topic = p.displayTitle || p.title || "a South Bay neighborhood conversation";
  const prompt = `Abstract, colorful illustrative tile evoking: ${topic}. `
    + `Bold flat-color illustration, vivid colors, NOT photorealistic. `
    + `Square 1:1 ratio. No text, no letters, no words, no people, no logos, no faces.`;
  return { fp, prompt };
}

function titleCaseCity(name) {
  return String(name || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Main pass ───────────────────────────────────────────────────────────────

/**
 * Ensure every event/opening/conversation item in `data` has a usable image,
 * crafting per-item Recraft tiles for any that don't. Mutates items in place.
 *
 * @param {object} data  assembled newsletter data (featuredEvents, recentOpenings, redditPosts)
 * @param {object} [opts]
 * @param {number} [opts.maxRecraft=24]  cap on fresh generations this run
 * @returns {Promise<object>} stats
 */
export async function ensureNewsletterImages(data, opts = {}) {
  const maxRecraft = opts.maxRecraft ?? 24;
  const stats = {
    total: 0, preexisting: 0, cached: 0, generated: 0,
    skipped_no_key: 0, skipped_budget: 0, failed: 0,
  };

  // Build the worklist: (item, descriptor) for everything still imageless.
  const targets = [];
  for (const e of data.featuredEvents || []) {
    stats.total++;
    if (hasUsableImage(e.image)) { stats.preexisting++; continue; }
    targets.push({ item: e, ...eventDescriptor(e) });
  }
  for (const o of data.recentOpenings || []) {
    stats.total++;
    if (hasUsableImage(o.image)) { stats.preexisting++; continue; }
    targets.push({ item: o, ...openingDescriptor(o) });
  }
  for (const p of data.redditPosts || []) {
    stats.total++;
    if (hasUsableImage(p.image)) { stats.preexisting++; continue; }
    targets.push({ item: p, ...conversationDescriptor(p) });
  }

  if (!targets.length) return stats;

  const cache = loadCache();

  // First pass: serve everything we can from the committed cache (free).
  const needGen = [];
  for (const t of targets) {
    const hit = cache.byFingerprint[t.fp];
    if (hit?.url && hasUsableImage(hit.url)) {
      t.item.image = hit.url;
      stats.cached++;
    } else {
      needGen.push(t);
    }
  }

  if (!needGen.length) {
    // Cache may have been touched only for reads; still safe to skip write.
    return stats;
  }

  // Fresh generations require Recraft + Blob.
  if (!process.env.RECRAFT_API_KEY) {
    stats.skipped_no_key += needGen.length;
    console.warn(`[ensure-images] RECRAFT_API_KEY unset — ${needGen.length} item(s) stay imageless (rows render text-only).`);
    return stats;
  }

  const { generateRecraftImage, uploadToBlob } = await import("../social/lib/recraft.mjs");
  let used = 0;
  let cacheDirty = false;

  for (const t of needGen) {
    if (used >= maxRecraft) { stats.skipped_budget++; continue; }
    try {
      const { buffer } = await generateRecraftImage({ prompt: t.prompt, size: "1:1" });
      const url = await uploadToBlob(buffer, `newsletter-tiles/${t.fp.replace(/\|/g, "-")}-${Date.now()}.png`);
      t.item.image = url;
      cache.byFingerprint[t.fp] = { url, prompt: t.prompt, generatedAt: new Date().toISOString() };
      cacheDirty = true;
      used++;
      stats.generated++;
      console.log(`  🎨 newsletter tile [${t.fp}]`);
      // Polite spacing between Recraft calls (matches the pulse generator).
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      stats.failed++;
      console.warn(`[ensure-images] recraft failed for ${t.fp}: ${err.message}`);
    }
  }

  if (cacheDirty) saveCache(cache);
  return stats;
}

// CLI: craft tiles for today's (or --date) newsletter and report.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { assembleNewsletterData, todayPT } = await import("./lib.mjs");
  const dateArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const date = dateArg || todayPT();
  const data = await assembleNewsletterData(date, { editorial: false });
  const stats = await ensureNewsletterImages(data);
  console.log(`\nnewsletter image backstop (${date}):`);
  console.table(stats);
}
