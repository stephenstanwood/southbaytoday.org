#!/usr/bin/env node
// Used by the existing Mini southbaysignal-data-refresh caller. No new timer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { isConfirmedMeeting, ptDateISO } from './lib/civic-meetings.mjs';
import { writeJsonAtomic } from './lib/io.mjs';

export const TASK = 'southbaysignal-data-refresh';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'src/data/south-bay/upcoming-meetings.json';
const CITIES = ['san-jose', 'mountain-view', 'sunnyvale', 'cupertino', 'santa-clara',
  'palo-alto', 'saratoga', 'campbell', 'milpitas', 'los-altos', 'los-gatos'];
const STATE = path.join(os.homedir(), '.local/state/sbt-data-refresh');
const HELPER = path.join(os.homedir(), '.claude/scheduled-tasks/lib/repo-lock.sh');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateMeetings(data, { now = Date.now(), maxAgeMs = 2 * 60 * 60_000 } = {}) {
  const age = now - Date.parse(data?.generatedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > maxAgeMs) throw Error('Meetings artifact is not freshly generated');
  if (!data.meetings || !data.sourceHealth) throw Error('Meetings and source health are required');
  const today = ptDateISO(new Date(now));
  for (const city of CITIES) {
    const health = data.sourceHealth[city], meeting = data.meetings[city];
    if (!health?.provider || !['ok', 'no-meeting', 'error'].includes(health.status)) throw Error(`${city}: missing source outcome`);
    if (health.status === 'error' && !health.detail?.trim()) throw Error(`${city}: failure needs its actual reason`);
    if ((health.status === 'ok') !== Boolean(meeting)) throw Error(`${city}: meeting/source outcome mismatch`);
    if (!meeting) continue;
    if (!isConfirmedMeeting(meeting) || meeting.date < today
      || Date.parse(`${meeting.date}T12:00:00Z`) - now > 61 * 86_400_000
      || !/council/i.test(meeting.bodyName || '') || !/^https:\/\//.test(meeting.url || '')) {
      throw Error(`${city}: unconfirmed, expired or invalid council meeting`);
    }
    if (city === 'santa-clara' && meeting.bodyName !== 'City Council and Authorities Concurrent') {
      throw Error('santa-clara: unexpected council body');
    }
  }
  if (Object.keys(data.meetings).some(city => !CITIES.includes(city))) throw Error('Unknown meeting city');
  return { generatedAt: data.generatedAt, meetings: Object.keys(data.meetings).length,
    unresolved: Object.entries(data.sourceHealth).filter(([, health]) => health.status === 'error') };
}

export async function waitForRefreshLock({ stateDir = STATE, helper = HELPER,
  waitMs = 25 * 60_000, pollMs = 30_000, now = Date.now, sleep = delay,
  runLock = args => execFileSync('/bin/bash', [helper, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
  report = console.log } = {}) {
  if (!Number.isFinite(waitMs) || waitMs < 0 || !Number.isFinite(pollMs) || pollMs <= 0) throw Error('Invalid lock wait bounds');
  const pendingFile = path.join(stateDir, 'pending.json');
  const previous = fs.existsSync(pendingFile) ? JSON.parse(fs.readFileSync(pendingFile, 'utf8')) : {};
  const start = now();
  const pending = { task: TASK, requestedAt: previous.requestedAt || new Date(start).toISOString(),
    attemptAt: new Date(start).toISOString(), status: 'waiting' };
  writeJsonAtomic(pendingFile, pending);
  for (;;) {
    const status = runLock(['status', TASK]);
    // Never call acquire on an occupied lock, even an old one. The existing
    // helper's stale-recovery policy is unchanged for its other callers.
    if (status === 'free') {
      let acquired = false;
      try { runLock(['acquire', TASK]); acquired = true; }
      catch (error) { if (error.status !== 1) throw error; } // A fresh owner won the race; wait.
      if (acquired) {
        try { writeJsonAtomic(pendingFile, { ...pending, status: 'acquired', acquiredAt: new Date(now()).toISOString() }); }
        catch (error) { runLock(['release', TASK]); throw error; }
        report(`Refresh acquired the existing repo mutex after ${now() - start}ms`);
        return true;
      }
    } else if (!status.startsWith('held by ')) {
      throw Error(`Unrecognized repo mutex status: ${status}`);
    }
    const remaining = start + waitMs - now();
    if (remaining <= 0) {
      writeJsonAtomic(pendingFile, { ...pending, status: 'deferred', lastLockStatus: status });
      report(`Refresh remains pending: ${status}; the next canonical run retries this request`);
      return false;
    }
    report(`Refresh waiting for the repo mutex: ${status}`);
    await sleep(Math.min(pollMs, remaining));
  }
}

export function completeRefresh({ root = ROOT, stateDir = STATE, helper = HELPER } = {}) {
  const status = execFileSync('/bin/bash', [helper, 'status', TASK], { encoding: 'utf8' }).trim();
  if (!status.startsWith(`held by '${TASK}' `)) throw Error('Keep the refresh mutex through publication verification');
  const bytes = fs.readFileSync(path.join(root, DATA));
  const summary = validateMeetings(JSON.parse(bytes));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const head = git(['rev-parse', 'HEAD']);
  const committed = execFileSync('git', ['-C', root, 'show', `HEAD:${DATA}`]);
  const remote = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0];
  if (!bytes.equals(committed) || head !== remote) throw Error('Meetings must match the pushed main commit before clearing recovery');
  const receipt = { task: TASK, status: 'published', checkedAt: new Date().toISOString(),
    commit: head, artifactSha256: hash(bytes), ...summary };
  writeJsonAtomic(path.join(stateDir, 'completed.json'), receipt);
  fs.rmSync(path.join(stateDir, 'pending.json'), { force: true });
  return receipt;
}

async function main(args) {
  if (args[0] === 'wait') {
    if (!await waitForRefreshLock()) process.exitCode = 75;
  } else if (args[0] === 'check') {
    console.log(JSON.stringify(validateMeetings(JSON.parse(fs.readFileSync(path.join(ROOT, DATA), 'utf8')))));
  } else if (args[0] === 'complete') {
    console.log(JSON.stringify(completeRefresh()));
  } else throw Error('Use data-refresh-recovery.mjs wait|check|complete');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
