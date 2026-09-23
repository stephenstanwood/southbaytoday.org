// ---------------------------------------------------------------------------
// South Bay Today — Day-Planning Homepage
// ---------------------------------------------------------------------------
// "What should we do today?" — bucket grid backed by pre-generated default
// plans (kids + adults) regenerated nightly, with a Reshuffle live-fetch.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { City, Tab } from "../../../lib/south-bay/types";
import { CITIES } from "../../../lib/south-bay/cities";
import {
  type Bucket,
  BUCKET_ORDER,
  BUCKET_LABELS,
  BUCKET_PASSED_AFTER_HOUR,
  isBucket,
  inferBucketFromTimeBlock,
} from "../../../lib/south-bay/buckets";
import PhotoStrip from "./PhotoStrip";
import RedditPulseTeaser from "./RedditPulseTeaser";
import WeekendAheadCard from "./WeekendAheadCard";
import NewsletterSignup from "../NewsletterSignup";
import { cleanDisplayCopy, cleanDisplayName } from "../../../lib/south-bay/displayText.mjs";
import {
  selectDatedDefaultPlan,
  selectNamedDefaultPlan,
} from "../../../lib/south-bay/defaultPlanSelection.mjs";
import { filterAtomicPairCards } from "../../../lib/south-bay/dayPlanPairs";
// =====================================================================
// HOME-TAB-LOCKED — DO NOT ADD TEASER COMPONENTS HERE
// The home tab is hand-curated. Adding new teasers, callouts, strips,
// or cards here is an automated guardrail violation and will fail the
// build via scripts/check-home-locked.mjs (wired into `npm run build`).
// If a data source isn't surfaced on Home, that's deliberate. Surface
// it on a non-Home tab or leave it for Stephen.
// History of removed teasers: JustOpenedTeaser + AroundTownTeaser
// (2026-04-25), WeekendPicksCard (2026-04-26), CityHallThisWeek +
// JustOpened + MothersDayPlan + SchoolYearEndgame +
// SummerCampsCountdown (2026-04-28).
// =====================================================================
import ForecastCard from "../cards/ForecastCard";
import defaultPlansJson from "../../../data/south-bay/default-plans.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DayCard {
  id: string;
  name: string;
  category: string;
  city: string;
  address: string;
  /** Bucket slot — primary user-facing time signal (replaces timeBlock).
   *  May be missing on legacy plans; renderer falls back to timeBlock. */
  bucket?: Bucket;
  /** Real event time, only present for events with a fixed start. Display
   *  hint, not load-bearing. */
  eventTime?: string | null;
  /** Real event end time when known. Drives render-time staleness filtering
   *  so a 6:30 AM event doesn't linger in the MORNING slot till 1 PM. */
  eventEndTime?: string | null;
  /** Legacy field — for new bucket cards this is just the bucket label
   *  ("Breakfast"); for old shared plans it's a clock range. */
  timeBlock: string;
  blurb: string;
  why: string;
  url?: string | null;
  mapsUrl?: string | null;
  cost?: string | null;
  costNote?: string | null;
  photoRef?: string | null;
  image?: string | null;
  venue?: string | null;
  source: "event" | "place";
  /** Pillars are selected first; each paired meal points back to one. */
  role?: "pillar" | "paired-meal";
  pairedWithId?: string | null;
  pairDistanceMiles?: number | null;
  pairLocationPrecision?: "exact" | "venue" | "city";
}

interface PlanResponse {
  cards: DayCard[];
  weather: string | null;
  city: string;
  kids: boolean;
  generatedAt: string;
  poolSize: number;
  scope?: "regional" | "city";
  selectionModel?: string;
}

interface LoadedDefaultPlan {
  cards: DayCard[];
  city: City | null;
  weather: string | null;
  planDate: string;
}

interface LocalState {
  kids: boolean;
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const ACCENT_COLORS = [
  "#FF7B2B", "#F43F7C", "#8738F5", "#22C6D3", "#FFD338", "#13072F",
];

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍽️", outdoor: "🌿", museum: "🏛️", entertainment: "🎭",
  wellness: "💆", shopping: "🛍️", arts: "🎨", events: "📅",
  sports: "⚾", neighborhood: "🏘️",
};

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "sbt-prefs";

function loadState(): LocalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { kids: !!parsed.kids };
  } catch { return defaultState(); }
}

function defaultState(): LocalState {
  return { kids: false };
}

const CITY_LABELS: Record<string, string> = Object.fromEntries(
  CITIES.map((c) => [c.id, c.name]),
);

/** Convert a city slug to its display name (e.g. "san-jose" → "San Jose").
 *  Falls back to a title-cased slug for any city not in CITIES. */
function cityLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  return CITY_LABELS[slug] || slug.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ");
}

/** Compute the effective time context for planning. Late at night there's
 *  not enough day left to plan around, so we flip to tomorrow morning:
 *  cutoff is 8 PM for adults, 6 PM for kids. Returns what the API should
 *  receive (currentHour/currentMinute/planDate) plus whether we flipped.
 *  planDate uses PT so a user in another timezone still gets tomorrow in
 *  South Bay terms. */
function getEffectiveTime(kids: boolean): {
  isTomorrow: boolean;
  currentHour: number;
  currentMinute: number;
  planDate: string | undefined;
} {
  const now = new Date();
  const ptParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const ptHour = Number(ptParts.find((part) => part.type === "hour")?.value || 0) % 24;
  const ptMinute = Number(ptParts.find((part) => part.type === "minute")?.value || 0);
  const cutoff = kids ? 18 : 20;
  if (ptHour >= cutoff) {
    // Compute tomorrow's YYYY-MM-DD in PT. We do this by asking for PT's
    // date, adding one day, and formatting as ISO date.
    const ptTodayStr = now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const [y, m, d] = ptTodayStr.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
    const planDate = tomorrow.toISOString().slice(0, 10);
    return { isTomorrow: true, currentHour: 9, currentMinute: 0, planDate };
  }
  return { isTomorrow: false, currentHour: ptHour, currentMinute: ptMinute, planDate: undefined };
}

/** Load a pre-generated bucket plan from default-plans.json for instant display.
 *  Schema: `plans.adults` / `plans.kids` for today, `plans["adults:tomorrow"]`
 *  / `plans["kids:tomorrow"]` for the next-day flip. Buckets don't expire on
 *  the clock the way old timeBlock cards did, so no time-based filtering — the
 *  homepage dims past buckets in render.
 *
 *  `forceToday` skips the clock-driven tomorrow branch — used by the initial
 *  render so SSR HTML and client hydration agree regardless of when the build
 *  ran vs. when the page is viewed. The post-mount refine effect re-runs with
 *  the real clock. */
function loadDefaultPlan(kids: boolean, opts?: { forceToday?: boolean }): LoadedDefaultPlan {
  try {
    const json = defaultPlansJson as any;
    const plans = json.plans || {};
    const effective = getEffectiveTime(kids);
    const targetDate = effective.planDate || getTodayISOInPT();
    const plan = opts?.forceToday
      ? selectNamedDefaultPlan(plans, { kids })
      : selectDatedDefaultPlan(plans, targetDate, { kids });

    if (!plan) return { cards: [], city: null, weather: null, planDate: targetDate };
    return {
      cards: plan.cards,
      city: (plan.city as City) || REGIONAL_CONTEXT_CITY,
      weather: plan.weather || null,
      planDate: plan.planDate || targetDate,
    };
  } catch {
    const effective = getEffectiveTime(kids);
    return {
      cards: [],
      city: null,
      weather: null,
      planDate: effective.planDate || getTodayISOInPT(),
    };
  }
}

function saveState(state: LocalState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  onNavigate: (tab: Tab) => void;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// Stable regional context for weather and APIs that still require one city.
// It never filters or geographically anchors a regional day plan.
const REGIONAL_CONTEXT_CITY: City = "campbell";

export default function SouthBayTodayView(_props: Props) {
  // All initial state must be deterministic — this component server-renders
  // at build time (client:load), so the first client render has to reproduce
  // the build's HTML byte-for-byte. That means: no localStorage, no clock, no
  // randomness in initializers. First paint is the neutral shape (adults mode,
  // today's plan, all buckets visible); the refine effect below upgrades to
  // the user's stored mode and real time-of-day immediately after mount.
  const [state, setState] = useState<LocalState>(() => defaultState());
  const initialPlan = useRef<LoadedDefaultPlan | null>(null);
  if (initialPlan.current === null) initialPlan.current = loadDefaultPlan(false, { forceToday: true });
  const hasDefaultPlan = initialPlan.current.cards.length > 0;
  const [cards, setCards] = useState<DayCard[]>(initialPlan.current.cards);
  const [weather, setWeather] = useState<string | null>(initialPlan.current.weather);
  const [planCity, setPlanCity] = useState<City>(initialPlan.current.city || REGIONAL_CONTEXT_CITY);
  // Loading is reserved for explicit Reshuffle clicks. Initial paint always
  // uses the pre-generated plan (cron generates kids + adults daily); if the
  // cron failed and there's no cached plan, the empty-state UI handles it.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live "now" signal so past cards fall off without a reload. planDateISO
  // is the target date of the plan in view — when it's today we filter
  // cards whose end time has already passed. nowMinutes starts at 0 (nothing
  // has passed yet = full-day shape) and gets the real clock on mount.
  const [nowMinutes, setNowMinutes] = useState(0);
  // Initialized to "today" rather than the evening tomorrow-flip so the
  // initial render is clock-independent: every comparison against
  // getTodayISOInPT() resolves the same way on the build server and in the
  // hydrating browser even though the two clocks differ.
  const [planDateISO, setPlanDateISO] = useState<string>(() => getTodayISOInPT());
  const fetchRef = useRef(0);
  const displayCity: City = REGIONAL_CONTEXT_CITY;

  // Keep nowMinutes live so past buckets drop out of the grid as soon as
  // their cutoff hits, without a reload. 30 s is plenty — cutoffs are
  // hour-resolution. Also drives the kids/tomorrow flip. Set immediately on
  // mount — initial state is 0 so the server-rendered HTML is deterministic.
  useEffect(() => {
    setNowMinutes(getNowMinutesPT());
    const t = setInterval(() => setNowMinutes(getNowMinutesPT()), 30000);
    return () => clearInterval(t);
  }, []);

  // Don't persist until the refine effect has read the stored prefs —
  // otherwise the deterministic kids:false first render would clobber a
  // returning kids-mode user's preference before we ever load it.
  const prefsLoadedRef = useRef(false);
  useEffect(() => { if (prefsLoadedRef.current) saveState(state); }, [state]);

  // Post-hydration refine: apply localStorage prefs + the real clock. Runs
  // once, immediately after mount, replacing what the initializers used to do
  // (kids mode from sbt-prefs, evening flip to tomorrow's plan).
  useEffect(() => {
    const stored = loadState();
    prefsLoadedRef.current = true;
    // Always refine. A build made on Monday still contains Tuesday under the
    // `:tomorrow` key after midnight; key-only selection otherwise leaves the
    // homepage on Monday until the next deploy.
    applyMode(stored.kids, { fetchIfMissing: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPlan = useCallback(async (noCache = false, kidsOverride?: boolean) => {
    const id = ++fetchRef.current;
    setLoading(true);
    setError(null);
    const requestedKids = kidsOverride ?? state.kids;
    const eff = getEffectiveTime(requestedKids);
    try {
      const res = await fetch("/api/plan-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: REGIONAL_CONTEXT_CITY,
          scope: "regional",
          kids: requestedKids,
          currentHour: eff.currentHour,
          currentMinute: eff.currentMinute,
          planDate: eff.planDate,
          noCache,
        }),
      });
      if (id !== fetchRef.current) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: PlanResponse = await res.json();
      const sorted = [...data.cards].sort((a, b) => bucketSortIndex(a) - bucketSortIndex(b));
      setCards(sorted);
      setPlanDateISO(eff.planDate || getTodayISOInPT());
      setWeather(data.weather);
      setPlanCity((data.city as City) || REGIONAL_CONTEXT_CITY);
    } catch (err) {
      if (id === fetchRef.current) setError(err instanceof Error ? err.message : "Failed to plan your day");
    } finally {
      if (id === fetchRef.current) setLoading(false);
    }
  }, [state.kids]);

  // Cron generates a fresh kids + adults plan every night, so initial paint
  // never auto-fetches. If a cron miss leaves us with a stale or missing
  // cached plan, log it so we notice — but don't spin the UI to recover.
  // The user has Reshuffle for that.
  useEffect(() => {
    if (!hasDefaultPlan) {
      console.warn("[sbt] default-plans missing for current mode — cron may have failed");
      return;
    }
    const generatedAt = (defaultPlansJson as any)?._meta?.generatedAt;
    const ageMs = generatedAt ? Date.now() - new Date(generatedAt).getTime() : Infinity;
    const HARD_STALE_MS = 26 * 60 * 60 * 1000;
    if (ageMs > HARD_STALE_MS) {
      console.warn(`[sbt] default-plans age ${Math.round(ageMs / 3600000)}h exceeds 26h — cron missed its window`);
    }
  }, []);

  // Promote the exact dated plan whenever the PT target date advances — at the
  // evening cutoff or across midnight. Keys are generation-time labels only;
  // planDate is the source of truth.
  useEffect(() => {
    if (loading) return;
    const today = getTodayISOInPT();
    const effective = getEffectiveTime(state.kids);
    const targetDate = effective.planDate || today;
    if (planDateISO >= targetDate) return;
    const next = loadDefaultPlan(state.kids);
    setCards(next.cards);
    setPlanDateISO(next.planDate);
    if (next.city) setPlanCity(next.city);
    setWeather(next.weather);
  }, [cards, planDateISO, nowMinutes, loading, state.kids]);

  // Actions. applyMode loads the pre-generated plan for a target audience
  // mode using the real clock (today or, past the evening cutoff, tomorrow).
  // Shared by the kids toggle and the post-hydration refine effect.
  function applyMode(nextKids: boolean, opts?: { fetchIfMissing?: boolean }) {
    setState({ kids: nextKids });
    // Try the pre-generated plan for the new mode first — that's the whole
    // point of pre-gen'ing both kids + adults plans at 2 AM. Only fall back
    // to a network shuffle if default-plans.json doesn't have the mode.
    const preGen = loadDefaultPlan(nextKids);
    setCards(preGen.cards);
    if (preGen.city) setPlanCity(preGen.city);
    setPlanDateISO(preGen.planDate);
    setWeather(preGen.weather);
    if (!preGen.cards.length && opts?.fetchIfMissing !== false) void fetchPlan(true, nextKids);
  }
  const handleKidsToggle = () => applyMode(!state.kids);
  const handleNewPlan = () => fetchPlan(true);

  // Tomorrow mode: 6pm for kids, 8pm for adults — same cutoff used in
  // Headline follows the plan date — if we've auto-flipped to tomorrow
  // (cards exhausted OR past 8 PM cutoff), say "tomorrow".
  const headline = planDateISO > getTodayISOInPT()
    ? "What should we do tomorrow?"
    : "What should we do today?";

  // With buckets, slots stay visible until their wall-clock cutoff
  // (BUCKET_PASSED_AFTER_HOUR), then they drop out of the grid entirely.
  // Stale plans from yesterday hide everything. Events also age out after
  // their end time (or a 3-hour default duration); in a pillar-pairs plan the
  // attached meal leaves with the event so the UI never displays half a pair.
  const todayPT = getTodayISOInPT();
  const visibleCards: DayCard[] = (() => {
    if (planDateISO < todayPT) return [];
    const staleIds = new Set(
      cards
        .filter((card) => isStaleEventCard(card, nowMinutes, planDateISO, todayPT))
        .map((card) => card.id),
    );
    return filterAtomicPairCards(cards, staleIds);
  })();
  // Group cards by bucket for the 2×3 grid. Cards from before the bucket
  // cutover (2026-05-07) only have a clock-range timeBlock; infer a bucket
  // from the start time so they render in the grid instead of the legacy
  // orphan list. Genuinely bucket-less cards still fall through.
  const cardsByBucket = new Map<Bucket, DayCard>();
  const orphanCards: DayCard[] = [];
  for (const c of visibleCards) {
    const bucket: Bucket | null = isBucket(c.bucket)
      ? c.bucket
      : inferBucketFromTimeBlock(c.timeBlock, c.category);
    if (bucket) {
      if (!cardsByBucket.has(bucket)) cardsByBucket.set(bucket, c);
      else orphanCards.push(c);
    } else {
      orphanCards.push(c);
    }
  }
  const isPastBucket = (b: Bucket): boolean => {
    if (planDateISO !== todayPT) return false;
    const cutoffHour = BUCKET_PASSED_AFTER_HOUR[b];
    return Math.floor(nowMinutes / 60) >= cutoffHour;
  };
  const visibleBuckets = BUCKET_ORDER;

  const isTomorrowPlan = planDateISO > getTodayISOInPT();
  const shareVisible = visibleCards.length > 1;
  // Keyed by the cards on screen: a kids-toggle or stale-event drop swaps
  // the plan without a loading pass, and a cached share link from the old
  // plan must not survive that.
  const shareKey = visibleCards.map((c) => c.id).join("|");

  return (
    <div className="sbt-home-shell">
      {/* 5-day forecast strip */}
      <ForecastCard homeCity={displayCity} />

      {/* Headline + actions
       *  Headline is the focal point — it's the actual reason the user is
       *  here. Actions row sits directly beneath so the buttons read as
       *  responses to the question, not a stray toolbar. The 48px clock
       *  display lived here previously but wasn't earning its space (the
       *  masthead already carries the date, and the user's device shows
       *  the time). */}
      <div className="sbt-hero">
        <h1 className="sbt-hero-title">{headline}</h1>
        <div className="sbt-hero-actions">
          {/* Kids toggle — segmented control */}
          <div role="group" aria-label="Audience" className="sbt-seg" data-kids={state.kids ? "true" : "false"}>
            <button type="button" className="sbt-seg-btn" aria-pressed={!state.kids} onClick={() => { if (state.kids) handleKidsToggle(); }}>No kids</button>
            <button type="button" className="sbt-seg-btn" aria-pressed={state.kids} onClick={() => { if (!state.kids) handleKidsToggle(); }}>Kids</button>
          </div>
          <div className="sbt-hero-btns">
            {/* New Plan */}
            <button
              type="button"
              onClick={handleNewPlan}
              disabled={loading}
              aria-busy={loading || undefined}
              className={`sb-btn sb-btn--primary sbt-hero-shuffle${loading ? " is-loading" : ""}`}
            >
              Reshuffle <span className="sbt-hero-shuffle-icon" aria-hidden="true">↻</span>
            </button>
            {/* Share — only when there's a plan worth sharing. While a
                reshuffle is in flight it unmounts (its cached link belongs to
                the old plan); a same-size ghost holds its spot so the row
                doesn't reflow. */}
            {shareVisible && !loading && (
              <ShareButton key={shareKey} cards={visibleCards} city={planCity} kids={state.kids} weather={weather} compact />
            )}
            {shareVisible && loading && (
              <span className="sb-btn sbt-hero-share" aria-hidden="true" style={{ visibility: "hidden" }}>Share ↗</span>
            )}
          </div>
        </div>
      </div>

      {/* Photo scroll */}
      <div className="sbt-strip-frame">
        <PhotoStrip />
      </div>

      {/* Empty state — shown on error OR when planner returned zero cards.
          Instead of a dead end, give the user a weather snapshot + a handful
          of always-good options + the Events tab so they have somewhere to
          land. */}
      {(error || (!loading && visibleCards.length === 0)) && (
        <div className="sbt-plan-empty">
          <p className="sbt-plan-empty-title">
            {error
              ? "The plan didn't load. Try one of these classics."
              : cards.length > 0
                ? "That's a wrap on today's plan. Shuffle for tomorrow, or try a classic."
                : "Nothing in the pool right now. Try one of these classics."}
          </p>
          {error && <p className="sbt-plan-empty-note">{error}</p>}
          {weather && <p className="sbt-plan-empty-weather">{weather}</p>}
          <ul className="sbt-plan-empty-list">
            <li>
              <strong>Walk downtown Los Gatos.</strong> Start at a local coffee counter, browse N Santa Cruz Ave, then follow the busiest lunch patio.
            </li>
            <li>
              <strong>Computer History Museum + Shoreline.</strong> Hit the permanent exhibits, then walk the lake trail for an hour.
            </li>
            <li>
              <strong>Santana Row stroll + dinner.</strong> Window-shop the open-air blocks, pick any of the patios for dinner.
            </li>
          </ul>
          <div className="sbt-plan-empty-actions">
            <button type="button" onClick={handleNewPlan} className="sb-btn">Try again</button>
            <button type="button" onClick={() => _props.onNavigate("events")} className="sb-btn sb-btn--primary">Browse events →</button>
          </div>
        </div>
      )}

      {/* Loading — skeleton cards in the grid's own shape, typing verb on top */}
      {loading && visibleCards.length === 0 && (
        <div className="sbt-plan-loading">
          <LoadingVerb />
          <div className="sbt-plan-grid" aria-hidden="true">
            {BUCKET_ORDER.map((b) => <PlanSkeleton key={b} />)}
          </div>
        </div>
      )}

      {/* ═══ BUCKET GRID ═══ */}
      {visibleCards.length > 0 && (
        <div className={`sbt-plan-grid${loading ? " is-loading" : ""}`} aria-busy={loading || undefined}>
          {visibleBuckets.map((bucket, i) => {
            const card = cardsByBucket.get(bucket);
            if (!card) return null;
            if (isPastBucket(bucket)) return null;
            const accent = ACCENT_COLORS[Math.floor(i / 2) % ACCENT_COLORS.length];
            return (
              <BucketSlot
                key={bucket}
                bucket={bucket}
                card={card}
                accent={accent}
                animationDelay={i * 0.05}
                isTomorrow={isTomorrowPlan}
              />
            );
          })}
          {orphanCards.length > 0 && (
            <div className="sbt-plan-orphans">
              {orphanCards.map((card, i) => {
                const accent = ACCENT_COLORS[i % ACCENT_COLORS.length];
                const emoji = CATEGORY_EMOJI[card.category] || "📍";
                const cardUrl = card.source === "event" ? (card.url || card.mapsUrl) : (card.mapsUrl || card.url);
                return (
                  <div key={card.id} className="sbt-plan-card" style={{ "--sbt-pair": accent } as CSSProperties}>
                    <span className="sbt-plan-orphan-bar" aria-hidden="true" />
                    <CardInner card={card} emoji={emoji} cardUrl={cardUrl} showTimeLabel showEventTag />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Newsletter inline strip — sits right under the bucket grid and
          aligns with the bucket-grid edges. Spans the full grid width with
          a two-column inner layout (serif headline left, form right) so
          the extra width carries type, not a giant email field. */}
      {visibleCards.length > 0 && (
        <div className="sbt-home-news">
          <div className="sbt-news-card">
            <NewsletterSignup variant="inline" />
          </div>
        </div>
      )}

      {/* Weekend ahead — curated picks for the upcoming Sat/Sun, visible
          Tue–Sun. Sits between the day's plan and the regional chatter so a
          resident scrolling the homepage sees "today" → "this weekend" →
          "what people are talking about" in that natural order. */}
      <WeekendAheadCard onNavigate={_props.onNavigate} />

      {/* Reddit pulse — what people are saying on regional subs */}
      <RedditPulseTeaser />

      {/* Browse-by-city navigation. Not a teaser — a navigation row that links
          to per-city pages (/city/[slug]) for residents who want their own
          town's day plan, events, and chatter. Inline JSX, no new local
          import, so the home-locked guardrail stays satisfied. */}
      <nav aria-label="Browse by city" className="sbt-home-section sbt-home-cities">
        <div className="sb-section-header sbt-home-head">
          <h2 className="sb-section-title">Or browse by city</h2>
        </div>
        <div className="sbt-city-pills">
          {CITIES.filter((c) => c.id !== "santa-cruz").map((c) => (
            <a key={c.id} href={`/city/${c.id}`} className="sbt-city-pill">
              <span className="sbt-city-pill-mono" aria-hidden="true">
                {cityMonogram(c.name)}
              </span>
              <span>{c.name}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 2-letter monogram for the city-pill badges. Multi-word cities use the
// initials of the first two words; single-word cities use the first two
// letters of the name (uppercased).
function cityMonogram(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// CardInner — shared inner layout for list cards
// ---------------------------------------------------------------------------

interface UnsplashPhoto {
  url: string;
  photographer: string;
  photographerUrl: string;
  unsplashUrl: string;
}

function CardInner({
  card,
  emoji,
  cardUrl,
  showTimeLabel = false,
  showEventTag = false,
}: {
  card: DayCard;
  emoji: string;
  /** The card's link. The Unsplash credit renders after it, since links can't nest. */
  cardUrl?: string | null;
  showTimeLabel?: boolean;
  /** Bucket cards carry the EVENT tag in their header; header-less legacy
   *  cards show it in the meta row instead. */
  showEventTag?: boolean;
}) {
  const [unsplash, setUnsplash] = useState<UnsplashPhoto | null>(null);
  const cardName = cleanDisplayName(card.name) || "";
  const cardBlurb = cleanDisplayCopy(card.blurb) || "";
  const cardVenue = cleanDisplayName(card.venue) || "";

  useEffect(() => {
    // Skip Unsplash if we already have a photo from ingest (image URL) or Places (photoRef).
    if (card.photoRef || card.image) return;
    fetch(`/api/unsplash-photo?query=${encodeURIComponent(card.category)}`)
      .then((r) => r.json())
      .then((d: UnsplashPhoto) => { if (d.url) setUnsplash(d); })
      .catch(() => {});
  }, [card.id, card.category, card.photoRef, card.image]);

  // Photo preference is unchanged (ingest image → Places photo → Unsplash);
  // a source that 404s now falls through to the next one, then to the
  // category emoji, instead of leaving an empty box.
  const usingUnsplash = !card.photoRef && !card.image && !!unsplash;
  const photoSources = [
    card.image || null,
    card.photoRef ? `/api/place-photo?ref=${encodeURIComponent(card.photoRef)}&w=200&h=200` : null,
    usingUnsplash && unsplash ? unsplash.url : null,
  ].filter((s): s is string => !!s);

  // Time hint shown beside the category label. Events ALWAYS show a time
  // — it's a defining property of the card. Fall back to timeBlock when
  // eventTime is missing on legacy cards. Non-event cards opt in via
  // showTimeLabel; bucket-grid place cards leave it off because the slot
  // header (BREAKFAST / MORNING / etc.) already carries the time signal.
  // Only render a hint that contains a digit — if eventTime/timeBlock
  // ended up holding a bucket label (e.g. "Lunch"), the slot header
  // already says it, so swallow the dupe.
  const rawTimeHint = card.source === "event"
    ? (card.eventTime || card.timeBlock || "")
    : (showTimeLabel ? card.timeBlock : "");
  const timeHint = /\d/.test(rawTimeHint) ? rawTimeHint : "";
  const isEvent = card.source === "event";
  const showCategory = !(isEvent && card.category === "events");
  const eventTagInMeta = showEventTag && isEvent;

  const content = (
    <>
      {/* Thumbnail column */}
      <div className="sbt-plan-thumbcol">
        <PlanThumb key={photoSources.join("|")} sources={photoSources} emoji={emoji} />
      </div>
      {/* Content */}
      <div className="sbt-plan-body">
        {(timeHint || showCategory || card.city || eventTagInMeta) && (
          <div className="sbt-plan-meta">
            {timeHint && <span className="sbt-plan-time">{timeHint}</span>}
            {showCategory && <span className="sbt-plan-cat">{card.category}</span>}
            {card.city && <span>{cityLabel(card.city)}</span>}
            {eventTagInMeta && <span className="sbt-plan-badge sbt-plan-badge--event">Event</span>}
          </div>
        )}
        <h3 className="sbt-plan-title">{cardName}</h3>
        {isEvent && cardVenue && (
          <div className="sbt-plan-venue">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>{cardVenue}</span>
          </div>
        )}
        <p className="sbt-plan-blurb">{cardBlurb}</p>
      </div>
    </>
  );

  return (
    <>
      {cardUrl ? (
        <a href={cardUrl} target="_blank" rel="noopener noreferrer" className="sbt-plan-link">{content}</a>
      ) : (
        <div className="sbt-plan-link">{content}</div>
      )}
      {/* Unsplash attribution, only when the photo came from Unsplash. */}
      {usingUnsplash && unsplash && (
        <div className="sbt-plan-credit">
          <a href={unsplash.photographerUrl} target="_blank" rel="noopener noreferrer">{unsplash.photographer}</a>
          {" · "}
          <a href={unsplash.unsplashUrl} target="_blank" rel="noopener noreferrer">Unsplash</a>
        </div>
      )}
    </>
  );
}

/** Card thumbnail: warm placeholder while loading, fade-in on load, next
 *  source (then the category emoji) on error.
 *
 *  The <img> only mounts client-side, after the view's post-hydration
 *  refine. The server-rendered plan is the build day's "today" plan; in
 *  the evening (tomorrow flip) or in kids mode the refine swaps it for a
 *  different plan immediately, and server-rendered thumbnails for the old
 *  plan (one was an 895 KB PNG) would download for nothing and hold up
 *  the page's `load` event. This effect runs in the same flush as the
 *  parent's refine effect, so the swap and the reveal land in one render
 *  and only the plan actually on screen is fetched. */
function PlanThumb({ sources, emoji }: { sources: string[]; emoji: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const src = sources.find((s) => !failed.includes(s));

  useEffect(() => { setMounted(true); }, []);

  const markFailed = useCallback((bad: string) => {
    setFailed((f) => (f.includes(bad) ? f : [...f, bad]));
  }, []);

  // A cached image can be complete (or already broken) the moment it's
  // created; catch that before paint instead of waiting on the event.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || !src) return;
    if (img.complete) {
      if (img.naturalWidth > 0) setPhase("ready");
      else markFailed(src);
    } else {
      setPhase("loading");
    }
  }, [src, mounted, markFailed]);

  if (!src) {
    return <span className="sbt-plan-thumb sbt-ph sbt-plan-thumb--fallback" aria-hidden="true">{emoji}</span>;
  }
  if (!mounted) {
    return <span className="sbt-plan-thumb sbt-ph" />;
  }
  return (
    <span className={`sbt-plan-thumb sbt-ph${phase === "loading" ? " is-loading" : ""}`}>
      <img
        ref={imgRef}
        src={src}
        alt=""
        width={84}
        height={84}
        loading="lazy"
        decoding="async"
        className={`sbt-img ${phase === "ready" ? "is-ready" : "is-pending"}`}
        onLoad={() => setPhase("ready")}
        onError={() => markFailed(src)}
      />
    </span>
  );
}

/** Single-bucket cell in the homepage grid. Past buckets dim. Empty buckets
 *  are filtered out upstream — never render a placeholder here. */
interface BucketSlotProps {
  bucket: Bucket;
  card: DayCard;
  accent: string;
  animationDelay: number;
  isTomorrow: boolean;
}

function BucketSlot({ bucket, card, accent, animationDelay, isTomorrow }: BucketSlotProps) {
  const emoji = CATEGORY_EMOJI[card.category] || "📍";
  const cardUrl = card.source === "event" ? (card.url || card.mapsUrl) : (card.mapsUrl || card.url);
  const isEvent = card.source === "event";
  return (
    <article
      className={`sbt-plan-card${card.role ? ` sbt-plan-card--${card.role}` : ""}`}
      style={{ "--sbt-pair": accent, animationDelay: `${animationDelay}s` } as CSSProperties}
    >
      <div className="sbt-plan-head">
        <span className="sbt-plan-dot" aria-hidden="true" />
        <span className="sbt-plan-slot">{BUCKET_LABELS[bucket]}</span>
        {(isEvent || card.role) && (
          <span className="sbt-plan-badges">
            {isEvent && <span className="sbt-plan-badge sbt-plan-badge--event">Event</span>}
            {card.role && (
              <span className={`sbt-plan-badge sbt-plan-badge--${card.role}`}>
                {card.role === "pillar" ? (isTomorrow ? "Tomorrow’s pick" : "Today’s pick") : "Nearby"}
              </span>
            )}
          </span>
        )}
      </div>
      <CardInner card={card} emoji={emoji} cardUrl={cardUrl} />
    </article>
  );
}

/** Loading placeholder in the exact shape of a plan card. */
function PlanSkeleton() {
  return (
    <div className="sbt-plan-card sbt-plan-card--skeleton">
      <div className="sbt-plan-head">
        <span className="sb-skeleton" style={{ width: 104, marginBottom: 0 }} />
      </div>
      <div className="sbt-plan-link">
        <div className="sbt-plan-thumbcol">
          <span className="sbt-plan-thumb sbt-ph is-loading" />
        </div>
        <div className="sbt-plan-body">
          <span className="sb-skeleton" style={{ width: "42%" }} />
          <span className="sb-skeleton" style={{ width: "78%", height: 18 }} />
          <span className="sb-skeleton" style={{ width: "96%" }} />
          <span className="sb-skeleton" style={{ width: "64%" }} />
        </div>
      </div>
    </div>
  );
}

/** Sort-key for the API response — bucket order if present, fallback by
 *  legacy clock-time parse so old shared-plan cards still order. */
function bucketSortIndex(c: DayCard): number {
  if (isBucket(c.bucket)) return BUCKET_ORDER.indexOf(c.bucket);
  // Legacy: parse clock-time for orphan plans.
  const m = c.timeBlock?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 99;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  // Map clock-time to bucket-equivalent position.
  return 100 + h * 60 + min;
}

/** Minutes since midnight, in America/Los_Angeles. */
function getNowMinutesPT(): number {
  const hhmm = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

/** YYYY-MM-DD in America/Los_Angeles. */
function getTodayISOInPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/** Parse a clock string like "6:30 AM" or "19:30" into minutes since
 *  midnight. Returns null on unparseable input. */
function parseClockMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const ampm = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (ampm[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (ampm[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const mil = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (mil) return parseInt(mil[1], 10) * 60 + parseInt(mil[2], 10);
  return null;
}

/** Default duration assumed for events with no explicit end time. Long
 *  enough to cover most concerts, classes, and morning programs without
 *  hiding things prematurely; short enough that a 6:30 AM event is gone
 *  by 10 AM. */
const DEFAULT_EVENT_DURATION_MIN = 180;
const EVENT_STALENESS_GRACE_MIN = 30;

/** True if this is an event card whose end time (real or inferred) is
 *  far enough in the past that it should drop off the homepage. Place
 *  cards never go stale; future-day plans never go stale. */
function isStaleEventCard(
  card: DayCard,
  nowMinutes: number,
  planDateISO: string,
  todayPT: string,
): boolean {
  if (card.source !== "event") return false;
  if (planDateISO !== todayPT) return false;
  const startMin = parseClockMinutes(card.eventTime);
  if (startMin === null) return false;
  const endMin =
    parseClockMinutes(card.eventEndTime) ??
    startMin + DEFAULT_EVENT_DURATION_MIN;
  return nowMinutes > endMin + EVENT_STALENESS_GRACE_MIN;
}

const LOADING_VERBS = [
  "Planning", "Mapping out", "Dreaming up", "Cooking up",
  "Piecing together", "Scouting", "Curating", "Lining up", "Sketching out",
  "Assembling", "Rounding up", "Whipping up", "Mixing up", "Building",
  "Brainstorming", "Crafting", "Shuffling", "Dialing in", "Sorting out",
];

function LoadingVerb() {
  const [verbIdx, setVerbIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const verb = LOADING_VERBS[verbIdx % LOADING_VERBS.length];
    const full = `${verb} your day...`;

    if (!deleting && charIdx < full.length) {
      const t = setTimeout(() => setCharIdx((c) => c + 1), 40 + Math.random() * 30);
      return () => clearTimeout(t);
    }
    if (!deleting && charIdx >= full.length) {
      const t = setTimeout(() => setDeleting(true), 1200);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx > 0) {
      const t = setTimeout(() => setCharIdx((c) => c - 1), 20);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx === 0) {
      setDeleting(false);
      setVerbIdx((v) => v + 1);
    }
  }, [charIdx, deleting, verbIdx]);

  const verb = LOADING_VERBS[verbIdx % LOADING_VERBS.length];
  const full = `${verb} your day...`;
  const display = full.slice(0, charIdx);

  // The typing text is decorative; screen readers get one steady status.
  return (
    <div role="status">
      <span className="sbt-sr">Planning your day…</span>
      <p className="sbt-loading-verb" aria-hidden="true">
        {display}<span className="sbt-loading-caret">|</span>
      </p>
    </div>
  );
}

function ShareButton({ cards, city, kids, weather, compact }: { cards: DayCard[]; city: string; kids: boolean; weather: string | null; compact?: boolean }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (shareUrl) {
      // Already have a URL — just copy/share it
      await doShare(shareUrl);
      return;
    }
    setSharing(true);
    try {
      const res = await fetch("/api/share-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards, city, kids, weather }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setShareUrl(data.url);
      await doShare(data.url);
    } catch {
      // Silently fail
    } finally {
      setSharing(false);
    }
  };

  const doShare = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "My day plan — South Bay Today", url });
        return;
      } catch {}
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        title="Share this plan"
        aria-label={copied ? "Link copied" : "Share this plan"}
        className={`sb-btn sbt-hero-share${copied ? " is-copied" : ""}`}
      >
        {copied ? "Copied ✓" : sharing ? "…" : "Share ↗"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={sharing}
      className={`sb-btn sb-btn--quiet sbt-hero-share${copied ? " is-copied" : ""}`}
    >
      {copied ? "Link copied!" : sharing ? "Creating link..." : "Share this plan ↗"}
    </button>
  );
}
