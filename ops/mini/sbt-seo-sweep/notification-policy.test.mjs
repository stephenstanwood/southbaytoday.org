import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationDecision } from './notification-policy.mjs';

test('identical failures stay quiet until recovery; changed failures remain actionable', () => {
  const first = notificationDecision({}, '⚠️ sbt-seo-sweep: 2026-10-14 missing login', 'failure');
  assert.equal(first.send, true);
  assert.equal(notificationDecision(first.state, '⚠️ sbt-seo-sweep: 2026-10-21 missing login', 'failure').send, false);
  assert.equal(notificationDecision(first.state, '⚠️ sbt-seo-sweep: broken sitemap', 'failure').send, true);
  const recovery = notificationDecision(first.state, 'unchanged audit passed', 'no_change');
  assert.equal(recovery.send, false);
  assert.equal(notificationDecision(recovery.state, '⚠️ sbt-seo-sweep: missing login', 'failure').send, true);
  assert.equal(notificationDecision(first.state, 'shipped useful work', 'shipped').send, true);
});
