// ---------------------------------------------------------------------------
// South Bay Signal — Bluesky (AT Protocol) Client
// Session auth + rich text with link facets + image blob upload
// ---------------------------------------------------------------------------

const BSKY_API = "https://bsky.social/xrpc";

let _session = null;

function getCredentials() {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) {
    throw new Error("Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD in environment");
  }
  return { handle, password };
}

async function createSession() {
  if (_session) return _session;
  const { handle, password } = getCredentials();

  const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bluesky auth failed (${res.status}): ${text}`);
  }

  _session = await res.json();
  return _session;
}

/**
 * Parse text for URLs and create link facets for rich text.
 */
function detectFacets(text) {
  const facets = [];
  const urlRegex = /https?:\/\/[^\s)]+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    const byteStart = Buffer.byteLength(text.slice(0, match.index), "utf8");
    const byteEnd = byteStart + Buffer.byteLength(url, "utf8");
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
    });
  }
  return facets;
}

/**
 * Upload an image blob to Bluesky.
 * Returns the blob reference for embedding.
 */
export async function uploadImage(imageBuffer, mimeType = "image/png") {
  const session = await createSession();

  const res = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      "Content-Type": mimeType,
    },
    body: imageBuffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bluesky image upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.blob;
}

/**
 * Create a post on Bluesky with optional image embed.
 */
export async function createPost(text, imageBlob = null, imageAlt = "") {
  const session = await createSession();
  const facets = detectFacets(text);

  const record = {
    $type: "app.bsky.feed.post",
    text,
    facets,
    createdAt: new Date().toISOString(),
  };

  if (imageBlob) {
    record.embed = {
      $type: "app.bsky.embed.images",
      images: [{ alt: imageAlt, image: imageBlob }],
    };
  }

  const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bluesky post failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { uri: data.uri, cid: data.cid };
}

/**
 * Full post flow: upload image (if provided) then post.
 */
export async function publish(text, imageBuffer = null, imageAlt = "") {
  let blob = null;
  if (imageBuffer) {
    blob = await uploadImage(imageBuffer);
  }
  return createPost(text, blob, imageAlt);
}
