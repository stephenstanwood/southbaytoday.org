// ---------------------------------------------------------------------------
// South Bay Signal — X (Twitter) API Client
// OAuth 1.0a HMAC-SHA1 signing, text + media upload
// ---------------------------------------------------------------------------

import { createHmac, randomBytes } from "node:crypto";

const API_BASE = "https://api.twitter.com";
const UPLOAD_BASE = "https://upload.twitter.com";

function percentEncode(str) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function oauthNonce() {
  return randomBytes(16).toString("hex");
}

function oauthTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

function buildSignatureBaseString(method, url, params) {
  const sorted = [...params].sort((a, b) => a[0].localeCompare(b[0]));
  const paramStr = sorted.map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`).join("&");
  return `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramStr)}`;
}

function sign(baseString, consumerSecret, tokenSecret) {
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac("sha1", key).update(baseString).digest("base64");
}

function buildAuthHeader(oauthParams) {
  const parts = oauthParams
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ");
  return `OAuth ${parts}`;
}

function getCredentials() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    throw new Error("Missing X/Twitter credentials in environment");
  }
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

function makeOAuthRequest(method, url, bodyParams = [], creds) {
  const oauthParams = [
    ["oauth_consumer_key", creds.apiKey],
    ["oauth_nonce", oauthNonce()],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", oauthTimestamp()],
    ["oauth_token", creds.accessToken],
    ["oauth_version", "1.0"],
  ];

  const allParams = [...oauthParams, ...bodyParams];
  const baseString = buildSignatureBaseString(method, url, allParams);
  const signature = sign(baseString, creds.apiSecret, creds.accessTokenSecret);
  oauthParams.push(["oauth_signature", signature]);

  return buildAuthHeader(oauthParams);
}

/**
 * Upload media (image) to Twitter.
 * Returns the media_id_string for attaching to a tweet.
 */
export async function uploadMedia(imageBuffer, mimeType = "image/png") {
  const creds = getCredentials();
  const url = `${UPLOAD_BASE}/1.1/media/upload.json`;

  const boundary = `----SBS${randomBytes(8).toString("hex")}`;
  const parts = [];
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n${imageBuffer.toString("base64")}\r\n`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="media_category"\r\n\r\ntweet_image\r\n`);
  parts.push(`--${boundary}--\r\n`);
  const body = parts.join("");

  const authHeader = makeOAuthRequest("POST", url, [], creds);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X media upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.media_id_string;
}

/**
 * Post a tweet with optional media attachment.
 * Uses Twitter API v2.
 */
export async function postTweet(text, mediaId = null) {
  const creds = getCredentials();
  const url = `${API_BASE}/2/tweets`;

  const payload = { text };
  if (mediaId) {
    payload.media = { media_ids: [mediaId] };
  }

  const authHeader = makeOAuthRequest("POST", url, [], creds);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X post failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { id: data.data.id, text: data.data.text };
}

/**
 * Delete a tweet by ID. Throws on any non-2xx response (including 429).
 * Callers that need to pace themselves against the DELETE rate limit
 * (~50/15min/user) should use tryDeletePost() instead.
 */
export async function deletePost(tweetId) {
  const creds = getCredentials();
  const url = `${API_BASE}/2/tweets/${tweetId}`;
  const authHeader = makeOAuthRequest("DELETE", url, [], creds);

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X delete failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { deleted: data.data?.deleted ?? true };
}

/**
 * Rate-limit-aware variant of deletePost. Returns:
 *   { deleted: true }                                  on 200 OK
 *   { deleted: false, rateLimited: true, resetEpoch }  on 429
 *   { deleted: false, error: { status, text } }        on other non-2xx
 *
 * Never throws. Used by bulk-delete callers (nuke-old-posts.mjs) that
 * want to inspect 429 instead of getting an Error.
 */
export async function tryDeletePost(tweetId) {
  const creds = getCredentials();
  const url = `${API_BASE}/2/tweets/${tweetId}`;
  const authHeader = makeOAuthRequest("DELETE", url, [], creds);

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: authHeader },
  });

  if (res.status === 429) {
    const resetHeader = res.headers.get("x-rate-limit-reset");
    const resetEpoch = resetHeader ? Number(resetHeader) : null;
    return { deleted: false, rateLimited: true, resetEpoch };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { deleted: false, error: { status: res.status, text: text.slice(0, 200) } };
  }

  const data = await res.json();
  return { deleted: data.data?.deleted ?? true };
}

/**
 * Returns the authenticated X user's numeric ID.
 */
export async function getMyUserId() {
  const creds = getCredentials();
  const url = `${API_BASE}/2/users/me`;
  const authHeader = makeOAuthRequest("GET", url, [], creds);

  const res = await fetch(url, { headers: { Authorization: authHeader } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X getMyUserId failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.data.id;
}

/**
 * Paginate the authenticated user's tweet timeline. X API v2 caps at
 * ~3,200 most recent tweets total; we page until exhausted or until the
 * caller's onPage hook returns false.
 *
 * Returns [{ id, text, created_at }].
 */
export async function listUserTweets(userId, { maxResults = 100 } = {}) {
  const creds = getCredentials();
  const all = [];
  let paginationToken = null;

  do {
    const queryParams = [
      ["max_results", String(maxResults)],
      ["tweet.fields", "created_at"],
    ];
    if (paginationToken) queryParams.push(["pagination_token", paginationToken]);

    const baseUrl = `${API_BASE}/2/users/${userId}/tweets`;
    // OAuth 1.0a: query params must be in the signature base. Pass them as
    // bodyParams so makeOAuthRequest includes them when signing, then build
    // the fetch URL separately.
    const authHeader = makeOAuthRequest("GET", baseUrl, queryParams, creds);
    const qs = queryParams
      .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
      .join("&");

    const res = await fetch(`${baseUrl}?${qs}`, {
      headers: { Authorization: authHeader },
    });
    if (res.status === 429) {
      const resetHeader = res.headers.get("x-rate-limit-reset");
      const waitMs = resetHeader
        ? Math.max(5000, Number(resetHeader) * 1000 - Date.now() + 5000)
        : 60_000;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 15 * 60_000)));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`X listUserTweets failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    for (const t of data.data || []) all.push(t);
    paginationToken = data.meta?.next_token || null;
    if (paginationToken) await new Promise((r) => setTimeout(r, 300));
  } while (paginationToken);

  return all;
}

/**
 * Full post flow: upload image (if provided) then tweet.
 */
export async function publish(text, imageBuffer = null) {
  let mediaId = null;
  if (imageBuffer) {
    mediaId = await uploadMedia(imageBuffer);
  }
  return postTweet(text, mediaId);
}
