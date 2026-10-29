import test from "node:test";
import assert from "node:assert/strict";
import { generateDefaultPlanSet } from "./default-plan-generation.mjs";

test("four atomic defaults preserve audience/date and both cross-day variety seeds", async () => {
  const calls = [];
  const previous = { plans: { adults: { cards: [{ name: "Adult Yesterday" }] }, kids: { cards: [{ name: "Kids Yesterday" }] } } };
  const result = await generateDefaultPlanSet({ today: "2026-10-31", previous,
    generate: async input => { calls.push(input); return { editorialProvider: "codex-subscription", cards: [{ name: input.kids ? "Kids Today" : "Adult Today" }] }; },
    validate: () => ({ ok: true }) });
  assert.deepEqual(Object.keys(result.plans), ["adults", "kids", "adults:tomorrow", "kids:tomorrow"]);
  assert.deepEqual(calls.map(c => [c.kids, c.planDate]), [[false, "2026-10-31"], [true, "2026-10-31"], [false, "2026-11-01"], [true, "2026-11-01"]]);
  assert.equal(calls[1].recentlyShown[0].name, "kids yesterday");
  assert.deepEqual(calls[2].recentlyShown.map(c => c.daysAgo), [2, 1]);
  assert.ok(calls.every(c => c.scope === "regional" && c.noCache));
});
test("failure or wrong billing lane rejects the entire publication unit", async () => {
  for (const generate of [async () => { throw Error("subscription capped"); }, async () => ({ editorialProvider: "anthropic-api", cards: [] })]) {
    await assert.rejects(generateDefaultPlanSet({ today: "2026-10-29", generate, validate: () => ({ ok: true }) }), /subscription/);
  }
});
