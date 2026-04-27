#!/usr/bin/env node
/**
 * photo-review-reminder.mjs
 * Pings #tasks if there are real photos pending review.
 *
 * Reads laptop-local review state (photo-data.json + photo-votes.json) and
 * BLOCKED_IDS, computes pending = data − (approved ∪ rejected ∪ blocked).
 * If pending ≥ THRESHOLD and cooldown elapsed → posts to Discord.
 *
 * Run:    node scripts/photo-review-reminder.mjs
 * Forced: node scripts/photo-review-reminder.mjs --force   (ignore cooldown)
 *
 * Lives on the laptop because photo-data.json + photo-votes.json are
 * laptop-local + gitignored. A Mini cron cannot see real review state.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { homedir } from "os";
import { BLOCKED_IDS } from "./blocked-photos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_PATH = join(ROOT, "photo-data.json");
const VOTES_PATH = join(ROOT, "photo-votes.json");
const COOLDOWN_FILE = join(homedir(), ".claude", "photo-review-reminder.last_notified");
const POST_HELPER = join(homedir(), ".claude", "scripts", "post-to-tasks.sh");

const THRESHOLD = 25;
const COOLDOWN_DAYS = 5;

const force = process.argv.includes("--force");

if (!existsSync(DATA_PATH) || !existsSync(VOTES_PATH)) {
  console.log("No review pool yet (run photo-review.mjs first). Skipping.");
  process.exit(0);
}

const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const votes = JSON.parse(readFileSync(VOTES_PATH, "utf8"));
const voted = new Set([...(votes.approved ?? []), ...(votes.rejected ?? []), ...BLOCKED_IDS]);
const pending = data.filter((p) => !voted.has(p.id));

console.log(
  `Pool: ${data.length} | approved: ${(votes.approved ?? []).length} | ` +
  `rejected: ${(votes.rejected ?? []).length} | blocked: ${BLOCKED_IDS.size} | ` +
  `pending: ${pending.length}`
);

if (pending.length < THRESHOLD) {
  console.log(`Below threshold (${THRESHOLD}), no ping.`);
  process.exit(0);
}

if (!force && existsSync(COOLDOWN_FILE)) {
  const last = new Date(readFileSync(COOLDOWN_FILE, "utf8").trim());
  const ageDays = (Date.now() - last.getTime()) / 86_400_000;
  if (ageDays < COOLDOWN_DAYS) {
    console.log(`Cooldown active (last fired ${last.toISOString()}, ${ageDays.toFixed(1)}d ago). Skipping.`);
    process.exit(0);
  }
}

const msg =
  `📸 **${pending.length} photos** pending review on South Bay Today. ` +
  `Run \`node scripts/photo-review-server.mjs\` to approve/deny.`;

const res = spawnSync(POST_HELPER, [msg], { encoding: "utf8" });
if (res.status !== 0) {
  console.error("post-to-tasks.sh failed:", res.stderr || res.stdout);
  process.exit(1);
}

writeFileSync(COOLDOWN_FILE, new Date().toISOString());
console.log(`Posted: ${pending.length} pending. Cooldown set.`);
