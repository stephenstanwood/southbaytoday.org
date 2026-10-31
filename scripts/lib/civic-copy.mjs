// A full month-day-year date needs a closing comma when prose continues.
// Apply only to summaries/topics, keeping headings and structured dates exact.
const FULL_DATE_IN_PROSE = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4})(?= [A-Za-z])/g;

export function polishCivicCopy(text) {
  return typeof text === "string" ? text.replace(FULL_DATE_IN_PROSE, "$1,") : text;
}
