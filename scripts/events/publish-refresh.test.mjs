import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { REQUIRED_SOURCE_IDS } from "./event-refresh-health.mjs";
import { publishEventRefresh } from "./publish-refresh.mjs";

const OUTPUT = "src/data/south-bay/upcoming-events.json";
const SNAPSHOT = "src/data/south-bay/playwright-events.json";

function git(repo, ...args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function put(repo, path, data) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");
}

function commit(repo, message) {
  git(repo, "add", ".");
  git(repo, "commit", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function output(id) {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    eventCount: 1,
    events: [{ id }],
    sourceHealth: REQUIRED_SOURCE_IDS.map((id) => ({ id, label: id, status: "ok", count: 1 })),
    inputSnapshots: ["playwright-events", "inbound-events"].map((name) => ({ name, status: "ok", timestamp: now })),
  };
}

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "sbt-refresh-push-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, "remote.git"), seed = join(root, "seed"), checkout = join(root, "checkout");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "clone", remote, seed);
  git(seed, "config", "user.name", "SBT test");
  git(seed, "config", "user.email", "test@southbaytoday.org");
  put(seed, OUTPUT, output("previous"));
  put(seed, SNAPSHOT, { events: [{ id: "previous-input" }] });
  commit(seed, "previous events");
  git(seed, "push", "-u", "origin", "main");
  git(root, "clone", remote, checkout);
  git(checkout, "config", "user.name", "SBT test");
  git(checkout, "config", "user.email", "test@southbaytoday.org");
  put(checkout, OUTPUT, output("fresh"));
  const local = commit(checkout, "chore: refresh upcoming events");
  return { remote, seed, checkout, local };
}

test("publication retries the rejected push and preserves the competing fact-check and Mini snapshot", (t) => {
  const { remote, seed, checkout, local } = setup(t);
  let competing;
  const logs = [];
  const result = publishEventRefresh({ repoRoot: checkout, log(line) {
    logs.push(line);
    // Reproduce the exact race: another writer advances main after the fetch.
    if (!competing && line.includes("verified state=")) {
      put(seed, "src/data/south-bay/tech-companies.ts", "export const companies = [];\n");
      put(seed, "docs/qa/fact-check.md", "Source-verified correction\n");
      put(seed, SNAPSHOT, { events: [{ id: "newer-mini-input" }] });
      competing = commit(seed, "fact-check: exclude out-of-county funding round");
      git(seed, "push");
    }
  } });
  assert.equal(result.pushed, true);
  assert.ok(logs.some((line) => /push attempt 1\/3 failed:.*(?:fetch first|rejected)/s.test(line)), logs.join("\n"));
  assert.equal(logs.filter((line) => line.startsWith("[events-publication] healthy:")).length, 2);
  assert.equal(git(remote, "rev-parse", "main"), result.head);
  for (const sha of [local, competing]) git(remote, "merge-base", "--is-ancestor", sha, "main");
  assert.equal(JSON.parse(git(remote, "show", `main:${OUTPUT}`)).events[0].id, "fresh");
  assert.equal(git(remote, "show", `main:${SNAPSHOT}`), git(seed, "show", `HEAD:${SNAPSHOT}`));
  assert.equal(git(remote, "show", "main:src/data/south-bay/tech-companies.ts"), "export const companies = [];");
  assert.equal(git(remote, "show", "main:docs/qa/fact-check.md"), "Source-verified correction");
});

test("overlapping event output takes the healthy remote correction", (t) => {
  const { remote, seed, checkout } = setup(t);
  put(seed, OUTPUT, output("editorial-correction"));
  commit(seed, "fact-check: correct event");
  git(seed, "push");
  const result = publishEventRefresh({ repoRoot: checkout, log() {} });
  assert.equal(result.pushed, true);
  assert.equal(JSON.parse(git(remote, "show", `main:${OUTPUT}`)).events[0].id, "editorial-correction");
});

test("an already-published no-op still verifies output health", (t) => {
  const { seed, checkout } = setup(t);
  publishEventRefresh({ repoRoot: checkout, log() {} });
  assert.equal(publishEventRefresh({ repoRoot: checkout, log() {} }).pushed, false);
  git(seed, "pull", "--ff-only");
  put(seed, OUTPUT, { ...output("broken"), eventCount: 99 });
  commit(seed, "invalid count fixture");
  git(seed, "push");
  git(checkout, "pull", "--ff-only");
  assert.throws(() => publishEventRefresh({ repoRoot: checkout, log() {} }), /eventCount 99 does not match 1 events/);
});

test("an unhealthy remote overlap after a rejected push fails the merged-output gate", (t) => {
  const { remote, seed, checkout, local } = setup(t);
  let competing;
  const logs = [];
  assert.throws(() => publishEventRefresh({ repoRoot: checkout, log(line) {
    logs.push(line);
    if (!competing && line.includes("verified state=")) {
      put(seed, OUTPUT, { ...output("remote-broken"), events: [], eventCount: 0 });
      competing = commit(seed, "competing incomplete data");
      git(seed, "push");
    }
  } }), /event publication blocked:.*contains no events/);
  assert.ok(logs.some((line) => /push attempt 1\/3 failed/.test(line)), logs.join("\n"));
  assert.equal(git(remote, "rev-parse", "main"), competing);
  const ancestry = spawnSync("git", ["-C", checkout, "merge-base", "--is-ancestor", local, "origin/main"]);
  assert.equal(ancestry.status, 1, "the rejected refresh must remain unpublished");
});

for (const field of ["output", "snapshot"]) {
  test(`publication retains the strict ${field} freshness ceiling`, (t) => {
    const { remote, checkout } = setup(t);
    const before = git(remote, "rev-parse", "main");
    const data = JSON.parse(readFileSync(join(checkout, OUTPUT), "utf8"));
    const stale = new Date(Date.now() - (field === "output" ? 2 : 9) * 3_600_000).toISOString();
    if (field === "output") data.generatedAt = stale;
    else data.inputSnapshots[0].timestamp = stale;
    put(checkout, OUTPUT, data);
    commit(checkout, "stale fixture");
    assert.throws(() => publishEventRefresh({ repoRoot: checkout, log() {} }), /event publication blocked:.*maximum (?:1|8)h/);
    assert.equal(git(remote, "rev-parse", "main"), before);
  });
}

test("publication stops after three competing-writer rejections", (t) => {
  const { remote, seed, checkout, local } = setup(t);
  let races = 0;
  assert.throws(() => publishEventRefresh({ repoRoot: checkout, log(line) {
    if (line.includes("verified state=")) {
      put(seed, "README.md", `competing update ${++races}\n`);
      commit(seed, "competing update");
      git(seed, "push");
    }
  } }), /after 3 attempts/);
  assert.equal(races, 3);
  assert.equal(git(remote, "rev-parse", "main"), git(seed, "rev-parse", "HEAD"));
  const ancestry = spawnSync("git", ["-C", checkout, "merge-base", "--is-ancestor", local, "origin/main"]);
  assert.equal(ancestry.status, 1);
});
