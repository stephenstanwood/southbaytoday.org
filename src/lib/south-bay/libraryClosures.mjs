// Federal-holiday closure dates for South Bay library systems.
//
// SJPL, SCCL, Palo Alto, Mountain View, and Sunnyvale libraries all observe
// the same federal holidays (Memorial Day, Independence Day, Labor Day,
// Veterans Day, Thanksgiving + day after, Christmas Day, New Year's Day,
// MLK Day, Presidents Day). When BiblioCommons exports a recurring program
// like "Storytime" or "Homework Help", it occasionally lists an instance on
// a closure date — the library never actually runs it, but a resident who
// trusts the listing shows up at a locked branch.
//
// We drop the event only when its title/description has no holiday theme.
// "Celebrate Juneteenth! Storytime and Craft" stays; "Family Storytime" on
// the same date goes.

export const LIBRARY_CLOSURE_DATES = {
  "2026-05-25": ["memorial day"],
  "2026-07-04": ["independence day", "july 4", "4th of july", "fourth of july"],
  "2026-09-07": ["labor day"],
  "2026-11-11": ["veterans day", "veteran's day"],
  "2026-11-26": ["thanksgiving"],
  "2026-11-27": ["thanksgiving", "black friday"],
  "2026-12-24": ["christmas"],
  "2026-12-25": ["christmas"],
  "2026-12-31": ["new year"],
  "2027-01-01": ["new year"],
  "2027-01-18": ["mlk", "martin luther king", "king day"],
  "2027-02-15": ["presidents day", "presidents' day"],
};

const LIBRARY_SOURCE_PATTERNS = [
  /^San Jose Public Library$/i,
  /^Santa Clara County Library$/i,
  /^Palo Alto City Library$/i,
  /^Mountain View Public Library$/i,
  /^Sunnyvale Public Library$/i,
];

function isLibraryEvent(event) {
  const source = event.source || "";
  if (LIBRARY_SOURCE_PATTERNS.some((re) => re.test(source))) return true;
  const venue = event.venue || "";
  return /\bLibrary\b/i.test(venue);
}

export function shouldDropLibraryEventOnClosure(event) {
  if (!event || !event.date) return false;
  const themes = LIBRARY_CLOSURE_DATES[event.date];
  if (!themes) return false;
  if (!isLibraryEvent(event)) return false;
  const text = (
    (event.title || "") + " " + (event.description || "")
  ).toLowerCase();
  return !themes.some((kw) => text.includes(kw));
}

export function filterClosedLibraryEvents(events) {
  const dropped = [];
  const kept = events.filter((e) => {
    if (shouldDropLibraryEventOnClosure(e)) {
      dropped.push(e);
      return false;
    }
    return true;
  });
  return { kept, dropped };
}
