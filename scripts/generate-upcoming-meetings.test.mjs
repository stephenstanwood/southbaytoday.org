import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGISTAR_CITIES, fetchNextMeeting, isSubstantiveItem } from './generate-upcoming-meetings.mjs';
import { ptDateISO } from './lib/civic-meetings.mjs';
import { fetchLosGatosMeeting, LOS_GATOS_MEETINGS_PAGE, losGatosScheduleUrl,
  nextLosGatosScheduleDate } from './lib/los-gatos-meetings.mjs';

const schedule = `TOWN COUNCIL
MEETING SCHEDULE
2026 CALENDAR YEAR
July 7, 2026 Regular Council Meeting CANCELLED
July 21, 2026 Regular Council Meeting CANCELLED
October 20, 2026 Regular Council Meeting
*November 2, 2026 Regular Council Meeting
November 3, 2026 Regular Council Meeting CANCELLED
November 17, 2026 Regular Council Meeting
December 15, 2026 Regular Council Meeting
* Monday meeting`;
const scheduleUrl = 'https://www.losgatosca.gov/DocumentCenter/View/16888/Town-Council-Meeting-Schedule-';
const schedulePage = '<a class="fileType pdf" href="/DocumentCenter/View/16888/Town-Council-Meeting-Schedule-">Town Council Meeting Schedule </a>';

test('Los Gatos uses exact posted dates, including a moved Monday and cancellations', () => {
  assert.equal(nextLosGatosScheduleDate(schedule, { today: '2026-10-21' }), '2026-11-02');
  assert.equal(nextLosGatosScheduleDate(schedule, { today: '2026-11-03' }), '2026-11-17');
  assert.equal(nextLosGatosScheduleDate(schedule, { today: '2026-11-17' }), '2026-11-17');
  assert.equal(nextLosGatosScheduleDate(schedule, { today: '2026-07-01' }), null);
});

test('Los Gatos refuses missing, stale, exhausted or ambiguous schedules as source errors', () => {
  for (const text of [
    '',
    schedule.replace('2026 CALENDAR YEAR', '2025 CALENDAR YEAR'),
    schedule.replace('November 2, 2026', 'November 32, 2026'),
    schedule.replace('November 2, 2026', 'November 3, 2026'),
    schedule.replace('November 2, 2026 Regular Council Meeting', 'November 2, 2026 Regular Council Meeting POSTPONED'),
    'TOWN COUNCIL MEETING SCHEDULE 2026 CALENDAR YEAR',
  ]) assert.throws(() => nextLosGatosScheduleDate(text, { today: '2026-10-21' }));
  assert.throws(() => nextLosGatosScheduleDate(schedule, { today: '2026-12-16' }), /no future uncancelled/);
  assert.throws(() => nextLosGatosScheduleDate(schedule, { today: '2027-01-01' }), /current calendar year/);
});

test('Los Gatos follows the official schedule link and rejects missing or foreign documents', () => {
  assert.equal(losGatosScheduleUrl(schedulePage), scheduleUrl);
  assert.throws(() => losGatosScheduleUrl('<h1>Access denied</h1>'), /unambiguous/);
  assert.throws(() => losGatosScheduleUrl(schedulePage.replace('/DocumentCenter/', 'https://example.com/DocumentCenter/')), /official town document/);
  assert.throws(() => losGatosScheduleUrl(schedulePage + schedulePage.replace('16888', '99999')), /unambiguous/);
});

test('Los Gatos retrieves only permitted town page and PDF with an honest identity and crawl delay', async () => {
  const requests = [];
  const meeting = await fetchLosGatosMeeting({ today: '2026-10-21',
    fetchFn: async (url, options) => {
      requests.push(url);
      assert.match(options.headers['User-Agent'], /^SouthBaySignal\//);
      assert.equal(options.redirect, 'error');
      if (url === LOS_GATOS_MEETINGS_PAGE) return new Response(schedulePage);
      assert.equal(url, scheduleUrl);
      return new Response('%PDF-1.7\nfixture');
    },
    sleep: async ms => { requests.push(ms); },
    pdfToText: async bytes => {
      assert.equal(new TextDecoder().decode(bytes).slice(0, 5), '%PDF-');
      return schedule;
    },
  });
  assert.deepEqual(requests, [LOS_GATOS_MEETINGS_PAGE, 10_000, scheduleUrl]);
  assert.equal(meeting.date, '2026-11-02');
  assert.equal(meeting.displayDate, 'Mon, Nov 2');
  assert.equal(meeting.bodyName, 'Town Council');
  assert.equal(meeting.startTime, null);
  assert.deepEqual(meeting.agendaItems, []);
  assert.equal(meeting.confirmation.sourceUrl, scheduleUrl);
  assert.equal(meeting.confirmation.provider, 'town-of-los-gatos-schedule');
});

test('Los Gatos access, transport and parser failures never become a successful empty calendar', async () => {
  const options = { today: '2026-10-21', sleep: async () => {}, pdfToText: async () => schedule };
  await assert.rejects(fetchLosGatosMeeting({ ...options, fetchFn: async () => new Response('Forbidden', { status: 403 }) }), /HTTP 403/);
  await assert.rejects(fetchLosGatosMeeting({ ...options, fetchFn: async () => { throw Error('transport unavailable'); } }), /transport unavailable/);
  await assert.rejects(fetchLosGatosMeeting({ ...options,
    fetchFn: async url => new Response(url === LOS_GATOS_MEETINGS_PAGE ? schedulePage : '<html>Verification required</html>') }), /not a PDF/);
  await assert.rejects(fetchLosGatosMeeting({ ...options, pdfToText: async () => '',
    fetchFn: async url => new Response(url === LOS_GATOS_MEETINGS_PAGE ? schedulePage : '%PDF-1.7') }), /schedule is missing/);
});

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


test('San Jose session headings do not become agenda previews, including a canceled evening block', () => {
  assert.equal(isSubstantiveItem('Evening Session, Council Chambers, City Hall – Cancelled'), false);
  assert.equal(isSubstantiveItem('Afternoon Session, Council Chambers, City Hall'), false);
  assert.equal(isSubstantiveItem('Approval of Cancellation of the Services Agreement with the Contractor.'), true);
});
