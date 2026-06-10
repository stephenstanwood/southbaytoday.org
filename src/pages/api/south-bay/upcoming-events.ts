import type { APIRoute } from "astro";
import { buildEventsPayload, FEED_CACHE_HEADERS } from "../../../lib/south-bay/eventsFeed";

// Full upcoming-events feed (everything from yesterday forward). Prerendered
// to a static file at build time so views can fetch it without bundling the
// JSON into client JS. Consumers that only need the next two weeks should use
// /api/south-bay/upcoming-events-near instead — it's ~40% of this payload.
export const prerender = true;

export const GET: APIRoute = () => {
  const payload = buildEventsPayload();
  return new Response(JSON.stringify(payload), { headers: FEED_CACHE_HEADERS });
};
