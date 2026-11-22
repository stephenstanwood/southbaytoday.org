// The shared checkout is reserved for bounded Git operations. Review, edits
// and validation use a linked worktree at an immutable published revision.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SEO_TASK = "sbt-seo-sweep";
const BRANCH_PREFIXES = new Map([
  [SEO_TASK, "sbt-seo/"],
  ["sbs-fact-check", "sbs-fact-check/"],
  ["sbs-copy-edit", "sbs-copy-edit/"],
]);
const EVENT_DATA = "src/data/south-bay/upcoming-events.json";

function git(repo, ...args) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function assertClean(repo) {
  const dirty = git(repo, "status", "--porcelain=v1", "--untracked-files=no");
  if (dirty) throw new Error(`Preserve tracked changes in ${repo}; refusing review Git operation:\n${dirty}`);
}

function withRepoLock(lockScript, task, run) {
  if (!existsSync(lockScript)) throw new Error(`Required SBT repo lock is missing: ${lockScript}`);
  const lock = (operation) => {
    const result = spawnSync("/bin/bash", [lockScript, operation, task], { encoding: "utf8", timeout: 30_000 });
    if (result.error || result.status !== 0) {
      const error = new Error(`repo lock ${operation} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`);
      if (operation === "acquire" && result.status === 1 && /repo-lock: BUSY/.test(result.stderr)) {
        error.exitCode = 75;
      }
      throw error;
    }
  };
  lock("acquire");
  try {
    return run();
  } finally {
    lock("release");
  }
}

function scheduledRevision(sourceRoot) {
  assertClean(sourceRoot);
  if (git(sourceRoot, "symbolic-ref", "--short", "HEAD") !== "main") {
    throw new Error("The scheduled source checkout must remain on main");
  }
  git(sourceRoot, "fetch", "--quiet", "--no-tags", "origin", "refs/heads/main:refs/remotes/origin/main");
  return git(sourceRoot, "rev-parse", "origin/main");
}

function assertEventProvenance(workspace, remoteHead, head) {
  const snapshotFiles = [
    "src/data/south-bay/playwright-events.json",
    "src/data/south-bay/inbound-events.json",
    "src/data/south-bay/official-event-sources.json",
  ];
  if (git(workspace, "diff", "--name-only", remoteHead, head, "--", ...snapshotFiles)) {
    throw new Error("Restore the published event input snapshots before publishing editorial work.");
  }
  if (!git(workspace, "diff", "--name-only", remoteHead, head, "--", EVENT_DATA)) return;
  const published = JSON.parse(git(workspace, "show", `${remoteHead}:${EVENT_DATA}`));
  const edited = JSON.parse(git(workspace, "show", `${head}:${EVENT_DATA}`));
  for (const field of ["generatedAt", "inputSnapshots", "sourceHealth"]) {
    if (!isDeepStrictEqual(edited[field], published[field])) {
      throw new Error(`Preserve the latest published ${field} when editing event listings.`);
    }
  }
}

export function scheduledReviewWorkspace({
  action, workspace, task, sourceRoot = SOURCE_ROOT,
  stateRoot = join(homedir(), ".local/state", task, "workspaces"),
  lockScript = process.env.SBT_REPO_LOCK_SCRIPT || join(homedir(), ".claude/scheduled-tasks/lib/repo-lock.sh"),
} = {}) {
  const branchPrefix = BRANCH_PREFIXES.get(task);
  const editorial = task !== SEO_TASK;
  if (!branchPrefix || !["prepare", "publish", ...(editorial ? ["finish"] : [])].includes(action)) {
    throw new Error("Use a registered review task with prepare, publish or finish.");
  }
  const commonDir = git(sourceRoot, "rev-parse", "--path-format=absolute", "--git-common-dir");

  if (action === "prepare") {
    const baseHead = withRepoLock(lockScript, task, () => scheduledRevision(sourceRoot));
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
    const directory = join(stateRoot, id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, "southbaytoday.org");
    const branch = `${branchPrefix}${id}`;
    git(sourceRoot, "worktree", "add", "-b", branch, path, baseHead);
    // Reuse the existing ignored environment by reference.
    if (existsSync(join(sourceRoot, ".env.local"))) {
      git(path, "check-ignore", "--no-index", ".env.local");
      symlinkSync(join(sourceRoot, ".env.local"), join(path, ".env.local"));
    }
    const receipt = { sourceRoot, commonDir, path, branch, baseHead };
    writeFileSync(join(directory, "workspace.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    return receipt;
  }

  if (!workspace || !workspace.startsWith("/") || resolve(workspace) === resolve(sourceRoot)) {
    throw new Error("Use the absolute path to the prepared review worktree.");
  }
  const receipt = JSON.parse(readFileSync(join(dirname(workspace), "workspace.json"), "utf8"));
  if (receipt.path !== workspace || receipt.sourceRoot !== sourceRoot || receipt.commonDir !== commonDir
      || git(workspace, "rev-parse", "--path-format=absolute", "--git-common-dir") !== commonDir
      || git(workspace, "symbolic-ref", "--short", "HEAD") !== receipt.branch
      || !receipt.branch.startsWith(branchPrefix)) {
    throw new Error("Preserve work: this is not the registered review worktree and branch.");
  }

  if (action === "finish") {
    const head = git(workspace, "rev-parse", "HEAD");
    const status = git(workspace, "status", "--porcelain=v1", "--untracked-files=normal");
    if (status) throw new Error(`Preserve unfinished editorial work in ${workspace}:\n${status}`);
    const remoteHead = git(sourceRoot, "rev-parse", "origin/main");
    if (git(workspace, "merge-base", remoteHead, head) !== head) {
      throw new Error("Preserve the unpublished editorial commits in the worktree.");
    }
    git(sourceRoot, "worktree", "remove", workspace);
    git(sourceRoot, "update-ref", "-d", `refs/heads/${receipt.branch}`, head);
    return { ...receipt, finishedHead: head };
  }

  return withRepoLock(lockScript, task, () => {
    assertClean(workspace);
    const head = git(workspace, "rev-parse", "HEAD");
    const remoteHead = scheduledRevision(sourceRoot);
    if (git(workspace, "merge-base", remoteHead, head) !== remoteHead) {
      throw new Error("origin/main advanced. Merge it into the isolated worktree, rerun validation, then retry publication; all work is retained.");
    }
    if (editorial) assertEventProvenance(workspace, remoteHead, head);
    // The scheduled checkout's own publishers advance it on their next run.
    git(workspace, "push", "--quiet", "origin", "HEAD:refs/heads/main");
    return { ...receipt, publishedHead: head };
  });
}
