const PROSPECTIVE_SOURCE =
  /\b(?:scheduled|set|expected|slated)\s+to\s+(?:hear|consider|review|weigh|vote|decide|approve|adopt|reject|deny)\b|\b(?:council|commission|committee|board)\s+to\s+(?:hear|consider|review|weigh|vote|decide|approve|adopt|reject|deny)\b|\bagenda\s+(?:listed|lists|included|includes)\b/i;
const CONFIRMED_ACTION =
  /\b(?:heard|considered|reviewed|weighed|voted|decided|approved|adopted|rejected|denied)\b/i;

export function meetingWithinBriefingWindow(meeting, start, end) {
  return Boolean(meeting?.date && meeting.date >= start && meeting.date <= end);
}

export function hasProspectiveCityHallUpgrade(text, aroundItems = []) {
  if (!CONFIRMED_ACTION.test(String(text || ""))) return false;

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
