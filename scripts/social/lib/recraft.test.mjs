import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateRecraftImage, generateAndUploadResized } from "./recraft.mjs";

function isolate(t) {
  assert.ok(process.env.NODE_TEST_CONTEXT);
  const directory = mkdtempSync(join(tmpdir(), "sbt-recraft-test-"));
  const previous = {
    RECRAFT_API_KEY: process.env.RECRAFT_API_KEY,
    SBT_NOTIFICATION_TEST_DIR: process.env.SBT_NOTIFICATION_TEST_DIR,
  };
  process.env.RECRAFT_API_KEY = "fixture-key";
  process.env.SBT_NOTIFICATION_TEST_DIR = directory;
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function notifications(directory) {
  return readdirSync(directory).filter(name => name.endsWith(".json"))
    .map(name => JSON.parse(readFileSync(join(directory, name), "utf8")));
}

test("successful image generation downloads the image without an outage alert", async t => {
  const directory = isolate(t);
  const image = Buffer.from("fixture-image");
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) {
      return { ok: true, json: async () => ({ data: [{ url: "https://fixture.invalid/image.png" }] }) };
    }
    assert.equal(url, "https://fixture.invalid/image.png");
    return { ok: true, arrayBuffer: async () => image };
  });
  const result = await generateRecraftImage({ prompt: "fixture prompt" });
  assert.equal(typeof generateAndUploadResized, "function");
  assert.deepEqual(result, { buffer: image, recraftUrl: "https://fixture.invalid/image.png" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://external.api.recraft.ai/v1/images/generations");
  assert.equal(calls[0].init.headers.Authorization, "Bearer fixture-key");
  assert.deepEqual(notifications(directory), []);
});

test("credit and quota failures retain their API error and queue one isolated alert", async t => {
  for (const detail of ["not_enough_credits", "insufficient credit", "credit balance too low", "quota exceeded"]) {
    await t.test(detail, async t => {
      const directory = isolate(t);
      const calls = [];
      t.mock.method(globalThis, "fetch", async url => {
        calls.push(url);
        assert.equal(url, "https://external.api.recraft.ai/v1/images/generations");
        return { ok: false, status: 402, text: async () => detail };
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        await assert.rejects(generateRecraftImage({ prompt: "fixture" }), {
          message: `Recraft API error (402): ${detail}`,
        });
      }
      const alerts = notifications(directory);
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].producer, "southbaytoday-recraft-credits");
      assert.match(alerts[0].content, /^Recraft API out of credits\n/);
      assert.ok(alerts[0].content.includes(detail));
      assert.equal(calls.length, 2);
      assert.deepEqual(readdirSync(join(directory, "cooldowns")), ["sbt-notify-recraft-credits.ts"]);
    });
  }
});

test("other API failures do not report credit exhaustion", async t => {
  const directory = isolate(t);
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 401, text: async () => "invalid API key" }));
  await assert.rejects(generateRecraftImage({ prompt: "fixture" }), {
    message: "Recraft API error (401): invalid API key",
  });
  assert.deepEqual(notifications(directory), []);
});

test("an unavailable notification sink cannot mask the Recraft error or reach live intake", async t => {
  const directory = isolate(t);
  const blocked = join(directory, "blocked");
  writeFileSync(blocked, "fixture");
  process.env.SBT_NOTIFICATION_TEST_DIR = blocked;
  const errors = [];
  t.mock.method(console, "error", message => errors.push(message));
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(url, "https://external.api.recraft.ai/v1/images/generations");
    return { ok: false, status: 402, text: async () => "not_enough_credits" };
  });
  await assert.rejects(generateRecraftImage({ prompt: "fixture" }), {
    message: "Recraft API error (402): not_enough_credits",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /intake failed; source retained:/);
  assert.deepEqual(notifications(directory), []);
});

test("retired Reddit refresh and backfill never call providers or rewrite cached data", t => {
  const directory = isolate(t);
  const preload = join(directory, "forbid-network.mjs");
  writeFileSync(preload, `globalThis.fetch = () => { process.exit(97); };`);
  const files = ["reddit-pulse.json", "reddit-gaps.json", "reddit-image-cache.json", "places.json", "scc-food-openings.json"];
  const before = files.map(name => {
    const file = new URL(`../../../src/data/south-bay/${name}`, import.meta.url);
    return { file, bytes: readFileSync(file) };
  });
  for (const name of ["generate-reddit-pulse.mjs", "backfill-places-from-reddit.mjs"]) {
    const script = fileURLToPath(new URL(`../../${name}`, import.meta.url));
    const output = execFileSync(process.execPath, ["--import", pathToFileURL(preload).href, script], {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, ANTHROPIC_API_KEY: "", RECRAFT_API_KEY: "", GOOGLE_PLACES_API_KEY: "" },
    });
    assert.match(output, /is retired; no data fetched or changed/);
  }
  for (const { file, bytes } of before) assert.deepEqual(readFileSync(file), bytes);
  assert.deepEqual(notifications(directory), []);
});
