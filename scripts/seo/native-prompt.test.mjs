import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const id = "sbt-seo-sweep";
const project = "southbaytoday.org";
const skill = "ops/mini/sbt-seo-sweep/SKILL.md";

test("prompt-only refresh preserves paused status, exact schedule/model/target and pending run fields", () => {
  const home = mkdtempSync(join(tmpdir(), "native-prompt-refresh-"));
  try {
    const codex = join(home, ".codex");
    const folder = join(codex, "automations", id);
    mkdirSync(folder, { recursive: true });
    mkdirSync(join(codex, "sqlite"));
    const cwd = join(home, "Projects", project);
    const file = join(cwd, skill);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "fixture skill");
    writeFileSync(join(codex, ".codex-global-state.json"), JSON.stringify({ "local-projects": { exact: { id: "project-fixture", rootPaths: [cwd] } } }));
    writeFileSync(join(codex, "models_cache.json"), JSON.stringify({ models: [{ slug: "gpt-6.1-sol", hidden: false }] }));
    writeFileSync(join(codex, "sol.config.toml"), 'model = "gpt-6.1-sol"\n');
    const db = new DatabaseSync(join(codex, "sqlite/codex-dev.db"));
    db.exec("CREATE TABLE automations (id TEXT PRIMARY KEY, prompt TEXT, updated_at INTEGER, status TEXT, rrule TEXT, model TEXT, reasoning_effort TEXT, next_run_at INTEGER, last_run_at INTEGER, project_id TEXT, cwds TEXT, pending_fixture TEXT)");
    db.prepare("INSERT INTO automations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, "old prompt", 1, "PAUSED", "retained-original-rule", "retained-model", "medium", 123456789, 123450000, "retained-project", JSON.stringify([cwd]), "pending-native-run");
    const before = db.prepare("SELECT * FROM automations WHERE id = ?").get(id);
    const toml = join(folder, "automation.toml");
    writeFileSync(toml, 'prompt = "old prompt"\nupdated_at = 1\nstatus = "PAUSED"\nrrule = "retained-original-rule"\n');
    const argv = [fileURLToPath(new URL("../../ops/mini/sbt-seo-sweep/install.mjs", import.meta.url)), "--refresh-prompt"];
    const env = { ...process.env, HOME: home, CODEX_HOME: codex };
    execFileSync(process.execPath, argv, { env, stdio: "pipe" });
    const after = db.prepare("SELECT * FROM automations WHERE id = ?").get(id);
    for (const key of Object.keys(before)) if (!["prompt", "updated_at"].includes(key)) assert.equal(after[key], before[key], key);
    assert.equal(after.prompt, readFileSync(new URL("../../ops/mini/sbt-seo-sweep/PROMPT.md", import.meta.url), "utf8").trim());
    assert.ok(readFileSync(toml, "utf8").includes('status = "PAUSED"'));
    const unchanged = readFileSync(toml, "utf8");
    execFileSync(process.execPath, argv, { env, stdio: "pipe" });
    assert.equal(readFileSync(toml, "utf8"), unchanged);
    // A concurrent/divergent file must never be overwritten from the DB row.
    writeFileSync(toml, 'prompt = "different native edit"\n');
    assert.throws(() => execFileSync(process.execPath, argv, { env, stdio: "pipe" }));
    assert.equal(readFileSync(toml, "utf8"), 'prompt = "different native edit"\n');
    assert.equal(db.prepare("SELECT * FROM automations WHERE id = ?").get(id).prompt, after.prompt);
    db.close();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
