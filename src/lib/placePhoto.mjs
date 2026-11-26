import venuePhotos from "../data/south-bay/venue-photos.json" with { type: "json" };

const venues = new Map(venuePhotos.photos.map((photo) => [photo.placeId, photo]));
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function parsePhotoRequest(url) {
  const ref = url.searchParams.get("ref") || "";
  const match = /^places\/([A-Za-z0-9_-]+)\/photos\/[A-Za-z0-9_-]+$/.exec(ref);
  if (!match) return null;
  const dimension = (name, fallback, maximum) =>
    Math.max(1, Math.min(Math.floor(Number(url.searchParams.get(name)) || fallback), maximum));
  return { ref, placeId: match[1], width: dimension("w", 400, 800), height: dimension("h", 300, 600) };
}

export function canonicalPhotoSearch(photo) {
  return new URLSearchParams({ ref: photo.ref, w: String(photo.width), h: String(photo.height) }).toString();
}

export const PHOTO_CACHE_CONTROL = "public, max-age=86400, s-maxage=604800";
export const MISSING_PHOTO_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";

/** The HTTP answer for one canonical photo request, shared by the site route and the photo cache. */
export async function photoResponse(loadPhoto, photo, apiKey) {
  try {
    const image = await loadPhoto(photo, apiKey);
    const headers = {
      "Content-Type": image.contentType,
      "Cache-Control": PHOTO_CACHE_CONTROL,
      "X-SBT-Photo-Source": image.source,
    };
    if (image.sourcePage) headers.Link = `<${image.sourcePage}>; rel="describedby"`;
    return new Response(image.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // A photo that is gone even after the current-photo lookup stays gone for
    // a while; let the CDN answer repeats instead of re-asking Google.
    if (message === "Photo not found") {
      return new Response("Photo not found", { status: 404, headers: { "Cache-Control": MISSING_PHOTO_CACHE_CONTROL } });
    }
    if (message === "Server config error") return new Response("Server config error", { status: 500 });
    // A quota cap, outage or timeout is temporary. Never cache it, so the
    // photo returns as soon as Google answers again; cards show their fallback.
    return new Response("Photo fetch failed", {
      status: message === "Photo upstream unavailable" ? 503 : 502,
      headers: { "Cache-Control": "no-store", "Retry-After": "300" },
    });
  }
}

/** A refusal that says nothing about the photo itself: quota cap, key problem or outage. */
function upstreamUnavailable(status) {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

async function imageBytes(response) {
  const type = response.headers.get("content-type") || "";
  // Only a real miss may be cached as "not found". A daily quota cap answers
  // 429 until midnight, and caching that as a missing photo would hide the
  // photo for a day after Google starts serving it again.
  if (!response.ok && upstreamUnavailable(response.status)) throw new Error("Photo upstream unavailable");
  if (!response.ok || !/^image\/(jpeg|png|webp|gif|avif)(?:;|$)/i.test(type)) {
    throw new Error("Photo not found");
  }
  if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) throw new Error("Image too large");
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.length > MAX_IMAGE_BYTES) throw new Error("Image too large");
  return { body, contentType: type };
}

async function resizeVenuePhoto(body, photo) {
  const { default: sharp } = await import("sharp");
  const image = sharp(body);
  const metadata = await image.metadata();
  if (!(metadata.width >= photo.width && metadata.height >= photo.height)) {
    throw new Error("Official photo no longer meets the requested resolution");
  }
  return image
    // Cards already crop with object-fit: cover. Crop before downsampling so
    // a wide/portrait source is not reduced on one axis then enlarged in CSS.
    .resize({ width: photo.width, height: photo.height, fit: "cover", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

/** Share concurrent work only. Completed Google photos/URLs are never stored here. */
export function createPhotoLoader({ fetchImpl = fetch, resize = resizeVenuePhoto, log = console.info } = {}) {
  const inFlight = new Map();

  async function load(photo, apiKey) {
    const venue = venues.get(photo.placeId);
    // The official photo must meet the requested resolution. Larger placements
    // retain Google instead of stretching a small library thumbnail into a hero.
    if (venue && venue.width >= photo.width && venue.height >= photo.height) {
      try {
        const response = await fetchImpl(venue.imageUrl, { signal: AbortSignal.timeout(2500) });
        const image = await imageBytes(response);
        const body = await resize(image.body, photo);
        log(JSON.stringify({ event: "place-photo-upstream", source: "venue", placeId: photo.placeId, width: photo.width, height: photo.height }));
        return { body, contentType: "image/jpeg", source: "venue", sourcePage: venue.sourcePage };
      } catch {
        log(JSON.stringify({ event: "place-photo-venue-fallback", placeId: photo.placeId, width: photo.width, height: photo.height }));
        // A changed source, HTML response, broken image, or transient outage
        // must not remove a photo that the current Google route can still serve.
      }
    }

    if (!apiKey) throw new Error("Server config error");
    let response = await fetchGoogleMedia(photo.ref, photo, apiKey);
    if (response.status === 400 || response.status === 404) {
      // Photo names expire, and Google answers an expired one with 400
      // ("retrieve it from Places API endpoints"). Archived newsletters,
      // shared plans, and food tiles keep the name they were built with, so
      // ask Places for this place's current first photo — an IDs-only Place
      // Details read — and serve that under the same URL. The fresh name is
      // used for this request only; nothing is stored.
      await response.body?.cancel();
      const fresh = await currentPhotoName(photo.placeId, apiKey);
      log(JSON.stringify({ event: "place-photo-ref-refresh", placeId: photo.placeId, found: Boolean(fresh) }));
      if (!fresh) throw new Error("Photo not found");
      response = await fetchGoogleMedia(fresh, photo, apiKey);
    }
    const image = await imageBytes(response);
    log(JSON.stringify({ event: "place-photo-upstream", source: "google-places", placeId: photo.placeId, width: photo.width, height: photo.height }));
    return { ...image, source: "google-places" };
  }

  async function fetchGoogleMedia(ref, photo, apiKey) {
    const url = new URL(`https://places.googleapis.com/v1/${ref}/media`);
    url.search = new URLSearchParams({ maxWidthPx: String(photo.width), maxHeightPx: String(photo.height), key: apiKey }).toString();
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      // Count actual provider attempts, including retries and failed calls.
      // The success-only upstream event below cannot measure those costs.
      log(JSON.stringify({ event: "place-photo-google-request", placeId: photo.placeId, width: photo.width, height: photo.height, attempt: attempt + 1 }));
      try {
        response = await fetchImpl(url.href, { signal: AbortSignal.timeout(8000), redirect: "follow" });
      } catch (error) {
        if (attempt === 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150));
        continue;
      }
      if (response.ok || !(response.status === 429 || response.status >= 500) || attempt === 1) break;
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return response;
  }

  /** This place's current first photo name, or null when Places has none. */
  async function currentPhotoName(placeId, apiKey) {
    let response;
    try {
      response = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "photos" },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new Error("Photo upstream unavailable");
    }
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      if (upstreamUnavailable(response.status)) throw new Error("Photo upstream unavailable");
      return null;
    }
    try {
      const name = (await response.json())?.photos?.[0]?.name;
      return typeof name === "string" && name.startsWith(`places/${placeId}/photos/`) ? name : null;
    } catch {
      return null;
    }
  }

  return async (photo, apiKey) => {
    const key = canonicalPhotoSearch(photo);
    const pending = inFlight.get(key);
    if (pending) return pending;
    const promise = load(photo, apiKey);
    // Bound concurrency bookkeeping, without evicting another active request.
    const shared = inFlight.size < 64;
    if (shared) inFlight.set(key, promise);
    try { return await promise; }
    finally { if (shared) inFlight.delete(key); }
  };
}
