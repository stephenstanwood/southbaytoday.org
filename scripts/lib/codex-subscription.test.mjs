import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createCodexPlanEditorial, latestStableSol, subscriptionEnvironment, SELECTION_TIMEOUT_MS, SELECTION_ATTEMPTS } from "./codex-subscription.mjs";

const model = slug => ({ slug, supported_reasoning_levels: [{ effort: "max" }] });
test("live stable Sol discovery excludes preview and sorts versions numerically", () => {
  assert.equal(latestStableSol({ models: [model("gpt-6-sol"), model("gpt-6.1-sol"), model("gpt-6.2-sol-preview")] }), "gpt-6.1-sol");
});
test("subscription process cannot inherit API credentials or endpoint overrides", () => {
  assert.deepEqual(subscriptionEnvironment({ HOME: "/home/test", PATH: "/bin", CODEX_API_KEY: "bad", OPENAI_API_KEY: "bad",
    CODEX_ACCESS_TOKEN: "bad", OPENAI_BASE_URL: "bad", ANTHROPIC_API_KEY: "bad" }),
  { HOME: "/home/test", PATH: [dirname(process.execPath), "/bin"].join(delimiter) });
});
test("defaults require ChatGPT login; API-key login never generates", () => {
  assert.throws(() => createCodexPlanEditorial({ run: () => ({ status: 0, stdout: "Logged in using an API key", stderr: "" }) }), /require ChatGPT subscription auth/);
});
test("a Node-shebang Codex launcher works when the scheduler PATH has no node", t => {
  const root = mkdtempSync(join(tmpdir(), "sbt-codex-launcher-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cli = join(root, "codex");
  writeFileSync(cli, `#!/usr/bin/env node
if (process.argv[2] === "login") console.log("Logged in using ChatGPT");
else if (process.argv[2] === "debug") console.log(JSON.stringify({ models: [${JSON.stringify(model("gpt-6.1-sol"))}] }));
else process.exit(1);
`, { mode: 0o700 });
  // Exercise a real subprocess, not a spawn mock. This directory deliberately
  // contains no node executable, just like launchd's system-only PATH on Mini.
  const editorial = createCodexPlanEditorial({ cli, env: { HOME: root, PATH: root } });
  assert.equal(editorial.provider, "codex-subscription");
  assert.equal(editorial.model, "gpt-6.1-sol");
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

function selectorFixture(t, execute) {
  const root = mkdtempSync(join(tmpdir(), "sbt-codex-retry-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return createCodexPlanEditorial({ cacheRoot: root, env: { HOME: root },
    run: (_cli, args, options) => {
      if (args[0] === "login") return { status: 0, stdout: "Logged in using ChatGPT" };
      if (args[0] === "debug") return { status: 0, stdout: JSON.stringify({ models: [model("gpt-6.1-sol")] }) };
      return execute(args, options);
    } });
}
function completeSelection(args, blurb = "Complete source fact.") {
  const pairs = ["morning", "afternoon", "evening"].map(pillarBucket => ({
    pillarBucket, pillarId: `event:${pillarBucket}`, mealId: `place:${pillarBucket}`,
    pillarBlurb: blurb, mealBlurb: blurb,
  }));
  writeFileSync(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ pairs }));
  return { status: 0, stdout: JSON.stringify({ type: "turn.completed", usage: {} }) };
}

test("a timed-out selection retries once in a fresh process and ignores its partial output", async t => {
  const directories = [];
  const editorial = selectorFixture(t, (args, options) => {
    assert.equal(options.timeout, SELECTION_TIMEOUT_MS);
    assert.equal(SELECTION_TIMEOUT_MS, 240_000);
    directories.push(options.cwd);
    if (directories.length === 1) {
      completeSelection(args, "Uncommitted partial output.");
      return { error: Object.assign(new Error("spawn timed out"), { code: "ETIMEDOUT" }), status: null,
        stdout: JSON.stringify({ type: "turn.started" }) };
    }
    return completeSelection(args);
  });
  const pairs = JSON.parse(await editorial.select("exact source prompt"));
  assert.equal(directories.length, 2);
  assert.notEqual(directories[0], directories[1]);
  assert.ok(pairs.every(p => p.pillarBlurb === "Complete source fact."));
  await editorial.select("exact source prompt");
  assert.equal(directories.length, 2, "only the completed retry is cached");
});

test("transport retry is bounded and exhausted attempts never poison the recovery cache", async t => {
  let calls = 0, healthy = false;
  const editorial = selectorFixture(t, args => {
    calls++;
    return healthy ? completeSelection(args) : { status: null,
      error: Object.assign(new Error("spawn timed out"), { code: "ETIMEDOUT" }) };
  });
  await assert.rejects(editorial.select("same source"), /ETIMEDOUT.*no CLI events/);
  assert.equal(calls, SELECTION_ATTEMPTS);
  healthy = true;
  await editorial.select("same source");
  assert.equal(calls, SELECTION_ATTEMPTS + 1);
});

test("authentication and subscription caps fail immediately even with transport-like wording", async t => {
  for (const stderr of ["401 unauthorized: connection closed", "usage limit reached; timed out", "429 rate limit exceeded"]) {
    let calls = 0;
    const editorial = selectorFixture(t, () => { calls++; return { status: 1, stderr }; });
    await assert.rejects(editorial.select(stderr), /Codex subscription command failed/);
    assert.equal(calls, 1);
  }
});

test("a structured disconnected-stream failure retries with its failure detail retained", async t => {
  let calls = 0;
  const editorial = selectorFixture(t, args => ++calls === 1
    ? { status: 1, stdout: JSON.stringify({ type: "turn.failed", error: { message: "stream disconnected before completion" } }) }
    : completeSelection(args));
  await editorial.select("stream fixture");
  assert.equal(calls, 2);
});

test("non-transient CLI errors and incomplete turns never trigger a transport retry", async t => {
  for (const result of [{ status: 1, stderr: "invalid output schema" },
    { status: 0, stdout: JSON.stringify({ type: "turn.started" }) }]) {
    let calls = 0;
    const editorial = selectorFixture(t, () => { calls++; return result; });
    await assert.rejects(editorial.select("invalid fixture"), /invalid output schema|did not complete/);
    assert.equal(calls, 1);
  }
});
