#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Mini job: refresh /camps from the Camp Finder records, twice a day
// ---------------------------------------------------------------------------
// The Ventures operator grows the private camp-finder-data repository all day.
// This job (org.southbaytoday.camp-finder-sync, scripts/camps/
// camp-finder-sync.plist) pulls it into ~/Projects/camp-finder-data, rewrites
// the two committed snapshot files with scripts/sync-camp-finder.mjs, and
// pushes them to origin/main, which deploys the camp pages. It holds the
// shared repo lock like every other publishing job, and it is a no-op when
// the records haven't changed.
//
// It touches nothing on the site but src/data/south-bay/camp-finder.json and
// camp-finder-index.json.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_REPO_ROOT,
  preflightNewsletterCheckout,
  pushGeneratedDataCheckout,
} from "../newsletter/scheduled-preflight.mjs";

const PREFIX = "[camp-finder-sync]";
const LOCK_TASK = `camp-finder-sync-${process.pid}`;
const lockScript = process.env.SBT_REPO_LOCK_SCRIPT
  || join(homedir(), ".claude", "scheduled-tasks", "lib", "repo-lock.sh");
const DATA_REPO = "https://github.com/stephenstanwood/camp-finder-data.git";
const DATA_DIR = process.env.CAMP_FINDER_DATA || join(homedir(), "Projects", "camp-finder-data");
const FILES = ["src/data/south-bay/camp-finder.json", "src/data/south-bay/camp-finder-index.json"];
const repoRoot = DEFAULT_REPO_ROOT;

const log = (message) => console.log(`${PREFIX} ${new Date().toISOString()} ${message}`);

function run(command, args, { cwd = repoRoot, allow = [0], timeout = 120_000 } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout });
  if (result.error) throw new Error(`${command} ${args.join(" ")}: ${result.error.message}`);
  if (!allow.includes(result.status)) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function repoLock(action) {
  const result = spawnSync("/bin/bash", [lockScript, action, LOCK_TASK], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw new Error(`repo lock ${action} failed: ${result.error.message}`);
  if (action === "acquire" && result.status === 1) return false;
  if (result.status !== 0) throw new Error(`repo lock ${action} failed (exit ${result.status})`);
  return true;
}

function refreshDataCheckout() {
  if (!existsSync(join(DATA_DIR, ".git"))) {
    log(`cloning camp-finder-data into ${DATA_DIR}`);
    run("git", ["clone", "--quiet", DATA_REPO, DATA_DIR], { cwd: homedir() });
  } else {
    run("git", ["-C", DATA_DIR, "pull", "--ff-only", "--quiet"]);
  }
  return run("git", ["-C", DATA_DIR, "rev-parse", "--short=12", "HEAD"]).stdout.trim();
}

function publish() {
  // Start from origin/main (the shared checkout may hold other jobs' generated
  // data, which the preflight merges or refuses).
  preflightNewsletterCheckout({ repoRoot, log });
  const dataHead = refreshDataCheckout();
  log(`camp-finder-data at ${dataHead}`);

  const sync = run(process.execPath, ["scripts/sync-camp-finder.mjs", "--source", DATA_DIR], { allow: [0, 1, 2] });
  process.stdout.write(sync.stdout);
  process.stderr.write(sync.stderr);
  if (sync.status !== 0) throw new Error(`sync refused or failed (exit ${sync.status}); the published files are unchanged`);

  const changed = run("git", ["status", "--porcelain", "--", ...FILES]).stdout.trim();
  if (!changed) {
    log("camp data unchanged; nothing to publish");
    return;
  }

  const index = JSON.parse(readFileSync(join(repoRoot, FILES[1]), "utf8"));
  const posted = index.programs.filter((p) => p.season === index.latestSeason && p.sessions?.length && p.price).length;
  const message = `camps: Camp Finder data, ${index.programs.length} programs (${posted} with ${index.latestSeason} dates and prices)`;
  run("git", ["add", "--", ...FILES]);
  // --only keeps anything else staged in the shared checkout out of this commit.
  run("git", ["commit", "--only", "--quiet", "-m", message, "--", ...FILES]);
  log(`committed: ${message}`);
  pushGeneratedDataCheckout({ repoRoot, log });
}

function main() {
  if (!repoLock("acquire")) {
    log("DEFER: shared repo lock is busy; the next slot retries");
    return;
  }
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    try {
      repoLock("release");
    } catch (error) {
      console.error(`${PREFIX} ${error.message}`);
      process.exitCode = 1;
    }
  };
  process.once("exit", release);
  process.once("SIGINT", () => process.exit(130));
  process.once("SIGTERM", () => process.exit(143));
  try {
    publish();
  } catch (error) {
    console.error(`${PREFIX} failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    release();
  }
}

main();
