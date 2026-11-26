#!/usr/bin/env node
// Vercel's Ignored Build Step for the site (vercel.json "ignoreCommand").
// Exit 0 skips the build; exit 1 builds.
//
// Preview deployments are skipped, as before. A production build waits while
// every commit since the live deployment is an automated fact-check or
// copy-edit commit and the oldest of them is younger than two hours: those
// jobs land about twice an hour, and each deploy restarts Vercel's per-
// deployment caches and costs a build. Any other commit deploys at once and
// carries the waiting edits with it. The hourly /api/admin/deploy-flush cron
// asks Vercel to build main whenever the live deployment is behind, so a batch
// ships once it has waited long enough even if nothing else lands.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const BATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
export const BATCHABLE_SUBJECT = /^(fact-check|copy-edit):/;

/**
 * @param {{ env: Record<string, string | undefined>, commits: Array<{ subject: string, time: number, merge: boolean }> | null, now: number }} input
 * @returns {{ build: boolean, reason: string }}
 */
export function decideBuild({ env, commits, now }) {
  if (env.VERCEL_ENV === "preview") return { build: false, reason: "preview deployments are skipped" };
  if (env.VERCEL_ENV !== "production") return { build: true, reason: `environment ${env.VERCEL_ENV || "unknown"}` };
  const previous = env.VERCEL_GIT_PREVIOUS_SHA;
  const head = env.VERCEL_GIT_COMMIT_SHA;
  if (!previous || !head) return { build: true, reason: "no live deployment to compare with" };
  // A redeploy of the live commit (an env change, a manual retry) is deliberate.
  if (previous === head) return { build: true, reason: "redeploy of the live commit" };
  if (!commits) return { build: true, reason: "history since the live deployment is unavailable" };
  const edits = commits.filter((commit) => !commit.merge);
  if (edits.length === 0) return { build: true, reason: "only merge commits since the live deployment" };
  const other = edits.find((commit) => !BATCHABLE_SUBJECT.test(commit.subject));
  if (other) return { build: true, reason: `deploys now: ${other.subject}` };
  const waited = now - Math.min(...edits.map((commit) => commit.time));
  const minutes = Math.round(waited / 60_000);
  if (waited >= BATCH_WINDOW_MS) return { build: true, reason: `shipping ${edits.length} batched edits; the oldest waited ${minutes} min` };
  return { build: false, reason: `holding ${edits.length} fact-check/copy-edit commits; the oldest is ${minutes} min old` };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 });
}

function hasCommit(sha) {
  try {
    git("cat-file", "-e", `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

/** Commits on head that the live deployment lacks, or null when history is unavailable. */
export function commitsSince(previous, head) {
  if (!hasCommit(previous)) {
    // Vercel clones shallowly. Deepen once; if that fails, build.
    try { git("fetch", "--quiet", "--deepen=300", "origin"); } catch { /* keep going */ }
    if (!hasCommit(previous)) return null;
  }
  return git("log", "--format=%P%x09%ct%x09%s", `${previous}..${head}`)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [parents, committed, ...subject] = line.split("\t");
      return { merge: parents.trim().split(/\s+/).length > 1, time: Number(committed) * 1000, subject: subject.join("\t") };
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const env = process.env;
  let commits = null;
  if (env.VERCEL_ENV === "production" && env.VERCEL_GIT_PREVIOUS_SHA && env.VERCEL_GIT_COMMIT_SHA) {
    try { commits = commitsSince(env.VERCEL_GIT_PREVIOUS_SHA, env.VERCEL_GIT_COMMIT_SHA); } catch { commits = null; }
  }
  const decision = decideBuild({ env, commits, now: Date.now() });
  console.log(`ignored build step: ${decision.build ? "build" : "skip"} (${decision.reason})`);
  process.exit(decision.build ? 1 : 0);
}
