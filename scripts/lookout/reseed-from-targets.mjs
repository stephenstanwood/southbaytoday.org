/**
 * Emergency restore: rebuild the tracker blob from targets.json after a wipe.
 *
 * Reads any existing deletedIds from the blob (so tombstones survive),
 * seeds every non-tombstoned target at status "not-attempted", then writes.
 *
 * After running this, run scripts/lookout/resync-from-resend.mjs to recover
 * "receiving" status from Resend's inbox history.
 *
 * Does NOT del() before put() — that race is what wiped the blob in the
 * first place.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { head, put } from "@vercel/blob";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dirname, "../../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) { console.error("BLOB_READ_WRITE_TOKEN missing"); process.exit(1); }

const KEY = "lookout/newsletter-tracker.json";
const targetsPath = join(__dirname, "targets.json");
const { targets } = JSON.parse(readFileSync(targetsPath, "utf8"));

let existingDeletedIds = [];
let existingTargets = [];
try {
  const meta = await head(KEY, { token });
  const cur = await (await fetch(`${meta.url}?_cb=${Date.now()}`)).json();
  existingDeletedIds = cur.deletedIds ?? [];
  existingTargets = cur.targets ?? [];
  console.log(`current blob: ${existingTargets.length} targets, ${existingDeletedIds.length} tombstones`);
} catch (err) {
  console.warn(`could not read current blob (${err.message}) — proceeding with empty baseline`);
}

if (existingTargets.length >= targets.length) {
  console.error(`refusing to reseed: blob already has ${existingTargets.length} targets (>= ${targets.length} in targets.json). Nothing to restore.`);
  process.exit(1);
}

const tombstoned = new Set(existingDeletedIds);
const existingById = new Map(existingTargets.map((t) => [t.id, t]));
const now = new Date().toISOString();

const newTargets = [];
for (const t of targets) {
  if (tombstoned.has(t.id)) continue;
  const prior = existingById.get(t.id);
  if (prior) {
    newTargets.push(prior);
    continue;
  }
  newTargets.push({
    ...t,
    status: "not-attempted",
    receivedCount: 0,
    seenFromAddresses: [],
    seenFromDomains: [],
  });
}

const doc = {
  version: 1,
  updatedAt: now,
  targets: newTargets,
  deletedIds: existingDeletedIds,
};

await put(KEY, JSON.stringify(doc, null, 2), {
  access: "public", token, allowOverwrite: true, cacheControlMaxAge: 0,
  contentType: "application/json",
});

console.log(`reseeded: ${newTargets.length} targets, ${existingDeletedIds.length} tombstones preserved`);
console.log("next: node scripts/lookout/resync-from-resend.mjs");
