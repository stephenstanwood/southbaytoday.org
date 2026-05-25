export const prerender = false;

import type { APIRoute } from "astro";
import { head } from "@vercel/blob";

const FALLBACK_BLOB_BASE_URL = "https://x92cgaghviaolmmg.public.blob.vercel-storage.com";
const SITE_URL = "https://southbaytoday.org";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function dateFromSlug(slug: string | undefined): string | null {
  const clean = String(slug || "").replace(/\.html$/i, "");
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

function fallbackBlobUrl(pathname: string): string {
  const base = (import.meta.env.BLOB_PUBLIC_BASE_URL || FALLBACK_BLOB_BASE_URL).replace(/\/+$/, "");
  return `${base}/${pathname}`;
}

function archiveMetaHtml(date: string, body: string): string {
  const title = `South Bay Today - ${date}`;
  const canonical = `${SITE_URL}/newsletters/${date}`;
  const image = `${SITE_URL}/images/og-image.png`;
  const meta = `
<meta name="description" content="${esc(title)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="South Bay Today">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${esc(canonical)}">`;

  if (/<\/head>/i.test(body)) {
    return body.replace(/<\/head>/i, `${meta}\n</head>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${meta}
</head>
<body>${body}</body>
</html>`;
}

export const GET: APIRoute = async ({ params }) => {
  const date = dateFromSlug(params.slug);
  if (!date) return new Response("Not found", { status: 404 });

  const pathname = `newsletters/${date}.html`;
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  let archiveUrl = fallbackBlobUrl(pathname);

  if (token) {
    try {
      archiveUrl = (await head(pathname, { token })).url;
    } catch {
      // Fall back to the public blob URL; old archives are public and stable.
    }
  }

  const res = await fetch(archiveUrl, {
    headers: { Accept: "text/html" },
  });
  if (!res.ok) return new Response("Not found", { status: 404 });

  const html = archiveMetaHtml(date, await res.text());
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
    },
  });
};
