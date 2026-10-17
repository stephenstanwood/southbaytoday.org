import { REGISTRATION_CLOSED, REGISTRATION_FULL } from "../../src/lib/south-bay/eventFilters.mjs";

/** Highlights have no availability badge; don't invite readers to full events. */
export function isBriefingEventAvailable(event) {
  return event?.registration !== REGISTRATION_FULL && event?.registration !== REGISTRATION_CLOSED;
}

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
  return /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:[a-z0-9]+\s+){0,5}(?:events?|programs?|performances?|concerts?|shows?|workshops?)\b/i.test(copy)
    || /\b(?:twice|(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\s+times)\b/i.test(copy);
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

const TITLE_CONNECTORS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "the", "to", "with"]);

function mentionsEventTitle(copy, title) {
  const words = normalizeEventWords(title).split(" ").filter(Boolean);
  const width = Math.min(4, words.length);
  if (!width) return false;
  // Briefings often shorten a long title. Require a contiguous title phrase,
  // not a bag of common words that could match an unrelated program.
  for (let i = 0; i <= words.length - width; i += 1) {
    const phrase = words.slice(i, i + width);
    if (phrase.filter((word) => !TITLE_CONNECTORS.has(word)).length < Math.min(2, width)) continue;
    if (` ${copy} `.includes(` ${phrase.join(" ")} `)) return true;
  }
  return false;
}

/** Catch explicit "A and B both at X" claims; an unknown venue is not evidence. */
export function hasUnsupportedSharedEventVenue(text, events = []) {
  const venues = [...new Set(events.map((event) => normalizeEventWords(event?.venue)).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  for (const sentence of String(text || "").split(/[.!?;]+/)) {
    const copy = normalizeEventWords(sentence);
    for (const claim of copy.matchAll(/\b(?:both|all)\s+(?:\w+\s+){0,4}(?:at|in)\s+/g)) {
      const after = copy.slice(claim.index + claim[0].length);
      const venue = venues.find((value) => after === value || after.startsWith(`${value} `));
      if (!venue) continue;
      const named = new Map();
      for (const event of events) {
        if (!mentionsEventTitle(copy.slice(0, claim.index), event?.title)) continue;
        const title = normalizeEventWords(event.title);
        if (!named.has(title)) named.set(title, []);
        named.get(title).push(event);
      }
      if (named.size < 2) continue;
      if ([...named.values()].some((occurrences) =>
        !occurrences.some((event) => normalizeEventWords(event.venue) === venue)
      )) return true;
    }
  }
  return false;
}
