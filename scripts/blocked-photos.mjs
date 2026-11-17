/**
 * blocked-photos.mjs
 * Canonical blocklist of photo IDs that must never appear in curated output.
 * Used by photo-review.mjs (fetch/review) and build-curated-photos.mjs (curation).
 */

export const BLOCKED_IDS = new Set([
  "wm-60300988",  // HP Pavilion rooftop aerial (Bill Abbott)
  "wm-98942442",  // HP Pavilion dv6 laptop (TAKA@P.P.R.S) — not even local
  "wm-185754300", // Apple Park aerial — deleted from Commons (404), 2026-11-17
  "flickr-16733057242", // "Overlooking the Valley" — removed from Flickr (410), 2026-11-17
]);
