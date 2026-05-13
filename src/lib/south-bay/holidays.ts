// ---------------------------------------------------------------------------
// South Bay holidays — civic and cultural dates that residents notice.
// Used by the Events tab to decorate date-strip pills and surface a heads-up
// banner for the next named holiday within ~14 days. School holidays live in
// school-calendar.json; this file is intentionally about what residents do
// (brunch, fireworks, parades), not what the schools do.
// ---------------------------------------------------------------------------

export interface NamedHoliday {
  id: string;
  label: string;
  emoji: string;
  /** Soft accent — used by the heads-up banner background/border. */
  color: string;
  bg: string;
  /** Returns the YYYY-MM-DD this holiday falls on for the given year. */
  computeIso(year: number): string;
  /** Keywords (lowercase substrings) that mark an event as themed for this
   *  holiday. The Events tab uses these to narrow the holiday-date view to
   *  actual themed picks (brunches, parades, fireworks) instead of every
   *  event on that date. Omit when the holiday is observed but doesn't have
   *  a clear textual signal in event copy (e.g. school holidays). */
  themeKeywords?: string[];
  /** Day offsets (relative to `iso`) for the full observance window — a
   *  3-day weekend, Thanksgiving's Thursday-through-Sunday stretch, etc.
   *  Drives the events-tab banner and picks preview to span the whole
   *  weekend rather than just the calendar holiday. Omit for single-day
   *  observances (defaults to `[0]`). */
  weekendSpan?: number[];
  /** Federal holiday — when set, the holiday banners render a "what's
   *  closed" note (libraries, post offices, city offices, banks). When the
   *  holiday lands Mon–Fri, residents also see a 1-day trash-pickup delay
   *  note that holds for SCC residential collection (Recology / GreenWaste
   *  / Garden City / Mission Trail / SJ Recycle Plus). Omit for cultural-
   *  only holidays (Mother's Day, Cinco de Mayo, Halloween, …) — those
   *  don't trigger civic closures. */
  federal?: boolean;
}

/** Returns the YYYY-MM-DD dates covered by a holiday's weekendSpan (or just
 *  the holiday's own date when no span is defined). Order matches the span,
 *  so callers can show "Sat → Mon" naturally. */
export function holidaySpanIsos(
  iso: string,
  weekendSpan?: number[],
): string[] {
  const offsets = weekendSpan && weekendSpan.length > 0 ? weekendSpan : [0];
  return offsets.map((offset) => shiftIso(iso, offset));
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Date helpers (Pacific Time, no UTC drift) ───────────────────────────────

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function fixedDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Nth weekday of a month, e.g. nthWeekday(2026, 5, 0, 2) = 2nd Sunday of May. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(`${fixedDate(year, month, 1)}T12:00:00`);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return fixedDate(year, month, day);
}

/** Last weekday of a month, e.g. lastWeekday(2026, 5, 1) = last Monday of May. */
function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(`${fixedDate(year, month, 28)}T12:00:00`);
  // walk forward to the actual last day of the month
  while (true) {
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    if (next.getMonth() + 1 !== month) break;
    last.setDate(last.getDate() + 1);
  }
  const lastDay = last.getDate();
  const lastWeekdayNum = last.getDay();
  const offset = (lastWeekdayNum - weekday + 7) % 7;
  return fixedDate(year, month, lastDay - offset);
}

// ── The list ────────────────────────────────────────────────────────────────

export const NAMED_HOLIDAYS: NamedHoliday[] = [
  {
    id: "new-years",
    label: "New Year's Day",
    emoji: "🎆",
    color: "#1e3a8a",
    bg: "#eff6ff",
    computeIso: (y) => fixedDate(y, 1, 1),
    federal: true,
  },
  {
    id: "mlk-day",
    label: "MLK Day",
    emoji: "🕊️",
    color: "#1f2937",
    bg: "#f3f4f6",
    computeIso: (y) => nthWeekday(y, 1, 1, 3), // 3rd Monday of January
    weekendSpan: [-2, -1, 0],
    federal: true,
  },
  {
    id: "lunar-new-year",
    label: "Lunar New Year",
    emoji: "🧧",
    // Tết / Chinese New Year — huge in San Jose (Story Rd, Grand Century,
    // Vietnamese Cultural Garden). Lunisolar calendar → year-by-year override.
    color: "#b91c1c",
    bg: "#fef2f2",
    computeIso: (y) => {
      const overrides: Record<number, string> = {
        2025: "2025-01-29",
        2026: "2026-02-17",
        2027: "2027-02-06",
        2028: "2028-01-26",
      };
      return overrides[y] ?? fixedDate(y, 2, 1);
    },
  },
  {
    id: "valentines",
    label: "Valentine's Day",
    emoji: "💝",
    color: "#be185d",
    bg: "#fdf2f8",
    computeIso: (y) => fixedDate(y, 2, 14),
    themeKeywords: ["valentine", "sweetheart", "love song", "romantic"],
  },
  {
    id: "presidents-day",
    label: "Presidents' Day",
    emoji: "🇺🇸",
    color: "#1e40af",
    bg: "#eff6ff",
    computeIso: (y) => nthWeekday(y, 2, 1, 3), // 3rd Monday of February
    weekendSpan: [-2, -1, 0],
    federal: true,
  },
  {
    id: "st-patricks",
    label: "St. Patrick's Day",
    emoji: "☘️",
    color: "#15803d",
    bg: "#f0fdf4",
    computeIso: (y) => fixedDate(y, 3, 17),
    themeKeywords: ["st. patrick", "st patrick", "patrick's", "irish", "shamrock"],
  },
  {
    id: "holi",
    label: "Holi",
    emoji: "🎨",
    // Festival of Colors — large Indian-American community across Cupertino,
    // Sunnyvale, Fremont, San Jose. Hindu lunar calendar → annual override.
    color: "#ec4899",
    bg: "#fdf2f8",
    computeIso: (y) => {
      const overrides: Record<number, string> = {
        2025: "2025-03-14",
        2026: "2026-03-04",
        2027: "2027-03-22",
        2028: "2028-03-11",
      };
      return overrides[y] ?? fixedDate(y, 3, 15);
    },
  },
  {
    id: "eid-al-fitr",
    label: "Eid al-Fitr",
    emoji: "🌙",
    // End of Ramadan — observed by Muslim communities across Santa Clara,
    // Sunnyvale, San Jose. Date depends on moon sighting; use ISNA calculation.
    color: "#15803d",
    bg: "#f0fdf4",
    computeIso: (y) => {
      const overrides: Record<number, string> = {
        2025: "2025-03-30",
        2026: "2026-03-20",
        2027: "2027-03-10",
        2028: "2028-02-27",
      };
      return overrides[y] ?? fixedDate(y, 3, 20);
    },
  },
  {
    id: "earth-day",
    label: "Earth Day",
    emoji: "🌎",
    color: "#15803d",
    bg: "#f0fdf4",
    computeIso: (y) => fixedDate(y, 4, 22),
    themeKeywords: ["earth day", "creek cleanup", "park cleanup", "tree planting", "watershed"],
  },
  {
    id: "cinco-de-mayo",
    label: "Cinco de Mayo",
    emoji: "🎊",
    color: "#b45309",
    bg: "#fffbeb",
    computeIso: (y) => fixedDate(y, 5, 5),
    themeKeywords: ["cinco de mayo", "mariachi", "ballet folklórico", "ballet folklorico"],
  },
  {
    id: "mothers-day",
    label: "Mother's Day",
    emoji: "🌹",
    color: "#be185d",
    bg: "#fdf2f8",
    computeIso: (y) => nthWeekday(y, 5, 0, 2), // 2nd Sunday of May
    themeKeywords: ["mother", "moms", "mom's", "mama", "mommy", "toast to mom"],
  },
  {
    id: "memorial-day",
    label: "Memorial Day",
    emoji: "🇺🇸",
    color: "#1e40af",
    bg: "#eff6ff",
    computeIso: (y) => lastWeekday(y, 5, 1), // last Monday of May
    themeKeywords: ["memorial day", "veterans", "wreath-laying", "wreath laying", "fallen", "armed forces"],
    weekendSpan: [-2, -1, 0],
    federal: true,
  },
  {
    id: "eid-al-adha",
    label: "Eid al-Adha",
    emoji: "🌙",
    // Festival of Sacrifice — observed by Muslim communities across the
    // South Bay. Islamic lunar calendar → year-by-year override.
    color: "#15803d",
    bg: "#f0fdf4",
    computeIso: (y) => {
      const overrides: Record<number, string> = {
        2025: "2025-06-06",
        2026: "2026-05-27",
        2027: "2027-05-17",
        2028: "2028-05-05",
      };
      return overrides[y] ?? fixedDate(y, 6, 1);
    },
  },
  {
    id: "juneteenth",
    label: "Juneteenth",
    emoji: "🕊️",
    color: "#92400e",
    bg: "#fffbeb",
    computeIso: (y) => fixedDate(y, 6, 19),
    themeKeywords: ["juneteenth"],
    federal: true,
  },
  {
    id: "fathers-day",
    label: "Father's Day",
    emoji: "👔",
    color: "#1d4ed8",
    bg: "#eff6ff",
    computeIso: (y) => nthWeekday(y, 6, 0, 3), // 3rd Sunday of June
    themeKeywords: ["father", "dads", "dad's", "papa"],
  },
  {
    id: "independence-day",
    label: "Independence Day",
    emoji: "🎆",
    color: "#b91c1c",
    bg: "#fef2f2",
    computeIso: (y) => fixedDate(y, 7, 4),
    themeKeywords: ["fourth of july", "4th of july", "july 4", "independence day", "fireworks", "patriotic"],
    federal: true,
  },
  {
    id: "labor-day",
    label: "Labor Day",
    emoji: "🛠️",
    color: "#1f2937",
    bg: "#f3f4f6",
    computeIso: (y) => nthWeekday(y, 9, 1, 1), // 1st Monday of September
    weekendSpan: [-2, -1, 0],
    federal: true,
  },
  {
    id: "rosh-hashanah",
    label: "Rosh Hashanah",
    emoji: "🍎",
    // Jewish New Year — Bay Area's Jewish community spans Palo Alto, Los
    // Altos, Saratoga, Cupertino. Hebrew calendar → year-by-year override.
    // Begins at sunset of the prior day; we use the first full day.
    color: "#1e40af",
    bg: "#eff6ff",
    computeIso: (y) => {
      const overrides: Record<number, string> = {
        2025: "2025-09-23",
        2026: "2026-09-12",
        2027: "2027-10-02",
        2028: "2028-09-21",
      };
      return overrides[y] ?? fixedDate(y, 9, 15);
    },
  },
  {
    id: "yom-kippur",
    label: "Yom Kippur",
    emoji: "🕊️",
    // Day of Atonement, 10 days after Rosh Hashanah. Observed at synagogues
    // and JCCs across the South Bay. Hebrew calendar → annual override.
    color: "#1f2937",
    bg: "#f3f4f6",
    computeIso: (y) => {
      const overrides: Record<number, string> = {
        2025: "2025-10-02",
        2026: "2026-09-21",
        2027: "2027-10-11",
        2028: "2028-09-30",
      };
      return overrides[y] ?? fixedDate(y, 9, 25);
    },
  },
  {
    id: "mid-autumn-festival",
    label: "Mid-Autumn Festival",
    emoji: "🥮",
    // Tết Trung Thu / 中秋節 — moon-cake holiday celebrated by Vietnamese and
    // Chinese communities. Big lantern parades on Story Rd and in Cupertino.
    // Lunisolar calendar → annual override.
    color: "#b45309",
    bg: "#fffbeb",
    computeIso: (y) => {
      const overrides: Record<number, string> = {
        2025: "2025-10-06",
        2026: "2026-09-25",
        2027: "2027-09-15",
        2028: "2028-10-03",
      };
      return overrides[y] ?? fixedDate(y, 9, 25);
    },
  },
  {
    id: "indigenous-peoples-day",
    label: "Indigenous Peoples' Day",
    emoji: "🪶",
    color: "#92400e",
    bg: "#fffbeb",
    computeIso: (y) => nthWeekday(y, 10, 1, 2), // 2nd Monday of October
    weekendSpan: [-2, -1, 0],
    // Federal holiday is officially "Columbus Day" but SCC observes and
    // posts closures under the Indigenous Peoples' Day label.
    federal: true,
  },
  {
    id: "halloween",
    label: "Halloween",
    emoji: "🎃",
    color: "#c2410c",
    bg: "#fff7ed",
    computeIso: (y) => fixedDate(y, 10, 31),
    themeKeywords: ["halloween", "trick-or-treat", "trick or treat", "haunted", "costume", "pumpkin patch", "spooky"],
  },
  {
    id: "dia-de-los-muertos",
    label: "Día de los Muertos",
    emoji: "💀",
    // Day of the Dead — celebrated across San Jose's Mexican-American
    // community (School of Arts and Culture at MHP, downtown SJ procession).
    // Officially Nov 1–2; we anchor to the main observance day, Nov 2.
    color: "#c2410c",
    bg: "#fff7ed",
    computeIso: (y) => fixedDate(y, 11, 2),
    themeKeywords: ["día de los muertos", "dia de los muertos", "day of the dead", "ofrenda", "calavera", "muertos"],
  },
  {
    id: "diwali",
    label: "Diwali",
    emoji: "🪔",
    // 2026 falls on Nov 8. Refresh annually — Diwali is set by the Hindu lunar
    // calendar so a year-by-year override is the simplest correct approach.
    color: "#b45309",
    bg: "#fffbeb",
    computeIso: (y) => {
      const overrides: Record<number, string> = {
        2025: "2025-10-21",
        2026: "2026-11-08",
        2027: "2027-10-29",
        2028: "2028-11-17",
      };
      return overrides[y] ?? fixedDate(y, 11, 1);
    },
    themeKeywords: ["diwali", "deepavali", "rangoli"],
  },
  {
    id: "veterans-day",
    label: "Veterans Day",
    emoji: "🎖️",
    color: "#1e40af",
    bg: "#eff6ff",
    computeIso: (y) => fixedDate(y, 11, 11),
    themeKeywords: ["veterans day", "veterans'", "armed forces", "wreath-laying", "wreath laying"],
    federal: true,
  },
  {
    id: "thanksgiving",
    label: "Thanksgiving",
    emoji: "🦃",
    color: "#a16207",
    bg: "#fefce8",
    computeIso: (y) => nthWeekday(y, 11, 4, 4), // 4th Thursday of November
    themeKeywords: ["thanksgiving", "turkey trot", "friendsgiving", "harvest"],
    federal: true,
  },
  {
    id: "christmas-eve",
    label: "Christmas Eve",
    emoji: "🎄",
    color: "#15803d",
    bg: "#f0fdf4",
    computeIso: (y) => fixedDate(y, 12, 24),
    themeKeywords: ["christmas eve", "candlelight", "midnight mass", "carol"],
  },
  {
    id: "christmas",
    label: "Christmas Day",
    emoji: "🎄",
    color: "#b91c1c",
    bg: "#fef2f2",
    computeIso: (y) => fixedDate(y, 12, 25),
    themeKeywords: ["christmas", "santa", "tree lighting", "nutcracker"],
    federal: true,
  },
  {
    id: "new-years-eve",
    label: "New Year's Eve",
    emoji: "🥂",
    color: "#1f2937",
    bg: "#f3f4f6",
    computeIso: (y) => fixedDate(y, 12, 31),
    themeKeywords: ["new year", "nye", "midnight countdown", "countdown to midnight"],
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────────────

/** Returns the holiday landing on `iso` (YYYY-MM-DD), or null. */
export function holidayOn(iso: string): NamedHoliday | null {
  const year = Number(iso.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  for (const h of NAMED_HOLIDAYS) {
    if (h.computeIso(year) === iso) return h;
  }
  return null;
}

/** Returns true when `haystack` (event title/blurb/description, lowercased
 *  beforehand by the caller) matches any of the holiday's themeKeywords. */
export function matchesHolidayTheme(holiday: NamedHoliday, lowerHaystack: string): boolean {
  if (!holiday.themeKeywords?.length) return false;
  for (const k of holiday.themeKeywords) {
    if (lowerHaystack.includes(k.toLowerCase())) return true;
  }
  return false;
}

/** Returns the soonest holiday whose date falls in [todayIso, horizonIso]. */
export function nextHolidayWithin(todayIso: string, horizonIso: string): {
  holiday: NamedHoliday;
  iso: string;
} | null {
  const todayYear = Number(todayIso.slice(0, 4));
  const horizonYear = Number(horizonIso.slice(0, 4));
  let best: { holiday: NamedHoliday; iso: string } | null = null;
  for (let y = todayYear; y <= horizonYear; y++) {
    for (const h of NAMED_HOLIDAYS) {
      const iso = h.computeIso(y);
      if (iso < todayIso || iso > horizonIso) continue;
      if (!best || iso < best.iso) best = { holiday: h, iso };
    }
  }
  return best;
}

// ── Federal-holiday closure summary ────────────────────────────────────────
// Surfaces "what's closed" guidance residents look up every federal holiday.
// Returns null for non-federal (cultural-only) holidays — banners stay clean.
// The trash-pickup delay note holds for SCC residential collection when the
// holiday lands Mon–Fri: Recology, GreenWaste, Garden City Sanitation,
// Mission Trail Waste Systems, and SJ Recycle Plus all roll service +1 day
// from the holiday through the rest of the week.

export interface HolidayClosureSummary {
  closed: string;          // "libraries, post offices, city offices, banks"
  trashDelayed: boolean;   // true → "Trash pickup runs 1 day late this week"
}

export function holidayClosureSummary(
  holiday: NamedHoliday,
  iso: string,
): HolidayClosureSummary | null {
  if (!holiday.federal) return null;
  const dow = new Date(`${iso}T12:00:00`).getDay(); // 0=Sun..6=Sat
  const fallsOnWeekday = dow >= 1 && dow <= 5;
  return {
    closed: "libraries, post offices, city offices, banks",
    trashDelayed: fallsOnWeekday,
  };
}
