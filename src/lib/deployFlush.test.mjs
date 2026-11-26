import assert from "node:assert/strict";
import test from "node:test";
import { MAIN_REFS_URL, flushBatchedDeploy, mainShaFromRefs } from "./deployFlush.mjs";

const live = "1111111111111111111111111111111111111111";
const ahead = "2222222222222222222222222222222222222222";
const refs = (main) =>
  `001e# service=git-upload-pack\n0000015b${main} HEAD\0multi_ack side-band-64k\n003f${main} refs/heads/main\n003f${"3".repeat(40)} refs/heads/other\n0000`;

test("reads main from a smart-HTTP ref advertisement", () => {
  assert.equal(mainShaFromRefs(refs(ahead)), ahead);
  assert.equal(mainShaFromRefs("garbage"), null);
});

test("does nothing while the live deployment is main", async () => {
  const calls = [];
  const result = await flushBatchedDeploy({
    liveSha: live,
    hookUrl: "https://api.vercel.com/v1/integrations/deploy/x",
    fetchImpl: async (url, init) => { calls.push([url, init?.method]); return new Response(refs(live)); },
  });
  assert.equal(result.flushed, false);
  assert.deepEqual(calls, [[MAIN_REFS_URL, undefined]]);
});

test("asks for a build when main is ahead or cannot be read", async () => {
  for (const advertisement of [refs(ahead), "unreadable"]) {
    const calls = [];
    const result = await flushBatchedDeploy({
      liveSha: live,
      hookUrl: "https://api.vercel.com/v1/integrations/deploy/x",
      fetchImpl: async (url, init) => { calls.push([url, init?.method]); return new Response(url === MAIN_REFS_URL ? advertisement : "{}"); },
    });
    assert.equal(result.flushed, true);
    assert.deepEqual(calls.at(-1), ["https://api.vercel.com/v1/integrations/deploy/x", "POST"]);
  }
});

test("reports a missing hook instead of failing", async () => {
  const result = await flushBatchedDeploy({ liveSha: live, hookUrl: "", fetchImpl: async () => { throw new Error("no calls"); } });
  assert.equal(result.flushed, false);
  assert.match(result.reason, /DEPLOY_FLUSH_HOOK_URL/);
});
