#!/usr/bin/env node
// One-off: drop SCU internal-only events from upcoming-events.json so the new
// filter takes effect immediately (before the next nightly regen). Mirrors the
// patterns added to generate-events.mjs in the same commit.
import fs from "node:fs";

const PATH = "src/data/south-bay/upcoming-events.json";
const URL_PATHS = /\/(human-resources|advancement-services|teaching-and-learning|campus-ministry)\//i;
const TITLE = /\b(sample class|performance conversations?|spark60|beyond the major|improv@work)\b|^workshop\s*\|/i;
const DESC = /\b(brown bag|forge garden)\b/i;

const data = JSON.parse(fs.readFileSync(PATH, "utf8"));
const before = data.events.length;
const dropped = [];
data.events = data.events.filter((e) => {
  const isInternal =
    URL_PATHS.test(e.url || "") ||
    TITLE.test(e.title || "") ||
    DESC.test(e.description || "");
  if (isInternal) dropped.push({ title: e.title, url: e.url });
  return !isInternal;
});
data.eventCount = data.events.length;

fs.writeFileSync(PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`Dropped ${before - data.events.length} SCU internal events:`);
for (const d of dropped) console.log(`  - ${d.title}`);
