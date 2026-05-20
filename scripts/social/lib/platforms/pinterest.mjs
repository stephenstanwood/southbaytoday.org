// ---------------------------------------------------------------------------
// South Bay Today — Pinterest API v5 Client
//
// Pinterest is fundamentally different from algorithmic feeds: it's a visual
// search engine with a ~6-month tail per pin (vs hours on Facebook). Every
// pin should target a specific search ("free things to do in San Jose with
// kids") via its title and description. Outbound links don't get suppressed
// — they're the whole point.
//
// Auth: OAuth 2.0. Access token expires every 30 days; refresh token every
// 365. Auto-refresh runs separately via refresh-pinterest-token.mjs.
// ---------------------------------------------------------------------------

const API_BASE = "https://api.pinterest.com/v5";

function getCredentials() {
  const accessToken = process.env.PINTEREST_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Missing PINTEREST_ACCESS_TOKEN in environment");
  }
  return { accessToken };
}

/**
 * GET request to the Pinterest API with bearer auth.
 */
async function get(path) {
  const { accessToken } = getCredentials();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pinterest GET ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * POST/PATCH/DELETE with JSON body.
 */
async function send(method, path, body = null) {
  const { accessToken } = getCredentials();
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== null) init.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest ${method} ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return method === "DELETE" ? { deleted: true } : res.json();
}

/**
 * List all boards on the authenticated account. Paginated; we walk all pages.
 * Returns [{ id, name, description, privacy }].
 */
export async function listBoards() {
  const boards = [];
  let bookmark = null;
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (bookmark) qs.set("bookmark", bookmark);
    const data = await get(`/boards?${qs}`);
    for (const b of data.items || []) boards.push(b);
    bookmark = data.bookmark || null;
  } while (bookmark);
  return boards;
}

/**
 * Find a board by exact-match name, or create one if missing. Idempotent —
 * safe to call from the daily cron without duplicating boards.
 */
export async function findOrCreateBoard(name, description = "") {
  const all = await listBoards();
  const match = all.find((b) => b.name === name);
  if (match) return match;
  return send("POST", "/boards", { name, description, privacy: "PUBLIC" });
}

/**
 * Create a pin.
 *
 * @param {object} opts
 * @param {string} opts.boardId    Board to pin to.
 * @param {string} opts.title      ≤100 chars. Search-keyword optimized.
 * @param {string} opts.description ≤800 chars. Add context, end with hashtags if useful.
 * @param {string} opts.link       Destination URL (clickable; Pinterest is link-friendly).
 * @param {Buffer} opts.imageBuffer Image bytes (recommended 2:3 portrait, e.g. 1000×1500).
 * @param {string} [opts.altText]  Accessibility + signal to Pinterest's image classifier.
 * @param {string} [opts.contentType] MIME (default image/png).
 * @returns {Promise<{id: string, ...}>}
 */
export async function createPin({ boardId, title, description, link, imageBuffer, altText = "", contentType = "image/png" }) {
  if (!boardId) throw new Error("createPin: boardId required");
  if (!title) throw new Error("createPin: title required");
  if (!imageBuffer) throw new Error("createPin: imageBuffer required");

  const payload = {
    board_id: boardId,
    title: title.slice(0, 100),
    description: (description || "").slice(0, 800),
    media_source: {
      source_type: "image_base64",
      content_type: contentType,
      data: imageBuffer.toString("base64"),
    },
  };
  if (link) payload.link = link;
  if (altText) payload.alt_text = altText.slice(0, 500);

  return send("POST", "/pins", payload);
}

/**
 * Delete a pin by ID. Used by the nightly purge for symmetry — though
 * Pinterest's 6-month-tail content model means we probably want to KEEP old
 * pins, not delete them. Wire into purge cautiously.
 */
export async function deletePin(pinId) {
  return send("DELETE", `/pins/${pinId}`);
}

/**
 * Convenience publish — finds/creates the named board, then pins.
 */
export async function publish({ boardName, boardDescription, title, description, link, imageBuffer, altText, contentType }) {
  const board = await findOrCreateBoard(boardName, boardDescription || `South Bay Today — ${boardName}`);
  return createPin({
    boardId: board.id,
    title,
    description,
    link,
    imageBuffer,
    altText,
    contentType,
  });
}
