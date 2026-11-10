// A full month-day-year date needs a closing comma when prose continues.
// Apply only to summaries/topics, keeping headings and structured dates exact.
const FULL_DATE_IN_PROSE = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4})(?= [A-Za-z])/g;

// Hyphenate area modifiers only before building nouns. Measurements such as
// "1,360 square feet" and "1 square foot per resident" must stay unchanged.
const SQUARE_FOOT_MODIFIER = /\b(\d[\d,]*(?:\.\d+)?) square foot (?=(?:apartment|building|duplex|facility|home|house|office|warehouse)\b)/g;

// These are compound modifiers only in the named civic phrases. Reuse them
// for headlines without applying prose-only date commas to a heading.
export function polishCivicModifiers(text) {
  return typeof text === "string"
    ? text.replace(/\bbelow market rate (?=in-lieu fees?\b)/g, "below-market-rate ")
      .replace(/\bsquare footage-based fee\b/g, "square-footage-based fee")
      .replace(/\bCity Council sponsored special event\b/g, "City Council-sponsored special event")
    : text;
}

export function polishCivicCopy(text) {
  return typeof text === "string"
    ? polishCivicModifiers(text).replace(FULL_DATE_IN_PROSE, "$1,").replace(SQUARE_FOOT_MODIFIER, "$1-square-foot ")
      .replace(/\bA Oct\. (?=\d{1,2}\b)/g, "An Oct. ")
      .replace("take part: in-person, online, and written public comment", "take part: in person, online, and through written public comment")
    : text;
}

export function polishCivicTopic(text) {
  const copy = polishCivicCopy(text);
  // Finish declarative topic sentences, leaving agenda-title fragments alone.
  // Never append punctuation to a URL or email address.
  if (typeof copy !== "string"
    || !/^(?:The (?:agenda|consent calendar) (?:also )?(?:listed|included)\b|A revised [^.!?]+ was listed\b)/i.test(copy)
    || /[.!?]["')\]]*$/.test(copy)
    || /[;:,—–-]\s*$/.test(copy)
    || /https?:\/\/\S+$|\b[\w.+-]+@[\w.-]+$/.test(copy)) return copy;
  return `${copy}.`;
}
