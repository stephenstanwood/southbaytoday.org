import { useEffect, useMemo, useRef, useState } from "react";
import indexJson from "../../../data/south-bay/camp-finder-index.json";
import PageHero from "../PageHero";
import { useTodayPT } from "../../../lib/south-bay/useTodayPT";
import {
  CITY_PAGE_MIN,
  OPERATOR_PAGE_MIN,
  TOPIC_LABELS,
  TOPIC_PAGE_MIN,
  formatAges,
  formatPriceRange,
  formatRegistration,
  formatSessions,
  fullDate,
  runsDuringWeek,
  type PricePer,
} from "../../../lib/south-bay/campFormat";

// ---------------------------------------------------------------------------
// The /camps directory. Its list is camp-finder-index.json, the slim side of
// the sourced camp records (scripts/sync-camp-finder.mjs); each card links to
// the program's own static page, where every fact shows its source.
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  name: string;
  op: number;
  city: string;
  season: number;
  topics: string[];
  ages?: [number, number];
  grades?: boolean;
  sessions?: Array<[string, string]>;
  price?: [number, number, PricePer];
  aid?: boolean;
  overnight?: boolean;
  opens?: string;
  deadline?: string;
}

interface CampIndex {
  checkedThrough: string | null;
  latestSeason: number;
  weeks: Array<{ start: string; end: string; label: string }>;
  operators: Array<{ slug: string; name: string }>;
  cities: Array<{ slug: string; name: string }>;
  stillToCheck: Array<{ name: string; city: string; url: string }>;
  programs: Row[];
}

const INDEX = indexJson as unknown as CampIndex;
const LATEST = INDEX.latestSeason;
const CITY_NAME = new Map(INDEX.cities.map((c) => [c.slug, c.name]));
const PAGE = 24;

const isPosted = (row: Row) => row.season === LATEST && !!row.sessions?.length && !!row.price;

// Next summer's posted programs first, then next summer's not-yet-posted, then
// last summer's. Inside each tier: soonest first (the default, which also
// keeps one camp's many sites from bunching up), lowest price, or A to Z.
const tier = (row: Row) => (row.season === LATEST ? (isPosted(row) ? 0 : 1) : 2);
const byName = (a: Row, b: Row) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city);
const firstStart = (row: Row) => row.sessions?.[0]?.[0] ?? "9999";
const SORTS = {
  soonest: { label: "Soonest first", compare: (a: Row, b: Row) => tier(a) - tier(b) || firstStart(a).localeCompare(firstStart(b)) || byName(a, b) },
  price: {
    label: "Lowest price",
    compare: (a: Row, b: Row) =>
      tier(a) - tier(b) || (a.price?.[0] ?? Infinity) - (b.price?.[0] ?? Infinity) || byName(a, b),
  },
  name: { label: "A to Z", compare: (a: Row, b: Row) => tier(a) - tier(b) || byName(a, b) },
} as const;
type SortKey = keyof typeof SORTS;
const SORTED: Record<SortKey, Row[]> = {
  soonest: [...INDEX.programs].sort(SORTS.soonest.compare),
  price: [...INDEX.programs].sort(SORTS.price.compare),
  name: [...INDEX.programs].sort(SORTS.name.compare),
};

function countBy<T extends string>(keys: (row: Row) => T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const row of INDEX.programs) for (const k of keys(row)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}
const CITY_COUNTS = countBy((r) => [r.city]);
const TOPIC_COUNTS = countBy((r) => r.topics);
const OPERATOR_COUNTS = countBy((r) => [INDEX.operators[r.op].slug]);
const TOPICS_PRESENT = Object.keys(TOPIC_LABELS).filter((t) => TOPIC_COUNTS.has(t));

interface Filters {
  q: string;
  city: string;
  topic: string;
  age: string;
  week: string;
  aid: boolean;
  posted: boolean;
  overnight: boolean;
  sort: SortKey;
}

const EMPTY: Filters = {
  q: "",
  city: "",
  topic: "",
  age: "",
  week: "",
  aid: false,
  posted: false,
  overnight: false,
  sort: "soonest",
};

function readFilters(search: string): Filters {
  const sp = new URLSearchParams(search);
  const known = (value: string | null, ok: (v: string) => boolean) => (value && ok(value) ? value : "");
  return {
    q: sp.get("q") ?? "",
    city: known(sp.get("city"), (v) => CITY_NAME.has(v)),
    topic: known(sp.get("topic"), (v) => TOPIC_COUNTS.has(v)),
    age: known(sp.get("age"), (v) => /^\d{1,2}$/.test(v)),
    week: known(sp.get("week"), (v) => INDEX.weeks.some((w) => w.start === v)),
    aid: sp.get("aid") === "1",
    posted: sp.get("posted") === "1",
    overnight: sp.get("overnight") === "1",
    sort: (known(sp.get("sort"), (v) => v in SORTS) || "soonest") as SortKey,
  };
}

function writeFilters(f: Filters): string {
  const sp = new URLSearchParams();
  if (f.q.trim()) sp.set("q", f.q.trim());
  if (f.city) sp.set("city", f.city);
  if (f.topic) sp.set("topic", f.topic);
  if (f.age) sp.set("age", f.age);
  if (f.week) sp.set("week", f.week);
  if (f.aid) sp.set("aid", "1");
  if (f.posted) sp.set("posted", "1");
  if (f.overnight) sp.set("overnight", "1");
  if (f.sort !== "soonest") sp.set("sort", f.sort);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// Everything but the week, so the week strip can count each week under the
// reader's other choices.
function matchesExceptWeek(row: Row, f: Filters, words: string[]): boolean {
  if (f.city && row.city !== f.city) return false;
  if (f.topic && !row.topics.includes(f.topic)) return false;
  if (f.aid && !row.aid) return false;
  if (f.posted && !(row.season === LATEST && row.sessions?.length)) return false;
  if (f.overnight && !row.overnight) return false;
  if (f.age) {
    const age = Number(f.age);
    if (!row.ages || row.grades || age < row.ages[0] || age > row.ages[1]) return false;
  }
  if (words.length) {
    const haystack = [
      row.name,
      INDEX.operators[row.op].name,
      CITY_NAME.get(row.city) ?? row.city,
      ...row.topics.map((t) => TOPIC_LABELS[t] ?? t),
    ]
      .join(" ")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    if (!words.every((w) => haystack.includes(w))) return false;
  }
  return true;
}

function searchWords(q: string): string[] {
  return q
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function CampCard({ row, todayIso }: { row: Row; todayIso: string }) {
  const operator = INDEX.operators[row.op];
  const latest = row.season === LATEST;
  const price = formatPriceRange(row.price);
  const registration = latest ? formatRegistration(row.opens, row.deadline, todayIso) : null;

  return (
    <article className="camps-card">
      <header className="camps-card-head">
        <div className="camps-card-kicker">
          {CITY_NAME.get(row.city)}
          <span className="camps-card-sep">{" · "}</span>
          {operator.name}
        </div>
        {!latest && <span className="camps-season">{row.season} details</span>}
      </header>

      <h3 className="camps-card-title">
        <a className="camps-card-link" href={`/camps/${row.id}`}>{row.name}</a>
      </h3>

      <dl className="camps-facts">
        <div>
          <dt>Ages</dt>
          <dd>{row.ages ? formatAges(row.ages, row.grades).replace(/^Ages? /, "") : "Not stated"}</dd>
        </div>
        <div>
          <dt>{latest ? "Dates" : `${row.season} dates`}</dt>
          <dd>{row.sessions?.length ? formatSessions(row.sessions, row.season) : "Not posted yet"}</dd>
        </div>
        <div>
          <dt>{latest ? "Price" : `${row.season} price`}</dt>
          <dd className={price ? "camps-fact-price" : undefined}>{price ?? "Not posted yet"}</dd>
        </div>
        <div>
          <dt>Financial aid</dt>
          <dd>{row.aid ? "Yes" : "Not stated"}</dd>
        </div>
      </dl>

      {(row.topics.length > 0 || row.overnight) && (
        <ul className="camps-card-tags" aria-label="Interests">
          {row.topics.map((t) => (
            <li key={t} className="camps-type" data-type={t}>{TOPIC_LABELS[t] ?? t}</li>
          ))}
          {row.overnight && <li className="camps-type" data-type="overnight">Overnight</li>}
        </ul>
      )}

      {registration && <p className="camps-card-note">{registration}</p>}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

function Directory({ todayIso }: { todayIso: string }) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [shown, setShown] = useState(PAGE);
  const fromUrl = useRef(false);

  // Deep links (/camps?city=sunnyvale&topic=stem) apply after mount, so the
  // first render matches the build's HTML.
  useEffect(() => {
    const next = readFilters(window.location.search);
    if (writeFilters(next)) {
      fromUrl.current = true;
      setFilters(next);
    }
  }, []);

  // Keep the address bar in step, so a filtered list can be shared.
  useEffect(() => {
    if (fromUrl.current) {
      fromUrl.current = false;
      return;
    }
    const query = writeFilters(filters);
    if (query !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${query}`);
    }
  }, [filters]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setShown(PAGE);
  };
  const hasFilters = writeFilters({ ...filters, sort: "soonest" }) !== "";
  const words = useMemo(() => searchWords(filters.q), [filters.q]);

  const base = useMemo(
    () => SORTED[filters.sort].filter((row) => matchesExceptWeek(row, filters, words)),
    [filters, words],
  );
  const week = INDEX.weeks.find((w) => w.start === filters.week);
  const results = useMemo(
    () => (week ? base.filter((row) => row.season === LATEST && runsDuringWeek(row.sessions, week.start, week.end)) : base),
    [base, week],
  );
  const weekCounts = useMemo(
    () =>
      INDEX.weeks.map((w) => base.filter((row) => row.season === LATEST && runsDuringWeek(row.sessions, w.start, w.end)).length),
    [base],
  );
  const visible = results.slice(0, shown);

  return (
    <section className="camps-browse" aria-labelledby="camps-browse-title">
      <div className="camps-section-head">
        <div>
          <div className="sb-eyebrow camps-kicker">Directory</div>
          <h2 id="camps-browse-title">Find a camp</h2>
        </div>
        <p>Pick an age and a week to see what runs then. Each camp's page shows where every detail came from.</p>
      </div>

      <div className="camps-toolbar">
        <label className="camps-field camps-field--search">
          <span>Search</span>
          <input
            type="search"
            placeholder="Camp, activity or city"
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
          />
        </label>

        <label className="camps-field">
          <span>Age</span>
          <input
            type="number"
            inputMode="numeric"
            min={3}
            max={18}
            placeholder="Any"
            value={filters.age}
            onChange={(e) => set("age", e.target.value.replace(/\D/g, "").slice(0, 2))}
          />
        </label>

        <label className="camps-field">
          <span>City</span>
          <select value={filters.city} onChange={(e) => set("city", e.target.value)}>
            <option value="">All cities</option>
            {INDEX.cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="camps-field">
          <span>Interest</span>
          <select value={filters.topic} onChange={(e) => set("topic", e.target.value)}>
            <option value="">Any interest</option>
            {TOPICS_PRESENT.map((t) => (
              <option key={t} value={t}>{TOPIC_LABELS[t]}</option>
            ))}
          </select>
        </label>

        <label className="camps-field">
          <span>Sort</span>
          <select value={filters.sort} onChange={(e) => set("sort", e.target.value as SortKey)}>
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORTS[k].label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="camps-toggles" role="group" aria-label="Only show">
        <button type="button" className="sb-chip camps-toggle" aria-pressed={filters.aid} onClick={() => set("aid", !filters.aid)}>
          Financial aid
        </button>
        <button type="button" className="sb-chip camps-toggle" aria-pressed={filters.posted} onClick={() => set("posted", !filters.posted)}>
          {LATEST} dates posted
        </button>
        <button
          type="button"
          className="sb-chip camps-toggle"
          aria-pressed={filters.overnight}
          onClick={() => set("overnight", !filters.overnight)}
        >
          Overnight
        </button>
      </div>

      {INDEX.weeks.length > 0 && (
        <div className="camps-weeks">
          <div className="camps-weeks-head">
            <span className="camps-weeks-label">Week of summer {LATEST}</span>
            {week && (
              <button type="button" className="camps-weeks-clear" onClick={() => set("week", "")}>
                Any week
              </button>
            )}
          </div>
          <div className="camps-weeks-strip" role="group" aria-label={`Weeks of summer ${LATEST}`}>
            {INDEX.weeks.map((w, i) => (
              <button
                key={w.start}
                type="button"
                className="camps-weekchip"
                aria-pressed={filters.week === w.start}
                aria-label={`${w.label}: ${weekCounts[i]} program${weekCounts[i] === 1 ? "" : "s"}`}
                onClick={() => set("week", filters.week === w.start ? "" : w.start)}
              >
                <span className="camps-weekchip-dates">{w.label}</span>
                <span className="camps-weekchip-count">{weekCounts[i]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="camps-results-head">
        <span aria-live="polite">
          {results.length === 0
            ? "No programs match"
            : visible.length < results.length
              ? <>Showing <strong>{visible.length}</strong> of <strong>{results.length}</strong> programs</>
              : <><strong>{results.length}</strong> program{results.length === 1 ? "" : "s"}</>}
          {week ? ` running ${week.label}` : ""}
        </span>
        {hasFilters && (
          <button
            type="button"
            className="sb-btn sb-btn--quiet"
            onClick={() => {
              setFilters({ ...EMPTY, sort: filters.sort });
              setShown(PAGE);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="sb-empty camps-empty">
          <h3 className="sb-empty-title">No camps match all of those</h3>
          <p className="sb-empty-sub">Try removing a filter or picking another week.</p>
        </div>
      ) : (
        <div className="camps-grid">
          {visible.map((row) => (
            <CampCard key={row.id} row={row} todayIso={todayIso} />
          ))}
        </div>
      )}

      {visible.length < results.length && (
        <button type="button" className="sb-btn camps-show-more" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, results.length - visible.length)} more
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Browse links, camps still to check, and where the details come from
// ---------------------------------------------------------------------------

function BrowseLinks() {
  const cities = INDEX.cities.filter((c) => (CITY_COUNTS.get(c.slug) ?? 0) >= CITY_PAGE_MIN);
  const topics = TOPICS_PRESENT.filter((t) => (TOPIC_COUNTS.get(t) ?? 0) >= TOPIC_PAGE_MIN);
  const operators = INDEX.operators.filter((o) => (OPERATOR_COUNTS.get(o.slug) ?? 0) >= OPERATOR_PAGE_MIN);
  return (
    <section className="camps-browse" aria-labelledby="camps-links-title">
      <div className="camps-section-head">
        <div>
          <div className="sb-eyebrow camps-kicker">Browse</div>
          <h2 id="camps-links-title">Camps by city, interest and organization</h2>
        </div>
      </div>
      <div className="camps-links">
        <nav className="camps-links-group" aria-label="Camps by city">
          <h3>By city</h3>
          <ul>
            {cities.map((c) => (
              <li key={c.slug}>
                <a href={`/camps/city/${c.slug}`}>{c.name}</a> <span>{CITY_COUNTS.get(c.slug)}</span>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="camps-links-group" aria-label="Camps by interest">
          <h3>By interest</h3>
          <ul>
            {topics.map((t) => (
              <li key={t}>
                <a href={`/camps/topic/${t}`}>{TOPIC_LABELS[t]}</a> <span>{TOPIC_COUNTS.get(t)}</span>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="camps-links-group" aria-label="Camps by organization">
          <h3>By organization</h3>
          <ul>
            {operators.map((o) => (
              <li key={o.slug}>
                <a href={`/camps/operator/${o.slug}`}>{o.name}</a> <span>{OPERATOR_COUNTS.get(o.slug)}</span>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

function StillToCheck() {
  if (!INDEX.stillToCheck.length) return null;
  return (
    <section className="camps-browse" aria-labelledby="camps-check-title">
      <div className="camps-section-head">
        <div>
          <div className="sb-eyebrow camps-kicker">Also worth a look</div>
          <h2 id="camps-check-title">More camps to check</h2>
        </div>
        <p>We listed these last summer and haven't gathered their {LATEST} details yet. Their own pages will have the latest.</p>
      </div>
      <ul className="camps-check-list">
        {INDEX.stillToCheck.map((c) => (
          <li key={c.url + c.name}>
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              {c.name}
              <span aria-hidden="true"> ↗</span>
            </a>
            <span className="camps-check-city">{c.city}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Opens the site's Tips & Feedback panel (ReaderWidget) on a correction; until
// that island has hydrated, an email does the same job.
function openFeedback(type: "correction" | "feedback" = "correction") {
  const w = window as Window & { __sbtFeedbackReady?: boolean };
  if (w.__sbtFeedbackReady) {
    window.dispatchEvent(new CustomEvent("sbt:feedback", { detail: { type } }));
  } else {
    window.location.href = "mailto:hello@southbaytoday.org?subject=Summer%20camp%20listing";
  }
}

function Method() {
  return (
    <section className="camps-method" aria-labelledby="camps-method-title">
      <h2 id="camps-method-title">Where these details come from</h2>
      <p>
        Each listing comes from the camp's own website: the ages, dates, prices, registration dates and financial aid it
        posts, with a link to the page each one came from and the day we checked it. Camps post next summer's details
        from December through February, so a listing that still shows {LATEST - 1} means the camp hasn't posted {LATEST} yet.
      </p>
      <p>
        Something out of date, or a camp we're missing?{" "}
        <button type="button" className="camps-method-link" data-feedback="correction" onClick={() => openFeedback("correction")}>
          Tell us
        </button>
        .
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function CampsView({ buildDayPt }: { buildDayPt?: string }) {
  // The build's day while hydrating, then the reader's (useTodayPT).
  const todayIso = useTodayPT(buildDayPt);

  return (
    <div className="camps-view">
      <PageHero
        eyebrow={`South Bay / Summer ${LATEST}`}
        title="Summer Camps"
        description={`Ages, dates, prices and financial aid for summer camps across Santa Clara County, taken from each camp's own pages and linked back to them. We add more as camps post their ${LATEST} details.`}
        note={INDEX.checkedThrough ? `Checked through ${fullDate(INDEX.checkedThrough)}` : undefined}
        accent="#B45309"
      />
      <div className="camps-directory">
        <Directory todayIso={todayIso} />
        <BrowseLinks />
        <StillToCheck />
        <Method />
      </div>
    </div>
  );
}
