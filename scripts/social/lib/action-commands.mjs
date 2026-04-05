// ---------------------------------------------------------------------------
// South Bay Signal — Review Portal Action Commands
// Classifies reviewer comments with Claude and executes actions
// (block events, venues, sources; add penalty signals; flag errors)
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUDE_MODEL } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "..", "src", "data", "south-bay");
const BLACKLIST_FILE = join(DATA_DIR, "social-blacklist.json");
const EVENTS_FILE = join(DATA_DIR, "upcoming-events.json");
const ACTION_LOG_FILE = join(DATA_DIR, "social-action-log.json");
const REVIEW_HISTORY_FILE = join(DATA_DIR, "social-review-history.json");
function loadEnv() {
  if (!process.env.ANTHROPIC_API_KEY) {
    try {
      const envPath = join(__dirname, "..", "..", "..", ".env.local");
      const lines = readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
}

function loadBlacklist() {
  try {
    return JSON.parse(readFileSync(BLACKLIST_FILE, "utf8"));
  } catch {
    return { venues: [], sources: [], topics: [], phrases: [], penaltySignals: [] };
  }
}

function saveBlacklist(bl) {
  writeFileSync(BLACKLIST_FILE, JSON.stringify(bl, null, 2) + "\n");
}

function loadEvents() {
  try {
    return JSON.parse(readFileSync(EVENTS_FILE, "utf8"));
  } catch {
    return { events: [] };
  }
}

function saveEvents(data) {
  writeFileSync(EVENTS_FILE, JSON.stringify(data, null, 2) + "\n");
}

function loadActionLog() {
  try {
    return JSON.parse(readFileSync(ACTION_LOG_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveActionLog(log) {
  writeFileSync(ACTION_LOG_FILE, JSON.stringify(log, null, 2) + "\n");
}

// ── Claude classification ──────────────────────────────────────────────────

const CLASSIFY_PROMPT = `You are the action interpreter for The South Bay Signal review portal.
A reviewer left a comment while approving or rejecting a social media post. Your job is to determine if the comment contains actionable instructions.

Context about the post:
- Title: {title}
- Source: {source}
- Venue: {venue}
- City: {city}
- Category: {category}
- URL: {url}

Reviewer comment: "{comment}"

Classify into one or more actions. Return a JSON array of action objects.

Action types:
- block_event: Remove this specific event. Use when: "delete this", "remove", "kill it", "shouldn't be here"
- block_venue: Block all future events from this venue. Use when: "block this venue", "no more events from [venue]"
- block_source: Block all future events from this source/org. Use when: "block this source", "block [source name]"
- add_penalty_signal: Add a scoring penalty for a phrase/pattern. Use when: "stanford affiliates only", "members only", "not public", "too niche", "we don't cover [type]"
- flag_data_error: Flag incorrect data for correction. Use when: "wrong time", "wrong date", "wrong venue", "incorrect info"
- cancel_event: Event has been cancelled. Use when: "cancelled", "event cancelled"
- no_action: Comment is just editorial feedback, not an instruction. Use when: "looks good", "nice pick", "great copy", or any non-actionable note

Each action object should have:
- type: one of the action types above
- reason: brief explanation
- Plus type-specific fields:
  - block_event: no extra fields needed (uses post context)
  - block_venue: venue (string, the venue name to block)
  - block_source: source (string, the source name to block)
  - add_penalty_signal: signal (string, the phrase to penalize), penalty (number, suggested penalty like -20)
  - flag_data_error: issue (string, what's wrong)
  - cancel_event: no extra fields needed
  - no_action: no extra fields needed

If the comment is ambiguous or you're unsure, return: [{ "type": "needs_confirmation", "message": "..." }]

Return ONLY the JSON array, no markdown fences.`;

async function classifyComment(comment, context) {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("  ⚠ No ANTHROPIC_API_KEY — skipping action classification");
    return [{ type: "no_action", reason: "No API key" }];
  }

  const prompt = CLASSIFY_PROMPT
    .replace("{title}", context.title || "")
    .replace("{source}", context.source || "")
    .replace("{venue}", context.venue || "")
    .replace("{city}", context.city || "")
    .replace("{category}", context.category || "")
    .replace("{url}", context.url || "")
    .replace("{comment}", comment.replace(/"/g, '\\"'));

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error(`  ⚠ Claude API error: ${res.status}`);
      return [{ type: "no_action", reason: `API error ${res.status}` }];
    }
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim() || "[]";
    return JSON.parse(text);
  } catch (err) {
    console.error("  ⚠ Action classification failed:", err.message);
    return [{ type: "no_action", reason: err.message }];
  }
}

// ── Action executors ───────────────────────────────────────────────────────

async function executeBlockEvent(context) {
  const evData = loadEvents();
  const before = evData.events.length;
  evData.events = evData.events.filter((e) => {
    if (context.url && e.url === context.url) return false;
    if (context.title && e.title === context.title) return false;
    return true;
  });
  const removed = before - evData.events.length;
  if (removed > 0) {
    evData.eventCount = evData.events.length;
    saveEvents(evData);
  }

  // Also add to review history to prevent regeneration
  try {
    let history = [];
    try { history = JSON.parse(readFileSync(REVIEW_HISTORY_FILE, "utf8")); } catch {}
    history.push({
      title: context.title,
      url: context.url || null,
      vote: "blocked",
      comment: "Blocked via action command",
      reviewedAt: new Date().toISOString(),
    });
    writeFileSync(REVIEW_HISTORY_FILE, JSON.stringify(history, null, 2) + "\n");
  } catch {}

  return { ok: true, removed, detail: `Removed ${removed} event(s) from upcoming-events.json` };
}

function executeBlockVenue(venue) {
  const bl = loadBlacklist();
  const normalized = venue.toLowerCase().trim();
  if (!bl.venues.some((v) => v.toLowerCase() === normalized)) {
    bl.venues.push(venue);
    saveBlacklist(bl);
    return { ok: true, detail: `Added "${venue}" to venue blacklist` };
  }
  return { ok: true, detail: `"${venue}" already in venue blacklist` };
}

function executeBlockSource(source) {
  const bl = loadBlacklist();
  const normalized = source.toLowerCase().trim();
  if (!bl.sources.some((s) => s.toLowerCase() === normalized)) {
    bl.sources.push(source);
    saveBlacklist(bl);
    return { ok: true, detail: `Added "${source}" to source blacklist` };
  }
  return { ok: true, detail: `"${source}" already in source blacklist` };
}

function executeAddPenaltySignal(signal, penalty = -20, reason = "") {
  const bl = loadBlacklist();
  if (!bl.penaltySignals) bl.penaltySignals = [];
  const normalized = signal.toLowerCase().trim();
  if (!bl.penaltySignals.some((s) => s.phrase.toLowerCase() === normalized)) {
    bl.penaltySignals.push({
      phrase: signal.toLowerCase(),
      penalty,
      addedAt: new Date().toISOString(),
      reason,
    });
    saveBlacklist(bl);
    return { ok: true, detail: `Added penalty signal "${signal}" (${penalty})` };
  }
  return { ok: true, detail: `"${signal}" already in penalty signals` };
}

async function executeFlagDataError(context, issue) {
  const msg = `🔧 **Data Error Flagged**\n**Event:** ${context.title}\n**Issue:** ${issue}\n**Source:** ${context.source || "unknown"}\n**URL:** ${context.url || "none"}`;
  try {
    await fetch(process.env.DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg }),
    });
  } catch (err) {
    console.error("  ⚠ Discord notification failed:", err.message);
  }
  return { ok: true, detail: `Data error flagged: ${issue}` };
}

async function executeCancelEvent(context) {
  const result = await executeBlockEvent(context);
  return { ok: true, detail: `Event cancelled and ${result.detail}` };
}

async function executeNeedsConfirmation(message, context) {
  const msg = `❓ **Action Confirmation Needed**\n**Event:** ${context.title}\n**Message:** ${message}\n\nReviewer comment was ambiguous — please clarify in the portal.`;
  try {
    await fetch(process.env.DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg }),
    });
  } catch (err) {
    console.error("  ⚠ Discord notification failed:", err.message);
  }
  return { ok: true, detail: `Sent confirmation request to Discord` };
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Classify a reviewer comment and execute any actions.
 * @param {string} comment - The reviewer's comment
 * @param {object} context - Post context: { title, source, venue, city, category, url }
 * @returns {Promise<{ actions: Array<{ type: string, result: object }>, summary: string }>}
 */
export async function processComment(comment, context) {
  if (!comment || !comment.trim()) {
    return { actions: [], summary: "" };
  }

  console.log(`  🔍 Classifying comment: "${comment}"`);
  const classified = await classifyComment(comment, context);
  console.log(`  📋 Actions: ${JSON.stringify(classified)}`);

  const results = [];

  for (const action of classified) {
    let result;
    switch (action.type) {
      case "block_event":
        result = await executeBlockEvent(context);
        break;
      case "block_venue":
        result = executeBlockVenue(action.venue || context.venue || "");
        break;
      case "block_source":
        result = executeBlockSource(action.source || context.source || "");
        break;
      case "add_penalty_signal":
        result = executeAddPenaltySignal(action.signal || "", action.penalty || -20, action.reason || comment);
        break;
      case "flag_data_error":
        result = await executeFlagDataError(context, action.issue || comment);
        break;
      case "cancel_event":
        result = await executeCancelEvent(context);
        break;
      case "needs_confirmation":
        result = await executeNeedsConfirmation(action.message || comment, context);
        break;
      case "no_action":
        result = { ok: true, detail: "No action needed" };
        break;
      default:
        result = { ok: false, detail: `Unknown action type: ${action.type}` };
    }
    results.push({ type: action.type, reason: action.reason || "", result });
    console.log(`  ✅ ${action.type}: ${result.detail}`);
  }

  // Log all actions
  const log = loadActionLog();
  log.push({
    timestamp: new Date().toISOString(),
    comment,
    postTitle: context.title || "",
    postUrl: context.url || "",
    actions: results,
  });
  // Keep last 500 entries
  if (log.length > 500) log.splice(0, log.length - 500);
  saveActionLog(log);

  const actionSummaries = results
    .filter((r) => r.type !== "no_action")
    .map((r) => r.result.detail);
  const summary = actionSummaries.length > 0 ? actionSummaries.join("; ") : "";

  return { actions: results, summary };
}
