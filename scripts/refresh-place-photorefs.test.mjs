import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const source = dirname(fileURLToPath(import.meta.url));
const dataPath = "src/data/south-bay/";
const initial = { _meta: {}, places: [{ id: "one", photoRef: "places/one/photos/old" }] };

function git(cwd, ...args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t, data = initial) {
  const root = mkdtempSync(join(tmpdir(), "photoref-mutex-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  const remote = join(root, "remote.git");
  const lock = join(root, "lock");
  const trace = join(root, "trace");
  const preload = join(root, "preload.mjs");
  const helper = join(root, "repo-lock.sh");
  mkdirSync(join(repo, "scripts/lib"), { recursive: true });
  mkdirSync(join(repo, dataPath), { recursive: true });
  for (const file of ["refresh-place-photorefs.mjs", "lib/env.mjs", "lib/io.mjs"]) {
    copyFileSync(join(source, file), join(repo, "scripts", file));
  }
  const write = (file, contents) => writeFileSync(join(repo, file), contents);
  write(dataPath + "places.json", JSON.stringify(data, null, 2));
  // Spaces in a propagated path must stay one git argument.
  write(dataPath + "shared plans.json", JSON.stringify({ nested: [initial.places[0]] }, null, 2));
  write(dataPath + "unrelated.json", '{"note":"original"}');
  write("notes.txt", "original\n");
  writeFileSync(trace, "");
  writeFileSync(helper, `#!/bin/bash
set -eu
case "$1" in
  acquire)
    if ! mkdir "$TEST_LOCK" 2>/dev/null; then
      echo "repo-lock: BUSY (held by '$(cat "$TEST_LOCK/owner")')" >&2
      printf 'busy\\n' >> "$TEST_TRACE"
      exit 1
    fi
    printf '%s' "$2" > "$TEST_LOCK/owner"
    printf 'acquire\\n' >> "$TEST_TRACE" ;;
  release)
    test "$(cat "$TEST_LOCK/owner")" = "$2"
    rm "$TEST_LOCK/owner"
    rmdir "$TEST_LOCK"
    printf 'release\\n' >> "$TEST_TRACE" ;;
  refresh)
    test "$(cat "$TEST_LOCK/owner")" = "$2"
    printf 'refresh\\n' >> "$TEST_TRACE"
    test "\${TEST_FAIL_REFRESH:-}" != 1 ;;
  *) exit 2 ;;
esac
`);
  // Instrument the real executable's built-in reads, atomic renames, and fetch.
  // Any data access without the acquired mutex throws, including in skip paths.
  writeFileSync(preload, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const read = fs.readFileSync;
function held() {
  if (!read(process.env.TEST_LOCK + '/owner', 'utf8').startsWith('photoref-refresh-')) throw Error('mutex missing');
}
const record = message => fs.appendFileSync(process.env.TEST_TRACE, message + '\\n');
fs.readFileSync = function(file, ...args) {
  const name = String(file);
  if (name.includes('/src/data/south-bay/') || name.endsWith('/.env.local')) { held(); record('read'); }
  return read(file, ...args);
};
const rename = fs.renameSync;
fs.renameSync = function(...args) { held(); record('write'); return rename(...args); };
syncBuiltinESMExports();
const interval = globalThis.setInterval;
globalThis.setInterval = (fn, ms, ...args) => interval(fn, ms === 60_000 ? 20 : ms, ...args);
globalThis.fetch = async () => {
  held(); record('fetch');
  if (process.env.TEST_WAIT) { fs.writeFileSync(process.env.TEST_WAIT, 'ready'); await new Promise(() => setInterval(() => {}, 1000)); }
  await new Promise(resolve => setTimeout(resolve, 100));
  return new Response(JSON.stringify({ photos: [{ name: process.env.TEST_PHOTO || 'places/one/photos/new' }] }),
    { status: Number(process.env.TEST_API_STATUS || 200) });
};
`);
  git(root, "init", "--bare", remote);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "PhotoRef test");
  git(repo, "config", "user.email", "photoref@example.test");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "config", "core.hooksPath", join(repo, ".git/hooks"));
  git(repo, "add", "--", "scripts", dataPath, "notes.txt");
  git(repo, "commit", "-m", "initial", "--", "scripts", dataPath, "notes.txt");
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-u", "origin", "main");
  for (const hook of ["pre-commit", "pre-push"]) {
    writeFileSync(join(repo, ".git/hooks", hook), `#!/bin/bash
set -eu
grep -q '^photoref-refresh-' "$TEST_LOCK/owner"
printf '${hook}\\n' >> "$TEST_TRACE"
test "\${TEST_FAIL_HOOK:-}" != '${hook}'
`, { mode: 0o755 });
  }
  const env = { ...process.env, GOOGLE_PLACES_API_KEY: "offline-test", SBT_REPO_LOCK_SCRIPT: helper,
    TEST_LOCK: lock, TEST_TRACE: trace };
  const args = ["--import", preload, join(repo, "scripts/refresh-place-photorefs.mjs")];
  const run = (options = {}, flags = ["--commit"]) => spawnSync(process.execPath, [...args, ...flags], {
    cwd: repo, env: { ...env, ...options }, encoding: "utf8", timeout: 10_000,
  });
  return { root, repo, remote, lock, helper, trace, preload, env, args, write, run,
    events: () => readFileSync(trace, "utf8").trim().split("\n"),
    read: file => readFileSync(join(repo, file), "utf8"),
    head: () => git(repo, "rev-parse", "HEAD"),
    published: () => git(remote, "rev-parse", "refs/heads/main"),
  };
}

function released(f, result, status = 0) {
  assert.equal(result.status, status, result.stderr || `unexpected exit ${result.status}`);
  assert.equal(existsSync(f.lock), false);
  assert.equal(f.events().at(-1), "release");
}

test("contention defers before env/data reads, API, writes, staging, or publication", t => {
  const f = fixture(t);
  mkdirSync(f.lock);
  writeFileSync(join(f.lock, "owner"), "copy-edit");
  f.write(dataPath + "places.json", "invalid JSON must not be read");
  const before = { head: f.head(), status: git(f.repo, "status", "--porcelain"), index: git(f.repo, "write-tree") };
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DEFER/);
  assert.deepEqual(f.events(), ["busy"]);
  assert.equal(readFileSync(join(f.lock, "owner"), "utf8"), "copy-edit");
  assert.deepEqual({ head: f.head(), status: git(f.repo, "status", "--porcelain"), index: git(f.repo, "write-tree") }, before);
  assert.equal(f.published(), before.head);
});

test("mutex covers writes, scoped commit and push; unrelated staged/dirty files survive", t => {
  const f = fixture(t);
  f.write("notes.txt", "staged\n");
  git(f.repo, "add", "--", "notes.txt");
  f.write("notes.txt", "unstaged\n");
  f.write(dataPath + "unrelated.json", '{"note":"dirty"}');
  const staged = git(f.repo, "diff", "--cached", "--binary");
  const dirty = git(f.repo, "diff", "--binary");
  released(f, f.run());
  assert.deepEqual(git(f.repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n"),
    [dataPath + "places.json", dataPath + "shared plans.json"]);
  assert.equal(git(f.repo, "diff", "--cached", "--binary"), staged);
  assert.equal(git(f.repo, "diff", "--binary"), dirty);
  assert.equal(f.head(), f.published());
  assert.equal(JSON.parse(f.read(dataPath + "places.json")).places[0].photoRef, "places/one/photos/new");
  assert.ok(f.events().includes("refresh"), "slow API waits renew the lease");
  assert.ok(f.events().indexOf("write") < f.events().indexOf("pre-commit"));
  assert.ok(f.events().indexOf("pre-commit") < f.events().indexOf("pre-push"));
});

test("non-commit invocation also locks shared reads and writes", t => {
  const f = fixture(t), before = f.head();
  released(f, f.run({}, []));
  assert.equal(f.head(), before);
  assert.equal(f.published(), before);
  assert.ok(f.events().includes("write"));
  assert.ok(!f.events().includes("pre-commit"));
});

test("fresh-data skip releases with no API call or write", t => {
  const f = fixture(t, { ...initial, _meta: { lastPhotoRefRefresh: new Date().toISOString() } });
  const before = f.head();
  const result = f.run();
  released(f, result);
  assert.match(result.stdout, /skip: last refresh/);
  assert.ok(!f.events().includes("fetch"));
  assert.ok(!f.events().includes("write"));
  assert.equal(f.head(), before);
});

test("unchanged targeted refresh does not create an empty commit", t => {
  const f = fixture(t), before = f.head();
  released(f, f.run({ TEST_PHOTO: "places/one/photos/old" }, ["--commit", "--place-id=one"]));
  assert.equal(f.head(), before);
  assert.ok(!f.events().includes("write"));
});

test("parse, missing credential and unknown target failures release before writes", t => {
  for (const failure of ["parse", "credential", "target"]) {
    const f = fixture(t), before = f.head();
    if (failure === "parse") f.write(dataPath + "places.json", "broken");
    const result = f.run(failure === "credential" ? { GOOGLE_PLACES_API_KEY: "" } : {},
      failure === "target" ? ["--place-id=unknown"] : ["--commit"]);
    released(f, result, 1);
    assert.equal(f.head(), before);
    assert.ok(!f.events().includes("fetch"));
    assert.ok(!f.events().includes("write"));
  }
});

test("dirty output is preserved and prevents every planned write", t => {
  const f = fixture(t), before = f.head();
  const file = dataPath + "shared plans.json";
  f.write(file, JSON.stringify({ nested: [initial.places[0]], note: "other owner's change" }));
  git(f.repo, "add", "--", file);
  const original = f.read(dataPath + "places.json"), dirty = f.read(file), index = git(f.repo, "write-tree");
  const result = f.run();
  released(f, result, 1);
  assert.match(result.stderr, /existing changes; preserved without writes/);
  assert.equal(f.read(dataPath + "places.json"), original);
  assert.equal(f.read(file), dirty);
  assert.equal(git(f.repo, "write-tree"), index);
  assert.equal(f.head(), before);
  assert.ok(!f.events().includes("write"));
});

test("API failures retain pending IDs, publish scoped metadata, and release", t => {
  const f = fixture(t);
  released(f, f.run({ TEST_API_STATUS: "503" }), 1);
  const data = JSON.parse(f.read(dataPath + "places.json"));
  assert.deepEqual(data._meta.photoRefRefreshPendingIds, ["one"]);
  assert.equal(data.places[0].photoRef, "places/one/photos/old");
  assert.equal(f.head(), f.published());
  released(f, f.run());
  assert.equal(JSON.parse(f.read(dataPath + "places.json"))._meta.photoRefRefreshPendingIds, undefined);
});

test("commit and push rejection release while preserving data and unrelated index", t => {
  for (const hook of ["pre-commit", "pre-push"]) {
    const f = fixture(t), before = f.head();
    f.write("notes.txt", "staged\n");
    git(f.repo, "add", "--", "notes.txt");
    const staged = git(f.repo, "diff", "--cached", "--", "notes.txt");
    released(f, f.run({ TEST_FAIL_HOOK: hook }), 1);
    assert.equal(git(f.repo, "diff", "--cached", "--", "notes.txt"), staged);
    assert.equal(JSON.parse(f.read(dataPath + "places.json")).places[0].photoRef, "places/one/photos/new");
    assert.equal(f.published(), before);
    assert.equal(f.head() === before, hook === "pre-commit");
  }
});

test("missing mutex helper fails closed without reading shared data", t => {
  const f = fixture(t), before = f.head();
  const result = f.run({ SBT_REPO_LOCK_SCRIPT: join(f.root, "missing.sh") });
  assert.equal(result.status, 1);
  assert.equal(readFileSync(f.trace, "utf8"), "");
  assert.equal(f.head(), before);
});

test("mutex renewal failure terminates before data writes and releases", t => {
  const f = fixture(t), before = f.head();
  released(f, f.run({ TEST_FAIL_REFRESH: "1" }), 1);
  assert.ok(f.events().includes("refresh"));
  assert.ok(!f.events().includes("write"));
  assert.equal(f.head(), before);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`${signal} releases the mutex during an outstanding API call`, async t => {
    const f = fixture(t), before = f.head(), ready = join(f.root, "ready");
    const child = spawn(process.execPath, [...f.args, "--commit"], {
      cwd: f.repo, env: { ...f.env, TEST_WAIT: ready }, stdio: "ignore",
    });
    t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
    const exited = once(child, "exit");
    const deadline = Date.now() + 5000;
    while (!existsSync(ready) && child.exitCode === null && Date.now() < deadline) await delay(10);
    assert.ok(existsSync(ready), "child reached the API under the lock");
    child.kill(signal);
    const [code] = await exited;
    released(f, { status: code }, signal === "SIGINT" ? 130 : 143);
    assert.equal(f.head(), before);
    assert.ok(!f.events().includes("write"));
  });
}
