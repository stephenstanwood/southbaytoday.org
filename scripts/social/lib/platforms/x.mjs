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
 * Delete a tweet by ID.
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
 * Full post flow: upload image (if provided) then tweet.
 */
export async function publish(text, imageBuffer = null) {
  let mediaId = null;
  if (imageBuffer) {
    mediaId = await uploadMedia(imageBuffer);
  }
  return postTweet(text, mediaId);
}
