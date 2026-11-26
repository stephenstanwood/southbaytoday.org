import assert from "node:assert/strict";
import test from "node:test";
import { BATCH_WINDOW_MS, decideBuild } from "./vercel-ignore-build.mjs";

const now = Date.parse("2026-11-25T20:00:00Z");
const production = { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: "aaa", VERCEL_GIT_COMMIT_SHA: "bbb" };
const edit = (subject, minutesAgo, merge = false) => ({ subject, time: now - minutesAgo * 60_000, merge });

test("preview deployments stay skipped", () => {
  assert.equal(decideBuild({ env: { VERCEL_ENV: "preview" }, commits: [], now }).build, false);
});

test("recent fact-check and copy-edit commits wait for the batch", () => {
  const decision = decideBuild({
    env: production,
    commits: [edit("copy-edit: clarify three listings", 5), edit("Merge remote-tracking branch 'origin/main' into sbs-fact-check/x", 30, true), edit("fact-check: verify library hours", 40)],
    now,
  });
  assert.equal(decision.build, false, decision.reason);
});

test("a batch ships once its oldest edit has waited the window", () => {
  const minutes = BATCH_WINDOW_MS / 60_000;
  assert.equal(decideBuild({ env: production, commits: [edit("fact-check: a", minutes)], now }).build, true);
  assert.equal(decideBuild({ env: production, commits: [edit("fact-check: a", minutes - 1)], now }).build, false);
});

test("any other commit deploys at once and carries the batch", () => {
  for (const subject of ["chore: refresh event sources 2026-11-25 12:40 PT", "data: refresh homepage default plans via Codex", "fix photo costs (#360)", "clarify history park holiday tea details"]) {
    const decision = decideBuild({ env: production, commits: [edit("fact-check: a", 5), edit(subject, 1)], now });
    assert.equal(decision.build, true, subject);
  }
});

test("missing history, a redeploy of the live commit, or no live deployment builds", () => {
  assert.equal(decideBuild({ env: production, commits: null, now }).build, true);
  assert.equal(decideBuild({ env: { ...production, VERCEL_GIT_COMMIT_SHA: "aaa" }, commits: [], now }).build, true);
  assert.equal(decideBuild({ env: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "bbb" }, commits: [], now }).build, true);
  assert.equal(decideBuild({ env: production, commits: [edit("Merge branch 'x'", 1, true)], now }).build, true);
});
