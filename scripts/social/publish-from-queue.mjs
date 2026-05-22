#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Signal — Publish From Queue
// Pulls approved posts from the queue, checks time-relevance,
// rewrites time references for publish day, and posts to all platforms.
//
// Usage: node scripts/social/publish-from-queue.mjs [--max N] [--dry-run]
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./lib/constants.mjs";
import { rewriteTimeReferences, parseEventHour, DAY_NAMES } from "./lib/time-references.mjs";
import { ptDateString, ptHour, ptDayOfWeek, ptClockString } from "./lib/pt-clock.mjs";
import { queueBump } from "./lib/event-bumps.mjs";
import { cleanDisplayCopy } from "../../src/lib/south-bay/displayText.mjs";

import { randomBytes } from "node:crypto";

// ── Wave 1-3 helpers (mirrored from publish.mjs so the production publisher
//    has them too — alt text, poll-day detection, image alt derivation) ────

/**
 * Build ALT text from post metadata. Describes the IMAGE for screen readers
 * and search ranking (X uses ALT as a signal); does NOT duplicate the caption.
 */
function deriveImageAlt(post) {
  const item = post.item || {};
  const title = item.title || item.name || "";
  const venue = item.venue || "";
  const city = item.cityName || item.city || "";

  // Day-plan: card image is the composite, not a single venue.
  if (post.scheduledSlot?.slotType === "day-plan") {
    const cityPart = city ? ` in ${city}` : "";
    return `South Bay Today day-plan card${cityPart}`;
  }

  const parts = [];
  if (title) parts.push(title);
  if (venue && !title.toLowerCase().includes(venue.toLowerCase())) parts.push(`at ${venue}`);
  if (city) parts.push(`in ${city}`);
  return (parts.join(" ") || "South Bay Today").slice(0, 400);
}

/**
 * X poll cadence: every 3rd day-plan publishes as a poll instead of regular
 * text. Day-of-year mod 3 — deterministic for audit but irregular enough
 * that the timeline doesn't pattern-match a fixed weekday.
 */
function isPollDay(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return dayOfYear % 3 === 0;
}

const SELF_REPLY_DELAY_MS = 150_000; // 2.5 min — long enough that algo has scored the parent

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-approved-queue.json");
const HISTORY_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-post-history.json");
const SHORT_URLS_FILE = join(__dirname, "..", "..", "src", "data", "south-bay", "short-urls.json");

// Load env
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envPath = join(__dirname, "..", "..", ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const args = process.argv.slice(2);
const maxPosts = parseInt(args.find((a, i) => args[i - 1] === "--max") || "2");
const dryRun = args.includes("--dry-run") || CONFIG.DRY_RUN;
// --force-slot day-plan|tonight-pick|wildcard — bypass the ±60min time window
// and pretend the matching slot is current. Used to manually catch up missed
// posts (e.g., recovering after a publisher outage).
const forceSlotIdx = args.indexOf("--force-slot");
const forceSlot = forceSlotIdx >= 0 ? args[forceSlotIdx + 1] : null;
const FORCE_SLOT_TIME = { "day-plan": "07:15", "tonight-pick": "11:45", "wildcard": "16:30" };

// ── Time helpers ───────────────────────────────────────────────────────────

// Returns the current instant. PT-zoned date/hour/weekday are derived via
// scripts/social/lib/pt-clock.mjs (ptDateString / ptHour / ptDayOfWeek) so
// the publisher works correctly regardless of system TZ and regardless of
// the time of day — including after PT 5pm when the UTC date is ahead.
//
// Legacy code returned `new Date(new Date().toLocaleString(..., {tz: PT}))`
// here, then read `.toISOString().split("T")[0]` to get the "PT date" — but
// that pattern actually returns the UTC date and silently broke after 5pm.
function getPTTime() {
  return new Date();
}

function parseEventDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + "T12:00:00");
}

/**
 * Get the effective event date from a post entry.
 * Checks both post-level date and item-level date.
 */
function getEventDate(post) {
  return post.item?.date || post.date || null;
}

/**
 * Check if an event is still relevant for posting right now.
 * Must be at least 2 hours in the future.
 * Accepts a full post entry (not just item) to check both date sources.
 */
function isTimeRelevant(post, ptTime) {
  const today = ptDateString(ptTime);
  const currentHour = ptHour(ptTime);
  const currentMinute = ptTime.getMinutes(); // minute is TZ-independent
  const currentTotalMinutes = currentHour * 60 + currentMinute;

  const eventDate = getEventDate(post);

  // No date = ongoing, always relevant
  if (!eventDate) return true;

  // Past dates = expired
  if (eventDate < today) return false;

  // Future dates = relevant
  if (eventDate > today) return true;

  // Today: check if event is at least 2 hours away
  const item = post.item || post;
  if (eventDate === today && item.time) {
    const eventHour = parseEventHour(item.time);
    if (eventHour !== null) {
      const eventMinutes = eventHour * 60;
      if (eventMinutes - currentTotalMinutes < 120) {
        return false; // less than 2 hours away or already passed
      }
    }
  }

  return true;
}

// ── Silent-failure alert ───────────────────────────────────────────────────
// Fires a 🔴 Discord webhook ping when an "always-post" slot (day-plan or
// tonight-pick — anchored at 07:15 / 11:45 PT, jittered ±60 min daily by
// regenerate-publish-plist.mjs) produces zero successful posts. Stephen
// shouldn't have to discover a silent outage days later — this alerts on the
// first miss. The 16:30 wildcard slot is intentionally excluded: it's a
// queue-driven fallback and "nothing to publish" is a normal outcome there.
const ALWAYS_POST_SLOT_TYPES = new Set(["day-plan", "tonight-pick"]);

async function sendSilentFailureAlert({ slotType, today, timeStr, queueSize, scheduleSlotStatus, schedulePresent, copyApprovedAt, imageApprovedAt, reason }) {
  const webhook = process.env.DISCORD_WEBHOOK;
  if (!webhook) {
    console.warn("   ⚠️  DISCORD_WEBHOOK not set — silent-failure alert NOT sent");
    return;
  }
  const lines = [
    `🔴 **Social publisher silent at \`${slotType}\` slot** — ${today} ${timeStr} PT`,
    `Reason: ${reason}`,
    `Queue: ${queueSize} unpublished`,
    `Schedule slot: ${schedulePresent ? `\`${scheduleSlotStatus}\`` : "MISSING"}` +
      (schedulePresent ? ` (copyApprovedAt: ${copyApprovedAt ? "✓" : "✗"}, imageApprovedAt: ${imageApprovedAt ? "✓" : "✗"})` : ""),
    ``,
    `Manual catch-up:`,
    `\`\`\``,
    `ssh stephenstanwood@100.117.24.89 'cd ~/Projects/southbaytoday.org && \\`,
    `  /opt/homebrew/bin/node --env-file=.env.local \\`,
    `  scripts/social/publish-from-queue.mjs --max 1 --force-slot ${slotType}'`,
    `\`\`\``,
  ];
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`   ⚠️  Discord alert HTTP ${res.status}: ${body.slice(0, 200)}`);
    } else {
      console.log("   📣 Discord red-alert sent (silent publisher failure)");
    }
  } catch (err) {
    console.warn(`   ⚠️  Discord alert error: ${err.message}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const ptTime = getPTTime();
  const today = ptDateString(ptTime);
  const timeStr = ptClockString(ptTime);

  console.log(`\n📤 Publish from queue — ${today} ${timeStr}`);

  // Load queue
  if (!existsSync(QUEUE_FILE)) {
    console.log("No queue file found.");
    return;
  }
  const queue = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  const unpublished = queue.filter((p) => !p.published);
  console.log(`   ${unpublished.length} unpublished in queue`);

  // Sweep: expire items whose date is fully in the past (before today in PT)
  let expiredCount = 0;
  for (const p of queue) {
    if (p.published) continue;
    const eventDate = getEventDate(p);
    if (eventDate && eventDate < today) {
      p.published = true;
      p.publishedAt = new Date().toISOString();
      p.publishResult = "expired";
      expiredCount++;
    }
  }
  if (expiredCount > 0) {
    console.log(`   ${expiredCount} expired (date in the past)`);
  }

  // Filter remaining unpublished to time-relevant items (today <2hr, etc.)
  const stillUnpublished = queue.filter((p) => !p.published);
  const relevant = stillUnpublished.filter((p) => isTimeRelevant(p, ptTime));
  const tooSoon = stillUnpublished.length - relevant.length;
  if (tooSoon > 0) {
    console.log(`   ${tooSoon} skipped (<2hr lead time)`);
    // Mark too-soon items as expired
    for (const p of stillUnpublished) {
      if (!isTimeRelevant(p, ptTime)) {
        p.published = true;
        p.publishedAt = new Date().toISOString();
        p.publishResult = "expired";
      }
    }
  }

  // Persist any expirations to disk before falling through to the schedule path,
  // so even if there's nothing in the queue we don't lose the sweep work.
  if (expiredCount > 0 || tooSoon > 0) {
    writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2) + "\n");
  }

  // NOTE: do NOT early-return when the queue is empty or has no time-relevant
  // items — the schedule-first path below reads from social-schedule.json
  // and can still publish today's slot from there. Bailing here was the bug
  // that caused the publisher to silently skip every slot from 2026-04-29
  // onward once the queue drained.

  // ── Schedule-first path: check the 14-day schedule for approved content
  let publishedFromSchedule = false;
  try {
    const { currentPublishSlot } = await import("./lib/slot-scheduler.mjs");
    const currentSlot = forceSlot && FORCE_SLOT_TIME[forceSlot]
      ? { type: forceSlot, time: FORCE_SLOT_TIME[forceSlot] }
      : currentPublishSlot();
    if (forceSlot) console.log(`   🔧 --force-slot=${forceSlot} (bypassing time-window check)`);
    if (currentSlot) {
      const schedulePath = join(__dirname, "..", "..", "src", "data", "south-bay", "social-schedule.json");
      if (existsSync(schedulePath)) {
        const schedule = JSON.parse(readFileSync(schedulePath, "utf8"));
        const daySchedule = schedule.days?.[today]?.[currentSlot.type];

        if (daySchedule && daySchedule.copyApprovedAt && daySchedule.imageApprovedAt && daySchedule.status !== "published") {
          console.log(`\n📅 Schedule path: ${currentSlot.type} for ${today}`);
          const title = daySchedule.plan ? (daySchedule.cityName || "Day Plan") : (daySchedule.item?.title || "Untitled");
          console.log(`   ✓ ${title}`);
          console.log(`   ✓ Image: ${daySchedule.imageUrl?.slice(0, 60)}...`);

          const schedPost = {
            item: daySchedule.item || { title: daySchedule.cityName + " Day Plan", date: today },
            copy: daySchedule.copy,
            scheduledSlot: { date: today, slotType: currentSlot.type, time: currentSlot.time },
            _scheduleImageUrl: daySchedule.imageUrl,
            // For day-plans, also stash the full plan (with bucket cards) so
            // the Threads carousel path can hydrate per-bucket photos.
            _schedulePlan: daySchedule.plan
              ? { ...daySchedule.plan, cityName: daySchedule.cityName }
              : null,
          };

          relevant.length = 0;
          relevant.push(schedPost);
          publishedFromSchedule = true;
        } else if (daySchedule && !daySchedule.copyApprovedAt) {
          console.log(`\n   ⏳ Schedule: ${currentSlot.type} copy not approved — skipping`);
        } else if (daySchedule && !daySchedule.imageApprovedAt) {
          console.log(`\n   ⏳ Schedule: ${currentSlot.type} image not approved — skipping`);
        }
      }
    }
  } catch (err) {
    console.warn(`   ⚠️  schedule path failed: ${err.message} — falling through to queue`);
  }

  // ── Queue-based slotted path (fallback)
  if (!publishedFromSchedule) {
    try {
      const { postsForCurrentSlot } = await import("./lib/slot-scheduler.mjs");
      const slotted = postsForCurrentSlot(relevant, { today });
      if (slotted.length > 0) {
        console.log(`\n📅 Queue path: ${slotted.length} post(s) for ${today}`);
        relevant.length = 0;
        relevant.push(...slotted);
      }
    } catch (err) {
      console.warn(`   ⚠️  slot scheduler path failed: ${err.message}`);
    }
  }

  // ── Reactive fallback: score posts by publish-time relevance ──────────
  // Principles:
  // - Today/tomorrow events get top priority (urgent)
  // - Weekend events shouldn't be promoted Mon-Tue (too early, awkward)
  //   → best promoted starting Thu/Fri
  // - Between equal-quality posts, pick the soonest event
  // - Events 5+ days out get low priority (wait until closer)
  function publishRelevanceScore(post) {
    const eventDate = getEventDate(post);
    if (!eventDate) return 50; // no date = filler, medium priority

    const event = new Date(eventDate + "T12:00:00");
    const publish = new Date(today + "T12:00:00");
    const daysUntil = Math.round((event - publish) / 86400000);
    const publishDow = ptDayOfWeek(ptTime); // 0=Sun, 6=Sat
    const eventDow = event.getDay();

    // Already past = should not be here, but just in case
    if (daysUntil < 0) return -100;

    // Today = highest priority
    if (daysUntil === 0) return 100;

    // Tomorrow = very high priority
    if (daysUntil === 1) return 90;

    // Weekend events (Sat/Sun)
    const isWeekendEvent = eventDow === 0 || eventDow === 6;
    if (isWeekendEvent) {
      // Mon/Tue: too early to promote weekend events
      if (publishDow === 1 || publishDow === 2) return 10;
      // Wed: acceptable but not ideal
      if (publishDow === 3) return 40;
      // Thu/Fri: perfect time to promote weekend events
      if (publishDow === 4 || publishDow === 5) return 80;
    }

    // 2-3 days out = good timing
    if (daysUntil >= 2 && daysUntil <= 3) return 70;

    // 4-5 days out = acceptable
    if (daysUntil >= 4 && daysUntil <= 5) return 40;

    // 6+ days out = wait, too far
    return 15;
  }

  // Combine timing relevance with item quality for final ranking.
  // Timing is the primary signal (is now the right moment to post this?),
  // quality is the secondary signal (given equal timing, prefer better stuff).
  function combinedScore(post) {
    const timing = publishRelevanceScore(post);
    const quality = post.item?.score || 0;
    // Timing dominates (scaled 0-100), quality adds refinement (typically 20-30)
    return timing * 10 + quality;
  }

  relevant.sort((a, b) => {
    const scoreA = combinedScore(a);
    const scoreB = combinedScore(b);
    if (scoreB !== scoreA) return scoreB - scoreA;
    // Tie-break: soonest event first
    const dateA = getEventDate(a) || "9999";
    const dateB = getEventDate(b) || "9999";
    return dateA.localeCompare(dateB);
  });

  // Log the scoring for transparency
  for (const p of relevant.slice(0, 5)) {
    const timing = publishRelevanceScore(p);
    const quality = p.item?.score || 0;
    const title = (p.item?.title || "").slice(0, 40);
    const eventDate = getEventDate(p);
    console.log(`   ${timing >= 70 ? "🟢" : timing >= 40 ? "🟡" : "🔴"} [t:${timing} q:${quality}] ${title} (${eventDate})`);
  }
  if (relevant.length > 5) console.log(`   ... and ${relevant.length - 5} more`);
  console.log();

  // ── Slot-role filter (reactive fallback) ──────────────────────────────────
  // Prefer posts that match the current slot's editorial role. Falls back to
  // the full pool if no role-matched posts are available (e.g., no restaurant
  // openings queued for the 4:30 wildcard slot).
  try {
    const { SLOT_ROLES, slotRole: classifyPost } = await import("./lib/slot-scheduler.mjs");
    const role = _currentSlot ? SLOT_ROLES[_currentSlot] : null;
    if (role && role !== "disabled") {
      const matched = relevant.filter((p) => classifyPost(p) === role);
      if (matched.length > 0) {
        console.log(`   🎯 Slot role [${role}]: ${matched.length}/${relevant.length} posts match — narrowing pool`);
        relevant.length = 0;
        relevant.push(...matched);
      } else {
        console.log(`   🎯 Slot role [${role}]: no matching posts — using full pool`);
      }
    }
  } catch { /* best-effort */ }

  // Filter out low-relevance posts — they'll score better later in the week
  const MIN_TIMING_SCORE = 30;
  const publishable = relevant.filter((p) => publishRelevanceScore(p) >= MIN_TIMING_SCORE);
  if (publishable.length < relevant.length) {
    console.log(`   ${relevant.length - publishable.length} posts held back (low relevance score, will promote later)`);
  }

  // Take up to maxPosts
  const toPublish = publishable.slice(0, maxPosts);
  console.log(`   Publishing ${toPublish.length} posts:\n`);

  for (const post of toPublish) {
    const item = post.item || {};
    const effectiveDate = getEventDate(post);
    console.log(`   📌 ${item.title} (${item.cityName || ""}, ${effectiveDate} ${item.time || ""})`);

    // Rewrite time references — use effective date (post-level or item-level)
    const rewriteItem = { ...item, date: effectiveDate };
    const rewrittenCopy = {};
    for (const [platform, value] of Object.entries(post.copy || {})) {
      // Non-string fields (e.g., pollX = { text, options }) get rewritten
      // surgically below. Pass strings through the rewriter, pass-through
      // objects unmodified except for nested text fields.
      if (typeof value !== "string") {
        if (value && typeof value === "object" && typeof value.text === "string") {
          // Object with a `text` field (currently just pollX) — rewrite the
          // text only; options array is short labels, no time refs to fix.
          rewrittenCopy[platform] = { ...value, text: cleanDisplayCopy(rewriteTimeReferences(value.text, rewriteItem, ptTime)) };
        } else {
          rewrittenCopy[platform] = value;
        }
        continue;
      }
      let rewritten = cleanDisplayCopy(rewriteTimeReferences(value, rewriteItem, ptTime));
      // Final guard: ensure the first letter is uppercase. Catches any future
      // case-mangling from rewrites or upstream copy that slipped a lowercase
      // start past the model. Only touches the first character — body case is
      // intentional Reddit-voice / quotes / etc.
      if (rewritten && /^[a-z]/.test(rewritten)) {
        rewritten = rewritten[0].toUpperCase() + rewritten.slice(1);
        console.log(`      🔠 ${platform}: capitalized first letter (was lowercase)`);
      }
      rewrittenCopy[platform] = rewritten;
      if (rewrittenCopy[platform] !== value) {
        console.log(`      ✏️  ${platform}: time refs rewritten`);
      }
    }

    // Use schedule image if available (Recraft poster from Vercel Blob)
    let ogImage = post._scheduleImageUrl || "";

    // Fetch og:image from the target URL for richer social cards (fallback)
    const targetUrl = item.planUrl || item.url || post.targetUrl;
    if (!ogImage && targetUrl) {
      try {
        const ogRes = await fetch(targetUrl, {
          headers: { "User-Agent": "SouthBayTodayBot/1.0 (link preview)" },
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
        });
        if (ogRes.ok) {
          const html = await ogRes.text();
          const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
          if (m) ogImage = m[1];
        }
      } catch { /* skip — og:image is best-effort */ }
      // Skip the site brand default — posting it makes every event look like
      // generic SBT marketing instead of the actual event. Better to post
      // text-only than the wrong image.
      if (ogImage && /\/images\/og-image\.png(\?|$)/.test(ogImage)) {
        console.log(`      ⏭️  og:image is site default — skipping image attachment`);
        ogImage = "";
      }
      if (ogImage) console.log(`      🖼️  og:image: ${ogImage.slice(0, 80)}...`);
    }

    // Shorten long URLs for cleaner posts
    if (targetUrl && targetUrl.length > 80) {
      const shortSlug = randomBytes(4).toString("hex");
      const shortUrl = `https://southbaytoday.org/go/${shortSlug}`;
      // Save to short-urls.json with metadata for OG tags
      let shortUrls = {};
      try { shortUrls = JSON.parse(readFileSync(SHORT_URLS_FILE, "utf8")); } catch {}
      const entry = {
        url: targetUrl,
        title: item.title || "",
        description: (item.summary || item.description || "").slice(0, 200),
      };
      if (ogImage) entry.image = ogImage;
      shortUrls[shortSlug] = entry;
      writeFileSync(SHORT_URLS_FILE, JSON.stringify(shortUrls, null, 2) + "\n");
      // Replace URL in all platform copies
      for (const [platform, text] of Object.entries(rewrittenCopy)) {
        rewrittenCopy[platform] = text.replace(targetUrl, shortUrl);
      }
      console.log(`      🔗 URL shortened: ${shortUrl} → ${targetUrl.slice(0, 60)}...`);
    }

    if (dryRun) {
      console.log(`      🏜️  DRY RUN — would publish:`);
      for (const [platform, value] of Object.entries(rewrittenCopy)) {
        if (typeof value === "string") {
          console.log(`      [${platform}] ${value.slice(0, 100)}...`);
        } else if (value && typeof value === "object") {
          // pollX shape: { text, options }
          console.log(`      [${platform}] ${JSON.stringify(value).slice(0, 120)}...`);
        }
      }
      console.log();
      continue;
    }

    // ── PRE-PUBLISH GUARD ──────────────────────────────────────────────
    // Final timeliness check right before posting. Even if the post passed
    // the earlier filter, time may have elapsed (og:image fetch, URL
    // shortening, etc.) or the date fields may have been missed earlier.
    // This is the last line of defense against posting stale events.
    const guardTime = getPTTime();
    const guardToday = ptDateString(guardTime);
    const eventDate = getEventDate(post);
    if (eventDate && eventDate < guardToday) {
      console.log(`      ⛔ PRE-PUBLISH GUARD: event date ${eventDate} is in the past — skipping`);
      post.published = true;
      post.publishedAt = new Date().toISOString();
      post.publishResult = "expired-guard";
      continue;
    }
    // Also check the copy itself for obviously stale day-of-week references
    const guardDayName = DAY_NAMES[ptDayOfWeek(guardTime)];
    const eventDayName = eventDate ? DAY_NAMES[new Date(eventDate + "T12:00:00").getDay()] : null;
    // First STRING value — skip object-shaped fields like pollX so the
    // regex checks below run against actual post text.
    const firstCopy = Object.values(rewrittenCopy).find((v) => typeof v === "string") || "";
    if (eventDate && eventDate === guardToday && eventDayName) {
      // If copy says "Sunday" but it's Tuesday, something is wrong
      const wrongDayPattern = new RegExp(`\\b${eventDayName}\\b`, "i");
      if (eventDayName !== guardDayName && wrongDayPattern.test(firstCopy)) {
        console.log(`      ⛔ PRE-PUBLISH GUARD: copy references "${eventDayName}" but today is ${guardDayName} — skipping`);
        post.published = true;
        post.publishedAt = new Date().toISOString();
        post.publishResult = "expired-guard-dayname";
        continue;
      }
    }
    // Relative-date drift: copy says "today"/"tonight" but event is not today,
    // or says "tomorrow" but event is not +1 day. Happens when a post sits in
    // the queue longer than its relative framing tolerates.
    if (eventDate) {
      const daysOut = Math.round(
        (new Date(eventDate + "T12:00:00") - new Date(guardToday + "T12:00:00")) / 86400000,
      );
      const sayToday = /\b(today|tonight|this (morning|afternoon|evening))\b/i.test(firstCopy);
      const sayTomorrow = /\btomorrow\b/i.test(firstCopy);
      if (sayToday && daysOut !== 0) {
        console.log(`      ⛔ PRE-PUBLISH GUARD: copy says "today/tonight" but event is ${daysOut} days out — skipping`);
        post.published = true;
        post.publishedAt = new Date().toISOString();
        post.publishResult = "expired-guard-today-drift";
        continue;
      }
      if (sayTomorrow && daysOut !== 1) {
        console.log(`      ⛔ PRE-PUBLISH GUARD: copy says "tomorrow" but event is ${daysOut} days out — skipping`);
        post.published = true;
        post.publishedAt = new Date().toISOString();
        post.publishResult = "expired-guard-tomorrow-drift";
        continue;
      }
    }

    // Final hard trim — safety net for any copy that slipped through over-limit
    const { trimToLimit } = await import("./lib/copy-gen.mjs");
    const PUBLISH_LIMITS = { x: 280, threads: 500, bluesky: 300, facebook: 500, instagram: 2200, mastodon: 300 };
    for (const [p, lim] of Object.entries(PUBLISH_LIMITS)) {
      if (rewrittenCopy[p] && rewrittenCopy[p].length > lim) {
        console.log(`      ✂️  ${p}: ${rewrittenCopy[p].length} → trimmed to ${lim}`);
        rewrittenCopy[p] = trimToLimit(rewrittenCopy[p], lim);
      }
    }

    // Fetch the image buffer ONCE up front and share it across the four
    // buffer-upload platforms (x/bluesky/facebook/mastodon). Previously this
    // fetch ran inside the per-platform loop, so a single transient blob blip
    // could silently drop the image on one platform while the others kept it
    // — the exact failure mode that hit the 2026-05-10 Seal tonight-pick
    // (bluesky text-only, every other platform fine). One retry on failure,
    // and LOG loudly when we end up posting without an image.
    let sharedImgBuf = null;
    if (ogImage) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const imgRes = await fetch(ogImage, { signal: AbortSignal.timeout(15000) });
          if (imgRes.ok) {
            sharedImgBuf = Buffer.from(await imgRes.arrayBuffer());
            console.log(`      📥 Image buffer fetched (${(sharedImgBuf.length / 1024).toFixed(0)} KB)`);
            break;
          }
          console.log(`      ⚠️  Image fetch ${imgRes.status} (attempt ${attempt}/2)`);
        } catch (e) {
          console.log(`      ⚠️  Image fetch error: ${e.message} (attempt ${attempt}/2)`);
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
      }
      if (!sharedImgBuf) {
        console.log(`      ⛔ Image buffer unavailable — buffer-upload platforms will post text-only`);
      }
    }

    // Slot type drives feature gating (X polls on day-plan poll-days,
    // Pinterest on day-plans, evening bumps on tonight-picks).
    const slotType = post.scheduledSlot?.slotType || null;
    const imageAlt = sharedImgBuf ? deriveImageAlt(post) : "";

    // ── Day-plan multi-image prep (Threads carousel + Bluesky thread) ────
    // Hydrate bucket-card photos ONCE up front (Places API → Blob cache),
    // then build both the Threads carousel slide list and the Bluesky
    // thread reply list from the same hydrated cards. Either can be null —
    // any failure (incl. <2 hydrated images) cleanly falls back to the
    // existing single-image publish path on that platform.
    let threadsCarouselSlides = null;
    let blueskyThreadReplies = null;
    if (slotType === "day-plan") {
      try {
        const plan = post._schedulePlan
          || (post.item && post.item.cards ? post.item : null)
          || null;
        const cards = plan?.cards || [];
        if (cards.length > 0) {
          const { hydrateBucketCardImages, buildCarouselSlides, buildBlueskyThread } =
            await import("./lib/carousel-images.mjs");
          await hydrateBucketCardImages(cards);
          const cityName = plan?.cityName || post.item?.cityName || "";

          if (ogImage) {
            threadsCarouselSlides = buildCarouselSlides({
              heroImageUrl: ogImage,
              heroAlt: imageAlt,
              cards,
              cityName,
            });
            if (threadsCarouselSlides) {
              console.log(`      🎠 Threads carousel prepped: ${threadsCarouselSlides.length} slides`);
            } else {
              console.log(`      🎠 Threads carousel: <2 hydrated slides — single-image fallback`);
            }
          }

          blueskyThreadReplies = buildBlueskyThread({ cards, cityName });
          if (blueskyThreadReplies) {
            console.log(`      🦋 Bluesky thread prepped: ${blueskyThreadReplies.length} bucket replies`);
          } else {
            console.log(`      🦋 Bluesky thread: <2 hydrated buckets — single-post only`);
          }
        }
      } catch (err) {
        console.log(`      ⚠️  Day-plan multi-image prep failed: ${err.message} — falling back to single image`);
        threadsCarouselSlides = null;
        blueskyThreadReplies = null;
      }
    }

    // Publish to each platform. Pinterest is appended at the end of the list
    // and handled specially (different publisher signature: title + description
    // + link, no per-platform text copy).
    const platforms = ["x", "bluesky", "threads", "facebook", "mastodon", "instagram", "pinterest"];
    const publishResults = [];

    // Track parent IDs for the link-suppression self-reply pattern. X and
    // Threads bodies are link-free; ~2.5 min after publish we post a self-reply
    // with the URL. Algo has already scored the parent by then.
    const pendingSelfReplies = []; // [{ platform, parentId, replyText }]

    // Seed replies (X/Threads day-plans) land at +30s — one editorial
    // sentence picked by the copy-gen ("seedReply"), no URL. The point is
    // to feed the algorithm a fresh-author-engagement signal during the
    // window where it's still scoring the parent, *before* the URL drop.
    const pendingSeedReplies = []; // [{ platform, parentId, replyText }]

    // Bluesky day-plan thread: one chained reply per bucket card, each
    // carrying its own image. Fires in parallel with the X/Threads timed
    // reply passes so the publisher's wall time doesn't add up.
    let pendingBlueskyThread = null; // { parentUri, parentCid, replies[] }

    for (const platform of platforms) {
      // Pinterest is gated by env presence (write tokens) AND content type
      // (day-plan only — search-driven, 6-month tail; tonight-pick / wildcard
      // are too time-specific for Pinterest's index).
      if (platform === "pinterest") {
        // Gate on REFRESH_TOKEN, not ACCESS_TOKEN — refresh-token presence
        // is the marker that OAuth has been completed and we have write
        // scopes. The read-only test token (Production Limited) sets only
        // ACCESS_TOKEN and would 403 on every pin attempt.
        if (!process.env.PINTEREST_REFRESH_TOKEN) {
          console.log(`      ⏭️  pinterest: PINTEREST_REFRESH_TOKEN missing (run scripts/social/oauth-pinterest.mjs)`);
          continue;
        }
        if (!process.env.PINTEREST_ACCESS_TOKEN) {
          console.log(`      ⏭️  pinterest: PINTEREST_ACCESS_TOKEN missing`);
          continue;
        }
        if (slotType !== "day-plan") {
          continue;
        }
        const pTitle = rewrittenCopy.pinterestTitle;
        const pDesc = rewrittenCopy.pinterestDescription;
        if (!pTitle || !pDesc) {
          console.log(`      ⏭️  pinterest: missing pinterestTitle or pinterestDescription`);
          continue;
        }
        if (!sharedImgBuf) {
          console.log(`      ⏭️  pinterest: no image buffer (card image required)`);
          continue;
        }
        try {
          const client = await import("./lib/platforms/pinterest.mjs");
          const result = await client.publish({
            boardName: "South Bay Day Plans",
            boardDescription: "Daily plans for the South Bay — San Jose, Cupertino, Campbell, Los Gatos, Saratoga, and beyond. New plan every morning.",
            title: pTitle,
            description: pDesc,
            link: targetUrl,
            imageBuffer: sharedImgBuf,
            altText: imageAlt,
          });
          console.log(`      📌 pinterest: pinned ${result.id}`);
          publishResults.push({ platform: "pinterest", ok: true, postId: result.id, ...result });
        } catch (err) {
          console.log(`      ❌ pinterest: ${err.message}`);
          publishResults.push({ platform: "pinterest", ok: false, error: err.message });
        }
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const copy = rewrittenCopy[platform];
      if (!copy) continue;

      try {
        const client = await import(`./lib/platforms/${platform}.mjs`);
        let result;

        // X poll variant: every 3rd day-plan publish goes out as a poll.
        // Deterministic by date (day-of-year mod 3); polls boost X reach 2-3x.
        // If the poll publish fails (rate limit, API contract change, etc.),
        // fall back to a regular text+image post so X never silently drops
        // the slot — same pattern as the Threads carousel fallback below.
        if (
          platform === "x" &&
          slotType === "day-plan" &&
          rewrittenCopy.pollX?.text &&
          Array.isArray(rewrittenCopy.pollX?.options) &&
          rewrittenCopy.pollX.options.length >= 2 &&
          isPollDay(new Date())
        ) {
          const poll = rewrittenCopy.pollX;
          console.log(`      📊 x: poll mode — "${poll.text}" (${poll.options.length} options)`);
          try {
            result = await client.publishPoll(poll.text, poll.options, sharedImgBuf, imageAlt);
          } catch (pollErr) {
            console.log(`      ⚠️  x poll failed (${pollErr.message}) — regular tweet fallback`);
            result = sharedImgBuf
              ? await client.publish(copy, sharedImgBuf, imageAlt)
              : await client.publish(copy);
          }
        } else if (platform === "threads") {
          if (threadsCarouselSlides) {
            try {
              console.log(`      🎠 threads: publishing carousel (${threadsCarouselSlides.length} slides)`);
              result = await client.publishCarousel(copy, threadsCarouselSlides);
            } catch (carouselErr) {
              console.log(`      ⚠️  threads carousel failed (${carouselErr.message}) — single-image fallback`);
              result = ogImage ? await client.publish(copy, ogImage) : await client.publish(copy);
            }
          } else if (ogImage) {
            result = await client.publish(copy, ogImage);
          } else {
            result = await client.publish(copy);
          }
        } else if (platform === "instagram") {
          if (!ogImage) {
            console.log(`      ⏭️  instagram: no public image URL — skipping`);
            continue;
          }
          result = await client.publish(copy, ogImage);
        } else if (platform === "x" || platform === "bluesky" || platform === "mastodon") {
          // ALT-text-aware publishers — pass imageAlt so X/Bluesky/Mastodon
          // set accessibility metadata at upload time.
          if (sharedImgBuf) {
            result = await client.publish(copy, sharedImgBuf, imageAlt);
          } else {
            if (ogImage) console.log(`      ⚠️  ${platform}: posting text-only (no image buffer)`);
            result = await client.publish(copy);
          }
        } else if (platform === "facebook") {
          if (sharedImgBuf) {
            result = await client.publish(copy, sharedImgBuf);
          } else {
            if (ogImage) console.log(`      ⚠️  ${platform}: posting text-only (no image buffer)`);
            result = await client.publish(copy);
          }
        } else {
          result = await client.publish(copy);
        }
        console.log(`      ✅ ${platform}: ${JSON.stringify(result)}`);
        publishResults.push({
          platform,
          ok: true,
          postId: result.id || result.uri || null,
          ...result,
        });

        // Queue a self-reply with the link on X / Threads. Bodies are
        // link-free (algo suppresses outbound links); the reply lands ~2.5min
        // later, after the parent has been scored.
        if ((platform === "x" || platform === "threads") && targetUrl && (result.id)) {
          pendingSelfReplies.push({
            platform,
            parentId: result.id,
            replyText: `More info → ${targetUrl}`,
          });
          // Also queue the seed reply when copy-gen provided one (day-plan).
          if (slotType === "day-plan" && typeof rewrittenCopy.seedReply === "string" && rewrittenCopy.seedReply.trim()) {
            pendingSeedReplies.push({
              platform,
              parentId: result.id,
              replyText: rewrittenCopy.seedReply.trim(),
            });
          }
        }

        // Queue the Bluesky bucket-reply thread when the parent landed and
        // we hydrated 2+ bucket images earlier.
        if (platform === "bluesky" && blueskyThreadReplies && result?.uri && result?.cid) {
          pendingBlueskyThread = {
            parentUri: result.uri,
            parentCid: result.cid,
            replies: blueskyThreadReplies,
          };
        }
      } catch (err) {
        console.log(`      ❌ ${platform}: ${err.message}`);
        publishResults.push({ platform, ok: false, error: err.message });
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    // ── Bluesky thread (day-plan, chained bucket replies) ──────────────
    // Runs as a background promise so the X/Threads sleep timers below
    // don't stack with the 60-90s the thread needs to fan out. Each reply
    // chains under the previous (parent = previous reply, root = original
    // parent post) so the thread reads as a top-to-bottom narrative. We
    // break the chain on any individual failure rather than orphan a reply
    // off a dead parent.
    // Track URIs of replies WE post so the engagement collector can exclude
    // them from reply tallies in Social Signal. Keyed per platform with the
    // platform-native ID shape (Bluesky: at:// URI, X/Threads: numeric id).
    const ownReplyIds = { x: [], threads: [], bluesky: [] };

    const blueskyThreadPromise = pendingBlueskyThread && !dryRun
      ? (async () => {
          console.log(`      🦋 bluesky thread: publishing ${pendingBlueskyThread.replies.length} bucket replies…`);
          const root = { uri: pendingBlueskyThread.parentUri, cid: pendingBlueskyThread.parentCid };
          let prev = root;
          let ok = 0;
          for (const r of pendingBlueskyThread.replies) {
            try {
              const imgRes = await fetch(r.imageUrl, { signal: AbortSignal.timeout(15000) });
              if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status}`);
              const buffer = Buffer.from(await imgRes.arrayBuffer());
              const lib = await import("./lib/platforms/bluesky.mjs");
              const reply = await lib.publishReply({
                parentUri: prev.uri,
                parentCid: prev.cid,
                rootUri: root.uri,
                rootCid: root.cid,
                text: r.text,
                imageBuffer: buffer,
                imageAlt: r.alt,
              });
              ownReplyIds.bluesky.push(reply.uri);
              prev = { uri: reply.uri, cid: reply.cid };
              ok++;
            } catch (err) {
              console.log(`      ⚠️  bluesky thread reply failed: ${err.message} — stopping chain`);
              break;
            }
          }
          console.log(`      🦋 bluesky thread: ${ok}/${pendingBlueskyThread.replies.length} replies published`);
        })().catch((err) => console.log(`      ⚠️  bluesky thread error: ${err.message}`))
      : null;

    // ── Seed-reply pass (X/Threads, +30s) ──────────────────────────────
    // One editorial sentence picking the day's must-do bucket. Fires
    // before the URL self-reply so the algorithm sees author engagement
    // while it's still scoring the parent. Day-plan only for now.
    const SEED_DELAY_MS = 30_000;
    if (pendingSeedReplies.length > 0 && !dryRun) {
      console.log(`      ⏳ Seed reply: waiting ${SEED_DELAY_MS/1000}s on ${pendingSeedReplies.map(r => r.platform).join(", ")}…`);
      await new Promise((r) => setTimeout(r, SEED_DELAY_MS));
      await Promise.all(pendingSeedReplies.map(async (pending) => {
        try {
          const lib = await import(`./lib/platforms/${pending.platform}.mjs`);
          const replyFn = pending.platform === "x" ? lib.replyToTweet : lib.replyToThread;
          const replyRes = await replyFn(pending.parentId, pending.replyText);
          if (replyRes?.id && ownReplyIds[pending.platform]) {
            ownReplyIds[pending.platform].push(replyRes.id);
          }
          console.log(`      🌱 ${pending.platform}: seed reply ${replyRes.id}`);
        } catch (err) {
          console.log(`      ⚠️  ${pending.platform}: seed reply failed: ${err.message}`);
        }
      }));
    }

    // ── Self-reply pass (link-suppression workaround) ──────────────────────
    // Total wait from parent stays ~2.5min. If we already slept for the
    // seed pass we only wait the remainder here.
    if (pendingSelfReplies.length > 0 && !dryRun) {
      const remaining = pendingSeedReplies.length > 0
        ? SELF_REPLY_DELAY_MS - SEED_DELAY_MS
        : SELF_REPLY_DELAY_MS;
      console.log(`      ⏳ Self-reply: waiting ${remaining/1000}s before posting link on ${pendingSelfReplies.map(r => r.platform).join(", ")}…`);
      await new Promise((r) => setTimeout(r, remaining));
      await Promise.all(pendingSelfReplies.map(async (pending) => {
        try {
          const lib = await import(`./lib/platforms/${pending.platform}.mjs`);
          const replyFn = pending.platform === "x" ? lib.replyToTweet : lib.replyToThread;
          const replyRes = await replyFn(pending.parentId, pending.replyText);
          if (replyRes?.id && ownReplyIds[pending.platform]) {
            ownReplyIds[pending.platform].push(replyRes.id);
          }
          console.log(`      🔗 ${pending.platform}: self-reply ${replyRes.id}`);
        } catch (err) {
          console.log(`      ⚠️  ${pending.platform}: self-reply failed: ${err.message}`);
        }
      }));
    }

    // Wait for the Bluesky thread to finish before letting this post's
    // iteration complete. Otherwise the publisher could exit while replies
    // are still firing.
    if (blueskyThreadPromise) await blueskyThreadPromise;

    // Stash own-reply IDs on the corresponding publishedTo entry so the
    // engagement collector can exclude them from reply tallies. Each entry
    // is the platform's parent post; ownReplies holds the IDs we authored
    // as replies underneath it (URL self-reply, seed reply, Bluesky thread).
    for (const [platform, ids] of Object.entries(ownReplyIds)) {
      if (!ids.length) continue;
      const entry = publishResults.find((r) => r.platform === platform && r.ok);
      if (entry) entry.ownReplies = ids;
    }

    // ── Evening bump queue (tonight-pick only) ─────────────────────────────
    // The publisher fires a follow-up reply ~30 min before event time on
    // X/Threads/Bluesky, catching the after-work audience.
    if (!dryRun && slotType === "tonight-pick") {
      try {
        const results = {};
        for (const r of publishResults) {
          if (!r.ok) continue;
          if (r.platform === "x") results.x = { id: r.postId };
          else if (r.platform === "threads") results.threads = { id: r.postId };
          else if (r.platform === "bluesky") results.bluesky = { uri: r.uri || r.postId, cid: r.cid };
        }
        const bumpPost = {
          postType: "tonight-pick",
          item: post.item,
          copy: rewrittenCopy,
        };
        const queued = queueBump({ post: bumpPost, results });
        if (queued) console.log(`      ⏰ Evening bump queued (fires ~30min pre-event)`);
      } catch (err) {
        console.log(`      ⚠️  Bump queue failed: ${err.message}`);
      }
    }

    // Mark as published in queue with structured results
    post.published = true;
    post.publishedAt = new Date().toISOString();
    post.publishedTo = publishResults;
    post.rewrittenCopy = rewrittenCopy;
    console.log();
  }

  // Save updated queue
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2) + "\n");

  // Mark schedule entries as published
  if (publishedFromSchedule && toPublish.some((p) => p.publishedTo?.some((r) => r.ok))) {
    try {
      const schedulePath = join(__dirname, "..", "..", "src", "data", "south-bay", "social-schedule.json");
      const schedule = JSON.parse(readFileSync(schedulePath, "utf8"));
      const { currentPublishSlot } = await import("./lib/slot-scheduler.mjs");
      const currentSlot = forceSlot && FORCE_SLOT_TIME[forceSlot]
        ? { type: forceSlot, time: FORCE_SLOT_TIME[forceSlot] }
        : currentPublishSlot();
      if (currentSlot && schedule.days?.[today]?.[currentSlot.type]) {
        schedule.days[today][currentSlot.type].status = "published";
        schedule.days[today][currentSlot.type].publishedAt = new Date().toISOString();
        // Stash per-platform IDs so the engagement collector can poll them.
        const justPublished = toPublish.find((p) => p.publishedTo?.some((r) => r.ok));
        if (justPublished?.publishedTo) {
          schedule.days[today][currentSlot.type].publishedTo = justPublished.publishedTo;
        }
        writeFileSync(schedulePath, JSON.stringify(schedule, null, 2) + "\n");
        console.log(`   📅 Schedule marked published: ${today} ${currentSlot.type}`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Failed to update schedule: ${err.message}`);
    }
  }

  // Social state files are gitignored — no git commit needed.
  // Queue and history are saved to disk above; they persist on the Mini
  // without polluting the tracked repo.
  console.log("   📦 Queue state saved to disk (gitignored, not committed)");

  // Summary + structured output for discord-notify.py
  const processedPosts = toPublish.filter((p) => p.publishedTo);
  const totalPublished = processedPosts.length;
  console.log(`\n✅ Published ${totalPublished} posts`);
  console.log(`   ${queue.filter((p) => !p.published).length} remaining in queue`);

  // ── AUTO-DEPLOY SHORT URLS ────────────────────────────────────────────
  // short-urls.json must be committed so Vercel can serve /go/ redirects.
  // Push any new entries after publishing so links work without manual deploy.
  if (!dryRun && totalPublished > 0) {
    try {
      const { execSync } = await import("node:child_process");
      const gitStatus = execSync("git diff --name-only -- src/data/south-bay/short-urls.json", { cwd: join(__dirname, "..", ".."), encoding: "utf8" }).trim();
      if (gitStatus) {
        execSync("git add src/data/south-bay/short-urls.json && git commit -m 'data: auto-sync short-urls.json' && git push origin main", { cwd: join(__dirname, "..", ".."), encoding: "utf8", timeout: 30000 });
        console.log("   📎 short-urls.json committed and pushed");
      }
    } catch (e) {
      console.warn("   ⚠️  Failed to auto-push short-urls.json:", e.message);
    }
  }

  if (!dryRun && toPublish.length > 0) {
    const allResults = processedPosts.flatMap((p) => p.publishedTo || []);
    const succeededPlatforms = [...new Set(allResults.filter((r) => r.ok).map((r) => r.platform))];
    const failedPlatforms = [...new Set(allResults.filter((r) => !r.ok).map((r) => r.platform))];
    const summaryItems = processedPosts.map((p) => ({
      title: p.item?.title || "(unknown)",
      platforms: (p.publishedTo || []).filter((r) => r.ok).map((r) => r.platform),
      postIds: Object.fromEntries(
        (p.publishedTo || []).filter((r) => r.ok && r.postId).map((r) => [r.platform, r.postId])
      ),
      copy: Object.values(p.rewrittenCopy || {})[0]?.slice(0, 100) || "",
    }));
    const publishSummary = {
      published: totalPublished,
      succeeded: succeededPlatforms,
      failed: failedPlatforms,
      items: summaryItems,
    };
    console.log(`\nPUBLISH_SUMMARY:${JSON.stringify(publishSummary)}`);

    if (totalPublished > 0 && succeededPlatforms.length === 0) {
      console.error("PUBLISH_FAILED: All platforms failed");
      process.exit(1);
    }
  }

  // ── Silent-failure alert ────────────────────────────────────────────────
  // For always-post slots (day-plan, tonight-pick — anchors 07:15 / 11:45,
  // jittered ±60 min daily), fire a 🔴 Discord ping if zero posts hit any
  // platform. Skipped on --dry-run, skipped for the 16:30 wildcard slot
  // (queue-driven, OK to be empty).
  if (!dryRun) {
    try {
      const { currentPublishSlot } = await import("./lib/slot-scheduler.mjs");
      const effectiveSlot = forceSlot && FORCE_SLOT_TIME[forceSlot]
        ? { type: forceSlot, time: FORCE_SLOT_TIME[forceSlot] }
        : currentPublishSlot();

      if (effectiveSlot && ALWAYS_POST_SLOT_TYPES.has(effectiveSlot.type)) {
        // "Successful" = at least one platform on at least one post returned ok.
        const anyPlatformOk = processedPosts.some((p) => (p.publishedTo || []).some((r) => r.ok));
        if (!anyPlatformOk) {
          // Diagnose: read schedule slot status for today + this slot type
          const schedulePath = join(__dirname, "..", "..", "src", "data", "south-bay", "social-schedule.json");
          let scheduleSlotStatus = null;
          let copyApprovedAt = false;
          let imageApprovedAt = false;
          let schedulePresent = false;
          try {
            const sch = JSON.parse(readFileSync(schedulePath, "utf8"));
            const slot = sch.days?.[today]?.[effectiveSlot.type];
            if (slot) {
              schedulePresent = true;
              scheduleSlotStatus = slot.status || "(no status)";
              copyApprovedAt = !!slot.copyApprovedAt;
              imageApprovedAt = !!slot.imageApprovedAt;
            }
          } catch { /* schedule unreadable — fine, we'll report MISSING */ }

          const queueSize = queue.filter((p) => !p.published).length;
          let reason;
          if (!schedulePresent) {
            reason = "schedule has no slot for this date/type";
          } else if (scheduleSlotStatus === "published") {
            reason = "schedule slot already marked published — duplicate prevented send";
          } else if (!copyApprovedAt || !imageApprovedAt) {
            reason = `schedule slot missing approvals (copy: ${copyApprovedAt ? "✓" : "✗"}, image: ${imageApprovedAt ? "✓" : "✗"})`;
          } else if (toPublish.length === 0) {
            reason = "found approved schedule slot but publisher selected 0 posts (filter logic)";
          } else {
            reason = "publisher selected post(s) but every platform call failed";
          }

          await sendSilentFailureAlert({
            slotType: effectiveSlot.type,
            today,
            timeStr,
            queueSize,
            scheduleSlotStatus,
            schedulePresent,
            copyApprovedAt,
            imageApprovedAt,
            reason,
          });
        }
      }
    } catch (err) {
      console.warn(`   ⚠️  Silent-failure alert check failed: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error("Publish error:", err);
  process.exit(1);
});
