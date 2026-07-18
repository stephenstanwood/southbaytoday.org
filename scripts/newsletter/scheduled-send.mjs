#!/usr/bin/env node

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  DEFAULT_REPO_ROOT,
  preflightNewsletterCheckout,
} from "./scheduled-preflight.mjs";

const PREFIX = "[newsletter-scheduled]";
const LOCK_TASK = "newsletter-send";
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

function acquireRepoLock() {
  const script = process.env.SBT_REPO_LOCK_SCRIPT || DEFAULT_LOCK_SCRIPT;
  if (!existsSync(script)) {
    if (process.env.SBT_NEWSLETTER_REPO_LOCK_REQUIRED === "0") {
      log(`repo lock unavailable at ${script}; continuing because SBT_NEWSLETTER_REPO_LOCK_REQUIRED=0`);
      return null;
    }
    throw new Error(`required SBT repo lock is missing: ${script}`);
  }
  runRepoLock(script, "acquire");
  log(`acquired shared repo lock (${LOCK_TASK})`);
  return script;
}

function releaseRepoLock(script) {
  if (!script) return;
  runRepoLock(script, "release");
  log(`released shared repo lock (${LOCK_TASK})`);
}

function runNewsletter(repoRoot, args, verifiedHead) {
  const sendScript = join(repoRoot, "scripts", "newsletter", "send.mjs");
  log(`starting no-stale sender at ${verifiedHead.slice(0, 12)} args=${args.join(" ") || "<broadcast>"}`);
  const result = spawnSync(process.execPath, [sendScript, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SBT_NEWSLETTER_PREFLIGHT_HEAD: verifiedHead,
    },
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`newsletter process failed to start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`newsletter process terminated by ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`newsletter process exited ${result.status}`);
  }
}

const rawArgs = process.argv.slice(2);
const preflightOnly = rawArgs.includes("--preflight-only");
const sendArgs = rawArgs.filter((arg) => arg !== "--preflight-only");
const repoRoot = process.env.SBT_NEWSLETTER_REPO_ROOT || DEFAULT_REPO_ROOT;

let lockScript = null;
let primaryError = null;
try {
  lockScript = acquireRepoLock();
  const verified = preflightNewsletterCheckout({ repoRoot, log: console.log });

  if (preflightOnly) {
    log(`preflight-only complete; no newsletter built or sent (HEAD=${verified.head.slice(0, 12)})`);
  } else {
    // Keep the shared lock through the child process so no cooperative Mini task
    // can change the checkout after verification but before send.mjs loads it.
    runNewsletter(repoRoot, sendArgs, verified.head);
    log(`newsletter process completed at verified HEAD=${verified.head.slice(0, 12)}`);
  }
} catch (error) {
  primaryError = error;
  console.error(`${PREFIX} ${new Date().toISOString()} BLOCKED: ${error.message}`);
  process.exitCode = 1;
} finally {
  try {
    releaseRepoLock(lockScript);
  } catch (error) {
    console.error(`${PREFIX} ${new Date().toISOString()} repo lock release failed: ${error.message}`);
    if (!primaryError) process.exitCode = 1;
  }
}
