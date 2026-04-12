// ---------------------------------------------------------------------------
// South Bay Today — Social Handle Lookup
// Matches event items to known social handles for @mentioning
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HANDLES_FILE = join(__dirname, "..", "..", "..", "src", "data", "south-bay", "social-handles.json");

let _cache = null;

function loadHandles() {
  if (_cache) return _cache;
  try {
    const raw = JSON.parse(readFileSync(HANDLES_FILE, "utf8"));
    // Build a flat lookup: lowercase key → handle object
    const lookup = new Map();
    for (const section of ["venues", "orgs"]) {
      if (!raw[section]) continue;
      for (const [name, handles] of Object.entries(raw[section])) {
        lookup.set(name.toLowerCase(), handles);
      }
    }
    _cache = lookup;
    return lookup;
  } catch {
    return new Map();
  }
}

/**
 * Fuzzy-match a string against known venue/org names.
 * Returns the best match's handle object, or null.
 */
function findMatch(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  const lookup = loadHandles();

  // Exact match
  if (lookup.has(lower)) return lookup.get(lower);

  // Substring match — venue name contained in text or vice versa
  for (const [key, handles] of lookup) {
    if (lower.includes(key) || key.includes(lower)) {
      return handles;
    }
  }

  return null;
}

/**
 * Look up social handles for an event item.
 * Checks venue name and title against the handle database.
 *
 * @param {object} item - Event item with venue, title, etc.
 * @returns {{ handles: object|null, matchedName: string|null }}
 */
export function lookupHandles(item) {
  // Try venue first (most specific)
  const venueMatch = findMatch(item.venue);
  if (venueMatch) {
    return { handles: venueMatch, matchedName: item.venue };
  }

  // Try title (catches "San Jose Sharks vs ..." etc.)
  const titleMatch = findMatch(item.title);
  if (titleMatch) {
    return { handles: titleMatch, matchedName: item.title };
  }

  return { handles: null, matchedName: null };
}

/**
 * Get the @mention string for a specific platform.
 * Returns null if no handle exists for that platform.
 *
 * @param {object} handles - Handle object from lookupHandles
 * @param {string} platform - "x" | "instagram" | "threads" | "bluesky" | "facebook" | "mastodon"
 * @returns {string|null} The @mention string (e.g., "@sjbarracuda")
 */
export function mentionFor(handles, platform) {
  if (!handles || !handles[platform]) return null;

  const handle = handles[platform];

  // Bluesky uses full handle format
  if (platform === "bluesky") {
    return `@${handle}`;
  }

  // Mastodon uses @user@instance format (already stored that way)
  if (platform === "mastodon") {
    return handle.includes("@") ? `@${handle}` : `@${handle}`;
  }

  // X, Instagram, Threads, Facebook — just @handle
  return `@${handle}`;
}

/**
 * Build a mentions summary for the copy-gen prompt.
 * Returns a string like "Tag @sjbarracuda on X/Threads/Instagram" or empty string.
 *
 * @param {object} item - Event item
 * @returns {string} Mention instructions for the LLM prompt, or ""
 */
export function mentionInstructions(item) {
  const { handles, matchedName } = lookupHandles(item);
  if (!handles) return "";

  const platformMentions = [];
  const platforms = ["x", "threads", "bluesky", "instagram", "facebook"];

  for (const p of platforms) {
    const mention = mentionFor(handles, p);
    if (mention) {
      platformMentions.push({ platform: p, mention });
    }
  }

  if (platformMentions.length === 0) return "";

  // Group by mention text (many will share the same handle)
  const byMention = new Map();
  for (const { platform, mention } of platformMentions) {
    if (!byMention.has(mention)) byMention.set(mention, []);
    byMention.get(mention).push(platform);
  }

  const lines = [];
  for (const [mention, platforms] of byMention) {
    lines.push(`- ${mention} on ${platforms.join(", ")}`);
  }

  return `\nTAGGING — if it fits naturally, @mention the venue/org in your copy. Use the correct handle for each platform:\n${lines.join("\n")}\nDon't force it — only tag if the mention reads naturally in the sentence. Skip tagging on platforms where no handle is listed.`;
}
