// ---------------------------------------------------------------------------
// South Bay Today — Reddit Client
// OAuth2 password-grant for the southbaytoday script app.
// We only consume Reddit (no auto-publishing) — this module exists to monitor
// the account's inbox: comment replies, post replies, username mentions, PMs.
// ---------------------------------------------------------------------------

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API = "https://oauth.reddit.com";

let _token = null;
let _tokenExpiresAt = 0;

function userAgent() {
  return (
    process.env.REDDIT_USER_AGENT ||
    "node:org.southbaytoday.signal:0.1.0 (by /u/southbaytoday)"
  );
}

function requireCreds() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const user = process.env.REDDIT_USERNAME;
  const pass = process.env.REDDIT_PASSWORD;
  if (!id || !secret || !user || !pass) return null;
  return { id, secret, user, pass };
}

export function hasCredentials() {
  return Boolean(requireCreds());
}

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiresAt - 60_000) return _token;
  const creds = requireCreds();
  if (!creds) throw new Error("Missing Reddit credentials");

  const body = new URLSearchParams({
    grant_type: "password",
    username: creds.user,
    password: creds.pass,
  });

  const basic = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent(),
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reddit auth failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error(`Reddit auth: no access_token in response`);
  _token = data.access_token;
  _tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return _token;
}

async function apiGet(path, params = {}) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(params).toString();
  const url = `${API}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent(),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reddit GET ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Fetch inbox items (comment replies, post replies, mentions, PMs).
 * Reddit returns up to 100 per page, newest first. We page until we hit the
 * cutoff timestamp or run out.
 */
export async function fetchInbox({ cutoffMs, limitPages = 5 } = {}) {
  const out = [];
  let after = null;
  for (let page = 0; page < limitPages; page++) {
    const params = { limit: "100", ...(after ? { after } : {}) };
    const data = await apiGet("/message/inbox", params);
    const children = data?.data?.children || [];
    for (const c of children) {
      const item = c?.data;
      if (!item) continue;
      const tsMs = (item.created_utc || 0) * 1000;
      if (cutoffMs && tsMs < cutoffMs) {
        return out; // sorted newest-first; older items follow — we're done
      }
      out.push({ kind: c.kind, ...item });
    }
    after = data?.data?.after || null;
    if (!after) break;
  }
  return out;
}

/**
 * Build a permalink URL for an inbox item.
 *  - comments / mentions / replies: use `context` if present, else `permalink`
 *  - PMs: link to /message/messages/<short_id>
 */
export function permalinkFor(item) {
  if (item.was_comment === false) {
    // PM — Reddit's `name` is `t4_<id>`. /message/messages/<id> is the usual URL.
    const id = (item.name || "").replace(/^t4_/, "");
    return `https://www.reddit.com/message/messages/${id}`;
  }
  const path = item.context || item.permalink || "";
  if (!path) return "https://www.reddit.com/";
  if (path.startsWith("http")) return path;
  return `https://www.reddit.com${path}`;
}

/**
 * Map Reddit's `type` field (when present) or fall back to inference.
 * Possible values from Reddit:
 *   - "comment_reply"      — someone replied to one of our comments
 *   - "post_reply"         — someone replied to one of our submissions
 *   - "username_mention"   — someone tagged /u/southbaytoday
 *   - undefined            — PM (kind === "t4")
 */
export function classifyKind(item) {
  if (item.type) return item.type;
  if (item.kind === "t4" || item.was_comment === false) return "message";
  if (item.was_comment) return "comment_reply";
  return "unknown";
}
