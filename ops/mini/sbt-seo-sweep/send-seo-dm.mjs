#!/usr/bin/env node
// Compatibility entry point: exact actionable work goes to MILO, never a DM.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { notificationDecision } from './notification-policy.mjs';
import { queueNotification } from '../../../scripts/lib/notification-intake.mjs';

try {
  const dryRun = process.argv.includes('--dry-run');
  const args = process.argv.slice(2).filter(arg => arg !== '--dry-run');
  const index = args.indexOf('--outcome');
  let outcome;
  if (index >= 0) {
    outcome = args.splice(index, 2)[1];
    if (!['no_change', 'failure', 'shipped', 'decision', 'completed'].includes(outcome)) {
      throw Error('Invalid notification outcome');
    }
  }
  let content = args.join(' ');
  if (!content && !process.stdin.isTTY) {
    for await (const chunk of process.stdin) content += chunk;
  }
  if (!content.trim() || !['🔍 SBT SEO sweep', '⚠️ sbt-seo-sweep:'].some(prefix => content.trim().startsWith(prefix))) {
    throw Error('Refusing sbt-seo-sweep input: not an allowed alert type');
  }
  outcome ??= content.trim().startsWith('⚠️') ? 'failure' : 'completed';
  const stateFile = process.env.MILO_NOTIFICATION_STATE
    ? path.join(process.env.MILO_NOTIFICATION_STATE, 'sbt-seo-sweep', 'notification.json')
    : path.join(os.homedir(), '.local/state/sbt-seo-sweep/notification.json');
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const decision = notificationDecision(previous, content, outcome);
  const actionable = outcome === 'failure' || outcome === 'decision';
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, queued: false, actionable: actionable && decision.send }));
  } else {
    let result;
    if (actionable && decision.send) {
      result = await queueNotification(content, { producer: 'sbt-seo-sweep' });
      if (!result?.queued) throw Error('MILO intake did not retain the exact input');
    } else {
      result = { queued: false, quiet: true, reason: actionable ? 'unchanged-failure' : 'routine-result' };
    }
    // Commit deduplication only after durable intake accepts the exact input.
    fs.mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(decision.state), { mode: 0o600 });
    fs.renameSync(`${stateFile}.tmp`, stateFile);
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
