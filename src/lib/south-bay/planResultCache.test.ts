import test from "node:test";
import assert from "node:assert/strict";
import { planResultCache, planResultKey } from "./planResultCache";

test("full preference, date, source and model differences never collide", () => {
  const base = { date: "2026-10-29", sources: "one", model: "sonnet", preferences: { costBias: 1, outdoorBias: 0, categoryScores: { arts: 2 } } };
  assert.notEqual(planResultKey(base), planResultKey({ ...base, preferences: { ...base.preferences, costBias: 0, outdoorBias: 1 } }));
  for (const patch of [{ date: "2026-10-30" }, { sources: "two" }, { model: "other" }]) assert.notEqual(planResultKey(base), planResultKey({ ...base, ...patch }));
  assert.equal(planResultKey({ a: 1, b: 2 }), planResultKey({ b: 2, a: 1 }));
});
test("concurrent identical visitor requests share one generation, then reuse it", async () => {
  let calls = 0;
  const generate = async () => { calls++; await new Promise(r => setTimeout(r, 10)); return { editorialModel: "sonnet", cards: [] }; };
  const options = { persistent: false, log: () => {} };
  const key = "identical-request";
  const results = await Promise.all([planResultCache(key, generate, options), planResultCache(key, generate, options)]);
  assert.deepEqual(results[0], results[1]);
  await planResultCache(key, generate, options);
  assert.equal(calls, 1);
});
test("failed generation clears its lease and can recover", async () => {
  const options = { persistent: false, log: () => {} };
  await assert.rejects(planResultCache("failed", async () => { throw Error("network"); }, options));
  assert.deepEqual(await planResultCache("failed", async () => ({ editorialModel: "sonnet" }), options), { editorialModel: "sonnet" });
});
