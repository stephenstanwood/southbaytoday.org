// Counts and estimates only. Never log prompts, source text, keys or reader data.
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Standard global API USD/MTok, verified 2026-10-29 against Anthropic pricing.
const PRICES = {
  "claude-sonnet-5-5": [2, 10, 0.10],
  "claude-opus-5-5": [4, 20, 0.20],
  "claude-fable-5-1": [10, 50, 0.25],
};

export function usageEvidence({ feature, provider = "anthropic-api", model, usage = {}, ...extra }) {
  const input = Number(usage.input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  const read = Number(usage.cache_read_input_tokens ?? usage.cached_input_tokens ?? 0);
  const write = Number(usage.cache_creation_input_tokens || 0);
  const hourWrite = Number(usage.cache_creation?.ephemeral_1h_input_tokens || 0);
  const price = PRICES[model];
  return {
    at: new Date().toISOString(), feature, provider, model,
    inputTokens: input, outputTokens: output, cacheReadTokens: read, cacheWriteTokens: write,
    estimatedUsd: provider === "codex-subscription" || provider === "claude-subscription" ? 0
      : price ? (input * price[0] + output * price[1] + read * price[2]
        + (write - hourWrite) * price[0] * 1.25 + hourWrite * price[0] * 2) / 1e6 : null,
    priceBasis: provider.endsWith("subscription") ? "included subscription usage; subject to plan limits" : "standard global list estimate, 2026-10-29",
    ...extra,
  };
}

export function recordModelUsage(fields) {
  const entry = usageEvidence(fields);
  console.log("[model-usage]", JSON.stringify(entry));
  try {
    if (!process.env.VERCEL) {
      const path = process.env.SBT_MODEL_USAGE_LOG || join(homedir(), "Library/Logs/sbt-model-usage.jsonl");
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, JSON.stringify(entry) + "\n", { mode: 0o600 });
    }
  } catch { /* Observability must not break a useful generation. */ }
  return entry;
}
