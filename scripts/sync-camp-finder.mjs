#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Sync Camp Finder's sourced camp records into the /camps pages
// ---------------------------------------------------------------------------
// The records live in the private `stephenstanwood/camp-finder-data`
// repository, which the Ventures operator on the Mini grows every day
// (ops/ventures/long-haul/camp-finder/SPEC.md in stoa.works). This script
// reads one region's JSONL from a local checkout of that repository and writes
// the two committed files the site builds from (see scripts/lib/camp-finder.mjs).
// Vercel never sees the private repository; it builds from these files.
//
// Usage:
//   node scripts/sync-camp-finder.mjs [--source <camp-finder-data checkout>] [--pull] [--check]
//
//   --source  default: $CAMP_FINDER_DATA, else ~/Projects/camp-finder-data
//   --pull    `git pull --ff-only` the source checkout first
//   --check   write nothing; exit 1 when the committed files are out of date
//   --gaps    write nothing; list the hand-listed camps the source doesn't
//             cover yet (the /camps "More camps to check" section) and exit
//
// Exit codes: 0 written or already current, 1 out of date (--check) or the
// source is unusable, 2 a refusal that needs a person (see below).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DATA_DIR } from "./lib/paths.mjs";
import { buildSnapshot, parseLegacyCamps } from "./lib/camp-finder.mjs";

const REGION = "santa-clara-county-ca";
const REGION_NAME = "Santa Clara County";
const SNAPSHOT = join(DATA_DIR, "camp-finder.json");
const INDEX = join(DATA_DIR, "camp-finder-index.json");
// A refresh that would drop more than this share of the programs already
// published is refused: a truncated or half-written source file must never
// empty the directory.
const MAX_DROP_SHARE = 0.2;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

const source = arg("--source") ?? process.env.CAMP_FINDER_DATA ?? join(homedir(), "Projects", "camp-finder-data");
const checkOnly = process.argv.includes("--check");

if (!existsSync(join(source, "regions", `${REGION}.jsonl`))) {
  console.error(`camp-finder: no ${REGION}.jsonl under ${source} (clone stephenstanwood/camp-finder-data there or pass --source)`);
  process.exit(1);
}

if (process.argv.includes("--pull")) {
  execFileSync("git", ["-C", source, "pull", "--ff-only", "--quiet"], { stdio: "inherit" });
}

let dataCommit = null;
try {
  dataCommit = execFileSync("git", ["-C", source, "rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  // A plain directory (no git) still syncs; the snapshot just names no commit.
}

const lines = readFileSync(join(source, "regions", `${REGION}.jsonl`), "utf8")
  .split("\n")
  .filter((line) => line.trim());
// Last summer's hand-made list keeps the camps the sourced data hasn't
// reached yet in front of parents, as links to check.
const legacy = parseLegacyCamps(readFileSync(join(DATA_DIR, "camps-data.ts"), "utf8"));
const { snapshot, index, problems } = buildSnapshot(lines, {
  dataCommit,
  region: REGION,
  regionName: REGION_NAME,
  legacy,
});

for (const problem of problems) console.warn(`camp-finder: skipped ${problem}`);

if (process.argv.includes("--gaps")) {
  for (const camp of index.stillToCheck) console.log(`${camp.name} | ${camp.city} | ${camp.url}`);
  console.log(`camp-finder: ${index.stillToCheck.length} hand-listed camps still to check`);
  process.exit(0);
}

const render = (value) => `${JSON.stringify(value, null, 1)}\n`;
const nextSnapshot = render(snapshot);
const nextIndex = render(index);
const current = existsSync(SNAPSHOT) ? readFileSync(SNAPSHOT, "utf8") : null;
const currentIndex = existsSync(INDEX) ? readFileSync(INDEX, "utf8") : null;

if (current) {
  const before = JSON.parse(current).programs.length;
  if (snapshot.programs.length < before * (1 - MAX_DROP_SHARE)) {
    console.error(
      `camp-finder: refusing to publish ${snapshot.programs.length} programs over ${before} ` +
        `(more than ${Math.round(MAX_DROP_SHARE * 100)}% fewer). Check the source; rerun with a fixed file.`,
    );
    process.exit(2);
  }
}

const changed = current !== nextSnapshot || currentIndex !== nextIndex;
const summary =
  `${snapshot.counts.programs} programs from ${snapshot.counts.operators} operators in ` +
  `${snapshot.counts.cities} cities; ${snapshot.counts.postedLatestSeason} with ${snapshot.counts.latestSeason} ` +
  `dates and prices; data ${dataCommit ?? "(no commit)"}, checked through ${snapshot.checkedThrough}`;

if (checkOnly) {
  console.log(`camp-finder: ${changed ? "OUT OF DATE" : "current"}: ${summary}`);
  process.exit(changed ? 1 : 0);
}

if (!changed) {
  console.log(`camp-finder: already current: ${summary}`);
  process.exit(0);
}

writeFileSync(SNAPSHOT, nextSnapshot);
writeFileSync(INDEX, nextIndex);
console.log(`camp-finder: wrote ${summary}`);
