import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { eventSourceDefinitions } from '../generate-events.mjs';
import { buildSourceHealth, eventsForSourceResult, retainFailedOptionalSources } from '../lib/event-source-health.mjs';
import { applyVerifiedEventFacts } from '../../src/lib/south-bay/eventSourceFacts.mjs';

const capture = JSON.parse(readFileSync(new URL('../lib/fixtures/league-schedule-retention-2026-11-05.json', import.meta.url)));
const today = '2026-11-05';
const adapter = () => eventSourceDefinitions().find(source => source.id === 'fetchSantaCruzWarriorsSchedule');

test('a real Warriors schedule failure preserves 24 captured games and original provenance', async t => {
  const source = adapter();
  assert.equal(source.label, 'G League');
  const original = structuredClone(capture);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async input => {
    requests.push(String(input));
    return new Response('Forbidden', { status: 403 });
  });
  const failed = await Promise.allSettled([source.fn()]);
  assert.equal(requests.length, 1, 'an access refusal is not retried against another season');
  assert.equal(failed[0].status, 'rejected', 'non-strict callers must also report failure');
  const retained = retainFailedOptionalSources([source], failed, capture, { today });
  assert.deepEqual(retained.flatMap(eventsForSourceResult), capture.events);
  assert.deepEqual(capture, original, 'the actual source capture stays immutable');
  const [health] = buildSourceHealth([source], retained);
  assert.equal(health.status, 'error');
  assert.equal(health.count, 0);
  assert.equal(health.retainedCount, 24);
  assert.equal(health.retainedFrom, capture.generatedAt);
  assert.match(health.error, /403/);

  const repeated = retainFailedOptionalSources([source], failed, {
    generatedAt: '2026-11-06T13:00:00.000Z',
    events: retained.flatMap(eventsForSourceResult), sourceHealth: [health],
  }, { today: '2026-11-15' });
  assert.deepEqual(repeated.flatMap(eventsForSourceResult), capture.events.filter(event => event.date >= '2026-11-15'));
  assert.equal(repeated[0].retained.from, capture.generatedAt, 'a new refresh cannot restamp old verification');
});

test('the current official schedule preserves actual Pacific tipoffs without predicting game finishes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-05T13:00:00.000Z') });
  t.mock.method(globalThis, 'fetch', async input => {
    assert.equal(String(input), capture.sourceEvidence.url);
    return Response.json(capture.schedule);
  });
  const events = await adapter().fn();
  assert.equal(events.length, 24);
  for (const event of events) {
    const published = capture.events.find(row => row.id === event.id);
    assert(published, event.id);
    for (const field of ['title', 'date', 'time', 'venue', 'city', 'url']) {
      assert.equal(event[field], published[field], `${event.id}: ${field}`);
    }
    assert.equal(event.endTime, null, 'the schedule supplies tipoff only');
  }
});

test('invalid schedule JSON fails closed while a valid empty season supersedes retained games', async t => {
  const source = adapter();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'temporarily unavailable' }));
  await assert.rejects(source.fn(), /no gameDates array/);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return Response.json({ leagueSchedule: { gameDates: [] } });
  });
  const success = await Promise.allSettled([source.fn()]);
  assert.equal(requests, 2, 'the normal two-season empty-calendar check is preserved');
  const result = retainFailedOptionalSources([source], success, capture, { today });
  assert.deepEqual(result.flatMap(eventsForSourceResult), []);
  assert.equal(buildSourceHealth([source], result)[0].status, 'empty');
  assert.equal(result[0].retained, undefined);

  const replacement = [{ status: 'fulfilled', value: [{ ...capture.events[0], time: '5:00 PM' }] }];
  assert.deepEqual(retainFailedOptionalSources([source], replacement, capture, { today }), replacement);
});

test('retained league rows lose estimated finishes without changing published starts or unrelated events', () => {
  for (const original of [...capture.events, capture.nhlEvent]) {
    const before = structuredClone(original);
    const corrected = applyVerifiedEventFacts(original);
    assert.deepEqual(corrected, { ...original, endTime: null });
    assert.deepEqual(original, before);
    assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
  }
  for (const row of [
    { ...capture.nhlEvent, source: 'Ticketmaster' },
    { ...capture.nhlEvent, url: 'https://www.sapcenter.com/events/detail/published-occurrence' },
    { ...capture.events[0], id: 'other-performance' },
    { ...capture.events[0], source: 'SJSU Events' },
  ]) assert.deepEqual(applyVerifiedEventFacts(row), row, 'published finishes from other sources remain intact');
});
