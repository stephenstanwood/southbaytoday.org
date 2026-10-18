import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGISTAR_CITIES, fetchNextMeeting } from './generate-upcoming-meetings.mjs';
import { ptDateISO } from './lib/civic-meetings.mjs';

test('Santa Clara upcoming meetings query the actual council and authorities body', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const config = LEGISTAR_CITIES.find(city => city.city === 'santa-clara');
  const body = 'City Council and Authorities Concurrent';
  assert.equal(config.body, body);
  const today = ptDateISO();
  const sourceUrl = 'https://santaclara.legistar.com/MeetingDetail.aspx?LEGID=4892&GID=693';
  globalThis.fetch = async url => {
    if (String(url).endsWith('/EventItems')) return Response.json([]);
    assert.match(new URL(url).searchParams.get('$filter'), /EventBodyName eq 'City Council and Authorities Concurrent'/);
    return Response.json([{ EventId: 4892, EventDate: `${today}T00:00:00`,
      EventBodyName: body, EventTime: '5:30 PM', EventAgendaStatusName: 'Final', EventInSiteURL: sourceUrl }]);
  };
  const meeting = await fetchNextMeeting(config.client, config.site, config.body);
  assert.equal(meeting.bodyName, body);
  assert.equal(meeting.startTime, '17:30');
  assert.equal(meeting.url, sourceUrl);
  assert.equal(meeting.confirmation.observedDate, today);
});
