// ---------------------------------------------------------------------------
// South Bay Today — City Page
// ---------------------------------------------------------------------------
// Mini-homepage for a single city: today's events, next meeting, briefing,
// recent civic actions, and links back to the main site.
//
// Styles: src/styles/sbt/city.css (loaded site-wide by BaseLayout). Classes
// here are `city-` prefixed, except the shared pieces: section heads use
// `.sb-section-header` / `.sb-section-title` (chrome.css) and the day plan
// uses the homepage's `.sbt-plan-*` / `.sbt-hero` markup (home.css).

import { Fragment, useState, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import type { City } from "../../../lib/south-bay/types";
import { CITY_MAP } from "../../../lib/south-bay/cities";
import { isVirtualEvent } from "../../../lib/south-bay/eventFilters.mjs";
import {
  TODAY_ISO, NOW_PT,
  startMinutes, formatTimeRange, hasNotStarted,
  formatAge,
} from "../../../lib/south-bay/timeHelpers";
import {
  type Bucket, BUCKET_ORDER, BUCKET_LABELS,
  isBucket, inferBucketFromTimeBlock,
} from "../../../lib/south-bay/buckets";

import upcomingMeetingsJson from "../../../data/south-bay/upcoming-meetings.json";
import digestsJson from "../../../data/south-bay/digests.json";
import redditPulseJson from "../../../data/south-bay/reddit-pulse.json";
import openNowCandidatesJson from "../../../data/south-bay/open-now-candidates.json";
import { isPlaceTemporarilyUnavailable } from "../../../lib/south-bay/placeAvailability.mjs";
import { openCampCountForCity } from "../../../lib/south-bay/cityCamps";
import { cleanDisplayCopy, cleanDisplayName } from "../../../lib/south-bay/displayText.mjs";

import Masthead from "../Masthead";
import SiteFooter from "../SiteFooter";
import NewsletterSignup from "../NewsletterSignup";
import ForecastCard from "../cards/ForecastCard";
import PhotoStrip from "../homepage/PhotoStrip";

// ── Types ──

type UpcomingEvent = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  endTime?: string | null;
  venue: string;
  city: string;
  category: string;
  cost: string;
  url?: string | null;
  source: string;
  kidFriendly: boolean;
  virtual?: boolean;
  ongoing?: boolean;
  blurb?: string | null;
  description?: string | null;
};

// ── Category emoji ──

const CAT_EMOJI: Record<string, string> = {
  music: "🎵", arts: "🎨", family: "👨‍👩‍👦", education: "📚", community: "🤝",
  market: "🌽", food: "🍜", outdoor: "🌿", sports: "🏟️",
};

// ── Agenda items helpers ──
//
// upcoming-meetings.json already runs SKIP_PREFIXES/SKIP_STARTS_WITH/SKIP_REGEX
// at scrape time, but we run a second pass on the client so the panel never
// shows obvious closed-session boilerplate even if a city's filter coverage
// drifts. Be conservative — only drop items we're certain are non-substantive.
type AgendaItem = { title: string; sequence: number };

const CLIENT_AGENDA_DROP_RE = [
  /^conference with (?:legal counsel|real property|labor)/i,
  /^closed session/i,
  /^public hearing\b/i,
  /^approval of (?:the )?(?:[a-z\d ,]+ )?(?:meeting )?minutes\b/i,
];

function trimAgendaTitle(t: string): string {
  // Strip "Subject:" wrapper that some cities prepend
  let s = t.replace(/^subject:\s*/i, "").trim();
  // Drop trailing California Government Code references
  s = s.replace(/\s*\((?:california\s+)?government\s+code\s*[^)]*\)\s*$/i, "").trim();
  // Cap length so the panel doesn't blow up on a paragraph-length item
  if (s.length > 140) s = s.slice(0, 137) + "…";
  return s;
}

function filterAgendaItems(items: AgendaItem[] | undefined): AgendaItem[] {
  if (!items) return [];
  return items.filter((it) => {
    const t = (it.title || "").trim();
    if (t.length < 12) return false;
    return !CLIENT_AGENDA_DROP_RE.some((re) => re.test(t));
  });
}

// ── Images ──
//
// <img> that fades in once decoded. The ref check covers images that finish
// loading before React attaches onLoad (cached files), so nothing can get
// stuck invisible. Callers pass key={src} so state resets per source.
function FadeImg({ src, onError }: { src: string; onError: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={loaded ? "is-loaded" : undefined}
      ref={(el) => {
        if (el && !loaded && el.complete && el.naturalWidth > 0) setLoaded(true);
      }}
      onLoad={() => setLoaded(true)}
      onError={onError}
    />
  );
}

// ── Props ──

type Props = {
  cityId: string;
  cityName: string;
};

export default function CityPage({ cityId, cityName }: Props) {
  const [upcomingData, setUpcomingData] = useState<{ events: UpcomingEvent[]; generatedAt?: string } | null>(null);

  useEffect(() => {
    // City pages only render today/tomorrow/this-weekend, so the 14-day near
    // feed (~40% of the full payload) covers everything they show.
    fetch("/api/south-bay/upcoming-events-near")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setUpcomingData(d ?? { events: [] }))
      .catch(() => setUpcomingData({ events: [] }));
  }, []);

  // ── Events ── (per-day filtering happens inside CityEventsBlock)
  const allEvents = upcomingData?.events ?? [];
  const eventsGenAt = upcomingData?.generatedAt;

  // ── Meeting ──
  const meetings = (upcomingMeetingsJson as unknown as { meetings: Record<string, any> }).meetings ?? {};
  const nextMeeting = meetings[cityId];

  // ── Digest ──
  const digest = (digestsJson as Record<string, any>)[cityId];

  // "Tonight" highlight and digest staleness both depend on the visitor's
  // clock, which the build-time render can't know. First render uses neutral
  // values derived only from the JSON (not tonight; digest fresh if it has a
  // date, hidden if not) so server and client HTML match; the mount effect
  // applies the real clock. Worst case is a one-frame style/visibility tweak
  // in the bottom-of-page civic panel.
  const [meetingIsToday, setMeetingIsToday] = useState(false);
  // The meetings JSON is baked in at build time, so by the next morning its
  // "next" meeting can already be over. Drop it once the date has passed
  // rather than calling yesterday's meeting "Next meeting".
  const [meetingIsPast, setMeetingIsPast] = useState(false);
  const [digestAge, setDigestAge] = useState<number>(() => (digest?.meetingDateIso ? 0 : 999));
  useEffect(() => {
    setMeetingIsToday(nextMeeting?.date === TODAY_ISO);
    setMeetingIsPast(!!nextMeeting?.date && nextMeeting.date < TODAY_ISO);
    setDigestAge(
      digest?.meetingDateIso
        ? (Date.now() - new Date(digest.meetingDateIso).getTime()) / 86400000
        : 999,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  // ── City config ──
  const city = CITY_MAP[cityId as City];

  return (
    <>
      {/* Site-wide masthead + tab nav — same chrome as the main homepage so
          city pages feel like a scoped variant rather than a one-off
          sub-page. Activetab is null because city pages aren't a tab. */}
      <Masthead activeTab={null} />

      {/* City content — mirrors the homepage container width (800px) so the
          bucket grid + forecast strip land at homepage proportions. */}
      <main id="main-content" className="city-main">
        {/* City name. The old "☀️ Tomorrow: sunny, high 88°" line under it was
            weatherProvider's summaryLine — built from forecast[0], the exact
            day the forecast strip below opens with — so it was dropped. The
            events freshness stamp it carried now sits with the events. */}
        <header className="city-hero">
          <p className="sb-eyebrow city-hero-kicker">Your city</p>
          <h1 className="city-hero-title">{cityName}</h1>
          <span className="city-hero-rule" aria-hidden="true" />
        </header>

        {/* Camps pointer — one-line nudge to /camps, only when this city has
            a program still running this summer. Renders nothing otherwise. */}
        <CityCampsPointer cityId={cityId} cityName={cityName} />

        {/* 5-day forecast strip — same component the homepage uses. */}
        <div className="city-forecast">
          <ForecastCard homeCity={cityId as City} />
        </div>

        {/* Photo scroll — same curated Flickr marquee as the homepage, scoped
            to this city (falls back to the full South Bay pool when the
            city's tagged photo count is too thin for a seamless loop). */}
        <div className="city-photos">
          <PhotoStrip cityFilter={cityId} />
        </div>

        {/* ═══ YOUR DAY ═══ */}
        <CityDayPlan cityId={cityId as City} cityName={cityName} />

        {/* ═══ EVENTS (Today / Tomorrow / This Weekend) ═══ */}
        <CityEventsBlock
          events={allEvents}
          loading={upcomingData === null}
          generatedAt={eventsGenAt}
          cityId={cityId}
          cityName={cityName}
        />

        {/* ═══ THE CONVERSATION (Reddit tiles) ═══ */}
        <CityRedditTiles cityId={cityId} cityName={cityName} />

        {/* ═══ OPEN RIGHT NOW — randomized "oh yeah, THAT place" panel ═══ */}
        <CityOpenNow cityId={cityId} cityName={cityName} />

        {/* ═══ AT CITY HALL — pinned to the bottom; next meeting + last digest
            side-by-side. */}
        <CityHallPanel
          cityId={cityId}
          nextMeeting={meetingIsPast ? null : nextMeeting}
          meetingIsToday={meetingIsToday}
          digest={digest}
          digestAge={digestAge}
        />

        {/* ═══ BACK ROW ═══ */}
        <nav className="city-backrow" aria-label="Leave this city page">
          <a href="/" className="sb-btn sb-btn--quiet">
            ← South Bay Today
          </a>
          {city?.website && (
            <a href={city.website} target="_blank" rel="noopener noreferrer" className="sb-btn sb-btn--quiet">
              {cityName} official site ↗
            </a>
          )}
        </nav>
      </main>

      <SiteFooter>
        <NewsletterSignup variant="minimal" />
      </SiteFooter>
    </>
  );
}


// ---------------------------------------------------------------------------
// City Camps Pointer — one-line nudge to /camps, only when this city has a
// program still open this summer. Colors match CampsView's own "mix it up"
// tip banner (#fffbeb/#fde68a/#92400e) so the cross-link feels like it comes
// from the same page it's pointing to, not a bolted-on ad.
// ---------------------------------------------------------------------------

function CityCampsPointer({ cityId, cityName }: { cityId: string; cityName: string }) {
  const count = openCampCountForCity(cityId);
  if (count === 0) return null;

  return (
    <a href="/camps" className="city-camps">
      <span aria-hidden="true">🏕️</span>
      <span>{count} camp{count === 1 ? "" : "s"} still open in {cityName} this summer</span>
      <span aria-hidden="true" className="city-camps-arrow">→</span>
    </a>
  );
}

// ── Event Row ──

function EventRow({ event }: { event: UpcomingEvent }) {
  const time = formatTimeRange(event.time, event.endTime);
  const emoji = CAT_EMOJI[event.category] ?? "📅";
  // A bare venue on a city page reads as "here, in this city" — say Online
  // first when the event has no physical location.
  const online = isVirtualEvent(event);

  const inner = (
    <>
      <span className="city-event-icon" aria-hidden="true">{emoji}</span>
      <span className="city-event-body">
        <span className="city-event-title">{event.title}</span>
        {/* Plain text flow, not flex: a long venue wraps inside itself and
            the no-break space keeps each "·" glued to what precedes it. */}
        <span className="city-event-meta">
          {time && <span className="city-event-time">{time}</span>}
          {online && (
            <>
              {time && <span className="city-event-dot" aria-hidden="true">{"\u00a0· "}</span>}
              <span className="city-event-online">Online</span>
            </>
          )}
          {event.venue && (
            <>
              {(time || online) && <span className="city-event-dot" aria-hidden="true">{"\u00a0· "}</span>}
              {event.venue}
            </>
          )}
        </span>
      </span>
      {event.cost === "free" && <span className="city-event-tag city-event-tag--free">Free</span>}
    </>
  );

  return (
    <li className="city-event">
      {event.url ? (
        <a href={event.url} target="_blank" rel="noopener noreferrer" className="city-event-link">{inner}</a>
      ) : (
        <div className="city-event-link">{inner}</div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// City Day Plan — the homepage's six-card plan, scoped to one city
// ---------------------------------------------------------------------------
//
// Markup and classes are the homepage's own (SouthBayTodayView: BucketSlot,
// CardInner, PlanThumb, PlanSkeleton, LoadingVerb), styled by the shared
// `.sbt-plan-*` rules in home.css, so the plan reads the same on `/` and on
// `/city/<slug>`. Two city-only differences: the Unsplash credit sits after
// the card link instead of inside it (links can't nest), and a photo that
// fails falls through to an Unsplash category photo, as this page always has.

// One color per pillar + meal pair across the day, same as the homepage:
// morning → sunset, afternoon → coral, evening → purple.
const PAIR_COLORS = ["var(--sb-sunset)", "var(--sb-coral)", "var(--sb-accent)"];
const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍽️", outdoor: "🌿", museum: "🏛️", entertainment: "🎭",
  wellness: "💆", shopping: "🛍️", arts: "🎨", events: "📅",
  sports: "⚾", neighborhood: "🏘️",
};

type DayCard = {
  id: string; name: string; category: string; timeBlock: string;
  blurb: string; why: string;
  photoRef?: string | null;
  image?: string | null;
  url?: string | null; mapsUrl?: string | null;
  cost?: string | null; costNote?: string | null;
  bucket?: string;
  eventTime?: string | null;
  city?: string | null;
  venue?: string | null;
  source: "event" | "place";
  role?: "pillar" | "paired-meal";
  pairedWithId?: string | null;
  pairDistanceMiles?: number | null;
};

// Rotating verbs for the loader — same set the homepage uses so the
// "Planning your day…" line carries the same personality across surfaces.
const PLAN_LOADING_VERBS = [
  "Planning", "Mapping out", "Dreaming up", "Cooking up",
  "Piecing together", "Scouting", "Curating", "Lining up", "Sketching out",
  "Assembling", "Rounding up", "Whipping up", "Mixing up", "Building",
  "Brainstorming", "Crafting", "Shuffling", "Dialing in", "Sorting out",
];

/** The homepage's typing loader. Screen readers get one steady status line;
 *  reduced-motion readers get the same line on screen instead of typing
 *  (read after mount so the server and first client render match). */
function PlanLoadingVerb() {
  const [verbIdx, setVerbIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  useEffect(() => {
    if (still) return;
    const verb = PLAN_LOADING_VERBS[verbIdx % PLAN_LOADING_VERBS.length];
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
  }, [charIdx, deleting, verbIdx, still]);

  const verb = PLAN_LOADING_VERBS[verbIdx % PLAN_LOADING_VERBS.length];
  const display = `${verb} your day...`.slice(0, charIdx);

  return (
    <div role="status">
      <span className="sbt-sr">Planning your day…</span>
      <p className="sbt-loading-verb" aria-hidden="true">
        {still ? "Planning your day…" : (
          <>{display}<span className="sbt-loading-caret">|</span></>
        )}
      </p>
    </div>
  );
}

// Friendly city slug → display label ("los-gatos" → "Los Gatos").
function cityLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  const city = CITY_MAP[slug as City];
  if (city) return city.name;
  return slug.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ");
}

interface UnsplashPhoto {
  url: string;
  photographer: string;
  photographerUrl: string;
  unsplashUrl: string;
}

/** Photo tiers for a plan card: ingest image → Places photo → Unsplash
 *  category photo → emoji tile. <img onError> advances a tier, so expired
 *  Places photoRefs (common) fall through instead of rendering broken. */
function useCardPhoto(card: DayCard) {
  const [unsplash, setUnsplash] = useState<UnsplashPhoto | null>(null);
  const [tier, setTier] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/unsplash-photo?query=${encodeURIComponent(card.category)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: UnsplashPhoto | null) => { if (!cancelled && d?.url) setUnsplash(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [card.category]);

  const sources: Array<{ url: string; isUnsplash: boolean }> = [];
  if (card.image) sources.push({ url: card.image, isUnsplash: false });
  if (card.photoRef) sources.push({ url: `/api/place-photo?ref=${encodeURIComponent(card.photoRef)}&w=200&h=200`, isUnsplash: false });
  if (unsplash) sources.push({ url: unsplash.url, isUnsplash: true });
  const current = tier < sources.length ? sources[tier] : null;

  return {
    current,
    credit: current?.isUnsplash ? unsplash : null,
    advance: () => setTier((t) => t + 1),
  };
}

/** The homepage PlanThumb's markup: warm placeholder that shimmers while the
 *  photo loads, fade-in when it lands, category emoji when nothing is left.
 *  Callers key it by source so each tier starts fresh. */
function CityPlanThumb({ src, emoji, onError }: { src: string | null; emoji: string; onError: () => void }) {
  const [ready, setReady] = useState(false);
  if (!src) {
    return <span className="sbt-plan-thumb sbt-ph sbt-plan-thumb--fallback" aria-hidden="true">{emoji}</span>;
  }
  return (
    <span className={`sbt-plan-thumb sbt-ph${ready ? "" : " is-loading"}`}>
      <img
        src={src}
        alt=""
        width={84}
        height={84}
        loading="lazy"
        decoding="async"
        className={`sbt-img ${ready ? "is-ready" : "is-pending"}`}
        ref={(el) => {
          // A cached photo can finish before React attaches onLoad.
          if (el && !ready && el.complete && el.naturalWidth > 0) setReady(true);
        }}
        onLoad={() => setReady(true)}
        onError={onError}
      />
    </span>
  );
}

/** One slot of the 2×3 grid: the homepage BucketSlot + CardInner markup. */
function BucketSlot({ bucket, card, accent, animationDelay }: {
  bucket: Bucket;
  card: DayCard;
  accent: string;
  animationDelay: number;
}) {
  const cardUrl = card.source === "event" ? (card.url || card.mapsUrl) : (card.mapsUrl || card.url);
  const isEvent = card.source === "event";
  const emoji = CATEGORY_EMOJI[card.category] || "📍";
  const { current, credit, advance } = useCardPhoto(card);
  const cardName = cleanDisplayName(card.name) || "";
  const cardBlurb = cleanDisplayCopy(card.blurb) || "";
  const cardVenue = cleanDisplayName(card.venue) || "";

  // Events always show their time; place cards leave it to the slot label.
  // Only a hint with a digit counts, so a stray "Lunch" never echoes the slot.
  const rawTimeHint = isEvent ? (card.eventTime || card.timeBlock || "") : "";
  const timeHint = /\d/.test(rawTimeHint) ? rawTimeHint : "";
  const showCategory = !(isEvent && card.category === "events");

  const inner = (
    <>
      <div className="sbt-plan-thumbcol">
        <CityPlanThumb key={current?.url ?? "none"} src={current?.url ?? null} emoji={emoji} onError={advance} />
      </div>
      <div className="sbt-plan-body">
        {(timeHint || showCategory || card.city) && (
          <div className="sbt-plan-meta">
            {timeHint && <span className="sbt-plan-time">{timeHint}</span>}
            {showCategory && <span className="sbt-plan-cat">{card.category}</span>}
            {card.city && <span>{cityLabel(card.city)}</span>}
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
                {card.role === "pillar" ? "Today’s pick" : "Nearby"}
              </span>
            )}
          </span>
        )}
      </div>
      {cardUrl ? (
        <a href={cardUrl} target="_blank" rel="noopener noreferrer" className="sbt-plan-link">{inner}</a>
      ) : (
        <div className="sbt-plan-link">{inner}</div>
      )}
      {credit && (
        <div className="sbt-plan-credit">
          <a href={credit.photographerUrl} target="_blank" rel="noopener noreferrer">{credit.photographer}</a>
          {" · "}
          <a href={credit.unsplashUrl} target="_blank" rel="noopener noreferrer">Unsplash</a>
        </div>
      )}
    </article>
  );
}

/** Loading placeholder in the exact shape of a plan card (homepage markup). */
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

function CityDayPlan({ cityId, cityName }: { cityId: City; cityName: string }) {
  const [cards, setCards] = useState<DayCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/plan-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: cityId, scope: "city", kids: false, currentHour: new Date().getHours() }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.cards) setCards(d.cards); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cityId]);

  // Group cards by bucket. Same logic as the homepage: prefer card.bucket,
  // fall back to inferring from clock-range timeBlock for legacy plans.
  const cardsByBucket = new Map<Bucket, DayCard>();
  for (const c of cards) {
    const bucket: Bucket | null = isBucket(c.bucket)
      ? (c.bucket as Bucket)
      : inferBucketFromTimeBlock(c.timeBlock, c.category);
    if (bucket && !cardsByBucket.has(bucket)) cardsByBucket.set(bucket, c);
  }

  if (!loading && !cards.length) return null;

  return (
    <section className="city-plan" aria-labelledby="city-plan-heading">
      {/* The homepage's question panel, without its toolbar. */}
      <div className="sbt-hero city-plan-hero">
        <h2 id="city-plan-heading" className="sbt-hero-title">What should we do in {cityName} today?</h2>
      </div>

      {loading ? (
        <div className="sbt-plan-loading">
          <PlanLoadingVerb />
          <div className="sbt-plan-grid" aria-hidden="true">
            {BUCKET_ORDER.map((b) => <PlanSkeleton key={b} />)}
          </div>
        </div>
      ) : (
        <div className="sbt-plan-grid">
          {BUCKET_ORDER.map((bucket, i) => {
            const card = cardsByBucket.get(bucket);
            if (!card) return null;
            return (
              <BucketSlot
                key={bucket}
                bucket={bucket}
                card={card}
                accent={PAIR_COLORS[Math.floor(i / 2) % PAIR_COLORS.length]}
                animationDelay={i * 0.05}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// City Open Now — randomized "oh yeah, THAT place" panel.
// open-now-candidates.json holds ~30 top-rated places per city (rating ≥4.5,
// ratingCount ≥100). We filter to "open right now" per the user's PT clock,
// then shuffle the open set and pick 6. Each page mount yields a new random
// pick — purpose is variety, not consistency.
// ---------------------------------------------------------------------------

interface OpenNowCandidate {
  id: string;
  name: string;
  displayType: string | null;
  category: string | null;
  rating: number;
  ratingCount: number;
  priceLevel: number | null;
  hours: Record<string, string | undefined>;
  mapsUrl: string | null;
  url: string | null;
  photoRef?: string | null;
}

const OPEN_DAY_KEYS = ["sun","mon","tue","wed","thu","fri","sat"] as const;

const OPEN_CATEGORY_EMOJI: Record<string, string> = {
  food: "🍴",
  entertainment: "🎭",
  outdoor: "🌿",
  shopping: "🛍️",
  museum: "🏛️",
  wellness: "💆",
  arts: "🎨",
};

function parseClock(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function isOpenAt(hours: Record<string, string | undefined>, dayKey: string, mins: number): boolean {
  const range = hours[dayKey];
  if (!range) return false;
  const [openStr, closeStr] = range.split("-");
  const open = parseClock(openStr);
  const close = parseClock(closeStr);
  if (open == null || close == null) return false;
  // Handle past-midnight close: store closes at e.g. "02:00" tomorrow.
  if (close <= open) return mins >= open || mins < close;
  return mins >= open && mins < close;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function CityOpenNow({ cityId, cityName }: { cityId: string; cityName: string }) {
  // Random selection happens once per mount — pin it in state so React's strict
  // mode double-render in dev doesn't show two different sets.
  const [tick, setTick] = useState(0);
  // "Open right now" is inherently clock-and-random, so the server render
  // (and the matching first client render) shows nothing; the panel pops in
  // post-mount. It lives near the bottom of the page, so no visible jank.
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const allByCity = (openNowCandidatesJson as { cities?: Record<string, OpenNowCandidate[]> }).cities ?? {};
  const pool = (allByCity[cityId] ?? []).filter((place) => !isPlaceTemporarilyUnavailable(place));

  const picks = useMemo(() => {
    if (!ready || pool.length === 0) return [];
    const dayKey = OPEN_DAY_KEYS[NOW_PT.getDay()];
    const mins = NOW_PT.getHours() * 60 + NOW_PT.getMinutes();
    const open = pool.filter((p) => isOpenAt(p.hours, dayKey, mins));
    return shuffleInPlace([...open]).slice(0, 6);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, tick, ready]);

  // Venue photo per pick: real Places photo when the candidate carries a
  // photoRef, Unsplash category lookup only for the refless minority. A lone
  // pick renders as a wide spotlight card, so it asks for a larger photo.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  useEffect(() => {
    let cancelled = false;
    const size = picks.length === 1 ? "w=640&h=400" : "w=320&h=200";
    const base: Record<string, string> = {};
    const needsLookup = picks.filter((p) => {
      if (p.photoRef) {
        base[p.id] = `/api/place-photo?ref=${encodeURIComponent(p.photoRef)}&${size}`;
        return false;
      }
      return true;
    });
    setThumbs(base);
    setFailed({});
    Promise.all(needsLookup.map((p) => {
      const q = p.displayType || p.category || p.name;
      return fetch(`/api/unsplash-photo?query=${encodeURIComponent(q)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d?.url ? { id: p.id, url: d.url as string } : null)
        .catch(() => null);
    })).then((results) => {
      if (cancelled) return;
      const map: Record<string, string> = { ...base };
      for (const r of results) if (r) map[r.id] = r.url;
      setThumbs(map);
    });
    return () => { cancelled = true; };
  }, [picks]);

  if (picks.length === 0) return null;

  return (
    <section className="city-section" aria-labelledby="city-open-heading">
      <div className="sb-section-header city-section-head">
        <h2 id="city-open-heading" className="sb-section-title">Open Right Now</h2>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          aria-label="Shuffle the open spots"
          className="sb-btn sb-btn--quiet city-action"
        >
          Shuffle ↻
        </button>
      </div>

      <div className="city-open-grid" data-count={picks.length}>
        {picks.map((p) => {
          const emoji = (p.category && OPEN_CATEGORY_EMOJI[p.category]) || "📍";
          const thumb = failed[p.id] ? undefined : thumbs[p.id];
          const ratingCount = p.ratingCount >= 1000 ? `${Math.round(p.ratingCount / 100) / 10}k` : `${p.ratingCount}`;
          return (
            <a
              key={p.id}
              href={p.mapsUrl || p.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="city-open-card"
            >
              <span className="city-open-media" aria-hidden="true">
                {!thumb && emoji}
                {thumb && (
                  <FadeImg
                    key={thumb}
                    src={thumb}
                    onError={() => setFailed((f) => ({ ...f, [p.id]: true }))}
                  />
                )}
              </span>
              <div className="city-open-body">
                {p.displayType && <span className="city-open-kicker">{p.displayType}</span>}
                <h3 className="city-open-name">{p.name}</h3>
                <span className="city-open-rating">
                  <span className="city-open-stars">★ {p.rating.toFixed(1)}</span>
                  <span>({ratingCount} reviews)</span>
                </span>
                {(p.mapsUrl || p.url) && (
                  <span className="city-open-cta">{p.mapsUrl ? "Open in Maps ↗" : "Visit website ↗"}</span>
                )}
              </div>
            </a>
          );
        })}
      </div>

      <p className="city-note">
        Top-rated spots open right now in {cityName}, shuffled for variety.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// City Hall Panel — civic card pinned at the bottom of the page.
// Two side-by-side cards on desktop (stacked on mobile): next meeting (with
// agenda preview) and last meeting (summary excerpt + link to full digest).
// A lone card spans the full width instead of leaving half the row empty.
// ---------------------------------------------------------------------------

function CityHallPanel({
  cityId,
  nextMeeting,
  meetingIsToday,
  digest,
  digestAge,
}: {
  cityId: string;
  nextMeeting: any;
  meetingIsToday: boolean;
  digest: any;
  digestAge: number;
}) {
  const meetingItems = nextMeeting ? filterAgendaItems(nextMeeting.agendaItems) : [];
  const showDigest = !!(digest?.summary && digestAge < 30);

  if (!nextMeeting && !showDigest) return null;

  const isTonight = meetingIsToday && nextMeeting;
  const cardCount = (nextMeeting ? 1 : 0) + (showDigest ? 1 : 0);

  return (
    <section className="city-section" aria-labelledby="city-hall-heading">
      <div className="sb-section-header city-section-head">
        <h2 id="city-hall-heading" className="sb-section-title">At City Hall</h2>
      </div>

      <div className="city-hall-grid" data-count={cardCount}>
        {/* Next meeting card */}
        {nextMeeting && (
          <div className={isTonight ? "city-hall-card city-hall-card--tonight" : "city-hall-card"}>
            <p className="city-hall-kicker">
              {isTonight ? "Tonight" : "Next meeting"}{nextMeeting.displayDate ? ` · ${nextMeeting.displayDate}` : ""}
            </p>
            <h3 className="city-hall-title">{nextMeeting.bodyName}</h3>
            {meetingItems.length > 0 && (
              <ul className="city-hall-agenda">
                {meetingItems.slice(0, 3).map((it, i) => (
                  <li key={i}>{trimAgendaTitle(it.title)}</li>
                ))}
                {meetingItems.length > 3 && (
                  <li className="city-hall-more">
                    +{meetingItems.length - 3} more on the agenda
                  </li>
                )}
              </ul>
            )}
            {nextMeeting.url && (
              <a href={nextMeeting.url} target="_blank" rel="noopener noreferrer" className="city-hall-link">
                View agenda ↗
              </a>
            )}
          </div>
        )}

        {/* Last meeting summary card */}
        {showDigest && (
          <div className="city-hall-card">
            <p className="city-hall-kicker">Last meeting · {digest.meetingDate}</p>
            <p className="city-hall-summary">
              {digest.summary.slice(0, 240)}{digest.summary.length > 240 ? "…" : ""}
            </p>
            <a href={`/gov/${cityId}`} className="city-hall-link">
              Full summary →
            </a>
          </div>
        )}
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------------
// City Events Block — Today / Tomorrow / This Weekend pill block.
// Three buckets, not seven days. "This Weekend" = the next upcoming Sat+Sun
// combined into one view (or "today/tomorrow" if those happen to be Sat or
// Sun — we still show the dedicated weekend bucket so you can see both days
// side by side).
// ---------------------------------------------------------------------------

type EventsBucket = "today" | "tomorrow" | "weekend";

function getTomorrowIso(): string {
  const d = new Date(NOW_PT.getFullYear(), NOW_PT.getMonth(), NOW_PT.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function getWeekendIsos(): string[] {
  // Walk forward up to 7 days; collect the next Saturday + Sunday we can find.
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(NOW_PT.getFullYear(), NOW_PT.getMonth(), NOW_PT.getDate() + i);
    const day = d.getDay(); // 0 = sun, 6 = sat
    if (day === 6 || day === 0) {
      out.push(d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }));
    }
  }
  return out;
}

/** Placeholder rows shown while the events feed is in flight. */
function EventRowsSkeleton() {
  return (
    <ul className="city-events-list" aria-hidden="true">
      {[74, 58, 66, 49].map((w, i) => (
        <li key={i} className="city-event city-event--skeleton">
          <div className="city-event-link">
            <span className="city-event-icon city-skel-box"><span className="sb-skeleton" /></span>
            <span className="city-event-body">
              <span className="sb-skeleton" style={{ width: `${w}%`, height: 13 }} />
              <span className="sb-skeleton" style={{ width: `${w - 22}%`, height: 10, marginTop: 5 }} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CityEventsBlock({
  events,
  loading,
  generatedAt,
  cityId,
  cityName,
}: {
  events: UpcomingEvent[];
  loading: boolean;
  generatedAt?: string;
  cityId: string;
  cityName: string;
}) {
  const TOMORROW_ISO = useMemo(() => getTomorrowIso(), []);
  const WEEKEND_ISOS = useMemo(() => getWeekendIsos(), []);

  const [bucket, setBucket] = useState<EventsBucket>("today");
  const [freeOnly, setFreeOnly] = useState(false);
  const [kidsOnly, setKidsOnly] = useState(false);

  const cityEvents = useMemo(
    () => events.filter((e) => e.city === cityId && !e.ongoing),
    [events, cityId],
  );

  // Count helpers — let the pills display tonnage so an empty bucket reads
  // as "—" rather than user clicking through to nothing.
  const counts = useMemo(() => {
    const passesFilters = (e: UpcomingEvent) => {
      if (freeOnly && e.cost !== "free") return false;
      if (kidsOnly && !e.kidFriendly) return false;
      return true;
    };
    let today = 0, tomorrow = 0, weekend = 0;
    for (const e of cityEvents) {
      if (!passesFilters(e)) continue;
      if (e.date === TODAY_ISO && hasNotStarted(e.time)) today++;
      if (e.date === TOMORROW_ISO) tomorrow++;
      if (WEEKEND_ISOS.includes(e.date)) {
        // Don't double-count: if today/tomorrow IS the weekend, the user
        // selects the weekend bucket explicitly to see both days together.
        if (e.date === TODAY_ISO && !hasNotStarted(e.time)) continue;
        weekend++;
      }
    }
    return { today, tomorrow, weekend };
  }, [cityEvents, freeOnly, kidsOnly, TOMORROW_ISO, WEEKEND_ISOS]);

  const bucketEvents = useMemo(() => {
    const passesFilters = (e: UpcomingEvent) => {
      if (freeOnly && e.cost !== "free") return false;
      if (kidsOnly && !e.kidFriendly) return false;
      return true;
    };
    let list: UpcomingEvent[] = [];
    if (bucket === "today") {
      list = cityEvents.filter((e) => e.date === TODAY_ISO && hasNotStarted(e.time) && passesFilters(e));
    } else if (bucket === "tomorrow") {
      list = cityEvents.filter((e) => e.date === TOMORROW_ISO && passesFilters(e));
    } else {
      list = cityEvents.filter((e) => {
        if (!WEEKEND_ISOS.includes(e.date)) return false;
        if (e.date === TODAY_ISO && !hasNotStarted(e.time)) return false;
        return passesFilters(e);
      });
    }
    // Sort weekend by date THEN time so Saturday events list before Sunday.
    return list.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return startMinutes(a.time) - startMinutes(b.time);
    });
  }, [cityEvents, bucket, TOMORROW_ISO, WEEKEND_ISOS, freeOnly, kidsOnly]);

  const allEventsHref = `/events?city=${encodeURIComponent(cityId)}`;
  // "More events →" link picks a sensible date to deep-link to.
  const moreHref = bucket === "today" || bucket === "tomorrow"
    ? `${allEventsHref}&date=${encodeURIComponent(bucket === "today" ? TODAY_ISO : TOMORROW_ISO)}`
    : allEventsHref;

  const emptyLabel = bucket === "today" ? "today"
    : bucket === "tomorrow" ? "tomorrow"
    : "this weekend";
  const filtersOn = freeOnly || kidsOnly;

  const pillSpec: Array<{ key: EventsBucket; label: string; count: number }> = [
    { key: "today",    label: "Today",         count: counts.today },
    { key: "tomorrow", label: "Tomorrow",      count: counts.tomorrow },
    { key: "weekend",  label: "This Weekend",  count: counts.weekend },
  ];

  return (
    <section className="city-section" aria-labelledby="city-events-heading">
      <div className="sb-section-header city-section-head">
        <h2 id="city-events-heading" className="sb-section-title">Events in {cityName}</h2>
        <a href={allEventsHref} className="sb-btn sb-btn--quiet city-action">
          All events →
        </a>
      </div>

      <div className="city-seg" role="group" aria-label="When">
        {pillSpec.map(({ key, label, count }) => {
          const countText = count > 0 ? `${count} event${count === 1 ? "" : "s"}` : "—";
          return (
            <button
              key={key}
              type="button"
              onClick={() => setBucket(key)}
              aria-pressed={bucket === key}
              aria-label={loading ? label : `${label}, ${count > 0 ? countText : "no events"}`}
              className="city-seg-btn"
            >
              <span className="city-seg-label">{label}</span>
              <span className="city-seg-count" aria-hidden="true">
                {loading ? <span className="sb-skeleton" /> : countText}
              </span>
            </button>
          );
        })}
      </div>

      <div className="city-events-tools">
        <button
          type="button"
          onClick={() => setFreeOnly((v) => !v)}
          aria-pressed={freeOnly}
          className="city-chip city-chip--free"
        >
          {freeOnly && <span aria-hidden="true">✓</span>}
          Free only
        </button>
        <button
          type="button"
          onClick={() => setKidsOnly((v) => !v)}
          aria-pressed={kidsOnly}
          className="city-chip city-chip--kids"
        >
          {kidsOnly && <span aria-hidden="true">✓</span>}
          Kid-friendly
        </button>
        {!loading && generatedAt && (
          <span className="city-events-updated">Updated {formatAge(generatedAt)}</span>
        )}
      </div>

      <div className="city-events-card" aria-busy={loading}>
        {loading ? (
          <EventRowsSkeleton />
        ) : bucketEvents.length === 0 ? (
          <div className="city-events-empty">
            <p className="city-events-empty-title">
              Nothing on the calendar {emptyLabel}{filtersOn ? " with those filters" : ""}.
            </p>
            <p className="city-events-empty-sub">
              {filtersOn
                ? "Try clearing a filter."
                : bucket === "today"
                  ? "Tomorrow and this weekend are a tap away."
                  : <a href={allEventsHref}>See everything coming up in {cityName} →</a>}
            </p>
          </div>
        ) : (
          <>
            <ul className="city-events-list">
              {bucketEvents.slice(0, 12).map((e, i) => {
                // In the weekend bucket, a day label marks where Saturday
                // ends and Sunday begins.
                const prev = i > 0 ? bucketEvents[i - 1] : null;
                const showDayHeader = bucket === "weekend" && (!prev || prev.date !== e.date);
                return (
                  <Fragment key={e.id}>
                    {showDayHeader && (
                      <li className="city-events-day">
                        {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                      </li>
                    )}
                    <EventRow event={e} />
                  </Fragment>
                );
              })}
            </ul>
            {bucketEvents.length > 12 && (
              <a href={moreHref} className="city-events-more">
                +{bucketEvents.length - 12} more events →
              </a>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// City Reddit Tiles — tile-grid Reddit block scoped to this city.
// Visual cousin of homepage RedditPulseTeaser. Filter rule: local subs first,
// then regional subs that mention the city by name, then bare regional posts
// to keep the grid full when local subs are sparse.
// ---------------------------------------------------------------------------

interface ChatterPost {
  id: string;
  sub: string;
  title: string;
  displayTitle?: string;
  summary?: string;
  category?: string;
  score: number;
  numComments: number;
  ageHours: number;
  permalink: string;
  externalUrl?: string | null;
}

// City id → subreddit names that count as "the local sub" for this city.
// Case-insensitive match; canonical spellings the data uses.
const CITY_SUBREDDITS: Record<string, string[]> = {
  "san-jose":      ["SanJose"],
  "palo-alto":     ["PaloAlto"],
  "mountain-view": ["mountainview", "MountainView"],
  "sunnyvale":     ["Sunnyvale"],
  "santa-clara":   ["SantaClara"],
  "cupertino":     ["Cupertino"],
  "saratoga":      ["Saratoga_CA"],
  "los-gatos":     ["losgatos"],
  "milpitas":      ["Milpitas"],
  "campbell":      ["campbell", "Campbell"],
};

const REGIONAL_SUBS = new Set(["bayarea", "AskSF", "siliconvalley"]);

function chatterAge(hours: number): string {
  if (hours < 1) return "now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

function CityRedditTiles({ cityId, cityName }: { cityId: string; cityName: string }) {
  const allPosts = ((redditPulseJson as { posts?: ChatterPost[] }).posts ?? []);
  const localSubs = (CITY_SUBREDDITS[cityId] ?? []).map((s) => s.toLowerCase());
  const cityNeedle = cityName.toLowerCase();

  const withImage = allPosts.filter((p) => !!(p as any).image);

  const scored = withImage.map((p) => {
    const subLower = (p.sub || "").toLowerCase();
    const isLocal = localSubs.includes(subLower);
    const isRegional = REGIONAL_SUBS.has(p.sub);
    const hay = `${p.title || ""} ${p.summary || ""}`.toLowerCase();
    const cityMention = hay.includes(cityNeedle);
    let rank = 99;
    if (isLocal) rank = 0;
    else if (isRegional && cityMention) rank = 1;
    else if (isRegional) rank = 2;
    return { post: p, rank };
  })
  .filter((x) => x.rank <= 2)
  .sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.post.ageHours - b.post.ageHours;
  });

  // Take up to 8 tiles. Smaller datasets (Los Gatos, Saratoga) ship whatever
  // they have so long as there are at least 2 candidates — a single tile reads
  // as broken, but 2-3 is fine in a 2-col mobile layout, and the desktop
  // 4-col grid just auto-flows with empty trailing cells.
  const TILE_TARGET = 8;
  const trimmed = scored.slice(0, TILE_TARGET);

  if (trimmed.length < 2) return null;

  // Subtitle reflects what's actually showing — if every visible tile is from a
  // regional sub, don't promise "r/<localsub>" content the user won't see.
  const hasLocalTile = trimmed.some((x) => x.rank === 0);
  const localLabel = (CITY_SUBREDDITS[cityId] ?? [])[0];
  const subtitle = hasLocalTile
    ? `From r/${localLabel} and regional subs`
    : `Regional chatter from the Bay Area`;

  return (
    <section className="city-section" aria-labelledby="city-reddit-heading">
      <div className="sb-section-header city-section-head">
        <h2 id="city-reddit-heading" className="sb-section-title">The Conversation</h2>
        <p className="city-section-sub">{subtitle}</p>
      </div>

      <div className="city-reddit-grid">
        {trimmed.map(({ post: p }) => {
          const image = (p as any).image as string | undefined;
          return (
            <a
              key={p.id}
              href={p.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="city-reddit-tile"
              style={image ? { backgroundImage: `url(${image})` } : undefined}
            >
              <span className="city-reddit-shade" aria-hidden="true" />
              <span className="city-reddit-badge">r/{p.sub}</span>
              <span className="city-reddit-bottom">
                <span className="city-reddit-title">{p.displayTitle || p.title}</span>
                <span className="city-reddit-meta">
                  {p.score > 0 && <><span>↑ {p.score}</span><span aria-hidden="true">·</span></>}
                  {p.numComments > 0 && <><span>💬 {p.numComments}</span><span aria-hidden="true">·</span></>}
                  <span>{chatterAge(p.ageHours)}</span>
                </span>
              </span>
            </a>
          );
        })}
      </div>

      <p className="city-note" style={{ textAlign: "right" }}>
        Tap any post to jump into the thread on Reddit
      </p>
    </section>
  );
}
