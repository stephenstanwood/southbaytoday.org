// ---------------------------------------------------------------------------
// South Bay Today — City Page
// ---------------------------------------------------------------------------
// Mini-homepage for a single city: today's events, next meeting, briefing,
// recent civic actions, and links back to the main site.

import { useState, useEffect, useMemo } from "react";
import type { City } from "../../../lib/south-bay/types";
import { CITY_MAP } from "../../../lib/south-bay/cities";
import {
  TODAY_ISO, NEXT_DAYS, IS_WEEKEND_MODE,
  startMinutes, formatTimeRange, isNotEnded,
  formatAge, formatRelativeDate,
} from "../../../lib/south-bay/timeHelpers";
import { nextHolidayWithin, matchesHolidayTheme, holidayClosureSummary, type NamedHoliday } from "../../../lib/south-bay/holidays";

import upcomingMeetingsJson from "../../../data/south-bay/upcoming-meetings.json";
import digestsJson from "../../../data/south-bay/digests.json";
import cityBriefingsJson from "../../../data/south-bay/city-briefings.json";
import aroundTownJson from "../../../data/south-bay/around-town.json";
import realEstateJson from "../../../data/south-bay/real-estate.json";
import schoolCalendarJson from "../../../data/south-bay/school-calendar.json";
import sccFoodOpeningsJson from "../../../data/south-bay/scc-food-openings.json";
import restaurantRadarJson from "../../../data/south-bay/restaurant-radar.json";
import laneClosuresJson from "../../../data/south-bay/lane-closures.json";
import redditPulseJson from "../../../data/south-bay/reddit-pulse.json";
import openNowCandidatesJson from "../../../data/south-bay/open-now-candidates.json";
import airQualityJson from "../../../data/south-bay/air-quality.json";
import { TECH_COMPANIES, CATEGORY_LABELS, type TechTrend } from "../../../data/south-bay/tech-companies";
import {
  DEV_PROJECTS,
  STATUS_CONFIG as DEV_STATUS_CONFIG,
  CATEGORY_LABELS as DEV_CATEGORY_LABELS,
  type DevStatus,
} from "../../../data/south-bay/development-data";

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
  ongoing?: boolean;
  blurb?: string | null;
  description?: string | null;
};

type ForecastDay = {
  date: string;
  emoji: string;
  desc: string;
  high: number;
  low: number;
  rainPct: number;
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

// ── Props ──

type Props = {
  cityId: string;
  cityName: string;
};

export default function CityPage({ cityId, cityName }: Props) {
  const [weather, setWeather] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[] | null>(null);
  const [upcomingData, setUpcomingData] = useState<{ events: UpcomingEvent[]; generatedAt?: string } | null>(null);

  useEffect(() => {
    fetch(`/api/weather?city=${cityId}`)
      .then((r) => r.json())
      .then((d) => {
        setWeather(d.weather ?? null);
        setForecast(d.forecast ?? null);
      })
      .catch(() => {});
  }, [cityId]);

  useEffect(() => {
    fetch("/api/south-bay/upcoming-events")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setUpcomingData(d ?? { events: [] }))
      .catch(() => setUpcomingData({ events: [] }));
  }, []);

  // ── Events ──
  const allEvents = upcomingData?.events ?? [];
  const eventsGenAt = upcomingData?.generatedAt;
  const todayEvents = allEvents
    .filter((e) => e.date === TODAY_ISO && e.city === cityId && !e.ongoing && isNotEnded(e.time))
    .sort((a, b) => startMinutes(a.time) - startMinutes(b.time));

  const tomorrowEvents = allEvents
    .filter((e) => e.date === NEXT_DAYS[0]?.iso && e.city === cityId && !e.ongoing)
    .sort((a, b) => startMinutes(a.time) - startMinutes(b.time));

  const thisWeekEvents = NEXT_DAYS.slice(1, 6).flatMap(({ iso }) =>
    allEvents
      .filter((e) => e.date === iso && e.city === cityId && !e.ongoing)
      .sort((a, b) => startMinutes(a.time) - startMinutes(b.time))
      .slice(0, 3)
  );

  // ── Meeting ──
  const meetings = (upcomingMeetingsJson as unknown as { meetings: Record<string, any> }).meetings ?? {};
  const nextMeeting = meetings[cityId];
  const meetingIsToday = nextMeeting?.date === TODAY_ISO;

  // ── Digest ──
  const digest = (digestsJson as Record<string, any>)[cityId];
  const digestAge = digest?.meetingDateIso
    ? (Date.now() - new Date(digest.meetingDateIso).getTime()) / 86400000
    : 999;

  // ── Briefing ──
  const briefings = (cityBriefingsJson as any).cities ?? {};
  const briefing = briefings[cityId];

  // ── Around town ──
  const aroundItems = ((aroundTownJson as any).items ?? [])
    .filter((item: any) => item.cityId === cityId)
    .slice(0, 4);

  // ── City config ──
  const city = CITY_MAP[cityId as City];

  // ── Holiday banner ── soonest civic/cultural holiday within 14 days. We
  // count city-specific events on the holiday date so residents see e.g.
  // "Cinco de Mayo TODAY · 20 events in San José" and can jump straight to
  // them. Mirrors EventsView's HolidayHeadsUpBanner conceptually.
  const horizonIso = useMemo(() => {
    const d = new Date(TODAY_ISO + "T12:00:00");
    d.setDate(d.getDate() + 14);
    return d.toLocaleDateString("en-CA");
  }, []);
  const nextHoliday = useMemo(() => nextHolidayWithin(TODAY_ISO, horizonIso), [horizonIso]);
  const cityHolidayCounts = useMemo(() => {
    if (!nextHoliday) return { total: 0, themed: 0 };
    const onDay = allEvents.filter((e) => e.date === nextHoliday.iso && e.city === cityId && !e.ongoing);
    let themed = 0;
    if (nextHoliday.holiday.themeKeywords?.length) {
      for (const e of onDay) {
        const lower = `${e.title} ${e.blurb ?? ""} ${e.description ?? ""} ${e.venue ?? ""}`.toLowerCase();
        if (matchesHolidayTheme(nextHoliday.holiday, lower)) themed++;
      }
    }
    return { total: onDay.length, themed };
  }, [nextHoliday, allEvents, cityId]);

  const TODAY_LABEL = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    timeZone: "America/Los_Angeles",
  });

  return (
    <div>
      {/* ═══ HEADER ═══ */}
      <div style={{ marginBottom: 24 }}>
        <a href="/" style={{ fontSize: 11, color: "var(--sb-muted)", textDecoration: "none", fontFamily: "'Space Mono', monospace", letterSpacing: "0.06em" }}>
          ← SOUTH BAY TODAY
        </a>
        <h1 style={{
          fontFamily: "var(--sb-serif)", fontWeight: 900, fontSize: 42,
          color: "var(--sb-ink)", margin: "8px 0 4px", lineHeight: 1.05,
          letterSpacing: "-0.02em",
        }}>
          {cityName}
        </h1>
        <div style={{ fontSize: 13, color: "var(--sb-muted)" }}>
          {TODAY_LABEL}
          {weather && <span> · {weather}</span>}
          {eventsGenAt && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--sb-light)" }}>
              · Updated {formatAge(eventsGenAt)}
            </span>
          )}
        </div>
      </div>

      {/* ═══ HOLIDAY HEADS-UP ═══ */}
      {nextHoliday && (
        <CityHolidayBanner
          holiday={nextHoliday.holiday}
          iso={nextHoliday.iso}
          cityId={cityId}
          cityName={cityName}
          totalCount={cityHolidayCounts.total}
          themedCount={cityHolidayCounts.themed}
        />
      )}

      {/* ═══ CONDITIONS ═══ */}
      <CityConditions cityId={cityId} forecast={forecast} />

      {/* ═══ YOUR DAY ═══ */}
      <CityDayPlan cityId={cityId as City} cityName={cityName} />

      {/* ═══ TONIGHT AT CITY HALL ═══ */}
      {meetingIsToday && nextMeeting && (() => {
        const items = filterAgendaItems(nextMeeting.agendaItems);
        const shown = items.slice(0, 4);
        const more = items.length - shown.length;
        return (
        <div style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
          borderRadius: 6, padding: "16px 20px", marginBottom: 20, color: "#e0e7ff",
        }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#818cf8", marginBottom: 6 }}>
            Tonight at City Hall
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>
            {cityName} {nextMeeting.bodyName}
          </div>
          <div style={{ fontSize: 12, color: "#a5b4fc", marginTop: 4 }}>
            {nextMeeting.displayDate}
            {nextMeeting.location && <span> · {nextMeeting.location}</span>}
          </div>
          {shown.length > 0 && (
            <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
              {shown.map((it, i) => (
                <li key={i} style={{
                  fontSize: 12, color: "#e0e7ff", lineHeight: 1.4,
                  paddingLeft: 10, borderLeft: "2px solid #6366f1",
                }}>
                  {trimAgendaTitle(it.title)}
                </li>
              ))}
              {more > 0 && (
                <li style={{ fontSize: 11, color: "#a5b4fc", paddingLeft: 10, fontStyle: "italic" }}>
                  +{more} more on the agenda
                </li>
              )}
            </ul>
          )}
          {nextMeeting.url && (
            <a href={nextMeeting.url} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: "#818cf8", textDecoration: "none", fontWeight: 600 }}>
              View agenda →
            </a>
          )}
        </div>
        );
      })()}

      {/* ═══ TODAY'S EVENTS ═══ */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 800, fontSize: 20, margin: 0, color: "var(--sb-ink)" }}>
            {IS_WEEKEND_MODE ? "This Weekend" : "Today"} in {cityName}
          </h2>
          <a href={`/events?city=${encodeURIComponent(cityId)}`} style={{ fontSize: 11, fontWeight: 600, color: "var(--sb-ink)", textDecoration: "none", border: "1px solid var(--sb-border)", borderRadius: 100, padding: "4px 12px" }}>
            All events →
          </a>
        </div>

        {todayEvents.length === 0 ? (
          <div style={{ padding: "16px 0", color: "var(--sb-muted)", fontSize: 13, fontStyle: "italic" }}>
            Nothing on the calendar today. {tomorrowEvents.length > 0 ? "See tomorrow's events below." : "Check the events tab for upcoming events."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {todayEvents.slice(0, 8).map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
            {todayEvents.length > 8 && (
              <a href={`/events?city=${encodeURIComponent(cityId)}&date=${encodeURIComponent(TODAY_ISO)}`} style={{ fontSize: 12, fontWeight: 600, color: "var(--sb-accent)", padding: "8px 0", textDecoration: "none" }}>
                +{todayEvents.length - 8} more events →
              </a>
            )}
          </div>
        )}
      </div>

      {/* ═══ TOMORROW ═══ */}
      {tomorrowEvents.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: "0 0 10px", color: "var(--sb-ink)" }}>
            Tomorrow
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {tomorrowEvents.slice(0, 5).map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}

      {/* ═══ SCHOOL DAYS ═══ */}
      <CitySchoolDays cityId={cityId} cityName={cityName} />

      {/* ═══ HOUSING PULSE ═══ */}
      <CityHousingPulse cityId={cityId} />

      {/* ═══ FOOD PULSE ═══ */}
      <CityFoodPulse cityId={cityId} cityName={cityName} />

      {/* ═══ OPEN RIGHT NOW ═══ */}
      <CityOpenNow cityId={cityId} cityName={cityName} />

      {/* ═══ ROADWORK ═══ */}
      <CityRoadwork cityId={cityId} cityName={cityName} />

      {/* ═══ LOCAL CHATTER ═══ */}
      <CityChatter cityId={cityId} cityName={cityName} />

      {/* ═══ TECH NEIGHBORS ═══ */}
      <CityTechNeighbors cityName={cityName} />

      {/* ═══ MAJOR PROJECTS ═══ */}
      <CityMajorProjects cityId={cityId} cityName={cityName} />

      {/* ═══ CITY BRIEFING ═══ */}
      {briefing?.summary && (
        <div style={{
          background: "#FEFCE8", border: "1.5px solid #FDE68A", borderRadius: 6,
          padding: "16px 18px", marginBottom: 28,
        }}>
          <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: "0 0 8px", color: "var(--sb-ink)" }}>
            📍 This Week in {cityName}
          </h2>
          {briefing.highlights?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {briefing.highlights
                .filter((h: any) => !CLIENT_AGENDA_DROP_RE.some((re) => re.test(h?.title ?? "")))
                .slice(0, 4)
                .map((h: any, i: number) => (
                <div key={i} style={{ fontSize: 12, color: "#713f12", padding: "3px 0", display: "flex", gap: 6 }}>
                  <span>•</span>
                  <span>{trimAgendaTitle(h.title)}{h.when ? ` — ${h.when}` : ""}</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "#713f12", margin: 0 }}>
            {briefing.summary.slice(0, 250)}{briefing.summary.length > 250 ? "…" : ""}
          </p>
        </div>
      )}

      {/* ═══ NEXT COUNCIL MEETING ═══ */}
      {nextMeeting && !meetingIsToday && (() => {
        const items = filterAgendaItems(nextMeeting.agendaItems);
        const shown = items.slice(0, 4);
        const more = items.length - shown.length;
        return (
        <div style={{
          background: "var(--sb-card)", border: "1px solid var(--sb-border-light)", borderRadius: 6,
          padding: "14px 18px", marginBottom: 28,
        }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--sb-muted)", marginBottom: 6 }}>
            Next Council Meeting
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--sb-ink)" }}>
            {nextMeeting.bodyName} · {nextMeeting.displayDate}
          </div>
          {shown.length > 0 ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "var(--sb-muted)", margin: "10px 0 6px" }}>
                On the agenda
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                {shown.map((it, i) => (
                  <li key={i} style={{
                    fontSize: 12, color: "var(--sb-ink)", lineHeight: 1.4,
                    paddingLeft: 10, borderLeft: "2px solid var(--sb-border-light)",
                  }}>
                    {trimAgendaTitle(it.title)}
                  </li>
                ))}
                {more > 0 && (
                  <li style={{ fontSize: 11, color: "var(--sb-light)", paddingLeft: 10, fontStyle: "italic" }}>
                    +{more} more on the agenda
                  </li>
                )}
              </ul>
              {nextMeeting.url && (
                <a href={nextMeeting.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "var(--sb-accent)", textDecoration: "none", fontWeight: 600, marginTop: 10, display: "inline-block" }}>
                  View full agenda →
                </a>
              )}
            </>
          ) : (
            nextMeeting.url && (
              <a href={nextMeeting.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "var(--sb-accent)", textDecoration: "none", fontWeight: 600, marginTop: 4, display: "inline-block" }}>
                View agenda →
              </a>
            )
          )}
        </div>
        );
      })()}

      {/* ═══ RECENT CIVIC ACTIONS ═══ */}
      {aroundItems.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: "0 0 10px", color: "var(--sb-ink)" }}>
            Recent at City Hall
          </h2>
          {aroundItems.map((item: any, i: number) => {
            const ageLabel = formatRelativeDate(item.date);
            return (
              <div key={i} style={{ padding: "10px 0", borderBottom: i < aroundItems.length - 1 ? "1px solid var(--sb-border-light)" : "none" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                  <div style={{ fontFamily: "var(--sb-serif)", fontWeight: 600, fontSize: 14, color: "var(--sb-ink)", lineHeight: 1.35, flex: 1 }}>
                    {item.headline}
                  </div>
                  {ageLabel && (
                    <span style={{
                      flex: "0 0 auto",
                      fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      color: "var(--sb-light)", whiteSpace: "nowrap",
                    }}>
                      {ageLabel}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--sb-muted)", lineHeight: 1.5 }}>
                  {item.summary}
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--sb-accent)", textDecoration: "none", fontWeight: 600, marginLeft: 4 }}>
                      Source →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ LAST COUNCIL DIGEST ═══ */}
      {digest?.summary && digestAge < 30 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: "0 0 10px", color: "var(--sb-ink)" }}>
            Latest Council Meeting Summary
          </h2>
          <div style={{ fontSize: 11, color: "var(--sb-muted)", marginBottom: 6, fontFamily: "'Space Mono', monospace" }}>
            {digest.meetingDate}
          </div>
          {digest.keyTopics?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {digest.keyTopics.filter((t: string) => t.length > 5).slice(0, 5).map((topic: string, i: number) => (
                <span key={i} style={{
                  display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px",
                  borderRadius: 3, background: "#1e3a8a15", color: "#1e3a8a",
                  marginRight: 6, marginBottom: 4,
                }}>
                  {topic}
                </span>
              ))}
            </div>
          )}
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--sb-muted)", margin: 0 }}>
            {digest.summary}
          </p>
        </div>
      )}

      {/* ═══ THIS WEEK ═══ */}
      {thisWeekEvents.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: "0 0 10px", color: "var(--sb-ink)" }}>
            This Week in {cityName}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {thisWeekEvents.slice(0, 8).map((e) => {
              const dayLabel = new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--sb-border-light)" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--sb-muted)", fontFamily: "'Space Mono', monospace", minWidth: 65 }}>
                    {dayLabel}
                  </span>
                  <span style={{ fontSize: 15, width: 22, textAlign: "center" }}>{CAT_EMOJI[e.category] ?? "📅"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--sb-serif)", fontWeight: 600, fontSize: 13, color: "var(--sb-ink)" }}>
                      {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{e.title}</a> : e.title}
                    </span>
                  </div>
                  {e.cost === "free" && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#D1FAE5", color: "#065F46" }}>FREE</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      <div style={{ borderTop: "2px solid var(--sb-ink)", paddingTop: 16, marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <a href="/" style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 14, color: "var(--sb-ink)", textDecoration: "none" }}>
          ← South Bay Today
        </a>
        {city?.website && (
          <a href={city.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--sb-muted)", textDecoration: "none" }}>
            {cityName} official site →
          </a>
        )}
      </div>
    </div>
  );
}

// ── City Conditions ──
// 5-day forecast strip (re-uses /api/weather data already fetched in
// CityPage) + AQI chip pulled from air-quality.json. Glanceable
// "should-I-go-outside" info — coat, sunscreen, mask, run-or-not — that
// every other panel on this page assumes you've already decided on.

type AirQualityCityRow = {
  id: string;
  name: string;
  aqi: number;
  level: string;
  label: string;
  color: string;
  textColor: string;
  primaryPollutant: string;
  pm25: number;
  pm10: number;
  ozone: number;
  recommendation: string;
};

const CONDITIONS_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function conditionsTempColor(t: number): string {
  if (t >= 95) return "#C2290A";
  if (t >= 85) return "#E8531D";
  if (t >= 75) return "#D97706";
  if (t >= 65) return "#4D7C0F";
  if (t >= 55) return "#0284C7";
  return "#4F46E5";
}

function CityConditions({
  cityId,
  forecast,
}: {
  cityId: string;
  forecast: ForecastDay[] | null;
}) {
  const aqiData = ((airQualityJson as any).cities ?? []).find(
    (c: AirQualityCityRow) => c.id === cityId,
  ) as AirQualityCityRow | undefined;

  if ((!forecast || forecast.length === 0) && !aqiData) return null;

  // Tone down the eye-searing yellow on Moderate AQI; otherwise use the
  // category color at low alpha.
  const aqiBg = aqiData
    ? aqiData.label === "Good"
      ? "#D1FAE5"
      : aqiData.label === "Moderate"
      ? "#FEF9C3"
      : aqiData.color + "22"
    : "transparent";
  const aqiText = aqiData
    ? aqiData.label === "Good"
      ? "#065F46"
      : aqiData.label === "Moderate"
      ? "#78350F"
      : aqiData.textColor
    : "var(--sb-ink)";
  const aqiAccent = aqiData
    ? aqiData.color === "#FFFF00"
      ? "#F59E0B"
      : aqiData.color
    : "var(--sb-border)";

  return (
    <div style={{ marginBottom: 24 }}>
      {forecast && forecast.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${forecast.length}, 1fr)`,
          border: "1.5px solid var(--sb-border-light)",
          borderRadius: 8,
          overflow: "hidden",
          background: "#fff",
          marginBottom: aqiData ? 10 : 0,
        }}>
          {forecast.map((day, i) => {
            const isToday = day.date === TODAY_ISO;
            const d = new Date(day.date + "T12:00:00");
            const label = isToday ? "TODAY" : CONDITIONS_DAY_LABELS[d.getDay()].toUpperCase();
            const showRain = day.rainPct >= 20 || /🌦|🌧|⛈|🌨/.test(day.emoji);
            const color = conditionsTempColor(day.high);
            return (
              <div key={day.date} style={{
                padding: "10px 4px 8px",
                textAlign: "center",
                borderRight: i < forecast.length - 1 ? "1px solid var(--sb-border-light)" : "none",
                background: isToday ? `${color}10` : "transparent",
                borderTop: isToday ? `3px solid ${color}` : "3px solid transparent",
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono', monospace",
                  letterSpacing: "0.08em",
                  color: isToday ? color : "var(--sb-muted)",
                  marginBottom: 4,
                }}>{label}</div>
                <div style={{ fontSize: 20, lineHeight: 1, marginBottom: 4 }}>{day.emoji}</div>
                <div style={{
                  fontSize: isToday ? 26 : 22, fontWeight: 800, lineHeight: 1, color,
                  fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
                  marginBottom: 2,
                }}>{day.high}°</div>
                <div style={{ fontSize: 10, color: "var(--sb-muted)", fontVariantNumeric: "tabular-nums" }}>{day.low}°</div>
                {showRain && (
                  <div style={{
                    fontSize: 9, color: "#0284C7", fontWeight: 700,
                    marginTop: 2, fontVariantNumeric: "tabular-nums",
                    fontFamily: "'Space Mono', monospace",
                  }}>💧{day.rainPct}%</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aqiData && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "8px 12px",
          background: "#FAFAF5",
          border: "1px solid var(--sb-border-light)",
          borderLeft: `3px solid ${aqiAccent}`,
          borderRadius: 4,
          lineHeight: 1.4,
        }}>
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--sb-muted)",
          }}>Air Quality</span>
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em",
            color: aqiText, fontVariantNumeric: "tabular-nums",
          }}>{aqiData.aqi}</span>
          <span style={{
            display: "inline-block",
            padding: "2px 8px", borderRadius: 2,
            background: aqiBg, color: aqiText,
            fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono', monospace",
            letterSpacing: "0.05em", textTransform: "uppercase",
          }}>{aqiData.label}</span>
          <span style={{ flex: 1, minWidth: 180, color: "var(--sb-muted)", fontSize: 11 }}>
            {aqiData.recommendation}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Holiday banner ──
// Inline acknowledgment of the soonest civic/cultural holiday within 14
// days. Mirrors the rhythm of the EventsView banner but tuned for a city
// page: the date label changes between TODAY / TOMORROW / a weekday, and
// the right-side count is scoped to this city, not the whole region.

function dayPhraseFor(iso: string, todayIso: string): string {
  if (iso === todayIso) return "today";
  const todayDate = new Date(todayIso + "T12:00:00");
  const targetDate = new Date(iso + "T12:00:00");
  const dayDiff = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
  if (dayDiff === 1) return "tomorrow";
  if (dayDiff < 7) {
    return targetDate.toLocaleDateString("en-US", { weekday: "long" });
  }
  return targetDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CityHolidayBanner({
  holiday,
  iso,
  cityId,
  cityName,
  totalCount,
  themedCount,
}: {
  holiday: NamedHoliday;
  iso: string;
  cityId: string;
  cityName: string;
  totalCount: number;
  themedCount: number;
}) {
  const phrase = dayPhraseFor(iso, TODAY_ISO);
  const isToday = iso === TODAY_ISO;
  // Prefer themed pill+link when the holiday has keywords AND themed picks
  // exist for this city — that's what residents tapping a "Mother's Day"
  // banner expect. Fall back to the full event count otherwise so the
  // banner still works for cities/holidays with no themed matches.
  const showThemed = themedCount > 0 && !!holiday.themeKeywords?.length;
  const count = showThemed ? themedCount : totalCount;
  const hasEvents = count > 0;
  const themedParam = showThemed ? `&holiday=${encodeURIComponent(holiday.id)}` : "";
  const eventsHref = `/events?city=${encodeURIComponent(cityId)}&date=${encodeURIComponent(iso)}${themedParam}`;
  const pillLabel = showThemed
    ? `${themedCount} pick${themedCount === 1 ? "" : "s"} in ${cityName}`
    : `${totalCount} event${totalCount === 1 ? "" : "s"} in ${cityName}`;

  // Federal-holiday closure strip — libraries, post offices, banks, city
  // halls all close on federal holidays; SCC residential trash also delays
  // by one day when the holiday lands Mon–Fri.
  const closures = holidayClosureSummary(holiday, iso);
  const closureWeekdayLabel = closures
    ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })
    : null;

  return (
    <div style={{ marginBottom: 20 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "10px 14px",
        background: holiday.bg,
        border: `1px solid ${holiday.color}33`,
        borderRadius: closures ? "6px 6px 0 0" : 6,
        borderBottom: closures ? "none" : `1px solid ${holiday.color}33`,
        fontSize: 13,
        color: holiday.color,
        lineHeight: 1.45,
      }}
    >
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>{holiday.emoji}</span>
      <span style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase", opacity: 0.85,
      }}>
        {isToday ? "Holiday Today" : "Holiday Heads-Up"}
      </span>
      <span style={{ fontWeight: 700 }}>{holiday.label}</span>
      <span style={{ opacity: 0.85 }}>{phrase}</span>
      {hasEvents && (
        <a
          href={eventsHref}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "3px 10px",
            borderRadius: 100,
            background: "#ffffff",
            color: holiday.color,
            border: `1px solid ${holiday.color}55`,
            textDecoration: "none",
          }}
        >
          {pillLabel} <span aria-hidden>→</span>
        </a>
      )}
    </div>
    {closures && (
      <div
        style={{
          padding: "6px 14px 8px",
          background: holiday.bg,
          border: `1px solid ${holiday.color}33`,
          borderTop: `1px dashed ${holiday.color}55`,
          borderRadius: "0 0 6px 6px",
          fontSize: 11.5,
          color: holiday.color,
          lineHeight: 1.45,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          Closures
        </span>
        <span style={{ opacity: 0.95 }}>
          <strong style={{ fontWeight: 700 }}>Closed{closureWeekdayLabel ? ` ${closureWeekdayLabel}` : ""}:</strong>{" "}
          {closures.closed}
        </span>
        {closures.trashDelayed && (
          <span style={{ opacity: 0.95 }}>
            · <strong style={{ fontWeight: 700 }}>Trash:</strong> 1 day late through Friday
          </span>
        )}
        {closures.transit && (
          <span style={{ opacity: 0.95 }}>
            · <strong style={{ fontWeight: 700 }}>Transit:</strong> {closures.transit}
          </span>
        )}
      </div>
    )}
    </div>
  );
}

// ── Event Row ──

function EventRow({ event }: { event: UpcomingEvent }) {
  const time = formatTimeRange(event.time, event.endTime);
  const emoji = CAT_EMOJI[event.category] ?? "📅";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
      borderBottom: "1px solid var(--sb-border-light)",
    }}>
      <span style={{ fontSize: 18, width: 26, textAlign: "center", flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: "var(--sb-serif)", fontWeight: 600, fontSize: 14,
            color: "var(--sb-ink)", lineHeight: 1.3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {event.url ? (
              <a href={event.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                {event.title}
              </a>
            ) : event.title}
          </span>
          {event.cost === "free" && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#D1FAE5", color: "#065F46" }}>FREE</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--sb-muted)", display: "flex", gap: 6, marginTop: 2 }}>
          {time && <span style={{ fontWeight: 600 }}>{time}</span>}
          {event.venue && <span>· {event.venue}</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// City Day Plan — compact plan-day integration for city pages
// ---------------------------------------------------------------------------

const PLAN_ACCENTS = ["#FF6B35", "#E63946", "#06D6A0", "#7B2FBE", "#1A5AFF", "#FF3CAC"];
const PLAN_EMOJI: Record<string, string> = {
  food: "🍽️", outdoor: "🌿", museum: "🏛️", entertainment: "🎭",
  wellness: "💆", shopping: "🛍️", arts: "🎨", events: "📅", sports: "⚾",
};

type DayCard = {
  id: string; name: string; category: string; timeBlock: string;
  blurb: string; why: string; photoRef?: string | null;
  url?: string | null; mapsUrl?: string | null;
  cost?: string | null; costNote?: string | null;
  source: "event" | "place";
};

function CityDayPlan({ cityId, cityName }: { cityId: City; cityName: string }) {
  const [cards, setCards] = useState<DayCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/plan-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: cityId, kids: false, currentHour: new Date().getHours() }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.cards) setCards(d.cards); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cityId]);

  if (loading) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--sb-muted)", marginBottom: 10 }}>
          Your day in {cityName}
        </div>
        {[0,1,2].map((i) => (
          <div key={i} style={{ height: 48, borderRadius: 8, background: `${PLAN_ACCENTS[i]}10`, border: `1px solid ${PLAN_ACCENTS[i]}15`, marginBottom: 6, opacity: 0, animation: `cityPlanFadeIn 0.4s ease ${i * 0.15}s forwards` }} />
        ))}
        <style>{`@keyframes cityPlanFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
      </div>
    );
  }

  if (!cards.length) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--sb-muted)", marginBottom: 10 }}>
        Your day in {cityName}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {cards.map((card, i) => {
          const accent = PLAN_ACCENTS[i % PLAN_ACCENTS.length];
          const emoji = PLAN_EMOJI[card.category] || "📍";
          return (
            <div key={card.id} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 8, background: `${accent}08`, border: `1px solid ${accent}18` }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: card.photoRef ? `url(/api/place-photo?ref=${encodeURIComponent(card.photoRef || "")}&w=120&h=120) center/cover no-repeat, ${accent}15` : `${accent}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                {!card.photoRef && emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--sb-ink)" }}>{card.timeBlock}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, color: accent, textTransform: "uppercase" as const, letterSpacing: 1 }}>{card.category}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--sb-ink)", lineHeight: 1.2, marginBottom: 2 }}>{card.name}</div>
                <div style={{ fontSize: 12, color: "var(--sb-muted)", lineHeight: 1.35 }}>{card.blurb}</div>
              </div>
            </div>
          );
        })}
      </div>
      <a href="/#overview" style={{ display: "inline-block", marginTop: 10, fontSize: 12, fontWeight: 700, color: "var(--sb-accent)", textDecoration: "none" }}>
        Customize your plan →
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// City Housing Pulse — single-row median sale + YoY + days + over-list +
// rank vs. other South Bay cities. Renders nothing when the city is missing
// from real-estate.json or its YoY swing is volatile (>40%).
// ---------------------------------------------------------------------------

interface ReCityRow {
  city: string;
  cityId: string;
  periodEnd: string;
  medianSalePrice: number | null;
  medianSalePriceYoy: number | null;
  inventory: number | null;
  medianDaysOnMarket: number | null;
  avgSaleToList: number | null;
  soldAboveListPct: number | null;
}

function formatPriceShort(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

function formatPeriodLabel(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", year: "numeric",
  });
}

function ordinalRank(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function CityHousingPulse({ cityId }: { cityId: string }) {
  const data = realEstateJson as { cities: ReCityRow[]; sourceUrl?: string };
  const allCities = data.cities ?? [];
  const row = allCities.find((c) => c.cityId === cityId);
  if (!row || row.medianSalePrice == null) return null;

  // Drop unreliable YoY swings (>40%) — small-sample bias from low-inventory months.
  const yoyVolatile = row.medianSalePriceYoy != null && Math.abs(row.medianSalePriceYoy) > 0.4;

  const validForRank = allCities.filter((c) => c.medianSalePrice != null);
  const sortedByPrice = [...validForRank].sort(
    (a, b) => (b.medianSalePrice ?? 0) - (a.medianSalePrice ?? 0),
  );
  const priceRankIdx = sortedByPrice.findIndex((c) => c.cityId === cityId);
  const priceRank = priceRankIdx >= 0 ? priceRankIdx + 1 : null;
  const totalCities = validForRank.length;

  const yoy = yoyVolatile ? null : row.medianSalePriceYoy;
  const yoyLabel = yoy != null
    ? `${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%`
    : "—";
  const yoyUp = yoy != null ? yoy >= 0 : null;

  const days = row.medianDaysOnMarket;
  const overList = row.soldAboveListPct;
  const overListLabel = overList != null ? `${Math.round(overList * 100)}%` : "—";

  // Hottest city in the region by % over list — flame emoji if this is it.
  const overListRanked = allCities
    .filter((c) => c.soldAboveListPct != null)
    .sort((a, b) => (b.soldAboveListPct ?? 0) - (a.soldAboveListPct ?? 0));
  const isHottest = overListRanked[0]?.cityId === cityId;

  // Comparative blurb — calibrate to where this city sits on price.
  let comparison: string | null = null;
  if (priceRank && totalCities) {
    if (priceRank === 1) comparison = `Most expensive of ${totalCities} South Bay cities tracked.`;
    else if (priceRank <= 3) comparison = `${ordinalRank(priceRank)}-priciest of ${totalCities} cities tracked — top tier.`;
    else if (priceRank >= totalCities - 1) comparison = `Among the more affordable South Bay markets.`;
    else comparison = `${ordinalRank(priceRank)} of ${totalCities} cities tracked by median price.`;
  }

  const periodLabel = formatPeriodLabel(row.periodEnd);
  const sourceUrl = data.sourceUrl;

  const stats: { label: string; value: string; tone?: "up" | "down" | "neutral"; arrow?: string }[] = [
    { label: "Median sale", value: formatPriceShort(row.medianSalePrice) },
    { label: "1 yr", value: yoyLabel, tone: yoyUp == null ? "neutral" : yoyUp ? "up" : "down", arrow: yoyUp == null ? undefined : yoyUp ? "▲" : "▼" },
    { label: "Days on market", value: days != null ? `${days}d` : "—" },
    { label: "Over list", value: overListLabel },
  ];

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--sb-ink)" }}>
          🏡 Housing Pulse
          {isHottest && (
            <span title="Hottest South Bay market by % sold over list" style={{ marginLeft: 8, fontSize: 12 }}>🔥</span>
          )}
        </h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--sb-light)" }}>
          {periodLabel}
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 0,
        border: "1.5px solid var(--sb-border-light)",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
      }}>
        {stats.map((s, i) => {
          const color = s.tone === "up" ? "#15803D" : s.tone === "down" ? "#DC2626" : "var(--sb-ink)";
          return (
            <div key={s.label} style={{
              padding: "10px 12px",
              borderRight: i < stats.length - 1 ? "1px solid var(--sb-border-light)" : "none",
              minWidth: 0,
            }}>
              <div style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase" as const, color: "var(--sb-light)",
                marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {s.label}
              </div>
              <div style={{
                fontSize: 16, fontWeight: 700, color,
                fontVariantNumeric: "tabular-nums",
                display: "flex", alignItems: "baseline", gap: 3,
              }}>
                {s.arrow && <span style={{ fontSize: 11 }}>{s.arrow}</span>}
                <span>{s.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {comparison && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--sb-muted)" }}>
          {comparison}
        </div>
      )}

      <div style={{ marginTop: 6, fontSize: 10, color: "var(--sb-light)" }}>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Redfin Data Center
          </a>
        ) : (
          <span>Redfin Data Center</span>
        )}
        {" · All Residential"}
        {yoyVolatile && " · 1 yr hidden (volatile)"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// City Food Pulse — recently opened + coming-soon restaurants scoped to this
// city. Combines Santa Clara County health-permit records (covers most of
// the South Bay) with San Jose / Palo Alto building permits (where openings
// surface earlier). Renders nothing for cities with no entries.
// ---------------------------------------------------------------------------

interface FoodOpening {
  id: string;
  name: string;
  address: string | null;
  cityId: string | null;
  cityName?: string;
  date: string | null;
  status: "opened" | "coming-soon";
  blurb?: string | null;
}

interface FoodRow {
  id: string;
  name: string;
  address: string | null;
  date: string | null;
  status: "opened" | "coming-soon";
  blurb?: string | null;
}

function CityFoodPulse({ cityId, cityName }: { cityId: string; cityName: string }) {
  const sccData = sccFoodOpeningsJson as {
    generatedAt?: string;
    opened?: FoodOpening[];
    comingSoon?: FoodOpening[];
    sourceUrl?: string;
  };

  const radarData = restaurantRadarJson as {
    items?: Array<{
      id: string;
      city: string;
      name: string | null;
      address: string;
      signal: "opening" | "closing" | "activity";
      date: string;
      blurb?: string | null;
    }>;
  };

  // De-dupe radar entries against SCC entries (radar = building permit;
  // SCC = health permit; same place can show up in both).
  const sccNames = new Set<string>([
    ...(sccData.opened ?? []).map((i) => (i.name ?? "").trim().toLowerCase()).filter(Boolean),
    ...(sccData.comingSoon ?? []).map((i) => (i.name ?? "").trim().toLowerCase()).filter(Boolean),
  ]);

  const opened: FoodRow[] = (sccData.opened ?? [])
    .filter((i) => i.cityId === cityId && i.name)
    .map((i) => ({
      id: i.id,
      name: i.name,
      address: i.address,
      date: i.date,
      status: "opened" as const,
      blurb: i.blurb,
    }));

  const comingSoon: FoodRow[] = (sccData.comingSoon ?? [])
    .filter((i) => i.cityId === cityId && i.name)
    .map((i) => ({
      id: i.id,
      name: i.name,
      address: i.address,
      date: i.date,
      status: "coming-soon" as const,
      blurb: i.blurb,
    }));

  // Folding in radar = opening signals (San Jose has these; coverage of
  // other cities is sparse for now). Skip anything already in the SCC list.
  for (const r of radarData.items ?? []) {
    if (r.city !== cityId || !r.name || r.signal !== "opening") continue;
    if (sccNames.has(r.name.trim().toLowerCase())) continue;
    opened.push({
      id: r.id,
      name: r.name,
      address: r.address,
      date: r.date,
      status: "opened",
      blurb: r.blurb,
    });
  }

  // Most-recent first; keep at most 4 of each.
  opened.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  comingSoon.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const openedTop = opened.slice(0, 4);
  const comingSoonTop = comingSoon.slice(0, 4);

  if (openedTop.length === 0 && comingSoonTop.length === 0) return null;

  const sourceUrl = sccData.sourceUrl;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--sb-ink)" }}>
          🍴 Food Pulse
        </h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--sb-light)" }}>
          new in {cityName}
        </span>
      </div>

      <div style={{
        border: "1.5px solid var(--sb-border-light)",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
      }}>
        {openedTop.map((row, i) => (
          <FoodPulseRow
            key={row.id}
            row={row}
            cityName={cityName}
            isLast={i === openedTop.length - 1 && comingSoonTop.length === 0}
          />
        ))}
        {comingSoonTop.map((row, i) => (
          <FoodPulseRow
            key={row.id}
            row={row}
            cityName={cityName}
            isLast={i === comingSoonTop.length - 1}
          />
        ))}
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: "var(--sb-light)" }}>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Santa Clara County health permits
          </a>
        ) : (
          <span>Santa Clara County health permits</span>
        )}
        {" · Tap to find on Google Maps"}
      </div>
    </div>
  );
}

function FoodPulseRow({ row, cityName, isLast }: { row: FoodRow; cityName: string; isLast: boolean }) {
  const isOpen = row.status === "opened";
  const dateLabel = row.date
    ? new Date(row.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const mapsQuery = encodeURIComponent(
    [row.name, row.address, cityName].filter(Boolean).join(" "),
  );
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <a
      href={mapsHref}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 12px",
        borderBottom: isLast ? "none" : "1px solid var(--sb-border-light)",
        textDecoration: "none", color: "inherit",
      }}
    >
      <span style={{
        flex: "0 0 auto",
        fontFamily: "'Space Mono', monospace",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase" as const,
        padding: "2px 7px", borderRadius: 4,
        background: isOpen ? "#D1FAE5" : "#FEF3C7",
        color: isOpen ? "#065F46" : "#92400E",
        whiteSpace: "nowrap",
        marginTop: 2,
      }}>
        {isOpen ? "New" : "Soon"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 14,
          color: "var(--sb-ink)", lineHeight: 1.3,
        }}>
          {row.name}
        </div>
        {row.blurb && (
          <div style={{ fontSize: 12, color: "var(--sb-muted)", lineHeight: 1.4, marginTop: 2 }}>
            {row.blurb}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--sb-light)", marginTop: 3, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {row.address && <span>{row.address}</span>}
          {row.address && dateLabel && <span>·</span>}
          {dateLabel && (
            <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
              {isOpen ? `Opened ${dateLabel}` : `Permit ${dateLabel}`}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// City School Days — district status today + upcoming milestones for the
// districts that serve this city. With school year ending in early June,
// parents want a quick "is school open?" + "what's next?" answer scoped to
// their city, not the whole region.
// ---------------------------------------------------------------------------

interface SchoolDistrict {
  id: string;
  name: string;
  fullName: string;
  color: string;
  bg: string;
  cities: string[];
}

interface SchoolEvent {
  id: string;
  districtId: string;
  label: string;
  type: string;
  startDate: string;
  endDate: string;
}

const CITY_SCHOOL_TYPE_EMOJI: Record<string, string> = {
  testing: "📝",
  finals: "📋",
  graduation: "🎓",
  lastday: "🎉",
  break: "🏖️",
  holiday: "🏖️",
};

function daysFromToday(iso: string, todayIso: string): number {
  const today = new Date(todayIso + "T12:00:00").getTime();
  const target = new Date(iso + "T12:00:00").getTime();
  return Math.round((target - today) / 86400000);
}

function whenLabel(iso: string, todayIso: string): string {
  const days = daysFromToday(iso, todayIso);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
  }
  const m = new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${m} · ${days}d`;
}

function CitySchoolDays({ cityId, cityName }: { cityId: string; cityName: string }) {
  const districts = (schoolCalendarJson as { districts: SchoolDistrict[] }).districts ?? [];
  const events = (schoolCalendarJson as { events: SchoolEvent[] }).events ?? [];

  const myDistricts = districts.filter((d) => d.cities.includes(cityId));
  if (myDistricts.length === 0) return null;

  const myDistrictIds = new Set(myDistricts.map((d) => d.id));
  const districtById: Record<string, SchoolDistrict> = {};
  for (const d of myDistricts) districtById[d.id] = d;

  // Today's status per district: any event whose date range includes TODAY.
  // If none, we report "in session" (or "weekend" on Sat/Sun).
  const todayDate = new Date(TODAY_ISO + "T12:00:00");
  const isWeekend = todayDate.getDay() === 0 || todayDate.getDay() === 6;

  const districtStatus = myDistricts.map((d) => {
    const active = events.find(
      (e) => e.districtId === d.id && e.startDate <= TODAY_ISO && e.endDate >= TODAY_ISO,
    );
    return { district: d, active };
  });

  // Upcoming milestones across matched districts within 60 days. Group by
  // (date+label) so e.g. "Memorial Day" across all districts collapses to
  // one line with multiple badges.
  const horizon = (() => {
    const d = new Date(TODAY_ISO + "T12:00:00");
    d.setDate(d.getDate() + 60);
    return d.toLocaleDateString("en-CA");
  })();

  const upcomingRaw = events
    .filter((e) => myDistrictIds.has(e.districtId))
    .filter((e) => e.startDate > TODAY_ISO && e.startDate <= horizon)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const groupedMap = new Map<
    string,
    { startDate: string; endDate: string; label: string; type: string; districts: SchoolDistrict[] }
  >();
  for (const e of upcomingRaw) {
    const key = `${e.startDate}|${e.label}`;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        startDate: e.startDate,
        endDate: e.endDate,
        label: e.label,
        type: e.type,
        districts: [],
      });
    }
    const d = districtById[e.districtId];
    if (d) groupedMap.get(key)!.districts.push(d);
  }
  const upcoming = Array.from(groupedMap.values()).slice(0, 4);

  // Suppress component if there's literally nothing to say (no districts have
  // anything coming up in 60d AND no one's on break right now). Shouldn't
  // happen during the school year but guards the summer.
  const anyActive = districtStatus.some((s) => s.active);
  if (!anyActive && upcoming.length === 0 && !isWeekend) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--sb-ink)" }}>
          🏫 School Days
        </h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--sb-light)" }}>
          {myDistricts.length} district{myDistricts.length === 1 ? "" : "s"} in {cityName}
        </span>
      </div>

      <div style={{
        border: "1.5px solid var(--sb-border-light)",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
      }}>
        {/* Today row(s) — one per district. */}
        {districtStatus.map((s, i) => {
          const d = s.district;
          const active = s.active;
          let statusText: string;
          let statusColor: string;
          if (active) {
            const verb = active.endDate === active.startDate
              ? "" // single-day events read better w/o the trailing "thru"
              : ` thru ${new Date(active.endDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
            statusText = `${CITY_SCHOOL_TYPE_EMOJI[active.type] ?? "📚"} ${active.label}${verb}`;
            statusColor = active.type === "break" || active.type === "holiday" ? "#B45309" : "#1E3A8A";
          } else if (isWeekend) {
            statusText = "Weekend — no school";
            statusColor = "var(--sb-muted)";
          } else {
            statusText = "✓ In session";
            statusColor = "#15803D";
          }
          return (
            <div key={d.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px",
              borderBottom: i < districtStatus.length - 1 ? "1px solid var(--sb-border-light)" : "none",
            }}>
              <span title={d.fullName} style={{
                fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.04em",
                padding: "2px 7px", borderRadius: 4,
                background: d.bg, color: d.color, border: `1px solid ${d.color}33`,
                whiteSpace: "nowrap",
              }}>
                {d.name}
              </span>
              <span style={{ fontSize: 13, color: statusColor, fontWeight: 600, lineHeight: 1.3 }}>
                {statusText}
              </span>
            </div>
          );
        })}
      </div>

      {/* Upcoming list. */}
      {upcoming.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase" as const,
            color: "var(--sb-light)", marginBottom: 6,
          }}>
            Coming up
          </div>
          {upcoming.map((u, i) => {
            const allMyDistricts = u.districts.length === myDistricts.length && myDistricts.length >= 2;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                borderBottom: i < upcoming.length - 1 ? "1px solid var(--sb-border-light)" : "none",
              }}>
                <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>
                  {CITY_SCHOOL_TYPE_EMOJI[u.type] ?? "📚"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--sb-ink)", lineHeight: 1.3 }}>
                    {u.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--sb-muted)", marginTop: 1, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
                      {whenLabel(u.startDate, TODAY_ISO)}
                    </span>
                    {allMyDistricts ? (
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "var(--sb-border-light)", color: "var(--sb-muted)" }}>
                        all districts
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
                        {u.districts.map((d) => (
                          <span key={d.id} title={d.fullName} style={{
                            fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
                            padding: "1px 5px", borderRadius: 3,
                            background: d.bg, color: d.color, border: `1px solid ${d.color}33`,
                          }}>
                            {d.name}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Roadwork ──
// Per-city slice of Caltrans D4 lane closures. Same data feeding the homepage
// LaneClosuresCard but filtered to this city only — answers "is there work
// happening on roads near me?" without forcing a scan of the South Bay-wide
// list. Hidden when no closures touch this city.

type CityClosure = {
  id: string;
  route: string;
  direction: string;
  city: string;
  location: string;
  endLocation: string;
  lanesText: string;
  type: string;
  isFull: boolean;
  work: string;
  facility: string;
  start: string;
  end: string;
};

const ROUTE_BADGE: Record<string, { bg: string; fg: string }> = {
  "101": { bg: "#1E3A8A", fg: "#fff" },
  "280": { bg: "#0F766E", fg: "#fff" },
  "680": { bg: "#7E22CE", fg: "#fff" },
  "880": { bg: "#B45309", fg: "#fff" },
  "85":  { bg: "#0369A1", fg: "#fff" },
  "17":  { bg: "#15803D", fg: "#fff" },
  "87":  { bg: "#475569", fg: "#fff" },
  "237": { bg: "#9333EA", fg: "#fff" },
  "84":  { bg: "#1F2937", fg: "#fff" },
  "82":  { bg: "#374151", fg: "#fff" },
};

function parseClosurePT(local: string): number {
  if (!local) return NaN;
  const iso = local.replace(" ", "T") + ":00-07:00";
  return new Date(iso).getTime();
}

function fmtClosureClock(local: string): string {
  if (!local) return "";
  const t = local.split(" ")[1] ?? "";
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return "";
  let hr = parseInt(m[1], 10);
  const min = m[2];
  const ampm = hr >= 12 ? "PM" : "AM";
  if (hr === 0) hr = 12;
  if (hr > 12) hr -= 12;
  return min === "00" ? `${hr}${ampm}` : `${hr}:${min}${ampm}`;
}

function closureTimeBand(c: CityClosure, nowMs: number): string {
  const startMs = parseClosurePT(c.start);
  const endMs = parseClosurePT(c.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return c.start;
  if (startMs <= nowMs && endMs > nowMs) return `Now until ${fmtClosureClock(c.end)}`;

  const startDay = new Date(startMs).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "short" });
  const endDay = new Date(endMs).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "short" });
  const todayDay = new Date(nowMs).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "short" });
  const startHour = parseInt(new Date(startMs).toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }), 10);
  const overnight = startHour >= 16 && startDay !== endDay;
  const startLabel = fmtClosureClock(c.start);
  const endLabel = fmtClosureClock(c.end);

  if (startDay === todayDay && overnight) return `Tonight ${startLabel}–${endLabel}`;
  if (startDay === todayDay) return `Today ${startLabel}–${endLabel}`;
  if (startDay !== endDay) return `${startDay} ${startLabel}–${endLabel} ${endDay}`;
  return `${startDay} ${startLabel}–${endLabel}`;
}

function closureTypeLabel(c: CityClosure): string {
  if (c.isFull) {
    if (/On Ramp/i.test(c.facility)) return "On-ramp closed";
    if (/Off Ramp/i.test(c.facility)) return "Off-ramp closed";
    if (/Connector/i.test(c.facility)) return "Connector closed";
    return "Full closure";
  }
  if (/Alternating/i.test(c.type)) return `Alternating · ${c.lanesText}`;
  return c.lanesText;
}

function closureLocLabel(c: CityClosure): string {
  const loc = (c.location || "").trim();
  if (!loc || /^Route \d+$/i.test(loc)) return "freeway segment";
  return loc;
}

// Caltrans uses display-cased city names ("San Jose", "Santa Clara"); our
// cityIds are slugs ("san-jose"). Compare normalized.
function citySlug(name: string): string {
  return (name || "").toLowerCase().replace(/[\s']+/g, "-");
}

function CityRoadwork({ cityId, cityName }: { cityId: string; cityName: string }) {
  const data = laneClosuresJson as { closures?: CityClosure[]; generatedAt?: string };
  const all = (data.closures ?? []).filter((c) => citySlug(c.city) === cityId);
  if (all.length === 0) return null;

  const nowMs = Date.now();
  const active = all.filter((c) => parseClosurePT(c.start) <= nowMs && parseClosurePT(c.end) > nowMs);
  const upcoming = all
    .filter((c) => parseClosurePT(c.start) > nowMs)
    .sort((a, b) => parseClosurePT(a.start) - parseClosurePT(b.start));

  if (active.length === 0 && upcoming.length === 0) return null;

  const rows: { c: CityClosure; isActive: boolean }[] = [
    ...active.map((c) => ({ c, isActive: true })),
    ...upcoming.slice(0, Math.max(0, 5 - active.length)).map((c) => ({ c, isActive: false })),
  ];
  const moreCount = Math.max(0, all.length - rows.length);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--sb-ink)" }}>
          🚧 Roadwork in {cityName}
        </h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--sb-light)" }}>
          {active.length > 0
            ? `${active.length} active now`
            : `${all.length} scheduled`}
        </span>
      </div>

      <div style={{ border: "1.5px solid var(--sb-border-light)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        {rows.map(({ c, isActive }, i) => {
          const num = c.route.replace(/^\D+-/, "");
          const badge = ROUTE_BADGE[num] ?? { bg: "#1F2937", fg: "#fff" };
          return (
            <div key={c.id} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 12px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--sb-border-light)" : "none",
              background: isActive ? "#FEF3C7" : "transparent",
            }}>
              <span style={{
                fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 800,
                background: badge.bg, color: badge.fg,
                padding: "3px 7px", borderRadius: 4, minWidth: 32, textAlign: "center",
                flexShrink: 0,
              }}>
                {num}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color: "var(--sb-muted)" }}>
                    {c.direction}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--sb-ink)", lineHeight: 1.3 }}>
                    {closureLocLabel(c)}
                  </span>
                  {isActive && (
                    <span style={{
                      fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      padding: "1px 5px", borderRadius: 3,
                      background: "#B45309", color: "#fff",
                    }}>
                      Active now
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--sb-muted)", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: "'Space Mono', monospace", fontWeight: 700,
                    padding: "1px 5px", borderRadius: 3,
                    background: c.isFull ? "#FEE2E2" : "var(--sb-border-light)",
                    color: c.isFull ? "#991B1B" : "var(--sb-muted)",
                  }}>
                    {closureTypeLabel(c)}
                  </span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
                    {closureTimeBand(c, nowMs)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--sb-light)", marginTop: 2 }}>
                  {c.work}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {moreCount > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--sb-muted)", fontFamily: "'Space Mono', monospace" }}>
          +{moreCount} more scheduled · See <a href="/#transit" style={{ color: "var(--sb-accent)", textDecoration: "none", fontWeight: 600 }}>Transit tab →</a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// City Chatter — Reddit posts from this city's local subreddit, plus regional
// posts (r/bayarea, r/AskSF, r/siliconvalley) that name-drop this city.
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
// Match is case-insensitive, so we list canonical spellings the data uses.
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

function CityChatter({ cityId, cityName }: { cityId: string; cityName: string }) {
  const posts = ((redditPulseJson as { posts?: ChatterPost[] }).posts ?? []);
  const localSubs = (CITY_SUBREDDITS[cityId] ?? []).map((s) => s.toLowerCase());
  const cityNeedle = cityName.toLowerCase();

  const matches = posts.filter((p) => {
    const subLower = (p.sub || "").toLowerCase();
    if (localSubs.includes(subLower)) return true;
    if (REGIONAL_SUBS.has(p.sub)) {
      const hay = `${p.title || ""} ${p.summary || ""}`.toLowerCase();
      if (hay.includes(cityNeedle)) return true;
    }
    return false;
  });

  if (matches.length === 0) return null;

  // Local-sub posts first, then regional mentions. Within each group, freshest
  // first. We cap at 4 so the panel stays a peek, not a feed.
  const localFirst = matches
    .map((p) => ({ p, isLocal: localSubs.includes((p.sub || "").toLowerCase()) }))
    .sort((a, b) => {
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      return a.p.ageHours - b.p.ageHours;
    })
    .slice(0, 4);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--sb-ink)" }}>
          💬 Local Chatter
        </h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--sb-light)" }}>
          from reddit
        </span>
      </div>

      <div style={{ border: "1.5px solid var(--sb-border-light)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        {localFirst.map(({ p }, i) => (
          <a
            key={p.id}
            href={p.permalink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 12px",
              borderBottom: i < localFirst.length - 1 ? "1px solid var(--sb-border-light)" : "none",
              textDecoration: "none", color: "inherit",
            }}
          >
            <span style={{
              flex: "0 0 auto",
              fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.06em", textTransform: "uppercase" as const,
              padding: "2px 7px", borderRadius: 4,
              background: "#FEF3C7", color: "#92400E",
              whiteSpace: "nowrap", marginTop: 2,
            }}>
              r/{p.sub}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "var(--sb-serif)", fontWeight: 600, fontSize: 14,
                color: "var(--sb-ink)", lineHeight: 1.35,
              }}>
                {p.displayTitle || p.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--sb-light)", marginTop: 3, display: "flex", gap: 6, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
                <span>↑ {p.score}</span>
                <span>·</span>
                <span>💬 {p.numComments}</span>
                <span>·</span>
                <span>{chatterAge(p.ageHours)}</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: "var(--sb-light)" }}>
        Tap any thread to read on Reddit
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// City Open Now — top-rated spots open right at this moment in the city.
// Pool is pre-culled at build time (open-now-candidates.json: 30 places per
// city, rating ≥ 4.5, ratingCount ≥ 100). Component matches today's weekday
// hours against the user's current PT time and shows up to 6 currently-open
// places sorted by rating.
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
}

const OPEN_DAY_KEYS = ["sun","mon","tue","wed","thu","fri","sat"] as const;

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍴",
  entertainment: "🎭",
  outdoor: "🌿",
  shopping: "🛍️",
  museum: "🏛️",
  wellness: "💆",
  arts: "🎨",
};

function parseHM(s: string): number | null {
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

function fmtClock(mins: number): string {
  let m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  let h = Math.floor(m / 60);
  const min = m % 60;
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return min === 0 ? `${h} ${period}` : `${h}:${String(min).padStart(2, "0")} ${period}`;
}

function isOpenNow(
  hours: Record<string, string | undefined>,
  nowMinutes: number,
  dayIdx: number,
): { open: boolean; closesAt?: number } {
  const todayKey = OPEN_DAY_KEYS[dayIdx];
  const today = hours[todayKey];
  if (today) {
    const [a, b] = today.split("-");
    const start = parseHM(a ?? "");
    const end = parseHM(b ?? "");
    if (start !== null && end !== null) {
      if (start <= end) {
        if (nowMinutes >= start && nowMinutes < end) return { open: true, closesAt: end };
      } else {
        if (nowMinutes >= start) return { open: true, closesAt: end + 24 * 60 };
      }
    }
  }
  // Yesterday's range may spill past midnight into the current early hours.
  const yKey = OPEN_DAY_KEYS[(dayIdx + 6) % 7];
  const yest = hours[yKey];
  if (yest) {
    const [a, b] = yest.split("-");
    const start = parseHM(a ?? "");
    const end = parseHM(b ?? "");
    if (start !== null && end !== null && start > end && nowMinutes < end) {
      return { open: true, closesAt: end };
    }
  }
  return { open: false };
}

function CityOpenNow({ cityId, cityName }: { cityId: string; cityName: string }) {
  const allByCity = (openNowCandidatesJson as { cities?: Record<string, OpenNowCandidate[]> }).cities ?? {};
  const pool = allByCity[cityId] ?? [];
  if (pool.length === 0) return null;

  const nowPT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const nowMinutes = nowPT.getHours() * 60 + nowPT.getMinutes();
  const dayIdx = nowPT.getDay();

  const openRows = pool
    .map((p) => ({ p, ...isOpenNow(p.hours, nowMinutes, dayIdx) }))
    .filter((x) => x.open)
    .sort((a, b) => {
      if (b.p.rating !== a.p.rating) return b.p.rating - a.p.rating;
      return b.p.ratingCount - a.p.ratingCount;
    })
    .slice(0, 6);

  if (openRows.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--sb-ink)" }}>
          🟢 Open Right Now
        </h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--sb-light)" }}>
          top spots in {cityName}
        </span>
      </div>

      <div style={{ border: "1.5px solid var(--sb-border-light)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        {openRows.map(({ p, closesAt }, i) => {
          const emoji = CATEGORY_EMOJI[p.category ?? ""] ?? "📍";
          const closesSoon = typeof closesAt === "number" && (closesAt - nowMinutes) <= 60;
          const href = p.mapsUrl ?? p.url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, cityName].join(" "))}`;
          return (
            <a
              key={p.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px",
                borderBottom: i < openRows.length - 1 ? "1px solid var(--sb-border-light)" : "none",
                textDecoration: "none", color: "inherit",
              }}
            >
              <span style={{
                flex: "0 0 auto",
                fontSize: 16,
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 6,
                background: "var(--sb-border-light)",
                marginTop: 1,
              }}>
                {emoji}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 14,
                  color: "var(--sb-ink)", lineHeight: 1.3,
                }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--sb-light)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
                  {p.displayType && <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{p.displayType}</span>}
                  <span>·</span>
                  <span>★ {p.rating.toFixed(1)} ({p.ratingCount})</span>
                  {typeof closesAt === "number" && (
                    <>
                      <span>·</span>
                      <span style={{ color: closesSoon ? "#B45309" : "var(--sb-muted)" }}>
                        {closesSoon ? "Closes" : "Until"} {fmtClock(closesAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: "var(--sb-light)" }}>
        Tap any spot to find on Google Maps
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// City Tech Neighbors — tech companies HQ'd in this city. Surfaces the
// "your tech neighbors" angle: who's local, how big are they, are they
// hiring/growing/shrinking. Top 6 by SCC employees. Cities with no HQs
// (Saratoga, Los Gatos most months) silently skip.
// ---------------------------------------------------------------------------

function trendStyle(trend: TechTrend): { arrow: string; color: string; bg: string; label: string } {
  if (trend === "up")   return { arrow: "▲", color: "#15803D", bg: "#DCFCE7", label: "Growing" };
  if (trend === "down") return { arrow: "▼", color: "#B91C1C", bg: "#FEE2E2", label: "Shrinking" };
  return { arrow: "—", color: "#6B7280", bg: "#F3F4F6", label: "Stable" };
}

function fmtJobs(k: number): string {
  if (k >= 1) return `${k}K jobs`;
  const n = Math.round(k * 1000);
  return `${n} job${n === 1 ? "" : "s"}`;
}

function CityTechNeighbors({ cityName }: { cityName: string }) {
  const matches = TECH_COMPANIES
    .filter((c) => c.city === cityName)
    .sort((a, b) => b.sccEmployeesK - a.sccEmployeesK)
    .slice(0, 6);

  if (matches.length === 0) return null;

  const totalAll = TECH_COMPANIES.filter((c) => c.city === cityName).length;
  const totalJobsK = TECH_COMPANIES
    .filter((c) => c.city === cityName)
    .reduce((sum, c) => sum + c.sccEmployeesK, 0);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--sb-ink)" }}>
          💼 Tech Neighbors
        </h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--sb-light)" }}>
          HQ&apos;d in {cityName}
        </span>
      </div>

      <div style={{ border: "1.5px solid var(--sb-border-light)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        {matches.map((c, i) => {
          const t = trendStyle(c.trend);
          const cat = CATEGORY_LABELS[c.category];
          const linkHref = c.careersUrl ?? `/tech#${c.id}`;
          const isExternal = Boolean(c.careersUrl);
          return (
            <a
              key={c.id}
              href={linkHref}
              {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px",
                borderBottom: i < matches.length - 1 ? "1px solid var(--sb-border-light)" : "none",
                textDecoration: "none", color: "inherit",
              }}
            >
              <span style={{
                flex: "0 0 auto",
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 6,
                background: c.color,
                color: "#fff",
                fontFamily: "'Space Mono', monospace",
                fontSize: 11, fontWeight: 800,
                marginTop: 1,
              }}>
                {c.chartName.slice(0, 1).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <div style={{
                    fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 14,
                    color: "var(--sb-ink)", lineHeight: 1.3,
                  }}>
                    {c.name}
                  </div>
                  {c.ticker && (
                    <span style={{
                      fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: "var(--sb-light)",
                    }}>
                      {c.ticker}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--sb-light)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{cat}</span>
                  <span>·</span>
                  <span>{fmtJobs(c.sccEmployeesK)}</span>
                </div>
              </div>
              <span style={{
                flex: "0 0 auto",
                fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase" as const,
                padding: "3px 7px", borderRadius: 4,
                background: t.bg, color: t.color,
                whiteSpace: "nowrap", marginTop: 2,
              }}>
                {t.arrow} {t.label}
              </span>
            </a>
          );
        })}
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: "var(--sb-light)", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>
          {totalAll > matches.length
            ? `+${totalAll - matches.length} more · ~${Math.round(totalJobsK)}K SCC jobs total`
            : `~${Math.round(totalJobsK)}K SCC jobs total`}
        </span>
        <a href="/tech" style={{ color: "var(--sb-accent)", textDecoration: "none", fontWeight: 600 }}>
          All companies →
        </a>
      </div>
    </div>
  );
}

// ── Major projects panel ──
// Curated big-picture developments in the city: housing, mixed-use, transit,
// civic. Active and near-term work surfaces first; completed-only cities still
// hide the panel because nothing's actually moving on the ground.

const DEV_STATUS_PRIORITY: Record<DevStatus, number> = {
  "opening-soon": 0,
  "under-construction": 1,
  "approved": 2,
  "proposed": 3,
  "on-hold": 4,
  "completed": 5,
};

const DEV_STATUS_EMOJI: Record<DevStatus, string> = {
  "opening-soon": "🟢",
  "under-construction": "🚧",
  "approved": "✅",
  "proposed": "📐",
  "on-hold": "⏸",
  "completed": "🏁",
};

function CityMajorProjects({ cityId, cityName }: { cityId: string; cityName: string }) {
  const projects = DEV_PROJECTS
    .filter((p) => p.cityId === cityId)
    .sort((a, b) => {
      const pa = DEV_STATUS_PRIORITY[a.status] ?? 99;
      const pb = DEV_STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      // Featured projects bubble up within the same status.
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return 0;
    });

  if (projects.length === 0) return null;

  // Hide the panel if every project is "completed" — past-only doesn't pass
  // the "what would a resident notice" bar.
  const hasActive = projects.some((p) => p.status !== "completed");
  if (!hasActive) return null;

  const display = projects.slice(0, 4);
  const extra = projects.length - display.length;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <h2 style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--sb-ink)" }}>
          🏗️ Major Projects
        </h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--sb-light)" }}>
          What&apos;s being built in {cityName}
        </span>
      </div>

      <div style={{ border: "1.5px solid var(--sb-border-light)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        {display.map((p, i) => {
          const statusCfg = DEV_STATUS_CONFIG[p.status];
          const catLabel = DEV_CATEGORY_LABELS[p.category];
          const emoji = DEV_STATUS_EMOJI[p.status];
          return (
            <div
              key={p.id}
              style={{
                padding: "12px 14px",
                borderBottom: i < display.length - 1 ? "1px solid var(--sb-border-light)" : "none",
                display: "flex", flexDirection: "column", gap: 5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase" as const,
                  padding: "2px 7px", borderRadius: 4,
                  background: statusCfg.bg, color: statusCfg.color,
                  whiteSpace: "nowrap",
                }}>
                  {emoji} {statusCfg.label}
                </span>
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase" as const,
                  color: "var(--sb-light)",
                }}>
                  {catLabel}
                </span>
                {p.featured && (
                  <span style={{ fontSize: 10, color: "#b45309", fontWeight: 700, marginLeft: "auto" }}>
                    ★ Signature
                  </span>
                )}
              </div>
              <div style={{
                fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 14,
                color: "var(--sb-ink)", lineHeight: 1.3,
              }}>
                {p.name}
              </div>
              {(p.scale || p.timeline) && (
                <div style={{ fontSize: 11, color: "var(--sb-muted)", lineHeight: 1.4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {p.scale && <span>{p.scale}</span>}
                  {p.scale && p.timeline && <span style={{ color: "var(--sb-light)" }}>·</span>}
                  {p.timeline && <span>{p.timeline}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: "var(--sb-light)", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>
          {extra > 0 ? `+${extra} more in ${cityName}` : `${display.length} project${display.length === 1 ? "" : "s"} tracked`}
        </span>
        <a href="/gov" style={{ color: "var(--sb-accent)", textDecoration: "none", fontWeight: 600 }}>
          All developments →
        </a>
      </div>
    </div>
  );
}
