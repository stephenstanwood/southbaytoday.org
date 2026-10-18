// Personal Discord notifications are retired. Keep exact actionable work in
// MILO intake; local/offline durability is owned by the installed Stoa gateway.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { writeJsonAtomic } from './io.mjs';

export async function queueNotification(content, options = {}) {
  const { producer = 'southbaytoday', run = execFileSync, request = fetch } = options;
  // Node's test runner marks its workers. CLI fixtures must preserve that
  // context and use their own sink; an installed personal gateway is never a
  // test transport. Explicitly injected transports remain available to tests.
  if (process.env.NODE_TEST_CONTEXT) {
    const directory = process.env.SBT_NOTIFICATION_TEST_DIR;
    if (directory) {
      if (!isAbsolute(directory)) throw Error('Notification test sink must be absolute');
      const id = createHash('sha256').update(`${producer}\n${content}`).digest('hex');
      writeJsonAtomic(join(directory, `${id}.json`), { producer, content: String(content) });
      return { queued: true, routed: 'isolated-test-intake' };
    }
  }
  const installed = join(homedir(), '.local/bin/stoa-notify');
  const gateway = join(homedir(), 'Projects/stoa.works/scripts/queue-agent-notification.mjs');
  const local = !process.env.GITHUB_ACTIONS && !process.env.VERCEL && (existsSync(installed) || existsSync(gateway));
  if (process.env.NODE_TEST_CONTEXT && typeof options[local ? 'run' : 'request'] !== 'function') {
    throw Error('Node tests require an isolated notification sink or injected transport for this route');
  }
  if (local) {
    const result = JSON.parse(run(existsSync(installed) ? installed : '/opt/homebrew/bin/node',
      existsSync(installed) ? ['--producer', producer] : [gateway, '--producer', producer],
      { input: content, encoding: 'utf8', timeout: 45000 }));
    if (!result.queued) throw Error('MILO intake did not retain this exact notification');
    return result;
  }
  const webhook = process.env.DISCORD_WEBHOOK;
  if (!webhook) throw Error('Quiet MILO intake unavailable; never fall back to a DM');
  const endpoint = new URL(webhook); endpoint.searchParams.set('wait', 'true');
  const response = await request(endpoint.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: String(content).slice(0, 1900).replace(/<@!?\d+>|<@&\d+>|@everyone|@here/g, '[mention suppressed]'),
      allowed_mentions: { parse: [], users: [], roles: [], replied_user: false }, flags: 1 << 12,
      embeds: [{ title: 'MILO intake: South Bay Today', color: 15105570,
        footer: { text: createHash('sha256').update(content).digest('hex') } }] }) });
  if (!response.ok) throw Error(`Quiet MILO intake HTTP ${response.status}`);
  return { queued: true, routed: 'quiet-tasks-intake' };
}
