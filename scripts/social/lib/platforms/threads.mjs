// ---------------------------------------------------------------------------
// South Bay Signal — Threads (Meta Graph API) Client
// Container-based publishing: create container → wait → publish
// ---------------------------------------------------------------------------

const GRAPH_API = "https://graph.threads.net/v1.0";

function getCredentials() {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!accessToken || !userId) {
    throw new Error("Missing THREADS_ACCESS_TOKEN or THREADS_USER_ID in environment");
  }
  return { accessToken, userId };
}

/**
 * Create a text-only media container.
 */
async function createTextContainer(text) {
  const { accessToken, userId } = getCredentials();

  const params = new URLSearchParams({
    media_type: "TEXT",
    text,
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_API}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Threads container creation failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Create an image media container.
 * The image must be hosted at a public URL.
 */
async function createImageContainer(text, imageUrl) {
  const { accessToken, userId } = getCredentials();

  const params = new URLSearchParams({
    media_type: "IMAGE",
    image_url: imageUrl,
    text,
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_API}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Threads image container failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Check container status until FINISHED or error.
 */
async function waitForContainer(containerId, maxWait = 30000) {
  const { accessToken } = getCredentials();
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const res = await fetch(
      `${GRAPH_API}/${containerId}?fields=status&access_token=${accessToken}`
    );
    if (!res.ok) break;
    const data = await res.json();
    if (data.status === "FINISHED") return true;
    if (data.status === "ERROR") throw new Error(`Threads container error: ${JSON.stringify(data)}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Threads container timed out");
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

  const res = await fetch(`${GRAPH_API}/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Threads publish failed (${res.status}): ${body}`);
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
    throw new Error(`Threads delete failed (${res.status}): ${body}`);
  }

  return { deleted: true };
}

/**
 * Full post flow: create container → wait → publish.
 * For image posts, imageUrl must be a publicly accessible URL.
 * (We'll host card images temporarily or use a public URL.)
 */
export async function publish(text, imageUrl = null) {
  let containerId;
  if (imageUrl) {
    containerId = await createImageContainer(text, imageUrl);
  } else {
    containerId = await createTextContainer(text);
  }
  await waitForContainer(containerId);
  return publishContainer(containerId);
}
