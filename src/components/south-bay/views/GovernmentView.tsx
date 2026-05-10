import { useState, useCallback, useMemo } from "react";
import type { DigestData } from "../cards/DigestCard";
import CouncilDigestTurnstile from "../cards/CouncilDigestTurnstile";
import MinutesSearchCard from "../cards/MinutesSearchCard";
import ElectionsCard from "../cards/ElectionsCard";
import DevelopmentView from "./DevelopmentView";
import type { City } from "../../../lib/south-bay/types";
import { getCityName } from "../../../lib/south-bay/cities";
import digestsJson from "../../../data/south-bay/digests.json";
import upcomingMeetingsJson from "../../../data/south-bay/upcoming-meetings.json";

interface Props {
  selectedCities: Set<City>;
}

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

const staticDigests = digestsJson as Record<string, DigestData>;
const upcomingMeetings = (upcomingMeetingsJson as { meetings: Record<string, UpcomingMeeting> }).meetings;

// ── Date helpers (Pacific Time) ─────────────────────────────────────────────

function todayPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function dayPill(iso: string, todayIso: string, tomorrowIso: string): string {
  if (iso === todayIso) return "TODAY";
  if (iso === tomorrowIso) return "TOMORROW";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

function meetingDateLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

// ── This Week in Council ───────────────────────────────────────────────────
// Cross-city pulse of council meetings happening in the next 7 days. Helps
// residents see at a glance which meetings to watch or attend, without
// having to flip through the digest turnstile city by city.

interface WeekAheadRow {
  city: City;
  meeting: UpcomingMeeting;
}

function CouncilWeekAhead({ selectedCities }: { selectedCities: Set<City> }) {
  const todayIso = todayPT();
  const tomorrowIso = addDays(todayIso, 1);
  const horizonIso = addDays(todayIso, 7);

  const rows = useMemo<WeekAheadRow[]>(() => {
    const out: WeekAheadRow[] = [];
    for (const [cityId, meeting] of Object.entries(upcomingMeetings)) {
      if (!meeting?.date) continue;
      if (!selectedCities.has(cityId as City)) continue;
      if (meeting.date < todayIso || meeting.date > horizonIso) continue;
      out.push({ city: cityId as City, meeting });
    }
    out.sort((a, b) => {
      if (a.meeting.date !== b.meeting.date) return a.meeting.date.localeCompare(b.meeting.date);
      return getCityName(a.city).localeCompare(getCityName(b.city));
    });
    return out;
  }, [selectedCities, todayIso, horizonIso]);

  if (rows.length === 0) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div className="sb-section-header" style={{ marginBottom: 4 }}>
        <span className="sb-section-title">This Week in Council</span>
      </div>
      <p className="gov-section-blurb">
        Council meetings happening in the next 7 days across {selectedCities.size === 1 ? "your city" : "your selected cities"} — tap a row to open the agenda.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "var(--sb-card)",
          border: "1px solid var(--sb-border-light)",
        }}
      >
        {rows.map(({ city, meeting }, i) => {
          const pill = dayPill(meeting.date, todayIso, tomorrowIso);
          const isUrgent = meeting.date === todayIso || meeting.date === tomorrowIso;
          const items = (meeting.agendaItems ?? []).slice(0, 2);
          return (
            <a
              key={`${city}-${meeting.date}-${meeting.url}`}
              href={meeting.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "grid",
                gridTemplateColumns: "72px 1fr",
                gap: 14,
                padding: "14px 16px",
                borderTop: i === 0 ? "none" : "1px solid var(--sb-border-light)",
                color: "var(--sb-ink)",
                textDecoration: "none",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sb-accent-light, #fafafa)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    background: isUrgent ? "var(--sb-ink)" : "transparent",
                    color: isUrgent ? "var(--sb-card)" : "var(--sb-ink)",
                    border: `1px solid ${isUrgent ? "var(--sb-ink)" : "var(--sb-border)"}`,
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    borderRadius: 100,
                  }}
                >
                  {pill}
                </span>
                <span style={{ fontSize: 11, color: "var(--sb-muted)", marginTop: 4 }}>
                  {meetingDateLabel(meeting.date).split(",")[1]?.trim() ?? meeting.date}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--sb-serif)", fontSize: 16, fontWeight: 700 }}>
                    {getCityName(city)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--sb-light)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 600,
                    }}
                  >
                    {meeting.bodyName}
                  </span>
                </div>
                {items.length > 0 ? (
                  <ul
                    style={{
                      margin: "6px 0 0",
                      padding: 0,
                      listStyle: "none",
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: "var(--sb-muted)",
                    }}
                  >
                    {items.map((item) => (
                      <li
                        key={item.sequence}
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        · {item.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--sb-light)", marginTop: 6 }}>
                    Agenda not yet posted — tap to check the city's calendar.
                  </div>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

// Canonical city order in the turnstile when "all" are selected. San José leads
// (largest by population), then a rough north-to-south sweep.
const CITY_ORDER: City[] = [
  "san-jose",
  "santa-clara",
  "sunnyvale",
  "mountain-view",
  "palo-alto",
  "los-altos",
  "cupertino",
  "campbell",
  "saratoga",
  "los-gatos",
  "milpitas",
];

const AGENDA_URLS: Record<string, string> = {
  "campbell": "https://www.campbellca.gov/AgendaCenter/City-Council-10",
  "saratoga": "https://saratoga-ca.municodemeetings.com/",
  "los-altos": "https://losaltos-ca.municodemeetings.com/",
  "los-gatos": "https://losgatos-ca.municodemeetings.com/",
  "san-jose": "https://sanjose.legistar.com/Calendar.aspx",
  "mountain-view": "https://mountainview.legistar.com/Calendar.aspx",
  "sunnyvale": "https://sunnyvale.legistar.com/Calendar.aspx",
  "cupertino": "https://cupertino.legistar.com/Calendar.aspx",
  "santa-clara": "https://santaclara.legistar.com/Calendar.aspx",
  "milpitas": "https://www.ci.milpitas.ca.gov/government/council/",
  "palo-alto": "https://www.cityofpaloalto.org/Government/City-Clerk/Meetings-Agendas-Minutes",
};

export default function GovernmentView({ selectedCities }: Props) {
  const [digests, setDigests] = useState<Map<string, DigestData>>(() => {
    const map = new Map<string, DigestData>();
    for (const [city, digest] of Object.entries(staticDigests)) {
      map.set(city, digest);
    }
    return map;
  });
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  const refreshDigest = useCallback(async (city: City) => {
    setLoading((prev) => new Set(prev).add(city));
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(city);
      return next;
    });
    try {
      const res = await fetch(`/api/south-bay/digest?city=${city}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      const digest: DigestData = await res.json();
      setDigests((prev) => new Map(prev).set(city, digest));
    } catch (e) {
      setErrors((prev) =>
        new Map(prev).set(
          city,
          e instanceof Error ? e.message : "Failed to load",
        ),
      );
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(city);
        return next;
      });
    }
  }, []);

  // Show only cities we actually have a digest for. Stoa coverage gaps (e.g.
  // Los Altos, where the API has nothing in the City Council slot) shouldn't
  // result in an empty turnstile card.
  const orderedCities = useMemo(
    () => CITY_ORDER.filter((c) => selectedCities.has(c) && digests.has(c)),
    [selectedCities, digests],
  );

  return (
    <div className="gov-view">
      {/* ── 1. This Week in Council (cross-city pulse) ── */}
      <CouncilWeekAhead selectedCities={selectedCities} />

      {/* ── 2. Ask the Records ── */}
      <MinutesSearchCard selectedCities={selectedCities} />

      {/* ── 3. Council Digests turnstile ── */}
      <div className="sb-section-header" style={{ marginBottom: 4 }}>
        <span className="sb-section-title">Council Digests</span>
      </div>
      <p className="gov-section-blurb">
        Plain-English summaries of recent council meetings — what was discussed, what was decided.
        Use the arrows or city pills to flip through.
      </p>
      <CouncilDigestTurnstile
        cities={orderedCities}
        digests={digests}
        upcomingMeetings={upcomingMeetings as Record<string, UpcomingMeeting | undefined>}
        agendaUrls={AGENDA_URLS}
        onRefresh={refreshDigest}
        loading={loading}
        errors={errors}
      />

      {/* ── 4. 2026 Elections ── */}
      <div style={{ marginTop: 32 }}>
        <ElectionsCard />
      </div>

      {/* ── 5. What's Being Built (filtered to active near-term projects) ── */}
      <DevelopmentView />
    </div>
  );
}
