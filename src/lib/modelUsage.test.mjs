import test from "node:test";
import assert from "node:assert/strict";
import { usageEvidence } from "./modelUsage.mjs";

test("cost evidence counts uncached input, writes, reads and output separately", () => {
  const record = usageEvidence({ feature: "test", model: "claude-sonnet-5-5", usage: {
    input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6,
    cache_creation_input_tokens: 2e6, cache_creation: { ephemeral_1h_input_tokens: 1e6 },
  } });
  assert.equal(record.estimatedUsd, 18.6);
  assert.equal(usageEvidence({ feature: "default-plan", provider: "codex-subscription", model: "gpt-6.1-sol", usage: { input_tokens: 1000 } }).estimatedUsd, 0);
});
