import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("primary launch agent keeps the normal run and retry slots", () => {
  const plist = read("./events-refresh.plist");
  assert.match(plist, /org\.southbaytoday\.events-refresh/);
  assert.match(plist, /<integer>19<\/integer>\s*<key>Minute<\/key>\s*<integer>15<\/integer>/);
  assert.match(plist, /<integer>20<\/integer>\s*<key>Minute<\/key>\s*<integer>45<\/integer>/);
});

test("independent watchdog runs repeatedly and can restore the primary agent", () => {
  const plist = read("./events-refresh-watchdog.plist");
  const watchdog = read("./refresh-watchdog.mjs");
  assert.match(plist, /org\.southbaytoday\.events-refresh-watchdog/);
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>10800<\/integer>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(watchdog, /install-mini-refresh\.sh"\), "--refresh-only"/);
  assert.match(watchdog, /scheduled-refresh\.mjs"\), "--force"/);
});

test("primary and watchdog mutually restore one another", () => {
  const installer = read("./install-mini-refresh.sh");
  const scheduled = read("./scheduled-refresh.mjs");
  assert.match(installer, /--refresh-only/);
  assert.match(installer, /--watchdog-only/);
  assert.match(installer, /org\.southbaytoday\.events-refresh-watchdog/);
  assert.match(scheduled, /install-mini-refresh\.sh"\), "--watchdog-only"/);
  assert.match(scheduled, /SBT_EVENT_SNAPSHOT_MAX_AGE_HOURS: "2"/);
});

test("GitHub is a same-night independent check with explicit failure alerting", () => {
  const workflow = read("../../.github/workflows/refresh-events.yml");
  assert.match(workflow, /SBT_EVENT_SNAPSHOT_MAX_AGE_HOURS: "8"/);
  assert.match(workflow, /verify-refresh-output\.mjs --max-age-hours 1 --snapshot-max-age-hours 8/);
  assert.match(workflow, /if: \$\{\{ failure\(\) \}\}/);
  assert.match(workflow, /notify-workflow-failure\.mjs/);
});
