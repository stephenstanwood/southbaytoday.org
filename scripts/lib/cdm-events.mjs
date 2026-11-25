import { addIsoDays, isoDateParts } from "./dates.mjs";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAY_PATTERN = WEEKDAYS.join("|");
const WEEKLY = new RegExp(`^every (${DAY_PATTERN})(?: (?:through|to|[-–—]) (${DAY_PATTERN}))?$`, "i");
const DATED = new RegExp(`^(?:(${DAY_PATTERN}),? )?(${MONTHS.join("|")}) (\\d{1,2})(?:,? (\\d{4}))?$`, "i");

function cdmDate(dated, fallbackYear) {
  const month = MONTHS.indexOf(dated[2].toLowerCase()) + 1;
  const year = Number(dated[4] || fallbackYear);
  const date = `${year}-${String(month).padStart(2, "0")}-${String(Number(dated[3])).padStart(2, "0")}`;
  try {
    const { weekday } = isoDateParts(date);
    return !dated[1] || WEEKDAYS[weekday] === dated[1].toLowerCase() ? date : null;
  } catch {
    return null;
  }
}

/**
 * CDM's calendar mixes dated events with weekly program labels. A weekly label
 * proves an occurrence today only on its stated weekdays; it is never a daily
 * event or permission to project future dates. Unknown cadences stay empty.
 * Undated month/day labels belong to the current calendar year, not the 2001
 * default that JavaScript's Date parser assigns to "Saturday, October 17".
 */
export function parseCdmOccurrenceDate(rawDate, today) {
  let calendarDay;
  try {
    calendarDay = isoDateParts(today);
  } catch {
    return null;
  }
  const text = String(rawDate || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (text === "weekdays") return calendarDay.weekday >= 1 && calendarDay.weekday <= 5 ? today : null;
  if (text === "weekends") return [0, 6].includes(calendarDay.weekday) ? today : null;

  const weekly = WEEKLY.exec(text);
  if (weekly) {
    const start = WEEKDAYS.indexOf(weekly[1]);
    const end = WEEKDAYS.indexOf(weekly[2] || weekly[1]);
    return (calendarDay.weekday - start + 7) % 7 <= (end - start + 7) % 7 ? today : null;
  }

  const dated = DATED.exec(text);
  const date = dated && cdmDate(dated, calendarDay.year);
  return date && date >= today ? date : null;
}

export function parseCdmExhibitRange(rawDate, today) {
  const labels = String(rawDate || "").trim().replace(/\s+/g, " ").split(/ [-–—] /);
  if (labels.length !== 2) return null;
  const [start, end] = labels.map((label) => DATED.exec(label));
  if (!start || !end) return null;

  let calendarDay;
  try {
    calendarDay = isoDateParts(today);
  } catch {
    return null;
  }
  const endMonth = MONTHS.indexOf(end[2].toLowerCase()) + 1;
  const crossesNewYear = MONTHS.indexOf(start[2].toLowerCase()) + 1 > endMonth;
  // In January the November–January exhibit still belongs to the preceding
  // November. If either endpoint says its year, use it instead of inferring.
  const inferredStartYear = calendarDay.year - Number(crossesNewYear && calendarDay.month <= endMonth);
  const startYear = Number(start[4]) || (end[4] ? Number(end[4]) - Number(crossesNewYear) : inferredStartYear);
  const startDate = cdmDate(start, startYear);
  const endDate = cdmDate(end, startYear + Number(crossesNewYear));
  if (!startDate || !endDate || endDate < startDate || endDate < today
      || startDate > addIsoDays(today, 180)) return null;
  return { startDate, endDate };
}

export function parseCdmCelebrationDate(rawDate, today) {
  const label = String(rawDate || "").replace(/\s+/g, " ").trim();
  const dated = DATED.exec(label);
  if (!dated) return null;

  const date = parseCdmOccurrenceDate(label, today);
  if (date || dated[4] || !dated[1]) return date;

  // Upcoming celebration cards omit the year even across New Year's Day.
  // Require the printed weekday to agree and stay within the feed's horizon.
  const nextYear = Number(String(today).slice(0, 4)) + 1;
  const nextDate = parseCdmOccurrenceDate(`${label}, ${nextYear}`, today);
  return nextDate && nextDate <= addIsoDays(today, 180) ? nextDate : null;
}
