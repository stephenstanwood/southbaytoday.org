// ---------------------------------------------------------------------------
// South Bay heritage / observance months — federal observances that matter
// to large local communities. Used by the Events tab to render a one-line
// "Observing" acknowledgment alongside the school + holiday banners.
//
// Scope filter: include observances tied to communities with a meaningful
// South Bay presence (AANHPI, Hispanic, Jewish, LGBTQ+, Filipino American,
// Black, Native American, Women's, Disability). Holidays land in
// `holidays.ts`; this file is for month-long observances only.
// ---------------------------------------------------------------------------

export interface HeritageMonth {
  id: string;
  label: string;
  emoji: string;
  /** Soft accent — used for hover tints in the future. */
  color: string;
  bg: string;
  /** Returns the [startIso, endIso] window for the given calendar year. */
  windowFor(year: number): { startIso: string; endIso: string };
  /** One-line context shown via title attribute on hover. */
  blurb: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function fixedRange(
  year: number,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
) {
  return {
    startIso: `${year}-${pad(startMonth)}-${pad(startDay)}`,
    endIso: `${year}-${pad(endMonth)}-${pad(endDay)}`,
  };
}

function fullMonth(year: number, month: number) {
  // Trick: day 0 of month+1 = last day of `month`.
  const last = new Date(year, month, 0).getDate();
  return fixedRange(year, month, 1, month, last);
}

export const HERITAGE_MONTHS: HeritageMonth[] = [
  {
    id: "black-history",
    label: "Black History Month",
    emoji: "✊🏿",
    color: "#7c2d12",
    bg: "#fff7ed",
    windowFor: (y) => fullMonth(y, 2),
    blurb: "February honors Black history and contributions across American life.",
  },
  {
    id: "womens-history",
    label: "Women's History Month",
    emoji: "💜",
    color: "#7e22ce",
    bg: "#faf5ff",
    windowFor: (y) => fullMonth(y, 3),
    blurb: "March celebrates the contributions of women throughout history.",
  },
  {
    id: "aanhpi-heritage",
    label: "AANHPI Heritage Month",
    emoji: "🌺",
    color: "#9a3412",
    bg: "#fff7ed",
    windowFor: (y) => fullMonth(y, 5),
    blurb: "Asian American, Native Hawaiian & Pacific Islander Heritage Month.",
  },
  {
    id: "jewish-american-heritage",
    label: "Jewish American Heritage Month",
    emoji: "🕎",
    color: "#1d4ed8",
    bg: "#eff6ff",
    windowFor: (y) => fullMonth(y, 5),
    blurb: "May recognizes the contributions of Jewish Americans to US history and culture.",
  },
  {
    id: "pride",
    label: "Pride Month",
    emoji: "🏳️‍🌈",
    color: "#9d174d",
    bg: "#fdf2f8",
    windowFor: (y) => fullMonth(y, 6),
    blurb: "LGBTQ+ Pride Month — community, history, and identity celebrated through June.",
  },
  {
    id: "hispanic-heritage",
    label: "Hispanic Heritage Month",
    emoji: "🪅",
    color: "#b45309",
    bg: "#fffbeb",
    windowFor: (y) => fixedRange(y, 9, 15, 10, 15),
    blurb: "Hispanic and Latine cultures honored from Sept 15 through Oct 15.",
  },
  {
    id: "filipino-american-history",
    label: "Filipino American History Month",
    emoji: "🇵🇭",
    color: "#1e40af",
    bg: "#eff6ff",
    windowFor: (y) => fullMonth(y, 10),
    blurb: "October recognizes Filipino American history and contributions.",
  },
  {
    id: "lgbtq-history",
    label: "LGBTQ History Month",
    emoji: "📚",
    color: "#9d174d",
    bg: "#fdf2f8",
    windowFor: (y) => fullMonth(y, 10),
    blurb: "October highlights LGBTQ historical figures and milestones.",
  },
  {
    id: "disability-employment-awareness",
    label: "Disability Employment Awareness Month",
    emoji: "♿",
    color: "#1e40af",
    bg: "#eff6ff",
    windowFor: (y) => fullMonth(y, 10),
    blurb: "October recognizes the contributions of workers with disabilities.",
  },
  {
    id: "native-american-heritage",
    label: "Native American Heritage Month",
    emoji: "🪶",
    color: "#92400e",
    bg: "#fffbeb",
    windowFor: (y) => fullMonth(y, 11),
    blurb: "November honors Native American history, culture, and contributions.",
  },
];

/** Returns every heritage month whose window contains `iso` (YYYY-MM-DD). */
export function currentHeritageMonths(iso: string): HeritageMonth[] {
  const year = Number(iso.slice(0, 4));
  if (!Number.isFinite(year)) return [];
  return HERITAGE_MONTHS.filter((m) => {
    const w = m.windowFor(year);
    return iso >= w.startIso && iso <= w.endIso;
  });
}
