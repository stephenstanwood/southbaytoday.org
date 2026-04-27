export const prerender = false;

// ---------------------------------------------------------------------------
// GET /plan/:id — shareable day plan preview page
// ---------------------------------------------------------------------------
// Renders a self-contained HTML page with OG tags and plan cards.
// Reads from the in-memory plan store via internal API.
// ---------------------------------------------------------------------------

import type { APIRoute } from "astro";
import { canonicalizeSharedPlan } from "../../lib/south-bay/canonicalizeCard.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function esc(s: unknown): string {
  if (s === undefined || s === null) return "";
  const str = typeof s === "string" ? s : String(s);
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍽️", outdoor: "🌿", museum: "🏛️", entertainment: "🎭",
  wellness: "💆", shopping: "🛍️", arts: "🎨", events: "📅",
  sports: "⚾", neighborhood: "🏘️",
};

function loadSharedPlans(): Record<string, any> {
  try {
    const path = join(process.cwd(), "src/data/south-bay/shared-plans.json");
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch { return {}; }
}

export const GET: APIRoute = async ({ params, url }) => {
  const id = params.id;
  if (!id) return new Response("Not found", { status: 404 });

  const origin = url.origin;
  const debug = url.searchParams.get("debug") === "1";

  // Read plan from shared-plans.json (committed to git, deployed with the site).
  // canonicalizeSharedPlan returns null for unsalvageable plans (no id, no
  // renderable cards) so we redirect home instead of 500ing on thin data.
  const plans = loadSharedPlans();
  const plan = canonicalizeSharedPlan(plans[id]);
  if (!plan) {
    return Response.redirect(`${origin}/`, 302);
  }

  const canonical = `${origin}/plan/${id}`;

  // OG image: use first card's Google Places photo if available, else default
  const firstPhotoRef = plan.cards?.find((c: any) => c.photoRef)?.photoRef;
  const ogImage = firstPhotoRef
    ? `${origin}/api/place-photo?ref=${encodeURIComponent(firstPhotoRef)}&w=1200&h=630`
    : `${origin}/images/og-image.png`;

  // Only filter past cards if the plan is for today — future plans show everything
  const todayPT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const planTargetDate = plan.planDate || plan.createdAt?.slice(0, 10) || todayPT;
  const isPlanForToday = planTargetDate <= todayPT;

  let activeCards: any[];
  if (isPlanForToday) {
    const nowPT = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", hour12: false });
    const [nowH, nowM] = nowPT.split(":").map(Number);
    const nowMinutes = nowH * 60 + (nowM || 0);

    function parseEndMinutes(timeBlock: string): number | null {
      const parts = timeBlock.split(/\s*-\s*/);
      if (parts.length < 2) return null;
      const m = parts[1].match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!m) return null;
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
      if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
      return h * 60 + min;
    }

    activeCards = plan.cards.filter((c: any) => {
      const endMin = parseEndMinutes(c.timeBlock);
      if (endMin === null) return true;
      return endMin > nowMinutes;
    });
  } else {
    // Future plan — show all cards
    activeCards = plan.cards;
  }

  // Sort chronologically (API should do this but belt-and-suspenders)
  activeCards.sort((a: any, b: any) => {
    const parseH = (tb: string) => {
      const m = tb.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!m) return 99;
      let h = parseInt(m[1], 10);
      if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
      if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
      return h;
    };
    return parseH(a.timeBlock) - parseH(b.timeBlock);
  });

  // If all cards are past, redirect to homepage with the city pre-selected
  if (activeCards.length === 0) {
    return Response.redirect(`${origin}/?city=${plan.city}`, 302);
  }

  // Determine if some cards were filtered
  const filteredCount = plan.cards.length - activeCards.length;
  const timeNote = filteredCount > 0
    ? `<div style="text-align:center;font-size:12px;color:#bbb;margin-bottom:12px;font-style:italic">Showing ${activeCards.length} upcoming stops${filteredCount > 0 ? ` (${filteredCount} earlier stops already passed)` : ""}</div>`
    : "";

  // Format date for the title — use the plan's target date, not when it was created
  const planDateObj = new Date(planTargetDate + "T12:00:00");
  const dateStr = planDateObj.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const title = `${dateStr} — South Bay Today`;
  const cardNames = activeCards.map((c: any) => c.name).slice(0, 4).join(", ");
  const description = activeCards.length > 4
    ? `${cardNames}, and more`
    : cardNames;

  // Build card HTML
  const cardsHtml = activeCards.map((card: any) => {
    const emoji = CATEGORY_EMOJI[card.category] || "📍";
    const photoHtml = card.photoRef
      ? `<img src="${esc(origin)}/api/place-photo?ref=${encodeURIComponent(card.photoRef)}&w=200&h=200" alt="${esc(card.name)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;flex-shrink:0">`
      : `<div style="width:72px;height:72px;border-radius:8px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">${emoji}</div>`;
    const eventBadge = card.source === "event"
      ? `<span style="font-size:8px;font-weight:800;color:#fff;background:#E63946;padding:1px 5px;border-radius:3px;letter-spacing:0.5px">EVENT</span>`
      : "";
    const costBadge = card.costNote || card.cost
      ? `<span style="display:inline-block;margin-top:5px;font-size:10px;font-weight:700;color:#999;background:#f5f5f5;padding:2px 8px;border-radius:4px">${esc(card.costNote || card.cost)}</span>`
      : "";

    // Link: events → event URL or maps, places → maps or URL
    const cardUrl = card.source === "event"
      ? (card.url || card.mapsUrl)
      : (card.mapsUrl || card.url);
    // Emit end-minutes so the live-tick script can hide the card once its
    // end time has passed without a reload. Null ("All day", single-time
    // blocks) → no data-end, card stays.
    const endMin = (function () {
      const parts = String(card.timeBlock || "").split(/\s*-\s*/);
      if (parts.length < 2) return null;
      const m = parts[1].match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!m) return null;
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
      if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
      return h * 60 + min;
    })();
    const endAttr = endMin !== null ? ` data-end="${endMin}"` : "";
    const linkOpen = cardUrl
      ? `<a class="sbt-card"${endAttr} href="${esc(cardUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;gap:12px;padding:14px 16px;background:#fff;border-radius:10px;border:1px solid #e8e8e8;margin-bottom:8px;text-decoration:none;color:inherit;transition:box-shadow 0.15s,opacity 0.25s" onmouseover="this.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">`
      : `<div class="sbt-card"${endAttr} style="display:flex;gap:12px;padding:14px 16px;background:#fff;border-radius:10px;border:1px solid #e8e8e8;margin-bottom:8px;transition:opacity 0.25s">`;
    const linkClose = cardUrl ? `</a>` : `</div>`;

    return `
      ${linkOpen}
        ${photoHtml}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            <span style="font-size:12px;font-weight:800;color:#000;letter-spacing:-0.2px">${esc(card.timeBlock)}</span>
            ${card.source === "event" && card.category === "events" ? "" : `<span style="font-size:9px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:1px">${esc(card.category)}</span>`}
            ${eventBadge}
          </div>
          <h3 style="font-size:17px;font-weight:900;color:#111;margin:0 0 4px;line-height:1.25">${esc(card.name)}</h3>
          ${card.venue ? `<div style="font-size:11px;color:#999;margin-bottom:4px">📍 ${esc(card.venue)}</div>` : ""}
          <p style="font-size:13px;color:#555;margin:0 0 4px;line-height:1.45">${esc(card.blurb)}</p>
          <p style="font-size:12px;font-weight:600;color:#FF6B35;margin:0;line-height:1.35;font-style:italic">${esc(card.why)}</p>
          ${costBadge}
          ${debug && card.rationale ? `<div style="margin-top:8px;padding:6px 8px;background:#f3f4f6;border-left:3px solid #6366f1;font-size:10px;color:#4b5563;font-family:monospace;letter-spacing:0.2px">🔍 ${esc(card.rationale)}</div>` : ""}
        </div>
      ${linkClose}`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="South Bay Today">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700;900&family=Inter:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --sb-bg: #FAF9F6; --sb-ink: #1A1A1A; --sb-muted: #555; --sb-light: #888;
    --sb-border: #C8C4BC;
    --sb-serif: 'Playfair Display', Georgia, serif;
    --sb-sans: 'Inter', system-ui, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--sb-sans); background: var(--sb-bg); color: var(--sb-ink); padding: 0 0 80px; }
  .sb-header { padding: 24px 24px 12px; text-align: center; }
  .sb-header-inner { max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 4px; position: relative; }
  .sb-brand { text-decoration: none; color: var(--sb-ink); display: flex; flex-direction: column; align-items: center; }
  .sb-logo { display: inline-block; user-select: none; }
  .sb-logo-main-row { display: flex; align-items: baseline; gap: 6px; }
  .sb-logo-the { font-family: var(--sb-serif); font-weight: 400; font-style: italic; font-size: 18px; }
  .sb-logo-south-bay { font-family: var(--sb-serif); font-weight: 900; font-size: 40px; line-height: 1; letter-spacing: -0.01em; }
  .sb-logo-signal-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  .sb-logo-signal-rule { flex: 1; height: 1px; background: var(--sb-ink); opacity: 0.35; }
  .sb-logo-signal-word { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.4em; text-transform: uppercase; }
  .sb-date-line { font-size: 12px; color: var(--sb-muted); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 4px; }
  .sb-slogan { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sb-light); margin-top: 6px; }
  .sb-social-links { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
  @media (min-width: 640px) { .sb-social-links { position: absolute; top: 8px; right: 0; margin-top: 0; } }
  .sb-social-icon { color: var(--sb-light); display: flex; align-items: center; transition: color 0.15s; }
  .sb-social-icon:hover { color: var(--sb-ink); }
  .sb-nav { border-top: 1px solid var(--sb-border); border-bottom: 1px solid var(--sb-border); padding: 0 24px; }
  .sb-nav-inner { max-width: 960px; margin: 0 auto; display: flex; justify-content: flex-start; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  @media (min-width: 860px) { .sb-nav-inner { justify-content: center; } }
  .sb-nav-inner::-webkit-scrollbar { display: none; }
  .sb-tab { padding: 10px 14px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sb-muted); text-decoration: none; white-space: nowrap; border: none; background: none; }
  .sb-tab:hover { color: var(--sb-ink); }
  .container { max-width: 640px; margin: 0 auto; padding: 24px 16px 0; }
  .plan-meta-row { font-size: 13px; color: #888; text-align: center; margin: 8px 0 24px; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 28px; border-radius: 24px; border: 2.5px solid #000; background: linear-gradient(135deg, #FF6B35, #E63946, #7B2FBE, #1A5AFF, #06D6A0, #FF3CAC); background-size: 200% 200%; animation: rainbow 3s ease infinite; color: #fff; font-size: 14px; font-weight: 900; text-decoration: none; text-transform: uppercase; letter-spacing: 1px; }
  @keyframes rainbow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
  .footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #e8e8e8; }
  .footer p { font-size: 12px; color: #bbb; }
</style>
</head>
<body>
<header class="sb-header">
  <div class="sb-header-inner">
    <a href="${esc(origin)}/" class="sb-brand" aria-label="South Bay Today home">
      <span class="sb-logo">
        <span class="sb-logo-main-row"><span class="sb-logo-the">the</span><span class="sb-logo-south-bay">South Bay</span></span>
        <span class="sb-logo-signal-row"><span class="sb-logo-signal-rule"></span><span class="sb-logo-signal-word">Today</span><span class="sb-logo-signal-rule"></span></span>
      </span>
    </a>
    <div class="sb-date-line">${esc(dateStr)}</div>
    <div class="sb-slogan">All local. Good vibes. No ads.</div>
    <div class="sb-social-links">
      <a href="https://x.com/southbaytoday" target="_blank" rel="noopener" aria-label="Follow on X" class="sb-social-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
      <a href="https://bsky.app/profile/southbaytoday.bsky.social" target="_blank" rel="noopener" aria-label="Follow on Bluesky" class="sb-social-icon"><svg viewBox="0 0 568 501" fill="currentColor" width="16" height="16"><path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.89-129.52 80.986-149.071-65.72 11.186-139.6-7.295-159.875-79.748C10.945 203.659 1 75.291 1 57.946 1-28.906 76.135-1.612 123.121 33.664z"/></svg></a>
      <a href="https://www.threads.net/@southbaytoday" target="_blank" rel="noopener" aria-label="Follow on Threads" class="sb-social-icon"><svg viewBox="0 0 192 192" fill="currentColor" width="16" height="16"><path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05a115.6 115.6 0 0 0-24.478-2.858c-28.007-1.607-46.005 15.011-47.216 38.578-.644 12.533 4.729 24.311 15.12 33.166 8.778 7.476 20.099 11.267 31.853 10.67 15.495-.787 27.603-7.456 35.993-19.826 6.387-9.418 10.354-21.472 11.924-36.3 7.155 4.318 12.465 10.04 15.411 17.073 5.017 11.96 5.312 31.586-10.652 47.553-13.98 13.98-30.815 20.048-56.158 20.265-28.12-.241-49.353-9.259-63.072-26.79C16.942 147.523 9.843 121.705 9.6 91.987c.243-29.718 7.342-55.536 21.101-76.725C44.42 -2.014 65.653-10.772 93.773-11.013c28.334.245 49.858 9.078 63.98 26.253 6.858 8.348 11.977 18.661 15.352 30.766l16.152-4.321c-3.944-14.132-9.916-26.243-17.94-36.254C154.617-14.588 128.85-25.777 93.727-26.047l-.063.001c-35.087.271-61.167 11.457-77.513 33.232C1.673 27.126-5.924 56.762-6.2 91.94v.103c.276 35.178 7.873 64.817 22.56 88.086 16.349 25.893 42.429 37.079 77.513 37.35l.063-.001c29.262-.243 49.742-8.024 66.422-24.707 22.003-22.007 21.348-49.591 14.04-66.993-5.242-12.494-15.077-22.591-28.36-29.79zm-49.427 61.071c-13.005.662-26.535-5.137-27.185-17.789-.482-9.396 6.68-19.87 31.246-18.462 2.742.157 5.384.4 7.922.72a91.476 91.476 0 0 1 3.859.582c-2.679 23.576-15.844 34.949-15.844 34.949z" transform="translate(2 2)"/></svg></a>
      <a href="https://www.facebook.com/1057203394142664" target="_blank" rel="noopener" aria-label="Follow on Facebook" class="sb-social-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>
      <a href="https://www.instagram.com/thesouthbaytoday/" target="_blank" rel="noopener" aria-label="Follow on Instagram" class="sb-social-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg></a>
      <a href="https://mastodon.social/@southbaytoday" target="_blank" rel="noopener me" aria-label="Follow on Mastodon" class="sb-social-icon"><svg viewBox="0 0 74 79" fill="currentColor" width="16" height="16"><path d="M73.7 17.7c-1.1-8.3-8.4-14.8-17-16.1C53.5.8 48 0 37.9 0h-.1C27.7 0 25 .8 21.8 1.6 12.5 2.8 4.8 8.1 2.9 16.5c-.9 4.1-1 8.7-.9 12.9.2 6 .3 12 .8 18 .4 4 1 7.9 2 11.8 1.8 7.2 8.9 13.2 15.9 15.6 7.5 2.5 15.6 3 23.3 1.2.8-.2 1.7-.4 2.5-.7 1.9-.6 4.1-1.3 5.7-2.4V65c-4.8 1.1-9.8 1.6-14.7 1.4-8.5-.3-11.6-4-12.2-5.7-.5-1.5-.7-3-.9-4.6 4.7 1.1 9.6 1.7 14.5 1.6l1.6-.1c5.4-.1 11.2-.6 16.4-2.1 2.5-.7 10.5-3.4 11.6-17.8 0-.6.1-5.9.1-6.4 0-2 .6-13.9-.2-21.2zM61.4 51.7H53.2V31.1c0-5.4-2.3-8.2-6.8-8.2-5 0-7.5 3.3-7.5 9.8v11.4H31V32.7c0-6.5-2.5-9.8-7.5-9.8-4.5 0-6.8 2.8-6.8 8.2v20.6H8.8V30.2c0-5.4 1.4-9.8 4.2-13C15.8 13.9 19.4 12.6 23.7 12.6c5 0 8.8 1.9 11.3 5.8l2.4 4.1 2.4-4.1c2.5-3.9 6.3-5.8 11.3-5.8 4.3 0 7.9 1.3 10.7 4.6 2.8 3.2 4.2 7.6 4.2 13v21.5h-.6z"/></svg></a>
    </div>
  </div>
</header>
<nav class="sb-nav">
  <div class="sb-nav-inner">
    <a class="sb-tab" href="${esc(origin)}/#overview">Today</a>
    <a class="sb-tab" href="${esc(origin)}/#events">Events</a>
    <a class="sb-tab" href="${esc(origin)}/#camps">Camps</a>
    <a class="sb-tab" href="${esc(origin)}/#government">Gov</a>
    <a class="sb-tab" href="${esc(origin)}/#technology">Tech</a>
    <a class="sb-tab" href="${esc(origin)}/#food">Food</a>
  </div>
</nav>
<div class="container" data-plan-date="${esc(planTargetDate)}">
  <div class="plan-meta-row">
    ${plan.weather ? `🌤 ${esc(plan.weather)} · ` : ""}<span class="sbt-stop-count">${plan.cards.length}</span> stops${plan.kids ? " · Family-friendly" : ""}
  </div>
  ${timeNote}
  <div class="sbt-cards">${cardsHtml}</div>
  <div class="sbt-all-done" style="display:none;text-align:center;padding:32px 16px 8px;color:#888;font-size:14px">That's a wrap — every stop on this plan has passed.</div>
  <div class="footer">
    <a href="${esc(origin)}/?city=${esc(plan.city)}" class="cta">Build Your Own Day →</a>
    <p style="margin-top:16px">Powered by <a href="${esc(origin)}/" style="color:#888">southbaytoday.org</a></p>
  </div>
</div>
<script>
(function(){
  var container = document.querySelector('.container');
  if (!container) return;
  var planDate = container.getAttribute('data-plan-date') || '';
  function todayPT(){
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }
  function nowMinPT(){
    var s = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false });
    var p = s.split(':');
    return (parseInt(p[0],10) || 0) * 60 + (parseInt(p[1],10) || 0);
  }
  function tick(){
    var today = todayPT();
    // Future plan — leave everything alone.
    if (planDate > today) return;
    var cards = container.querySelectorAll('.sbt-card');
    var visible = 0;
    if (planDate < today) {
      // Stale plan from a past day — every stop is behind us.
      cards.forEach(function(el){
        if (el.style.display !== 'none') {
          el.style.opacity = '0';
          setTimeout(function(){ el.style.display = 'none'; }, 250);
        }
      });
    } else {
      var now = nowMinPT();
      cards.forEach(function(el){
        var end = parseInt(el.getAttribute('data-end') || '', 10);
        if (!isNaN(end) && end <= now) {
          if (el.style.display !== 'none') {
            el.style.opacity = '0';
            setTimeout(function(){ el.style.display = 'none'; }, 250);
          }
        } else {
          visible++;
        }
      });
    }
    var count = container.querySelector('.sbt-stop-count');
    if (count) count.textContent = String(visible);
    var done = container.querySelector('.sbt-all-done');
    if (done) done.style.display = (cards.length > 0 && visible === 0) ? 'block' : 'none';
  }
  tick();
  setInterval(tick, 30000);
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
