// ---------------------------------------------------------------------------
// South Bay Today — Mastodon Client
// OAuth Bearer token + REST API for posting, images, and link cards
// ---------------------------------------------------------------------------

const MASTODON_INSTANCE = process.env.MASTODON_INSTANCE || "https://mastodon.social";
const API = `${MASTODON_INSTANCE}/api/v1`;

function getToken() {
  const token = process.env.MASTODON_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing MASTODON_ACCESS_TOKEN in environment");
  }
  return token;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
  };
}

/**
 * Upload an image to Mastodon.
 * Returns the media attachment object (with id for attaching to statuses).
 */
export async function uploadImage(imageBuffer, mimeType = "image/png", altText = "") {
  const form = new FormData();
  form.append("file", new Blob([imageBuffer], { type: mimeType }), "image.png");
  if (altText) form.append("description", altText);

  const res = await fetch(`${API}/media`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mastodon media upload failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Create a status (post) on Mastodon.
 */
export async function createPost(text, mediaIds = []) {
  const body = { status: text };
  if (mediaIds.length > 0) body.media_ids = mediaIds;

  const res = await fetch(`${API}/statuses`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mastodon post failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { id: data.id, url: data.url };
}

/**
 * Delete a status by ID.
 */
export async function deletePost(id) {
  const res = await fetch(`${API}/statuses/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mastodon delete failed (${res.status}): ${text}`);
  }

  return { deleted: true };
}

/**
 * Full post flow: upload image (if provided) then post.
 * Uses the same copy as Bluesky (similar char limit, hashtag-friendly).
 */
export async function publish(text, imageBuffer = null, imageAlt = "") {
  const mediaIds = [];
  if (imageBuffer) {
    const media = await uploadImage(imageBuffer, "image/png", imageAlt);
    mediaIds.push(media.id);
  }
  return createPost(text, mediaIds);
}
