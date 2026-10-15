import { isoDateParts } from "./dates.mjs";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAY_PATTERN = WEEKDAYS.join("|");
const WEEKLY = new RegExp(`^every (${DAY_PATTERN})(?: (?:through|to|[-–—]) (${DAY_PATTERN}))?$`, "i");
const DATED = new RegExp(`^(?:(${DAY_PATTERN}),? )?(${MONTHS.join("|")}) (\\d{1,2})(?:,? (\\d{4}))?$`, "i");

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
  if (!dated) return null;
  const month = MONTHS.indexOf(dated[2]) + 1;
  const year = Number(dated[4] || calendarDay.year);
  const date = `${year}-${String(month).padStart(2, "0")}-${String(Number(dated[3])).padStart(2, "0")}`;
  try {
    const { weekday } = isoDateParts(date);
    if (dated[1] && WEEKDAYS[weekday] !== dated[1]) return null;
  } catch {
    return null;
  }
  return date >= today ? date : null;
}
