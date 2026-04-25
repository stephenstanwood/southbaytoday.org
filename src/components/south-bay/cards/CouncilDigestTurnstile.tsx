import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { DigestData } from "./DigestCard";
import type { City } from "../../../lib/south-bay/types";

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
}

const CITY_ACCENT: Record<string, string> = {
  campbell:        "#1d4ed8",
  "los-gatos":     "#b45309",
  saratoga:        "#065F46",
  cupertino:       "#6d28d9",
  sunnyvale:       "#0891b2",
  "mountain-view": "#0369a1",
  "san-jose":      "#be123c",
  "santa-clara":   "#b45309",
  "palo-alto":     "#1d4ed8",
  milpitas:        "#4d7c0f",
  "los-altos":     "#7c3aed",
};

function cityLabel(city: string) {
  return city
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function relativeAge(iso: string | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  return `${months} months ago`;
}

function isStale(meetingIso: string | undefined): boolean {
  if (!meetingIso) return false;
  const ms = Date.now() - new Date(meetingIso).getTime();
  return ms > 21 * 86_400_000;
}

export default function CouncilDigestTurnstile({
  cities,
  digests,
  upcomingMeetings,
  agendaUrls,
  onRefresh,
  loading,
  errors,
}: Props) {
  const ordered = useMemo(() => cities, [cities]);
  const [index, setIndex] = useState(0);
  const activeChipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (index >= ordered.length) setIndex(0);
  }, [ordered.length, index]);

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);

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
  const accent = CITY_ACCENT[city] ?? "#1A1A1A";
  const digest = digests.get(city);
  const nextMeeting = upcomingMeetings[city];
  const isLoading = loading.has(city);
  const error = errors.get(city);

  return (
    <div className="cdt-wrap" onKeyDown={onKeyDown} tabIndex={0} aria-roledescription="carousel">
      <div className="cdt-chips" role="tablist" aria-label="City">
        {ordered.map((c, i) => {
          const isActive = i === index;
          const cAccent = CITY_ACCENT[c] ?? "#1A1A1A";
          const hasDigest = digests.has(c);
          return (
            <button
              key={c}
              ref={isActive ? activeChipRef : undefined}
              role="tab"
              aria-selected={isActive}
              onClick={() => setIndex(i)}
              className={`cdt-chip${isActive ? " cdt-chip--active" : ""}`}
              style={isActive ? { borderColor: cAccent, color: cAccent, background: cAccent + "0F" } : undefined}
            >
              <span>{cityLabel(c)}</span>
              {!hasDigest && <span className="cdt-chip-dot" aria-hidden>·</span>}
            </button>
          );
        })}
      </div>

      <div className="cdt-stage">
        <button
          className="cdt-arrow cdt-arrow--prev"
          onClick={goPrev}
          aria-label="Previous city"
          disabled={ordered.length < 2}
        >
          ‹
        </button>

        <div className="cdt-card-wrap">
          <article
            key={city}
            className="cdt-card"
            style={{ borderTop: `3px solid ${accent}` }}
            aria-live="polite"
          >
            {isLoading ? (
              <div className="cdt-loading">
                <div className="sb-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                <span>Refreshing {cityLabel(city)} digest…</span>
              </div>
            ) : error ? (
              <div className="cdt-error">
                <strong>{cityLabel(city)}:</strong> {error}
                <button onClick={() => onRefresh(city)} className="cdt-retry">Retry</button>
              </div>
            ) : digest ? (
              <DigestBody
                digest={digest}
                accent={accent}
                nextMeeting={nextMeeting}
                onRefresh={() => onRefresh(city)}
                stale={isStale(digest.meetingDateIso ?? undefined)}
              />
            ) : (
              <NoDigestBody
                city={city}
                accent={accent}
                nextMeeting={nextMeeting}
                agendaUrl={agendaUrls[city]}
                onGenerate={() => onRefresh(city)}
              />
            )}
          </article>
        </div>

        <button
          className="cdt-arrow cdt-arrow--next"
          onClick={goNext}
          aria-label="Next city"
          disabled={ordered.length < 2}
        >
          ›
        </button>
      </div>

      <div className="cdt-counter">
        <span style={{ color: accent, fontWeight: 700 }}>{cityLabel(city)}</span>
        <span className="cdt-counter-sep">·</span>
        <span>{index + 1} of {ordered.length}</span>
        {digest && (
          <>
            <span className="cdt-counter-sep">·</span>
            <span>last meeting {relativeAge(digest.meetingDateIso ?? undefined)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function DigestBody({
  digest,
  accent,
  nextMeeting,
  onRefresh,
  stale,
}: {
  digest: DigestData & { meetingDateIso?: string };
  accent: string;
  nextMeeting: UpcomingMeeting | undefined;
  onRefresh: () => void;
  stale: boolean;
}) {
  return (
    <>
      <header className="cdt-header">
        <div className="cdt-eyebrow" style={{ color: accent }}>
          {digest.body || "City Council"}
        </div>
        <h3 className="cdt-title">{digest.cityName}</h3>
        <div className="cdt-date">
          {digest.meetingDate}
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
        <ul className="cdt-topics">
          {digest.keyTopics.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      {nextMeeting && (
        <div className="cdt-next">
          <div className="cdt-next-label">Next meeting · {nextMeeting.displayDate}</div>
          {nextMeeting.agendaItems && nextMeeting.agendaItems.length > 0 ? (
            <ul className="cdt-next-items">
              {nextMeeting.agendaItems.slice(0, 4).map((it, i) => (
                <li key={i}>{it.title}</li>
              ))}
            </ul>
          ) : (
            <a
              href={nextMeeting.url}
              target="_blank"
              rel="noopener noreferrer"
              className="cdt-next-link"
              style={{ color: accent }}
            >
              View agenda →
            </a>
          )}
        </div>
      )}

      <footer className="cdt-footer">
        <a
          href={digest.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cdt-source"
          style={{ color: accent }}
        >
          View this agenda →
        </a>
        <button onClick={onRefresh} className="cdt-refresh" title="Pull the latest agenda and re-summarize">
          ↻ refresh
        </button>
      </footer>
    </>
  );
}

function NoDigestBody({
  city,
  accent,
  nextMeeting,
  agendaUrl,
  onGenerate,
}: {
  city: City;
  accent: string;
  nextMeeting: UpcomingMeeting | undefined;
  agendaUrl: string | undefined;
  onGenerate: () => void;
}) {
  return (
    <>
      <header className="cdt-header">
        <div className="cdt-eyebrow" style={{ color: accent }}>City Council</div>
        <h3 className="cdt-title">{cityLabel(city)}</h3>
        <div className="cdt-date" style={{ color: "var(--sb-muted)" }}>
          No digest on file yet
        </div>
      </header>

      <p className="cdt-summary cdt-summary--muted">
        We haven&apos;t summarized a meeting for {cityLabel(city)} yet. You can pull the latest
        agenda and generate one on demand.
      </p>

      {nextMeeting && (
        <div className="cdt-next">
          <div className="cdt-next-label">Next meeting · {nextMeeting.displayDate}</div>
          {nextMeeting.agendaItems && nextMeeting.agendaItems.length > 0 && (
            <ul className="cdt-next-items">
              {nextMeeting.agendaItems.slice(0, 4).map((it, i) => (
                <li key={i}>{it.title}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className="cdt-footer">
        {agendaUrl && (
          <a
            href={nextMeeting?.url ?? agendaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="cdt-source"
            style={{ color: accent }}
          >
            View agendas →
          </a>
        )}
        <button onClick={onGenerate} className="cdt-refresh cdt-refresh--primary">
          Generate digest
        </button>
      </footer>
    </>
  );
}
