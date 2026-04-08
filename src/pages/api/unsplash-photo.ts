export const prerender = false;

// ---------------------------------------------------------------------------
// GET /api/unsplash-photo?query=...
// Returns a single Unsplash photo for the given query.
// - Server-side only (key never exposed to client)
// - 24hr in-memory cache per query
// - Automatically triggers Unsplash download endpoint (required by guidelines)
// ---------------------------------------------------------------------------

import type { APIRoute } from "astro";

interface UnsplashResult {
  url: string;
  photographer: string;
  photographerUrl: string;
  unsplashUrl: string;
}

const cache = new Map<string, { data: UnsplashResult; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const UTM = "utm_source=south_bay_today&utm_medium=referral";

// Category → search query mapping for better Unsplash results
const CATEGORY_QUERIES: Record<string, string> = {
  food: "restaurant meal california",
  outdoor: "park nature outdoor california",
  museum: "museum art gallery interior",
  entertainment: "entertainment fun activity",
  wellness: "spa wellness relaxing",
  shopping: "boutique shopping retail",
  arts: "art gallery studio creative",
  events: "festival outdoor event crowd",
  sports: "sports stadium game",
  neighborhood: "california neighborhood street",
};

export const GET: APIRoute = async ({ url }) => {
  const key = import.meta.env.UNSPLASH_ACCESS_KEY;
  if (!key) return new Response(JSON.stringify({ error: "Not configured" }), { status: 503 });

  const rawQuery = url.searchParams.get("query") || "california";
  const orientation = url.searchParams.get("orientation") || "squarish";
  // Normalize: map category shortcuts through query map
  const query = CATEGORY_QUERIES[rawQuery] ?? rawQuery;
  const cacheKey = `${query}::${orientation}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return new Response(JSON.stringify(cached.data), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
    });
  }

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=${orientation}`,
      {
        headers: { Authorization: `Client-ID ${key}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return new Response(JSON.stringify({ error: "Unsplash error" }), { status: 502 });

    const data = await res.json();
    const results = data.results ?? [];
    const photo = results[Math.floor(Math.random() * Math.min(results.length, 5))];
    if (!photo) return new Response(JSON.stringify({ error: "No results" }), { status: 404 });

    // Trigger download endpoint — required by Unsplash API guidelines
    fetch(photo.links.download_location, {
      headers: { Authorization: `Client-ID ${key}` },
    }).catch(() => {});

    const result: UnsplashResult = {
      url: photo.urls.small,
      photographer: photo.user.name,
      photographerUrl: `${photo.user.links.html}?${UTM}`,
      unsplashUrl: `https://unsplash.com/?${UTM}`,
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    // Evict old entries
    if (cache.size > 200) {
      const oldest = cache.keys().next().value!;
      cache.delete(oldest);
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed" }), { status: 500 });
  }
};
