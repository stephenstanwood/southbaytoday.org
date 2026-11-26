// The photo cache's only route. The handler lives in src/lib/photoCache.mjs;
// build.mjs copies it here. See photo-cache/README.md.

import { createPhotoCacheHandler } from "../lib/photoCache.mjs";

const handle = createPhotoCacheHandler({
  secret: process.env.PHOTO_CACHE_SECRET,
  apiKey: process.env.GOOGLE_PLACES_API_KEY,
});

export default { fetch: handle };
