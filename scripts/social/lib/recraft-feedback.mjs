// ---------------------------------------------------------------------------
// South Bay Today — Recraft Image Feedback Loop
// Tracks accept/reject outcomes per prompt + style, feeds learnings back
// into style selection weights and prompt generation guidance.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDBACK_PATH = join(__dirname, "..", "..", "..", "src", "data", "south-bay", "recraft-feedback.json");

// Minimum samples before a style's weight diverges from baseline
const MIN_SAMPLES = 3;
// Baseline weight for styles with no data (ensures they still get picked)
const BASELINE_WEIGHT = 1.0;
// Cap so no single style dominates completely
const MAX_WEIGHT = 3.0;

/**
 * Read the feedback log. Returns [] if file doesn't exist.
 * @returns {Array<{date: string, slot: string, style: string, prompt: string, outcome: "approved"|"rejected", ts: string}>}
 */
export function readFeedback() {
  try {
    if (!existsSync(FEEDBACK_PATH)) return [];
    return JSON.parse(readFileSync(FEEDBACK_PATH, "utf8"));
  } catch {
    return [];
  }
}

/**
 * Append one feedback entry to the log.
 */
export function logFeedback({ date, slot, style, prompt, outcome }) {
  const entries = readFeedback();
  entries.push({ date, slot, style, prompt: (prompt || "").slice(0, 1000), outcome, ts: new Date().toISOString() });
  writeFileSync(FEEDBACK_PATH, JSON.stringify(entries, null, 2));
}

/**
 * Compute acceptance-rate weights for each style ID.
 * Returns a Map<styleId, weight> where higher = more likely to be picked.
 *
 * Styles with fewer than MIN_SAMPLES entries get BASELINE_WEIGHT.
 * Weight = acceptRate * 2 + 0.5 (so 100% accept → 2.5, 0% → 0.5, 50% → 1.5)
 */
export function getStyleWeights() {
  const entries = readFeedback();
  const stats = {}; // { styleId: { approved: n, rejected: n } }

  for (const e of entries) {
    if (!e.style || e.style === "abstract" || e.style === "upload" || e.style === "novel") continue;
    if (!stats[e.style]) stats[e.style] = { approved: 0, rejected: 0 };
    stats[e.style][e.outcome === "approved" ? "approved" : "rejected"]++;
  }

  const weights = new Map();
  for (const [style, s] of Object.entries(stats)) {
    const total = s.approved + s.rejected;
    if (total < MIN_SAMPLES) {
      weights.set(style, BASELINE_WEIGHT);
    } else {
      const rate = s.approved / total;
      weights.set(style, Math.min(rate * 2 + 0.5, MAX_WEIGHT));
    }
  }

  return weights;
}

/**
 * Extract prompt guidance from feedback history for buildImagePrompt().
 * Returns { goodExamples: string[], avoidPatterns: string[] }
 */
export function getPromptGuidance() {
  const entries = readFeedback();
  // Only use abstract prompts (not day-plan poster prompts which are structural)
  const abstracts = entries.filter((e) => e.style === "abstract" && e.prompt);

  const approved = abstracts.filter((e) => e.outcome === "approved");
  const rejected = abstracts.filter((e) => e.outcome === "rejected");

  // Take most recent 5 approved prompts as positive examples
  const goodExamples = approved
    .slice(-5)
    .map((e) => e.prompt.slice(0, 200));

  // Take most recent 5 rejected prompts — extract what to avoid
  const avoidPatterns = rejected
    .slice(-5)
    .map((e) => e.prompt.slice(0, 200));

  return { goodExamples, avoidPatterns };
}
