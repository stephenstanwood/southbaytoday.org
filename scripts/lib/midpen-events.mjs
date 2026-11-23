/**
 * Midpeninsula Regional Open Space District (openspace.org) activity parsing.
 *
 * Split out of `generate-events.mjs` so the markup handling is unit-testable
 * without network access, same as `hicklebees-events.mjs`.
 *
 * Why this source exists (2026-09-04 growth sweep): the event corpus was 43%
 * library programming (793 of 1853 records across five library systems), and
 * `outdoor` was the smallest category in the whole feed at 27 events — in a
 * region whose defining amenity is open space. Libraries also close on every
 * public holiday, so the corpus went thinnest exactly on the three-day
 * weekends readers most need an answer for: Labor Day 2026-09-07 had SEVEN
 * events countywide, four of them generic Meetup listings. Midpen is a public
 * agency, publishes docent-led hikes and volunteer projects months ahead, and
 * runs them on holidays.
 *
 * Markup notes:
 *
 * 1. The listing is a Drupal Views TABLE (`os_activity_search`) whose columns
 *    carry stable semantic classes (`views-field-title`,
 *    `views-field-aggregated-dates`, `views-field-field-preserve-term-1`).
 *    Parse by column class, never by column position — the district reorders
 *    and hides columns from the exposed filters.
 * 2. Despite the "aggregated" name, every observed row carries exactly one
 *    `.activity-search-date` / `.activity-search-time` pair. Rows are parsed
 *    one-date-per-row on purpose; if that ever changes the parser drops the
 *    extra dates rather than silently pairing the wrong date to the wrong time.
 * 3. Times are inconsistently punctuated in the same table: "9:00 a.m." on
 *    volunteer projects, "6:00 pm" on guided activities.
 * 4. `type` is one of Guided Activity / Volunteer Project / Meeting. Meeting
 *    rows are the district's Board meetings — they have no preserve and belong
 *    to the civic-meetings pipeline, not the events corpus. They are dropped.
 */

import { isEventExplicitlyInactive } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { parseDatePT } from "./dates.mjs";

/** Strip tags/entities from one Views cell. */
export function midpenText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** "9:00 a.m." / "6:00 pm" / "12:00 pm" → "9:00 AM" / "6:00 PM" / "12:00 PM". */
export function midpenClockTime(raw) {
  const match = String(raw || "").match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/i);
  if (!match) return null;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  if (minutes > 59) return null;
  let h12 = parseInt(match[1], 10);
  if (h12 < 1 || h12 > 12) return null;
  const ampm = match[3].toLowerCase() === "p" ? "PM" : "AM";
  return `${h12}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "Saturday, Sep 12, 2026" / "Sunday, September 6, 2026" → "2026-09-12". */
export function midpenIsoDate(raw) {
  const match = String(raw || "").match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = parseInt(match[2], 10);
  if (day < 1 || day > 31) return null;
  return `${match[3]}-${month}-${String(day).padStart(2, "0")}`;
}

/**
 * Santa Clara County preserves only, with the city each one's public access
 * point actually sits in.
 *
 * Every assignment below was read off the district's own "Where to Meet"
 * directions on a live event page (2026-09-04), not inferred from the preserve
 * name. That check earned its keep on Sierra Azul: the preserve is usually
 * described as Los Gatos, but its public trailhead is the Mt. Umunhum Summit
 * lot reached from Hwy 85 at Camden Ave, which is San Jose.
 *
 * Midpen spans three counties. Its San Mateo County preserves (Windy Hill,
 * Purisima Creek, El Corte de Madera, Russian Ridge, Pulgas Ridge, La Honda
 * Creek, Thornewood, Teague Hill, Ravenswood, Coal Creek, Cloverdale Ranch)
 * and the Skyline ridge preserves that straddle the county line (Skyline
 * Ridge, Long Ridge, Los Trancos) are deliberately absent: out of coverage, or
 * not confidently assignable to one of our cities. Do not add a preserve here
 * without reading its directions text first.
 */
export const MIDPEN_PRESERVE_CITY = {
  "Rancho San Antonio Preserve": "cupertino",
  "Fremont Older Preserve": "cupertino",
  "Picchetti Ranch Preserve": "cupertino",
  "Bear Creek Redwoods Preserve": "los-gatos",
  "St. Joseph's Hill Preserve": "los-gatos",
  "Sierra Azul Preserve": "san-jose",
  "Saratoga Gap Preserve": "saratoga",
  "Monte Bello Preserve": "los-altos",
};

/** Preserve name → covered city slug, or null when out of coverage. */
export function midpenPreserveCity(preserve) {
  const key = midpenText(preserve);
  if (!key) return null;
  return MIDPEN_PRESERVE_CITY[key] ?? null;
}

/**
 * Parse one `/get-involved/events-activities` listing page into raw rows.
 * Meeting rows and rows missing a title, link or date are dropped here; the
 * coverage filter is applied by the caller so it can log what it skipped.
 */
export function parseMidpenListPage(html) {
  const rows = [];
  for (const row of String(html || "").match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const cell = (suffix) => {
      const match = row.match(
        new RegExp(`<td[^>]*views-field-${suffix}[^>]*>([\\s\\S]*?)</td>`),
      );
      return match ? match[1] : "";
    };

    const type = midpenText(cell("type"));
    if (!type || type === "Meeting") continue;

    const titleCell = cell("title");
    const link = titleCell.match(/href="(\/events\/[^"]+)"/);
    const title = midpenText(titleCell);
    if (!link || !title) continue;

    const dateCell = cell("aggregated-dates");
    const date = midpenIsoDate(
      midpenText((dateCell.match(/activity-search-date'?"?[^>]*>([\s\S]*?)<\/div>/) || [])[1]),
    );
    if (!date) continue;

    const time = midpenClockTime(
      midpenText((dateCell.match(/activity-search-time'?"?[^>]*>([\s\S]*?)<\/div>/) || [])[1]),
    );

    const miles = midpenText(cell("field-aprox-total-miles"));

    rows.push({
      type,
      title,
      path: link[1],
      date,
      time,
      preserve: midpenText(cell("field-preserve-term-1")),
      miles: /^\d+(\.\d+)?$/.test(miles) ? miles : null,
    });
  }
  return rows;
}

/** The portal's current capacity, independent of its generic waitlist prose. */
export function parseMidpenVolunteerAvailability(html) {
  const text = midpenText(String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));
  // The descriptive boilerplate says "If there are 0 spots available" on
  // every project. Only the actual capacity section is an availability signal.
  const spots = text.match(/Volunteer Spots Remaining\s+(\d+)\s+open spots\b/i);
  if (!spots) return null;
  return Number(spots[1]) === 0 ? "full" : "required";
}

export function midpenVolunteerRegistration(detail, previousEvent) {
  return detail?.registration || (previousEvent?.registration === "full" ? "full" : "required");
}

export function midpenVolunteerUrl(event) {
  try {
    const url = new URL(event?.url || "");
    if (url.protocol !== "https:") return null;
    if (/^(?:www\.)?openspace\.org$/i.test(url.hostname)
        && /^\/events\/volunteer-projects\/[a-z0-9-]+\/?$/i.test(url.pathname)) return url.href;
    if (url.hostname === "volunteer.openspace.org" && url.pathname === "/need/detail/"
        && /^\d+$/.test(url.searchParams.get("need_id") || "")) return url.href;
  } catch { /* Not a Midpen occurrence URL. */ }
  return null;
}

// Midpen's guided activity pages give the closing date and local time in the
// reservation sentence, independently of the event date and the opening time.
function guidedReservationDeadline(body, eventDate) {
  if (!eventDate) return null;
  const deadline = midpenText(body).match(/\breservations? (?:are|is) required and will be accepted on or after\b.{0,100}?\band close ([A-Za-z]+\.? \d{1,2})(?:,? (\d{4}))? at (\d{1,2}(?::\d{2})?\s*[ap]\.?\s*m\.?)(?!\w)/i);
  if (!deadline) return null;

  const [, monthDay, sourceYear, rawClock] = deadline;
  const eventYear = Number(eventDate.slice(0, 4));
  let date = midpenIsoDate(`${monthDay} ${sourceYear || eventYear}`);
  if (!sourceYear && date?.slice(5, 7) === "12" && eventDate.slice(5, 7) === "01") {
    date = midpenIsoDate(`${monthDay} ${eventYear - 1}`);
  }
  const clock = midpenClockTime(rawClock);
  if (!date || date > eventDate || !clock) return null;

  const [hour, minute, period] = clock.split(/[: ]/);
  const hour24 = String(Number(hour) % 12 + (period === "PM" ? 12 : 0)).padStart(2, "0");
  const closes = parseDatePT(`${date}T${hour24}:${minute}`);
  if (!closes) return null;

  return {
    registrationClosesBy: closes.toISOString(),
    attendanceNote: `Reservations close ${monthDay} at ${clock.replace(":00 ", " ")} PT.`,
  };
}

/** Pull optional activity copy, trailhead, times and live volunteer capacity. */
export function parseMidpenDetail(html) {
  const text = String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h\d|br)[^>]*>/gi, "\n")
    .replace(/<br[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const lines = text
    .split("\n")
    .map((line) => midpenText(line))
    .filter(Boolean);
  const body = lines.join("\n");

  const meetMatch = body.match(/Where to Meet\n([\s\S]{0,600}?)(?:\n(?:Link to Google Map|To ensure|For more information|If your activity)|$)/);
  // Volunteer projects redirect to Galaxy Digital. Its public meeting block
  // can name a separate access gate, so never substitute the preserve's main
  // parking lot. Use a published Plus Code with its locality, not a guessed
  // street address or the portal's generic location table.
  const volunteerMeet = body.match(/(?:^|\n)(Meeting Location[^\n]*)\n([\s\S]*?)(?:\nWhat You Will Need|$)/);
  const volunteerAddress = midpenText(volunteerMeet?.[2]).match(
    /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\s+[^.;:\n]+?\s+(?:California|CA)\s+\d{5}\b/i,
  )?.[0];
  const meetingPlace = volunteerAddress
    || (meetMatch ? meetMatch[1].replace(/\n/g, " ").trim() : null);

  const dateMarkup = String(html || "").match(/event-page__event-date--start[^>]*>([^<]+)</i);
  const eventDate = dateMarkup ? midpenIsoDate(midpenText(dateMarkup[1])) : null;
  const guidedDeadline = guidedReservationDeadline(body, eventDate);

  // Eligibility and registration deadlines live outside Description. Keep
  // them as attendance terms rather than turning waiver text into the blurb.
  const requirements = [...String(html || "").matchAll(/<tr\b[^>]*class=["'][^"']*\brequirement\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => midpenText(row[1].match(/<td\b[^>]*class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1]));
  const minimumAge = requirements.find((value) => /^\d{1,2} and older$/i.test(value));
  const deadline = requirements.find((value) => /^Register by [A-Za-z]+ \d{1,2}, \d{4}$/i.test(value));
  const minorTerms = body.match(/(?:^|\n)(All minors under the age of 18[^\n]+)/)?.[1];
  const gate = /not the main lot/i.test(volunteerMeet?.[1] || "")
    ? volunteerMeet?.[2].match(/\bgate\s+([A-Z0-9]+)\b/i)?.[1] : null;
  const attendanceNotes = [
    minimumAge ? `Ages ${minimumAge}.` : null,
    minorTerms,
    deadline ? `${deadline}.` : null,
    guidedDeadline?.attendanceNote,
    gate ? `Meet at gate ${gate}, not the main lot.` : null,
  ].filter(Boolean);

  // "9:30 am - 12:30 pm" sits directly under the date line on the detail page.
  const rangeMatch = body.match(
    /(\d{1,2}(?::\d{2})?\s*[ap]\.?\s*m\.?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?\s*m\.?)/i,
  );

  // The longest paragraph on the page is the activity write-up — but only
  // after the driving directions are excluded. "History on Two Wheels" shipped
  // its turn-by-turn ("On Prospect Road in Cupertino. Exit Highway 85 at De
  // Anza Boulevard...") as the event description on the first live run,
  // because the directions run longer than the write-up and the district
  // sometimes breaks them across lines so a leading "Meet at" prefix check
  // misses the tail. Match on directions grammar, and drop anything the
  // meeting-place block already contains.
  const BOILERPLATE = /^(To ensure|For more information|If your activity|After your participation|Meet at|Where to Meet|Approximate Total Miles|Link to Google Map)/;
  const DIRECTIONS = /\b(exit (?:the )?high?way|exit highway|take the [\w .]+ exit|turn (?:left|right)|stop sign|parking (?:area|lot)|miles? (?:west|east|north|south) of|travel time|follow [A-Z][\w.]* (?:Rd|Road|Ave|Blvd)|I-280|Hwy\.?\s*\d|Highway \d)\b/i;
  const meetingHaystack = (meetingPlace || "").toLowerCase();
  // Galaxy Digital volunteer pages have a named Description section. Use it
  // before the general fallback, which otherwise chooses the longer waiver.
  const volunteerDescription = body.match(/(?:^|\n)Description\n([\s\S]*?)(?:\nProject Details|\nP\s*roject Details|\nWhat You Will Need|$)/)?.[1];
  const volunteerParagraph = volunteerDescription?.split(/\n/)
    .filter((line) => line.length > 80 && !/^(All minors|First time|Returning volunteers|If there are)/i.test(line))[0];
  const paragraph = volunteerParagraph || lines
    .filter((line) => line.length > 80)
    .filter((line) => !BOILERPLATE.test(line))
    .filter((line) => !DIRECTIONS.test(line))
    .filter((line) => !meetingHaystack.includes(line.slice(0, 60).toLowerCase()))
    .sort((a, b) => b.length - a.length)[0] || null;

  const titleMarkup = String(html || "").match(/<h1\b[^>]*class="[^"]*card__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  // Volunteer occurrence URLs redirect to Galaxy Digital. Its own heading
  // and single-date table must confirm the occurrence too; a registration
  // deadline or a date mentioned in the description is not the event date.
  const volunteerTitle = String(html || "").match(/<h1\b[^>]*class=["'][^"']*\bpanel-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  const volunteerInfo = String(html || "").match(/<section\b[^>]*class=["'][^"']*\baddress-time\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
  const volunteerDates = [...String(volunteerInfo?.[1] || "").matchAll(/<td\b[^>]*class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)]
    .map((cell) => midpenText(cell[1]))
    .filter((text) => /^Happens On\b/.test(text));
  const volunteerDate = volunteerDates.length === 1
    ? volunteerDates[0].match(/^Happens On ([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})$/) : null;
  const title = midpenText(titleMarkup?.[1] || volunteerTitle?.[1]) || null;
  return {
    title,
    inactive: isEventExplicitlyInactive({ title }),
    date: eventDate ?? (volunteerTitle && volunteerDate ? midpenIsoDate(volunteerDate[1]) : null),
    description: paragraph?.replace(/\s+([.,;!?])/g, "$1") || null,
    meetingPlace,
    attendanceNote: attendanceNotes.length ? attendanceNotes.join(" ") : null,
    registrationClosesBy: guidedDeadline?.registrationClosesBy ?? null,
    startTime: rangeMatch ? midpenClockTime(rangeMatch[1]) : null,
    endTime: rangeMatch ? midpenClockTime(rangeMatch[2]) : null,
    registration: parseMidpenVolunteerAvailability(html)
      ?? (/\breservations? (?:are|is) required\b/i.test(body) ? "required" : null),
  };
}

/**
 * A paged listing can mix cached page versions and omit one row at a boundary.
 * Retain a previously published occurrence only when its own first-party detail
 * page still names the same future activity, date and start time.
 */
export function midpenDetailConfirmsEvent(html, event, today) {
  if (event?.source !== "Midpen Open Space" || !event?.date || !event.time || event.date < today) return false;
  const detail = parseMidpenDetail(html);
  return !detail.inactive && detail.title === event.title
    && detail.date === event.date
    && detail.startTime === event.time;
}

/** Recovered occurrences keep current access terms from the confirming page. */
export function recheckMidpenEvent(html, event, today) {
  if (!midpenDetailConfirmsEvent(html, event, today)) return null;
  const detail = parseMidpenDetail(html);
  const registration = midpenVolunteerUrl(event)
    ? midpenVolunteerRegistration(detail, event) : detail.registration;
  return {
    ...event,
    ...(registration || event.registrationClosesBy ? { registration } : {}),
    ...(detail.endTime ? { endTime: detail.endTime } : {}),
    ...(detail.meetingPlace ? { address: midpenTrailhead(detail.meetingPlace) } : {}),
    ...(detail.attendanceNote || event.registrationClosesBy ? { attendanceNote: detail.attendanceNote } : {}),
    ...(detail.registrationClosesBy || event.registrationClosesBy
      ? { registrationClosesBy: detail.registrationClosesBy } : {}),
  };
}

/**
 * Reduce a "Where to Meet" block to the trailhead itself.
 *
 * The district's meeting-place text is one identifying sentence followed by
 * turn-by-turn driving directions ("...Exit Highway 85 at De Anza Boulevard.
 * From northbound 85 turn left..."). The whole block is wrong for an event
 * card and wrong for schema.org `streetAddress`, which wants a street, so keep
 * the first sentence and drop the route. Parenthetical asides are preserved —
 * "(across from Los Trancos Preserve)" is how a reader confirms the right lot.
 */
export function midpenTrailhead(meetingPlace) {
  const text = midpenText(meetingPlace).replace(/^Meet at (?:the )?/i, "");
  if (!text) return null;
  // Midpen lists the Jones Trailhead after the drive across the dam.
  if (/^From southbound Highway 17\b/i.test(text)
      && /\bAlma Bridge (?:Road|Rd)\b/i.test(text)
      && /\bparking area at the Jones Trailhead\b/i.test(text)) {
    return "Jones Trailhead, Alma Bridge Road";
  }
  // Split on the first sentence end that isn't inside parentheses and isn't an
  // abbreviation. A street abbreviation can end the sentence before "Exit Highway".
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "." && depth === 0) {
      const before = text.slice(0, i);
      const next = text[i + 1];
      if (next && next !== " " && next !== "\n") continue;
      if (/\b(?:Rd|Blvd|Ave|St|Dr|Hwy|Mt|Ln|Ct|No|Jr|Sr|approx)$/i.test(before)) {
        if (/^\s+Exit (?:Highway|Hwy\.?)\s+\d/i.test(text.slice(i + 1))) return `${before}.`;
        continue;
      }
      return before.trim() || null;
    }
  }
  return text.trim() || null;
}
