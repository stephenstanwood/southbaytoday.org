import { createHash } from 'node:crypto';

export function notificationDecision(previous, content, outcome) {
  if (outcome === 'no_change') return { send: false, state: {} };
  if (outcome !== 'failure') return { send: true, state: {} };
  const normalized = content.replace(/\b\d{4}-\d{2}-\d{2}(?:T[0-9:.Z+-]+)?/g, '<date>');
  const failure = createHash('sha256').update(normalized).digest('hex');
  return { send: previous.failure !== failure, state: { failure } };
}
