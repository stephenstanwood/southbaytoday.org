// Vercel's Ignored Build Step for the photo cache: exit 0 skips the build,
// exit 1 builds. Every push to the repo reaches this project, but it builds
// only when its sources changed. A new deployment starts with an empty CDN
// cache, and every photo cached there would be downloaded from Google again.

import { sourceHash } from "./source-files.mjs";

const LIVE_VERSION = "https://photos.southbaytoday.org/version.json";

try {
  const current = sourceHash();
  const response = await fetch(LIVE_VERSION, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  const live = response.ok ? (await response.json())?.hash : null;
  if (live === current) {
    console.log(`photo cache unchanged (${current.slice(0, 12)}); skipping build`);
    process.exit(0);
  }
  console.log(`photo cache changed (live ${String(live).slice(0, 12)}, new ${current.slice(0, 12)}); building`);
} catch (error) {
  console.log(`photo cache version check failed (${error?.message ?? error}); building`);
}
process.exit(1);
