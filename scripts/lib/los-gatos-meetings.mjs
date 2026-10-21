import { setTimeout as delay } from 'node:timers/promises';
import { confirmMeeting, pdfTextLines, ptDateISO } from './civic-meetings.mjs';

export const LOS_GATOS_MEETINGS_PAGE = 'https://www.losgatosca.gov/3044/Town-Council-Public-Meetings-Information';
export const LOS_GATOS_PROVIDER = 'Town of Los Gatos schedule';
const UA = 'SouthBaySignal/1.0 (stanwood.dev; public civic data aggregator)';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];
const ROW = new RegExp(`^\\s*\\*?\\s*(${MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(\\d{4})\\s+Regular\\s+Council\\s+Meeting(?:\\s+(CANCELLED|CANCELED))?\\s*$`, 'i');

/** Follow only the schedule document the town actually publishes on its council page. */
export function losGatosScheduleUrl(html) {
  const urls = new Set();
  for (const anchor of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const label = anchor[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/^Town Council Meeting Schedule$/i.test(label)) continue;
    const href = anchor[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!href) continue;
    const url = new URL(href.replace(/&amp;/g, '&'), LOS_GATOS_MEETINGS_PAGE);
    if (url.origin !== new URL(LOS_GATOS_MEETINGS_PAGE).origin
      || !/^\/DocumentCenter\/View\/\d+(?:\/|$)/.test(url.pathname)) {
      throw Error('Los Gatos schedule link is not an official town document');
    }
    urls.add(url.href);
  }
  if (urls.size !== 1) throw Error('Los Gatos council page must link one unambiguous meeting schedule');
  return [...urls][0];
}

/** Exact dated rows, including cancellations and moved meetings; never recurrence math. */
export function nextLosGatosScheduleDate(text, { today = ptDateISO(), maxDays = 60 } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(maxDays) || maxDays < 0) {
    throw Error('Invalid Los Gatos meeting window');
  }
  const year = String(text).match(/\bTOWN\s+COUNCIL\s+MEETING\s+SCHEDULE\s+(\d{4})\s+CALENDAR\s+YEAR\b/i)?.[1];
  if (!year || year !== today.slice(0, 4)) throw Error('Los Gatos meeting schedule is missing or not for the current calendar year');
  const rows = [];
  const seen = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    if (!/Regular\s+Council\s+Meeting/i.test(line)) continue;
    const match = line.match(ROW);
    if (!match) throw Error(`Unrecognized Los Gatos schedule row: ${line.trim()}`);
    const [, month, day, rowYear, cancelled] = match;
    const iso = `${rowYear}-${String(MONTHS.indexOf(month.toLowerCase()) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
    const timestamp = Date.parse(`${iso}T12:00:00Z`);
    if (rowYear !== year || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== iso || seen.has(iso)) {
      throw Error(`Invalid or duplicate Los Gatos schedule date: ${iso}`);
    }
    seen.add(iso);
    rows.push({ date: iso, cancelled: Boolean(cancelled) });
  }
  if (!rows.length) throw Error('No dated council meetings parsed from the Los Gatos schedule');
  const next = rows.filter(row => !row.cancelled && row.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  // An exhausted/obsolete document cannot establish a recess or next year's dates.
  if (!next) throw Error('Los Gatos published schedule has no future uncancelled meeting to verify');
  return Date.parse(`${next.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`) <= maxDays * 86_400_000
    ? next.date : null;
}

export async function fetchLosGatosMeeting({ fetchFn = globalThis.fetch, today = ptDateISO(),
  pdfToText = pdfTextLines, sleep = delay } = {}) {
  // MuniCode's acquisition path is restricted. The town independently publishes
  // a dated, cancellation-aware schedule here. These page/document paths were
  // permitted by the town's robots policy when verified on 2026-10-21; its
  // calendar, RSS and iCalendar endpoints are restricted and are never requested.
  const get = async url => {
    const response = await fetchFn(url, {
      headers: { 'User-Agent': UA },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw Error(`Los Gatos schedule HTTP ${response.status}: ${url}`);
    return response;
  };
  const page = await get(LOS_GATOS_MEETINGS_PAGE);
  const sourceUrl = losGatosScheduleUrl(await page.text());
  await sleep(10_000); // The town requests a ten-second crawl delay.
  const document = await get(sourceUrl);
  const bytes = new Uint8Array(await document.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw Error('Los Gatos meeting schedule response is not a PDF');
  }
  const date = nextLosGatosScheduleDate(await pdfToText(bytes), { today });
  if (!date) return null;
  return confirmMeeting({
    date,
    displayDate: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    }),
    // The schedule confirms the date, but supplies neither a per-meeting time
    // nor an agenda. Do not borrow a recurring time or claim agenda retrieval.
    startTime: null,
    bodyName: 'Town Council',
    location: null,
    closedSession: false,
    url: LOS_GATOS_MEETINGS_PAGE,
    agendaItems: [],
  }, { provider: 'town-of-los-gatos-schedule', sourceUrl, observedDate: date });
}
