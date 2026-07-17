#!/usr/bin/env node
// Google Places photoRefs expire (~30 days). When they age out, every place
// tile on the site shows a grey placeholder. This script re-queries Place
// Details by ID for every entry in places.json, then propagates fresh refs
// into default-plans.json, place-research-cache.json, and upcoming-events.json
// (events copy a venue's photoRef at ingest time).
//
// Idempotent. Skips a full refresh if places.json was refreshed in the last
// 25 days unless --force is passed. Individual failures are saved as pending
// IDs and retried by the next scheduled run instead of sitting stale until the
// next full cycle. Use --place-id=<Google place ID> for a targeted repair.
// Concurrency is intentionally low (2) — large bursts hit rate limits.

import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/env.mjs";
import { writeFileAtomic } from "./lib/io.mjs";

loadEnvLocal();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data", "south-bay");
const PLACES = join(DATA, "places.json");

const FORCE = process.argv.includes("--force");
const placeIdArg = process.argv.find((arg) => arg.startsWith("--place-id="));
const TARGET_PLACE_ID = placeIdArg?.slice("--place-id=".length).trim() || null;
const CONCURRENCY = 2;
const REFRESH_THRESHOLD_DAYS = 25;

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_PLACES_API_KEY not set");
  process.exit(1);
}

const data = JSON.parse(readFileSync(PLACES, "utf8"));
data._meta = data._meta || {};

const pendingIds = new Set(
  Array.isArray(data._meta.photoRefRefreshPendingIds)
    ? data._meta.photoRefRefreshPendingIds.filter((id) => typeof id === "string" && id)
    : [],
);

const lastRefresh = data._meta?.lastPhotoRefRefresh;
if (!FORCE && !TARGET_PLACE_ID && pendingIds.size === 0 && lastRefresh) {
  const ageDays = (Date.now() - new Date(lastRefresh).getTime()) / 86400000;
  if (ageDays < REFRESH_THRESHOLD_DAYS) {
    console.log(`skip: last refresh ${ageDays.toFixed(1)}d ago (threshold ${REFRESH_THRESHOLD_DAYS}d). Pass --force to override.`);
    process.exit(0);
  }
}

let refreshMode = "full";
let candidates;
if (TARGET_PLACE_ID) {
  refreshMode = "targeted";
  candidates = data.places.filter((p) => p.id === TARGET_PLACE_ID);
  if (candidates.length === 0) {
    console.error(`place not found: ${TARGET_PLACE_ID}`);
    process.exit(1);
  }
} else if (!FORCE && pendingIds.size > 0) {
  refreshMode = "pending";
  candidates = data.places.filter((p) => pendingIds.has(p.id));
} else {
  candidates = data.places.filter((p) => p.photoRef !== undefined);
}
console.log(`refreshing ${candidates.length} places (${refreshMode}, concurrency ${CONCURRENCY})`);

async function refreshOne(p, attempt = 0) {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${p.id}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "photos" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1) ** 2));
      return refreshOne(p, attempt + 1);
    }
    if (res.status === 404 || res.status === 400) return { status: "gone" };
    if (!res.ok) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500));
        return refreshOne(p, attempt + 1);
      }
      return { status: "error", code: res.status };
    }
    const json = await res.json();
    const ref = json.photos?.[0]?.name || null;
    return { status: "ok", ref };
  } catch (err) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500));
      return refreshOne(p, attempt + 1);
    }
    return { status: "error", err: err?.message };
  }
}

let done = 0, refreshed = 0, gone = 0, errored = 0;
const idToNew = new Map();
const failedIds = new Set();
const queue = [...candidates];

async function worker() {
  while (queue.length) {
    const p = queue.shift();
    const result = await refreshOne(p);
    if (result.status === "ok") {
      p.photoRef = result.ref;
      idToNew.set(p.id, result.ref);
      refreshed++;
    } else if (result.status === "gone") {
      p.photoRef = null;
      idToNew.set(p.id, null);
      gone++;
    } else {
      errored++;
      failedIds.add(p.id);
    }
    done++;
    if (done % 200 === 0) {
      console.log(`  ${done}/${candidates.length} (refreshed=${refreshed}, gone=${gone}, err=${errored})`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`\nfinal: refreshed=${refreshed}, gone=${gone}, errored=${errored}`);

for (const p of candidates) {
  if (failedIds.has(p.id)) pendingIds.add(p.id);
  else pendingIds.delete(p.id);
}
if (pendingIds.size > 0) {
  data._meta.photoRefRefreshPendingIds = [...pendingIds].sort();
  console.warn(`pending retry: ${pendingIds.size} place${pendingIds.size === 1 ? "" : "s"}`);
} else {
  delete data._meta.photoRefRefreshPendingIds;
}
if (refreshMode === "full") {
  data._meta.lastPhotoRefRefresh = new Date().toISOString();
}
writeFileAtomic(PLACES, JSON.stringify(data, null, 2));
console.log("places.json written");

// Propagate fresh refs to every JSON file in src/data/south-bay/ that
// carries a photoRef somewhere in its tree. Walks recursively so new files
// added to the pipeline get covered automatically — that's how weekend-picks
// silently slipped through the first run.
function walkAndSwap(node, stats) {
  if (Array.isArray(node)) {
    for (const item of node) walkAndSwap(item, stats);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (typeof node.photoRef === "string" && node.photoRef.startsWith("places/")) {
    const m = node.photoRef.match(/^places\/([^/]+)\//);
    if (m && idToNew.has(m[1])) {
      const fresh = idToNew.get(m[1]);
      if (node.photoRef !== fresh) {
        node.photoRef = fresh;
        stats.count++;
      }
    }
  }
  for (const k of Object.keys(node)) walkAndSwap(node[k], stats);
}

const dataFiles = readdirSync(DATA)
  .filter((f) => f.endsWith(".json"))
  .map((f) => join(DATA, f))
  .filter((f) => f !== PLACES);

const propagated = [];
for (const file of dataFiles) {
  let json;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  const stats = { count: 0 };
  walkAndSwap(json, stats);
  if (stats.count > 0) {
    writeFileAtomic(file, JSON.stringify(json, null, 2));
    propagated.push({ file, count: stats.count });
    console.log(`${file.split("/").pop()}: ${stats.count} updated`);
  }
}

if (process.argv.includes("--commit")) {
  const repoRoot = join(__dirname, "..");
  try {
    const changedFiles = [PLACES, ...propagated.map((p) => p.file)].join(" ");
    execSync(`git add ${changedFiles}`, { cwd: repoRoot, stdio: "pipe" });
    execSync(
      'git commit -m "data: monthly photoRef refresh"',
      { cwd: repoRoot, stdio: "pipe" },
    );
    execSync("git push", { cwd: repoRoot, stdio: "pipe" });
    console.log("committed + pushed");
  } catch (err) {
    console.error("commit/push failed:", err.message);
    process.exitCode = 1;
  }
}

if (errored > 0) {
  console.error(`${errored} place${errored === 1 ? "" : "s"} left pending for the next run`);
  process.exitCode = 1;
}
