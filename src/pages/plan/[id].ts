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
//
// Chrome: this route is a hand-built HTML string, not an Astro page, so it
// inlines the site's own tokens.css + chrome.css + home.css (?raw) and emits
// the same class names as Masthead.tsx / SiteFooter.tsx and the homepage's
// plan cards (SouthBayTodayView's `.sbt-plan-*`). Masthead, nav, footer, and
// cards therefore track the rest of the site with no copy to keep in sync.
// ---------------------------------------------------------------------------

import type { APIRoute } from "astro";
import { canonicalizeSharedPlan } from "../../lib/south-bay/canonicalizeCard.mjs";
import { BUCKET_ORDER, BUCKET_LABELS } from "../../lib/south-bay/buckets";
import { CITIES } from "../../lib/south-bay/cities";
import { TABS } from "../../lib/south-bay/types";
import { cleanDisplayCopy, cleanDisplayName } from "../../lib/south-bay/displayText.mjs";
import tokensCss from "../../styles/sbt/tokens.css?raw";
import chromeCss from "../../styles/sbt/chrome.css?raw";
import homeCss from "../../styles/sbt/home.css?raw";
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

// One color per pillar + meal pair across the day, as on / and /city:
// morning → sunset, afternoon → coral, evening → purple.
const PAIR_COLORS = ["var(--sb-sunset)", "var(--sb-coral)", "var(--sb-accent)"];
// Legacy timeline rows cycle the homepage's full accent set.
const ROW_COLORS = [
  "var(--sb-sunset)", "var(--sb-coral)", "var(--sb-accent)",
  "var(--sb-teal)", "var(--sb-gold)", "var(--sb-ink)",
];

// Same paths as Masthead.tsx's TAB_HREF; labels and order come from TABS.
const TAB_PATHS: Record<string, string> = {
  overview: "/",
  events: "/events",
  camps: "/camps",
  government: "/gov",
  technology: "/tech",
  food: "/food",
};

// Map pin (the same stroke icon the plan cards use on / and /city).
const PIN_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

function loadSharedPlans(): Record<string, any> {
  try {
    const path = join(process.cwd(), "src/data/south-bay/shared-plans.json");
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch { return {}; }
}

/** The homepage PlanThumb, server-rendered: warm placeholder that shimmers
 *  while the photo loads, fade-in on load, category emoji if every source
 *  fails. Google Places photoRefs expire (~30 days) and then
 *  /api/place-photo 404s, so the fallback matters. planImgLoad/planImgFail
 *  are defined in <head>, ahead of any image event. */
function planThumb(card: any, origin: string): string {
  const emoji = CATEGORY_EMOJI[card.category] || "📍";
  const sources = [
    card.image || null,
    card.photoRef ? `${origin}/api/place-photo?ref=${encodeURIComponent(card.photoRef)}&w=200&h=200` : null,
  ].filter((src): src is string => !!src);
  const img = sources.length
    ? `<img class="sbt-img is-pending" src="${esc(sources[0])}"${sources[1] ? ` data-next="${esc(sources[1])}"` : ""} alt="" width="84" height="84" loading="lazy" decoding="async" onload="planImgLoad(this)" onerror="planImgFail(this)">`
    : "";
  return `<span class="sbt-plan-thumb sbt-ph sbt-plan-thumb--fallback${img ? " is-loading" : ""}" aria-hidden="true"><span class="plan-thumb-emoji">${emoji}</span>${img}</span>`;
}

/** The homepage CardInner markup: thumbnail column + meta / title / venue /
 *  blurb, plus this page's cost pill and ?debug=1 rationale. */
function buildCardInner(card: any, origin: string, opts: { legacy: boolean; debug: boolean }): string {
  const isEvent = card.source === "event";
  // Legacy timeline rows have no slot header, so their timeBlock always
  // shows (it's often a word like "All morning"). Grid cards show an event's
  // time only, and only a hint with a digit, so a stray bucket word
  // ("Lunch") never echoes the slot label above it.
  const rawTime = opts.legacy
    ? (card.eventTime || card.timeBlock || "")
    : (isEvent ? (card.eventTime || card.timeBlock || "") : "");
  const timeHint = opts.legacy || /\d/.test(rawTime) ? rawTime : "";
  const showCategory = !(isEvent && card.category === "events");
  const cityName = cityLabel(card.city);
  const name = cleanDisplayName(card.name) || "";
  const venue = cleanDisplayName(card.venue) || "";
  const showVenue = isEvent && venue && venue !== name;
  const cost = card.costNote || card.cost;
  const meta = [
    timeHint ? `<span class="sbt-plan-time">${esc(timeHint)}</span>` : "",
    showCategory ? `<span class="sbt-plan-cat">${esc(card.category)}</span>` : "",
    cityName ? `<span>${esc(cityName)}</span>` : "",
    // Header-less legacy rows carry the Event tag in the meta line instead.
    opts.legacy && isEvent ? `<span class="sbt-plan-badge sbt-plan-badge--event">Event</span>` : "",
  ].join("");
  const debugBlock = opts.debug && card.rationale
    ? `<div class="plan-debug">🔍 ${esc(card.rationale)}</div>`
    : "";
  return `
    <div class="sbt-plan-thumbcol">${planThumb(card, origin)}</div>
    <div class="sbt-plan-body">
      ${meta ? `<div class="sbt-plan-meta">${meta}</div>` : ""}
      <h3 class="sbt-plan-title">${esc(name)}</h3>
      ${showVenue ? `<div class="sbt-plan-venue">${PIN_SVG}<span>${esc(venue)}</span></div>` : ""}
      <p class="sbt-plan-blurb">${esc(cleanDisplayCopy(card.blurb) || "")}</p>
      ${cost ? `<span class="plan-cost">${esc(cost)}</span>` : ""}
      ${debugBlock}
    </div>`;
}

function cardLink(card: any, inner: string): string {
  const cardUrl = card.source === "event" ? (card.url || card.mapsUrl) : (card.mapsUrl || card.url);
  return cardUrl
    ? `<a class="sbt-plan-link" href="${esc(cardUrl)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    : `<div class="sbt-plan-link">${inner}</div>`;
}

// Page-specific styles. Everything else (tokens, masthead, nav, footer,
// .sb-btn, .sb-chip, .sb-eyebrow) comes from the inlined site stylesheets.
const PLAN_CSS = `
*, *::before, *::after { box-sizing: border-box; }
h1, h2, h3, p { margin: 0; }
img { display: block; max-width: 100%; }
:focus-visible { outline: 2px solid rgba(135, 56, 245, 0.75); outline-offset: 2px; }
.skip-nav { position: absolute; left: -9999px; top: auto; width: 1px; height: 1px; overflow: hidden; z-index: 9999; }
.skip-nav:focus { position: fixed; top: 8px; left: 8px; width: auto; height: auto; padding: 0.7rem 1.2rem; border-radius: 999px; background: #13072F; color: #fff; font-size: 0.875rem; font-weight: 600; text-decoration: none; }

/* Same 800px content column as the homepage shell. */
.plan-main { max-width: calc(800px + 2 * var(--sb-gutter)); margin: 0 auto; padding: 30px var(--sb-gutter) 56px; }

.plan-hero { text-align: center; padding: 4px 0 12px; }
.plan-kicker { color: var(--sb-accent-ink); }
.plan-title { margin-top: 10px; font-family: var(--sb-serif); font-size: clamp(36px, 6vw, 50px); font-weight: 900; line-height: 1.04; letter-spacing: -0.015em; color: var(--sb-ink); text-wrap: balance; }
.plan-meta-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 16px; }
.plan-meta-row .sb-chip { padding: 5px 12px; font-size: 13px; color: var(--sb-ink-2); background: rgba(255, 255, 255, 0.85); }
.plan-note { margin: 4px 0 2px; text-align: center; font-size: 13px; font-style: italic; color: var(--sb-light); }

/* Cards are the homepage's .sbt-plan-* (home.css). The thumbnail also keeps
   its category emoji underneath, since there is no React here to swap it in. */
.plan-main .sbt-plan-thumb .sbt-img { position: absolute; inset: 0; }
.plan-main .sbt-plan-thumb.is-loading .plan-thumb-emoji { opacity: 0; }
.plan-cost { display: inline-block; margin-top: 8px; padding: 3px 10px; border: 1px solid var(--sb-line); border-radius: var(--sb-radius-pill); background: var(--sb-surface-warm); font-size: 12px; font-weight: 650; color: var(--sb-ink-2); }
.plan-debug { margin-top: 10px; padding: 8px 10px; border-left: 3px solid var(--sb-accent); border-radius: 0 var(--sb-radius-xs) var(--sb-radius-xs) 0; background: var(--sb-surface-tint); font-family: var(--sb-mono); font-size: 12px; line-height: 1.45; color: var(--sb-ink-2); }

/* Legacy timeline rows fade out as their stops pass (script below). No
   entrance animation here: its held end state would pin opacity at 1 and
   swallow that fade. */
.plan-main .sbt-plan-orphans { margin-top: 14px; }
.plan-main .sbt-card { animation: none; transition: opacity 0.25s, transform 0.25s var(--sb-ease), box-shadow 0.25s var(--sb-ease), border-color 0.2s; }
.sbt-all-done { padding: 28px 16px 4px; text-align: center; font-family: var(--sb-serif); font-size: 19px; font-weight: 800; color: var(--sb-ink); }

.plan-cta { display: flex; justify-content: center; margin-top: 36px; padding-top: 32px; border-top: 1px solid var(--sb-line); }
.plan-cta .sb-btn { min-height: 48px; padding: 12px 28px; font-size: 13.5px; }

@media (max-width: 640px) {
  .plan-main { padding: 22px var(--sb-gutter) 44px; }
  .plan-cta .sb-btn { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
`;

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

  // Masthead dateline shows today's date like every other page (the plan's
  // own date is the page title). Server-rendered at request time; the inline
  // script below refreshes it in case this response was served from cache.
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const weatherChip = plan.weather ? `<span class="sb-chip">🌤 ${esc(plan.weather)}</span>` : "";
  const kidsChip = plan.kids ? `<span class="sb-chip">Family-friendly</span>` : "";

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
      const color = PAIR_COLORS[Math.floor(BUCKET_ORDER.indexOf(bucket) / 2) % PAIR_COLORS.length];
      const inner = buildCardInner(card, origin, { legacy: false, debug });
      // A shared plan is pinned to its own date, so the pillar badge doesn't
      // say "Today's" the way the live homepage plan does.
      const roleLabel = card.role === "pillar" ? "Top pick" : card.role === "paired-meal" ? "Nearby" : "";
      const badges = [
        card.source === "event" ? `<span class="sbt-plan-badge sbt-plan-badge--event">Event</span>` : "",
        roleLabel ? `<span class="sbt-plan-badge sbt-plan-badge--${esc(card.role)}">${esc(roleLabel)}</span>` : "",
      ].join("");
      return `
        <article class="sbt-plan-card${card.role ? ` sbt-plan-card--${esc(card.role)}` : ""}" style="--sbt-pair:${color};animation-delay:${(i * 0.05).toFixed(2)}s">
          <div class="sbt-plan-head">
            <span class="sbt-plan-dot" aria-hidden="true"></span>
            <span class="sbt-plan-slot">${esc(BUCKET_LABELS[bucket as keyof typeof BUCKET_LABELS] || bucket)}</span>
            ${badges ? `<span class="sbt-plan-badges">${badges}</span>` : ""}
          </div>
          ${cardLink(card, inner)}
        </article>`;
    }).join("\n");

    bodyHtml = `<div class="sbt-plan-grid">${slotsHtml}</div>`;
    const planShape = plan.selectionModel === "pillar-pairs-v1"
      ? "3 activity picks · 3 nearby meals"
      : `${filledBuckets.length} ideas`;
    metaRowHtml = `<div class="plan-meta-row">${weatherChip}<span class="sb-chip">${planShape}</span>${kidsChip}</div>`;
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
      ? `<p class="plan-note">Showing ${activeCards.length} upcoming stops (${filteredCount} earlier stops already passed)</p>`
      : "";
    const cardsHtml = activeCards.map((card: any, i: number) => {
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
      const color = ROW_COLORS[i % ROW_COLORS.length];
      const inner = buildCardInner(card, origin, { legacy: true, debug });
      // The homepage's legacy "orphan" card. .sbt-card is the hook the
      // live-tick script below reads.
      return `<div class="sbt-plan-card sbt-card"${endAttr} style="--sbt-pair:${color}">
          <span class="sbt-plan-orphan-bar" aria-hidden="true"></span>
          ${cardLink(card, inner)}
        </div>`;
    }).join("\n");
    bodyHtml = `${timeNote}<div class="sbt-plan-orphans sbt-cards">${cardsHtml}</div>
      <p class="sbt-all-done" style="display:none">That's a wrap: every stop on this plan has passed.</p>`;
    metaRowHtml = `<div class="plan-meta-row">${weatherChip}<span class="sb-chip"><span class="sbt-stop-count">${plan.cards.length}</span>&nbsp;stops</span>${kidsChip}</div>`;

    // Live tick to hide expired cards (legacy timeline only).
    scriptHtml = `<script>
(function(){
  var container = document.querySelector('.plan-main');
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

  const navHtml = TABS.map((tab) =>
    `<a class="sb-tab" href="${TAB_PATHS[tab.id] ?? "/"}">${esc(tab.label)}</a>`,
  ).join("\n    ");
  const footerNavHtml = TABS.map((tab) =>
    `<li><a href="${TAB_PATHS[tab.id] ?? "/"}">${esc(tab.label)}</a></li>`,
  ).join("\n    ");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#FFF8F2">
<link rel="canonical" href="${esc(canonical)}">
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
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preload" as="font" type="font/woff2" href="/fonts/inter-variable-latin.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/fonts/playfair-display-variable-latin.woff2" crossorigin>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
${tokensCss}
${chromeCss}
${homeCss}
${PLAN_CSS}
</style>
<script>
function planImgLoad(img){img.className='sbt-img is-ready';img.parentNode.classList.remove('is-loading');}
function planImgFail(img){var next=img.getAttribute('data-next');if(next){img.removeAttribute('data-next');img.src=next;return;}img.parentNode.classList.remove('is-loading');img.remove();}
</script>
<noscript><style>.plan-main .sbt-img.is-pending{opacity:1}.plan-main .sbt-ph.is-loading{animation:none}.plan-main .sbt-plan-thumb.is-loading .plan-thumb-emoji{opacity:1}</style></noscript>
</head>
<body>
<a href="#main-content" class="skip-nav">Skip to content</a>
<header class="sb-header">
  <div class="sb-header-inner">
    <a href="/" class="sb-brand" aria-label="The South Bay Today — home">
      <img src="/images/sbt-avatar-172.png" alt="" width="76" height="76" class="sb-brand-mark" aria-hidden="true" decoding="async">
      <span class="sb-logo" aria-hidden="true">
        <span class="sb-logo-main-row"><span class="sb-logo-the">the</span><span class="sb-logo-south-bay">South Bay</span></span>
        <span class="sb-logo-signal-row"><span class="sb-logo-signal-rule"></span><span class="sb-logo-signal-word">Today</span><span class="sb-logo-signal-rule"></span></span>
      </span>
    </a>
    <p class="sb-dateline">
      <span class="sb-date" data-sbt-today="">${esc(todayLabel)}</span>
      <span class="sb-dateline-sep" aria-hidden="true">·</span>
      <span class="sb-slogan">All local. Good vibes. No ads.</span>
    </p>
  </div>
</header>
<nav class="sb-nav" aria-label="Sections">
  <div class="sb-nav-inner">
    ${navHtml}
  </div>
</nav>
<main id="main-content" class="plan-main" data-plan-date="${esc(planTargetDate)}">
  <header class="plan-hero">
    <p class="sb-eyebrow plan-kicker">A shared day plan</p>
    <h1 class="plan-title">${esc(dateStr)}</h1>
    ${metaRowHtml}
  </header>
  ${bodyHtml}
  <div class="plan-cta">
    <a href="${esc(origin)}/?city=${esc(plan.city)}" class="sb-btn sb-btn--primary">Build your own day →</a>
  </div>
</main>
<footer class="sb-footer">
  <ul class="sb-footer-nav" aria-label="Sections">
    ${footerNavHtml}
  </ul>
  <p class="sb-footer-meta">
    <span>a project of <a href="https://stanwood.dev" target="_blank" rel="noopener noreferrer" class="sb-footer-maker">stanwood.dev</a></span>
    <span class="sb-footer-dot" aria-hidden="true">·</span>
    <a href="/about">about</a>
    <span class="sb-footer-dot" aria-hidden="true">·</span>
    <a href="/newsletters">newsletter archive</a>
    <span class="sb-footer-dot" aria-hidden="true">·</span>
    <a href="/rss.xml">RSS</a>
    <span class="sb-footer-dot" aria-hidden="true">·</span>
    <a href="/privacy">privacy</a>
  </p>
  <p class="sb-footer-copy">© Stoa Works LLC</p>
</footer>
<script>
(function(){
  var label = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
  document.querySelectorAll('[data-sbt-today]').forEach(function(el){ el.textContent = label; });
})();
</script>
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
