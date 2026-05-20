#!/usr/bin/env node
// Daily sentinel: sample random photoRefs from places.json, test against
// Google. If >10% fail, DM via the cat-signal so we catch silent expirations
// before users notice grey tiles everywhere.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/env.mjs";
import { catSignal } from "./lib/notify.mjs";

loadEnvLocal();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLACES = join(__dirname, "..", "src", "data", "south-bay", "places.json");

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_PLACES_API_KEY not set");
  process.exit(1);
}

const SAMPLE_SIZE = 20;
const ALERT_THRESHOLD = 0.10; // 10% failure → alert

const data = JSON.parse(readFileSync(PLACES, "utf8"));
const withRefs = data.places.filter((p) => p.photoRef);
console.log(`sampling ${SAMPLE_SIZE} of ${withRefs.length} places with photoRef`);

const sample = [];
const seen = new Set();
while (sample.length < SAMPLE_SIZE && sample.length < withRefs.length) {
  const idx = Math.floor(Math.random() * withRefs.length);
  if (seen.has(idx)) continue;
  seen.add(idx);
  sample.push(withRefs[idx]);
}

let ok = 0, fail = 0;
const failures = [];
await Promise.all(sample.map(async (p) => {
  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/${p.photoRef}/media?maxWidthPx=120&maxHeightPx=120&key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (r.ok) ok++;
    else { fail++; failures.push(`${r.status} ${p.name}`); }
  } catch (err) {
    fail++;
    failures.push(`err ${p.name}: ${err.message}`);
  }
}));

const failPct = fail / sample.length;
console.log(`ok=${ok} fail=${fail} (${(failPct * 100).toFixed(0)}%)`);
if (failures.length) failures.forEach((f) => console.log("  -", f));

if (failPct > ALERT_THRESHOLD) {
  await catSignal({
    key: "photoref-health",
    title: "Google Places photoRefs are failing",
    body:
      `Sampled ${SAMPLE_SIZE} places.json refs against Google Places — ` +
      `**${fail}/${SAMPLE_SIZE} returned errors** (${(failPct * 100).toFixed(0)}%).\n\n` +
      `Run \`node scripts/refresh-place-photorefs.mjs --force --commit\` on the Mini to refresh.\n\n` +
      "```\n" + failures.slice(0, 10).join("\n") + "\n```",
  });
  console.log("alerted via cat-signal");
  process.exit(1);
}
