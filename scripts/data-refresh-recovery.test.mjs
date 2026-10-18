import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { waitForRefreshLock, validateMeetings, completeRefresh, TASK } from './data-refresh-recovery.mjs';
import { confirmMeeting, ptDateISO } from './lib/civic-meetings.mjs';

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sbt-refresh-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function data(now = Date.now()) {
  const cities = ['san-jose', 'mountain-view', 'sunnyvale', 'cupertino', 'santa-clara',
    'palo-alto', 'saratoga', 'campbell', 'milpitas', 'los-altos', 'los-gatos'];
  const date = ptDateISO(new Date(now));
  return { generatedAt: new Date(now).toISOString(),
    meetings: { 'san-jose': confirmMeeting({ date, bodyName: 'City Council',
      url: 'https://sanjose.legistar.com/MeetingDetail.aspx?LEGID=8107' },
    { provider: 'legistar', sourceUrl: 'https://webapi.legistar.com/v1/sanjose/Events' }) },
    sourceHealth: Object.fromEntries(cities.map(city => [city, { provider: 'fixture',
      status: city === 'san-jose' ? 'ok' : 'no-meeting' }])) };
}

test('a busy canonical caller waits, then acquires after the real owner releases', async t => {
  const stateDir = temporary(t), calls = [];
  let clock = Date.now(), polls = 0;
  const result = await waitForRefreshLock({ stateDir, waitMs: 3000, pollMs: 1000,
    now: () => clock, sleep: async ms => { clock += ms; }, report: () => {},
    runLock: args => { calls.push(args[0]);
      return args[0] === 'status' ? (++polls < 3 ? "held by 'sbs-fact-check' age 3m (stale at 45m)" : 'free') : 'acquired'; } });
  assert.equal(result, true);
  assert.deepEqual(calls, ['status', 'status', 'status', 'acquire']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir, 'pending.json'))).status, 'acquired');
});

test('an occupied old lock is never acquired or released; a later run consumes the pending request', async t => {
  const stateDir = temporary(t), calls = [];
  const initial = await waitForRefreshLock({ stateDir, waitMs: 0, report: () => {},
    runLock: args => { calls.push(args[0]); return "held by 'real-long-running-owner' age 90m (stale at 45m)"; } });
  assert.equal(initial, false);
  assert.deepEqual(calls, ['status']);
  const before = JSON.parse(fs.readFileSync(path.join(stateDir, 'pending.json')));
  assert.equal(before.status, 'deferred');
  assert.equal(await waitForRefreshLock({ stateDir, report: () => {}, runLock: args => args[0] === 'status' ? 'free' : 'acquired' }), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir, 'pending.json'))).requestedAt, before.requestedAt);
});

test('a new owner winning acquisition is retried without a release', async t => {
  const stateDir = temporary(t), calls = [];
  let clock = 1000, acquisitions = 0;
  assert.equal(await waitForRefreshLock({ stateDir, now: () => clock, waitMs: 1000,
    pollMs: 100, sleep: async ms => { clock += ms; }, report: () => {},
    runLock: args => { calls.push(args[0]);
      if (args[0] === 'status') return 'free';
      if (++acquisitions === 1) throw Object.assign(Error('busy'), { status: 1 });
      return 'acquired'; } }), true);
  assert.deepEqual(calls, ['status', 'acquire', 'status', 'acquire']);
});

test('unknown lock state fails closed and keeps recovery pending', async t => {
  const stateDir = temporary(t), calls = [];
  await assert.rejects(waitForRefreshLock({ stateDir, report: () => {},
    runLock: args => { calls.push(args[0]); return 'unavailable'; } }), /Unrecognized/);
  assert.deepEqual(calls, ['status']);
  assert.ok(fs.existsSync(path.join(stateDir, 'pending.json')));
});

test('publication rejects stale, past, unconfirmed and missing-provider data while preserving explicit errors', () => {
  const now = Date.now();
  assert.equal(validateMeetings(data(now), { now }).meetings, 1);
  const stale = data(now - 4 * 86_400_000);
  assert.throws(() => validateMeetings(stale, { now }), /freshly generated/);
  const past = data(now); past.meetings['san-jose'].date = '2020-01-01';
  assert.throws(() => validateMeetings(past, { now }), /expired/);
  const unconfirmed = data(now); delete unconfirmed.meetings['san-jose'].confirmation;
  assert.throws(() => validateMeetings(unconfirmed, { now }), /unconfirmed/);
  const missing = data(now); delete missing.sourceHealth['los-gatos'];
  assert.throws(() => validateMeetings(missing, { now }), /missing source/);
  const failed = data(now); failed.sourceHealth['los-gatos'] = { provider: 'MuniCode', status: 'error', detail: 'HTTP 403' };
  assert.deepEqual(validateMeetings(failed, { now }).unresolved, [['los-gatos', failed.sourceHealth['los-gatos']]]);
  failed.sourceHealth['san-jose'].status = 'error'; failed.sourceHealth['san-jose'].detail = 'HTTP 500';
  assert.throws(() => validateMeetings(failed, { now }), /outcome mismatch/);
});

test('recovery clears only after the fresh artifact matches committed and pushed main', t => {
  const temporaryRoot = temporary(t), root = path.join(temporaryRoot, 'repo');
  const remote = path.join(temporaryRoot, 'remote.git'), stateDir = path.join(temporaryRoot, 'state');
  const helper = path.join(temporaryRoot, 'lock.sh');
  fs.mkdirSync(path.join(root, 'src/data/south-bay'), { recursive: true });
  fs.mkdirSync(stateDir);
  fs.writeFileSync(helper, `printf "held by '${TASK}' age 0m (stale at 45m)"`);
  fs.writeFileSync(path.join(stateDir, 'pending.json'), '{}');
  const artifact = path.join(root, 'src/data/south-bay/upcoming-meetings.json');
  fs.writeFileSync(artifact, JSON.stringify(data()));
  const git = args => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  git(['init', '-b', 'main']);
  execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
  git(['remote', 'add', 'origin', remote]); git(['add', '.']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'fixture']);
  assert.throws(() => completeRefresh({ root, stateDir, helper }), /pushed main/);
  assert.ok(fs.existsSync(path.join(stateDir, 'pending.json')));
  git(['push', 'origin', 'main']);
  fs.appendFileSync(artifact, '\n');
  assert.throws(() => completeRefresh({ root, stateDir, helper }), /pushed main/);
  git(['restore', 'src/data/south-bay/upcoming-meetings.json']);
  assert.equal(completeRefresh({ root, stateDir, helper }).status, 'published');
  assert.equal(fs.existsSync(path.join(stateDir, 'pending.json')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir, 'completed.json'))).meetings, 1);
});
