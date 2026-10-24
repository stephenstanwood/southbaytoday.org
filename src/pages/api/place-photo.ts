export const prerender = false;

// ---------------------------------------------------------------------------
// Google Places Photo Proxy
// ---------------------------------------------------------------------------
// GET /api/place-photo?ref=places/xxx/photos/yyy&w=400&h=300
// Proxies Google Places photos with API key server-side.
// Returns the image directly with caching headers.
// ---------------------------------------------------------------------------

import type { APIRoute } from "astro";
import { rateLimit, rateLimitResponse } from "../../lib/rateLimit";
import { canonicalPhotoSearch, createPhotoLoader, parsePhotoRequest } from "../../lib/placePhoto.mjs";

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

  try {
    const image = await loadPhoto(photo, import.meta.env.GOOGLE_PLACES_API_KEY);
    const headers: Record<string, string> = {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "X-SBT-Photo-Source": image.source,
    };
    if (image.sourcePage) headers.Link = `<${image.sourcePage}>; rel="describedby"`;
    return new Response(image.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Photo not found") return new Response("Photo not found", { status: 404 });
    if (error instanceof Error && error.message === "Server config error") return new Response("Server config error", { status: 500 });
    return new Response("Photo fetch failed", { status: 502 });
  }
};
