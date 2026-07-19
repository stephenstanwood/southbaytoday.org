#!/usr/bin/env node

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  DEFAULT_REPO_ROOT,
  preflightNewsletterCheckout,
} from "../newsletter/scheduled-preflight.mjs";

const PREFIX = "[default-plans-scheduled]";
const LOCK_TASK = "default-plans-refresh";
const DEFAULT_LOCK_SCRIPT = join(
  homedir(),
  ".claude",
  "scheduled-tasks",
  "lib",
  "repo-lock.sh",
);

function log(message) {
  console.log(`${PREFIX} ${new Date().toISOString()} ${message}`);
}

function runRepoLock(script, action) {
  const result = spawnSync(script, [action, LOCK_TASK], { stdio: "inherit" });
  if (result.error) {
    throw new Error(`repo lock ${action} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`repo lock ${action} failed with exit ${result.status}`);
  }
}

function runPlanRefresh(repoRoot) {
  const script = join(repoRoot, "scripts", "social", "generate-schedule.mjs");
  const result = spawnSync(
    process.execPath,
    [script, "--hero-only", "--local-only"],
    { cwd: repoRoot, env: process.env, stdio: "inherit" },
  );
  if (result.error) {
    throw new Error(`default-plan refresh failed to start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`default-plan refresh terminated by ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`default-plan refresh exited ${result.status}`);
  }
}

const repoRoot = process.env.SBT_NEWSLETTER_REPO_ROOT || DEFAULT_REPO_ROOT;
const lockScript = process.env.SBT_REPO_LOCK_SCRIPT || DEFAULT_LOCK_SCRIPT;
const preflightOnly = process.argv.includes("--preflight-only");
let lockHeld = false;
let primaryError = null;

try {
  if (!existsSync(lockScript)) {
    throw new Error(`required SBT repo lock is missing: ${lockScript}`);
  }
  runRepoLock(lockScript, "acquire");
  lockHeld = true;
  log(`acquired shared repo lock (${LOCK_TASK})`);

  const before = preflightNewsletterCheckout({ repoRoot, log: console.log });
  if (preflightOnly) {
    log(`preflight-only complete; no plans generated (HEAD=${before.head.slice(0, 12)})`);
  } else {
    runPlanRefresh(repoRoot);
    const after = preflightNewsletterCheckout({ repoRoot, log: console.log });
    log(
      `default plans refreshed from verified source ${before.originHead.slice(0, 12)}; clean HEAD=${after.head.slice(0, 12)}`,
    );
  }
} catch (error) {
  primaryError = error;
  console.error(`${PREFIX} ${new Date().toISOString()} BLOCKED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (lockHeld) {
    try {
      runRepoLock(lockScript, "release");
      log(`released shared repo lock (${LOCK_TASK})`);
    } catch (error) {
      console.error(`${PREFIX} ${new Date().toISOString()} repo lock release failed: ${error.message}`);
      if (!primaryError) process.exitCode = 1;
    }
  }
}
