import type { APIRoute } from "astro";
import { buildEventsPayload, FEED_CACHE_HEADERS } from "../../../lib/south-bay/eventsFeed";

// 14-day slice of the events feed (~40% of the full payload). City pages and
// the Events tab's first paint read this; the full feed loads behind it only
// where the longer horizon is actually used (search, far dates, Tech's 30-day
// conference window).
export const prerender = true;

export const GET: APIRoute = () => {
  const payload = buildEventsPayload(14);
  return new Response(JSON.stringify(payload), { headers: FEED_CACHE_HEADERS });
};
