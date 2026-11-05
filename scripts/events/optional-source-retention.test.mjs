import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { eventSourceDefinitions, fetchLosAltosVillageEvents, fetchSvlgEvents } from '../generate-events.mjs';
import { buildSourceHealth, eventsForSourceResult, retainFailedOptionalSources, sourceProblems } from '../lib/event-source-health.mjs';

const today = '2026-10-30';
const observedAt = '2026-10-29T12:00:00.000Z';
const sources = [
  { id: 'fetchLosAltosVillageEvents', label: 'Los Altos Village Association', preserveOnFailure: true },
  { id: 'fetchSvlgEvents', label: 'SVLG', preserveOnFailure: true },
];
const dates = ['2026-10-30', '2026-11-13', '2026-11-28', '2026-12-04', '2026-12-10', '2026-12-17'];
const prior = {
  generatedAt: observedAt,
  events: [
    ...dates.map((date, index) => ({ id: `village-${index}`, source: sources[0].label, date,
      title: `Verified village occurrence ${index}`, time: '4:00 PM', cost: null,
      venue: 'State Street Market', description: 'Previously reviewed source text.' })),
    { id: 'svlg-nov', source: 'SVLG', title: 'November conversation', date: '2026-11-18',
      venue: 'SVLG Conference Room', time: '11:00 AM', cost: 'unknown' },
    { id: 'svlg-dec', source: 'SVLG', title: 'December conversation', date: '2026-12-10',
      time: '10:00 AM', registration: 'closed', attendanceNote: 'Confirm availability with SVLG.' },
  ],
};
const rejected = (message) => ({ status: 'rejected', reason: new Error(message) });

async function failedAdapters() {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input); requests.push(url);
    if (url.hostname === 'downtownlosaltos.org') return new Response('Forbidden', { status: 403 });
    assert.equal(url.hostname, 'svlg.org');
    return new Response('<html>Temporarily unavailable</html>', { status: 200 });
  };
  try {
    const results = await Promise.allSettled([fetchLosAltosVillageEvents(), fetchSvlgEvents({ today })]);
    assert.equal(requests.length, 2, '403 is not retried or routed to another endpoint');
    return results;
  } finally { globalThis.fetch = original; }
}

test('the actual failed adapters preserve eight future occurrences while remaining failed', async () => {
  const failures = await failedAdapters();
  assert.equal(failures[0].status, 'rejected');
  assert.equal(failures[1].status, 'rejected', 'non-strict SVLG callers must not swallow parsing errors');
  assert.match(failures[1].reason.message, /no recognizable event cards/);
  const results = retainFailedOptionalSources(sources, failures, prior, { today });
  assert.deepEqual(results.flatMap(eventsForSourceResult), prior.events);
  assert.notEqual(results[0].retained.events[0], prior.events[0]);
  const health = buildSourceHealth(sources, results);
  assert.deepEqual(health.map((item) => [item.status, item.count, item.retainedCount, item.retainedFrom]),
    [['error', 0, 6, observedAt], ['error', 0, 2, observedAt]]);
  assert.deepEqual(health[0].retainedDateCounts, Object.fromEntries(dates.map((date) => [date, 1])));
  assert.equal(health[0].error, '403');
  assert.equal(sourceProblems(health).tolerated.length, 2);
  const otherFailures = Array.from({ length: 5 }, (_, index) => ({ id: `other-${index}`, label: `Other ${index}`, status: 'error' }));
  assert.equal(sourceProblems([...health, ...otherFailures]).blocking.length, 7, 'retention cannot hide a systemic outage');
});

test('repeated failures retain provenance and expire occurrences instead of extending them', () => {
  const failures = [rejected('403'), rejected('calendar parse failed')];
  const initial = retainFailedOptionalSources(sources, failures, prior, { today });
  const next = { generatedAt: '2026-11-01T12:00:00.000Z',
    events: initial.flatMap(eventsForSourceResult), sourceHealth: buildSourceHealth(sources, initial) };
  const repeated = retainFailedOptionalSources(sources, failures, next, { today: '2026-12-11' });
  assert.deepEqual(repeated.flatMap(eventsForSourceResult).map((event) => event.id), ['village-5']);
  assert.equal(repeated[0].retained.from, observedAt);
  assert.equal(repeated[1].retained, undefined);
  assert.deepEqual(retainFailedOptionalSources(sources, failures, next, { today: '2026-12-18' }).flatMap(eventsForSourceResult), []);
});

test('successful replacements and empty calendars do not resurrect removed or cancelled listings', () => {
  const changed = { ...prior.events[6], date: '2026-11-19', time: '2:00 PM' };
  const success = [{ status: 'fulfilled', value: [] }, { status: 'fulfilled', value: [changed] }];
  const results = retainFailedOptionalSources(sources, success, prior, { today });
  assert.deepEqual(results.flatMap(eventsForSourceResult), [changed]);
  assert.deepEqual(buildSourceHealth(sources, results).map((item) => item.status), ['empty', 'ok']);
  assert.ok(results.every((result) => !result.retained));
});

test('only opted-in optional sources with traceable dated rows can retain', () => {
  const failures = [rejected('403'), rejected('parse failed')];
  const unconfigured = [{ ...sources[0], preserveOnFailure: false }, { ...sources[1], critical: true }];
  assert.deepEqual(retainFailedOptionalSources(unconfigured, failures, prior, { today }), failures);
  assert.deepEqual(retainFailedOptionalSources(sources, failures, { events: prior.events }, { today }), failures);
  const malformed = { ...prior, events: [
    { id: 'undated', source: 'SVLG' },
    { id: 'past', source: 'SVLG', date: '2026-10-01' },
    { id: 'wrong-source', source: 'Other calendar', date: '2026-12-10' },
  ] };
  assert.deepEqual(retainFailedOptionalSources(sources, failures, malformed, { today }), failures);
  assert.throws(() => retainFailedOptionalSources(sources, failures, prior), /Pacific date/);
});

test('an ongoing occurrence expires at its actual end date', () => {
  const snapshot = { generatedAt: observedAt, events: [
    { id: 'ongoing', source: 'SVLG', date: '2026-10-20', endDate: '2026-10-31' },
  ] };
  const failures = [rejected('403'), rejected('parse failed')];
  assert.equal(retainFailedOptionalSources(sources, failures, snapshot, { today }).flatMap(eventsForSourceResult).length, 1);
  assert.equal(retainFailedOptionalSources(sources, failures, snapshot, { today: '2026-11-01' }).flatMap(eventsForSourceResult).length, 0);
});

const novemberCapture = JSON.parse(readFileSync(new URL('../lib/fixtures/failed-source-retention-2026-11-05.json', import.meta.url)));
const novemberSources = () => eventSourceDefinitions().filter(source =>
  ['fetchSjsuEvents', 'fetchSanJoseTheatersEvents'].includes(source.id));

test('registered university and theater failures retain the captured future records without claiming a live success', async t => {
  const adapters = novemberSources();
  assert.deepEqual(adapters.map(source => source.label), ['SJSU Events', 'San Jose Theaters']);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async input => {
    requests.push(String(input));
    return new Response('Forbidden', { status: 403 });
  });
  const capturedBefore = structuredClone(novemberCapture);
  const failures = await Promise.allSettled(adapters.map(source => source.fn()));
  assert.equal(requests.length, 2, 'an access refusal is not retried or bypassed');
  assert(failures.every(result => result.status === 'rejected'));
  const retained = retainFailedOptionalSources(adapters, failures, novemberCapture, { today: '2026-11-05' });
  const expected = novemberCapture.events.filter(event => event.date >= '2026-11-05');
  assert.deepEqual(retained.flatMap(eventsForSourceResult), expected);
  assert.deepEqual(novemberCapture, capturedBefore, 'the original published facts and timestamps remain immutable');
  const health = buildSourceHealth(adapters, retained);
  assert(health.every(source => source.status === 'error' && source.count === 0
    && source.retainedFrom === novemberCapture.generatedAt && /403/.test(source.error)));
  assert.equal(sourceProblems(health).tolerated.length, 2, 'retention does not clear the live failures');

  const repeat = retainFailedOptionalSources(adapters, failures, {
    generatedAt: '2026-11-06T12:00:00.000Z', events: expected, sourceHealth: health,
  }, { today: '2026-11-11' });
  assert.deepEqual(repeat.flatMap(eventsForSourceResult), expected.filter(event => event.date >= '2026-11-11'));
  assert(repeat.filter(result => result.retained).every(result => result.retained.from === novemberCapture.generatedAt));
});

test('a successful university or theater replacement, including an empty calendar, supersedes its retained records', () => {
  const adapters = novemberSources();
  const changed = { ...novemberCapture.events.find(event => event.source === 'San Jose Theaters'), time: '9:00 PM' };
  const results = retainFailedOptionalSources(adapters, [
    { status: 'fulfilled', value: [] }, { status: 'fulfilled', value: [changed] },
  ], novemberCapture, { today: '2026-11-05' });
  assert.deepEqual(results.flatMap(eventsForSourceResult), [changed]);
  assert(results.every(result => !result.retained));
  assert.deepEqual(buildSourceHealth(adapters, results).map(source => source.status), ['empty', 'ok']);
});

test('SJSU rejects an HTML outage page but accepts a valid empty RSS calendar', async t => {
  const adapter = novemberSources().find(source => source.id === 'fetchSjsuEvents');
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Temporarily unavailable</html>'));
  await assert.rejects(adapter.fn(), /no RSS channel/);
  t.mock.method(globalThis, 'fetch', async input => String(input).endsWith('/calendar.xml')
    ? new Response('<rss version="2.0"><channel><title>SJSU Events</title></channel></rss>')
    : Response.json({ events: [] }));
  assert.deepEqual(await adapter.fn(), []);
});
