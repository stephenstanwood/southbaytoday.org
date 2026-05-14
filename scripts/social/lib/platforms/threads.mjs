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

// ---------------------------------------------------------------------------
// Carousel publishing (up to 10 images per post).
// Day-plan posts use this to surface every bucket as its own swipeable slide
// — the algorithm rewards multi-image dwell time, and 6-bucket day plans are
// a natural fit. See scripts/social/lib/carousel-images.mjs for slide
// preparation (Places-photo hydration + Blob hosting).
// ---------------------------------------------------------------------------

/**
 * Create a single carousel-item container. Returns the container ID for use
 * as a child of a CAROUSEL container.
 */
async function createCarouselItemContainer(imageUrl) {
  const { accessToken, userId } = getCredentials();

  const params = new URLSearchParams({
    media_type: "IMAGE",
    is_carousel_item: "true",
    image_url: imageUrl,
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_API}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Threads carousel item failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Create the parent CAROUSEL container. `text` is the post body; `children`
 * is an array of carousel-item container IDs (2-10).
 */
async function createCarouselContainer(text, children) {
  const { accessToken, userId } = getCredentials();

  const params = new URLSearchParams({
    media_type: "CAROUSEL",
    children: children.join(","),
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
    throw new Error(`Threads carousel container failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Publish a carousel post.
 *
 * @param {string} text - Post body (≤500 chars).
 * @param {Array<{url: string}>} slides - 2-10 image URLs. Each must be a
 *   publicly-fetchable URL (Threads pulls the image server-side).
 * @returns {Promise<{id: string}>}
 */
export async function publishCarousel(text, slides) {
  if (!Array.isArray(slides) || slides.length < 2) {
    throw new Error(`Threads carousel needs 2+ slides, got ${slides?.length || 0}`);
  }
  if (slides.length > 10) {
    throw new Error(`Threads carousel max is 10, got ${slides.length}`);
  }

  // Create item containers in parallel — independent calls, ~3-6 at a time
  // typical. If any one fails, abandon the carousel: a half-carousel reads
  // as worse than a single-image fallback.
  const itemIds = await Promise.all(
    slides.map((s) => createCarouselItemContainer(s.url))
  );

  // Item containers don't need waitForContainer here — the parent CAROUSEL
  // container's FINISHED status implies all children are ready.
  const carouselId = await createCarouselContainer(text, itemIds);
  await waitForContainer(carouselId, 60000); // carousel takes longer to assemble
  return publishContainer(carouselId);
}

/**
 * Reply to an existing thread. Used by the link-suppression workaround:
 * publish the main thread link-free, then after a delay reply with the URL.
 * Threads aggressively demotes outbound links in the parent post; replies
 * are scored separately.
 */
export async function replyToThread(parentThreadId, text) {
  const { accessToken, userId } = getCredentials();

  // Create a TEXT container with reply_to_id
  const params = new URLSearchParams({
    media_type: "TEXT",
    text,
    reply_to_id: parentThreadId,
    access_token: accessToken,
  });

  const containerRes = await fetch(`${GRAPH_API}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!containerRes.ok) {
    const body = await containerRes.text();
    throw new Error(`Threads reply container failed (${containerRes.status}): ${body}`);
  }
  const containerData = await containerRes.json();
  const containerId = containerData.id;

  await waitForContainer(containerId);
  return publishContainer(containerId);
}
