// A full month-day-year date needs a closing comma when prose continues.
// Apply only to summaries/topics, keeping headings and structured dates exact.
const FULL_DATE_IN_PROSE = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4})(?= [A-Za-z])/g;

// Hyphenate area modifiers only before building nouns. Measurements such as
// "1,360 square feet" and "1 square foot per resident" must stay unchanged.
const SQUARE_FOOT_MODIFIER = /\b(\d[\d,]*(?:\.\d+)?) square foot (?=(?:apartment|building|duplex|facility|home|house|office|warehouse)\b)/g;

export function polishCivicCopy(text) {
  return typeof text === "string"
    ? text.replace(FULL_DATE_IN_PROSE, "$1,").replace(SQUARE_FOOT_MODIFIER, "$1-square-foot ")
    : text;
}
