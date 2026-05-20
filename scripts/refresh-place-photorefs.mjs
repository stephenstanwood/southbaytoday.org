#!/usr/bin/env node
// Google Places photoRefs expire (~30 days). When they age out, every place
// tile on the site shows a grey placeholder. This script re-queries Place
// Details by ID for every entry in places.json, then propagates fresh refs
// into default-plans.json, place-research-cache.json, and upcoming-events.json
// (events copy a venue's photoRef at ingest time).
//
// Idempotent. Skips itself if places.json was refreshed in the last 25 days
// unless --force is passed. Concurrency is intentionally low (2) — large
// bursts hit rate limits and produce silent skips.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/env.mjs";

loadEnvLocal();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data", "south-bay");
const PLACES = join(DATA, "places.json");
const DEFAULT_PLANS = join(DATA, "default-plans.json");
const RESEARCH = join(DATA, "place-research-cache.json");
const EVENTS = join(DATA, "upcoming-events.json");

const FORCE = process.argv.includes("--force");
const CONCURRENCY = 2;
const REFRESH_THRESHOLD_DAYS = 25;

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_PLACES_API_KEY not set");
  process.exit(1);
}

const data = JSON.parse(readFileSync(PLACES, "utf8"));

const lastRefresh = data._meta?.lastPhotoRefRefresh;
if (!FORCE && lastRefresh) {
  const ageDays = (Date.now() - new Date(lastRefresh).getTime()) / 86400000;
  if (ageDays < REFRESH_THRESHOLD_DAYS) {
    console.log(`skip: last refresh ${ageDays.toFixed(1)}d ago (threshold ${REFRESH_THRESHOLD_DAYS}d). Pass --force to override.`);
    process.exit(0);
  }
}

const withRefs = data.places.filter((p) => p.photoRef !== undefined);
console.log(`refreshing ${withRefs.length} places (concurrency ${CONCURRENCY})`);

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
const queue = [...withRefs];

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
    }
    done++;
    if (done % 200 === 0) {
      console.log(`  ${done}/${withRefs.length} (refreshed=${refreshed}, gone=${gone}, err=${errored})`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`\nfinal: refreshed=${refreshed}, gone=${gone}, errored=${errored}`);

data._meta = data._meta || {};
data._meta.lastPhotoRefRefresh = new Date().toISOString();
writeFileSync(PLACES, JSON.stringify(data, null, 2));
console.log("places.json written");

// Propagate fresh refs to default-plans.json (card.id format `place:<ID>`,
// event cards carry the photoRef directly as `places/<ID>/photos/...`).
const dp = JSON.parse(readFileSync(DEFAULT_PLANS, "utf8"));
let dpUpd = 0;
for (const planKey of Object.keys(dp.plans || {})) {
  for (const c of dp.plans[planKey].cards || []) {
    let placeId = null;
    if (c.id?.startsWith("place:")) placeId = c.id.slice(6);
    else if (c.photoRef?.startsWith("places/")) {
      placeId = c.photoRef.match(/^places\/([^/]+)\//)?.[1] || null;
    }
    if (placeId && idToNew.has(placeId) && c.photoRef !== idToNew.get(placeId)) {
      c.photoRef = idToNew.get(placeId);
      dpUpd++;
    }
  }
}
writeFileSync(DEFAULT_PLANS, JSON.stringify(dp, null, 2));
console.log(`default-plans.json: ${dpUpd} updated`);

// Events copy a venue photoRef at ingest — keep them in sync.
const events = JSON.parse(readFileSync(EVENTS, "utf8"));
const evArr = Array.isArray(events) ? events : events.events || [];
let evUpd = 0;
for (const e of evArr) {
  if (e.photoRef?.startsWith("places/")) {
    const m = e.photoRef.match(/^places\/([^/]+)\//);
    if (m && idToNew.has(m[1]) && e.photoRef !== idToNew.get(m[1])) {
      e.photoRef = idToNew.get(m[1]);
      evUpd++;
    }
  }
}
writeFileSync(EVENTS, JSON.stringify(events, null, 2));
console.log(`upcoming-events.json: ${evUpd} updated`);

const research = JSON.parse(readFileSync(RESEARCH, "utf8"));
let rUpd = 0;
if (Array.isArray(research)) {
  for (const r of research) {
    if (r.id && idToNew.has(r.id) && r.photoRef !== idToNew.get(r.id)) {
      r.photoRef = idToNew.get(r.id);
      rUpd++;
    }
  }
} else if (research && typeof research === "object") {
  for (const id of Object.keys(research)) {
    if (idToNew.has(id) && research[id]?.photoRef !== idToNew.get(id)) {
      research[id].photoRef = idToNew.get(id);
      rUpd++;
    }
  }
}
writeFileSync(RESEARCH, JSON.stringify(research, null, 2));
console.log(`place-research-cache.json: ${rUpd} updated`);

if (process.argv.includes("--commit")) {
  const repoRoot = join(__dirname, "..");
  try {
    execSync(
      `git add ${PLACES} ${DEFAULT_PLANS} ${RESEARCH} ${EVENTS}`,
      { cwd: repoRoot, stdio: "pipe" },
    );
    execSync(
      'git commit -m "data: monthly photoRef refresh"',
      { cwd: repoRoot, stdio: "pipe" },
    );
    execSync("git push", { cwd: repoRoot, stdio: "pipe" });
    console.log("committed + pushed");
  } catch (err) {
    console.error("commit/push failed:", err.message);
  }
}
