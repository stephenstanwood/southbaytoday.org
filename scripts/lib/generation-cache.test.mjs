import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedGeneration } from "./generation-cache.mjs";

test("unchanged source/model/prompt reuses a validated digest; source and contract changes regenerate", async t => {
  const root = mkdtempSync(join(tmpdir(), "sbt-cache-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  let calls = 0;
  const base = { namespace: "digest", root, generate: async () => ({ summary: `result ${++calls}` }), validate: v => Boolean(v.summary) };
  const input = { source: "agenda one", prompt: "version 1", model: "sonnet" };
  assert.deepEqual(await cachedGeneration({ ...base, input }), await cachedGeneration({ ...base, input }));
  assert.equal(calls, 1);
  await cachedGeneration({ ...base, input: { ...input, source: "corrected agenda" } });
  await cachedGeneration({ ...base, input: { ...input, prompt: "version 2" } });
  await cachedGeneration({ ...base, input: { ...input, model: "new model" } });
  assert.equal(calls, 4);
});

test("failed or invalid generation is never cached", async t => {
  const root = mkdtempSync(join(tmpdir(), "sbt-cache-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  let calls = 0;
  const options = { namespace: "digest", root, input: {}, validate: v => v === "valid",
    generate: async () => { calls++; if (calls === 1) throw Error("capped"); return calls === 2 ? "bad" : "valid"; } };
  await assert.rejects(cachedGeneration(options), /capped/);
  await assert.rejects(cachedGeneration(options), /validation/);
  assert.equal(await cachedGeneration(options), "valid");
  assert.equal(await cachedGeneration(options), "valid");
  assert.equal(calls, 3);
});
