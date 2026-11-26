// The photo cache's inputs. build.mjs copies the shared ones in, and
// ignore-build.mjs compares their hash with the live deployment's to decide
// whether a push needs a new build.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));

/** Site files the photo cache runs: [path from the repo root, path inside photo-cache/]. */
export const COPIED = [
  ["src/lib/placePhoto.mjs", "lib/placePhoto.mjs"],
  ["src/lib/photoCache.mjs", "lib/photoCache.mjs"],
  ["src/data/south-bay/venue-photos.json", "data/south-bay/venue-photos.json"],
];

/** The project's own files, paths inside photo-cache/. */
export const OWN = ["api/place-photo.mjs", "build.mjs", "ignore-build.mjs", "source-files.mjs", "package.json", "vercel.json"];

export function sourceHash(root = ROOT) {
  const hash = createHash("sha256");
  const add = (name, path) => {
    hash.update(name);
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  };
  for (const [source] of COPIED) add(source, join(root, "..", source));
  for (const file of OWN) add(file, join(root, file));
  return hash.digest("hex");
}
