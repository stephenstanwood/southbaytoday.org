import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import indexJson from "../../../data/south-bay/camp-finder-index.json";
import { useTodayPT } from "../../../lib/south-bay/useTodayPT";
import {
  CITY_PAGE_MIN,
  OPERATOR_PAGE_MIN,
  TOPIC_ART,
  TOPIC_COLOR,
  TOPIC_LABELS,
  TOPIC_PAGE_MIN,
  artTopic,
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
// the program's own static page, where every fact shows its source. The art
// is a committed Recraft set (scripts/camps/generate-camp-art.mjs).
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
const AGES = Array.from({ length: 16 }, (_, i) => String(i + 3)); // 3 to 18
const fmt = (n: number) => n.toLocaleString("en-US");

const isPosted = (row: Row) => row.season === LATEST && !!row.sessions?.length && !!row.price;
const POSTED = INDEX.programs.filter(isPosted).length;

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
// Interests in the order readers reach for them: the biggest first.
const TOPICS_PRESENT = Object.keys(TOPIC_LABELS)
  .filter((t) => TOPIC_COUNTS.has(t))
  .sort((a, b) => (TOPIC_COUNTS.get(b) ?? 0) - (TOPIC_COUNTS.get(a) ?? 0));
const CITIES_BY_SIZE = [...INDEX.cities].sort(
  (a, b) => (CITY_COUNTS.get(b.slug) ?? 0) - (CITY_COUNTS.get(a.slug) ?? 0) || a.name.localeCompare(b.name),
);
const OPERATOR_PAGES = INDEX.operators
  .filter((o) => (OPERATOR_COUNTS.get(o.slug) ?? 0) >= OPERATOR_PAGE_MIN)
  .sort((a, b) => a.name.localeCompare(b.name));
const BIGGEST_OPERATORS = [...OPERATOR_PAGES]
  .sort((a, b) => (OPERATOR_COUNTS.get(b.slug) ?? 0) - (OPERATOR_COUNTS.get(a.slug) ?? 0) || a.name.localeCompare(b.name))
  .slice(0, 12);

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

/** A plain click (no new-tab modifier) that the page can handle in place. */
const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

function scrollToResults() {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("camps-results")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ q, age, onSearch }: { q: string; age: string; onSearch: (q: string, age: string) => void }) {
  const [draftQ, setDraftQ] = useState(q);
  const [draftAge, setDraftAge] = useState(age);
  useEffect(() => setDraftQ(q), [q]);
  useEffect(() => setDraftAge(age), [age]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(draftQ, draftAge);
  };

  return (
    <section className="camps-hero" aria-labelledby="camps-hero-title">
      <div className="camps-hero-art">
        <img src="/images/camps/hero.webp" alt="" width={1440} height={810} fetchPriority="high" decoding="async" />
        <span className="camps-hero-sticker" aria-hidden="true">Summer {LATEST}</span>
      </div>

      <div className="camps-hero-body">
        <div className="camps-hero-copy">
          <h1 id="camps-hero-title" className="camps-hero-title">Summer Camps</h1>
          <p className="camps-hero-dek">
            Ages, weeks and prices for summer camps across Santa Clara County, straight from each camp's own website.
          </p>
        </div>

        <form className="camps-hero-search" role="search" aria-label="Find a summer camp" onSubmit={submit}>
          <label className="camps-hero-field camps-hero-field--q">
            <span className="camps-sr">Camp, activity or city</span>
            <input
              type="search"
              placeholder="Soccer, robotics, Cupertino…"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
            />
          </label>
          <label className="camps-hero-field">
            <span className="camps-sr">Age</span>
            <select value={draftAge} onChange={(e) => setDraftAge(e.target.value)}>
              <option value="">Any age</option>
              {AGES.map((a) => (
                <option key={a} value={a}>Age {a}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="camps-hero-go">Find camps</button>
        </form>

        <ul className="camps-hero-stats" aria-label="In the directory">
          <li><strong>{fmt(INDEX.programs.length)}</strong> programs</li>
          <li><strong>{fmt(POSTED)}</strong> with {LATEST} dates and prices</li>
          <li><strong>{INDEX.cities.length}</strong> cities</li>
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Interests: the illustrated way in
// ---------------------------------------------------------------------------

function Interests({ active, onPick }: { active: string; onPick: (topic: string) => void }) {
  return (
    <section className="camps-section" aria-labelledby="camps-interests-title">
      <h2 id="camps-interests-title" className="camps-h2">What are they into?</h2>
      <ul className="camps-topics">
        {TOPICS_PRESENT.map((t) => {
          const count = TOPIC_COUNTS.get(t) ?? 0;
          const hasPage = count >= TOPIC_PAGE_MIN;
          const pressed = active === t;
          return (
            <li key={t}>
              <a
                className="camps-topic"
                data-color={TOPIC_COLOR[t] ?? "violet"}
                href={hasPage ? `/camps/topic/${t}` : `/camps?topic=${t}`}
                aria-current={pressed ? "true" : undefined}
                onClick={(e) => {
                  if (!plainClick(e)) return;
                  e.preventDefault();
                  onPick(pressed ? "" : t);
                }}
              >
                <span className="camps-topic-art">
                  <img src={TOPIC_ART(t)} alt="" width={480} height={480} loading="lazy" decoding="async" />
                </span>
                <span className="camps-topic-label">
                  <span className="camps-topic-name">{TOPIC_LABELS[t]}</span>
                  <span className="camps-topic-count">{fmt(count)} program{count === 1 ? "" : "s"}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function CampCard({ row, todayIso }: { row: Row; todayIso: string }) {
  const operator = INDEX.operators[row.op];
  const latest = row.season === LATEST;
  const price = formatPriceRange(row.price);
  const registration = latest ? formatRegistration(row.opens, row.deadline, todayIso) : null;
  const topic = artTopic(row.name, row.topics);
  const dates = row.sessions?.length ? formatSessions(row.sessions, row.season) : null;

  return (
    <article className="camps-card" data-color={(topic && TOPIC_COLOR[topic]) || "violet"}>
      {topic && (
        <span className="camps-card-art" aria-hidden="true">
          <img src={TOPIC_ART(topic)} alt="" width={480} height={480} loading="lazy" decoding="async" />
        </span>
      )}
      <div className="camps-card-body">
        <p className="camps-card-kicker">
          {row.topics.map((t) => TOPIC_LABELS[t] ?? t).join(" · ")}
          {row.overnight ? " · Overnight" : ""}
        </p>
        <h3 className="camps-card-title">
          <a className="camps-card-link" href={`/camps/${row.id}`}>{row.name}</a>
        </h3>
        <p className="camps-card-where">
          {operator.name}
          <span aria-hidden="true"> · </span>
          {CITY_NAME.get(row.city)}
        </p>

        <ul className="camps-card-facts">
          <li>{row.ages ? formatAges(row.ages, row.grades) : "Ages not stated"}</li>
          <li className={dates ? undefined : "is-missing"}>
            {dates ?? `${LATEST} dates not posted yet`}
            {!latest && dates ? ` (${row.season})` : ""}
          </li>
          {price && (
            <li className="camps-card-price">
              {price}
              {!latest ? ` (${row.season})` : ""}
            </li>
          )}
          {row.aid && <li className="camps-card-aid">Financial aid</li>}
        </ul>

        {registration && <p className="camps-card-note">{registration}</p>}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

function Directory({
  filters,
  set,
  clear,
  todayIso,
}: {
  filters: Filters;
  set: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clear: () => void;
  todayIso: string;
}) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [filters]);

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
  const weekMax = Math.max(1, ...weekCounts);
  const visible = results.slice(0, shown);

  return (
    <section className="camps-section camps-finder" id="camps-results" aria-labelledby="camps-finder-title">
      <div className="camps-finder-head">
        <h2 id="camps-finder-title" className="camps-h2">Every camp</h2>
        <p className="camps-finder-count" aria-live="polite">
          {results.length === 0
            ? "No programs match"
            : <><strong>{fmt(results.length)}</strong> program{results.length === 1 ? "" : "s"}{week ? ` running ${week.label}` : ""}</>}
          {hasFilters && (
            <button type="button" className="camps-clear" onClick={clear}>Clear all</button>
          )}
        </p>
      </div>

      <div className="camps-toolbar">
        <label className="camps-field camps-field--q">
          <span className="camps-sr">Search camps</span>
          <input
            type="search"
            placeholder="Search camps, activities or organizations"
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
          />
        </label>
        <label className="camps-field">
          <span className="camps-sr">Age</span>
          <select value={filters.age} onChange={(e) => set("age", e.target.value)}>
            <option value="">Any age</option>
            {AGES.map((a) => (
              <option key={a} value={a}>Age {a}</option>
            ))}
          </select>
        </label>
        <label className="camps-field">
          <span className="camps-sr">City</span>
          <select value={filters.city} onChange={(e) => set("city", e.target.value)}>
            <option value="">Any city</option>
            {INDEX.cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="camps-field">
          <span className="camps-sr">Interest</span>
          <select value={filters.topic} onChange={(e) => set("topic", e.target.value)}>
            <option value="">Any interest</option>
            {TOPICS_PRESENT.map((t) => (
              <option key={t} value={t}>{TOPIC_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="camps-field">
          <span className="camps-sr">Sort</span>
          <select value={filters.sort} onChange={(e) => set("sort", e.target.value as SortKey)}>
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORTS[k].label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="camps-toggles" role="group" aria-label="Only show">
        <button type="button" className="camps-toggle" aria-pressed={filters.aid} onClick={() => set("aid", !filters.aid)}>
          Financial aid
        </button>
        <button type="button" className="camps-toggle" aria-pressed={filters.posted} onClick={() => set("posted", !filters.posted)}>
          {LATEST} dates posted
        </button>
        <button type="button" className="camps-toggle" aria-pressed={filters.overnight} onClick={() => set("overnight", !filters.overnight)}>
          Overnight
        </button>
      </div>

      {INDEX.weeks.length > 0 && (
        <div className="camps-weeks" role="group" aria-label={`Weeks of summer ${LATEST}`}>
          {INDEX.weeks.map((w, i) => (
            <button
              key={w.start}
              type="button"
              className="camps-week"
              aria-pressed={filters.week === w.start}
              aria-label={`${w.label}: ${weekCounts[i]} program${weekCounts[i] === 1 ? "" : "s"}`}
              onClick={() => set("week", filters.week === w.start ? "" : w.start)}
            >
              <span className="camps-week-bar" aria-hidden="true">
                <span style={{ blockSize: `${Math.max(6, Math.round((weekCounts[i] / weekMax) * 100))}%` }} />
              </span>
              <span className="camps-week-count" aria-hidden="true">{weekCounts[i]}</span>
              <span className="camps-week-label" aria-hidden="true">{w.label}</span>
            </button>
          ))}
        </div>
      )}

      {results.length === 0 ? (
        <div className="camps-empty">
          <h3>No camps match all of those</h3>
          <p>Try removing a filter or picking another week.</p>
        </div>
      ) : (
        <div className="camps-grid">
          {visible.map((row) => (
            <CampCard key={row.id} row={row} todayIso={todayIso} />
          ))}
        </div>
      )}

      {visible.length < results.length && (
        <button type="button" className="camps-more" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, results.length - visible.length)} more
          <span> of {fmt(results.length - visible.length)}</span>
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cities, organizations, camps still to check, and where the details come from
// ---------------------------------------------------------------------------

function Cities() {
  const cities = CITIES_BY_SIZE.filter((c) => (CITY_COUNTS.get(c.slug) ?? 0) >= CITY_PAGE_MIN);
  return (
    <section className="camps-section" aria-labelledby="camps-cities-title">
      <h2 id="camps-cities-title" className="camps-h2">Camps by city</h2>
      <ul className="camps-cities">
        {cities.map((c) => (
          <li key={c.slug}>
            <a href={`/camps/city/${c.slug}`}>
              {c.name}
              <span>{fmt(CITY_COUNTS.get(c.slug) ?? 0)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Organizations() {
  return (
    <section className="camps-section" aria-labelledby="camps-orgs-title">
      <h2 id="camps-orgs-title" className="camps-h2">The biggest camp organizations</h2>
      <ul className="camps-orgs">
        {BIGGEST_OPERATORS.map((o) => (
          <li key={o.slug}>
            <a href={`/camps/operator/${o.slug}`}>
              <span className="camps-org-name">{o.name}</span>
              <span className="camps-org-count">{fmt(OPERATOR_COUNTS.get(o.slug) ?? 0)} programs</span>
            </a>
          </li>
        ))}
      </ul>
      <details className="camps-az">
        <summary>All {OPERATOR_PAGES.length} organizations, A to Z</summary>
        <ul>
          {OPERATOR_PAGES.map((o) => (
            <li key={o.slug}>
              <a href={`/camps/operator/${o.slug}`}>{o.name}</a> <span>{OPERATOR_COUNTS.get(o.slug)}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function StillToCheck() {
  if (!INDEX.stillToCheck.length) return null;
  return (
    <section className="camps-section camps-check" aria-labelledby="camps-check-title">
      <h2 id="camps-check-title" className="camps-h3">Still on our list for {LATEST}</h2>
      <p>Last summer's camps we haven't gathered yet. Their own pages have the latest.</p>
      <ul>
        {INDEX.stillToCheck.map((c) => (
          <li key={c.url + c.name}>
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              {c.name}
              <span aria-hidden="true"> ↗</span>
            </a>
            <span>{c.city}</span>
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
    <footer className="camps-method">
      <p>
        Every listing links to the camp page it came from and the day we checked it
        {INDEX.checkedThrough ? ` (latest: ${fullDate(INDEX.checkedThrough)})` : ""}. Camps post next summer's details
        from December through February, so a listing still showing {LATEST - 1} hasn't posted {LATEST} yet.{" "}
        <button type="button" className="camps-method-link" data-feedback="correction" onClick={() => openFeedback("correction")}>
          Spot something off, or a camp we're missing?
        </button>
      </p>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function CampsView({ buildDayPt }: { buildDayPt?: string }) {
  // The build's day while hydrating, then the reader's (useTodayPT).
  const todayIso = useTodayPT(buildDayPt);
  const [filters, setFilters] = useState<Filters>(EMPTY);
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

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clear = () => setFilters((prev) => ({ ...EMPTY, sort: prev.sort }));

  return (
    <div className="camps-view">
      <Hero
        q={filters.q}
        age={filters.age}
        onSearch={(q, age) => {
          setFilters((prev) => ({ ...prev, q, age }));
          scrollToResults();
        }}
      />
      <Interests
        active={filters.topic}
        onPick={(topic) => {
          set("topic", topic);
          if (topic) scrollToResults();
        }}
      />
      <Directory filters={filters} set={set} clear={clear} todayIso={todayIso} />
      <Cities />
      <Organizations />
      <StillToCheck />
      <Method />
    </div>
  );
}
