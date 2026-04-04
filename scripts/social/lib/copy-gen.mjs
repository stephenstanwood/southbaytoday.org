// ---------------------------------------------------------------------------
// South Bay Signal — Copy Generation
// Uses Claude Sonnet to write platform-specific social copy
// ---------------------------------------------------------------------------

import { CLAUDE_MODEL, CONFIG } from "./constants.mjs";

const SYSTEM_PROMPT = `You are the social voice of South Bay Signal, a hyperlocal civic-awareness tool for the South Bay (San Jose, Campbell, Los Gatos, Saratoga, Cupertino, Sunnyvale, Mountain View, Palo Alto, Santa Clara, Los Altos, Milpitas).

VOICE RULES:
- Useful, optimistic, observant, local, light, readable, slightly playful
- NEVER snarky, cynical, preachy, partisan, alarmist, robotic, corporate, influencer-y
- NEVER use "Don't miss out!!!", "This is HUGE", "Residents are furious", "Here's what you need to know", "Top 10", "smash that link"
- NEVER use engagement bait or ask for likes/follows/comments
- Feel like a pleasant, highly informed local dashboard

CTA RULES:
- Soft and practical only: "More on South Bay Signal", "See today's full signal", "Browse tonight's picks", "Full weekend list on SBS"
- Never "What do you think?", "Comment below", "Like and follow"

HASHTAG RULES:
- Use sparingly or not at all. If used, max 2: #SouthBay #SanJose etc.

FORMAT RULES:
- Keep within platform character limits (X: 280 chars, Threads: 500 chars, Bluesky: 300 chars)
- Include the provided URL naturally
- Use line breaks for readability
- Prefer named places and specific details over vague descriptions`;

const FORMAT_PROMPTS = {
  daily_pulse: `Write a DAILY PULSE morning post for South Bay Signal.

ITEMS TO INCLUDE:
{items}

TARGET URL: {url}

Write three variants:
1. X (max 270 chars) — shortest, cleanest, most headline-like
2. Threads (max 490 chars) — slightly warmer, more conversational
3. Bluesky (max 290 chars) — same as X or slightly looser

Start with a casual morning greeting variation (not always "Good morning"). Mention 2-4 specific items by name/place. End with a soft CTA and the URL.

Return ONLY a JSON object with keys "x", "threads", "bluesky" — each a string. No other text.`,

  tonight: `Write a TONIGHT IN THE SOUTH BAY afternoon post.

ITEMS TO INCLUDE:
{items}

TARGET URL: {url}

Write three variants:
1. X (max 270 chars)
2. Threads (max 490 chars)
3. Bluesky (max 290 chars)

Frame as "a few good reasons to leave the house tonight" — practical, lightly playful, encourages action. Mention specific things people could do. End with CTA and URL.

Return ONLY a JSON object with keys "x", "threads", "bluesky" — each a string. No other text.`,

  weekend: `Write a WEEKEND ROUNDUP post for South Bay Signal.

ITEMS TO INCLUDE:
{items}

TARGET URL: {url}

Write three variants:
1. X (max 270 chars)
2. Threads (max 490 chars) — can be more detailed, list a few items
3. Bluesky (max 290 chars)

Frame as a curated weekend guide. Mention the count and a few highlights by name. Convey that the weekend looks pretty good. End with CTA and URL.

Return ONLY a JSON object with keys "x", "threads", "bluesky" — each a string. No other text.`,

  civic: `Write a CIVIC SIGNAL post for South Bay Signal.

ITEMS TO INCLUDE:
{items}

TARGET URL: {url}

Write three variants:
1. X (max 270 chars)
2. Threads (max 490 chars) — slightly more context, warmer
3. Bluesky (max 290 chars)

Frame as a digestible civic update. Be calm, clear, readable, lightly human. Distinguish between proposed/discussed/approved. Avoid jargon. End with CTA and URL.

Return ONLY a JSON object with keys "x", "threads", "bluesky" — each a string. No other text.`,
};

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

function formatItems(items) {
  return items
    .map((item, i) => {
      const parts = [`${i + 1}. "${item.title}"`];
      if (item.cityName) parts.push(`in ${item.cityName}`);
      if (item.venue) parts.push(`at ${item.venue}`);
      if (item.time) parts.push(`at ${item.time}`);
      if (item.summary) parts.push(`— ${item.summary.slice(0, 100)}`);
      return parts.join(" ");
    })
    .join("\n");
}

/**
 * Generate platform-specific copy for a post.
 *
 * @param {string} format - Post format (daily_pulse, tonight, weekend, civic)
 * @param {Array} items - Selected candidate items
 * @param {string} url - Target SBS URL
 * @returns {Promise<{x: string, threads: string, bluesky: string}>}
 */
export async function generateCopy(format, items, url) {
  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const template = FORMAT_PROMPTS[format];
  if (!template) throw new Error(`Unknown format: ${format}`);

  const prompt = template
    .replace("{items}", formatItems(items))
    .replace("{url}", url);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
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

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to extract JSON from Claude response: ${text.slice(0, 200)}`);
  }

  const variants = JSON.parse(jsonMatch[0]);

  // Validate all three variants exist
  if (!variants.x || !variants.threads || !variants.bluesky) {
    throw new Error("Missing platform variant in Claude response");
  }

  return variants;
}
