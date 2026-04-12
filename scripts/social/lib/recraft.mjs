// ---------------------------------------------------------------------------
// South Bay Today — Recraft V4 API Client + Vercel Blob Upload
// Generates poster images via Recraft, hosts on Vercel Blob for public URLs
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECRAFT_API = "https://external.api.recraft.ai/v1";

function loadEnv() {
  if (process.env.RECRAFT_API_KEY) return;
  try {
    const envPath = join(__dirname, "..", "..", "..", ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

/**
 * Generate an image via Recraft V4.
 * Returns the raw image buffer + Recraft CDN URL (expires in ~24hrs).
 *
 * @param {object} opts
 * @param {string} opts.prompt - Full image generation prompt
 * @param {string} [opts.size="4:5"] - Aspect ratio or dimensions
 * @param {Array<{rgb: number[]}>} [opts.colors] - Preferred color palette
 * @param {string} [opts.model="recraftv4"] - Model to use
 * @returns {Promise<{buffer: Buffer, recraftUrl: string}>}
 */
export async function generateRecraftImage({ prompt, size = "4:5", colors, model = "recraftv4" }) {
  loadEnv();
  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey) throw new Error("Missing RECRAFT_API_KEY in environment");

  const body = { model, prompt, size, n: 1 };
  if (colors) body.controls = { colors };

  const res = await fetch(`${RECRAFT_API}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Recraft API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const recraftUrl = data.data?.[0]?.url;
  if (!recraftUrl) throw new Error("No image URL in Recraft response");

  // Download the image before it expires
  const imgRes = await fetch(recraftUrl);
  if (!imgRes.ok) throw new Error(`Failed to download Recraft image: ${imgRes.status}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  return { buffer, recraftUrl };
}

/**
 * Upload an image buffer to Vercel Blob for permanent public hosting.
 *
 * @param {Buffer} buffer - Image data
 * @param {string} pathname - Blob path (e.g. "posters/2026-04-13-day-plan.png")
 * @returns {Promise<string>} Public URL
 */
export async function uploadToBlob(buffer, pathname) {
  loadEnv();

  // Dynamic import to avoid requiring @vercel/blob when not needed
  const { put } = await import("@vercel/blob");

  const result = await put(pathname, buffer, {
    access: "public",
    contentType: "image/png",
    allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return result.url;
}

/**
 * Generate a Recraft poster and upload to Vercel Blob.
 * Returns the permanent public URL.
 *
 * @param {object} opts
 * @param {string} opts.prompt - Full Recraft prompt
 * @param {string} opts.pathname - Blob path for the image
 * @param {Array<{rgb: number[]}>} [opts.colors] - Color palette
 * @param {string} [opts.model] - Recraft model
 * @returns {Promise<{url: string, buffer: Buffer}>}
 */
export async function generateAndUpload({ prompt, pathname, colors, model }) {
  const { buffer } = await generateRecraftImage({ prompt, colors, model });
  const url = await uploadToBlob(buffer, pathname);
  return { url, buffer };
}

// CLI test mode
if (process.argv[1]?.endsWith("recraft.mjs") && process.argv.includes("--test")) {
  loadEnv();
  console.log("Testing Recraft → Blob pipeline...");

  const testPrompt = `A bold, colorful Instagram poster for a local community day plan. Festival poster aesthetic with modern typography. Rainbow horizontal color block stripes. Portrait 4:5 ratio.

"SATURDAY IN THE SOUTH BAY"
Campbell + Santa Clara + San Jose

9 AM — Los Gatos Cafe Uptown
Proper breakfast and good coffee

11 AM — Triton Museum of Art
Free galleries and sculpture garden

1:30 PM — State of Illusion Exhibition
Optical illusions at Santa Clara University

3:30 PM — San Pedro Square Market
Tacos, banh mi, ramen — graze your way through

7 PM — Comedy at San Jose Improv
Live comedy, doors at 6:30

southbaytoday.org

Style: clean modern graphic design poster, NOT a photograph. Bold sans-serif typography. Playful confetti dots and stars. Joyful festival lineup poster feel.`;

  try {
    console.log("  Generating Recraft image...");
    const { buffer, recraftUrl } = await generateRecraftImage({ prompt: testPrompt });
    console.log(`  ✅ Recraft: ${recraftUrl.slice(0, 80)}... (${buffer.length} bytes)`);

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      console.log("  Uploading to Vercel Blob...");
      const url = await uploadToBlob(buffer, `posters/test-${Date.now()}.png`);
      console.log(`  ✅ Blob: ${url}`);
    } else {
      console.log("  ⏭️  No BLOB_READ_WRITE_TOKEN — skipping Blob upload");
    }

    console.log("\n✅ Pipeline test passed!");
  } catch (err) {
    console.error(`\n❌ Test failed: ${err.message}`);
    process.exit(1);
  }
}
