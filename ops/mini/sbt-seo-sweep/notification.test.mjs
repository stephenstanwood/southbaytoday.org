import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sbt-seo-intake-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const denyNetwork = path.join(root, 'deny-network.mjs');
  fs.writeFileSync(denyNetwork, 'globalThis.fetch = () => { throw Error("Network forbidden in this test"); };');
  const env = { ...process.env, MILO_NOTIFICATION_STATE: root,
    SBT_NOTIFICATION_TEST_DIR: path.join(root, 'intake'), NODE_OPTIONS: `--import=${denyNetwork}` };
  delete env.DISCORD_BOT_TOKEN; delete env.CAT_SIGNAL_BOT_TOKEN;
  const script = new URL('./send-seo-dm.mjs', import.meta.url).pathname;
  const invoke = (content, args = [], overrides = {}) => spawnSync(process.execPath,
    [script, ...args], { env: { ...env, ...overrides }, input: content, encoding: 'utf8' });
  const stateFile = path.join(root, 'sbt-seo-sweep/notification.json');
  return { root, env, invoke, stateFile };
}

test('routine and shipped SEO reports cannot notify or use the network', t => {
  const { env, invoke } = fixture(t);
  for (const args of [[], ['--outcome', 'no_change'], ['--outcome', 'shipped'], ['--outcome', 'completed']]) {
    const result = invoke('🔍 SBT SEO sweep — report saved', args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).quiet, true);
    assert.equal(fs.existsSync(env.SBT_NOTIFICATION_TEST_DIR), false);
  }
});

test('decisions retain full exact evidence without a token or Discord request', t => {
  const { env, invoke } = fixture(t);
  const content = `🔍 SBT SEO sweep — decision\n${'Exact private evidence. '.repeat(300)}`;
  const result = invoke(content, ['--outcome', 'decision']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).queued, true);
  const files = fs.readdirSync(env.SBT_NOTIFICATION_TEST_DIR);
  assert.equal(files.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.SBT_NOTIFICATION_TEST_DIR, files[0]), 'utf8')),
    { producer: 'sbt-seo-sweep', content });
});

test('new failures enter intake once and recoveries rearm the failure', t => {
  const { invoke } = fixture(t);
  const content = '⚠️ sbt-seo-sweep: exact failure and evidence path';
  const first = invoke(content);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).queued, true);
  const repeated = invoke(content);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).reason, 'unchanged-failure');
  assert.equal(invoke('🔍 SBT SEO sweep — recovered', ['--outcome', 'no_change']).status, 0);
  const recurrence = invoke(content);
  assert.equal(recurrence.status, 0, recurrence.stderr);
  assert.equal(JSON.parse(recurrence.stdout).queued, true);
});

test('dry runs and invalid inputs leave no notification state or intake', t => {
  const { env, invoke, stateFile } = fixture(t);
  const content = '🔍 SBT SEO sweep — decision';
  const result = invoke(content, ['--outcome', 'decision', '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).actionable, true);
  for (const args of [['--outcome'], ['--outcome', 'invalid']]) {
    assert.notEqual(invoke(content, args).status, 0);
  }
  assert.notEqual(invoke('unrelated alert').status, 0);
  assert.equal(fs.existsSync(stateFile), false);
  assert.equal(fs.existsSync(env.SBT_NOTIFICATION_TEST_DIR), false);
});

test('a failed intake does not acknowledge or suppress a retry', t => {
  const { invoke, stateFile } = fixture(t);
  const result = invoke('⚠️ sbt-seo-sweep: preserve this failed notification', [],
    { SBT_NOTIFICATION_TEST_DIR: 'invalid-relative-sink' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /test sink must be absolute/);
  assert.equal(fs.existsSync(stateFile), false);
  const retry = invoke('⚠️ sbt-seo-sweep: preserve this failed notification');
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(JSON.parse(retry.stdout).queued, true);
});
