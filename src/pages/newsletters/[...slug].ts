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

/** "2026-09-22" → "Tuesday, September 22, 2026" (the email's own header format). */
function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Archive chrome ──
// The stored issue HTML is the email exactly as sent and is never edited.
// Around it we add a slim site bar (brand + way back to the archive) and a
// one-line footer. Class names are `sbt-archive-` prefixed so nothing can
// collide with the email's inline-styled markup, and the bar follows the
// email's own dark-mode switch so it never sits light-on-dark.
const ARCHIVE_STYLE = `
<style>
  .sbt-archive-bar, .sbt-archive-foot {
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .sbt-archive-bar {
    max-width: 620px;
    margin: 0 auto;
    padding: 14px 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .sbt-archive-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    color: #13072F;
    text-decoration: none;
  }
  .sbt-archive-brand img {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 2px 8px rgba(19, 7, 47, 0.14);
    display: block;
  }
  .sbt-archive-word {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 18px;
    font-weight: 900;
    letter-spacing: -0.01em;
    line-height: 1;
  }
  .sbt-archive-word i {
    font-weight: 400;
    font-size: 14px;
    margin-right: 3px;
  }
  .sbt-archive-nav {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sbt-archive-nav a {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    color: #2a1f47;
    font-size: 13px;
    font-weight: 650;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }
  .sbt-archive-nav a:hover {
    background: rgba(19, 7, 47, 0.06);
    color: #13072F;
  }
  .sbt-archive-nav .sbt-archive-sub {
    border: 1.5px solid #13072F;
    background: #13072F;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .sbt-archive-nav .sbt-archive-sub:hover {
    background: #2a1a57;
    color: #fff;
  }
  .sbt-archive-foot {
    max-width: 620px;
    margin: 0 auto;
    padding: 22px 0 36px;
    text-align: center;
    font-size: 13px;
    color: #5f5870;
  }
  .sbt-archive-foot a {
    color: #2a1f47;
    font-weight: 650;
    text-decoration: none;
  }
  .sbt-archive-foot a:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .sbt-archive-foot span {
    margin: 0 8px;
    opacity: 0.5;
  }
  .sbt-archive-bar a:focus-visible,
  .sbt-archive-foot a:focus-visible {
    outline: 2px solid rgba(135, 56, 245, 0.75);
    outline-offset: 2px;
  }
  @media (max-width: 660px) {
    .sbt-archive-bar { padding: 10px 14px; }
    .sbt-archive-foot { padding: 20px 16px 32px; }
  }
  /* Phones: the badge alone is the home link; the email's own header right
     below carries the name. */
  @media (max-width: 480px) {
    .sbt-archive-word { display: none; }
    .sbt-archive-nav a { padding: 0 11px; }
  }
  @media (prefers-color-scheme: dark) {
    .sbt-archive-brand, .sbt-archive-nav a, .sbt-archive-foot a { color: #ececf3; }
    .sbt-archive-nav a:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
    .sbt-archive-nav .sbt-archive-sub { border-color: #ececf3; background: #ececf3; color: #16161f; }
    .sbt-archive-nav .sbt-archive-sub:hover { background: #fff; color: #16161f; }
    .sbt-archive-foot { color: #aeb6c6; }
    .sbt-archive-brand img { border-color: #2e2e40; }
  }
</style>`;

const ARCHIVE_BAR = `
<header class="sbt-archive-bar">
  <a class="sbt-archive-brand" href="/" aria-label="The South Bay Today home">
    <img src="/images/sbt-avatar-172.png" alt="" width="32" height="32">
    <span class="sbt-archive-word"><i>the</i>South Bay Today</span>
  </a>
  <nav class="sbt-archive-nav" aria-label="Newsletter archive">
    <a href="/newsletters">← All issues</a>
    <a class="sbt-archive-sub" href="/newsletters#subscribe">Subscribe</a>
  </nav>
</header>`;

const ARCHIVE_FOOT = `
<footer class="sbt-archive-foot">
  <a href="/newsletters">← Back to the archive</a><span aria-hidden="true">·</span><a href="/">southbaytoday.org</a>
</footer>`;

function archiveMetaHtml(date: string, body: string): string {
  const pretty = longDate(date);
  const title = `South Bay Today — ${pretty}`;
  const description = `The South Bay Today newsletter for ${pretty}: the day's plan, what's new, and what city hall did.`;
  const canonical = `${SITE_URL}/newsletters/${date}`;

  // Newer issues already carry a full, issue-specific head (lede as the
  // description, poster as og:image). Only fill what's missing so we never
  // stack a second, blander og:title or description on top of theirs.
  const headMatch = body.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/i);
  const existingHead = headMatch ? headMatch[1] : "";
  const has = (re: RegExp) => re.test(existingHead);
  const tags: string[] = [];
  if (!has(/<meta[^>]+name=["']description["']/i)) tags.push(`<meta name="description" content="${esc(description)}">`);
  if (!has(/<meta[^>]+property=["']og:title["']/i)) tags.push(`<meta property="og:title" content="${esc(title)}">`);
  if (!has(/<meta[^>]+property=["']og:description["']/i)) tags.push(`<meta property="og:description" content="${esc(description)}">`);
  if (!has(/<meta[^>]+property=["']og:url["']/i)) tags.push(`<meta property="og:url" content="${esc(canonical)}">`);
  if (!has(/<meta[^>]+property=["']og:site_name["']/i)) tags.push(`<meta property="og:site_name" content="South Bay Today">`);
  if (!has(/<meta[^>]+property=["']og:type["']/i)) tags.push(`<meta property="og:type" content="article">`);
  if (!has(/<meta[^>]+name=["']twitter:title["']/i)) tags.push(`<meta name="twitter:title" content="${esc(title)}">`);
  if (!has(/<link[^>]+rel=["']canonical["']/i)) tags.push(`<link rel="canonical" href="${esc(canonical)}">`);
  tags.push(
    `<meta name="theme-color" content="#f7f6fb">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`,
    `<link rel="stylesheet" href="/fonts/fonts.css">`,
  );
  const headAdditions = `\n${tags.join("\n")}${ARCHIVE_STYLE}\n`;

  if (/<\/head>/i.test(body) && /<body[^>]*>/i.test(body)) {
    let html = body.replace(/<\/head>/i, `${headAdditions}</head>`);
    html = html.replace(/<body[^>]*>/i, (open) => `${open}${ARCHIVE_BAR}`);
    html = /<\/body>/i.test(html)
      ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${ARCHIVE_FOOT}\n</body>`)
      : `${html}${ARCHIVE_FOOT}`;
    return html;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${headAdditions}
</head>
<body style="margin:0;background:#f7f6fb;">${ARCHIVE_BAR}${body}${ARCHIVE_FOOT}</body>
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
