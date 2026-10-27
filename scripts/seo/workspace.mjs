#!/usr/bin/env node

// SEO source work must survive an interrupted agent without dirtying the
// checkout used by event, plan and newsletter publishers. Hold the shared
// mutex only inside these bounded Git operations, never across agent turns.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TASK = "sbt-seo-sweep";

function git(repo, ...args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout: 120_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function assertClean(repo) {
  const dirty = git(repo, "status", "--porcelain=v1", "--untracked-files=no");
  if (dirty) throw new Error(`Preserve tracked changes in ${repo}; refusing SEO Git operation:\n${dirty}`);
}

export function seoWorkspace({
  action, workspace, sourceRoot = SOURCE_ROOT,
  stateRoot = join(homedir(), ".local/state/sbt-seo-sweep/workspaces"),
  lockScript = process.env.SBT_REPO_LOCK_SCRIPT || join(homedir(), ".claude/scheduled-tasks/lib/repo-lock.sh"),
} = {}) {
  if (!["prepare", "publish"].includes(action)) throw new Error("Use prepare or publish /absolute/SEO/worktree");
  if (!existsSync(lockScript)) throw new Error(`Required SBT repo lock is missing: ${lockScript}`);
  const lock = (operation) => {
    const result = spawnSync("/bin/bash", [lockScript, operation, TASK], { encoding: "utf8", timeout: 30_000 });
    if (result.error || result.status !== 0) {
      throw new Error(`repo lock ${operation} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`);
    }
  };

  lock("acquire");
  try {
    assertClean(sourceRoot);
    if (git(sourceRoot, "symbolic-ref", "--short", "HEAD") !== "main") {
      throw new Error("The scheduled source checkout must remain on main");
    }
    const commonDir = git(sourceRoot, "rev-parse", "--path-format=absolute", "--git-common-dir");
    if (action === "prepare") {
      git(sourceRoot, "fetch", "--quiet", "--no-tags", "origin", "refs/heads/main:refs/remotes/origin/main");
      const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
      const directory = join(stateRoot, id);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, "southbaytoday.org");
      const branch = `sbt-seo/${id}`;
      const baseHead = git(sourceRoot, "rev-parse", "origin/main");
      git(sourceRoot, "worktree", "add", "-b", branch, path, baseHead);
      // Same private repository and user, same existing environment file.
      // Reuse it by reference rather than copying keys into receipts/source.
      if (existsSync(join(sourceRoot, ".env.local"))) {
        git(path, "check-ignore", "--no-index", ".env.local");
        symlinkSync(join(sourceRoot, ".env.local"), join(path, ".env.local"));
      }
      const receipt = { sourceRoot, commonDir, path, branch, baseHead };
      writeFileSync(join(directory, "workspace.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      return receipt;
    }

    if (!workspace || !workspace.startsWith("/") || resolve(workspace) === resolve(sourceRoot)) {
      throw new Error("Publish requires the prepared isolated SEO worktree");
    }
    const receipt = JSON.parse(readFileSync(join(dirname(workspace), "workspace.json"), "utf8"));
    if (receipt.path !== workspace || receipt.sourceRoot !== sourceRoot || receipt.commonDir !== commonDir
      || git(workspace, "rev-parse", "--path-format=absolute", "--git-common-dir") !== commonDir
      || git(workspace, "symbolic-ref", "--short", "HEAD") !== receipt.branch
      || !receipt.branch.startsWith("sbt-seo/")) {
      throw new Error("Preserve work: this is not the registered SEO worktree and branch");
    }
    assertClean(workspace);
    const head = git(workspace, "rev-parse", "HEAD");
    git(sourceRoot, "fetch", "--quiet", "--no-tags", "origin", "refs/heads/main:refs/remotes/origin/main");
    const remoteHead = git(sourceRoot, "rev-parse", "origin/main");
    const ancestry = spawnSync("git", ["-C", workspace, "merge-base", "--is-ancestor", remoteHead, head]);
    if (ancestry.error || ancestry.status !== 0) {
      throw new Error("origin/main advanced. Merge it into the isolated SEO worktree, rerun validation, then retry publication; all work is retained.");
    }
    // Never move, stash, reset or merge the scheduled checkout. Its own
    // publishers fetch this source revision through their unchanged preflight.
    git(workspace, "push", "--quiet", "origin", "HEAD:refs/heads/main");
    return { ...receipt, publishedHead: head };
  } finally {
    lock("release");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(seoWorkspace({ action: process.argv[2], workspace: process.argv[3] }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
