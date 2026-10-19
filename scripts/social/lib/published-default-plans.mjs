import { spawnSync } from "node:child_process";
import { DAY_PLAN_SELECTION_MODEL, dayPlanPairingIssues } from "../../../src/lib/south-bay/dayPlanPairs.ts";

const PLANS_PATH = "src/data/south-bay/default-plans.json";

/** Read the actual remote tip without changing HEAD, the index or remote refs. */
export function publishedDefaultPlans({ repoRoot, today } = {}) {
  const git = (args) => {
    const result = spawnSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8", timeout: 20_000, maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error("could not verify published plans");
    return result.stdout.trim();
  };
  try {
    const head = git(["ls-remote", "--exit-code", "origin", "refs/heads/main"]).split(/\s/)[0];
    if (!/^[a-f0-9]{40}$/.test(head)) return null;
    // Another publisher may have advanced main since this checkout last
    // fetched. Download objects only: do not touch FETCH_HEAD or origin/main
    // while the other job owns the checkout lock.
    git(["fetch", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance", "origin", head]);
    const data = JSON.parse(git(["show", `${head}:${PLANS_PATH}`]));
    const tomorrow = new Date(`${today}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dates = { adults: today, kids: today, "adults:tomorrow": tomorrow.toISOString().slice(0, 10), "kids:tomorrow": tomorrow.toISOString().slice(0, 10) };
    for (const [key, date] of Object.entries(dates)) {
      const plan = data.plans?.[key];
      if (plan?.planDate !== date || plan.selectionModel !== DAY_PLAN_SELECTION_MODEL
        || !Array.isArray(plan.cards) || plan.cards.length !== 6
        || dayPlanPairingIssues(plan.cards).length) return null;
    }
    return { head, today, data };
  } catch {
    return null; // Unknown publication must keep the existing failure path.
  }
}
