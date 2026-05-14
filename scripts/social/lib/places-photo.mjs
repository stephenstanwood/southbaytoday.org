// ---------------------------------------------------------------------------
// South Bay Signal — Google Places photo fetch
// Resolves a photoRef ("places/{id}/photos/{name}") to image bytes.
// Used by carousel-images.mjs to hydrate day-plan bucket photos for Threads
// carousels (and future per-bucket use cases).
// ---------------------------------------------------------------------------

const PHOTO_BASE = "https://places.googleapis.com/v1";

/**
 * Fetch a Places photo as a Buffer.
 *
 * @param {string} photoRef - Resource name like `places/X/photos/Y`. Comes
 *   straight from `card.photoRef` baked into default-plans / social-schedule.
 * @param {object} [opts]
 * @param {number} [opts.maxWidthPx=1080] - Target width. Carousel slides on
 *   Threads/IG render at ~1080px so anything above wastes bandwidth and
 *   delays the publish.
 * @returns {Promise<Buffer>}
 */
export async function fetchPlacesPhoto(photoRef, { maxWidthPx = 1080 } = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY missing");
  if (!photoRef || !photoRef.includes("/photos/")) {
    throw new Error(`Invalid photoRef: ${photoRef}`);
  }

  const url = `${PHOTO_BASE}/${photoRef}/media?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Places photo ${res.status}: ${body.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
