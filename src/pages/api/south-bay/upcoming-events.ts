import type { APIRoute } from "astro";
import { buildEventsPayload, FEED_CACHE_HEADERS } from "../../../lib/south-bay/eventsFeed";

// Full upcoming-events feed (everything from yesterday forward). Views fetch
// this at runtime instead of bundling the JSON into client JS. Consumers that
// only need the next two weeks should use /api/south-bay/upcoming-events-near
// instead — it's ~40% of this payload.
//
// On-demand (not prerendered): Vercel's static-asset server ignores Response
// headers on prerendered routes with no file extension and served this as
// application/octet-stream with a download disposition instead of JSON.
// Rendering on-demand makes it a real function response, so our declared
// Content-Type and Cache-Control headers (FEED_CACHE_HEADERS) are honored.
export const prerender = false;

export const GET: APIRoute = () => {
  const payload = buildEventsPayload();
  return new Response(JSON.stringify(payload), { headers: FEED_CACHE_HEADERS });
};
