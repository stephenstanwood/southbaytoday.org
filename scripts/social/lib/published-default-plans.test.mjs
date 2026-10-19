import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { publishedDefaultPlans } from "./published-default-plans.mjs";
import { todayPT } from "./slot-scheduler.mjs";

const TODAY = todayPT();
const tomorrow = new Date(`${TODAY}T12:00:00Z`);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const TOMORROW = tomorrow.toISOString().slice(0, 10);
const PLANS = "src/data/south-bay/default-plans.json";
const runner = fileURLToPath(new URL("../scheduled-default-plans.mjs", import.meta.url));

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function completePlans() {
  const cards = ["morning:breakfast", "afternoon:lunch", "evening:dinner"].flatMap((pair) => {
    const [pillar, meal] = pair.split(":");
    return [
      { id: pillar, bucket: pillar, role: "pillar", pairedWithId: meal },
      { id: meal, bucket: meal, role: "paired-meal", pairedWithId: pillar, pairDistanceMiles: 1, pairLocationPrecision: "exact" },
    ];
  });
  return { plans: Object.fromEntries(["adults", "kids", "adults:tomorrow", "kids:tomorrow"].map((key) => [
    key, { planDate: key.includes(":") ? TOMORROW : TODAY, selectionModel: "pillar-pairs-v1", cards: structuredClone(cards) },
  ])) };
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "sbt-published-plans-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, "remote.git"), seed = join(root, "seed"), checkout = join(root, "checkout");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "clone", remote, seed);
  git(seed, "config", "user.name", "SBT Tests");
  git(seed, "config", "user.email", "tests@southbaytoday.org");
  mkdirSync(dirname(join(seed, PLANS)), { recursive: true });
  writeFileSync(join(seed, PLANS), "{}\n");
  writeFileSync(join(seed, "unrelated.txt"), "initial\n");
  git(seed, "add", "."); git(seed, "commit", "-m", "initial"); git(seed, "push", "-u", "origin", "main");
  git(root, "clone", remote, checkout);
  git(checkout, "fetch", "origin", "main");
  const lock = join(root, "busy-lock.sh");
  writeFileSync(lock, "#!/bin/sh\necho \"repo-lock: BUSY (held by 'events-refresh')\"\nexit 1\n"); chmodSync(lock, 0o755);
  function publish(data) {
    writeFileSync(join(seed, PLANS), JSON.stringify(data));
    git(seed, "add", PLANS); git(seed, "commit", "-m", "plans"); git(seed, "push");
    return git(seed, "rev-parse", "HEAD");
  }
  function run(...args) {
    return spawnSync(process.execPath, [runner, ...args], {
      encoding: "utf8",
      env: { ...process.env, NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT || "child-v8", SBT_NEWSLETTER_REPO_ROOT: checkout,
        SBT_REPO_LOCK_SCRIPT: lock, SBT_NOTIFICATION_TEST_DIR: join(root, "notifications") },
    });
  }
  return { root, seed, checkout, publish, run };
}

test("busy retry reads the actual remote publication without changing another job's checkout", (t) => {
  const f = fixture(t), head = f.publish(completePlans());
  const before = { head: git(f.checkout, "rev-parse", "HEAD"), remote: git(f.checkout, "rev-parse", "origin/main"), fetch: readFileSync(join(f.checkout, ".git/FETCH_HEAD"), "utf8") };
  writeFileSync(join(f.checkout, "unrelated.txt"), "another job's staged work\n");
  git(f.checkout, "add", "unrelated.txt");
  const index = readFileSync(join(f.checkout, ".git/index"));
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already verified on origin\/main.*busy retry is a no-op/);
  assert.match(result.stdout, new RegExp(head.slice(0, 12)));
  assert.equal(git(f.checkout, "rev-parse", "HEAD"), before.head);
  assert.equal(git(f.checkout, "rev-parse", "origin/main"), before.remote);
  assert.equal(readFileSync(join(f.checkout, ".git/FETCH_HEAD"), "utf8"), before.fetch);
  assert.deepEqual(readFileSync(join(f.checkout, ".git/index")), index);
  assert.equal(readFileSync(join(f.checkout, "unrelated.txt"), "utf8"), "another job's staged work\n");
});

test("local current plans do not hide missing remote publication", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.checkout, PLANS), JSON.stringify(completePlans()));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED: repo lock is busy/);
  assert.doesNotMatch(result.stdout, /busy retry is a no-op/);
});

test("stale, incomplete and broken remote plans never make a busy retry successful", (t) => {
  const f = fixture(t);
  for (const mutate of [
    (d) => { d.plans.adults.planDate = "2000-01-01"; },
    (d) => { delete d.plans["kids:tomorrow"]; },
    (d) => { d.plans.kids.cards[1].pairedWithId = "wrong"; },
  ]) {
    const data = completePlans(); mutate(data); f.publish(data);
    assert.equal(publishedDefaultPlans({ repoRoot: f.checkout, today: TODAY }), null);
  }
});

test("forced refresh and explicit preflight still require the shared lock", (t) => {
  const f = fixture(t); f.publish(completePlans());
  for (const flag of ["--force", "--preflight-only"]) {
    const result = f.run(flag);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BLOCKED: repo lock is busy/);
    assert.doesNotMatch(result.stdout, /busy retry is a no-op/);
  }
});
