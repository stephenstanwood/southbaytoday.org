import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertVerifiedCheckoutToken,
  preflightNewsletterCheckout,
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

test("preflight blocks and preserves a checkout that diverged from origin/main", (t) => {
  const { seed, checkout } = setupRepo(t);
  put(checkout, "src/data/south-bay/default-plans.json", "{\"local\":true}\n");
  commitAll(checkout, "local data");
  const localHead = git(checkout, "rev-parse", "HEAD");

  put(seed, "README.md", "remote update\n");
  commitAll(seed, "remote update");
  git(seed, "push");

  assert.throws(
    () => preflightNewsletterCheckout({ repoRoot: checkout, log: () => {} }),
    /diverged from origin\/main/,
  );
  assert.equal(git(checkout, "rev-parse", "HEAD"), localHead);
  assert.equal(
    readFileSync(join(checkout, "src/data/south-bay/default-plans.json"), "utf8"),
    "{\"local\":true}\n",
  );
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
    /<string>\/Users\/stephenstanwood\/Projects\/southbaytoday\.org\/scripts\/newsletter\/scheduled-send\.mjs<\/string>/,
  );
  assert.equal(
    /<string>\/Users\/stephenstanwood\/Projects\/southbaytoday\.org\/scripts\/newsletter\/send\.mjs<\/string>/.test(plist),
    false,
  );
});
