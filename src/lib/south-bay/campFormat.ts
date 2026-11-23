// ---------------------------------------------------------------------------
// South Bay Today — Camp Finder display helpers
// ---------------------------------------------------------------------------
// Pure formatting shared by the /camps directory island and the static camp
// pages. No data imports here: the island ships this module, so it must stay
// small (the data itself arrives as camp-finder-index.json in the island and
// camp-finder.json at build time; see scripts/lib/camp-finder.mjs).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const TOPIC_LABELS: Record<string, string> = {
  stem: "STEM",
  sports: "Sports",
  arts: "Arts",
  general: "All-around",
  animals: "Animals",
  academic: "Academic",
  adventure: "Adventure",
  nature: "Nature",
  culinary: "Cooking",
  music: "Music",
  swim: "Swim",
  language: "Language",
  faith: "Faith-based",
  "special-needs": "Special needs",
};

/** A city, interest or camp gets its own page once it has this many programs;
 *  below that the directory filter is the better destination. */
export const CITY_PAGE_MIN = 3;
export const TOPIC_PAGE_MIN = 3;
export const OPERATOR_PAGE_MIN = 2;

export type PricePer = "week" | "session";

/** 61900 → "$619", 35550 → "$355.50", 117500 → "$1,175" */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** [min, max, per] → "$619/week", "$588–$626/week" */
export function formatPriceRange(price: [number, number, PricePer] | undefined | null): string | null {
  if (!price) return null;
  const [min, max, per] = price;
  const amount = min === max ? formatCents(min) : `${formatCents(min)}–${formatCents(max)}`;
  return `${amount}/${per}`;
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

// Non-breaking space between month and day, so "Jun 7–Aug 13" never wraps
// between "Jun" and "7".
const NBSP = "\u00a0";

/** "2027-07-12" → "Jul 12" */
export function monthDay(iso: string): string {
  const [, m, d] = parts(iso);
  return `${MONTHS[m - 1]}${NBSP}${d}`;
}

/** "2027-07-12" → "Jul 12, 2027" */
export function fullDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** One session: "Jul 12–16", "Jun 28–Jul 2", or a single day "Jul 12". */
export function formatRange(start: string, end: string): string {
  if (start === end) return monthDay(start);
  const [, sm, sd] = parts(start);
  const [, em, ed] = parts(end);
  return sm === em
    ? `${MONTHS[sm - 1]}${NBSP}${sd}–${ed}`
    : `${MONTHS[sm - 1]}${NBSP}${sd}–${MONTHS[em - 1]}${NBSP}${ed}`;
}

/** Sessions as one short phrase for a card or list row. */
export function formatSessions(sessions: Array<[string, string]> | undefined, season: number): string {
  if (!sessions || sessions.length === 0) return `${season} dates not posted yet`;
  if (sessions.length === 1) return formatRange(sessions[0][0], sessions[0][1]);
  const first = sessions[0][0];
  const last = sessions.reduce((max, s) => (s[1] > max ? s[1] : max), sessions[0][1]);
  return `${sessions.length} sessions, ${formatRange(first, last)}`;
}

/** [7, 9] → "Ages 7–9"; grade ranges read "Grades K–5". */
export function formatAges(ages: [number, number] | undefined | null, grades = false): string {
  if (!ages) return "Ages not stated";
  const [min, max] = ages;
  if (grades) {
    const g = (n: number) => (n <= 0 ? "K" : String(n));
    return min === max ? `Grade ${g(min)}` : `Grades ${g(min)}–${g(max)}`;
  }
  return min === max ? `Age ${min}` : `Ages ${min}–${max}`;
}

/** Registration line for a reader on `todayIso`, or null when nothing useful
 *  is posted (or the dates have passed). */
export function formatRegistration(
  opens: string | undefined,
  deadline: string | undefined,
  todayIso: string,
): string | null {
  if (opens && opens > todayIso) return `Registration opens ${fullDate(opens)}`;
  if (deadline && deadline >= todayIso) return `Register by ${fullDate(deadline)}`;
  if (opens) return `Registration opened ${fullDate(opens)}`;
  return null;
}

/** Does any session overlap the Monday–Friday week starting `weekStart`? */
export function runsDuringWeek(sessions: Array<[string, string]> | undefined, weekStart: string, weekEnd: string): boolean {
  return !!sessions?.some(([start, end]) => start <= weekEnd && end >= weekStart);
}
