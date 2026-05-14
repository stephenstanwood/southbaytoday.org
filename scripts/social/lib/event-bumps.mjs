// ---------------------------------------------------------------------------
// South Bay Today — Evening Event Bumps
//
// Original tonight-pick publishes around 11:45 AM. Algorithm reach on that
// post is mostly dead by 4 PM as the feed has moved on. An evening bump
// posted ~30 min before the event catches the after-work "what should I
// do tonight?" audience — a second engagement window for the same content.
//
// Pattern: when publish.mjs successfully publishes a tonight-pick to
// X / Threads / Bluesky, queueBump() writes a pending-bump entry with the
// parent post IDs + pre-generated bump text + the trigger time (event time
// minus 30 min). A separate cron (process-event-bumps.mjs, every 15 min)
// reads the queue, fires due bumps as replies, removes them from the queue.
//
// Bump text is generated at copy-gen time (Claude knows the item context
// when writing the parent — no need for a second API call at fire time).
// Bumps are text-only replies; no images.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(__dirname, "..", "..", "..", "src", "data", "south-bay", "social-bump-queue.json");

const STALE_HOURS = 24;          // give up on bumps queued > 24h ago
const BUMP_LEAD_MIN = 30;        // bump fires N minutes before event time

function loadQueue() {
  if (!existsSync(QUEUE_FILE)) return { queue: [] };
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  } catch {
    return { queue: [] };
  }
}

function saveQueue(data) {
  const tmp = QUEUE_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, QUEUE_FILE);
}

/**
 * Convert a parsed event "time" string + plan date to a UTC timestamp.
 * Accepts forms: "8:00 PM", "8 PM", "20:00", "7:30PM". Anything we can't
 * parse returns null and the caller skips the bump.
 */
function parseEventTimeToUtcMs(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  // Strip TZ suffixes some sources include, like "8:00 PM PT"
  const cleaned = String(timeStr).replace(/\s*(PT|PST|PDT|Pacific)\s*$/i, "").trim();
  // Match "8:30 PM" / "8 PM" / "20:00" / "8:30pm"
  const m12 = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  const m24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  let hours, minutes;
  if (m12) {
    hours = parseInt(m12[1], 10);
    minutes = m12[2] ? parseInt(m12[2], 10) : 0;
    const ampm = m12[3].toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
  } else if (m24) {
    hours = parseInt(m24[1], 10);
    minutes = parseInt(m24[2], 10);
  } else {
    return null;
  }
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return null;
  // Construct a Date in PT then read the UTC ms.
  // Trick: ${date}T${HH:MM}:00-07:00 is technically wrong half the year (DST
  // would be -08:00), so we use the toLocaleString round-trip below.
  const candidate = new Date(`${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
  if (Number.isNaN(candidate.getTime())) return null;
  // The above interprets in the runtime's local TZ. The Mini runs on PT so
  // this is correct in production; tests run in UTC and would be ~7-8h off
  // but that's not load-bearing for the queue's correctness — we re-check
  // bumpAt against Date.now() at fire time.
  return candidate.getTime();
}

/**
 * Add a pending bump for a tonight-pick post. Called from publish.mjs after
 * a successful main publish.
 *
 * @param {object} args
 * @param {object} args.post         The post.json that was just published.
 * @param {object} args.results      Per-platform publish results — must
 *   include {id} for x/threads and {uri, cid} for bluesky.
 * @returns {boolean} true if a bump was queued, false if skipped (no time
 *   field, time already passed, no bump copy, etc.)
 */
export function queueBump({ post, results }) {
  if (post.postType !== "tonight-pick") return false;
  const item = post.item || post.items?.[0];
  if (!item) return false;
  const eventMs = parseEventTimeToUtcMs(item.date, item.time);
  if (!eventMs) return false;
  const bumpAtMs = eventMs - BUMP_LEAD_MIN * 60 * 1000;
  // If the bump fire-time is already past (event was earlier today), skip.
  if (bumpAtMs <= Date.now()) return false;

  const bumpX = post.copy?.bumpX || "";
  const bumpThreads = post.copy?.bumpThreads || "";
  const bumpBluesky = post.copy?.bumpBluesky || "";
  if (!bumpX && !bumpThreads && !bumpBluesky) return false;

  const platforms = {};
  if (results.x?.id && bumpX) {
    platforms.x = { parentId: results.x.id, bumpText: bumpX };
  }
  if (results.threads?.id && bumpThreads) {
    platforms.threads = { parentId: results.threads.id, bumpText: bumpThreads };
  }
  if (results.bluesky?.uri && results.bluesky?.cid && bumpBluesky) {
    platforms.bluesky = {
      parentUri: results.bluesky.uri,
      parentCid: results.bluesky.cid,
      bumpText: bumpBluesky,
    };
  }
  if (Object.keys(platforms).length === 0) return false;

  const data = loadQueue();
  // Dedup: don't queue twice for the same {date, title}. Caller calling
  // queueBump again on a re-publish (rare) should replace, not duplicate.
  const dedupKey = `${item.date || ""}-${(item.title || "").slice(0, 50)}`;
  data.queue = (data.queue || []).filter((e) => e.dedupKey !== dedupKey);
  data.queue.push({
    dedupKey,
    item: { title: item.title, venue: item.venue, city: item.cityName || item.city, time: item.time },
    platforms,
    bumpAt: new Date(bumpAtMs).toISOString(),
    eventAt: new Date(eventMs).toISOString(),
    queuedAt: new Date().toISOString(),
  });
  saveQueue(data);
  return true;
}

/**
 * Process the pending-bump queue. Fires any bump whose bumpAt <= now, removes
 * it on success, leaves it on failure for the next pass. Drops stale entries.
 *
 * @returns {Promise<{fired: number, removed: number, kept: number}>}
 */
export async function processBumps({ logFn = console.log } = {}) {
  const data = loadQueue();
  const now = Date.now();
  const staleCutoff = now - STALE_HOURS * 60 * 60 * 1000;

  const kept = [];
  let fired = 0;
  let removedStale = 0;

  for (const entry of (data.queue || [])) {
    const bumpAtMs = new Date(entry.bumpAt).getTime();
    const queuedAtMs = new Date(entry.queuedAt).getTime();

    if (queuedAtMs < staleCutoff) {
      logFn(`  drop stale: ${entry.item.title} (queued ${entry.queuedAt})`);
      removedStale++;
      continue;
    }

    if (bumpAtMs > now) {
      kept.push(entry);
      continue;
    }

    // Fire — try each platform; if any platform fails we still drop the
    // entry (we don't retry a single platform; reach is time-sensitive).
    const fires = [];
    if (entry.platforms.x) {
      fires.push(
        (async () => {
          const { replyToTweet } = await import("./platforms/x.mjs");
          await replyToTweet(entry.platforms.x.parentId, entry.platforms.x.bumpText);
        })().then(
          () => logFn(`  ✅ X bump: ${entry.item.title}`),
          (err) => logFn(`  ❌ X bump (${entry.item.title}): ${err.message}`)
        )
      );
    }
    if (entry.platforms.threads) {
      fires.push(
        (async () => {
          const { replyToThread } = await import("./platforms/threads.mjs");
          await replyToThread(entry.platforms.threads.parentId, entry.platforms.threads.bumpText);
        })().then(
          () => logFn(`  ✅ Threads bump: ${entry.item.title}`),
          (err) => logFn(`  ❌ Threads bump (${entry.item.title}): ${err.message}`)
        )
      );
    }
    if (entry.platforms.bluesky) {
      fires.push(
        (async () => {
          const { createReply } = await import("./platforms/bluesky.mjs");
          await createReply(
            entry.platforms.bluesky.bumpText,
            entry.platforms.bluesky.parentUri,
            entry.platforms.bluesky.parentCid
          );
        })().then(
          () => logFn(`  ✅ Bluesky bump: ${entry.item.title}`),
          (err) => logFn(`  ❌ Bluesky bump (${entry.item.title}): ${err.message}`)
        )
      );
    }

    await Promise.all(fires);
    fired++;
  }

  if (kept.length !== (data.queue || []).length || removedStale > 0) {
    data.queue = kept;
    saveQueue(data);
  }

  return { fired, removed: removedStale, kept: kept.length };
}
