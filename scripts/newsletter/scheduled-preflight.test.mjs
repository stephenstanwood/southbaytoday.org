import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertVerifiedCheckoutToken,
  preflightNewsletterCheckout,
  pushGeneratedDataCheckout,
} from "./scheduled-preflight.mjs";

function git(cwd, ...args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
  );
  return String(result.stdout || "").trim();
}

function put(root, relativePath, contents) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function commitAll(repo, message) {
  git(repo, "add", ".");
  git(repo, "commit", "-m", message);
}

function setupRepo(t) {
  const root = mkdtempSync(join(tmpdir(), "sbt-newsletter-preflight-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const checkout = join(root, "checkout");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "clone", remote, seed);
  git(seed, "config", "user.email", "tests@southbaytoday.org");
  git(seed, "config", "user.name", "SBT Tests");
  put(seed, "README.md", "initial\n");
  put(seed, "src/data/south-bay/default-plans.json", "{}\n");
  commitAll(seed, "initial");
  git(seed, "push", "-u", "origin", "main");

  git(root, "clone", remote, checkout);
  git(checkout, "config", "user.email", "tests@southbaytoday.org");
  git(checkout, "config", "user.name", "SBT Tests");
  return { root, remote, seed, checkout };
}

test("preflight fast-forwards a clean checkout that is behind origin/main", (t) => {
  const { seed, checkout } = setupRepo(t);
  put(seed, "README.md", "remote update\n");
  commitAll(seed, "remote update");
  git(seed, "push");

  const logs = [];
  const result = preflightNewsletterCheckout({ checkout, repoRoot: checkout, log: (line) => logs.push(line) });

  assert.equal(result.state, "fast-forwarded");
  assert.equal(git(checkout, "rev-parse", "HEAD"), git(seed, "rev-parse", "HEAD"));
  assert.equal(readFileSync(join(checkout, "README.md"), "utf8"), "remote update\n");
  assert.ok(logs.some((line) => line.includes("verified state=fast-forwarded")));
});

test("preflight permits local generated-data commits that already contain origin/main", (t) => {
  const { checkout } = setupRepo(t);
  put(checkout, "src/data/south-bay/default-plans.json", "{\"fresh\":true}\n");
  commitAll(checkout, "data: refresh homepage default plans");
  const head = git(checkout, "rev-parse", "HEAD");

  const result = preflightNewsletterCheckout({ repoRoot: checkout, log: () => {} });

  assert.equal(result.state, "ahead-data-only");
  assert.equal(result.head, head);
  assert.deepEqual(result.aheadPaths, ["src/data/south-bay/default-plans.json"]);
});

test("preflight blocks local source commits even when they are ahead of origin/main", (t) => {
  const { checkout } = setupRepo(t);
  put(checkout, "scripts/newsletter/send.mjs", "console.log('local source');\n");
  commitAll(checkout, "local source change");

  assert.throws(
    () => preflightNewsletterCheckout({ repoRoot: checkout, log: () => {} }),
    /local commits that modify source or configuration: scripts\/newsletter\/send\.mjs/,
  );
});

test("preflight merges origin/main when a checkout diverged only because of local generated data", (t) => {
  const { seed, checkout } = setupRepo(t);
  put(checkout, "src/data/south-bay/default-plans.json", "{\"local\":true}\n");
  commitAll(checkout, "local data");

  put(seed, "README.md", "remote update\n");
  commitAll(seed, "remote update");
  git(seed, "push");

  const result = preflightNewsletterCheckout({ repoRoot: checkout, log: () => {} });

  assert.equal(result.state, "merged-remote-with-local-data");
  assert.equal(
    readFileSync(join(checkout, "README.md"), "utf8"),
    "remote update\n",
  );
  assert.equal(
    readFileSync(join(checkout, "src/data/south-bay/default-plans.json"), "utf8"),
    "{\"local\":true}\n",
  );
  assert.deepEqual(result.aheadPaths, ["src/data/south-bay/default-plans.json"]);
  assert.equal(
    git(checkout, "merge-base", "--is-ancestor", "origin/main", "HEAD"),
    "",
  );
});

test("preflight resolves overlapping generated data with the origin/main version", (t) => {
  const { seed, checkout } = setupRepo(t);
  put(checkout, "src/data/south-bay/default-plans.json", "{\"local\":true}\n");
  commitAll(checkout, "local data");

  put(seed, "src/data/south-bay/default-plans.json", "{\"remote\":true}\n");
  commitAll(seed, "remote data");
  git(seed, "push");

  const result = preflightNewsletterCheckout({ repoRoot: checkout, log: () => {} });

  assert.equal(result.state, "merged-remote-with-local-data");
  assert.equal(
    readFileSync(join(checkout, "src/data/south-bay/default-plans.json"), "utf8"),
    "{\"remote\":true}\n",
  );
  assert.deepEqual(result.aheadPaths, []);
});

test("preflight blocks tracked working-tree changes", (t) => {
  const { checkout } = setupRepo(t);
  put(checkout, "README.md", "dirty\n");

  assert.throws(
    () => preflightNewsletterCheckout({ repoRoot: checkout, log: () => {} }),
    /has tracked changes/,
  );
  assert.equal(readFileSync(join(checkout, "README.md"), "utf8"), "dirty\n");
});

test("child sender requires and matches the exact preflight revision", (t) => {
  const { checkout } = setupRepo(t);
  const head = git(checkout, "rev-parse", "HEAD");

  assert.throws(
    () => assertVerifiedCheckoutToken({ repoRoot: checkout, expectedHead: "" }),
    /require the scheduled-send\.mjs preflight/,
  );
  assert.throws(
    () => assertVerifiedCheckoutToken({ repoRoot: checkout, expectedHead: "0".repeat(40) }),
    /checkout changed after preflight/,
  );
  assert.equal(
    assertVerifiedCheckoutToken({ repoRoot: checkout, expectedHead: head, log: () => {} }),
    head,
  );
});

test("launchd routes the scheduled job through the guarded wrapper", () => {
  const plist = readFileSync(new URL("./newsletter-send.plist", import.meta.url), "utf8");
  assert.match(
    plist,
    /<string>\/opt\/homebrew\/bin\/node \/Users\/stephenstanwood\/Projects\/southbaytoday\.org\/scripts\/newsletter\/scheduled-send\.mjs; exit \$\?<\/string>/,
  );
  assert.equal(/scripts\/newsletter\/send\.mjs/.test(plist), false);
  assert.match(
    plist,
    /<key>Hour<\/key>\s*<integer>3<\/integer>\s*<key>Minute<\/key>\s*<integer>40<\/integer>/,
  );
});

test("launchd refreshes default plans through the guarded wrapper before newsletter build", () => {
  const plist = readFileSync(
    new URL("../social/default-plans-refresh.plist", import.meta.url),
    "utf8",
  );
  assert.match(
    plist,
    /<string>\/opt\/homebrew\/bin\/node \/Users\/stephenstanwood\/Projects\/southbaytoday\.org\/scripts\/social\/scheduled-default-plans\.mjs; exit \$\?<\/string>/,
  );
  // 3:20 is the run; 3:30 retries anything it could not publish, still ahead
  // of the newsletter build.
  assert.match(
    plist,
    /<key>Hour<\/key>\s*<integer>3<\/integer>\s*<key>Minute<\/key>\s*<integer>20<\/integer>/,
  );
  assert.match(
    plist,
    /<key>Hour<\/key>\s*<integer>3<\/integer>\s*<key>Minute<\/key>\s*<integer>30<\/integer>/,
  );
  assert.equal(/scripts\/social\/generate-schedule\.mjs/.test(plist), false);
});

test("push publishes local generated-data commits to origin/main", (t) => {
  const { remote, checkout } = setupRepo(t);
  put(checkout, "src/data/south-bay/default-plans.json", "{\"fresh\":true}\n");
  commitAll(checkout, "data: refresh homepage default plans");
  const head = git(checkout, "rev-parse", "HEAD");

  const result = pushGeneratedDataCheckout({ repoRoot: checkout, log: () => {} });

  assert.deepEqual(result, { pushed: true, head });
  assert.equal(git(remote, "rev-parse", "main"), head);
});

test("push is a no-op when origin/main already has the checkout", (t) => {
  const { checkout } = setupRepo(t);
  const head = git(checkout, "rev-parse", "HEAD");

  const result = pushGeneratedDataCheckout({ repoRoot: checkout, log: () => {} });

  assert.deepEqual(result, { pushed: false, head });
});

test("push absorbs a newer origin/main before publishing local data", (t) => {
  const { remote, seed, checkout } = setupRepo(t);
  put(checkout, "src/data/south-bay/default-plans.json", "{\"local\":true}\n");
  commitAll(checkout, "local data");
  put(seed, "README.md", "remote update\n");
  commitAll(seed, "remote update");
  git(seed, "push");

  const result = pushGeneratedDataCheckout({ repoRoot: checkout, log: () => {} });

  assert.equal(result.pushed, true);
  assert.equal(git(remote, "rev-parse", "main"), git(checkout, "rev-parse", "HEAD"));
  assert.equal(git(remote, "show", "main:README.md"), "remote update");
  assert.equal(
    git(remote, "show", "main:src/data/south-bay/default-plans.json"),
    "{\"local\":true}",
  );
});

test("push retries when origin/main moves between the fetch and the push", (t) => {
  const { root, remote, seed, checkout } = setupRepo(t);
  put(checkout, "src/data/south-bay/default-plans.json", "{\"local\":true}\n");
  commitAll(checkout, "local data");

  // The first push lands a competing commit on the remote before it is
  // accepted, so it is rejected as non-fast-forward. The retry must re-fetch,
  // absorb that commit, and publish both.
  const marker = join(root, "raced");
  put(checkout, ".git/hooks/pre-push", [
    "#!/bin/sh",
    `[ -e "${marker}" ] && exit 0`,
    `touch "${marker}"`,
    "unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE",
    `cd "${seed}" && git pull -q && echo race > race.txt && git add race.txt && git commit -qm race && git push -q`,
    "",
  ].join("\n"));
  chmodSync(join(checkout, ".git/hooks/pre-push"), 0o755);
  const logs = [];

  const result = pushGeneratedDataCheckout({ repoRoot: checkout, log: (line) => logs.push(line) });

  assert.equal(result.pushed, true);
  assert.ok(logs.some((line) => /push attempt 1\/3 failed/.test(line)), logs.join("\n"));
  assert.equal(git(remote, "rev-parse", "main"), git(checkout, "rev-parse", "HEAD"));
  assert.equal(git(remote, "show", "main:race.txt"), "race");
  assert.equal(
    git(remote, "show", "main:src/data/south-bay/default-plans.json"),
    "{\"local\":true}",
  );
});

test("push refuses to publish local source commits", (t) => {
  const { remote, checkout } = setupRepo(t);
  const published = git(remote, "rev-parse", "main");
  put(checkout, "scripts/newsletter/send.mjs", "console.log('local source');\n");
  commitAll(checkout, "local source change");

  assert.throws(
    () => pushGeneratedDataCheckout({ repoRoot: checkout, log: () => {} }),
    /local commits that modify source or configuration/,
  );
  assert.equal(git(remote, "rev-parse", "main"), published);
});
