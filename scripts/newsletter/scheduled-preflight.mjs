import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_REPO_ROOT = resolve(MODULE_DIR, "../..");
export const DEFAULT_REMOTE = "origin";
export const DEFAULT_BRANCH = "main";

const ALLOWED_LOCAL_AHEAD_PATHS = [
  /^src\/data\/south-bay\/[^/]+\.json$/,
];

function shortSha(value) {
  return String(value || "").slice(0, 12);
}

function emit(log, message) {
  log(`[newsletter-preflight] ${new Date().toISOString()} ${message}`);
}

function commandLabel(args) {
  return `git ${args.join(" ")}`;
}

function runGit(repoRoot, args, { allowStatuses = [0], timeout = 30_000 } = {}) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    timeout,
  });

  if (result.error) {
    throw new Error(`${commandLabel(args)} failed: ${result.error.message}`);
  }
  if (!allowStatuses.includes(result.status)) {
    const detail = String(result.stderr || result.stdout || "unknown git error").trim();
    throw new Error(`${commandLabel(args)} failed (${result.status}): ${detail}`);
  }

  return {
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function isAncestor(repoRoot, ancestor, descendant) {
  return runGit(
    repoRoot,
    ["merge-base", "--is-ancestor", ancestor, descendant],
    { allowStatuses: [0, 1] },
  ).status === 0;
}

function trackedChanges(repoRoot) {
  return runGit(
    repoRoot,
    ["status", "--porcelain=v1", "--untracked-files=no"],
  ).stdout;
}

function localAheadPaths(repoRoot, remoteRef) {
  const output = runGit(
    repoRoot,
    ["diff", "--name-only", "-z", `${remoteRef}..HEAD`],
  ).stdout;
  return output.split("\0").filter(Boolean);
}

function assertAllowedLocalAhead(repoRoot, remoteRef) {
  const changed = localAheadPaths(repoRoot, remoteRef);
  const unsafe = changed.filter(
    (path) => !ALLOWED_LOCAL_AHEAD_PATHS.some((pattern) => pattern.test(path)),
  );
  if (unsafe.length) {
    throw new Error(
      `checkout has local commits that modify source or configuration: ${unsafe.join(", ")}`,
    );
  }
  return changed;
}

/**
 * Fetch the canonical branch and prove that the scheduled checkout contains it.
 *
 * A clean checkout that is only behind is fast-forwarded. Data-only local
 * commits are allowed when they already contain origin/main. Dirty, diverged,
 * detached, or source-ahead states fail closed so the sender cannot silently
 * execute old or locally modified newsletter code.
 */
export function preflightNewsletterCheckout({
  repoRoot = DEFAULT_REPO_ROOT,
  remote = DEFAULT_REMOTE,
  branch = DEFAULT_BRANCH,
  log = console.log,
} = {}) {
  emit(log, `starting repo=${repoRoot} remote=${remote} branch=${branch}`);

  const actualBranch = runGit(repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]).stdout;
  if (actualBranch !== branch) {
    throw new Error(`scheduled checkout must be on ${branch}; found ${actualBranch || "detached HEAD"}`);
  }

  const dirty = trackedChanges(repoRoot);
  if (dirty) {
    throw new Error(`scheduled checkout has tracked changes; refusing update/send:\n${dirty}`);
  }

  const remoteRef = `${remote}/${branch}`;
  emit(log, `fetching ${remote}/${branch}`);
  runGit(
    repoRoot,
    [
      "fetch",
      "--quiet",
      "--no-tags",
      remote,
      `refs/heads/${branch}:refs/remotes/${remote}/${branch}`,
    ],
    { timeout: 120_000 },
  );

  let head = runGit(repoRoot, ["rev-parse", "HEAD"]).stdout;
  const originHead = runGit(repoRoot, ["rev-parse", remoteRef]).stdout;
  let state = "current";
  let aheadPaths = [];

  if (head === originHead) {
    state = "current";
  } else if (isAncestor(repoRoot, originHead, head)) {
    aheadPaths = assertAllowedLocalAhead(repoRoot, remoteRef);
    state = "ahead-data-only";
    emit(
      log,
      `local checkout is ahead only in generated data (${aheadPaths.join(", ") || "no file delta"})`,
    );
  } else if (isAncestor(repoRoot, head, originHead)) {
    emit(log, `fast-forwarding ${shortSha(head)} -> ${shortSha(originHead)}`);
    runGit(repoRoot, ["merge", "--ff-only", remoteRef], { timeout: 120_000 });
    head = runGit(repoRoot, ["rev-parse", "HEAD"]).stdout;
    state = "fast-forwarded";
  } else {
    throw new Error(
      `scheduled checkout diverged from ${remoteRef} (HEAD=${shortSha(head)}, ${remoteRef}=${shortSha(originHead)}); refusing send`,
    );
  }

  if (!isAncestor(repoRoot, originHead, head)) {
    throw new Error(
      `post-update verification failed: HEAD ${shortSha(head)} does not contain ${remoteRef} ${shortSha(originHead)}`,
    );
  }

  const dirtyAfter = trackedChanges(repoRoot);
  if (dirtyAfter) {
    throw new Error(`checkout changed during preflight; refusing send:\n${dirtyAfter}`);
  }

  emit(
    log,
    `verified state=${state} HEAD=${shortSha(head)} ${remoteRef}=${shortSha(originHead)}`,
  );
  return { state, head, originHead, branch: actualBranch, aheadPaths };
}

/**
 * Bind the child sender to the exact revision that the parent preflight checked.
 * This also makes a direct, unguarded real-broadcast invocation fail closed.
 */
export function assertVerifiedCheckoutToken({
  repoRoot = DEFAULT_REPO_ROOT,
  expectedHead,
  log = console.log,
} = {}) {
  if (!/^[0-9a-f]{40}$/i.test(String(expectedHead || ""))) {
    throw new Error(
      "real broadcasts require the scheduled-send.mjs preflight; no valid SBT_NEWSLETTER_PREFLIGHT_HEAD was provided",
    );
  }

  const actualHead = runGit(repoRoot, ["rev-parse", "HEAD"]).stdout;
  if (actualHead !== expectedHead) {
    throw new Error(
      `checkout changed after preflight (verified=${shortSha(expectedHead)}, current=${shortSha(actualHead)}); refusing send`,
    );
  }

  const dirty = trackedChanges(repoRoot);
  if (dirty) {
    throw new Error(`checkout changed after preflight; refusing send:\n${dirty}`);
  }

  emit(log, `child sender bound to verified HEAD=${shortSha(actualHead)}`);
  return actualHead;
}
