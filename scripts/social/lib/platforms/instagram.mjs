// ---------------------------------------------------------------------------
// South Bay Today — Instagram (Meta Graph API) Client
// Container-based publishing: create container → wait → publish
// Same pattern as Threads but uses graph.instagram.com endpoints
// ---------------------------------------------------------------------------

const GRAPH_API = "https://graph.instagram.com/v25.0";

function getCredentials() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;
  if (!accessToken || !userId) {
    throw new Error("Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID in environment");
  }
  return { accessToken, userId };
}

/**
 * Create an image media container.
 * Instagram requires an image for every post — no text-only.
 * image_url must be a publicly accessible JPEG URL.
 */
async function createImageContainer(caption, imageUrl) {
  const { accessToken, userId } = getCredentials();

  const params = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_API}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram container creation failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Check container status until FINISHED or error.
 * Instagram containers can take a few seconds to process.
 */
async function waitForContainer(containerId, maxWait = 60000) {
  const { accessToken } = getCredentials();
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const res = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    if (!res.ok) break;
    const data = await res.json();
    if (data.status_code === "FINISHED") return true;
    if (data.status_code === "ERROR") {
      throw new Error(`Instagram container error: ${JSON.stringify(data)}`);
    }
    // IN_PROGRESS — wait and retry
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Instagram container timed out");
}

/**
 * Publish a prepared container.
 */
async function publishContainer(containerId) {
  const { accessToken, userId } = getCredentials();

  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_API}/${userId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram publish failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { id: data.id };
}

/**
 * Delete a post by ID.
 */
export async function deletePost(postId) {
  const { accessToken } = getCredentials();

  const res = await fetch(
    `${GRAPH_API}/${postId}?access_token=${accessToken}`,
    { method: "DELETE" }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram delete failed (${res.status}): ${body}`);
  }

  return { deleted: true };
}

/**
 * Full post flow: create image container → wait → publish.
 *
 * Instagram REQUIRES an image — text-only posts are not supported.
 * imageUrl must be a publicly accessible JPEG URL.
 * If no imageUrl is provided, the post is skipped.
 */
export async function publish(caption, imageUrl = null) {
  if (!imageUrl) {
    throw new Error("Instagram requires an image URL for every post — cannot publish text-only");
  }

  const containerId = await createImageContainer(caption, imageUrl);
  await waitForContainer(containerId);
  return publishContainer(containerId);
}
