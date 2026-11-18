import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGISTAR_CITIES, fetchCivicEngageMeeting, fetchNextMeeting, findNextCouncilMeeting, isSubstantiveItem,
} from './generate-upcoming-meetings.mjs';
import { ptDateISO } from './lib/civic-meetings.mjs';
import { fetchLosGatosMeeting, LOS_GATOS_MEETINGS_PAGE, losGatosScheduleUrl,
  nextLosGatosScheduleDate } from './lib/los-gatos-meetings.mjs';
import { fetchCampbellCalendar, fetchLegistarCalendar, fetchPaloAltoMeeting } from './lib/upcoming-council-calendars.mjs';

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

test('public Legistar calendars supply council dates before the Web API has posted agendas', async t => {
  const today = '2026-11-18';
  const dates = [
    ['mountain-view', '12/8/2026', '6:30 PM', '2026-12-08', '18:30', ''],
    ['sunnyvale', '12/1/2026', '4:30 PM', '2026-12-01', '17:30',
      'Special Meeting: Closed Session - 4:30 PM | Special Joint Meeting - 5:30 PM | Regular Meeting - 7 PM'],
    ['santa-clara', '12/1/2026', '5:30 PM', '2026-12-01', '17:30', ''],
  ];
  let config, html;
  const row = (n, body, date, clock, note) => `
    <tr id="ctl00_ContentPlaceHolder1_gridUpcomingMeetings_ctl00__${n}">
      <td>${body}</td><td>${date}</td><td></td><td>${clock}</td>
      <td>Council Chambers<br/><em>${note}</em></td><td>Meeting details</td><td>Not available</td>
    </tr>`;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.startsWith('https://webapi.legistar.com/')) {
      // Vendor placeholders and a separate closed-only sitting are ineligible.
      return Response.json([
        {EventBodyName: config.body, EventDate: today, EventComment: 'Special Meeting Closed Session'},
        {EventBodyName: config.body, EventDate: '2027-12-31', EventTime: '12:15 AM'},
      ]);
    }
    assert.equal(url, `https://${config.site}.legistar.com/Calendar.aspx`);
    assert.equal(options.redirect, 'error');
    return new Response(html);
  });
  for (const [city, date, clock, expectedDate, expectedStart, note] of dates) {
    config = LEGISTAR_CITIES.find(config => config.city === city);
    html = `<table id="ctl00_ContentPlaceHolder1_gridUpcomingMeetings_ctl00">
      ${row(0, config.body, '11/24/2026', '5:30 PM', 'CANCELLED')}
      ${row(1, 'Council Appointments Review Committee', '11/25/2026', '5:30 PM', '')}
      ${row(2, config.body, date, clock, note)}
    </table>`;
    const meeting = await findNextCouncilMeeting(
      () => fetchNextMeeting(config.client, config.site, config.body, today),
      () => fetchLegistarCalendar(config, today, location => location),
    );
    assert.equal(meeting.bodyName, config.body);
    assert.equal(meeting.date, expectedDate);
    assert.equal(meeting.startTime, expectedStart);
    assert.equal(meeting.confirmation.observedDate, expectedDate);
    assert.equal(meeting.confirmation.provider, 'legistar-public-calendar');
  }
});

test('Legistar department calendar skips cancelled and closed slots and leaves a draft Cupertino time blank', async t => {
  const cell = (date, events) => `<td><a href="#${date}" title="Date" class="rsDateHeader">Date</a>${events}</td>`;
  const appointment = (n, label, notes) => `
    <a id="RadScheduler_ctl${n}_hypMeetingDetail" title="Not viewable by the public - draft">${label}</a>
    <span><em>${notes}</em></span>`;
  const sanJoseHtml = cell('2026-11-24', appointment(1, 'City Council 1:30 PM', 'CANCELLED'))
    + cell('2026-12-01', appointment(2, 'City Council Closed Session 9:30 AM', '')
      + appointment(3, 'City Council 1:30 PM', 'Closed Session at 9:30 a.m.'));
  const cupertinoHtml = cell('2026-11-19', appointment(1, 'CC 3:30 PM', 'Non-Televised Special Meeting Closed Session'))
    + cell('2026-12-01', appointment(2, 'CC 5:45 PM', 'Televised Special Meeting (5:45) and Televised Regular Meeting (6:45)'));
  t.mock.method(globalThis, 'fetch', async url => new Response(url.includes('sanjose') ? sanJoseHtml : cupertinoHtml));

  const sanJose = LEGISTAR_CITIES.find(config => config.city === 'san-jose');
  const sj = await fetchLegistarCalendar(sanJose, '2026-11-18', location => location);
  assert.equal(sj.meeting.date, '2026-12-01');
  assert.equal(sj.meeting.startTime, '13:30');
  assert.equal(sj.meeting.url, sanJose.departmentCalendar);
  assert.equal(sj.cancellations[0].date, '2026-11-24');

  const cupertino = LEGISTAR_CITIES.find(config => config.city === 'cupertino');
  const cu = await fetchLegistarCalendar(cupertino, '2026-11-18', location => location);
  assert.equal(cu.meeting.date, '2026-12-01');
  assert.equal(cu.meeting.startTime, null);
});

test('calendar reconciliation uses the earlier public slot, rejects a cancelled feed slot and keeps matched agendas', async () => {
  const feed = { date: '2026-12-01', startTime: '19:00', agendaItems: [{ title: 'Published agenda item' }] };
  const early = { date: feed.date, startTime: '17:30' };
  const fallback = (meeting, cancellations = []) => async () => ({ meeting, cancellations });
  assert.equal(await findNextCouncilMeeting(async () => feed, fallback(early)), early);
  assert.equal(await findNextCouncilMeeting(async () => feed, fallback({ ...feed, agendaItems: [] })), feed);
  assert.equal(await findNextCouncilMeeting(async () => feed, fallback(null, [
    { date: feed.date, scheduledTime: feed.startTime },
  ])), null);
  assert.equal(await findNextCouncilMeeting(async () => { throw Error('HTTP 503'); }, fallback(early)), early);
  await assert.rejects(findNextCouncilMeeting(async () => null, async () => { throw Error('calendar markup changed'); }), /markup changed/);
});

test('Campbell falls back to the dated city calendar and skips closed and cancelled sessions', async t => {
  const event = (id, title, time) => `<li class="calendar-list-event">
    <h3><a href="/m/calendar/event/detail/${id}">${title}</a></h3>
    <div>${time} - No set end time</div><div class="calendar-location-content">Council Chamber</div>
  </li>`;
  t.mock.method(globalThis, 'fetch', async url => {
    const calendar = new URL(url);
    assert.equal(calendar.origin, 'https://campbellca.gov');
    assert.equal(calendar.searchParams.get('cat'), '22');
    assert.equal(calendar.searchParams.get('endDate'), '01/17/2027');
    return new Response(`<ul id="categories-options"></ul>
      <div id="calendar-events-header-2026-11-24"></div>
      ${event(1, 'City Council Regular Meeting - Cancelled', '7:00 PM')}
      <div id="calendar-events-header-2026-12-01"></div>
      ${event(2, 'City Council Executive Session', '6:30 PM')}
      ${event(3, 'City Council Regular Meeting', '7:00 PM')}`);
  });
  const meeting = await findNextCouncilMeeting(async () => null, () => fetchCampbellCalendar('2026-11-18'));
  assert.equal(meeting.date, '2026-12-01');
  assert.equal(meeting.startTime, '19:00');
  assert.equal(meeting.location, 'Council Chamber');
  assert.equal(meeting.url, 'https://campbellca.gov/m/calendar/event/detail/3');
  assert.match(meeting.confirmation.sourceUrl, /campbellca\.gov\/m\/calendar\?/);
});

test('Palo Alto selects the first public special or regular event and checks robots before reading its detail', async t => {
  const special = '/Events-Directory/City-Clerk/2026/Special-Meeting';
  const regular = '/Events-Directory/City-Clerk/2026/City-Council-Meeting';
  const excluded = '/Events-Directory/City-Clerk/2027/City-Council-Meeting';
  const card = (url, title, day, month, year = '2026') => `
    <article><a href="${url}"><h2 class="list-item-title">${title}</h2>
    <span class="part-date">${day}</span><span class="part-month">${month}</span><span class="part-year">${year}</span>
    <p class="list-item-address">Community Meeting Room,&nbsp;250 Hamilton Ave</p></a></article>`;
  const index = cards => `${cards.length} Result(s) Found ${cards.join('')}`;
  let totalDetails = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://www.paloalto.gov');
    if (parsed.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /Events-Directory/City-Clerk/2027/*\n');
    if (url.includes('Nov%2018')) {
      if (url.includes('pageindex=2')) {
        return new Response(index([
          card(special, 'City Council Meeting', '30', 'Nov'),
          card(regular, 'City Council Meeting', '7', 'Dec'),
        ]) + ' Page 2 of 2');
      }
      return new Response(index([
        card('/Events-Directory/City-Clerk/2026/Committee', 'Finance Committee', '19', 'Nov'),
        card('/Events-Directory/City-Clerk/2026/Cancelled', 'Canceled City Council Meeting', '23', 'Nov'),
      ]) + ' Page 1 of 2');
    }
    if (url.includes('Dec%201')) return new Response(index([card(regular, 'City Council Meeting', '7', 'Dec')]));
    if (url.includes('Jan%201')) return new Response(index([card(excluded, 'City Council Meeting', '11', 'Jan', '2027')]));
    assert.ok([special, regular].includes(parsed.pathname), url);
    totalDetails++;
    const [month, day] = parsed.pathname === special ? ['11', '30'] : ['12', '7'];
    return new Response(`<h1>City Council Meeting</h1><li data-start-year='2026' data-start-month='${month}'
      data-start-day='${day}' data-start-hour='17' data-start-mins='30'>City Council</li>`);
  });
  const november = await fetchPaloAltoMeeting('2026-11-18');
  assert.equal(november.date, '2026-11-30');
  assert.equal(november.startTime, '17:30');
  assert.equal(november.location, 'Community Meeting Room');
  assert.ok(november.url.endsWith(special));
  const december = await fetchPaloAltoMeeting('2026-12-01');
  assert.equal(december.date, '2026-12-07');
  assert.equal(december.startTime, '17:30');
  const january = await fetchPaloAltoMeeting('2027-01-01');
  assert.equal(january.date, '2027-01-11');
  assert.equal(january.startTime, null);
  assert.match(january.confirmation.sourceUrl, /Events-Directory\?/);
  assert.equal(totalDetails, 2);
});

test('Saratoga publishes the dated agenda link and skips cancellation and translation notices', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-18T09:07:06Z') });
  const base = 'https://www.saratoga.ca.us';
  const index = `${base}/AgendaCenter/City-Council-13`;
  const agenda = '/AgendaCenter/ViewFile/Agenda/_11182026-1496';
  const cancelled = '/AgendaCenter/ViewFile/Agenda/_11182026-1497';
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, index);
    return new Response(`
      <a href="/AgendaCenter/ViewFile/Agenda/_11042026-1490">City Council Regular Meeting Agenda</a>
      <strong aria-label="Agenda for November 18, 2026"><abbr title="November">Nov</abbr> 18, 2026</strong>
      <a href="${cancelled}">Agenda</a>
      <a aria-label="November 18, 2026, Notice of Cancellation" href="${cancelled}">Agenda</a>
      <a href="/AgendaCenter/ViewFile/Agenda/_11182026-1498">City Council Meeting Chinese Agenda</a>
      <a href="${agenda}">City Council Regular Meeting Agenda</a>
      <a href="${agenda}">Agenda</a>
    `);
  });
  const meeting = await fetchCivicEngageMeeting(base, 'City-Council-13');
  assert.equal(meeting.date, '2026-11-18');
  assert.equal(meeting.displayDate, 'Wed, Nov 18');
  assert.equal(meeting.startTime, null);
  assert.equal(meeting.url, `${base}${agenda}`);
  assert.equal(meeting.confirmation.sourceUrl, meeting.url);
});


test('San Jose session headings do not become agenda previews, including a canceled evening block', () => {
  assert.equal(isSubstantiveItem('Evening Session, Council Chambers, City Hall – Cancelled'), false);
  assert.equal(isSubstantiveItem('Afternoon Session, Council Chambers, City Hall'), false);
  assert.equal(isSubstantiveItem('Approval of Cancellation of the Services Agreement with the Contractor.'), true);
});
