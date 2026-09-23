import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Tracked LaunchAgents for the Mac Mini. After `brew upgrade node`, macOS
// SIGKILLs the next launch of any agent whose program *is* Homebrew's node
// ("Launch Constraint Violation"), before it can log a line. The Sunday
// tool-updater did that on 2026-09-20: no newsletter that day and no homepage
// plans on 2026-09-21. Agents must start a platform shell and run node as its
// child instead.

const SCRIPTS_DIR = fileURLToPath(new URL("..", import.meta.url));

// Social autopilot agents retired with the 2026-05-23 shutdown. They are not
// loaded on the Mini; if one comes back, launch it the same way as the rest.
const RETIRED = new Set([
  "social/collect-engagement.plist",
  "social/event-bumps.plist",
  "social/nightly-purge.plist",
  "social/pinterest-refresh.plist",
  "social/publish-jitter.plist",
]);

function plistFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : plistFiles(path);
    return entry.name.endsWith(".plist") ? [path] : [];
  });
}

function programArguments(xml) {
  const array = xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1];
  assert.ok(array, "plist has no ProgramArguments array");
  return [...array.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((match) => match[1]);
}

const active = plistFiles(SCRIPTS_DIR)
  .map((path) => ({ path, name: relative(SCRIPTS_DIR, path) }))
  .filter(({ name }) => !RETIRED.has(name));

test("covers the Mini's active node agents", () => {
  const names = active.map(({ name }) => name);
  for (const expected of [
    "events/events-refresh.plist",
    "events/events-refresh-watchdog.plist",
    "newsletter/newsletter-send.plist",
    "social/default-plans-refresh.plist",
  ]) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
});

for (const { path, name } of active) {
  test(`${name} starts a platform shell and runs node only as its child`, () => {
    const args = programArguments(readFileSync(path, "utf8"));
    assert.match(args[0], /^\/bin\/(zsh|bash|sh)$/, `${name} launches ${args[0]}`);

    const flag = args.indexOf("-c");
    if (flag === -1) return;
    const command = args[flag + 1] || "";
    if (!/\/node\b/.test(command)) return;
    assert.doesNotMatch(command, /^\s*exec\b/, "exec makes node the launchd program again");
    // With a trailing command, zsh forks node instead of exec'ing it in place.
    assert.match(command, /; exit \$\?$/);
  });
}
