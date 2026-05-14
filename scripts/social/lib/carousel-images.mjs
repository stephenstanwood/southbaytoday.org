// ---------------------------------------------------------------------------
// South Bay Signal — Carousel image hydration
// For Threads (and future IG/Pinterest) carousels of day-plan bucket cards.
//
// Bucket cards always carry `photoRef` (Google Places photo name) but the
// `image` field is null for most places — only events with og:image / vendor
// CDNs land a public URL there. To build a multi-slide carousel we need a
// public URL per slide. So: for each card lacking `image`, fetch the Places
// photo bytes, upload to Vercel Blob, cache the URL forever.
//
// Cache: src/data/south-bay/place-photo-blob-cache.json (committed). Keys
// are photoRef strings; values are { url, uploadedAt, size }. Photos rarely
// change so a permanent cache is the right tradeoff.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPlacesPhoto } from "./places-photo.mjs";
import { uploadToBlob } from "./recraft.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, "..", "..", "..", "src", "data", "south-bay", "place-photo-blob-cache.json");

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n");
}

/**
 * Resolve a single photoRef to a public Blob URL, using cache when present.
 * Returns null on failure (so callers can drop the slide rather than blow up
 * the entire carousel).
 */
async function resolveOneRef(photoRef, cache) {
  if (cache[photoRef]?.url) return cache[photoRef].url;
  try {
    const buffer = await fetchPlacesPhoto(photoRef);
    // Sanitize the photoRef for a Blob path. Format is `places/X/photos/Y` —
    // the slashes are fine for Blob (Vercel treats them as directories) but
    // we'll strip the trailing-slash risk and the photo prefix for clarity.
    const safe = photoRef.replace(/^places\//, "").replace(/\/photos\//, "/");
    const pathname = `place-photos/${safe}.jpg`;
    const url = await uploadToBlob(buffer, pathname);
    cache[photoRef] = { url, uploadedAt: new Date().toISOString(), size: buffer.length };
    return url;
  } catch (err) {
    console.log(`      ⚠️  Places photo failed (${photoRef.slice(0, 40)}…): ${err.message}`);
    return null;
  }
}

/**
 * Hydrate every card in a day-plan that has a photoRef but no public image.
 * Mutates the cache. Returns nothing; callers should read each card's
 * `_carouselImage` (newly populated) or fall back to `card.image`.
 *
 * Pure best-effort — cards we can't resolve are left without `_carouselImage`
 * so the carousel builder will skip them.
 */
export async function hydrateBucketCardImages(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return;

  // First pass: pick up any card that already has a public image URL. This
  // works even without the Places API key — those URLs (Unsplash, vendor
  // CDNs, etc.) are already fetchable. We populate `_carouselImage` so the
  // slide builder treats them uniformly.
  for (const card of cards) {
    if (card.image && !card._carouselImage) {
      card._carouselImage = card.image;
    }
  }

  // Second pass: hydrate cards that have a photoRef but no public URL.
  // Requires the Places API key — silently skip otherwise (carousel will
  // still render from whatever existing URLs we collected above; if that's
  // fewer than 2, the caller falls back to a single-image post).
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log("      ⏭️  Places API key missing — using only existing image URLs");
    return;
  }
  const cache = loadCache();
  let dirty = false;
  for (const card of cards) {
    if (card._carouselImage) continue;
    if (!card.photoRef) continue;
    const before = cache[card.photoRef]?.url;
    const url = await resolveOneRef(card.photoRef, cache);
    if (url) {
      card._carouselImage = url;
      if (!before) dirty = true;
    }
  }
  if (dirty) saveCache(cache);
}

/**
 * Build the ordered list of (imageUrl, altText) pairs for a day-plan
 * carousel. Slide 1 is always the hero (Recraft poster); slides 2-N are the
 * bucket cards in bucket order that successfully hydrated.
 *
 * Returns null if we end up with fewer than 2 distinct image URLs — the
 * publisher should fall back to a single-image post.
 *
 * @param {object} opts
 * @param {string} opts.heroImageUrl - The Recraft poster URL.
 * @param {string} opts.heroAlt - ALT text for slide 1.
 * @param {Array} opts.cards - Day-plan bucket cards (mutated by
 *   `hydrateBucketCardImages` to populate `_carouselImage`).
 * @param {string} [opts.cityName] - Used in slide ALT text.
 */
export function buildCarouselSlides({ heroImageUrl, heroAlt, cards, cityName }) {
  const slides = [];
  const seenUrls = new Set();

  if (heroImageUrl) {
    slides.push({ url: heroImageUrl, alt: heroAlt || "South Bay Today day-plan" });
    seenUrls.add(heroImageUrl);
  }

  for (const card of cards || []) {
    const url = card._carouselImage;
    if (!url || seenUrls.has(url)) continue;
    const bucket = (card.bucket || "").charAt(0).toUpperCase() + (card.bucket || "").slice(1);
    const name = card.name || card.title || "Activity";
    const cityPart = card.city || cityName;
    const alt = [bucket, name, cityPart ? `in ${cityPart}` : null]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 400);
    slides.push({ url, alt });
    seenUrls.add(url);
    if (slides.length >= 10) break; // Threads carousel max
  }

  return slides.length >= 2 ? slides : null;
}

const BUCKET_EMOJI = {
  breakfast: "☕",
  morning: "🌞",
  lunch: "🥪",
  afternoon: "🌳",
  dinner: "🍽️",
  evening: "🌙",
};

/**
 * Build the ordered reply list for a Bluesky day-plan thread. Each entry
 * becomes a chained reply (replyN.parent = replyN-1, replyN.root = original
 * parent post) so the thread reads top-to-bottom as a narrative.
 *
 * Only buckets with hydrated `_carouselImage` end up as replies — text-only
 * buckets get dropped (a partial visual thread reads worse than a clean
 * one). Returns null if we have <2 image-ready buckets (caller stays with
 * single-image parent post).
 *
 * @returns {Array<{text: string, imageUrl: string, alt: string}> | null}
 */
export function buildBlueskyThread({ cards, cityName }) {
  if (!Array.isArray(cards)) return null;
  const replies = [];
  for (const card of cards) {
    const url = card._carouselImage;
    if (!url) continue;
    const bucket = (card.bucket || "").toLowerCase();
    if (!bucket) continue;
    const bucketLabel = bucket.charAt(0).toUpperCase() + bucket.slice(1);
    const emoji = BUCKET_EMOJI[bucket] || "•";
    const name = card.name || card.title || "Activity";
    const city = card.city || cityName || "";
    const blurb = (card.blurb || card.why || "").trim();

    // Format: "☕ Breakfast: Tico Coffee Roasters, Campbell — short blurb."
    let text = `${emoji} ${bucketLabel}: ${name}${city ? `, ${city}` : ""}`;
    if (blurb) {
      const remaining = 300 - text.length - 3; // " — "
      if (remaining > 30) {
        const trimmed = blurb.length > remaining ? blurb.slice(0, remaining - 1).trimEnd() + "…" : blurb;
        text += ` — ${trimmed}`;
      }
    }
    text = text.slice(0, 300);

    const alt = [bucketLabel, name, city ? `in ${city}` : null]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 400);

    replies.push({ text, imageUrl: url, alt });
  }
  return replies.length >= 2 ? replies : null;
}
