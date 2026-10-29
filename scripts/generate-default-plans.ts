#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadEnvLocal } from "./lib/env.mjs";
import { writeFileAtomic } from "./lib/io.mjs";
import { createCodexPlanEditorial } from "./lib/codex-subscription.mjs";
import { generateDefaultPlanSet } from "./lib/default-plan-generation.mjs";
import { todayPT } from "./social/lib/slot-scheduler.mjs";
import { enrichDefaultPlanCards, planPassesQuality } from "./social/generate-schedule.mjs";
import { generateDayPlan } from "../src/pages/api/plan-day";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(join(repo, ".env.local"));
const args = new Set(process.argv.slice(2));
if (!["--local-only", "--dry-run", "--preflight-only"].some(flag => args.has(flag))) {
  throw new Error("Use scheduled-default-plans.mjs to publish under the shared Mini lock");
}
const editorial = createCodexPlanEditorial(); // Fail closed before any generation.
if (!args.has("--preflight-only")) {
  const path = join(repo, "src/data/south-bay/default-plans.json");
  const previous = JSON.parse(readFileSync(path, "utf8"));
  const output = await generateDefaultPlanSet({ today: todayPT(), previous,
    generate: async (input: any) => {
      const response = await generateDayPlan(input, editorial);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Default plan failed");
      return value;
    }, validate: planPassesQuality, enrich: enrichDefaultPlanCards });
  // --dry-run exercises the actual selector and validators without publication.
  if (args.has("--dry-run")) console.log(JSON.stringify(output));
  else {
    writeFileAtomic(path, JSON.stringify(output, null, 2) + "\n");
    for (const gitArgs of [["add", "--", path], ["commit", "--only", "-m", "data: refresh homepage default plans via Codex", "--", path]]) {
      const result = spawnSync("git", gitArgs, { cwd: repo, stdio: "inherit" });
      if (result.status !== 0) throw new Error(`Default plans ${gitArgs[0]} failed`);
    }

  }
}
