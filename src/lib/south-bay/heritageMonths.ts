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
  /** Word-boundaried regexes; a match against an event's title/blurb/desc/venue
   *  flags the event as relevant to this heritage. Used by the Events tab
   *  filter chip. Be conservative: only specific cultural/religious terms,
   *  not ambiguous tokens like "indian" (Native vs. South Asian) or "black"
   *  (color, not always the community). */
  keywords: RegExp[];
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
    keywords: [
      /\bblack history\b/i,
      /\bafrican[- ]american\b/i,
      /\bjuneteenth\b/i,
      /\bafro[- ]?(american|centric|caribbean|latin)\b/i,
      /\bharlem\b/i,
      /\bkwanzaa\b/i,
    ],
  },
  {
    id: "womens-history",
    label: "Women's History Month",
    emoji: "💜",
    color: "#7e22ce",
    bg: "#faf5ff",
    windowFor: (y) => fullMonth(y, 3),
    blurb: "March celebrates the contributions of women throughout history.",
    keywords: [
      /\bwomen'?s history\b/i,
      /\bwomen in (stem|tech|business|science|leadership)\b/i,
      /\b(suffrage|suffragist)\b/i,
      /\bgirl(s|s')? (who code|empowerment)\b/i,
      /\binternational women'?s day\b/i,
    ],
  },
  {
    id: "aanhpi-heritage",
    label: "AANHPI Heritage Month",
    emoji: "🌺",
    color: "#9a3412",
    bg: "#fff7ed",
    windowFor: (y) => fullMonth(y, 5),
    blurb: "Asian American, Native Hawaiian & Pacific Islander Heritage Month.",
    keywords: [
      /\baapi\b/i,
      /\baanhpi\b/i,
      /\basian[- ]american\b/i,
      /\bpacific islander\b/i,
      /\b(hawaiian|polynesian|samoan|tongan|fijian?|chamorro)\b/i,
      /\b(chinese|japanese|korean|vietnamese|filipino|thai|hmong|cambodian|laotian|burmese|indonesian|malaysian|taiwanese|tibetan|mongolian|nepali|nepalese|bangladeshi|pakistani|sri lankan|sikh|punjabi|tamil)\b/i,
      /\b(lunar new year|diwali|holi|bon[- ]odori|obon|sakura|mooncake|dim sum|origami|kabuki|taiko|qipao|hanbok|jasmine|lotus)\b/i,
      /\bsouth asian\b/i,
      /\beast asian\b/i,
      /\bsoutheast asian\b/i,
    ],
  },
  {
    id: "jewish-american-heritage",
    label: "Jewish American Heritage Month",
    emoji: "🕎",
    color: "#1d4ed8",
    bg: "#eff6ff",
    windowFor: (y) => fullMonth(y, 5),
    blurb: "May recognizes the contributions of Jewish Americans to US history and culture.",
    keywords: [
      /\bjewish\b/i,
      /\b(hanukkah|chanukah)\b/i,
      /\b(passover|pesach)\b/i,
      /\b(rosh hashanah|yom kippur|sukkot|purim|shavuot)\b/i,
      /\b(israeli|hebrew|yiddish|klezmer|sephardic|ashkenazi|mizrahi)\b/i,
      /\b(shabbat|mitzvah|bar mitzvah|bat mitzvah)\b/i,
      /\b(synagogue|temple beth|jcc|jewish community center)\b/i,
    ],
  },
  {
    id: "pride",
    label: "Pride Month",
    emoji: "🏳️‍🌈",
    color: "#9d174d",
    bg: "#fdf2f8",
    windowFor: (y) => fullMonth(y, 6),
    blurb: "LGBTQ+ Pride Month — community, history, and identity celebrated through June.",
    keywords: [
      /\b(pride|lgbtq\+?|lgbtqia\+?)\b/i,
      /\b(queer|gay|lesbian|bisexual|transgender|nonbinary|non[- ]binary)\b/i,
      /\bdrag (show|brunch|queen|king|story)\b/i,
      /\brainbow (flag|family|families)\b/i,
      /\btwo[- ]spirit\b/i,
    ],
  },
  {
    id: "hispanic-heritage",
    label: "Hispanic Heritage Month",
    emoji: "🪅",
    color: "#b45309",
    bg: "#fffbeb",
    windowFor: (y) => fixedRange(y, 9, 15, 10, 15),
    blurb: "Hispanic and Latine cultures honored from Sept 15 through Oct 15.",
    keywords: [
      /\b(hispanic|latino|latina|latine|latinx|chicano|chicana)\b/i,
      /\b(mexican|salvadoran|guatemalan|honduran|nicaraguan|peruvian|colombian|venezuelan|argentin(e|ian)|chilean|cuban|puerto rican|dominican|ecuadorian|bolivian|costa rican|panamanian|uruguayan|paraguayan)\b/i,
      /\b(día de los muertos|dia de los muertos|day of the dead|cinco de mayo|fiestas patrias|quinceañera|quinceanera)\b/i,
      /\b(mariachi|salsa|bachata|merengue|cumbia|reggaeton|flamenco|folklórico|folklorico)\b/i,
      /\b(spanish[- ]language|en español|en espanol)\b/i,
    ],
  },
  {
    id: "filipino-american-history",
    label: "Filipino American History Month",
    emoji: "🇵🇭",
    color: "#1e40af",
    bg: "#eff6ff",
    windowFor: (y) => fullMonth(y, 10),
    blurb: "October recognizes Filipino American history and contributions.",
    keywords: [
      /\b(filipino|filipina|filipinx)\b/i,
      /\b(pilipino|pinoy|pinay)\b/i,
      /\b(philippine|tagalog|kapampangan|ilocano|cebuano|visayan)\b/i,
      /\b(kulintang|tinikling|adobo|lechon|lumpia|pancit)\b/i,
    ],
  },
  {
    id: "lgbtq-history",
    label: "LGBTQ History Month",
    emoji: "📚",
    color: "#9d174d",
    bg: "#fdf2f8",
    windowFor: (y) => fullMonth(y, 10),
    blurb: "October highlights LGBTQ historical figures and milestones.",
    keywords: [
      /\b(pride|lgbtq\+?|lgbtqia\+?)\b/i,
      /\b(queer|gay|lesbian|bisexual|transgender|nonbinary|non[- ]binary)\b/i,
      /\bdrag (show|brunch|queen|king|story)\b/i,
      /\bstonewall\b/i,
    ],
  },
  {
    id: "disability-employment-awareness",
    label: "Disability Employment Awareness Month",
    emoji: "♿",
    color: "#1e40af",
    bg: "#eff6ff",
    windowFor: (y) => fullMonth(y, 10),
    blurb: "October recognizes the contributions of workers with disabilities.",
    keywords: [
      /\b(disability|disabled|accessibility|accessible)\b/i,
      /\b(adaptive|inclusive) (sport|sports|recreation|fitness|yoga|art|dance)\b/i,
      /\b(asl|american sign language)\b/i,
      /\b(neurodiver(se|gent|gence)|autism|autistic|deaf|blind|low vision)\b/i,
      /\bsensory[- ]friendly\b/i,
    ],
  },
  {
    id: "native-american-heritage",
    label: "Native American Heritage Month",
    emoji: "🪶",
    color: "#92400e",
    bg: "#fffbeb",
    windowFor: (y) => fullMonth(y, 11),
    blurb: "November honors Native American history, culture, and contributions.",
    keywords: [
      /\b(native american|indigenous|first nations|tribal|tribe)\b/i,
      /\b(pow[- ]?wow|powwow)\b/i,
      /\b(ohlone|muwekma|amah[- ]mutsun|costanoan|chumash|miwok|pomo|yokuts|patwin)\b/i,
      /\b(navajo|cherokee|lakota|dakota|hopi|pueblo|apache|sioux)\b/i,
      /\bnative (peoples?|community|art|crafts?)\b/i,
    ],
  },
];

/** Returns true if any of the heritage's keyword regexes match the given text. */
export function matchesHeritage(month: HeritageMonth, text: string): boolean {
  if (!text) return false;
  for (const re of month.keywords) {
    if (re.test(text)) return true;
  }
  return false;
}

/** Returns every heritage month whose window contains `iso` (YYYY-MM-DD). */
export function currentHeritageMonths(iso: string): HeritageMonth[] {
  const year = Number(iso.slice(0, 4));
  if (!Number.isFinite(year)) return [];
  return HERITAGE_MONTHS.filter((m) => {
    const w = m.windowFor(year);
    return iso >= w.startIso && iso <= w.endIso;
  });
}
