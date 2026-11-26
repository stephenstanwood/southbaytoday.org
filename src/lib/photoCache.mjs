// Photo cache relay (docs/place-photos.md).
//
// The site's /api/place-photo relays each canonical request to the photo
// cache, a separate Vercel project (photo-cache/) whose CDN cache survives the
// site's deploys. Both sides share this module: the site calls
// forwardToPhotoCache(), and the photo-cache function is
// createPhotoCacheHandler(). photo-cache/build.mjs copies this file and
// placePhoto.mjs into that project.

import { timingSafeEqual } from "node:crypto";
import { canonicalPhotoSearch, createPhotoLoader, parsePhotoRequest, photoResponse } from "./placePhoto.mjs";

export const PHOTO_CACHE_SECRET_HEADER = "x-sbt-photo-secret";

// Headers the site passes on from the photo cache. Cache-Control carries the
// photo's lifetime, and a capped or failed answer's no-store, unchanged.
const RELAYED_HEADERS = ["content-type", "cache-control", "x-sbt-photo-source", "link", "retry-after"];

// Answers the cache has already settled. 503 means Google is capped or down,
// which the site's own loader would only ask again.
const SETTLED = new Set([200, 404, 503]);

function sameSecret(given, expected) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(String(expected ?? ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** The photo cache's request handler. Only the site, holding the secret, can cause a Google download. */
export function createPhotoCacheHandler({ secret, apiKey, loadPhoto = createPhotoLoader() } = {}) {
  return async function handle(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    // Cached answers are served without reaching this code; a miss without
    // the secret must not buy a photo for someone else's site.
    if (!secret || !sameSecret(request.headers.get(PHOTO_CACHE_SECRET_HEADER), secret)) {
      return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    const url = new URL(request.url);
    const photo = parsePhotoRequest(url);
    // The site sends canonical queries only, so each photo and size has exactly one cache entry.
    if (!photo || url.search.slice(1) !== canonicalPhotoSearch(photo)) {
      return new Response("Bad photo request", { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return photoResponse(loadPhoto, photo, apiKey);
  };
}

/**
 * Relay a canonical photo query to the photo cache. Returns null when the
 * cache is not configured or did not answer, and the caller falls back to its
 * own loader.
 */
export async function forwardToPhotoCache(search, { origin, secret, fetchImpl = fetch, log = console.info } = {}) {
  if (!origin || !secret) return null;
  let response;
  try {
    response = await fetchImpl(`${String(origin).replace(/\/+$/, "")}/api/place-photo?${search}`, {
      headers: { [PHOTO_CACHE_SECRET_HEADER]: secret },
      signal: AbortSignal.timeout(9000),
    });
  } catch {
    log(JSON.stringify({ event: "place-photo-cache-fallback", reason: "network" }));
    return null;
  }
  if (!SETTLED.has(response.status)) {
    response.body?.cancel().catch(() => {});
    log(JSON.stringify({ event: "place-photo-cache-fallback", reason: `status-${response.status}` }));
    return null;
  }
  const headers = new Headers();
  for (const name of RELAYED_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cache = response.headers.get("x-vercel-cache") || "unknown";
  headers.set("X-SBT-Photo-Cache", cache);
  log(JSON.stringify({ event: "place-photo-cache-relay", status: response.status, cache }));
  return new Response(response.body, { status: response.status, headers });
}
