export const prerender = false;

// ---------------------------------------------------------------------------
// GET /plan/:id — shareable day plan preview page
// ---------------------------------------------------------------------------
// Renders a self-contained HTML page with OG tags and plan cards. Reads from
// shared-plans.json (committed + deployed with the site).
//
// Two render modes:
//   1. Bucket plans (new format, 2026-05-07+) — six idea sparks in a 2×3 grid.
//      No time-of-day hiding; the plan is a brainstorm, not a tour.
//   2. Legacy timeline plans — clock-range timeBlocks. Renders as a vertical
//      list with past-card hiding so an old link from yesterday gracefully
//      falls off as the day progresses.
// ---------------------------------------------------------------------------

import type { APIRoute } from "astro";
import { canonicalizeSharedPlan } from "../../lib/south-bay/canonicalizeCard.mjs";
import { BUCKET_ORDER, BUCKET_LABELS } from "../../lib/south-bay/buckets";
import { CITIES } from "../../lib/south-bay/cities";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CITY_LABELS: Record<string, string> = Object.fromEntries(CITIES.map((c) => [c.id, c.name]));
function cityLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  return CITY_LABELS[slug] || slug.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ");
}

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

// Accent dot color rotation, one per slot. Same palette as the homepage.
const ACCENT_COLORS = ["#FF6B35", "#E63946", "#06D6A0", "#7B2FBE", "#1A5AFF", "#FF3CAC"];

function loadSharedPlans(): Record<string, any> {
  try {
    const path = join(process.cwd(), "src/data/south-bay/shared-plans.json");
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch { return {}; }
}

function buildCardInner(card: any, origin: string, accent: string): string {
  const emoji = CATEGORY_EMOJI[card.category] || "📍";
  // Google Places photoRefs expire (~30 days) and then /api/place-photo 404s.
  // Render the emoji tile underneath the photo and lay the <img> over it; if the
  // photo fails to load, onerror hides it and the emoji shows through — no broken
  // image glyph (the React Events tab degrades the same way via onError).
  const photoHtml = card.photoRef
    ? `<div style="position:relative;width:72px;height:72px;border-radius:8px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;overflow:hidden">${emoji}<img src="${esc(origin)}/api/place-photo?ref=${encodeURIComponent(card.photoRef)}&w=200&h=200" alt="${esc(card.name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'"></div>`
    : `<div style="width:72px;height:72px;border-radius:8px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">${emoji}</div>`;
  const eventBadge = card.source === "event"
    ? `<span style="font-size:8px;font-weight:800;color:#fff;background:#E63946;padding:1px 5px;border-radius:3px;letter-spacing:0.5px">EVENT</span>`
    : "";
  const costBadge = card.costNote || card.cost
    ? `<span style="display:inline-block;margin-top:5px;font-size:10px;font-weight:700;color:#999;background:#f5f5f5;padding:2px 8px;border-radius:4px">${esc(card.costNote || card.cost)}</span>`
    : "";
  // Time hint: bucket cards show eventTime if it's a fixed-time event;
  // legacy cards show the timeBlock clock range.
  const timeHint = card.bucket
    ? (card.eventTime ? esc(card.eventTime) : "")
    : esc(card.timeBlock);
  void accent; // accent is rendered by the parent (slot header)
  const cityName = cityLabel(card.city);
  const showCategory = !(card.source === "event" && card.category === "events");
  const showVenue = card.source === "event" && card.venue && card.venue !== card.name;
  return `
    ${photoHtml}
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
        ${timeHint ? `<span style="font-size:12px;font-weight:800;color:#000;letter-spacing:-0.2px">${timeHint}</span>` : ""}
        ${showCategory ? `<span style="font-size:9px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:1px">${esc(card.category)}</span>` : ""}
        ${cityName ? `<span style="font-size:9px;color:#ddd;font-weight:700">·</span><span style="font-size:9px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:1px">${esc(cityName)}</span>` : ""}
        ${eventBadge}
      </div>
      <h3 style="font-size:17px;font-weight:900;color:#111;margin:0 0 4px;line-height:1.25">${esc(card.name)}</h3>
      ${showVenue ? `<div style="font-size:11px;color:#999;margin-bottom:4px">📍 ${esc(card.venue)}</div>` : ""}
      <p style="font-size:13px;color:#555;margin:0 0 4px;line-height:1.45">${esc(card.blurb)}</p>
      ${costBadge}
    </div>`;
}

export const GET: APIRoute = async ({ params, url }) => {
  const id = params.id;
  if (!id) return new Response("Not found", { status: 404 });

  const origin = url.origin;
  const debug = url.searchParams.get("debug") === "1";

  const plans = loadSharedPlans();
  const plan = canonicalizeSharedPlan(plans[id]);
  if (!plan) {
    return Response.redirect(`${origin}/`, 302);
  }

  const canonical = `${origin}/plan/${id}`;
  const firstPhotoRef = plan.cards?.find((c: any) => c.photoRef)?.photoRef;
  const ogImage = firstPhotoRef
    ? `${origin}/api/place-photo?ref=${encodeURIComponent(firstPhotoRef)}&w=1200&h=630`
    : `${origin}/images/og-image.png`;

  // Detect bucket vs. legacy. Bucket plans have at least one card with a
  // bucket field — those render as a 2×3 grid, no past-time hiding.
  const isBucketPlan = plan.cards.some((c: any) => typeof c.bucket === "string" && c.bucket);

  const todayPT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const planTargetDate = plan.planDate || plan.createdAt?.slice(0, 10) || todayPT;
  const planDateObj = new Date(planTargetDate + "T12:00:00");
  const dateStr = planDateObj.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const title = `${dateStr} — South Bay Today`;
  const cardNames = plan.cards.map((c: any) => c.name).slice(0, 4).join(", ");
  const description = plan.cards.length > 4 ? `${cardNames}, and more` : cardNames;

  let bodyHtml: string;
  let metaRowHtml: string;
  let scriptHtml = "";

  if (isBucketPlan) {
    // ── Bucket grid render ──
    const cardsByBucket = new Map<string, any>();
    for (const c of plan.cards) {
      if (typeof c.bucket === "string" && !cardsByBucket.has(c.bucket)) {
        cardsByBucket.set(c.bucket, c);
      }
    }
    const filledBuckets = BUCKET_ORDER.filter((b) => cardsByBucket.has(b));
    const slotsHtml = filledBuckets.map((bucket, i) => {
      const card = cardsByBucket.get(bucket);
      const accent = ACCENT_COLORS[i % ACCENT_COLORS.length];
      const cardUrl = card.source === "event" ? (card.url || card.mapsUrl) : (card.mapsUrl || card.url);
      const bodyAttr = cardUrl ? "a" : "div";
      const bodyOpen = cardUrl
        ? `<a class="sbt-bucket-link" href="${esc(cardUrl)}" target="_blank" rel="noopener noreferrer">`
        : `<div class="sbt-bucket-link">`;
      const bodyClose = cardUrl ? `</a>` : `</div>`;
      const inner = buildCardInner(card, origin, accent);
      const debugBlock = debug && card.rationale
        ? `<div style="margin:0 14px 12px;padding:6px 8px;background:#f3f4f6;border-left:3px solid #6366f1;font-size:10px;color:#4b5563;font-family:monospace;letter-spacing:0.2px">🔍 ${esc(card.rationale)}</div>`
        : "";
      void bodyAttr;
      return `
        <div class="sbt-bucket">
          <div class="sbt-bucket-header">
            <span class="sbt-bucket-accent" style="background:${accent}"></span>
            <span class="sbt-bucket-label">${esc(BUCKET_LABELS[bucket as keyof typeof BUCKET_LABELS] || bucket)}</span>
          </div>
          ${bodyOpen}${inner}${bodyClose}
          ${debugBlock}
        </div>`;
    }).join("\n");

    bodyHtml = `<div class="sbt-buckets">${slotsHtml}</div>`;
    metaRowHtml = `<div class="plan-meta-row">${plan.weather ? `🌤 ${esc(plan.weather)} · ` : ""}${filledBuckets.length} ideas${plan.kids ? " · Family-friendly" : ""}</div>`;
  } else {
    // ── Legacy timeline render ──
    // Hide past cards for today's plans so an old link from earlier in the
    // day gracefully prunes its passed stops.
    const isPlanForToday = planTargetDate <= todayPT;
    let activeCards: any[];
    if (isPlanForToday) {
      const nowPT = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", hour12: false });
      const [nowH, nowM] = nowPT.split(":").map(Number);
      const nowMinutes = nowH * 60 + (nowM || 0);
      const parseEndMinutes = (timeBlock: string): number | null => {
        const parts = timeBlock.split(/\s*-\s*/);
        if (parts.length < 2) return null;
        const m = parts[1].match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
        if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
        return h * 60 + min;
      };
      activeCards = plan.cards.filter((c: any) => {
        const endMin = parseEndMinutes(c.timeBlock);
        if (endMin === null) return true;
        return endMin > nowMinutes;
      });
    } else {
      activeCards = plan.cards;
    }
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
    if (activeCards.length === 0) {
      return Response.redirect(`${origin}/?city=${plan.city}`, 302);
    }
    const filteredCount = plan.cards.length - activeCards.length;
    const timeNote = filteredCount > 0
      ? `<div style="text-align:center;font-size:12px;color:#bbb;margin-bottom:12px;font-style:italic">Showing ${activeCards.length} upcoming stops${filteredCount > 0 ? ` (${filteredCount} earlier stops already passed)` : ""}</div>`
      : "";
    const cardsHtml = activeCards.map((card: any) => {
      const accent = ACCENT_COLORS[0];
      const cardUrl = card.source === "event" ? (card.url || card.mapsUrl) : (card.mapsUrl || card.url);
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
        ? `<a class="sbt-card"${endAttr} href="${esc(cardUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;gap:12px;padding:14px 16px;background:#fff;border-radius:10px;border:1px solid #e8e8e8;margin-bottom:8px;text-decoration:none;color:inherit;transition:box-shadow 0.15s,opacity 0.25s">`
        : `<div class="sbt-card"${endAttr} style="display:flex;gap:12px;padding:14px 16px;background:#fff;border-radius:10px;border:1px solid #e8e8e8;margin-bottom:8px;transition:opacity 0.25s">`;
      const linkClose = cardUrl ? `</a>` : `</div>`;
      const inner = buildCardInner(card, origin, accent);
      const debugBlock = debug && card.rationale
        ? `<div style="margin-top:8px;padding:6px 8px;background:#f3f4f6;border-left:3px solid #6366f1;font-size:10px;color:#4b5563;font-family:monospace;letter-spacing:0.2px">🔍 ${esc(card.rationale)}</div>`
        : "";
      return `${linkOpen}${inner}${debugBlock}${linkClose}`;
    }).join("\n");
    bodyHtml = `${timeNote}<div class="sbt-cards">${cardsHtml}</div>
      <div class="sbt-all-done" style="display:none;text-align:center;padding:32px 16px 8px;color:#888;font-size:14px">That's a wrap — every stop on this plan has passed.</div>`;
    metaRowHtml = `<div class="plan-meta-row">${plan.weather ? `🌤 ${esc(plan.weather)} · ` : ""}<span class="sbt-stop-count">${plan.cards.length}</span> stops${plan.kids ? " · Family-friendly" : ""}</div>`;

    // Live tick to hide expired cards (legacy timeline only).
    scriptHtml = `<script>
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
    if (planDate > today) return;
    var cards = container.querySelectorAll('.sbt-card');
    var visible = 0;
    if (planDate < today) {
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
</script>`;
  }

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
  .sb-nav { border-top: 1px solid var(--sb-border); border-bottom: 1px solid var(--sb-border); padding: 0 24px; }
  .sb-nav-inner { max-width: 960px; margin: 0 auto; display: flex; justify-content: flex-start; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  @media (min-width: 860px) { .sb-nav-inner { justify-content: center; } }
  .sb-nav-inner::-webkit-scrollbar { display: none; }
  .sb-tab { padding: 10px 14px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sb-muted); text-decoration: none; white-space: nowrap; border: none; background: none; }
  .sb-tab:hover { color: var(--sb-ink); }
  .container { max-width: 720px; margin: 0 auto; padding: 24px 16px 0; }
  .plan-meta-row { font-size: 13px; color: #888; text-align: center; margin: 8px 0 24px; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 28px; border-radius: 24px; border: 2.5px solid #000; background: linear-gradient(135deg, #FF6B35, #E63946, #7B2FBE, #1A5AFF, #06D6A0, #FF3CAC); background-size: 200% 200%; animation: rainbow 3s ease infinite; color: #fff; font-size: 14px; font-weight: 900; text-decoration: none; text-transform: uppercase; letter-spacing: 1px; }
  @keyframes rainbow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
  .footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #e8e8e8; }
  .footer p { font-size: 12px; color: #bbb; }
  .sbt-buckets { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 640px) { .sbt-buckets { grid-template-columns: 1fr; gap: 10px; } }
  .sbt-bucket { background: #fff; border-radius: 12px; border: 1px solid #e8e8e8; overflow: hidden; display: flex; flex-direction: column; min-height: 140px; }
  .sbt-bucket-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px 6px; }
  .sbt-bucket-accent { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .sbt-bucket-label { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 900; color: #111; letter-spacing: 1px; text-transform: uppercase; }
  .sbt-bucket-link { display: flex; gap: 12px; padding: 4px 14px 14px; text-decoration: none; color: inherit; }
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
  ${metaRowHtml}
  ${bodyHtml}
  <div class="footer">
    <a href="${esc(origin)}/?city=${esc(plan.city)}" class="cta">Build Your Own Day →</a>
    <p style="margin-top:16px">Powered by <a href="${esc(origin)}/" style="color:#888">southbaytoday.org</a></p>
  </div>
</div>
${scriptHtml}
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
