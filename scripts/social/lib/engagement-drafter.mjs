// ---------------------------------------------------------------------------
// Engagement Drafter
// Stage 1: scoreRelevance — Haiku decides if a post is worth replying to
// Stage 2: draftReply — Sonnet writes the actual reply
// ---------------------------------------------------------------------------

import { CLAUDE_MODEL, CLAUDE_COPY_MODEL } from "./constants.mjs";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

const SCORING_PROMPT = `You are deciding whether @southbaytoday should reply to this Bluesky post.

@southbaytoday is a hyperlocal Santa Clara County (South Bay, CA) news/events brand. Voice: a smart, well-informed neighbor — not a corporate account.

Reply when ALL of these are true:
- Post is about the South Bay (San Jose, Campbell, Los Gatos, Saratoga, Cupertino, Sunnyvale, Mountain View, Palo Alto, Santa Clara, Los Altos, Milpitas) OR a regional topic that affects SB residents
- @southbaytoday can add genuine value: a specific fact, an event/business name, context, or a thoughtful question
- The post is NOT political-partisan, NOT a personal moment (birthday/baby/grief), NOT requesting privacy

Do NOT reply for:
- Posts where the only thing to add is "great post!" or generic enthusiasm
- Posts where SBT can't add concrete information
- Self-promotional content from competing news brands
- Pure opinion / hot-takes with no factual hook

Output STRICT JSON only, no preamble:
{"worthReplying": true|false, "reason": "one sentence", "angle": "one sentence on the specific value SBT would add — empty string if worthReplying is false"}

Post by @{handle}: "{text}"`;

const DRAFTING_PROMPT = `Write a Bluesky reply from @southbaytoday to the post below.

Voice: smart, helpful neighbor. Conversational. Not corporate. Lowercase if natural.

Hard rules:
- Under 240 chars (Bluesky cap is 300, leave room)
- NO "Great post!", "Thanks for sharing!", "fascinating", "absolutely", "as someone who…"
- NO emojis as decoration (one is fine if it's actually useful)
- BE SPECIFIC: name a business, an event, a date, a fact

Add information. Don't add enthusiasm.

If the angle calls for linking to existing SBT coverage, write the link as southbaytoday.org/[reasonable-path]. Only include a link if it sharpens the reply — never as filler. Don't invent paths to articles you can't verify.

Output ONLY the reply text. No quotes around it. No preamble.

Original post by @{handle}: "{text}"
Angle: {angle}`;

async function callClaude(model, prompt, maxTokens = 500) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || "";
}

export async function scoreRelevance(post) {
  const prompt = SCORING_PROMPT
    .replace("{handle}", post.author)
    .replace("{text}", (post.text || "").replace(/\n/g, " "));
  try {
    const raw = await callClaude(CLAUDE_MODEL, prompt, 400);
    // Strip code fences if Claude wrapped JSON in them
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const json = JSON.parse(cleaned);
    return {
      worthReplying: !!json.worthReplying,
      reason: json.reason || "",
      angle: json.angle || "",
    };
  } catch (err) {
    return { worthReplying: false, reason: `scoring error: ${err.message}`, angle: "" };
  }
}

export async function draftReply(post, angle) {
  const prompt = DRAFTING_PROMPT
    .replace("{handle}", post.author)
    .replace("{text}", (post.text || "").replace(/\n/g, " "))
    .replace("{angle}", angle);
  const text = await callClaude(CLAUDE_COPY_MODEL, prompt, 400);
  const cleaned = text.replace(/^["']|["']$/g, "").trim();
  if (cleaned.length > 280) {
    const trimmed = cleaned.slice(0, 277);
    const lastSpace = trimmed.lastIndexOf(" ");
    return (lastSpace > 200 ? trimmed.slice(0, lastSpace) : trimmed) + "…";
  }
  return cleaned;
}
