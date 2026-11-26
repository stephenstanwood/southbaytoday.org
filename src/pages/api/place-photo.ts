export const prerender = false;

// ---------------------------------------------------------------------------
// Google Places Photo Proxy
// ---------------------------------------------------------------------------
// GET /api/place-photo?ref=places/xxx/photos/yyy&w=400&h=300
// Proxies Google Places photos with API key server-side.
// Returns the image directly with caching headers.
//
// Vercel keys its CDN cache by deployment, and this site deploys many times a
// day, so a photo cached here is downloaded from Google again after every
// deploy. Requests therefore go to the photo cache first: its own Vercel
// project (photo-cache/) that redeploys only when the loader changes. The
// local loader below is the fallback. See docs/place-photos.md.
// ---------------------------------------------------------------------------

import type { APIRoute } from "astro";
import { rateLimit, rateLimitResponse } from "../../lib/rateLimit";
import { canonicalPhotoSearch, createPhotoLoader, parsePhotoRequest, photoResponse } from "../../lib/placePhoto.mjs";
import { forwardToPhotoCache } from "../../lib/photoCache.mjs";

const loadPhoto = createPhotoLoader();

export const GET: APIRoute = async ({ request, clientAddress }) => {
  if (!rateLimit(clientAddress, 60)) return rateLimitResponse();

  const url = new URL(request.url);
  const photo = parsePhotoRequest(url);
  if (!photo) {
    return new Response("Missing or invalid ref param", { status: 400 });
  }
  // Strip tracking/cache-busting parameters and equivalent out-of-range sizes
  // before reaching Google. Every caller of a photo/size shares one CDN key.
  const search = canonicalPhotoSearch(photo);
  if (url.search.slice(1) !== search) {
    return new Response(null, {
      status: 308,
      headers: { Location: `${url.pathname}?${search}`, "Cache-Control": "public, max-age=86400" },
    });
  }

  const relayed = await forwardToPhotoCache(search, {
    origin: import.meta.env.PHOTO_CACHE_ORIGIN,
    secret: import.meta.env.PHOTO_CACHE_SECRET,
  });
  if (relayed) return relayed;

  return photoResponse(loadPhoto, photo, import.meta.env.GOOGLE_PLACES_API_KEY);
};
