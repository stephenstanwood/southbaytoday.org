const PROSPECTIVE_SOURCE =
  /\b(?:scheduled|set|expected|slated)\s+to\s+(?:hear|consider|review|weigh|vote|decide|approve|adopt|reject|deny)\b|\b(?:council|commission|committee|board|panel)\s+to\s+(?:hear|consider|review|weigh|vote|decide|approve|adopt|reject|deny)\b|\bagenda\s+(?:listed|lists|included|includes)\b|\bseeks?\s+(?:an?\s+)?(?:use\s+)?permit\b/i;
const CONFIRMED_ACTION =
  /\b(?:heard|considered|reviewed|weighed|voted|decided|approved|adopted|rejected|denied)\b/i;
const COMPLETED_MEETING =
  /\b(?:council|city|commission|committee|board|panel|hearing)\b[^.!?]{0,50}\b(?:held|met|discussed)\b/i;

export function meetingWithinBriefingWindow(meeting, start, end) {
  return Boolean(meeting?.date && meeting.date >= start && meeting.date <= end);
}

export function hasProspectiveCityHallUpgrade(text, aroundItems = []) {
  if (!CONFIRMED_ACTION.test(String(text || "")) && !COMPLETED_MEETING.test(String(text || ""))) return false;

  const sourcedItems = aroundItems
    .map((item) => `${item?.headline || ""} ${item?.summary || ""}`.trim())
    .filter(Boolean);
  if (!sourcedItems.length || sourcedItems.some((item) => !PROSPECTIVE_SOURCE.test(item))) {
    return false;
  }

  return true;
}

const MILESTONE_VERB = /^\s+(?:(?:officially|finally)\s+)?(?:opens?|opening|closes?|closing|ends?|ending|debuts?|premieres?|wraps?\s+up)\b/i;
const NAMED_MILESTONE = /\b(?:opening|closing|final|premiere|debut)\b/i;

function normalizeEventWords(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The five selected event rows cannot establish a city's or venue's total. */
export function hasEventSelectionCount(text, events = []) {
  let copy = normalizeEventWords(text);
  // A number in an organizer's actual title is a name, not an inferred total.
  for (const event of events) {
    const title = normalizeEventWords(event?.title);
    if (title) copy = copy.replaceAll(title, "");
  }
  // Dates and start times describe an occurrence; they are not event totals.
  copy = copy
    .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:\s+\d{4})?\b/g, "")
    .replace(/\b\d{1,2}(?:\s+\d{2})?\s+(?:am|pm)\b/g, "");
  return /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:[a-z0-9]+\s+){0,5}(?:events?|programs?|performances?|concerts?|shows?|workshops?)\b/i.test(copy);
}

/** An occurrence date is not evidence of a production's opening or closing. */
export function hasUnsupportedEventMilestone(text, events = []) {
  const words = normalizeEventWords(text);
  return events.some((event) => {
    const title = normalizeEventWords(event?.title);
    if (!title || NAMED_MILESTONE.test(event.title)) return false;
    const index = words.indexOf(title);
    return index >= 0 && MILESTONE_VERB.test(words.slice(index + title.length));
  });
}
