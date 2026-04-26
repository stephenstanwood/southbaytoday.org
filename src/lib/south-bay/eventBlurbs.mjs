// ---------------------------------------------------------------------------
// eventBlurbs — shared ingest-time blurb resolver for events.
//
// Parallel to eventImages.mjs: run once at ingest (generate-events.mjs) so
// every event gets a stable 1-sentence "what to do here today" blurb that
// survives across regens and shuffles. Replaces the per-shuffle Claude
// improvisation that drifted toward "Swing by X and see what's going on".
//
// Flow:
//   Tier 1: Event already has a blurb (cache hit carried in the event obj).
//   Tier 2: Persistent cache hit (event-blurb-cache.json keyed by URL or
//           fingerprint). Free.
//   Tier 3: Haiku batch generation — 30 events per call, ~$0.05 per full
//           ~530-event regen. Behind RESOLVE_EVENT_BLURBS=1 env flag so
//           local dev runs don't burn Haiku credits.
//
// Output field: event.blurb (1 sentence, planner voice — matches the tone
// rules already in plan-day.ts so card-level consumers can use it directly).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const CACHE_PATH = join(REPO_ROOT, "src", "data", "south-bay", "event-blurb-cache.json");

const MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 30;
const MAX_TOKENS = 1500;

// ---------------------------------------------------------------------------
// Persistent cache
// ---------------------------------------------------------------------------

function loadCache() {
  if (!existsSync(CACHE_PATH)) return { byKey: {}, generatedAt: null };
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return { byKey: {}, generatedAt: null };
  }
}

function saveCache(cache) {
  cache.generatedAt = new Date().toISOString();
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function cacheKey(event) {
  // Title + venue fingerprint — stable across date variants of the same
  // recurring event, AND distinct between different events that happen to
  // share a URL (e.g. all MLS Earthquakes home games shared
  // sjearthquakes.com/schedule, which used to map every game to whichever
  // game's blurb got cached first — every team showed the same opponent).
  return `fp:${norm(event.title)}|${norm(event.venue)}`;
}

/** Migrate legacy `url:<URL>` cache entries.
 *  Where exactly one current event uses a given URL, copy its blurb to the
 *  new fingerprint key — preserves work. Where multiple events share the
 *  URL, drop the cached blurb (it was wrong for all but one of them). */
function migrateUrlKeys(cache, currentEvents) {
  const eventsByUrl = new Map();
  for (const e of currentEvents) {
    if (!e.url) continue;
    if (!eventsByUrl.has(e.url)) eventsByUrl.set(e.url, []);
    eventsByUrl.get(e.url).push(e);
  }
  let migrated = 0, dropped = 0;
  for (const oldKey of Object.keys(cache.byKey)) {
    if (!oldKey.startsWith("url:")) continue;
    const url = oldKey.slice(4);
    const matches = eventsByUrl.get(url) || [];
    if (matches.length === 1) {
      const newKey = cacheKey(matches[0]);
      if (!cache.byKey[newKey]) cache.byKey[newKey] = cache.byKey[oldKey];
      delete cache.byKey[oldKey];
      migrated++;
    } else {
      delete cache.byKey[oldKey];
      dropped++;
    }
  }
  if (migrated || dropped) {
    console.log(`[eventBlurbs] cache migration: ${migrated} migrated, ${dropped} dropped (URL collisions)`);
  }
}

// ---------------------------------------------------------------------------
// Haiku batch generation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You write one-sentence blurbs for local events in a South Bay day-planner app (South Bay Today).

Each blurb describes what someone would actually DO at the event — catch the talk, browse the exhibit, watch the match, taste the samples, meet the author. Plural "you" voice, like a friend texting a plan.

Strict rules:
- Exactly one sentence, 10–20 words.
- Describe what happens THERE (specific action, not generic "swing by").
- If a description is given, rewrite its substance in planner voice — don't copy marketing prose.
- NEVER say: "real event", "only today", "one-time", "unforgettable", "anchor event", "right now".
- NEVER mention distance, travel time, "near", "nearby", "close to", "minutes from".
- NEVER mention star ratings or review scores.
- Do not hedge ("might", "perhaps"). Recommend confidently.
- Do not use em dashes in every sentence — vary sentence structure.
- No hype. No exclamation points.`;

function buildUserPrompt(events) {
  const lines = events.map((e, i) => {
    const parts = [`${i + 1}. ${e.title || "Untitled"}`];
    if (e.category) parts.push(`cat: ${e.category}`);
    if (e.venue) parts.push(`venue: ${e.venue}`);
    if (e.city) parts.push(`city: ${e.city}`);
    if (e.ongoing) parts.push(`ongoing-exhibit`);
    if (e.description) {
      const d = String(e.description).replace(/\s+/g, " ").trim().slice(0, 280);
      if (d) parts.push(`desc: ${d}`);
    }
    return parts.join(" | ");
  });

  // Indexed objects so we can match blurbs to events even if the model returns
  // them out of order or drops one — we previously trusted positional order
  // and ended up with cross-event blurb swaps (a flower-drawing class got the
  // chronic-pain blurb, etc.).
  return `Write one blurb per event. Return a JSON array where each object has the event's index ("i") and its "blurb". No markdown fences, no commentary.

Events:
${lines.join("\n")}

Output format (one object per event, index matches the number above):
[{"i": 1, "blurb": "..."}, {"i": 2, "blurb": "..."}]`;
}

/** Parse a blurb response. Returns an array of length `expectedLen` where
 *  index k holds the blurb for event k (or null if missing/invalid). Robust
 *  to out-of-order arrays and missing entries. */
function parseBlurbArray(raw, expectedLen) {
  let cleaned = String(raw || "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let arr;
  try { arr = JSON.parse(cleaned); } catch { return null; }
  if (!Array.isArray(arr)) return null;

  const out = new Array(expectedLen).fill(null);

  // New shape: array of {i, blurb} objects
  if (arr.length > 0 && typeof arr[0] === "object" && arr[0] !== null && "blurb" in arr[0]) {
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const idx = Number(item.i);
      if (!Number.isInteger(idx) || idx < 1 || idx > expectedLen) continue;
      const b = typeof item.blurb === "string" ? item.blurb.trim() : null;
      if (b) out[idx - 1] = b;
    }
    const got = out.filter(Boolean).length;
    if (got !== expectedLen) {
      console.warn(`[eventBlurbs] batch returned ${got}/${expectedLen} indexed blurbs`);
    }
    return out;
  }

  // Legacy shape: array of strings — fall back to positional assignment.
  for (let i = 0; i < expectedLen; i++) {
    const v = arr[i];
    if (typeof v === "string" && v.trim()) out[i] = v.trim();
  }
  if (arr.length !== expectedLen) {
    console.warn(`[eventBlurbs] batch length mismatch: expected ${expectedLen}, got ${arr.length}`);
  }
  return out;
}

async function haikuBatch(client, events) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(events) }],
  });
  const text = response.content?.[0]?.text ?? "";
  const parsed = parseBlurbArray(text, events.length);
  if (!parsed) {
    console.warn(`[eventBlurbs] parse fail (batch of ${events.length}). raw: ${text.slice(0, 200)}`);
    return new Array(events.length).fill(null);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Public API: resolveEventBlurbs
// ---------------------------------------------------------------------------

/**
 * Resolve blurbs for a batch of events in place. Each event that lands a
 * blurb gets `event.blurb` set.
 *
 * Options:
 *   - enabled:   override the env flag (default: RESOLVE_EVENT_BLURBS === "1")
 *   - batchSize: events per Haiku call (default 30)
 *   - dryRun:    don't mutate events or write cache; return stats only.
 */
export async function resolveEventBlurbs(events, opts = {}) {
  const enabled = opts.enabled ?? (process.env.RESOLVE_EVENT_BLURBS === "1");
  const dryRun = !!opts.dryRun;
  const batchSize = opts.batchSize ?? BATCH_SIZE;

  const stats = {
    total: events.length,
    preexisting: 0,
    cache_hits: 0,
    generated: 0,
    failed: 0,
    skipped: 0,
  };

  const cache = loadCache();
  migrateUrlKeys(cache, events);

  // --- Pass 1: apply preexisting + cache hits ------------------------------
  const todo = [];
  for (const e of events) {
    if (e.blurb && String(e.blurb).trim()) {
      stats.preexisting++;
      continue;
    }
    const key = cacheKey(e);
    const hit = cache.byKey[key];
    if (hit?.blurb) {
      if (!dryRun) e.blurb = hit.blurb;
      stats.cache_hits++;
      continue;
    }
    todo.push({ event: e, key });
  }

  if (todo.length === 0) return stats;

  // --- Pass 2: generate (gated by env flag + API key) ----------------------
  if (!enabled) {
    stats.skipped = todo.length;
    return stats;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[eventBlurbs] ANTHROPIC_API_KEY not set — skipping generation");
    stats.skipped = todo.length;
    return stats;
  }
  const client = new Anthropic({ apiKey });

  for (let start = 0; start < todo.length; start += batchSize) {
    const batch = todo.slice(start, start + batchSize);
    if (dryRun) { stats.skipped += batch.length; continue; }
    try {
      const blurbs = await haikuBatch(client, batch.map((b) => b.event));
      for (let i = 0; i < batch.length; i++) {
        const blurb = blurbs[i];
        if (blurb && blurb.length > 0) {
          batch[i].event.blurb = blurb;
          cache.byKey[batch[i].key] = { blurb, generatedAt: new Date().toISOString() };
          stats.generated++;
        } else {
          stats.failed++;
        }
      }
      // Periodic save so a crash mid-run doesn't cost everything.
      if ((start / batchSize) % 5 === 4) saveCache(cache);
    } catch (err) {
      console.warn(`[eventBlurbs] batch failed (${start}-${start + batch.length}): ${err.message}`);
      stats.failed += batch.length;
    }
  }

  if (!dryRun) saveCache(cache);
  return stats;
}
