import type { APIRoute, GetStaticPaths } from "astro";
import { CITIES } from "../../../lib/south-bay/cities";
import { getOpenNowCandidates } from "../../../lib/south-bay/cityPageData";

// Prerendered per city: the "Open Right Now" pool that CityPage fetches after
// mount. That panel only renders post-mount (it's clock- and random-driven),
// so its ~30 places stay out of the island props, where they'd sit in front
// of all of the page's server-rendered HTML. Most of the ~29 KB is Google
// photo refs, which barely compress.
export const getStaticPaths = (() =>
  CITIES.map((city) => ({ params: { slug: city.id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(getOpenNowCandidates(params.slug ?? "")), {
    headers: { "Content-Type": "application/json" },
  });
