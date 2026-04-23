import type { APIRoute } from "astro";
import upcomingData from "../../../data/south-bay/upcoming-events.json";

// Prerender this route so it becomes a static file at build time — that lets
// the homepage + city + tab views fetch the full event feed without bundling
// the 640KB JSON into their client JS. The build output ships the JSON as a
// sibling asset that the browser can cache independently of the app bundle.
export const prerender = true;

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(upcomingData), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
    },
  });
};
