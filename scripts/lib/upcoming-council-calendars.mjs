import {
  confirmMeeting, isClosedSessionMeeting, legistarEventBodyName, normalizeMeetingTime, resolvePublicStart,
} from "./civic-meetings.mjs";
import { stripHtml } from "./event-html.mjs";

const UA = "SouthBaySignal/1.0 (stanwood.dev; public civic data aggregator)";
const DAY_MS = 86_400_000;
const CANCELLED = /\bcancel(?:led|ed|lation|ation)\b|\bpostponed\b/i;
const CLOSED_TITLE = /\b(?:closed|executive) session\b/i;
const COUNCIL_TITLE = /^(?:palo alto )?(?:city )?council(?: (?:regular|special|adjourned|joint|study))?(?: (?:meeting|session)){0,2}$/i;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CAMPBELL = "https://campbellca.gov/m/calendar";
const PALO_ALTO = "https://www.paloalto.gov";

const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}=(["'])(.*?)\\1`, "i"))?.[2];
const isoDate = (year, month, day) => {
  const value = [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? value : null;
};

export function inCouncilWindow(date, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isoDate(...date.split("-"))) return false;
  const days = (Date.parse(date) - Date.parse(today)) / DAY_MS;
  return days >= 0 && days <= 60;
}

export function compareCouncilMeetings(a, b) {
  // An untimed session might be first on a shared date. Keep its date-only evidence.
  return a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "");
}

function calendarMeeting({ date, startTime, bodyName, location = null, url, closedSessionStart }, provider, sourceUrl) {
  return confirmMeeting({
    date, startTime, bodyName, location, url, closedSession: false, agendaItems: [],
    ...(closedSessionStart ? { closedSessionStart } : {}),
    displayDate: new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
    }),
  }, { provider, sourceUrl, observedDate: date });
}

async function getText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

export function isCancelledCalendarSlot(meeting, cancellations) {
  return cancellations.some(row => row.date === meeting.date
    && (!row.scheduledTime || [meeting.startTime, meeting.closedSessionStart, meeting.scheduledTime].includes(row.scheduledTime)));
}

function confirmedCalendar(rows, today, provider, sourceUrl) {
  const upcoming = rows.filter(row => inCouncilWindow(row.date, today));
  const cancellations = upcoming.filter(row => row.cancelled && !row.closed);
  const first = upcoming.filter(row => !row.cancelled && !row.closed && !isCancelledCalendarSlot(row, cancellations))
    .sort(compareCouncilMeetings)[0];
  return { meeting: first ? calendarMeeting(first, provider, sourceUrl) : null, cancellations };
}

function publicLegistarLink(href, calendarUrl) {
  const link = href && URL.parse(stripHtml(href), calendarUrl);
  return link?.origin === new URL(calendarUrl).origin && link.pathname === "/MeetingDetail.aspx"
    ? link.href : calendarUrl;
}

// The public Upcoming Meetings table includes dates before their agendas reach
// the Web API. Read the location and the schedule note separately.
function legistarListRows(html) {
  return Array.from(html.matchAll(/<tr\b[^>]*\bid="[^"]*_gridUpcomingMeetings_ctl00__\d+"[^>]*>([\s\S]*?)<\/tr>/gi), ([, row]) => {
    const cells = Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), match => match[1]);
    const [month, day, year] = stripHtml(cells[1]).split("/");
    const date = isoDate(year, month, day);
    if (!date || !cells[5]) throw Error("Unrecognized Legistar upcoming meeting row");
    return {
      date,
      bodyName: stripHtml(cells[0]),
      time: stripHtml(cells[3]),
      location: stripHtml(cells[4].split(/<br\s*\/?>/i)[0]) || null,
      note: stripHtml(cells[4].match(/<em\b[^>]*>([\s\S]*?)<\/em>/i)?.[1]?.replace(/<br\s*\/?>/gi, " | ")),
      meetingLink: cells[5].match(/<a\b[^>]*>/i)?.[0] ?? "",
      agenda: stripHtml(cells[6]),
    };
  });
}

// San José and Cupertino's department calendars expose a dated month grid.
// The main list can omit next-month appointments that are visible in this grid.
function legistarMonthRows(html, body) {
  const rows = [];
  for (const [, cell] of html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)) {
    const date = cell.match(/href="#(\d{4}-\d{2}-\d{2})"[^>]*\bclass="rsDateHeader"/)?.[1];
    if (!date) continue;
    for (const [, entry] of cell.matchAll(/(<a\b[^>]*id="[^"]*_hypMeetingDetail"[^>]*>[\s\S]*?)(?=<a\b[^>]*id="[^"]*_hypMeetingDetail"|$)/gi)) {
      const meetingLink = entry.match(/^<a\b[^>]*>/i)[0];
      const title = stripHtml(entry.slice(meetingLink.length, entry.indexOf("</a>")));
      const [, name, time] = title.match(/^(.*?)\s+(\d{1,2}(?::\d{2})?\s*[AP]M)$/i) ?? [null, title];
      const note = stripHtml(entry.match(/<em\b[^>]*>([\s\S]*?)<\/em>/i)?.[1]?.replace(/<br\s*\/?>/gi, " | "));
      rows.push({ date, bodyName: /^CC$/i.test(name) ? body : name, time, note, meetingLink });
    }
  }
  return rows;
}

export function hasCupertinoPublicBlock(note) {
  return /\b(?<!non[- ])televised (?:regular|special|study) (?:meeting|session)\b/i.test(note);
}

export async function fetchLegistarCalendar({ site, body, departmentCalendar }, today, cleanLocation) {
  const url = departmentCalendar ?? `https://${site}.legistar.com/Calendar.aspx`;
  const html = await getText(url);
  const marker = departmentCalendar ? /\bclass="rsDateHeader"/ : /\bid="[^"]*_gridUpcomingMeetings_ctl00"/;
  if (!marker.test(html)) throw Error(`Missing Legistar calendar: ${url}`);
  const rows = departmentCalendar ? legistarMonthRows(html, body) : legistarListRows(html);
  const council = rows.filter(row => legistarEventBodyName({
    EventBodyName: row.bodyName, EventComment: row.note,
  }) === body).map(row => {
    const scheduledTime = normalizeMeetingTime(row.time);
    const closed = isClosedSessionMeeting({ bodyName: row.bodyName, comment: row.note })
      && !(site === "cupertino" && hasCupertinoPublicBlock(row.note));
    const publicStart = resolvePublicStart({ startTime: scheduledTime, comment: row.note });
    const href = attribute(row.meetingLink, "href");
    // Cupertino's calendar can open with a closed or draft special session.
    // A public detail link and an explicitly public block can confirm its time.
    const uncertain = site === "cupertino"
      && (!href || !hasCupertinoPublicBlock(row.note) || CLOSED_TITLE.test(row.note));
    return {
      ...row, ...publicStart, scheduledTime, closed,
      startTime: uncertain ? null : publicStart.startTime,
      cancelled: CANCELLED.test([row.time, row.location, row.note, row.agenda].join(" ")),
      location: cleanLocation(row.location),
      url: publicLegistarLink(href, url),
    };
  });
  return confirmedCalendar(council, today, "legistar-public-calendar", url);
}

function shortDate(date) {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}

export async function fetchCampbellCalendar(today) {
  const end = new Date(Date.parse(today) + 60 * DAY_MS).toISOString().slice(0, 10);
  const query = new URLSearchParams({ cat: "22", startDate: shortDate(today), endDate: shortDate(end) });
  // CivicPlus's public City Council view supplies date, time and destination in
  // a single request. Campbell requests ten seconds between requests.
  const url = `${CAMPBELL}?${query}`;
  const html = await getText(url);
  if (!/\bid="categories-options"/.test(html)) throw Error("Missing Campbell calendar");
  const days = html.split(/id="calendar-events-header-(\d{4}-\d{2}-\d{2})"/);
  const rows = [];
  for (let i = 1; i < days.length; i += 2) {
    for (const [, event] of days[i + 1].matchAll(/<li\b[^>]*\bcalendar-list-event\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const [, href, label] = event.match(/<a\b[^>]*href="(\/m\/calendar\/event\/detail\/\d+)"[^>]*>([\s\S]*?)<\/a>/i) ?? [];
      const title = stripHtml(label);
      const bodyName = title.replace(CANCELLED, "").replace(/^[\s:–—-]+|[\s:–—-]+$/g, "");
      if (!href || !COUNCIL_TITLE.test(bodyName)) continue;
      const details = stripHtml(event);
      const startTime = normalizeMeetingTime(details.match(/\b(\d{1,2}(?::\d{2})?\s*[AP]M)\s*[-–—]/i)?.[1]);
      rows.push({
        date: days[i], bodyName, startTime, scheduledTime: startTime,
        location: stripHtml(event.match(/class="calendar-location-content"[^>]*>([\s\S]*?)<\/div>/i)?.[1]) || null,
        url: new URL(href, CAMPBELL).href,
        cancelled: CANCELLED.test(title),
      });
    }
  }
  return confirmedCalendar(rows, today, "campbell-city-calendar", url);
}

function paloAltoIndex(today, page) {
  const [year, month, day] = today.split("-");
  const date = `${MONTHS[Number(month) - 1]} ${Number(day)} ${year}`;
  return `${PALO_ALTO}/Events-Directory?dlv_OC%20CL%20Public%20Events%20Listing=`
    + `(dd_OC%20Composite%20Date=${encodeURIComponent(date)})(dd_OC%20Event%20Categories=City%20Council%20Meetings)`
    + (page > 1 ? `(pageindex=${page})` : "");
}

// The city's current robots file has one wildcard group and path exclusions.
// Check it before following dynamic detail URLs, including future years.
function paloAltoAccess(robots) {
  const agents = Array.from(robots.matchAll(/^User-agent:[ \t]*(\S+)[ \t\r]*$/gim), match => match[1]);
  if (agents.length !== 1 || agents[0] !== "*" || /^(?:Allow|Crawl-delay):/im.test(robots)) {
    throw Error("Palo Alto robots policy changed");
  }
  const denied = Array.from(robots.matchAll(/^Disallow:[ \t]*(\S+)/gim), ([, value]) => {
    const anchored = value.endsWith("$");
    const path = anchored ? value.slice(0, -1) : value;
    const pattern = path.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp("^" + pattern + (anchored ? "$" : ""));
  });
  return url => {
    const { pathname, search } = new URL(url);
    return !denied.some(rule => rule.test(pathname + search));
  };
}

function paloAltoListRows(html, url) {
  const count = html.match(/\b(\d+)\s+Result\(s\) Found\b/i)?.[1];
  if (count === undefined) throw Error("Missing Palo Alto event directory results");
  const rows = Array.from(html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi), ([, article]) => {
    const [day, month, year] = ["date", "month", "year"].map(part =>
      article.match(new RegExp(`class="part-${part}">([^<]+)<`))?.[1]);
    const date = day && year ? isoDate(year, MONTHS.indexOf(month) + 1, day) : null;
    const title = stripHtml(article.match(/<h2\b[^>]*class="list-item-title"[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
    const detail = URL.parse(stripHtml(attribute(article.match(/<a\b[^>]*>/i)?.[0] ?? "", "href")), url);
    const address = stripHtml(article.match(/class="list-item-address">([\s\S]*?)<\/p>/i)?.[1]);
    const slug = detail?.pathname.replace(/-/g, " ");
    const council = detail?.origin === PALO_ALTO && /^\/Events-Directory\/City-Clerk\//.test(detail.pathname)
      && COUNCIL_TITLE.test(title) && !CANCELLED.test(slug) && !CLOSED_TITLE.test(slug);
    return { date, council, title, url: detail?.href, location: address.split(",")[0] || null };
  }).filter(row => row.date);
  if (Number(count) && !rows.length) throw Error("Palo Alto directory returned results without dated event cards");
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function paloAltoMeetingTime(html, date) {
  const title = stripHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (CANCELLED.test(title) || CLOSED_TITLE.test(title)) return { ineligible: true };
  const datedTags = Array.from(html.matchAll(/<li\b[^>]*\bdata-start-year=(?:"[^"]+"|'[^']+')[^>]*>/gi), match => match[0]);
  if (!COUNCIL_TITLE.test(title) || !datedTags.length) throw Error("Missing dated Palo Alto council meeting details");
  const starts = new Set();
  for (const tag of datedTags) {
    const observed = isoDate(...["year", "month", "day"].map(key => attribute(tag, `data-start-${key}`)));
    if (observed !== date) continue;
    const hour = attribute(tag, "data-start-hour");
    const minute = attribute(tag, "data-start-mins");
    starts.add(hour != null && minute != null ? normalizeMeetingTime(`${hour}:${minute.padStart(2, "0")}`) : null);
  }
  if (starts.size === 0) return { ineligible: true };
  return { startTime: starts.size === 1 ? [...starts][0] : null };
}

export async function fetchPaloAltoMeeting(today) {
  const allowed = paloAltoAccess(await getText(`${PALO_ALTO}/robots.txt`));
  const candidates = [];
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    const url = paloAltoIndex(today, page);
    if (!allowed(url)) throw Error("Palo Alto event directory is excluded by robots.txt");
    const html = await getText(url);
    const rows = paloAltoListRows(html, url);
    const pagination = html.match(/\bPage (\d+) of (\d+)\b/);
    if (pagination && Number(pagination[1]) !== page) throw Error("Palo Alto event pagination changed");
    pages = Number(pagination?.[2] ?? 1);
    for (const row of rows.filter(row => row.council && inCouncilWindow(row.date, today))) {
      if (candidates.length && row.date > candidates[0].date) break;
      const detail = allowed(row.url) ? paloAltoMeetingTime(await getText(row.url), row.date) : {};
      if (detail.ineligible) continue;
      candidates.push(calendarMeeting({
        ...row, bodyName: row.title, startTime: detail.startTime ?? null,
      }, "palo-alto-city-calendar", detail.startTime ? row.url : url));
    }
    const lastDate = rows.at(-1)?.date;
    if (lastDate && (lastDate > candidates[0]?.date || (lastDate > today && !inCouncilWindow(lastDate, today)))) break;
    if (page === 8 && page < pages) throw Error("Palo Alto calendar did not cover the upcoming window within eight pages");
  }
  return candidates.sort(compareCouncilMeetings)[0] ?? null;
}
