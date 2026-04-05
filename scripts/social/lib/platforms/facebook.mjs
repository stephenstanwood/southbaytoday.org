// ---------------------------------------------------------------------------
// South Bay Signal — Facebook Page API Client
// Posts to the SBS Facebook Page via Graph API
// ---------------------------------------------------------------------------

const GRAPH_API = "https://graph.facebook.com/v25.0";

function getCredentials() {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;
  if (!accessToken || !pageId) {
    throw new Error("Missing FB_PAGE_ACCESS_TOKEN or FB_PAGE_ID in environment");
  }
  return { accessToken, pageId };
}

/**
 * Post a text message with a link to the Facebook Page.
 * If the text contains a URL, Facebook will auto-generate a link preview.
 */
export async function publish(text, imageBuffer = null) {
  const { accessToken, pageId } = getCredentials();

  if (imageBuffer) {
    return publishWithImage(text, imageBuffer);
  }

  const params = new URLSearchParams({
    message: text,
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_API}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook post failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { id: data.id };
}

/**
 * Post with an image attachment.
 * Uses multipart form data to upload the image directly.
 */
async function publishWithImage(text, imageBuffer) {
  const { accessToken, pageId } = getCredentials();

  const formData = new FormData();
  formData.append("message", text);
  formData.append("access_token", accessToken);
  formData.append(
    "source",
    new Blob([imageBuffer], { type: "image/png" }),
    "card.png"
  );

  const res = await fetch(`${GRAPH_API}/${pageId}/photos`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook photo post failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { id: data.id };
}
