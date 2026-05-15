// ---------------------------------------------------------------------------
// South Bay Signal — Carousel image hydration
// For Threads carousels + Bluesky day-plan threads of bucket cards.
//
// Bucket cards may carry a public `image` URL (Unsplash, vendor CDN, event
// og:image) — those are safe to republish across platforms. Cards without
// one are skipped: a carousel/thread with fewer than 2 hydrated slides
// falls back to a single-image parent post.
//
// Previously this module also resolved `photoRef` (Google Places photo
// names) by fetching the photo bytes and uploading to Vercel Blob, then
// embedding that URL in Threads/Bluesky posts. Reverted 2026-05-15 — the
// Places API ToS restricts republishing to non-Maps third-party platforms,
// caching beyond 30 days, and use without photographer attribution, and
// SBT's social pipeline did all three. Carousels now only render from
// images we have a clear license to reshare.
// ---------------------------------------------------------------------------

/**
 * Promote any public `image` URL on each card to `_carouselImage` so the
 * slide/thread builders treat all sources uniformly. Cards without a
 * public image stay without `_carouselImage` and are skipped downstream.
 */
export async function hydrateBucketCardImages(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return;
  for (const card of cards) {
    if (card.image && !card._carouselImage) {
      card._carouselImage = card.image;
    }
  }
}

/**
 * Build the ordered list of (imageUrl, altText) pairs for a day-plan
 * carousel. Slide 1 is always the hero (Recraft poster); slides 2-N are the
 * bucket cards in bucket order that already had a public image URL.
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
 * Only buckets with `_carouselImage` (= a license-safe public URL) end up
 * as replies — text-only buckets get dropped. Returns null if we have <2
 * image-ready buckets (caller stays with single-image parent post).
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
