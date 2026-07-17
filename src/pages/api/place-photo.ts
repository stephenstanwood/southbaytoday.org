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

export const GET: APIRoute = async ({ request, clientAddress }) => {
  if (!rateLimit(clientAddress, 60)) return rateLimitResponse();

  const url = new URL(request.url);
  const photoRef = url.searchParams.get("ref");
  // Clamp to a positive range: a negative w/h (e.g. ?w=-100) otherwise passed
  // straight through Math.min into the upstream Google request.
  const maxW = Math.max(1, Math.min(Number(url.searchParams.get("w")) || 400, 800));
  const maxH = Math.max(1, Math.min(Number(url.searchParams.get("h")) || 300, 600));

  // photoRef is interpolated into the Google URL path — reject anything that
  // looks like a full URL or path-traversal attempt (defense-in-depth SSRF).
  if (!photoRef || photoRef.includes("://") || photoRef.includes("..") || /\s/.test(photoRef)) {
    return new Response("Missing or invalid ref param", { status: 400 });
  }

  const apiKey = import.meta.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return new Response("Server config error", { status: 500 });
  }

  try {
    const photoUrl = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=${maxW}&maxHeightPx=${maxH}&key=${apiKey}`;
    let res: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetch(photoUrl, {
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });
      } catch (error) {
        if (attempt === 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150));
        continue;
      }

      if (res.ok) break;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === 1) break;
      await res.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    if (!res?.ok) {
      return new Response("Photo not found", { status: 404 });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const body = await res.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch {
    return new Response("Photo fetch failed", { status: 502 });
  }
};
