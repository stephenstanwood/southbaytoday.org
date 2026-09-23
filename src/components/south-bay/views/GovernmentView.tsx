import { useState, useCallback, useMemo } from "react";
import type { DigestData } from "../cards/DigestCard";
import CouncilDigestTurnstile from "../cards/CouncilDigestTurnstile";
import MinutesSearchCard from "../cards/MinutesSearchCard";
import type { City } from "../../../lib/south-bay/types";
import { getCityName } from "../../../lib/south-bay/cities";
import { useTodayPT } from "../../../lib/south-bay/useTodayPT";
import digestsJson from "../../../data/south-bay/digests.json";
import upcomingMeetingsJson from "../../../data/south-bay/upcoming-meetings.json";
import PageHero from "../PageHero";

interface Props {
  selectedCities: Set<City>;
  /** Pacific date /gov was built on. The first render uses it so hydration
   *  matches the static HTML. See useTodayPT. */
  buildDayPt?: string;
}

interface AgendaItem {
  title: string;
  sequence: number;
}

interface UpcomingMeeting {
  date: string;
  displayDate: string;
  /** 24-hour local "HH:MM" of the first block readers may attend, or null when
   * the portal posts no start time. */
  startTime?: string | null;
  /** Set when the entry's posted hour was a closed session and `startTime` had
   * to be moved past it (Sunnyvale opens most sittings this way). */
  closedSessionStart?: string | null;
  bodyName: string;
  location: string | null;
  /** Closed/non-televised sitting — nothing a resident can attend or watch. */
  closedSession?: boolean;
  url: string;
  agendaItems?: AgendaItem[];
}

const staticDigests = digestsJson as Record<string, DigestData>;
const upcomingMeetings = (upcomingMeetingsJson as { meetings: Record<string, UpcomingMeeting> }).meetings;

// ── Date helpers (Pacific Time) ─────────────────────────────────────────────

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

/** "13:30" → "1:30 PM". Null for a missing or malformed portal time. */
function formatClock(hhmm: string | null | undefined): string | null {
  const m = hhmm ? /^(\d{1,2}):(\d{2})$/.exec(hhmm) : null;
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function countMeetingsInWindow(selectedCities: Set<City>, todayIso: string): number {
  const end = addDays(todayIso, 7);
  return Object.entries(upcomingMeetings).filter(([cityId, meeting]) => {
    if (!meeting?.date) return false;
    if (!selectedCities.has(cityId as City)) return false;
    return meeting.date >= todayIso && meeting.date <= end;
  }).length;
}

// ── This Week in Council ───────────────────────────────────────────────────
// Cross-city pulse of council meetings happening in the next 7 days. Helps
// residents see at a glance which meetings to watch or attend, without
// having to flip through the digest turnstile city by city.

interface WeekAheadRow {
  city: City;
  meeting: UpcomingMeeting;
}

function CouncilWeekAhead({ selectedCities, todayIso }: { selectedCities: Set<City>; todayIso: string }) {
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
    <section className="gov-section gov-week" aria-labelledby="gov-week-title">
      <div className="sb-section-header gov-section-head">
        <h2 id="gov-week-title" className="sb-section-title">This Week in Council</h2>
      </div>
      <p className="gov-section-blurb">
        Council meetings in the next 7 days across {selectedCities.size === 1 ? "your city" : "your selected cities"}. Tap a row to open the agenda.
      </p>
      <ul className="gov-week-list" role="list">
        {rows.map(({ city, meeting }) => {
          const pill = dayPill(meeting.date, todayIso, tomorrowIso);
          const isSoon = meeting.date === todayIso || meeting.date === tomorrowIso;
          const items = (meeting.agendaItems ?? []).slice(0, 2);
          const time = meeting.closedSession ? "Closed session" : formatClock(meeting.startTime);
          return (
            <li key={`${city}-${meeting.date}-${meeting.url}`}>
              <a
                href={meeting.url}
                target="_blank"
                rel="noopener noreferrer"
                className="gov-week-row"
              >
                <div className="gov-week-when">
                  <span className={`gov-week-day${isSoon ? " is-soon" : ""}`}>{pill}</span>
                  <span className="gov-week-date">
                    {meetingDateLabel(meeting.date).split(",")[1]?.trim() ?? meeting.date}
                  </span>
                  {time && <span className="gov-week-time">{time}</span>}
                </div>
                <div className="gov-week-body">
                  <div className="gov-week-head">
                    <span className="gov-week-city">{getCityName(city)}</span>
                    <span className="gov-week-bodyname">{meeting.bodyName}</span>
                  </div>
                  {items.length > 0 ? (
                    <ul className="gov-week-items">
                      {items.map((item) => (
                        <li key={item.sequence}>{item.title}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="gov-week-empty">
                      Agenda not posted yet. Tap to check the city&apos;s calendar.
                    </p>
                  )}
                </div>
                <span className="gov-week-go" aria-hidden="true">↗</span>
              </a>
            </li>
          );
        })}
      </ul>
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

// Where "View agendas →" sends a resident when there's no specific next-meeting
// URL. Every entry below was fetched and confirmed to load; several used to
// point at hosts that had gone 404, stopped resolving, or frozen into an
// archive while still answering 200. Re-verify before editing.
const AGENDA_URLS: Record<string, string> = {
  // Campbell moved to eScribe in late 2025; the old Agenda Center is frozen at
  // 2025-10-07 and must not be linked as current.
  "campbell": "https://pub-campbell.escribemeetings.com/",
  "saratoga": "https://www.saratoga.ca.us/AgendaCenter/City-Council-13",
  // Los Altos moved to CivicClerk; losaltosca.gov/AgendaCenter now titles
  // itself "Archived Agenda Center" and stops at 2025-04-22.
  "los-altos": "https://losaltosca.portal.civicclerk.com/",
  // Los Gatos: municodemeetings.com is the only agenda source losgatosca.gov
  // links to. It refuses our automated requests, so we can't verify it the way
  // the others were verified — kept because it's the town's own published link.
  "los-gatos": "https://losgatos-ca.municodemeetings.com/",
  "san-jose": "https://sanjose.legistar.com/Calendar.aspx",
  "mountain-view": "https://mountainview.legistar.com/Calendar.aspx",
  "sunnyvale": "https://sunnyvale.legistar.com/Calendar.aspx",
  "cupertino": "https://cupertino.legistar.com/Calendar.aspx",
  "santa-clara": "https://santaclara.legistar.com/Calendar.aspx",
  // ci.milpitas.ca.gov no longer serves; the city is on milpitas.gov.
  "milpitas": "https://www.milpitas.gov/129/Agendas-Minutes",
  // cityofpaloalto.org/Government/City-Clerk/... 404s; this is the page the
  // city's own City Council page links to.
  "palo-alto": "https://www.paloalto.gov/City-Hall/City-Council/Council-Agendas-Minutes",
};

export default function GovernmentView({ selectedCities, buildDayPt }: Props) {
  // The build's day while hydrating, then the reader's (useTodayPT).
  const todayIso = useTodayPT(buildDayPt);
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
  const meetingCount = useMemo(
    () => countMeetingsInWindow(selectedCities, todayIso),
    [selectedCities, todayIso],
  );
  const selectedGovCityCount = useMemo(
    () => CITY_ORDER.filter((c) => selectedCities.has(c)).length,
    [selectedCities],
  );
  const missingDigestCount = Math.max(0, selectedGovCityCount - orderedCities.length);

  return (
    <div className="gov-view">
      <PageHero
        eyebrow="South Bay / Civic Desk"
        title="Local Government"
        description="Council meetings, searchable records, and plain-English summaries for the cities you follow. Built for quick civic context, not municipal scavenger hunts."
        accent="var(--sb-accent)"
        stats={[
          { value: meetingCount, label: "Meetings this week" },
          { value: orderedCities.length, label: "With digests" },
          { value: missingDigestCount, label: "Awaiting digest" },
        ]}
      />

      <CouncilWeekAhead selectedCities={selectedCities} todayIso={todayIso} />

      <MinutesSearchCard selectedCities={selectedCities} />

      <section className="gov-section gov-digests" aria-labelledby="gov-digests-title">
        <div className="sb-section-header gov-section-head">
          <h2 id="gov-digests-title" className="sb-section-title">Council Digests</h2>
        </div>
        <p className="gov-section-blurb">
          Recent council meetings in plain English: what was discussed, what was decided,
          and what is coming next.
        </p>
        <CouncilDigestTurnstile
          cities={orderedCities}
          digests={digests}
          upcomingMeetings={upcomingMeetings as Record<string, UpcomingMeeting | undefined>}
          agendaUrls={AGENDA_URLS}
          onRefresh={refreshDigest}
          loading={loading}
          errors={errors}
          todayIso={todayIso}
        />
      </section>
    </div>
  );
}
