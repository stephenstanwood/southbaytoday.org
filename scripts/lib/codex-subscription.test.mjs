import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodexPlanEditorial, latestStableSol, subscriptionEnvironment } from "./codex-subscription.mjs";

const model = slug => ({ slug, supported_reasoning_levels: [{ effort: "max" }] });
test("live stable Sol discovery excludes preview and sorts versions numerically", () => {
  assert.equal(latestStableSol({ models: [model("gpt-6-sol"), model("gpt-6.1-sol"), model("gpt-6.2-sol-preview")] }), "gpt-6.1-sol");
});
test("subscription process cannot inherit API credentials or endpoint overrides", () => {
  assert.deepEqual(subscriptionEnvironment({ HOME: "/home/test", PATH: "/bin", CODEX_API_KEY: "bad", OPENAI_API_KEY: "bad",
    CODEX_ACCESS_TOKEN: "bad", OPENAI_BASE_URL: "bad", ANTHROPIC_API_KEY: "bad" }), { HOME: "/home/test", PATH: "/bin" });
});
test("defaults require ChatGPT login; API-key login never generates", () => {
  assert.throws(() => createCodexPlanEditorial({ run: () => ({ status: 0, stdout: "Logged in using an API key", stderr: "" }) }), /require ChatGPT subscription auth/);
});
test("structured subscription execution pins auth/provider and reuses a completed result", async t => {
  const root = mkdtempSync(join(tmpdir(), "sbt-codex-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  let generations = 0;
  const editorial = createCodexPlanEditorial({ cacheRoot: root, env: { HOME: root, CODEX_API_KEY: "must-not-leak" },
    run: (_cli, args, opts) => {
      assert.equal(opts.env.CODEX_API_KEY, undefined);
      if (args[0] === "login") return { status: 0, stdout: "", stderr: "Logged in using ChatGPT" };
      if (args[0] === "debug") return { status: 0, stdout: JSON.stringify({ models: [model("gpt-6.1-sol")] }) };
      generations++;
      assert.ok(args.includes("--ignore-user-config"));
      assert.ok(args.includes('forced_login_method="chatgpt"'));
      assert.ok(args.includes('model_reasoning_effort="max"'));
      const pairs = ["morning", "afternoon", "evening"].map(pillarBucket => ({ pillarBucket, pillarId: `event:${pillarBucket}`, mealId: `place:${pillarBucket}`, pillarBlurb: "Source fact.", mealBlurb: "Source fact." }));
      writeFileSync(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ pairs }));
      return { status: 0, stdout: JSON.stringify({ type: "turn.completed", usage: { input_tokens: 15, output_tokens: 5 } }) };
    } });
  assert.equal(JSON.parse(await editorial.select("source-locked prompt")).length, 3);
  await editorial.select("source-locked prompt");
  assert.equal(generations, 1);
});
