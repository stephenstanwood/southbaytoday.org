// ---------------------------------------------------------------------------
// South Bay Today — Camp Finder data for the static camp pages (build time)
// ---------------------------------------------------------------------------
// Reads the committed snapshot written by scripts/sync-camp-finder.mjs. Only
// Astro frontmatter imports this module: the full snapshot carries every
// field's source and must never ship to the browser. The /camps island reads
// the slim camp-finder-index.json instead.

import snapshotJson from "../../data/south-bay/camp-finder.json";
import {
  CITY_PAGE_MIN,
  OPERATOR_PAGE_MIN,
  TOPIC_LABELS,
  TOPIC_PAGE_MIN,
  formatAges,
  formatCents,
  formatPriceRange,
  formatSessions,
  type PricePer,
} from "./campFormat";

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface Program {
  id: string;
  name: string;
  operator: string;
  operatorSlug: string;
  kind: "day" | "overnight";
  city: string;
  citySlug: string;
  address: Address | { multiple: Address[] } | null;
  ages: { min: number; max: number; unit: "years" | "grades" } | null;
  season: number;
  sessions: Array<{ start: string; end: string }>;
  price: { unit: "week" | "session"; rates: Array<{ label: string; cents: number }> } | null;
  registration: { opens?: string; deadline?: string } | null;
  financialAid: "yes" | "no" | "not stated";
  topics: string[];
  url: string;
  urlIndex: number;
  checked: string | null;
  src: Record<string, [number, string]>;
}

interface Snapshot {
  schema: number;
  region: string;
  regionName: string;
  dataCommit: string | null;
  checkedThrough: string | null;
  counts: {
    programs: number;
    operators: number;
    cities: number;
    latestSeason: number;
    inLatestSeason: number;
    postedLatestSeason: number;
  };
  urls: string[];
  programs: Program[];
}

export const CAMPS: Snapshot = snapshotJson as unknown as Snapshot;
export const LATEST_SEASON = CAMPS.counts.latestSeason;

const byId = new Map(CAMPS.programs.map((p) => [p.id, p]));

export function getProgram(id: string): Program | undefined {
  return byId.get(id);
}

/** The page a field came from and the day it was checked, when the record has one. */
export function sourceFor(program: Program, field: string): { url: string; checked: string } | null {
  const s = program.src[field];
  return s ? { url: CAMPS.urls[s[0]], checked: s[1] } : null;
}

export function sessionTuples(program: Program): Array<[string, string]> {
  return program.sessions.map((s) => [s.start, s.end]);
}

const DAY_MS = 86_400_000;

/** A session that runs one week reads as a weekly price (same rule as the sync). */
export function pricePer(program: Program): PricePer {
  if (program.price?.unit === "week") return "week";
  const oneWeek =
    program.sessions.length > 0 &&
    program.sessions.every((s) => (Date.parse(s.end) - Date.parse(s.start)) / DAY_MS + 1 <= 7);
  return oneWeek ? "week" : "session";
}

export function priceSummary(program: Program): string | null {
  if (!program.price) return null;
  const cents = program.price.rates.map((r) => r.cents);
  return formatPriceRange([Math.min(...cents), Math.max(...cents), pricePer(program)]);
}

/** "$588 YMCA member · $626 Community member" */
export function priceDetail(program: Program): string[] {
  return (program.price?.rates ?? []).map((r) => `${formatCents(r.cents)} ${r.label}`);
}

/** One line for a list row: "Ages 7–9 · Jul 12–16 · $619/week" */
export function programLine(program: Program): string {
  const ages = formatAges(program.ages ? [program.ages.min, program.ages.max] : null, program.ages?.unit === "grades");
  const dates = formatSessions(sessionTuples(program), program.season);
  const price = priceSummary(program);
  return [ages, dates, price].filter(Boolean).join(" · ");
}

/** The camp's own address as one line, or the list of sites. */
export function addressLines(program: Program): string[] {
  const a = program.address;
  if (!a) return [];
  const one = (x: Address) => [x.street, x.city, [x.state, x.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return "multiple" in a ? a.multiple.map(one) : [one(a)];
}

function sortPrograms(list: Program[]): Program[] {
  // Next summer's posted programs first, then next summer's not-yet-posted,
  // then older seasons; alphabetical inside each.
  const tier = (p: Program) => (p.season === LATEST_SEASON ? (p.sessions.length && p.price ? 0 : 1) : 2);
  return [...list].sort((a, b) => tier(a) - tier(b) || a.name.localeCompare(b.name) || a.city.localeCompare(b.city));
}

export interface Group {
  slug: string;
  name: string;
  programs: Program[];
}

function groupBy(key: (p: Program) => string, label: (p: Program) => string, list = CAMPS.programs): Group[] {
  const groups = new Map<string, Group>();
  for (const p of list) {
    const slug = key(p);
    if (!groups.has(slug)) groups.set(slug, { slug, name: label(p), programs: [] });
    groups.get(slug)!.programs.push(p);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, programs: sortPrograms(g.programs) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const CITY_GROUPS = groupBy((p) => p.citySlug, (p) => p.city);
export const OPERATOR_GROUPS = groupBy((p) => p.operatorSlug, (p) => p.operator);
export const TOPIC_GROUPS: Group[] = Object.keys(TOPIC_LABELS)
  .map((slug) => ({
    slug,
    name: TOPIC_LABELS[slug],
    programs: sortPrograms(CAMPS.programs.filter((p) => p.topics.includes(slug))),
  }))
  .filter((g) => g.programs.length > 0);

export const CITY_PAGES = CITY_GROUPS.filter((g) => g.programs.length >= CITY_PAGE_MIN);
export const TOPIC_PAGES = TOPIC_GROUPS.filter((g) => g.programs.length >= TOPIC_PAGE_MIN);
export const OPERATOR_PAGES = OPERATOR_GROUPS.filter((g) => g.programs.length >= OPERATOR_PAGE_MIN);

const cityPageSlugs = new Set(CITY_PAGES.map((g) => g.slug));
const topicPageSlugs = new Set(TOPIC_PAGES.map((g) => g.slug));
const operatorPageSlugs = new Set(OPERATOR_PAGES.map((g) => g.slug));

export const cityHref = (slug: string) => (cityPageSlugs.has(slug) ? `/camps/city/${slug}` : `/camps?city=${slug}`);
export const topicHref = (slug: string) => (topicPageSlugs.has(slug) ? `/camps/topic/${slug}` : `/camps?topic=${slug}`);
export const operatorHref = (slug: string) => (operatorPageSlugs.has(slug) ? `/camps/operator/${slug}` : null);

/** Group a list by camp operator (city and interest pages) or by city (operator pages). */
export const groupByOperator = (list: Program[]) => groupBy((p) => p.operatorSlug, (p) => p.operator, list);
export const groupByCity = (list: Program[]) => groupBy((p) => p.citySlug, (p) => p.city, list);

export function countPosted(list: Program[]): number {
  return list.filter((p) => p.season === LATEST_SEASON && p.sessions.length > 0 && p.price).length;
}

/** " 12 already have 2027 dates and prices." for the list pages' intro. */
export function postedSentence(list: Program[]): string {
  const posted = countPosted(list);
  if (posted === 0) return ` None have ${LATEST_SEASON} dates and prices posted yet.`;
  if (posted === 1) return ` One already has ${LATEST_SEASON} dates and prices.`;
  if (posted === list.length) return ` All have ${LATEST_SEASON} dates and prices.`;
  return ` ${posted} already have ${LATEST_SEASON} dates and prices.`;
}

export function ageSpan(list: Program[]): string | null {
  const withAges = list.filter((p) => p.ages);
  if (!withAges.length) return null;
  const min = Math.min(...withAges.map((p) => p.ages!.min));
  const max = Math.max(...withAges.map((p) => p.ages!.max));
  return formatAges([min, max]);
}

/** Camp programs in a city, for the "Summer camps in <City>" line on /city pages. */
export function campCountForCity(citySlug: string): number {
  return CAMPS.programs.filter((p) => p.citySlug === citySlug).length;
}
