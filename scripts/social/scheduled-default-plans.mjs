#!/usr/bin/env node

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { loadEnvLocal } from "../lib/env.mjs";
import { catSignal } from "../lib/notify.mjs";
import {
  DEFAULT_REPO_ROOT,
  preflightNewsletterCheckout,
  pushGeneratedDataCheckout,
} from "../newsletter/scheduled-preflight.mjs";
import { nowHHMM_PT, todayPT } from "./lib/slot-scheduler.mjs";

const PREFIX = "[default-plans-scheduled]";
const LOCK_TASK = "default-plans-refresh";
const PLANS_PATH = "src/data/south-bay/default-plans.json";
const DEFAULT_LOCK_SCRIPT = join(
  homedir(),
  ".claude",
  "scheduled-tasks",
  "lib",
  "repo-lock.sh",
);
// launchd slots in default-plans-refresh.plist (Pacific). Failures defer the
// #tasks alert until the last slot; Friday's growth sweep can hold the lock
// past 3:30, so 4:00 is the final automatic retry.
const SCHEDULED_SLOTS_PT = ["03:20", "03:30", "04:00"];

function log(message) {
  console.log(`${PREFIX} ${new Date().toISOString()} ${message}`);
}

function runRepoLock(script, action) {
  const result = spawnSync(script, [action, LOCK_TASK], { encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (output) process.stdout.write(output);
  if (result.error) {
    throw new Error(`repo lock ${action} failed: ${result.error.message}`);
  }
  if (action === "acquire" && result.status === 1) {
    const holder = output.match(/held by '([^']+)'/)?.[1] || "unknown";
    throw new Error(`repo lock is busy (held by '${holder}'); plans were not refreshed`);
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

/** planDate of the committed adults plan, or null when HEAD has none. */
function committedPlanDate(repoRoot) {
  const result = spawnSync("git", ["-C", repoRoot, "show", `HEAD:${PLANS_PATH}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout)?.plans?.adults?.planDate || null;
  } catch {
    return null;
  }
}

function restoreUncommittedPlans(repoRoot) {
  const status = spawnSync(
    "git",
    ["-C", repoRoot, "status", "--porcelain", "--", PLANS_PATH],
    { encoding: "utf8" },
  );
  if (status.status === 0 && !String(status.stdout || "").trim()) return;
  const result = spawnSync(
    "git",
    ["-C", repoRoot, "restore", "--staged", "--worktree", "--", PLANS_PATH],
    { encoding: "utf8" },
  );
  if (result.status === 0) {
    log(`restored uncommitted ${PLANS_PATH} so later Mini jobs are not blocked`);
  } else {
    console.error(`${PREFIX} ${new Date().toISOString()} rollback failed: ${String(result.stderr || "").trim()}`);
  }
}

/** Next launchd slot after now (HH:MM PT), or null after the final slot. */
function nextScheduledSlotPT(now = nowHHMM_PT()) {
  return SCHEDULED_SLOTS_PT.find((slot) => now < slot) || null;
}

const repoRoot = process.env.SBT_NEWSLETTER_REPO_ROOT || DEFAULT_REPO_ROOT;
const lockScript = process.env.SBT_REPO_LOCK_SCRIPT || DEFAULT_LOCK_SCRIPT;
const args = new Set(process.argv.slice(2));
const preflightOnly = args.has("--preflight-only");
const force = args.has("--force");
let lockHeld = false;
let generationStarted = false;
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
    const today = todayPT();
    if (!force && committedPlanDate(repoRoot) === today) {
      log(`plans for ${today} are already committed at HEAD=${before.head.slice(0, 12)}; skipping regeneration`);
    } else {
      generationStarted = true;
      runPlanRefresh(repoRoot);
      const planDate = committedPlanDate(repoRoot);
      if (planDate !== today) {
        throw new Error(
          `generator finished without committing plans for ${today} (committed adults planDate=${planDate || "none"})`,
        );
      }
    }

    // The homepage bakes default-plans.json at build time, so plans only
    // reach readers once they are on origin/main. Pushing here, under the
    // lock, replaces waiting for some later Mini job to carry the commit.
    const published = pushGeneratedDataCheckout({ repoRoot, log: console.log });
    log(
      `plans for ${today} are on origin/main at HEAD=${published.head.slice(0, 12)}`
      + (published.pushed ? "" : " (already published)"),
    );
  }
} catch (error) {
  primaryError = error;
  console.error(`${PREFIX} ${new Date().toISOString()} BLOCKED: ${error.message}`);
  if (generationStarted) restoreUncommittedPlans(repoRoot);
  const nextSlot = nextScheduledSlotPT();
  if (nextSlot) {
    log(`the ${nextSlot} retry slot will try again`);
  } else {
    loadEnvLocal(join(repoRoot, ".env.local"));
    await catSignal({
      key: "default-plans-refresh",
      title: "Homepage day plans did not publish",
      body: `${error.message}\n\nThe homepage keeps the last published plans until this is fixed. Log: ~/Library/Logs/default-plans-refresh.log on the Mini.`,
    });
  }
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
