#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { loadEnvLocal } from "../lib/env.mjs";
import { catSignal } from "../lib/notify.mjs";
import { inspectMiniEventRefresh } from "./event-refresh-health.mjs";

const PREFIX = "[events-refresh-watchdog]";
const moduleDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = join(moduleDir, "..", "..");
const DEFAULT_STATE_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "SouthBayToday",
  "events-refresh-state.json",
);

function log(message) {
  console.log(`${PREFIX} ${new Date().toISOString()} ${message}`);
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function run(command, args, { cwd, env = process.env, timeout = 60 * 60_000 } = {}) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", timeout });
  if (result.error) throw new Error(`${command} failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}${result.signal ? ` (${result.signal})` : ""}`);
  }
}

function ensurePrimaryAgent(repoRoot) {
  if (process.platform !== "darwin" || process.env.SBT_SKIP_AGENT_ENSURE === "1") return;
  run("/bin/bash", [join(repoRoot, "scripts", "events", "install-mini-refresh.sh"), "--refresh-only"], {
    cwd: repoRoot,
    timeout: 60_000,
  });
}

function inspect(repoRoot, statePath) {
  return inspectMiniEventRefresh({
    state: readJson(statePath),
    data: readJson(join(repoRoot, "src", "data", "south-bay", "upcoming-events.json")),
  });
}

const checkOnly = process.argv.includes("--check-only");
const repoRoot = process.env.SBT_EVENTS_REPO_ROOT || DEFAULT_REPO_ROOT;
const statePath = process.env.SBT_EVENTS_REFRESH_STATE || DEFAULT_STATE_PATH;
loadEnvLocal(join(repoRoot, ".env.local"));

let installerProblem = null;
try {
  ensurePrimaryAgent(repoRoot);
} catch (error) {
  installerProblem = `could not restore the primary launch agent: ${error.message}`;
  console.error(`${PREFIX} ${installerProblem}`);
}

let health = inspect(repoRoot, statePath);
if (installerProblem) health = { ...health, ok: false, problems: [installerProblem, ...health.problems] };

if (!health.ok && !checkOnly) {
  log(`unhealthy; forcing one guarded recovery: ${health.problems.join("; ")}`);
  try {
    run(process.execPath, [join(repoRoot, "scripts", "events", "scheduled-refresh.mjs"), "--force"], {
      cwd: repoRoot,
      env: { ...process.env, SBT_SKIP_AGENT_ENSURE: "1" },
    });
  } catch (error) {
    log(`guarded recovery failed: ${error.message}`);
  }
  health = inspect(repoRoot, statePath);
  if (installerProblem) health = { ...health, ok: false, problems: [installerProblem, ...health.problems] };
}

if (health.ok) {
  log(`healthy: ${health.outputHealth.eventCount} events across ${health.outputHealth.sourceCount} adapters`);
} else {
  const detail = health.problems.join("; ");
  console.error(`${PREFIX} ${new Date().toISOString()} BLOCKED: ${detail}`);
  await catSignal({
    key: "events-refresh-watchdog",
    title: "Event refresh heartbeat is unhealthy",
    body: detail,
  });
  process.exitCode = 1;
}
