import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { seoWorkspace } from "./workspace.mjs";

function git(repo, ...args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "sbt-seo-workspace-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const remote = join(root, "remote.git"), seed = join(root, "seed"), sourceRoot = join(root, "scheduled");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "clone", remote, seed);
  for (const repo of [seed]) {
    git(repo, "config", "user.name", "SBT fixture");
    git(repo, "config", "user.email", "fixture@example.invalid");
  }
  writeFileSync(join(seed, "source.mjs"), "export const value = 1;\n");
  writeFileSync(join(seed, ".gitignore"), ".env.local\n");
  git(seed, "add", "."); git(seed, "commit", "-m", "seed"); git(seed, "push", "-u", "origin", "main");
  git(root, "clone", remote, sourceRoot);
  git(sourceRoot, "config", "user.name", "SBT fixture");
  git(sourceRoot, "config", "user.email", "fixture@example.invalid");
  const lockScript = join(root, "repo-lock.sh"), calls = join(root, "lock-calls");
  writeFileSync(lockScript, `#!/bin/sh
printf '%s\\n' "$1" >> '${calls}'
if [ "$1" = acquire ] && [ -f '${root}/busy' ]; then exit 1; fi
exit 0
`);
  const options = { sourceRoot, stateRoot: join(root, "private-workspaces"), lockScript };
  return { root, remote, seed, calls, options, prepare: () => seoWorkspace({ ...options, action: "prepare" }) };
}

test("an interrupted SEO run retains tracked, staged and untracked work without blocking the scheduled checkout", (t) => {
  const f = fixture(t), original = git(f.options.sourceRoot, "rev-parse", "HEAD");
  const first = f.prepare();
  writeFileSync(join(first.path, "source.mjs"), "export const value = 2;\n");
  git(first.path, "add", "source.mjs");
  writeFileSync(join(first.path, "source.mjs"), "export const value = 3;\n");
  writeFileSync(join(first.path, "new-test.mjs"), "unfinished regression test\n");
  const retainedStatus = git(first.path, "status", "--porcelain=v1");
  const second = f.prepare();
  assert.notEqual(second.path, first.path);
  assert.equal(git(first.path, "status", "--porcelain=v1"), retainedStatus);
  assert.equal(git(first.path, "show", ":source.mjs"), "export const value = 2;");
  assert.equal(readFileSync(join(first.path, "source.mjs"), "utf8"), "export const value = 3;\n");
  assert.equal(readFileSync(join(first.path, "new-test.mjs"), "utf8"), "unfinished regression test\n");
  assert.equal(git(f.options.sourceRoot, "status", "--porcelain=v1"), "");
  assert.equal(git(f.options.sourceRoot, "rev-parse", "HEAD"), original);
  assert.equal(git(f.options.sourceRoot, "branch", "--show-current"), "main");
  assert.equal(readFileSync(f.calls, "utf8"), "acquire\nrelease\nacquire\nrelease\n");
});

test("preparation reuses only the existing ignored environment without copying it into source or receipts", (t) => {
  const f = fixture(t), environment = join(f.options.sourceRoot, ".env.local");
  writeFileSync(environment, "FIXTURE_ONLY=private-value\n", { mode: 0o600 });
  const w = f.prepare();
  assert.equal(readlinkSync(join(w.path, ".env.local")), environment);
  assert.equal(git(w.path, "status", "--porcelain=v1"), "");
  assert.doesNotMatch(JSON.stringify(w), /private-value/);
});

test("publication leaves the scheduled checkout untouched and releases the mutex before returning", (t) => {
  const f = fixture(t), w = f.prepare(), original = git(f.options.sourceRoot, "rev-parse", "HEAD");
  writeFileSync(join(w.path, "source.mjs"), "export const value = 2;\n");
  git(w.path, "add", "source.mjs"); git(w.path, "commit", "-m", "SEO source repair");
  const result = seoWorkspace({ ...f.options, action: "publish", workspace: w.path });
  assert.equal(git(f.remote, "rev-parse", "main"), result.publishedHead);
  assert.equal(git(f.options.sourceRoot, "rev-parse", "HEAD"), original);
  assert.equal(git(f.options.sourceRoot, "status", "--porcelain=v1"), "");
  assert.equal(readFileSync(f.calls, "utf8"), "acquire\nrelease\nacquire\nrelease\n");
});

test("a moved remote requires merging and revalidation without replacing either writer's work", (t) => {
  const f = fixture(t), w = f.prepare();
  writeFileSync(join(w.path, "source.mjs"), "export const value = 2;\n");
  git(w.path, "add", "."); git(w.path, "commit", "-m", "SEO source repair");
  const own = git(w.path, "rev-parse", "HEAD");
  writeFileSync(join(f.seed, "events.json"), "fresh scheduled data\n");
  git(f.seed, "add", "."); git(f.seed, "commit", "-m", "competing refresh"); git(f.seed, "push");
  const remote = git(f.remote, "rev-parse", "main");
  assert.throws(() => seoWorkspace({ ...f.options, action: "publish", workspace: w.path }), /Merge it.*rerun validation/);
  assert.equal(git(w.path, "rev-parse", "HEAD"), own);
  assert.equal(git(f.remote, "rev-parse", "main"), remote);
  assert.equal(readFileSync(f.calls, "utf8").split("release\n").length - 1, 2);
  git(w.path, "merge", "--no-edit", "origin/main");
  const result = seoWorkspace({ ...f.options, action: "publish", workspace: w.path });
  for (const head of [own, remote]) git(f.remote, "merge-base", "--is-ancestor", head, result.publishedHead);
});

test("dirty canonical source is preserved and a busy holder is never released", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.options.sourceRoot, "source.mjs"), "valuable source edit\n");
  writeFileSync(join(f.options.sourceRoot, "untracked.bin"), Buffer.from([0, 255, 42]));
  assert.throws(f.prepare, /Preserve tracked changes/);
  assert.equal(readFileSync(join(f.options.sourceRoot, "source.mjs"), "utf8"), "valuable source edit\n");
  assert.deepEqual(readFileSync(join(f.options.sourceRoot, "untracked.bin")), Buffer.from([0, 255, 42]));
  assert.equal(existsSync(f.options.stateRoot), false);
  writeFileSync(join(f.root, "busy"), "another task owns the lease\n");
  assert.throws(f.prepare, /repo lock acquire failed \(1\)/);
  assert.equal(readFileSync(f.calls, "utf8"), "acquire\nrelease\nacquire\n");
});

test("a rejected push retains the isolated commit and releases the lock", (t) => {
  const f = fixture(t), w = f.prepare();
  writeFileSync(join(w.path, "source.mjs"), "export const value = 2;\n");
  git(w.path, "add", "."); git(w.path, "commit", "-m", "retained repair");
  const own = git(w.path, "rev-parse", "HEAD"), previous = git(f.remote, "rev-parse", "main");
  const hook = join(f.remote, "hooks/pre-receive");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n"); chmodSync(hook, 0o755);
  assert.throws(() => seoWorkspace({ ...f.options, action: "publish", workspace: w.path }), /git push.*failed/);
  assert.equal(git(w.path, "rev-parse", "HEAD"), own);
  assert.equal(git(f.remote, "rev-parse", "main"), previous);
  assert.equal(readFileSync(f.calls, "utf8"), "acquire\nrelease\nacquire\nrelease\n");
});

test("CLI failures use an isolated HOME and never contact a notification gateway", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sbt-seo-cli-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./workspace.mjs", import.meta.url)), "prepare"], {
    env: { PATH: process.env.PATH, HOME: root, SBT_NOTIFICATION_TEST_DIR: join(root, "notifications") },
    encoding: "utf8", timeout: 5_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required SBT repo lock is missing/);
  assert.equal(existsSync(join(root, "notifications")), false);
});
