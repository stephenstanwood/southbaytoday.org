// Vercel build for the photo cache: copy in the site's photo loader and
// publish the source hash that ignore-build.mjs compares against.

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { COPIED, ROOT, sourceHash } from "./source-files.mjs";

for (const [source, destination] of COPIED) {
  const target = join(ROOT, destination);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(ROOT, "..", source), target);
}

const hash = sourceHash();
mkdirSync(join(ROOT, "public"), { recursive: true });
writeFileSync(join(ROOT, "public", "version.json"), `${JSON.stringify({ hash }, null, 2)}\n`);
console.log(`photo cache sources ${hash.slice(0, 12)}`);
