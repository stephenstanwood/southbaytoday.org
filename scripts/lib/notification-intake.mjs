// Personal Discord notifications are retired. Keep exact actionable work in
// MILO intake; local/offline durability is owned by the installed Stoa gateway.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export async function queueNotification(content, { producer = 'southbaytoday', run = execFileSync, request = fetch } = {}) {
  const gateway = join(homedir(), 'Projects/stoa.works/scripts/queue-agent-notification.mjs');
  if (!process.env.GITHUB_ACTIONS && !process.env.VERCEL && existsSync(gateway)) {
    const result = JSON.parse(run('/opt/homebrew/bin/node', [gateway, '--producer', producer],
      { input: content, encoding: 'utf8', timeout: 45000 }));
    if (!result.queued) throw Error('MILO intake did not retain this exact notification');
    return result;
  }
  const webhook = process.env.DISCORD_WEBHOOK;
  if (!webhook) throw Error('Quiet MILO intake unavailable; never fall back to a DM');
  const response = await request(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: String(content).slice(0, 1900).replace(/<@!?\d+>|<@&\d+>|@everyone|@here/g, '[mention suppressed]'),
      allowed_mentions: { parse: [], users: [], roles: [], replied_user: false },
      embeds: [{ title: 'MILO intake: South Bay Today', color: 15105570,
        footer: { text: createHash('sha256').update(content).digest('hex') } }] }) });
  if (!response.ok) throw Error(`Quiet MILO intake HTTP ${response.status}`);
  return { queued: true, routed: 'quiet-tasks-intake' };
}
