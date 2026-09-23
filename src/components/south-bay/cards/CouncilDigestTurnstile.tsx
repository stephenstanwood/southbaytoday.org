import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { DigestData } from "./DigestCard";
import type { City } from "../../../lib/south-bay/types";
import { getCityName } from "../../../lib/south-bay/cities";
import { calendarDaysAgo } from "../../../lib/south-bay/useTodayPT";

interface AgendaItem {
  title: string;
  sequence: number;
}

interface UpcomingMeeting {
  date: string;
  displayDate: string;
  bodyName: string;
  location: string | null;
  url: string;
  agendaItems?: AgendaItem[];
}

interface Props {
  cities: City[];
  digests: Map<string, DigestData>;
  upcomingMeetings: Record<string, UpcomingMeeting | undefined>;
  agendaUrls: Record<string, string>;
  onRefresh: (city: City) => Promise<void> | void;
  loading: Set<string>;
  errors: Map<string, string>;
  /** Pacific date for the digest ages and the next-meeting check: the
   *  build's day while hydrating, then the reader's (GovernmentView's
   *  useTodayPT). */
  todayIso: string;
}

function cityLabel(city: string) {
  return getCityName(city as City);
}

// Ages count Pacific calendar days to the meeting's date. (Rounding hours
// since the date's UTC midnight read yesterday's meeting as "2 days ago" from
// 5 AM PT on.)
function relativeAge(iso: string | undefined, todayIso: string): string | null {
  if (!iso) return null;
  const days = calendarDaysAgo(iso, todayIso);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  return `${months} months ago`;
}

function isStale(meetingIso: string | undefined, todayIso: string): boolean {
  if (!meetingIso) return false;
  return calendarDaysAgo(meetingIso, todayIso) > 21;
}

export default function CouncilDigestTurnstile({
  cities,
  digests,
  upcomingMeetings,
  agendaUrls,
  onRefresh,
  loading,
  errors,
  todayIso,
}: Props) {
  const ordered = useMemo(() => cities, [cities]);
  const [index, setIndex] = useState(0);
  const chipsRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (index >= ordered.length) setIndex(0);
  }, [ordered.length, index]);

  useEffect(() => {
    const scroller = chipsRef.current;
    const chip = activeChipRef.current;
    if (!scroller || !chip) return;

    const targetLeft = chip.offsetLeft - (scroller.clientWidth - chip.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, [index, ordered.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + ordered.length) % ordered.length);
  }, [ordered.length]);
  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % ordered.length);
  }, [ordered.length]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { goPrev(); e.preventDefault(); }
    if (e.key === "ArrowRight") { goNext(); e.preventDefault(); }
  }, [goPrev, goNext]);

  if (ordered.length === 0) {
    return (
      <div className="sb-empty" style={{ padding: "32px 16px" }}>
        <div className="sb-empty-title">No cities selected</div>
        <div className="sb-empty-sub">Use the city pills above to pick at least one city.</div>
      </div>
    );
  }

  const city = ordered[index];
  const digest = digests.get(city);
  const upcoming = upcomingMeetings[city];
  // A meeting that already happened isn't "next". The feed refreshes nightly,
  // but a page built the day before (or a tab left open) can still carry it.
  // todayIso is the build's day while hydrating, so the prerendered HTML
  // leaves it out too and the card doesn't shift when the page hydrates.
  const nextMeeting = upcoming && upcoming.date >= todayIso ? upcoming : undefined;
  const isLoading = loading.has(city);
  const error = errors.get(city);
  const multi = ordered.length > 1;

  return (
    <div
      className="cdt-wrap"
      onKeyDown={onKeyDown}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Council digests by city"
    >
      <div className="cdt-chips" role="tablist" aria-label="City" ref={chipsRef}>
        {ordered.map((c, i) => {
          const isActive = i === index;
          const hasDigest = digests.has(c);
          return (
            <button
              key={c}
              ref={isActive ? activeChipRef : undefined}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setIndex(i)}
              className="gov-pill cdt-chip"
            >
              <span>{cityLabel(c)}</span>
              {!hasDigest && <span className="cdt-chip-dot" aria-hidden>·</span>}
            </button>
          );
        })}
      </div>

      <div className="cdt-stage">
        <div className="cdt-rail cdt-rail--prev">
          <button
            type="button"
            className="cdt-arrow"
            onClick={goPrev}
            aria-label="Previous city"
            disabled={!multi}
          >
            ‹
          </button>
        </div>

        <div className="cdt-card-wrap">
          <article
            key={city}
            className="cdt-card"
            aria-live="polite"
            aria-busy={isLoading || undefined}
          >
            {isLoading ? (
              <DigestSkeleton city={city} />
            ) : error ? (
              <div className="cdt-error">
                <p><strong>{cityLabel(city)}:</strong> {error}</p>
                <button type="button" onClick={() => onRefresh(city)} className="sb-btn sb-btn--quiet">
                  Try again
                </button>
              </div>
            ) : digest ? (
              <DigestBody
                digest={digest}
                nextMeeting={nextMeeting}
                onRefresh={() => onRefresh(city)}
                stale={isStale(digest.meetingDateIso, todayIso)}
              />
            ) : (
              <NoDigestBody
                city={city}
                nextMeeting={nextMeeting}
                agendaUrl={agendaUrls[city]}
                onGenerate={() => onRefresh(city)}
              />
            )}
          </article>
        </div>

        <div className="cdt-rail cdt-rail--next">
          <button
            type="button"
            className="cdt-arrow"
            onClick={goNext}
            aria-label="Next city"
            disabled={!multi}
          >
            ›
          </button>
        </div>

        <div className="cdt-counter">
          <span className="cdt-counter-main">
            <span className="cdt-counter-city">{cityLabel(city)}</span>
            <span className="cdt-counter-sep" aria-hidden="true">·</span>
            <span>{index + 1} of {ordered.length}</span>
          </span>
          {digest && (
            <span className="cdt-counter-age">
              last meeting {relativeAge(digest.meetingDateIso, todayIso)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DigestSkeleton({ city }: { city: City }) {
  return (
    <div className="cdt-loading">
      <span className="cdt-loading-label">
        <span className="sb-spinner gov-ask-spinner" aria-hidden="true" />
        Refreshing {cityLabel(city)} digest…
      </span>
      <span className="sb-skeleton cdt-sk-title" aria-hidden="true" />
      <span className="sb-skeleton" style={{ width: "96%" }} aria-hidden="true" />
      <span className="sb-skeleton" style={{ width: "92%" }} aria-hidden="true" />
      <span className="sb-skeleton" style={{ width: "88%" }} aria-hidden="true" />
      <span className="sb-skeleton" style={{ width: "54%", marginBottom: 10 }} aria-hidden="true" />
      <span className="sb-skeleton" style={{ width: "70%" }} aria-hidden="true" />
      <span className="sb-skeleton" style={{ width: "62%" }} aria-hidden="true" />
      <span className="sb-skeleton" style={{ width: "66%" }} aria-hidden="true" />
    </div>
  );
}

function NextMeetingBox({ nextMeeting, linkWhenEmpty }: {
  nextMeeting: UpcomingMeeting;
  linkWhenEmpty: boolean;
}) {
  const items = nextMeeting.agendaItems ?? [];
  return (
    <div className="cdt-next">
      <div className="cdt-next-label">Next meeting · {nextMeeting.displayDate}</div>
      {items.length > 0 ? (
        <ul className="cdt-next-items">
          {items.slice(0, 4).map((it, i) => (
            <li key={i}>{it.title}</li>
          ))}
        </ul>
      ) : linkWhenEmpty ? (
        <a
          href={nextMeeting.url}
          target="_blank"
          rel="noopener noreferrer"
          className="cdt-next-link"
        >
          View agenda ↗
        </a>
      ) : null}
    </div>
  );
}

function DigestBody({
  digest,
  nextMeeting,
  onRefresh,
  stale,
}: {
  digest: DigestData & { meetingDateIso?: string };
  nextMeeting: UpcomingMeeting | undefined;
  onRefresh: () => void;
  stale: boolean;
}) {
  return (
    <>
      <header className="cdt-header">
        <div className="cdt-eyebrow">{digest.body || "City Council"}</div>
        <h3 className="cdt-title">{digest.cityName}</h3>
        <div className="cdt-date">
          <span>{digest.meetingDate}</span>
          {stale && (
            <span className="cdt-stale-tag" title="Most recent agenda we have on file. A newer meeting may have happened since.">
              latest on file
            </span>
          )}
        </div>
      </header>

      {digest.summary && (
        <p className="cdt-summary">{digest.summary}</p>
      )}

      {digest.keyTopics?.length > 0 && (
        <>
          <h4 className="cdt-subhead">What came up</h4>
          <ul className="cdt-topics">
            {digest.keyTopics.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </>
      )}

      {nextMeeting && <NextMeetingBox nextMeeting={nextMeeting} linkWhenEmpty />}

      <footer className="cdt-footer">
        <a
          href={digest.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="sb-btn"
        >
          View this agenda ↗
        </a>
        <button
          type="button"
          onClick={onRefresh}
          className="sb-btn sb-btn--quiet"
          title="Pull the latest agenda and re-summarize"
        >
          ↻ Refresh
        </button>
      </footer>
    </>
  );
}

function NoDigestBody({
  city,
  nextMeeting,
  agendaUrl,
  onGenerate,
}: {
  city: City;
  nextMeeting: UpcomingMeeting | undefined;
  agendaUrl: string | undefined;
  onGenerate: () => void;
}) {
  return (
    <>
      <header className="cdt-header">
        <div className="cdt-eyebrow">City Council</div>
        <h3 className="cdt-title">{cityLabel(city)}</h3>
        <div className="cdt-date">No digest on file yet</div>
      </header>

      <p className="cdt-summary cdt-summary--muted">
        We haven&apos;t summarized a meeting for {cityLabel(city)} yet. You can pull the latest
        agenda and generate one on demand.
      </p>

      {nextMeeting && <NextMeetingBox nextMeeting={nextMeeting} linkWhenEmpty={false} />}

      <footer className="cdt-footer">
        {agendaUrl && (
          <a
            href={nextMeeting?.url ?? agendaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="sb-btn"
          >
            View agendas ↗
          </a>
        )}
        <button type="button" onClick={onGenerate} className="sb-btn sb-btn--primary">
          Generate digest
        </button>
      </footer>
    </>
  );
}
