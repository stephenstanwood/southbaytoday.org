// ---------------------------------------------------------------------------
// eventFreshness — track when each event was first seen by our scraper.
//
// Stamps every event with `firstSeenAt` so the UI can surface a "JUST ADDED"
// badge for items that appeared in the last few days. Repeat visitors get a
// reason to scan the events tab again instead of assuming "same list as
// yesterday".
//
// Flow:
//   1. Load persistent cache (id → ISO firstSeenAt).
//   2. For each current event:
//        - existing entry: keep its timestamp.
//        - missing entry: stamp with NOW (or backdated NOW on cold start).
//   3. Prune entries whose event id no longer appears in the dataset AND
//      whose firstSeenAt is older than 90 days. Keeps the cache from
//      ballooning while preserving history for events that drop out and
//      come back.
//   4. Persist cache, write firstSeenAt onto each event in-place.
//
// Cold-start behavior: if the cache is empty on first run, we backdate every
// event by 7 days so the badge doesn't flood the entire list with "JUST
// ADDED" pills the moment the feature ships.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const CACHE_PATH = join(REPO_ROOT, "src", "data", "south-bay", "event-first-seen-cache.json");

const PRUNE_AFTER_DAYS = 90;
const COLD_START_BACKDATE_DAYS = 7;

function loadCache() {
  if (!existsSync(CACHE_PATH)) return { byId: {}, generatedAt: null };
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    if (!parsed.byId) parsed.byId = {};
    return parsed;
  } catch {
    return { byId: {}, generatedAt: null };
  }
}

function saveCache(cache) {
  cache.generatedAt = new Date().toISOString();
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

/**
 * Stamp `firstSeenAt` on every event using a persistent id-keyed cache.
 *
 * @param {Array<{ id: string, firstSeenAt?: string }>} events
 * @returns {{ stamped: number, fresh: number, pruned: number, coldStart: boolean }}
 */
export function stampFirstSeen(events) {
  const cache = loadCache();
  const isColdStart = Object.keys(cache.byId).length === 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const coldStartIso = new Date(now.getTime() - COLD_START_BACKDATE_DAYS * 86400_000).toISOString();
  const stampIso = isColdStart ? coldStartIso : nowIso;

  let stamped = 0;
  let fresh = 0;
  const seenIds = new Set();

  for (const e of events) {
    if (!e.id) continue;
    seenIds.add(e.id);
    const existing = cache.byId[e.id];
    if (existing) {
      e.firstSeenAt = existing;
      stamped++;
    } else {
      cache.byId[e.id] = stampIso;
      e.firstSeenAt = stampIso;
      stamped++;
      if (!isColdStart) fresh++;
    }
  }

  // Prune entries for events that have dropped out of the dataset and are
  // also older than the prune horizon — keeps the cache lean without
  // forgetting recently-vanished events that may reappear.
  const pruneCutoff = now.getTime() - PRUNE_AFTER_DAYS * 86400_000;
  let pruned = 0;
  for (const [id, ts] of Object.entries(cache.byId)) {
    if (seenIds.has(id)) continue;
    const tsMs = new Date(ts).getTime();
    if (Number.isFinite(tsMs) && tsMs < pruneCutoff) {
      delete cache.byId[id];
      pruned++;
    }
  }

  saveCache(cache);

  return { stamped, fresh, pruned, coldStart: isColdStart };
}
