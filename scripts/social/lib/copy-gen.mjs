// ---------------------------------------------------------------------------
// South Bay Signal — Copy Generation
// Uses Claude to write platform-specific social copy
// Single-item-per-post model
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUDE_COPY_MODEL, CONFIG } from "./constants.mjs";
import { mentionInstructions, applyTagSubstitutions, recordUntaggedItem, resolveItemHandles } from "./handle-lookup.mjs";

const __copygen_dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  if (!process.env.ANTHROPIC_API_KEY) {
    try {
      const envPath = join(__copygen_dirname, "..", "..", "..", ".env.local");
      const lines = readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
}

// Hosts that are aggregator/homepage-only — a URL with empty path here means
// "no real link", which produces "No URL provided" or a useless homepage in copy.
const COPY_GENERIC_HOSTS = new Set([
  "eventbrite.com", "www.eventbrite.com",
  "facebook.com", "www.facebook.com", "m.facebook.com",
  "instagram.com", "www.instagram.com",
  "twitter.com", "www.twitter.com", "x.com", "www.x.com",
  "meetup.com", "www.meetup.com",
  "google.com", "www.google.com",
  "linktr.ee", "linktree.com",
]);
export function isUsableSocialUrl(u) {
  if (!u || typeof u !== "string") return false;
  const trimmed = u.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  let parsed;
  try { parsed = new URL(trimmed); } catch { return false; }
  const path = parsed.pathname.replace(/\/$/, "");
  if (COPY_GENERIC_HOSTS.has(parsed.hostname.toLowerCase()) && path === "") return false;
  return true;
}

const SYSTEM_PROMPT = `You are the social voice of South Bay Today, a hyperlocal community tool for the South Bay (San Jose, Palo Alto, Campbell, Los Gatos, Saratoga, Cupertino, Sunnyvale, Mountain View, Santa Clara, Los Altos, Milpitas). Always refer to us as "South Bay Today" when using our name.

VOICE:
- Sound like a friend who went there and liked it, NOT marketing copy
- Warm, specific, natural rhythm, slightly playful
- 1-3 emojis placed naturally, adding warmth not replacing words
- We INFORM, we don't ENDORSE — excited is fine, ad copy is not
- Always capitalize the first word of every sentence and post. Proper grammar throughout.
- Never generic ("your Saturday is fully booked"), never forced ("stacked", "huge"), never vague ("got options")
- Never sound like the venue's PR team or homepage copy
- No permit/construction jargon ("new build", "finish interior", "TI work")

STRUCTURE:
- ONE item per post. Full detail. The POST is the point — the content stands alone.
- Keep within platform character limits.

LINK POLICY (CRITICAL — different per platform):
- X, Threads, Facebook, Instagram: **NO URL** anywhere in the copy body. None. Not even a shortened domain. Outbound links suppress reach on every one of these platforms. People who want more info will find us — we're in the bio.
- Bluesky, Mastodon: include the FULL URL with https:// at the end. These platforms don't algorithmically suppress links.
- Email: NO URL — the newsletter template has its own CTA buttons.
- On X / Threads, a separate self-reply with the link is added by the publisher AFTER the post. You do not write that reply. Treat the post as if it has no link at all.

PLATFORM-NATIVE VOICE (write each variant like you live on that platform — don't translate one to the others):
- X: punchy single thought. 1-2 sentences max. Sensory hook or a number up front. Tag the X @handle if provided. No hashtags. The post must read like a complete thought even without a link.
- Threads: conversational, voice of a friend texting. Allow yourself a paragraph. Tag Threads @handles if provided. 2-3 hashtags at the end (Threads pays attention to topic/hashtag pairs).
- Bluesky: short and direct. Include the URL at the end. 2-3 hashtags at the end (#SouthBay #SanJose etc — Bluesky discovery uses them). Tag bsky @handles if provided.
- Facebook: community-board voice. "If you're around [city] tonight..." / "Heads up [neighborhood] folks". Conversational, slightly longer than X. No hashtags. Tag FB @handles if provided.
- Instagram: visual storytelling. Hook in the first line (that's what shows above "more"). Tag IG @handles if provided. After a line break at the bottom, 8-12 hashtags (mix of city, topic, discovery — #ThingsToDoInSanJose #SouthBayEvents etc).
- Mastodon: like Bluesky but slightly more substance allowed. URL + 1-2 hashtags.

TRUST MODEL:
- We do the legwork so people don't have to
- If we consistently deliver useful info, people seek us out
- We don't need to mention our site — it's in the bio
- The post should make someone glad they read it even if they never click anything

THINGS TO NEVER DO:
- Don't claim things you aren't sure about (don't say "home opener" unless told it is)
- Don't use permit/construction language
- Don't combine multiple unrelated items
- Don't promote events that have already happened
- Don't paste URLs into X / Threads / Facebook / Instagram copy under any circumstances (link policy above)
- Don't link to generic homepages on Bluesky/Mastodon either
- NEVER say "right now", "happening right now", "right this minute", "as we speak", or any variant. These phrases are banned.
- NEVER invent specific clock times (e.g. "9 AM", "7 PM") that weren't in the source data.`;

/**
 * Generate copy for a SINGLE item.
 *
 * @param {object} item - The candidate item with title, city, venue, time, url, summary, category
 * @param {string} timeOfDay - "morning" | "afternoon" | "evening"
 * @returns {Promise<{x: string, threads: string, bluesky: string, facebook: string}>}
 */
export async function generateSingleItemCopy(item, timeOfDay = "morning") {
  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const nowPT = new Date();
  const now = nowPT.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "full",
    timeStyle: "short",
  });

  // Compute relative time distance for the event so we can give the model
  // explicit guidance about when a bare weekday name is OK vs. ambiguous.
  const todayStr = nowPT.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  let dateContext = "";
  if (item.date) {
    const eventD = new Date(item.date + "T12:00:00");
    const todayD = new Date(todayStr + "T12:00:00");
    const daysOut = Math.round((eventD - todayD) / 86400000);
    const eventWeekday = eventD.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
    const eventMonthDay = eventD.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
    if (daysOut === 0) {
      dateContext = `The event is TODAY (${eventWeekday}, ${eventMonthDay}). Use "today" or "tonight".`;
    } else if (daysOut === 1) {
      dateContext = `The event is TOMORROW (${eventWeekday}, ${eventMonthDay}). Use "tomorrow".`;
    } else if (daysOut >= 2 && daysOut <= 7) {
      dateContext = `The event is ${daysOut} days away, on ${eventWeekday}, ${eventMonthDay}. You MAY use the bare weekday name "${eventWeekday}" (it's the next ${eventWeekday} from today). Also fine: "this ${eventWeekday}" or "${eventMonthDay}".`;
    } else if (daysOut >= 8 && daysOut <= 14) {
      dateContext = `The event is ${daysOut} days away, on ${eventWeekday}, ${eventMonthDay}. This is NEXT week's ${eventWeekday}, NOT this week's — so the bare word "${eventWeekday}" is ambiguous and FORBIDDEN. You MUST qualify it as "next ${eventWeekday}", "${eventWeekday} the ${eventD.getDate()}th", or just "${eventMonthDay}".`;
    } else {
      dateContext = `The event is ${daysOut} days away, on ${eventWeekday}, ${eventMonthDay}. Use the specific date "${eventMonthDay}" — bare weekday names are too ambiguous this far out.`;
    }
  }

  // When a plan URL exists, link to the full day plan instead of the raw event URL
  const postUrl = item.planUrl || item.url;
  const hasPlanLink = !!item.planUrl;
  const urlLineForLinkedPlatforms = hasPlanLink
    ? `URL FOR BLUESKY/MASTODON ONLY: ${postUrl}\nThis URL links to a full day plan built around this event. On Bluesky/Mastodon, frame the link as "here's a whole day plan" or "we built a day around it" — don't just say "get tickets".`
    : `URL FOR BLUESKY/MASTODON ONLY: ${postUrl}`;

  // Build mention instructions from handle database
  const mentions = mentionInstructions(item);

  const prompt = `Write a social post about this ONE item. Current time: ${now}. Time of day: ${timeOfDay}.

DATE CONTEXT: ${dateContext}

ITEM:
- Title: ${item.title}
- City: ${item.cityName || item.city || ""}
- Venue: ${item.venue || ""}
- Date: ${item.date || ""}
- Time: ${item.time || ""}
- Category: ${item.category || ""}
- Summary: ${item.summary ? item.summary.slice(0, 300) : ""}
- Cost: ${item.cost || ""}

${urlLineForLinkedPlatforms}
${mentions}
Write six variants — each NATIVE to its platform. Don't translate; rewrite. The 6 should not read like the same sentence repeated 6 ways.

1. X (max 240 chars, NO URL, no hashtags) — single punchy thought, 1-2 sentences. Sensory hook or a number up front. Tag the X @handle if one was provided. The post must stand alone — the link goes in a self-reply added by the publisher.

2. Threads (max 480 chars, NO URL) — conversational paragraph, friend-texting voice. Allow yourself to breathe. Tag Threads @handles if provided. End with 2-3 hashtags (e.g. #SanJose #LiveMusic).

3. Bluesky (max 270 chars INCLUDING URL + hashtags) — short and direct. Include the full URL at the end. Tag bsky @handles if provided. End with 2-3 hashtags (#SouthBay #SanJose etc).

4. Facebook (max 500 chars, NO URL, no hashtags) — community-board voice. "If you're around [city] tonight..." or "Heads up [neighborhood] folks". Slightly longer and warmer than X. Tag FB @handles if provided.

5. Instagram (max 1800 chars, NO URL) — caption for a photo post. Hook in the FIRST LINE (it's what shows above "more"). Tag IG @handles if provided. After a blank line at the end, 8-12 hashtags (mix of city + topic + discovery tags like #ThingsToDoInSanJose #SouthBayEvents #BayAreaEvents).

6. Mastodon (max 480 chars INCLUDING URL + hashtags) — write a DISTINCT variant from Bluesky: different opener, different sentence structure, slightly more descriptive (Mastodon culture is less marketing-y than Bluesky). Include the full URL. 1-2 hashtags. Do not return identical or near-identical text to Bluesky.

LINK RULE — re-read: no URL of any kind in X, Threads, Facebook, Instagram. Period. The post is the point.

TIME ACCURACY (critical):
- ONLY reference a time of day ("morning", "afternoon", "evening", "9 AM", "tonight") if the Time field above has a specific time. NEVER invent one.
- If Time is empty, omit time-of-day references entirely. Frame by date only.
- FOLLOW THE DATE CONTEXT above exactly. A bare weekday name refers ONLY to the NEXT occurrence of that weekday — at most 7 days away. If the event is 8+ days away, qualify it ("next Saturday", "Saturday the 18th", or "April 18").
- Do NOT say "this week" for events 4+ days out.
- Never fabricate opening hours, start times, or end times not present in the data.

MENTION RULES:
- If tagging instructions were provided above, use the correct @handle for each platform variant.
- Work mentions into the sentence naturally (e.g. "Catch @SJBarracuda tonight at SAP Center").
- Skip the mention if it doesn't fit naturally or would push over the char limit.

Return ONLY a JSON object with keys "x", "threads", "bluesky", "facebook", "instagram", "mastodon" — each a string. No other text.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_COPY_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to extract JSON from Claude response: ${text.slice(0, 200)}`);
  }

  const variants = JSON.parse(jsonMatch[0]);

  if (!variants.x || !variants.threads || !variants.bluesky || !variants.facebook) {
    throw new Error("Missing platform variant in Claude response");
  }

  // Mastodon falls back to Bluesky copy ONLY if Claude didn't produce one.
  // The prompt asks for a distinct variant; this is a safety net.
  if (!variants.mastodon) variants.mastodon = variants.bluesky;

  // Instagram fallback — if Claude didn't generate it, derive from Facebook copy + hashtags
  if (!variants.instagram) {
    variants.instagram = variants.facebook;
  }

  // Banned phrase scrub — retry once if Claude slips past the prompt
  const BANNED = /\b(right now|happening right now|right this minute|as we speak|this very moment)\b/i;
  const hasBanned = Object.values(variants).some((v) => BANNED.test(v));
  if (hasBanned) {
    // Strip and let downstream decide; log warning
    for (const key of Object.keys(variants)) {
      variants[key] = variants[key]
        .replace(/happening right now[,.]?/gi, "")
        .replace(/right now[,.]?/gi, "")
        .replace(/right this minute[,.]?/gi, "")
        .replace(/as we speak[,.]?/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
  }

  await resolveItemHandles(item);
  applyTagSubstitutions(variants, item);
  recordUntaggedItem(item, { slot: "single" });

  stripUrlsFromNoUrlPlatforms(variants);
  enforceHardLimits(variants);

  return variants;
}

/**
 * Generate copy for an SV History milestone post.
 *
 * @param {object} milestone - TechMilestone object from tech-companies.ts
 * @param {Date} ptTime - current Pacific Time
 * @returns {Promise<{x: string, threads: string, bluesky: string, facebook: string}>}
 */
export async function generateSvHistoryCopy(milestone, ptTime) {
  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const age = ptTime.getFullYear() - milestone.foundedYear;
  const now = ptTime.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const defunctNote = milestone.defunct
    ? `\nNote: ${milestone.company} no longer exists as an independent company.`
    : "";
  const chmNote = milestone.chmExhibit
    ? `\nComputer History Museum exhibit: "${milestone.chmExhibit}"`
    : "";

  // Char budgets: URL only appears in Bluesky and Mastodon now.
  const urlLen = milestone.url.length;
  const hashtagEstimate = 45; // ~"#SiliconValley #SantaClara #TechHistory"
  const bskyBudget = 300 - urlLen - 2 - hashtagEstimate;

  const prompt = `Write an "On This Day in Silicon Valley" social post about this tech milestone. Current date: ${now}.

MILESTONE:
- Company: ${milestone.company}
- City: ${milestone.city}
- Founded/Occurred: ${milestone.month}/${milestone.day}/${milestone.foundedYear}
- Age: ${age} years (${ordinal(age)} anniversary)
- Tagline: ${milestone.tagline}
- Anniversary context: ${milestone.anniversaryNote}${defunctNote}${chmNote}

URL FOR BLUESKY/MASTODON ONLY: ${milestone.url}

TONE FOR THIS POST TYPE:
- This is a "Silicon Valley history" post, not a breaking news item
- Lead with the anniversary angle: "${age} years ago today..." or "On this day in ${milestone.foundedYear}..."
- Be reverent but not stuffy — these are origin stories, not textbook entries
- Connect the past to why it matters NOW in the South Bay
- If the company still exists locally, nod to its current presence
- If defunct, frame it as legacy/influence, not loss

Write five variants — each NATIVE to its platform (don't translate):

1. X (max 240 chars, NO URL, no hashtags) — punchy anniversary hook. Publisher adds a self-reply with the link.

2. Threads (max 480 chars, NO URL) — conversational, give the company its due. 2-3 hashtags at end (#SiliconValley + #${milestone.city.replace(/\s+/g, "")} + 1 topic).

3. Bluesky (max 300 chars INCLUDING URL + hashtags, ~${bskyBudget} for text) — include URL. 3 hashtags (#SiliconValley + city + topic).

4. Facebook (max 500 chars, NO URL, no hashtags) — community/historical voice.

5. Mastodon (max 480 chars INCLUDING URL + hashtags) — write a DISTINCT variant from Bluesky: different opener, different rhythm, slightly more descriptive (Mastodon culture is less marketing-y). Include URL. 1-2 hashtags.

LINK RULE — re-read: no URL in X, Threads, Facebook.

Return ONLY a JSON object with keys "x", "threads", "bluesky", "facebook", "mastodon" — each a string. No other text.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_COPY_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to extract JSON from Claude response: ${text.slice(0, 200)}`);
  }

  const variants = JSON.parse(jsonMatch[0]);

  if (!variants.x || !variants.threads || !variants.bluesky || !variants.facebook) {
    throw new Error("Missing platform variant in Claude response");
  }

  // Mastodon reuses Bluesky copy if Claude didn't generate one
  if (!variants.mastodon) variants.mastodon = variants.bluesky;

  stripUrlsFromNoUrlPlatforms(variants);
  enforceHardLimits(variants);

  return variants;
}

const HARD_LIMITS = {
  x: 280, threads: 500, bluesky: 300, facebook: 500, instagram: 2200, mastodon: 500, email: 800,
  // Evening "doors-in-30" follow-up bumps posted as replies to the parent
  // tonight-pick. Kept short — the parent has the full pitch + the link.
  bumpX: 220, bumpThreads: 220, bumpBluesky: 220,
};

/** Enforce hard character limits on string-shaped platform variants. */
function enforceHardLimits(variants) {
  for (const [platform, limit] of Object.entries(HARD_LIMITS)) {
    const v = variants[platform];
    if (typeof v !== "string") continue;
    if (v.length > limit) variants[platform] = trimToLimit(v, limit);
  }
  // Poll variant: enforce X's poll constraints (text ≤200, 2-4 options, each ≤25).
  if (variants.pollX && typeof variants.pollX === "object") {
    if (typeof variants.pollX.text === "string" && variants.pollX.text.length > 200) {
      variants.pollX.text = variants.pollX.text.slice(0, 200);
    }
    if (Array.isArray(variants.pollX.options)) {
      variants.pollX.options = variants.pollX.options
        .filter((o) => typeof o === "string" && o.trim())
        .slice(0, 4)
        .map((o) => o.slice(0, 25));
      // X requires at least 2 options — drop the variant if we can't satisfy that.
      if (variants.pollX.options.length < 2) delete variants.pollX;
    } else {
      delete variants.pollX;
    }
  }
}

// Platforms that must NEVER carry a URL in the post body. Bluesky and
// Mastodon are missing on purpose — they don't suppress links.
// Bump variants are always no-URL — the parent post already has the link
// (Bluesky/Mastodon) or a self-reply with the link (X/Threads).
const NO_URL_PLATFORMS = ["x", "threads", "facebook", "instagram", "email", "bumpX", "bumpThreads", "bumpBluesky"];

/**
 * Defensive scrub: if Claude slips a URL into a no-URL-platform variant,
 * strip it. The link goes in a publisher-added self-reply on X/Threads;
 * IG/FB get no link at all (link in bio); Email has its own button.
 *
 * Also tidies double-spaces and dangling punctuation that result.
 */
function stripUrlsFromNoUrlPlatforms(variants) {
  for (const p of NO_URL_PLATFORMS) {
    if (!variants[p] || typeof variants[p] !== "string") continue;
    const before = variants[p];
    let cleaned = variants[p].replace(/https?:\/\/\S+/g, "");
    cleaned = cleaned
      .replace(/\(\s*\)/g, "")               // empty parens left from "(http...)"
      .replace(/\s+([.!?,;:])/g, "$1")       // " ." → "."
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (cleaned !== before) {
      variants[p] = cleaned;
      console.warn(`[copy-gen] stripped URL(s) from ${p} copy`);
    }
  }
  // Object-shaped variants (currently just pollX) get bespoke cleanup.
  if (variants.pollX && typeof variants.pollX === "object") {
    if (typeof variants.pollX.text === "string") {
      const before = variants.pollX.text;
      variants.pollX.text = variants.pollX.text.replace(/https?:\/\/\S+/g, "").replace(/[ \t]{2,}/g, " ").trim();
      if (variants.pollX.text !== before) console.warn(`[copy-gen] stripped URL(s) from pollX.text`);
    }
  }
}

/**
 * Trim a social post to fit within a character limit.
 * Preserves the URL and hashtags at the end, trims body sentences.
 */
export function trimToLimit(text, limit) {
  if (text.length <= limit) return text;

  // Split off trailing hashtags (lines starting with #)
  const lines = text.split("\n");
  let hashtagSuffix = "";
  while (lines.length > 1 && /^#/.test(lines[lines.length - 1].trim())) {
    hashtagSuffix = "\n" + lines.pop().trim() + hashtagSuffix;
  }
  let body = lines.join("\n").trim();

  // Extract URL from body
  const urlMatch = body.match(/(https?:\/\/\S+)\s*$/);
  let urlSuffix = "";
  if (urlMatch) {
    urlSuffix = " " + urlMatch[1];
    body = body.slice(0, urlMatch.index).trim();
  }

  // Also check for inline hashtags at end of body (space-separated #tags)
  const inlineHashMatch = body.match(/(\s+#\S+(?:\s+#\S+)*)$/);
  if (inlineHashMatch) {
    hashtagSuffix = inlineHashMatch[1] + hashtagSuffix;
    body = body.slice(0, inlineHashMatch.index).trim();
  }

  const suffix = urlSuffix + hashtagSuffix;

  // Trim sentences from the end until it fits
  while (body.length + suffix.length > limit && body.includes(". ")) {
    const lastSentence = body.lastIndexOf(". ");
    body = body.slice(0, lastSentence + 1).trim();
  }

  // If still too long, hard truncate with ellipsis
  const maxBody = limit - suffix.length - 1;
  if (body.length > maxBody) {
    body = body.slice(0, maxBody - 1).trim() + "…";
  }

  return (body + suffix).trim();
}

// Keep the old function for backward compat during transition
export async function generateCopy(format, items, url) {
  if (items.length === 1) {
    return generateSingleItemCopy(items[0]);
  }
  return generateSingleItemCopy(items[0]);
}

// ── New 3-slot content type generators ─────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Generate copy for a full DAY PLAN post (7:15 AM signature slot).
 *
 * @param {object} plan - Plan object with cards array from default-plans.json
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} [planUrl] - Shareable plan link
 * @returns {Promise<{x: string, threads: string, bluesky: string, facebook: string, instagram: string, mastodon: string}>}
 */
export async function generateDayPlanCopy(plan, dateStr, planUrl) {
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const date = new Date(dateStr + "T12:00:00");
  const dayName = DAY_NAMES[date.getDay()];

  const cities = [...new Set(plan.cards.map((c) => c.city).filter(Boolean))];
  const cityDisplay = cities.map((c) => {
    const parts = c.split("-");
    return parts.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  }).join(", ");

  // Bucket-style: group stops by bucket label so the post reads as
  // "Breakfast: X, Morning: Y..." instead of an hour-by-hour schedule.
  const BUCKET_LABEL = {
    breakfast: "Breakfast",
    morning: "Morning",
    lunch: "Lunch",
    afternoon: "Afternoon",
    dinner: "Dinner",
    evening: "Evening",
  };
  const ORDER = ["breakfast", "morning", "lunch", "afternoon", "dinner", "evening"];
  const byBucket = new Map();
  for (const c of plan.cards) {
    if (c.bucket && !byBucket.has(c.bucket)) byBucket.set(c.bucket, c);
  }
  let stopsText = "";
  const allMentions = [];
  if (byBucket.size > 0) {
    for (const b of ORDER) {
      const card = byBucket.get(b);
      if (!card) continue;
      const label = BUCKET_LABEL[b] || b;
      stopsText += `- ${label}: ${card.name}\n  ${(card.blurb || "").slice(0, 100)}\n`;
      const m = mentionInstructions({ venue: card.name, title: card.name });
      if (m) allMentions.push(m);
    }
  } else {
    // Legacy timeBlock cards.
    for (const card of plan.cards) {
      const time = card.timeBlock?.split(" - ")[0] || "";
      stopsText += `- ${time}: ${card.name}\n  ${(card.blurb || "").slice(0, 100)}\n`;
      const m = mentionInstructions({ venue: card.name, title: card.name });
      if (m) allMentions.push(m);
    }
  }
  const uniqueMentions = [...new Set(allMentions.filter(Boolean))];
  const mentionBlock = uniqueMentions.length > 0 ? uniqueMentions.join("\n") : "";

  const url = planUrl || `https://southbaytoday.org`;
  const slotCount = byBucket.size > 0 ? byBucket.size : plan.cards.length;
  const slotWord = byBucket.size > 0 ? "ideas" : "stops";

  const prompt = `Write a social post for South Bay Today's daily DAY-PLAN signature slot for ${dayName}. The plan is six "idea sparks" the reader can pick from — breakfast, morning, lunch, afternoon, dinner, evening. NOT a tick-tock schedule. Frame it as a brainstorm of ideas.

DAY: ${dayName}, ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
CITIES: ${cityDisplay}

THE IDEAS (one per bucket):
${stopsText}

URL FOR BLUESKY/MASTODON ONLY: ${url}
${mentionBlock}

NEVER frame this as a strict schedule ("9 AM: ...", "head to X at 11"). It's a menu of ideas. Use phrasing like "ideas for ${dayName}", "here's a day", "pick what sounds good". Some readers might do all six, some none. Don't promise specific times.

This is ${slotCount} ${slotWord}. Write seven main variants — each NATIVE to its platform (don't translate):

1. X (max 240 chars, NO URL, no hashtags) — punchy hook, name 1-2 ideas by bucket. Tag X @handles if provided. The publisher adds the link in a self-reply.

2. Threads (max 480 chars, NO URL) — warmer paragraph, name 2-3 highlights by bucket. Tag Threads @handles if provided. 2-3 hashtags at end.

3. Bluesky (max 270 chars INCLUDING URL + hashtags) — short tease, include the URL. 2-3 hashtags. Tag bsky @handles if provided.

4. Facebook (max 500 chars, NO URL, no hashtags) — community-board voice. Walk through 3-4 ideas. Tag FB @handles if provided.

5. Instagram (max 1800 chars, NO URL) — IG caption. Hook in the first line. Walk through the ideas by bucket. Tag IG @handles if provided. End with 8-12 hashtags after a blank line.

6. Mastodon (max 480 chars INCLUDING URL + hashtags) — write a DISTINCT variant from Bluesky: different opener, different rhythm, slightly more descriptive (Mastodon culture is less marketing-y). Include URL. 1-2 hashtags. Do not return identical or near-identical text to Bluesky.

7. Email (max 600 chars, NO URL) — 2-4 sentences for the morning newsletter. Plain place names (no @-handles), no hashtags, no "see link below" / "all mapped here" CTA tails — the email shows the image and a "See the full plan" button below.

ALSO write an X poll variant. The publisher uses this on every ~3rd day-plan publish to drive engagement (polls boost X reach 2-3x and force a pick-one commitment from followers).

8. pollX — an object: { text: string ≤200 chars, options: string[] of exactly 4 entries each ≤25 chars }. The "text" is the poll question — short, punchy, no hashtags, no URL ("Wednesday in San Jose — pick your move?" / "${dayName} energy check?"). The "options" are 4 of the 6 ideas above, condensed to ≤25 chars each. Use short clear labels — pick the bucket label + a single key noun: "Breakfast: Bill's", "Hike: Rancho", "Live music: Cafe Stritch", "Dinner: Aqui". Choose 4 with the most distinct vibes so people actually have a choice.

LINK RULE — re-read: no URL anywhere in X, Threads, Facebook, Instagram, Email, pollX.

Return ONLY a JSON object with keys "x", "threads", "bluesky", "facebook", "instagram", "mastodon", "email", "pollX". No other text.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_COPY_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract JSON from Claude response");

  const variants = JSON.parse(jsonMatch[0]);
  if (!variants.mastodon) variants.mastodon = variants.bluesky;
  if (!variants.instagram) variants.instagram = variants.facebook;

  await resolveItemHandles(plan);
  applyTagSubstitutions(variants, plan);
  recordUntaggedItem(plan, { slot: "day-plan" });

  stripUrlsFromNoUrlPlatforms(variants);
  enforceHardLimits(variants);

  return variants;
}

/**
 * Generate copy for a TONIGHT PICK post (11:45 AM slot).
 *
 * @param {object} item - Single event/restaurant item
 * @returns {Promise<{x: string, threads: string, bluesky: string, facebook: string, instagram: string, mastodon: string}>}
 */
export async function generateTonightPickCopy(item) {
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const mentions = mentionInstructions(item);
  const postUrl = item.planUrl || item.url;
  // Defense-in-depth: bail loudly instead of letting Claude write
  // "No URL provided" or splice in a generic homepage. Caller should pick
  // a different candidate.
  if (!isUsableSocialUrl(postUrl)) {
    throw new Error(`tonight-pick "${item.title || item.name}" has no usable URL (got "${postUrl}") — caller must filter`);
  }

  const prompt = `Write a social post recommending ONE thing to do TONIGHT in the South Bay. This is our midday "tonight pick" — make people excited about their evening.

ITEM:
- Title: ${item.title || item.name}
- City: ${item.cityName || item.city || ""}
- Venue: ${item.venue || ""}
- Time: ${item.time || "tonight"}
- Category: ${item.category || ""}
- Summary: ${(item.summary || item.blurb || "").slice(0, 300)}
- Cost: ${item.costNote || item.cost || ""}

URL FOR BLUESKY/MASTODON ONLY: ${postUrl}
${mentions}

Frame this as a TONIGHT recommendation. "Tonight in the South Bay..." energy. One great thing, full enthusiasm.

Write seven MAIN variants — each NATIVE to its platform (don't translate):

1. X (max 240 chars, NO URL, no hashtags) — punchy hook. Tag X @handle if provided. Publisher adds a self-reply with the link.

2. Threads (max 480 chars, NO URL) — conversational. Tag Threads @handles if provided. 2-3 hashtags.

3. Bluesky (max 270 chars INCLUDING URL + hashtags) — include URL. 2-3 hashtags. Tag bsky @handles if provided.

4. Facebook (max 500 chars, NO URL, no hashtags) — community-board voice. Tag FB @handles if provided.

5. Instagram (max 1800 chars, NO URL) — caption, hook first line. Tag IG @handles if provided. 8-12 hashtags after a blank line at end.

6. Mastodon (max 480 chars INCLUDING URL + hashtags) — write a DISTINCT variant from Bluesky: different opener, different rhythm, slightly more descriptive (Mastodon culture is less marketing-y). Include URL. 1-2 hashtags. Do not return identical or near-identical text to Bluesky.

7. Email (max 400 chars, NO URL) — 1-3 sentences. Plain place names (no @-handles), no hashtags, no "tap the link" CTA tails — the email has an image and a "Get tickets" button below.

ALSO write three SHORT "doors-in-30" follow-up bumps. The publisher will post these as replies to the main post about 30 min before the event starts, catching the after-work "what should I do tonight?" audience. Style: one tight sentence each, present-tense urgency. NO URL (the parent already has it). Tag the same @handles you used in the main post.

8. bumpX (max 200 chars) — punchy reminder for X. "Doors in 30..." / "Starting soon..." / "Tonight at 8 PM..." style. No hashtags. 1 emoji max.

9. bumpThreads (max 200 chars) — same vibe as bumpX, Threads-flavored. 1 hashtag OK.

10. bumpBluesky (max 200 chars) — same energy. 1-2 hashtags OK.

LINK RULE — re-read: no URL in X, Threads, Facebook, Instagram, Email, or any bump variant.

Return ONLY a JSON object with keys "x", "threads", "bluesky", "facebook", "instagram", "mastodon", "email", "bumpX", "bumpThreads", "bumpBluesky". No other text.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_COPY_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract JSON from Claude response");

  const variants = JSON.parse(jsonMatch[0]);
  if (!variants.mastodon) variants.mastodon = variants.bluesky;
  if (!variants.instagram) variants.instagram = variants.facebook;

  await resolveItemHandles(item);
  applyTagSubstitutions(variants, item);
  recordUntaggedItem(item, { slot: "tonight-pick" });

  stripUrlsFromNoUrlPlatforms(variants);
  enforceHardLimits(variants);

  return variants;
}

/**
 * Generate copy for a WILDCARD post (4:30 PM slot).
 * Dispatches based on content subtype.
 *
 * @param {object} item - Content item
 * @param {string} subtype - "sv-history" | "restaurant" | "general"
 * @param {string} [postDateStr] - YYYY-MM-DD the post will publish on. SV history copy
 *   needs this so "today" reads correctly when the post lands (vs. generation time).
 * @returns {Promise<{x: string, threads: string, bluesky: string, facebook: string, instagram: string, mastodon: string}>}
 */
export async function generateWildcardCopy(item, subtype = "general", postDateStr = null) {
  // SV History has its own generator
  if (subtype === "sv-history" && item.foundedYear) {
    const ptTime = postDateStr
      ? new Date(new Date(postDateStr + "T12:00:00").toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
      : new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const variants = await generateSvHistoryCopy(item, ptTime);
    if (!variants.instagram) variants.instagram = variants.facebook;
    return variants;
  }

  // Restaurant openings and general items use the single-item generator
  // with a subtype-aware framing
  return generateSingleItemCopy(item, "afternoon");
}
