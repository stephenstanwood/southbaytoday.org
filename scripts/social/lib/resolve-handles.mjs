// ---------------------------------------------------------------------------
// Auto-resolve social handles by scraping URLs we already have.
//
// Most venues link X/Instagram/Facebook in their site footer or header. Most
// event pages (Eventbrite, venue calendars) link the venue's social. So
// fetching item.url and pattern-matching the HTML for known social-link
// shapes gives us a deterministic, hallucination-free path to handles.
//
// Bluesky + Mastodon are harder — sites rarely link them. They stay null
// until manually filled or a future tier-2 resolver lands.
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 8000;

const HANDLE_PATTERNS = {
  // Group 1 captures the handle. Anchored against ?, /, ", whitespace, end.
  x: [
    /(?:https?:)?\/\/(?:www\.)?twitter\.com\/(?!intent\b|share\b|home\b|search\b|hashtag\b)([A-Za-z0-9_]{1,15})(?=[/?"#\s]|$)/i,
    /(?:https?:)?\/\/(?:www\.)?x\.com\/(?!intent\b|share\b|home\b|search\b|hashtag\b)([A-Za-z0-9_]{1,15})(?=[/?"#\s]|$)/i,
  ],
  instagram: [
    /(?:https?:)?\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|stories\/|explore\/|accounts\/)([A-Za-z0-9_.]{1,30})(?=[/?"#\s]|$)/i,
  ],
  threads: [
    /(?:https?:)?\/\/(?:www\.)?threads\.(?:net|com)\/@?([A-Za-z0-9_.]{1,30})(?=[/?"#\s]|$)/i,
  ],
  facebook: [
    /(?:https?:)?\/\/(?:www\.)?facebook\.com\/(?!sharer\b|dialog\b|tr\?|plugins\b|events\/|groups\/)((?:pages\/[^/]+\/[0-9]+)|[A-Za-z0-9.-]{1,50})(?=[/?"#\s]|$)/i,
  ],
  bluesky: [
    /(?:https?:)?\/\/(?:www\.)?bsky\.app\/profile\/([A-Za-z0-9.-]+\.(?:bsky\.social|[a-z]{2,}))(?=[/?"#\s]|$)/i,
  ],
  mastodon: [
    // mastodon.social/@user, fosstodon.org/@user, etc. Also the @user@instance form.
    /(?:https?:)?\/\/(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)\/@([A-Za-z0-9_]{1,30})(?=[/?"#\s]|$)/i,
  ],
};

// Hosts that aren't actually Mastodon (the regex above is too generous on
// the @-username pattern alone). Allow-list the well-known instances.
const KNOWN_MASTODON_HOSTS = new Set([
  "mastodon.social",
  "mastodon.online",
  "mas.to",
  "fosstodon.org",
  "hachyderm.io",
  "social.lol",
  "indieweb.social",
  "ravenation.club",
  "techhub.social",
  "infosec.exchange",
]);

function cleanHandle(raw) {
  if (!raw) return null;
  return raw.trim().replace(/[/?#"\s].*$/, "").replace(/^@/, "") || null;
}

/**
 * Run all platform regexes against a string of HTML/text and return the
 * first match per platform. Returns { x, instagram, threads, facebook,
 * bluesky, mastodon } — values are handle strings (no leading @) or null.
 */
export function extractHandlesFromText(text) {
  if (!text || typeof text !== "string") {
    return { x: null, instagram: null, threads: null, facebook: null, bluesky: null, mastodon: null };
  }
  const out = { x: null, instagram: null, threads: null, facebook: null, bluesky: null, mastodon: null };

  for (const [platform, patterns] of Object.entries(HANDLE_PATTERNS)) {
    if (platform === "mastodon") continue; // handled below
    for (const re of patterns) {
      const match = text.match(re);
      if (match) {
        const cleaned = cleanHandle(match[1]);
        if (cleaned) {
          out[platform] = cleaned;
          break;
        }
      }
    }
  }

  // Mastodon: only accept matches on known instance hosts (the regex pattern
  // is too broad on its own — `/@user` appears in many unrelated paths).
  for (const re of HANDLE_PATTERNS.mastodon) {
    const all = text.matchAll(new RegExp(re.source, "gi"));
    for (const m of all) {
      const host = (m[1] || "").toLowerCase();
      const user = cleanHandle(m[2]);
      if (host && user && KNOWN_MASTODON_HOSTS.has(host)) {
        out.mastodon = `${user}@${host}`;
        break;
      }
    }
    if (out.mastodon) break;
  }

  return out;
}

async function fetchHtml(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SouthBayToday/1.0; +https://southbaytoday.org)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 5_000_000) return null; // safety cap
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a URL and extract any social handles from the HTML. Returns null on
 * fetch error so the caller can fall through to other sources.
 */
export async function resolveHandlesFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const html = await fetchHtml(url);
  if (!html) return null;
  const handles = extractHandlesFromText(html);
  // Treat all-null as "found nothing useful" so callers can try the next URL.
  const anyFound = Object.values(handles).some((v) => v);
  return anyFound ? { handles, source: url } : null;
}

/**
 * Try a list of candidate URLs in order; return the FIRST one that yields
 * any handles. Lets callers fall through (event url → venue url → ...).
 */
export async function resolveHandlesFromUrls(urls) {
  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const result = await resolveHandlesFromUrl(url);
    if (result) return result;
  }
  return null;
}
