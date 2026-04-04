// ---------------------------------------------------------------------------
// South Bay Signal — Post History & Deduplication
// Tracks what's been posted, prevents repetition
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

function historyPath() {
  return join(ROOT, CONFIG.HISTORY_FILE);
}

/**
 * Load post history from disk.
 */
export function loadHistory() {
  const path = historyPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

/**
 * Save post history to disk, pruning entries older than retention period.
 */
export function saveHistory(history) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONFIG.HISTORY_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString();

  const pruned = history.filter((h) => h.postedAt > cutoffStr);
  writeFileSync(historyPath(), JSON.stringify(pruned, null, 2) + "\n");
  return pruned;
}

/**
 * Record a published post in history.
 */
export function recordPost(post) {
  const history = loadHistory();

  history.push({
    postType: post.postType,
    title: post.title || "",
    titles: post.titles || [],
    city: post.city || "",
    cities: post.cities || [],
    category: post.category || "",
    venue: post.venue || "",
    url: post.url || "",
    platforms: post.platforms || [],
    postedAt: new Date().toISOString(),
  });

  return saveHistory(history);
}

/**
 * Get recent history for dedup scoring.
 * Returns items from the last N days.
 */
export function recentHistory(days = 7) {
  const history = loadHistory();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  return history.filter((h) => h.postedAt > cutoffStr);
}

/**
 * Flatten history entries into individual item records for scoring.
 * (Posts may contain multiple items — expand them.)
 */
export function flattenHistory(history) {
  const flat = [];
  for (const h of history) {
    if (h.titles && h.titles.length > 0) {
      for (const t of h.titles) {
        flat.push({ title: t, url: h.url, venue: h.venue, city: h.city });
      }
    } else if (h.title) {
      flat.push({ title: h.title, url: h.url, venue: h.venue, city: h.city });
    }
  }
  return flat;
}
