import { useState, useMemo, useEffect } from "react";
import type { City } from "../../../lib/south-bay/types";
import {
  EVENT_CATEGORIES,
  type EventCategory,
} from "../../../data/south-bay/events-data";
import schoolCalendarJson from "../../../data/south-bay/school-calendar.json";
import { holidayOn, nextHolidayWithin } from "../../../lib/south-bay/holidays";
import { currentHeritageMonths, matchesHeritage, type HeritageMonth } from "../../../lib/south-bay/heritageMonths";
import FreewayPulseCard from "../cards/FreewayPulseCard";
import LaneClosuresCard from "../cards/LaneClosuresCard";
import SunUvCard from "../cards/SunUvCard";
import CoastCard from "../cards/CoastCard";
import { buildGoogleCalendarUrl } from "../../../lib/south-bay/calendarLink";

const CITIES: { id: City; name: string }[] = [
  { id: "san-jose", name: "San Jose" },
  { id: "santa-clara", name: "Santa Clara" },
  { id: "sunnyvale", name: "Sunnyvale" },
  { id: "mountain-view", name: "Mountain View" },
  { id: "palo-alto", name: "Palo Alto" },
  { id: "los-altos", name: "Los Altos" },
  { id: "cupertino", name: "Cupertino" },
  { id: "saratoga", name: "Saratoga" },
  { id: "los-gatos", name: "Los Gatos" },
  { id: "campbell", name: "Campbell" },
  { id: "milpitas", name: "Milpitas" },
];

const CITY_LABELS: Record<string, string> = {
  "san-jose": "San Jose", "campbell": "Campbell", "los-gatos": "Los Gatos",
  "saratoga": "Saratoga", "cupertino": "Cupertino", "santa-clara": "Santa Clara",
  "sunnyvale": "Sunnyvale", "mountain-view": "Mountain View", "palo-alto": "Palo Alto",
  "milpitas": "Milpitas", "los-altos": "Los Altos",
};

/** Prepend city name to government meeting titles that don't already include it */
function meetingDisplayTitle(title: string, city: string): string {
  const MEETING_PATTERNS = [
    /planning commission/i, /city council/i, /town council/i,
    /board of supervisors/i, /design review/i, /parks commission/i,
    /transportation commission/i, /zoning/i, /committee meeting/i,
    /study session/i, /special meeting/i, /commission meeting/i,
    /board meeting/i, /public hearing/i,
  ];
  const cityName = city.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
  const isMeeting = MEETING_PATTERNS.some(p => p.test(title));
  if (!isMeeting) return title;
  if (title.toLowerCase().includes(cityName.toLowerCase())) return title;
  return `${cityName}: ${title}`;
}

interface Props {
  selectedCities: Set<City>;
  onToggleCity: (city: City) => void;
  onToggleAllCities: () => void;
}

interface UpcomingEvent {
  id: string;
  title: string;
  date: string;
  displayDate: string;
  time: string | null;
  endTime: string | null;
  venue: string;
  address: string;
  city: string;
  category: string;
  cost: string;
  description: string;
  url: string;
  source: string;
  kidFriendly: boolean;
  ongoing?: boolean;
  blurb?: string;
  image?: string | null;
  photoRef?: string | null;
}

// ── Time helpers ───────────────────────────────────────────────────────────

// Normalize varied scraper outputs to canonical "8:00 PM" form. Inputs we see
// in the data: "8PM" → "8:00 PM", "10:30AM" → "10:30 AM", "9:30 AM" → unchanged.
function normalizeClockTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (!m) return t;
  const hour = parseInt(m[1], 10);
  const min = m[2] ?? "00";
  const period = m[3].toUpperCase();
  return `${hour}:${min} ${period}`;
}

function formatTimeRange(timeIn: string | null, endTimeIn: string | null, isSports = false): string | null {
  const time = normalizeClockTime(timeIn);
  const endTime = normalizeClockTime(endTimeIn);
  if (!time) return null;
  if (!endTime || isSports) return time;
  const startPeriod = time.match(/(am|pm)$/i)?.[1]?.toUpperCase();
  const endPeriod = endTime.match(/(am|pm)$/i)?.[1]?.toUpperCase();
  if (startPeriod && endPeriod && startPeriod === endPeriod) {
    return `${time.replace(/\s*(am|pm)$/i, "")}–${endTime}`;
  }
  return `${time}–${endTime}`;
}

const NOW_MINUTES = (() => {
  const n = new Date();
  const nPT = new Date(n.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return nPT.getHours() * 60 + nPT.getMinutes();
})();

function hasNotStarted(time: string | null): boolean {
  if (!time) return true;
  const mins = parseTimeToMinutes(time);
  if (mins === null) return true;
  return mins > NOW_MINUTES;
}

// "Happening now": started, not yet ended. For events with no endTime, fall
// back to a 2-hour fuzzy window (a typical performance/talk window).
const FUZZY_DURATION_MIN = 120;
function isInProgressNow(time: string | null, endTime: string | null): boolean {
  if (!time) return false;
  const start = parseTimeToMinutes(time);
  if (start === null) return false;
  if (start > NOW_MINUTES) return false;
  const end = endTime ? parseTimeToMinutes(endTime) : null;
  if (end !== null) return NOW_MINUTES < end;
  return NOW_MINUTES - start <= FUZZY_DURATION_MIN;
}

function parseTimeToMinutes(t: string): number | null {
  const parts = t.split(/,/);
  const target = parts[parts.length - 1].trim();
  const m = target.match(/^(\d+)(?::(\d+))?\s*(am|pm)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2] ?? "0");
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h * 60 + min;
}

// ── Cost badge ─────────────────────────────────────────────────────────────

function costBadge(cost: string): { label: string; bg: string; fg: string; border: string } {
  if (cost === "free") return { label: "FREE", bg: "#F0FDF4", fg: "#166534", border: "#BBF7D0" };
  if (cost === "low") return { label: "$", bg: "#FFF7ED", fg: "#92400E", border: "#FDE68A" };
  return { label: "$$", bg: "#F5F3FF", fg: "#5B21B6", border: "#DDD6FE" };
}

function cityLabel(city: string) {
  return CITY_LABELS[city] ?? city.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

// ── Category accent colors ─────────────────────────────────────────────────

const CATEGORY_ACCENT: Record<string, { color: string; bg: string; label: string; emoji: string }> = {
  music:     { color: "#7C3AED", bg: "#F5F3FF", label: "Music",     emoji: "🎵" },
  arts:      { color: "#0E7490", bg: "#ECFEFF", label: "Arts",      emoji: "🎨" },
  family:    { color: "#C2410C", bg: "#FFF7ED", label: "Family",    emoji: "👨‍👩‍👦" },
  education: { color: "#1D4ED8", bg: "#EFF6FF", label: "Education", emoji: "📚" },
  community: { color: "#475569", bg: "#F8FAFC", label: "Community", emoji: "🤝" },
  market:    { color: "#15803D", bg: "#F0FDF4", label: "Market",    emoji: "🌽" },
  food:      { color: "#B45309", bg: "#FFFBEB", label: "Food",      emoji: "🍜" },
  outdoor:   { color: "#166534", bg: "#F0FDF4", label: "Outdoor",   emoji: "🌿" },
  sports:    { color: "#1E3A8A", bg: "#EFF6FF", label: "Sports",    emoji: "🏟️" },
};

// ── Date helpers ───────────────────────────────────────────────────────────

function todayPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function dayLabel(iso: string, todayIso: string, tomorrowIso: string): { primary: string; secondary: string } {
  const d = new Date(iso + "T12:00:00");
  const dateStr = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  if (iso === todayIso) return { primary: "TODAY", secondary: dateStr };
  if (iso === tomorrowIso) return { primary: "TOMORROW", secondary: dateStr };
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { primary: weekday, secondary: monthDay };
}

function shortDateLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Returns [saturdayIso, sundayIso] for "this weekend" relative to today.
// Sat: today + tomorrow. Sun: yesterday + today (today only, since past events
// hide via hasNotStarted). Mon–Fri: upcoming Sat + Sun.
function thisWeekendDates(todayIso: string): [string, string] {
  const dow = new Date(todayIso + "T12:00:00").getDay(); // 0=Sun … 6=Sat
  if (dow === 6) return [todayIso, addDays(todayIso, 1)];
  if (dow === 0) return [addDays(todayIso, -1), todayIso];
  const sat = addDays(todayIso, 6 - dow);
  return [sat, addDays(sat, 1)];
}

// ── Recurring detection ────────────────────────────────────────────────────
// "Live Music @ San Pedro Square" appears 48× across the dataset; "LEGO
// Tuesdays! @ Downtown Library" appears 25×, all on Tuesdays. Knowing an
// event is a weekly fixture changes the decision: "I missed it Saturday"
// becomes "I'll catch it next week." We detect this purely from the data
// (no scraper change required) and surface a small "Every Tue" / "Recurring"
// badge in the meta row.

interface RecurringInfo {
  /** Display label: "Every Tue", "Mon & Wed", "Most days", or "Recurring". */
  label: string;
  /** Distinct upcoming dates in this series. */
  count: number;
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function dowFromIso(iso: string): number | null {
  const d = new Date(iso + "T12:00:00");
  const n = d.getDay();
  return Number.isFinite(n) ? n : null;
}

function recurringKey(title: string, venue: string | null | undefined): string {
  return `${(title || "").trim().toLowerCase()}|${(venue || "").trim().toLowerCase()}`;
}

function computeRecurringMap(events: UpcomingEvent[]): Map<string, RecurringInfo> {
  const dateSets = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.title || !e.date) continue;
    if (e.ongoing && !e.time) continue; // exhibits aren't recurring weeklies
    const key = recurringKey(e.title, e.venue);
    if (!dateSets.has(key)) dateSets.set(key, new Set());
    dateSets.get(key)!.add(e.date);
  }
  const out = new Map<string, RecurringInfo>();
  for (const [key, dates] of dateSets) {
    if (dates.size < 3) continue;
    const dows = [0, 0, 0, 0, 0, 0, 0];
    for (const iso of dates) {
      const d = dowFromIso(iso);
      if (d !== null) dows[d]++;
    }
    const total = dows.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const ranked = dows
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c);
    const top = ranked[0];
    let label: string;
    if (top.c / total >= 0.7) {
      label = `Every ${DOW_SHORT[top.i]}`;
    } else if (ranked.length >= 2 && (ranked[0].c + ranked[1].c) / total >= 0.85) {
      label = `${DOW_SHORT[ranked[0].i]} & ${DOW_SHORT[ranked[1].i]}`;
    } else if (ranked.length >= 4) {
      label = "Most days";
    } else {
      label = "Recurring";
    }
    out.set(key, { label, count: dates.size });
  }
  return out;
}

// ── Event Card ─────────────────────────────────────────────────────────────

function eventPhotoUrl(event: UpcomingEvent, w = 160, h = 160): string | null {
  if (event.image) return event.image;
  if (event.photoRef) return `/api/place-photo?ref=${encodeURIComponent(event.photoRef)}&w=${w}&h=${h}`;
  return null;
}

function UpcomingEventCard({
  event,
  showDate,
  recurring,
}: {
  event: UpcomingEvent;
  showDate?: boolean;
  recurring?: RecurringInfo | null;
}) {
  const badge = costBadge(event.cost);
  const showBadge = !(event.cost === "free" && event.category === "community");
  const accent = CATEGORY_ACCENT[event.category] ?? CATEGORY_ACCENT.community;
  const photo = eventPhotoUrl(event, 200, 200);
  const body = (event.blurb && event.blurb.trim()) ? event.blurb : event.description;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--sb-radius-lg, 6px)",
        border: "1.5px solid var(--sb-border-light)",
        borderLeft: `4px solid ${accent.color}`,
        padding: "11px 14px",
        display: "flex",
        gap: 12,
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--sb-shadow-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      {/* Photo or category emoji */}
      {photo ? (
        <div
          style={{
            width: 72, height: 72, borderRadius: 8, flexShrink: 0,
            background: `url(${photo}) center/cover no-repeat, ${accent.bg}`,
            border: `1px solid var(--sb-border-light)`,
          }}
          aria-hidden
        />
      ) : (
        <div style={{
          width: 72, height: 72, borderRadius: 8, flexShrink: 0,
          background: accent.bg, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28,
        }}>
          {accent.emoji}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Category label + cost badge row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono', monospace",
            letterSpacing: "0.1em", textTransform: "uppercase", color: accent.color,
          }}>
            {accent.label}
          </span>
          {showBadge && (
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono', monospace",
              letterSpacing: "0.04em", padding: "1px 5px", borderRadius: 3,
              background: badge.bg, color: badge.fg, border: `1px solid ${badge.border}`,
            }}>
              {badge.label}
            </span>
          )}
          {event.kidFriendly && (
            <span style={{ fontSize: 9, color: "var(--sb-muted)" }}>👶</span>
          )}
        </div>

        {/* Title */}
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--sb-ink)", lineHeight: 1.3, marginBottom: 4 }}>
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              {meetingDisplayTitle(event.title, event.city)}
            </a>
          ) : meetingDisplayTitle(event.title, event.city)}
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px", fontSize: 11, color: "var(--sb-muted)" }}>
          {showDate && event.displayDate && (
            <><span style={{
              fontWeight: 700, color: "var(--sb-ink)", fontSize: 11,
              background: "var(--sb-card)", border: "1px solid var(--sb-border-light)",
              borderRadius: 3, padding: "0px 5px",
            }}>{event.displayDate}</span>
            {(event.time || event.venue || event.city) && <span style={{ color: "var(--sb-border)" }}>·</span>}</>
          )}
          {event.time && (
            <span style={{ fontWeight: 600, color: "var(--sb-ink)", fontSize: 11 }}>
              {formatTimeRange(event.time, event.endTime, event.category === "sports")}
            </span>
          )}
          {event.time && (event.venue || event.city) && <span style={{ color: "var(--sb-border)" }}>·</span>}
          {event.venue
            ? <span>{event.venue}</span>
            : <span>{cityLabel(event.city)}</span>
          }
          {event.venue && <span style={{ color: "var(--sb-border)" }}>·</span>}
          {event.venue && <span>{cityLabel(event.city)}</span>}
          {recurring && (
            <>
              <span style={{ color: "var(--sb-border)" }}>·</span>
              <span
                title={`${recurring.count} upcoming dates in this series`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "1px 6px",
                  borderRadius: 100,
                  background: "#F5F3FF",
                  color: "#6D28D9",
                  border: "1px solid #DDD6FE",
                }}
              >
                <span aria-hidden style={{ fontSize: 9 }}>🔁</span>
                {recurring.label}
              </span>
            </>
          )}
        </div>

        {/* Body — prefer blurb, fall back to description */}
        {body && (
          <p style={{ margin: "5px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--sb-muted)" }}>
            {body}
          </p>
        )}

        {/* Action row: Make it a day + Add to calendar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {event.date && event.city && (
            <MakeItADayButton eventId={event.id} city={event.city} date={event.date} />
          )}
          <AddToCalendarButton event={event} />
        </div>
      </div>
    </div>
  );
}

// ── "Add to calendar" button ───────────────────────────────────────────────

function AddToCalendarButton({ event }: { event: UpcomingEvent }) {
  const url = buildGoogleCalendarUrl({
    title: event.title,
    date: event.date,
    time: event.time,
    endTime: event.endTime,
    ongoing: event.ongoing,
    venue: event.venue,
    address: event.address,
    city: event.city,
    description: event.description,
    blurb: event.blurb,
    url: event.url,
  });
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "'Space Mono', monospace",
        letterSpacing: "0.04em",
        border: "1px solid var(--sb-border-light)",
        borderRadius: 4,
        background: "var(--sb-card)",
        color: "var(--sb-muted)",
        textDecoration: "none",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#999"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--sb-border-light)"; }}
      title="Add to Google Calendar"
    >
      📅 Add to calendar
    </a>
  );
}

// ── "Make it a day" button ─────────────────────────────────────────────────

function MakeItADayButton({ eventId, city, date }: { eventId: string; city: string; date: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state !== "idle") return;
    setState("loading");

    try {
      const planRes = await fetch("/api/plan-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          kids: false,
          lockedIds: [`event:${eventId}`],
          currentHour: 9,
          planDate: date,
        }),
      });
      if (!planRes.ok) throw new Error("plan failed");
      const planData = await planRes.json();

      const shareRes = await fetch("/api/share-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: planData.cards,
          city,
          kids: false,
          weather: planData.weather,
          planDate: date,
        }),
      });
      if (!shareRes.ok) throw new Error("share failed");
      const { url } = await shareRes.json();

      setState("done");
      window.open(url, "_blank");
    } catch {
      setState("idle");
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading"}
      style={{
        padding: "3px 10px",
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "'Space Mono', monospace",
        letterSpacing: "0.04em",
        border: "1px solid var(--sb-border-light)",
        borderRadius: 4,
        background: state === "loading" ? "#f5f5f5" : "var(--sb-card)",
        color: state === "done" ? "#16a34a" : "var(--sb-muted)",
        cursor: state === "loading" ? "wait" : "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { if (state === "idle") e.currentTarget.style.borderColor = "#999"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--sb-border-light)"; }}
    >
      {state === "loading" ? "Building plan..." : state === "done" ? "Plan ready ✓" : "Make it a day →"}
    </button>
  );
}

// ── School-year heads-up banner ─────────────────────────────────────────────
// Surfaces the soonest school-year milestone (AP exams, finals, graduation,
// last day, holidays, breaks) within the next 14 days for districts that
// overlap with the user's selected cities. One compact line, hidden when
// nothing's near. Data lives in src/data/south-bay/school-calendar.json.

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

const SCHOOL_TYPE_EMOJI: Record<string, string> = {
  testing: "📝",
  finals: "📝",
  graduation: "🎓",
  lastday: "🎉",
  break: "🏖️",
  holiday: "🏖️",
};

function schoolEventEmoji(type: string): string {
  return SCHOOL_TYPE_EMOJI[type] ?? "📚";
}

function schoolDateLabel(iso: string, todayIso: string, tomorrowIso: string): string {
  if (iso === todayIso) return "today";
  if (iso === tomorrowIso) return "tomorrow";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function SchoolHeadsUpBanner({ selectedCities }: { selectedCities: Set<City> }) {
  const todayIso = todayPT();
  const tomorrowIso = addDays(todayIso, 1);
  const horizonIso = addDays(todayIso, 14);

  const districts = (schoolCalendarJson as { districts: SchoolDistrict[] }).districts;
  const events = (schoolCalendarJson as { events: SchoolEvent[] }).events;

  const matchedDistrictIds = useMemo(() => {
    const set = new Set<string>();
    for (const d of districts) {
      if (d.cities.some((c) => selectedCities.has(c as City))) set.add(d.id);
    }
    return set;
  }, [districts, selectedCities]);

  const districtById = useMemo(() => {
    const m: Record<string, SchoolDistrict> = {};
    for (const d of districts) m[d.id] = d;
    return m;
  }, [districts]);

  // Find the soonest event date with at least one matched district. Group all
  // events that share that date AND label so e.g. Memorial Day collapses to a
  // single line with multiple district badges.
  const headline = useMemo(() => {
    const upcoming = events
      .filter((e) => e.startDate >= todayIso && e.startDate <= horizonIso)
      .filter((e) => matchedDistrictIds.has(e.districtId))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (upcoming.length === 0) return null;
    const soonestDate = upcoming[0].startDate;
    const sameDate = upcoming.filter((e) => e.startDate === soonestDate);
    const sameLabel = sameDate.filter((e) => e.label === sameDate[0].label);
    return {
      label: sameLabel[0].label,
      type: sameLabel[0].type,
      startDate: sameLabel[0].startDate,
      endDate: sameLabel[0].endDate,
      districts: sameLabel
        .map((e) => districtById[e.districtId])
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [events, matchedDistrictIds, districtById, todayIso, horizonIso]);

  if (!headline) return null;

  const dateLabel = schoolDateLabel(headline.startDate, todayIso, tomorrowIso);
  const isMultiDay = headline.endDate && headline.endDate !== headline.startDate;
  const verb = headline.type === "graduation" || headline.type === "lastday"
    ? "" // label already reads as a noun
    : isMultiDay ? "begin " : "";

  // When the same event hits every matched district (e.g. Memorial Day across
  // all 9 districts) the badge row becomes noisy. Collapse to a single
  // "all districts" pill in that case.
  const allMatched = headline.districts.length === matchedDistrictIds.size && headline.districts.length >= 4;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "8px 12px",
        marginBottom: 10,
        background: "#F5F3FF",
        border: "1px solid #DDD6FE",
        borderRadius: 8,
        fontSize: 12.5,
        color: "#4C1D95",
        lineHeight: 1.45,
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
        {schoolEventEmoji(headline.type)}
      </span>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6D28D9" }}>
        School year
      </span>
      <span style={{ fontWeight: 600 }}>
        {headline.label}
      </span>
      <span style={{ color: "#6D28D9" }}>
        {verb}
        {dateLabel}
      </span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {allMatched ? (
          <span
            title={headline.districts.map((d) => d.fullName).join(", ")}
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.04em",
              padding: "1px 6px",
              borderRadius: 4,
              background: "#EDE9FE",
              color: "#5B21B6",
              border: "1px solid #C4B5FD",
            }}
          >
            All districts
          </span>
        ) : (
          headline.districts.map((d) => (
            <span
              key={d.id}
              title={d.fullName}
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
                padding: "1px 6px",
                borderRadius: 4,
                background: d.bg,
                color: d.color,
                border: `1px solid ${d.color}33`,
              }}
            >
              {d.name}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

// ── Holiday heads-up banner ────────────────────────────────────────────────
// Surfaces the soonest civic/cultural holiday within the next 14 days
// (Mother's Day, Memorial Day, Cinco de Mayo, etc.). Hidden when nothing
// matches. Mirrors SchoolHeadsUpBanner's visual rhythm. When events exist
// on the holiday's date, renders as a button that jumps the date selector
// so residents can tap "Mother's Day → 12 events" and immediately see them.

interface HolidayHeadsUpBannerProps {
  eventCountByDate: Record<string, number>;
  onJumpToDate: (iso: string) => void;
}

function HolidayHeadsUpBanner({ eventCountByDate, onJumpToDate }: HolidayHeadsUpBannerProps) {
  const todayIso = todayPT();
  const tomorrowIso = addDays(todayIso, 1);
  const horizonIso = addDays(todayIso, 14);

  const next = useMemo(
    () => nextHolidayWithin(todayIso, horizonIso),
    [todayIso, horizonIso],
  );
  if (!next) return null;

  const dateLabel = schoolDateLabel(next.iso, todayIso, tomorrowIso);
  const { holiday } = next;
  const count = eventCountByDate[next.iso] ?? 0;
  const isClickable = count > 0;

  const innerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: "8px 12px",
    marginBottom: 10,
    background: holiday.bg,
    border: `1px solid ${holiday.color}33`,
    borderRadius: 8,
    fontSize: 12.5,
    color: holiday.color,
    lineHeight: 1.45,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    textAlign: "left",
    cursor: isClickable ? "pointer" : "default",
    transition: "background 0.12s, border-color 0.12s",
  };

  const inner = (
    <>
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{holiday.emoji}</span>
      <span style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", opacity: 0.85,
      }}>
        Holiday
      </span>
      <span style={{ fontWeight: 600 }}>{holiday.label}</span>
      <span style={{ opacity: 0.85 }}>{dateLabel}</span>
      {isClickable && (
        <span
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
            padding: "2px 8px",
            borderRadius: 100,
            background: "#ffffff",
            color: holiday.color,
            border: `1px solid ${holiday.color}55`,
          }}
        >
          {count} event{count === 1 ? "" : "s"} <span aria-hidden>→</span>
        </span>
      )}
    </>
  );

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={() => onJumpToDate(next.iso)}
        aria-label={`Jump to ${holiday.label} (${dateLabel}) — ${count} event${count === 1 ? "" : "s"}`}
        style={innerStyle}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${holiday.color}80`; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${holiday.color}33`; }}
      >
        {inner}
      </button>
    );
  }

  return <div style={innerStyle}>{inner}</div>;
}

// ── Heritage / observance month banner ─────────────────────────────────────
// Subtle one-liner acknowledging federally recognized heritage months that
// matter to large South Bay communities (AANHPI, Hispanic, Jewish, LGBTQ+,
// Filipino American, Black, Native American, etc.). Renders nothing outside
// active windows. Multiple observances can co-occur (May = AANHPI + Jewish
// American Heritage; October has 4 overlapping months) — they stack inline.

interface HeritageBannerProps {
  activeId: string | null;
  onToggle: (id: string | null) => void;
  countsById: Record<string, number>;
}
function HeritageMonthBanner({ activeId, onToggle, countsById }: HeritageBannerProps) {
  const todayIso = todayPT();
  const months = useMemo(() => currentHeritageMonths(todayIso), [todayIso]);
  if (months.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
        rowGap: 6,
        padding: "4px 12px",
        marginBottom: 10,
        fontSize: 11.5,
        color: "var(--sb-muted)",
        lineHeight: 1.45,
      }}
    >
      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginRight: 4,
        }}
      >
        Observing
      </span>
      {months.map((m) => {
        const isActive = activeId === m.id;
        const count = countsById[m.id] ?? 0;
        const hasEvents = count > 0;
        return (
            <button
              key={m.id}
              type="button"
              title={hasEvents ? `${m.blurb} — tap to filter ${count} matching event${count === 1 ? "" : "s"}` : m.blurb}
              onClick={() => onToggle(isActive ? null : m.id)}
              disabled={!hasEvents && !isActive}
              style={{
                display: "inline-flex",
                gap: 5,
                alignItems: "center",
                padding: "3px 9px",
                borderRadius: 100,
                fontSize: 11.5,
                lineHeight: 1.3,
                fontFamily: "inherit",
                color: isActive ? "#fff" : (hasEvents ? m.color : "var(--sb-muted)"),
                background: isActive ? m.color : (hasEvents ? m.bg : "transparent"),
                border: `1.5px solid ${isActive ? m.color : (hasEvents ? m.bg : "var(--sb-border)")}`,
                cursor: hasEvents || isActive ? "pointer" : "default",
                opacity: hasEvents || isActive ? 1 : 0.55,
                transition: "all 0.12s",
              }}
            >
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{m.emoji}</span>
              <span style={{ fontWeight: 600 }}>{m.label}</span>
              {hasEvents && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: isActive ? "rgba(255,255,255,0.22)" : "#fff",
                  color: isActive ? "#fff" : m.color,
                  borderRadius: 100, padding: "0 6px", lineHeight: "16px",
                  minWidth: 18, textAlign: "center",
                }}>
                  {count}
                </span>
              )}
            </button>
        );
      })}
    </div>
  );
}

const ACTIVE_HERITAGE_MONTHS_NOW = (iso: string): HeritageMonth[] => currentHeritageMonths(iso);

// ── Main view ──────────────────────────────────────────────────────────────

export default function EventsView({ selectedCities, onToggleCity, onToggleAllCities }: Props) {
  const [category, setCategory] = useState<EventCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [showKidsOnly, setShowKidsOnly] = useState(false);
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  // Tonight = today's events starting 5 PM or later that haven't begun yet.
  // High-value toggle for "what's happening tonight?" — the most common
  // question on a weekend afternoon.
  const [showTonightOnly, setShowTonightOnly] = useState(false);
  // Weekend = events on this Sat AND Sun, rendered grouped by day. The
  // companion to Tonight: lets weekday users see the full weekend in one
  // glance without flipping through date pills.
  const [showWeekendOnly, setShowWeekendOnly] = useState(false);
  // Live now = today's events that have started but haven't ended yet.
  // Inverts the default "hide started events" rule so users can see the
  // exhibit/festival/concert that's already going on right now.
  const [showLiveNowOnly, setShowLiveNowOnly] = useState(false);
  // Active heritage-month filter (e.g. AANHPI, Pride). Populated by clicking
  // a chip in the HeritageMonthBanner; null = no filter. Composes with the
  // other filters via matchesFilters.
  const [activeHeritageId, setActiveHeritageId] = useState<string | null>(null);
  const [upcomingData, setUpcomingData] = useState<{ events: UpcomingEvent[] } | null>(null);
  const [forecastByDate, setForecastByDate] = useState<
    Record<string, { high: number; rainPct: number; emoji: string; desc: string }>
  >({});

  const todayIso = todayPT();
  const tomorrowIso = addDays(todayIso, 1);
  const [weekendSat, weekendSun] = useMemo(() => thisWeekendDates(todayIso), [todayIso]);

  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  useEffect(() => {
    fetch("/api/south-bay/upcoming-events")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setUpcomingData(d ?? { events: [] }))
      .catch(() => setUpcomingData({ events: [] }));
  }, []);

  // 5-day forecast — used for the subtle banner above the day view, keyed by
  // ISO date so the banner can show conditions for whatever day is selected
  // (not just today). Open-Meteo returns 5 days; later dates fall through.
  useEffect(() => {
    const cacheKey = `sb-events-forecast-${todayIso}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setForecastByDate(JSON.parse(cached)); return; }
    } catch { /* sessionStorage unavailable */ }
    fetch(`/api/weather?city=san-jose`)
      .then((r) => r.json())
      .then((d) => {
        const days: { date: string; high: number; low: number; rainPct: number; emoji: string; desc: string }[] = d.forecast ?? [];
        if (days.length === 0) return;
        const map: Record<string, { high: number; rainPct: number; emoji: string; desc: string }> = {};
        for (const f of days) {
          map[f.date] = { high: f.high, rainPct: f.rainPct, emoji: f.emoji, desc: f.desc };
        }
        setForecastByDate(map);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(map)); } catch { /* sessionStorage unavailable */ }
      })
      .catch(() => {});
  }, [todayIso]);

  const allEvents = upcomingData?.events ?? [];
  // Reclassify: an event with `ongoing: true` AND a clock time is a recurring
  // event (weekly storytime, ESL class, multi-night theater run) that the
  // multi-day-detection rules in generate-events.mjs over-flagged. Treat it
  // as a normal event on its date so it shows up in the day view, not exiled
  // to the Exhibits section. True exhibits have no clock time.
  const upcomingEvents = useMemo(
    () => allEvents.filter((e) => !e.ongoing || !!e.time),
    [allEvents],
  );
  const ongoingEvents = useMemo(
    () => allEvents.filter((e) => e.ongoing && !e.time),
    [allEvents],
  );

  // Build the recurring-series map once across the full upcoming set so cards
  // can show "Every Tue" / "Recurring" badges without each one re-walking.
  const recurringMap = useMemo(() => computeRecurringMap(upcomingEvents), [upcomingEvents]);
  const recurringFor = (e: UpcomingEvent): RecurringInfo | null =>
    recurringMap.get(recurringKey(e.title, e.venue)) ?? null;

  const allCities = selectedCities.size === CITIES.length;

  // Search overrides single-day view
  const isSearching = search.trim().length > 0;
  const searchQ = search.trim().toLowerCase();

  const TONIGHT_FROM_MIN = 17 * 60; // 5 PM

  // Active heritage month object (for keyword matching). Null when no filter
  // is selected or when the active id no longer corresponds to a current
  // observance window (defensive — chips only render in-window).
  const activeHeritage = useMemo(() => {
    if (!activeHeritageId) return null;
    return ACTIVE_HERITAGE_MONTHS_NOW(todayIso).find((m) => m.id === activeHeritageId) ?? null;
  }, [activeHeritageId, todayIso]);

  const heritageHaystack = (e: UpcomingEvent): string =>
    `${e.title} ${e.blurb ?? ""} ${e.description ?? ""} ${e.venue ?? ""}`;

  const matchesActiveHeritage = (e: UpcomingEvent): boolean => {
    if (!activeHeritage) return true;
    return matchesHeritage(activeHeritage, heritageHaystack(e));
  };

  // Apply common filters (city, category, kids, search) to a list of events
  const matchesFilters = (e: UpcomingEvent): boolean => {
    if (!allCities && !selectedCities.has(e.city as City)) return false;
    if (category !== "all" && e.category !== category) return false;
    if (showKidsOnly && !e.kidFriendly) return false;
    if (showFreeOnly && e.cost !== "free") return false;
    if (showTonightOnly) {
      if (e.date !== todayIso) return false;
      if (!e.time) return false;
      const m = parseTimeToMinutes(e.time);
      if (m === null || m < TONIGHT_FROM_MIN) return false;
    }
    if (showWeekendOnly) {
      if (e.date !== weekendSat && e.date !== weekendSun) return false;
    }
    if (showLiveNowOnly) {
      if (e.date !== todayIso) return false;
      if (!isInProgressNow(e.time, e.endTime)) return false;
    }
    if (!matchesActiveHeritage(e)) return false;
    if (isSearching) {
      if (!e.title.toLowerCase().includes(searchQ) &&
          !(e.blurb || "").toLowerCase().includes(searchQ) &&
          !(e.description || "").toLowerCase().includes(searchQ) &&
          !e.city.toLowerCase().includes(searchQ) &&
          !e.venue.toLowerCase().includes(searchQ)) return false;
    }
    return true;
  };

  // Sort: pure start time ascending; events with no time come last
  const byStartTimeWithinDate = (a: UpcomingEvent, b: UpcomingEvent): number => {
    const aHasTime = a.time !== null && a.time !== undefined && a.time !== "";
    const bHasTime = b.time !== null && b.time !== undefined && b.time !== "";
    if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
    if (aHasTime && bHasTime) {
      const aMin = parseTimeToMinutes(a.time!) ?? 9999;
      const bMin = parseTimeToMinutes(b.time!) ?? 9999;
      if (aMin !== bMin) return aMin - bMin;
    }
    return a.title.localeCompare(b.title);
  };

  // Events visible for the currently selected day
  const dayEvents = useMemo(() => {
    if (isSearching) return [];
    return upcomingEvents
      .filter((e) => e.date === selectedDate)
      .filter(matchesFilters)
      // Hide today's events that have started — UNLESS the user has explicitly
      // asked to see what's happening right now via the Live Now pill.
      .filter((e) => showLiveNowOnly || !(e.date === todayIso && !hasNotStarted(e.time)))
      .sort(byStartTimeWithinDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, selectedDate, selectedCities, category, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, showLiveNowOnly, activeHeritage, weekendSat, weekendSun, todayIso, isSearching]);

  // Search-mode results (across all dates)
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return upcomingEvents
      .filter(matchesFilters)
      .filter((e) => e.date >= todayIso) // future only
      .sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return byStartTimeWithinDate(a, b);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, search, selectedCities, category, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, activeHeritage, weekendSat, weekendSun, todayIso, isSearching]);

  // Group search results by date for compact rendering
  const searchGroups = useMemo(() => {
    const groups: Record<string, UpcomingEvent[]> = {};
    for (const e of searchResults) {
      (groups[e.date] ||= []).push(e);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [searchResults]);

  // Weekend-mode events — both weekend days, grouped by date for rendering.
  // Past events for today (if today is Sat/Sun) hide via hasNotStarted.
  const weekendGroups = useMemo<[string, UpcomingEvent[]][]>(() => {
    if (!showWeekendOnly || isSearching) return [];
    const matches = upcomingEvents
      .filter((e) => e.date === weekendSat || e.date === weekendSun)
      .filter(matchesFilters)
      .filter((e) => !(e.date === todayIso && !hasNotStarted(e.time)))
      .sort(byStartTimeWithinDate);
    const groups: Record<string, UpcomingEvent[]> = {};
    for (const e of matches) (groups[e.date] ||= []).push(e);
    return [weekendSat, weekendSun]
      .filter((d) => (groups[d]?.length ?? 0) > 0)
      .map((d) => [d, groups[d]] as [string, UpcomingEvent[]]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, showWeekendOnly, weekendSat, weekendSun, isSearching, selectedCities, category, showKidsOnly, showFreeOnly, showTonightOnly, activeHeritage, todayIso]);

  // Determine which dates have any events visible (after city/category/kids/search filters)
  const datesWithEvents = useMemo(() => {
    const set = new Set<string>();
    for (const e of upcomingEvents) {
      if (e.date < todayIso) continue;
      if (!showLiveNowOnly && e.date === todayIso && !hasNotStarted(e.time)) continue;
      if (!matchesFilters(e)) continue;
      set.add(e.date);
    }
    return [...set].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, selectedCities, category, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, showLiveNowOnly, activeHeritage, weekendSat, weekendSun, todayIso, search]);

  // Auto-clamp selected date if it's no longer in datesWithEvents (e.g. user changed filters)
  useEffect(() => {
    if (isSearching) return;
    if (datesWithEvents.length === 0) {
      if (selectedDate !== todayIso) setSelectedDate(todayIso);
      return;
    }
    if (!datesWithEvents.includes(selectedDate)) {
      // Snap to the nearest future date that has events
      const nextDate = datesWithEvents.find((d) => d >= selectedDate) ?? datesWithEvents[0];
      setSelectedDate(nextDate);
    }
  }, [datesWithEvents, selectedDate, todayIso, isSearching]);

  // Per-category counts (for badges on category pills) — count across ALL
  // upcoming events so users can see which categories have anything at all,
  // regardless of which day is currently selected. Honors city/kids/search
  // filters since those reflect the user's intent across the whole feed.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of upcomingEvents) {
      if (e.date < todayIso) continue;
      if (!showLiveNowOnly && e.date === todayIso && !hasNotStarted(e.time)) continue;
      if (!allCities && !selectedCities.has(e.city as City)) continue;
      if (showKidsOnly && !e.kidFriendly) continue;
      if (showFreeOnly && e.cost !== "free") continue;
      if (showTonightOnly) {
        if (e.date !== todayIso) continue;
        if (!e.time) continue;
        const m = parseTimeToMinutes(e.time);
        if (m === null || m < TONIGHT_FROM_MIN) continue;
      }
      if (showWeekendOnly) {
        if (e.date !== weekendSat && e.date !== weekendSun) continue;
      }
      if (showLiveNowOnly) {
        if (e.date !== todayIso) continue;
        if (!isInProgressNow(e.time, e.endTime)) continue;
      }
      if (!matchesActiveHeritage(e)) continue;
      if (isSearching) {
        if (!e.title.toLowerCase().includes(searchQ) &&
            !(e.blurb || "").toLowerCase().includes(searchQ) &&
            !(e.description || "").toLowerCase().includes(searchQ) &&
            !e.city.toLowerCase().includes(searchQ) &&
            !e.venue.toLowerCase().includes(searchQ)) continue;
      }
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
    counts["all"] = Object.values(counts).reduce((a, b) => a + b, 0);
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, selectedCities, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, showLiveNowOnly, activeHeritage, weekendSat, weekendSun, todayIso, isSearching, searchQ]);

  // Per-city counts (for badges on city pills) — same approach as
  // categoryCounts but excludes the city filter so users can see what's
  // available in each city given the current category/kids/search filters.
  const cityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const e of upcomingEvents) {
      if (e.date < todayIso) continue;
      if (!showLiveNowOnly && e.date === todayIso && !hasNotStarted(e.time)) continue;
      if (category !== "all" && e.category !== category) continue;
      if (showKidsOnly && !e.kidFriendly) continue;
      if (showFreeOnly && e.cost !== "free") continue;
      if (showTonightOnly) {
        if (e.date !== todayIso) continue;
        if (!e.time) continue;
        const m = parseTimeToMinutes(e.time);
        if (m === null || m < TONIGHT_FROM_MIN) continue;
      }
      if (showWeekendOnly) {
        if (e.date !== weekendSat && e.date !== weekendSun) continue;
      }
      if (showLiveNowOnly) {
        if (e.date !== todayIso) continue;
        if (!isInProgressNow(e.time, e.endTime)) continue;
      }
      if (!matchesActiveHeritage(e)) continue;
      if (isSearching) {
        if (!e.title.toLowerCase().includes(searchQ) &&
            !(e.blurb || "").toLowerCase().includes(searchQ) &&
            !(e.description || "").toLowerCase().includes(searchQ) &&
            !e.city.toLowerCase().includes(searchQ) &&
            !e.venue.toLowerCase().includes(searchQ)) continue;
      }
      counts[e.city] = (counts[e.city] || 0) + 1;
      total++;
    }
    return { perCity: counts, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, category, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, showLiveNowOnly, activeHeritage, weekendSat, weekendSun, todayIso, isSearching, searchQ]);

  // Ongoing/exhibits filter (separate from day view)
  const filteredOngoing = useMemo(() => {
    return ongoingEvents.filter(matchesFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ongoingEvents, selectedCities, category, showKidsOnly, search]);

  // Per-pill counts for Kids/Free/Tonight/Weekend badges. Each count answers
  // "how many events would I see if I checked this box?" given the current
  // city/category/search filters — independent of the other pill states so
  // toggling one pill doesn't make the others' badges go to zero.
  const pillCounts = useMemo(() => {
    let kids = 0, free = 0, tonight = 0, weekend = 0, live = 0;
    for (const e of upcomingEvents) {
      if (e.date < todayIso) continue;
      // Live count needs started-but-ongoing events, so don't apply the
      // standard "hide started events" gate here. We bucket live separately.
      const startedToday = e.date === todayIso && !hasNotStarted(e.time);
      if (!allCities && !selectedCities.has(e.city as City)) continue;
      if (category !== "all" && e.category !== category) continue;
      if (isSearching) {
        if (!e.title.toLowerCase().includes(searchQ) &&
            !(e.blurb || "").toLowerCase().includes(searchQ) &&
            !(e.description || "").toLowerCase().includes(searchQ) &&
            !e.city.toLowerCase().includes(searchQ) &&
            !e.venue.toLowerCase().includes(searchQ)) continue;
      }
      if (e.date === todayIso && isInProgressNow(e.time, e.endTime)) live++;
      // Other pills only count not-yet-started events
      if (startedToday) continue;
      if (e.kidFriendly) kids++;
      if (e.cost === "free") free++;
      if (e.date === todayIso && e.time) {
        const m = parseTimeToMinutes(e.time);
        if (m !== null && m >= TONIGHT_FROM_MIN) tonight++;
      }
      if (e.date === weekendSat || e.date === weekendSun) weekend++;
    }
    return { kids, free, tonight, weekend, live };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, allCities, selectedCities, category, weekendSat, weekendSun, todayIso, isSearching, searchQ]);

  // Per-heritage event counts — answers "if I tapped this chip, how many
  // events would I see?" given the current city/category/kids/search/etc.
  // filters. Independent of the active heritage so the chip the user already
  // toggled stays clickable to un-toggle.
  const heritageCounts = useMemo(() => {
    const todayPTIso = todayIso;
    const months = ACTIVE_HERITAGE_MONTHS_NOW(todayPTIso);
    const counts: Record<string, number> = {};
    if (months.length === 0) return counts;
    for (const e of upcomingEvents) {
      if (e.date < todayPTIso) continue;
      if (e.date === todayPTIso && !hasNotStarted(e.time)) continue;
      if (!allCities && !selectedCities.has(e.city as City)) continue;
      if (category !== "all" && e.category !== category) continue;
      if (showKidsOnly && !e.kidFriendly) continue;
      if (showFreeOnly && e.cost !== "free") continue;
      if (showTonightOnly) {
        if (e.date !== todayPTIso) continue;
        if (!e.time) continue;
        const m = parseTimeToMinutes(e.time);
        if (m === null || m < TONIGHT_FROM_MIN) continue;
      }
      if (showWeekendOnly) {
        if (e.date !== weekendSat && e.date !== weekendSun) continue;
      }
      if (isSearching) {
        if (!e.title.toLowerCase().includes(searchQ) &&
            !(e.blurb || "").toLowerCase().includes(searchQ) &&
            !(e.description || "").toLowerCase().includes(searchQ) &&
            !e.city.toLowerCase().includes(searchQ) &&
            !e.venue.toLowerCase().includes(searchQ)) continue;
      }
      const text = `${e.title} ${e.blurb ?? ""} ${e.description ?? ""} ${e.venue ?? ""}`;
      for (const m of months) {
        if (matchesHeritage(m, text)) counts[m.id] = (counts[m.id] || 0) + 1;
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, allCities, selectedCities, category, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, weekendSat, weekendSun, todayIso, isSearching, searchQ]);

  // Per-date counts for the 7-day strip — same filter logic as datesWithEvents
  // but tallied per day so each pill in the strip can show how busy that day is.
  // Tonight/Weekend toggles are intentionally NOT applied here: the strip is
  // hidden in those modes anyway, and we want pure city/category/kids/free/
  // search filtering so the numbers stay consistent with what the user sees
  // when they tap a date pill.
  const eventCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of upcomingEvents) {
      if (e.date < todayIso) continue;
      if (e.date === todayIso && !hasNotStarted(e.time)) continue;
      if (!allCities && !selectedCities.has(e.city as City)) continue;
      if (category !== "all" && e.category !== category) continue;
      if (showKidsOnly && !e.kidFriendly) continue;
      if (showFreeOnly && e.cost !== "free") continue;
      if (!matchesActiveHeritage(e)) continue;
      if (isSearching) {
        if (!e.title.toLowerCase().includes(searchQ) &&
            !(e.blurb || "").toLowerCase().includes(searchQ) &&
            !(e.description || "").toLowerCase().includes(searchQ) &&
            !e.city.toLowerCase().includes(searchQ) &&
            !e.venue.toLowerCase().includes(searchQ)) continue;
      }
      counts[e.date] = (counts[e.date] || 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, allCities, selectedCities, category, showKidsOnly, showFreeOnly, activeHeritage, todayIso, isSearching, searchQ]);

  // Prev/next date buttons
  const prevDate = !isSearching && datesWithEvents.length > 0
    ? [...datesWithEvents].reverse().find((d) => d < selectedDate) ?? null
    : null;
  const nextDate = !isSearching && datesWithEvents.length > 0
    ? datesWithEvents.find((d) => d > selectedDate) ?? null
    : null;

  const dayLbl = dayLabel(selectedDate, todayIso, tomorrowIso);

  return (
    <>
      <div className="sb-section-header sb-events-header">
        <span className="sb-section-title">
          Events
          <span style={{ fontSize: 13, fontWeight: 400, color: "var(--sb-muted)", marginLeft: 8 }}>
            {upcomingEvents.length} upcoming
            {ongoingEvents.length > 0 && ` · ${ongoingEvents.length} on view`}
          </span>
        </span>
        <div className="sb-section-line" />
      </div>

      <SchoolHeadsUpBanner selectedCities={selectedCities} />
      <HolidayHeadsUpBanner
        eventCountByDate={eventCountByDate}
        onJumpToDate={(iso) => {
          if (isSearching) setSearch("");
          if (showWeekendOnly) setShowWeekendOnly(false);
          if (showTonightOnly) setShowTonightOnly(false);
          setSelectedDate(iso);
        }}
      />
      <HeritageMonthBanner
        activeId={activeHeritageId}
        onToggle={setActiveHeritageId}
        countsById={heritageCounts}
      />

      {/* Sticky filter bar — search + categories + cities + kids */}
      <div className="sb-events-sticky-filter">
        {/* Row 1: search + kids — search is the primary entry point */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 0 }}>
            <span aria-hidden style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              fontSize: 13, color: "var(--sb-light)", pointerEvents: "none",
            }}>🔍</span>
            <input
              type="search"
              placeholder="Search all events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "7px 12px 7px 32px",
                border: "1.5px solid var(--sb-border)", borderRadius: 100,
                fontFamily: "inherit", fontSize: 13, background: "#fff", color: "var(--sb-ink)",
                boxSizing: "border-box", outline: "none",
                transition: "border-color 0.12s, box-shadow 0.12s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--sbt-accent, #4F46E5)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(79, 70, 229, 0.12)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--sb-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <label style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontSize: 12, color: showKidsOnly ? "#fff" : "var(--sb-muted)",
            cursor: "pointer", userSelect: "none",
            padding: "5px 12px", borderRadius: 100,
            border: `1.5px solid ${showKidsOnly ? "var(--sbt-accent, #4F46E5)" : "var(--sb-border)"}`,
            background: showKidsOnly ? "var(--sbt-accent, #4F46E5)" : "#fff",
            fontWeight: showKidsOnly ? 600 : 500,
            transition: "all 0.12s",
          }}>
            <input
              type="checkbox" checked={showKidsOnly}
              onChange={(e) => setShowKidsOnly(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "var(--sbt-accent, #4F46E5)" }}
            />
            👶 Kids
            {pillCounts.kids > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: showKidsOnly ? "rgba(255,255,255,0.22)" : "#EEF2FF",
                color: showKidsOnly ? "#fff" : "var(--sbt-accent, #4F46E5)",
                borderRadius: 100, padding: "0 6px", lineHeight: "16px",
                minWidth: 18, textAlign: "center",
              }}>
                {pillCounts.kids}
              </span>
            )}
          </label>

          <label style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontSize: 12, color: showFreeOnly ? "#fff" : "var(--sb-muted)",
            cursor: "pointer", userSelect: "none",
            padding: "5px 12px", borderRadius: 100,
            border: `1.5px solid ${showFreeOnly ? "#15803D" : "var(--sb-border)"}`,
            background: showFreeOnly ? "#15803D" : "#fff",
            fontWeight: showFreeOnly ? 600 : 500,
            transition: "all 0.12s",
          }}>
            <input
              type="checkbox" checked={showFreeOnly}
              onChange={(e) => setShowFreeOnly(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "#15803D" }}
            />
            💵 Free
            {pillCounts.free > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: showFreeOnly ? "rgba(255,255,255,0.22)" : "#F0FDF4",
                color: showFreeOnly ? "#fff" : "#15803D",
                borderRadius: 100, padding: "0 6px", lineHeight: "16px",
                minWidth: 18, textAlign: "center",
              }}>
                {pillCounts.free}
              </span>
            )}
          </label>

          {pillCounts.live > 0 && (
            <label style={{
              display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
              fontSize: 12, color: showLiveNowOnly ? "#fff" : "var(--sb-muted)",
              cursor: "pointer", userSelect: "none",
              padding: "5px 12px", borderRadius: 100,
              border: `1.5px solid ${showLiveNowOnly ? "#DC2626" : "var(--sb-border)"}`,
              background: showLiveNowOnly ? "#DC2626" : "#fff",
              fontWeight: showLiveNowOnly ? 600 : 500,
              transition: "all 0.12s",
            }}>
              <input
                type="checkbox" checked={showLiveNowOnly}
                onChange={(e) => {
                  const next = e.target.checked;
                  setShowLiveNowOnly(next);
                  if (next) {
                    setSelectedDate(todayIso);
                    setShowTonightOnly(false);
                    setShowWeekendOnly(false);
                  }
                }}
                style={{ cursor: "pointer", accentColor: "#DC2626" }}
              />
              <span aria-hidden style={{
                display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                background: showLiveNowOnly ? "#fff" : "#DC2626",
                boxShadow: showLiveNowOnly
                  ? "0 0 0 2px rgba(255,255,255,0.35)"
                  : "0 0 0 2px rgba(220, 38, 38, 0.18)",
                animation: "sb-live-pulse 1.6s ease-in-out infinite",
              }} />
              Live now
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: showLiveNowOnly ? "rgba(255,255,255,0.22)" : "#FEF2F2",
                color: showLiveNowOnly ? "#fff" : "#DC2626",
                borderRadius: 100, padding: "0 6px", lineHeight: "16px",
                minWidth: 18, textAlign: "center",
              }}>
                {pillCounts.live}
              </span>
            </label>
          )}

          <label style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontSize: 12, color: showTonightOnly ? "#fff" : "var(--sb-muted)",
            cursor: "pointer", userSelect: "none",
            padding: "5px 12px", borderRadius: 100,
            border: `1.5px solid ${showTonightOnly ? "#7C3AED" : "var(--sb-border)"}`,
            background: showTonightOnly ? "#7C3AED" : "#fff",
            fontWeight: showTonightOnly ? 600 : 500,
            transition: "all 0.12s",
          }}>
            <input
              type="checkbox" checked={showTonightOnly}
              onChange={(e) => {
                const next = e.target.checked;
                setShowTonightOnly(next);
                if (next) {
                  setSelectedDate(todayIso);
                  setShowWeekendOnly(false);
                  setShowLiveNowOnly(false);
                }
              }}
              style={{ cursor: "pointer", accentColor: "#7C3AED" }}
            />
            🌙 Tonight
            {pillCounts.tonight > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: showTonightOnly ? "rgba(255,255,255,0.22)" : "#F5F3FF",
                color: showTonightOnly ? "#fff" : "#7C3AED",
                borderRadius: 100, padding: "0 6px", lineHeight: "16px",
                minWidth: 18, textAlign: "center",
              }}>
                {pillCounts.tonight}
              </span>
            )}
          </label>

          <label style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontSize: 12, color: showWeekendOnly ? "#fff" : "var(--sb-muted)",
            cursor: "pointer", userSelect: "none",
            padding: "5px 12px", borderRadius: 100,
            border: `1.5px solid ${showWeekendOnly ? "#EA580C" : "var(--sb-border)"}`,
            background: showWeekendOnly ? "#EA580C" : "#fff",
            fontWeight: showWeekendOnly ? 600 : 500,
            transition: "all 0.12s",
          }}>
            <input
              type="checkbox" checked={showWeekendOnly}
              onChange={(e) => {
                const next = e.target.checked;
                setShowWeekendOnly(next);
                if (next) {
                  setShowTonightOnly(false);
                  setShowLiveNowOnly(false);
                }
              }}
              style={{ cursor: "pointer", accentColor: "#EA580C" }}
            />
            🎉 Weekend
            {pillCounts.weekend > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: showWeekendOnly ? "rgba(255,255,255,0.22)" : "#FFF7ED",
                color: showWeekendOnly ? "#fff" : "#EA580C",
                borderRadius: 100, padding: "0 6px", lineHeight: "16px",
                minWidth: 18, textAlign: "center",
              }}>
                {pillCounts.weekend}
              </span>
            )}
          </label>
        </div>

        {/* Row 2: Category + city pills — same pill style, cities flow right after categories */}
        <div className="sb-events-cat-row" style={{ marginBottom: 10 }}>
          {EVENT_CATEGORIES.map((cat) => {
            const active = category === cat.id;
            const count = categoryCounts[cat.id] ?? 0;
            const showCount = count > 0;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id as EventCategory | "all")}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 11px 5px 10px",
                  border: `1.5px solid ${active ? "var(--sbt-accent, #4F46E5)" : "var(--sb-border)"}`,
                  borderRadius: 100,
                  background: active ? "var(--sbt-accent, #4F46E5)" : "#fff",
                  color: active ? "#fff" : "var(--sb-ink)",
                  fontSize: 12.5, fontWeight: active ? 600 : 500,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>{cat.emoji}</span>
                <span>{cat.label}</span>
                {showCount && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: active ? "rgba(255,255,255,0.22)" : "#EEF2FF",
                    color: active ? "#fff" : "var(--sbt-accent, #4F46E5)",
                    borderRadius: 100, padding: "0 6px", lineHeight: "16px",
                    minWidth: 18, textAlign: "center",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {/* Subtle divider between categories and cities */}
          <span aria-hidden style={{
            width: 1, height: 20, alignSelf: "center",
            background: "var(--sb-border)", margin: "0 4px",
          }} />

          {/* All cities pill — toggles between all/none */}
          <button
            onClick={onToggleAllCities}
            aria-pressed={allCities}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 11px 5px 10px",
              border: `1.5px solid ${allCities ? "var(--sbt-accent, #4F46E5)" : "var(--sb-border)"}`,
              borderRadius: 100,
              background: allCities ? "var(--sbt-accent, #4F46E5)" : "#fff",
              color: allCities ? "#fff" : "var(--sb-ink)",
              fontSize: 12.5, fontWeight: allCities ? 600 : 500,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>📍</span>
            <span>All cities</span>
            {cityCounts.total > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: allCities ? "rgba(255,255,255,0.22)" : "#EEF2FF",
                color: allCities ? "#fff" : "var(--sbt-accent, #4F46E5)",
                borderRadius: 100, padding: "0 6px", lineHeight: "16px",
                minWidth: 18, textAlign: "center",
              }}>
                {cityCounts.total}
              </span>
            )}
          </button>

          {/* Individual city pills — multiselect */}
          {CITIES.map((c) => {
            const inSelection = selectedCities.has(c.id);
            const count = cityCounts.perCity[c.id] ?? 0;
            const showCount = count > 0;
            return (
              <button
                key={c.id}
                onClick={() => onToggleCity(c.id)}
                aria-pressed={inSelection}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 11px",
                  border: `1.5px solid ${inSelection ? "var(--sbt-accent, #4F46E5)" : "var(--sb-border)"}`,
                  borderRadius: 100,
                  background: inSelection ? "var(--sbt-accent, #4F46E5)" : "#fff",
                  color: inSelection ? "#fff" : "var(--sb-ink)",
                  fontSize: 12.5, fontWeight: inSelection ? 600 : 500,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
                  whiteSpace: "nowrap",
                }}
              >
                <span>{c.name}</span>
                {showCount && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: inSelection ? "rgba(255,255,255,0.22)" : "#EEF2FF",
                    color: inSelection ? "#fff" : "var(--sbt-accent, #4F46E5)",
                    borderRadius: 100, padding: "0 6px", lineHeight: "16px",
                    minWidth: 18, textAlign: "center",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 7-day date strip — at-a-glance "what's busy this week" so users
            can pick a day without clicking through prev/next blindly. Hidden
            in search/weekend/tonight modes since those override day selection. */}
        {!isSearching && !showWeekendOnly && !showTonightOnly && (
          <div
            role="tablist"
            aria-label="Pick a day"
            style={{
              display: "flex", gap: 6,
              overflowX: "auto", overflowY: "hidden",
              marginTop: 10,
              paddingBottom: 4,
              scrollbarWidth: "thin",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {Array.from({ length: 7 }, (_, i) => addDays(todayIso, i)).map((iso) => {
              const active = iso === selectedDate;
              const count = eventCountByDate[iso] ?? 0;
              const empty = count === 0;
              const d = new Date(iso + "T12:00:00");
              const wkd = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
              const dayNum = d.getDate();
              const isToday = iso === todayIso;
              const holiday = holidayOn(iso);
              const ariaLabel = `${wkd} ${dayNum}, ${count} event${count === 1 ? "" : "s"}${holiday ? `, ${holiday.label}` : ""}`;
              return (
                <button
                  key={iso}
                  role="tab"
                  aria-selected={active}
                  aria-label={ariaLabel}
                  title={holiday ? holiday.label : undefined}
                  disabled={empty && !active}
                  onClick={() => setSelectedDate(iso)}
                  style={{
                    flex: "0 0 auto",
                    minWidth: 56,
                    padding: "6px 4px",
                    borderRadius: 8,
                    border: `1.5px solid ${active ? "var(--sb-ink)" : "var(--sb-border)"}`,
                    background: active ? "var(--sb-ink)" : "#fff",
                    color: active ? "#fff" : empty ? "var(--sb-light)" : "var(--sb-ink)",
                    cursor: empty && !active ? "default" : "pointer",
                    opacity: empty && !active ? 0.55 : 1,
                    fontFamily: "'Space Mono', monospace",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    transition: "all 0.12s",
                    position: "relative",
                  }}
                >
                  {holiday && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -4,
                        fontSize: 12,
                        lineHeight: 1,
                        filter: empty && !active ? "grayscale(0.4) opacity(0.7)" : "none",
                      }}
                    >
                      {holiday.emoji}
                    </span>
                  )}
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", opacity: 0.85 }}>
                    {isToday ? "TODAY" : wkd}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{dayNum}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    background: active ? "rgba(255,255,255,0.20)" : empty ? "transparent" : "#EEF2FF",
                    color: active ? "#fff" : empty ? "var(--sb-light)" : "var(--sbt-accent, #4F46E5)",
                    padding: "1px 6px", borderRadius: 100, lineHeight: "12px",
                    minWidth: 18, textAlign: "center",
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Day navigator — kept inside the sticky filter so event cards never butt against the section divider */}
        {!isSearching && !showWeekendOnly && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 14, marginTop: 8,
            paddingTop: 6,
          }}>
            <button
              onClick={() => prevDate && setSelectedDate(prevDate)}
              disabled={!prevDate}
              aria-label="Previous day"
              style={{
                width: 32, height: 32, borderRadius: 999,
                border: "1.5px solid var(--sb-border)",
                background: prevDate ? "#fff" : "transparent",
                color: prevDate ? "var(--sb-ink)" : "var(--sb-light)",
                cursor: prevDate ? "pointer" : "default",
                fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
                opacity: prevDate ? 1 : 0.4,
                fontFamily: "inherit",
              }}
            >
              ←
            </button>
            <div style={{ textAlign: "center", flex: "0 1 auto", minWidth: 0 }}>
              <div style={{
                fontSize: 18,
                fontWeight: 800,
                fontFamily: "'Space Mono', monospace",
                letterSpacing: "0.08em",
                color: "var(--sb-ink)",
                lineHeight: 1.1,
              }}>
                {dayLbl.primary}
              </div>
              <div style={{
                fontSize: 12,
                color: "var(--sb-muted)",
                fontFamily: "var(--sb-sans)",
                marginTop: 2,
              }}>
                {dayLbl.secondary}
              </div>
            </div>
            <button
              onClick={() => nextDate && setSelectedDate(nextDate)}
              disabled={!nextDate}
              aria-label="Next day"
              style={{
                width: 32, height: 32, borderRadius: 999,
                border: "1.5px solid var(--sb-border)",
                background: nextDate ? "#fff" : "transparent",
                color: nextDate ? "var(--sb-ink)" : "var(--sb-light)",
                cursor: nextDate ? "pointer" : "default",
                fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
                opacity: nextDate ? 1 : 0.4,
                fontFamily: "inherit",
              }}
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* Weather banner — surfaces the forecast for the selected day so people
          planning Saturday/Sunday don't only see today's weather. Open-Meteo
          gives 5 days; further-out days drop through. Hidden when filtering
          by category (would override the user's intent), in search mode, or
          in weekend-grouped mode (covers two days, not one). */}
      {forecastByDate[selectedDate] && category === "all" && !isSearching && !showWeekendOnly && (() => {
        const { high, rainPct, emoji, desc } = forecastByDate[selectedDate];
        const dayWord = selectedDate === todayIso
          ? "today"
          : selectedDate === tomorrowIso
            ? "tomorrow"
            : new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
        if (rainPct >= 40) {
          return (
            <div style={{
              marginBottom: 14, padding: "9px 14px",
              background: "#f0f9ff",
              border: "1.5px solid #bae6fd",
              borderRadius: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>🌧️</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--sb-ink)", fontFamily: "var(--sb-sans)" }}>
                  Rainy {dayWord} ({high}°F, {rainPct}% chance of rain)
                </span>
                <span style={{ fontSize: 12, color: "var(--sb-muted)", marginLeft: 6 }}>
                  — great day for a library program or indoor event.
                </span>
              </div>
            </div>
          );
        }
        const isClear = rainPct < 20 && (
          desc.toLowerCase().includes("clear") ||
          desc.toLowerCase().includes("sunny") ||
          desc.toLowerCase().includes("fair") ||
          rainPct === 0
        );
        if (isClear) {
          return (
            <div style={{
              marginBottom: 14, padding: "9px 14px",
              background: "#fffbeb",
              border: "1.5px solid #fcd34d",
              borderRadius: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--sb-ink)", fontFamily: "var(--sb-sans)" }}>
                  {desc} {dayWord}, {high}°F
                </span>
                <span style={{ fontSize: 12, color: "var(--sb-muted)", marginLeft: 6 }}>
                  — great day to get outside!
                </span>
              </div>
              <button
                onClick={() => setCategory("outdoor")}
                style={{
                  padding: "5px 12px", background: "#16a34a", color: "#fff",
                  border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "var(--sb-sans)", whiteSpace: "nowrap",
                }}
              >
                Show Outdoor Events
              </button>
            </div>
          );
        }
        return null;
      })()}

      {isSearching ? (
        /* Search mode — group results by date */
        <div>
          <div style={{ marginBottom: 14, fontSize: 12, color: "var(--sb-muted)", fontFamily: "'Space Mono', monospace" }}>
            {searchResults.length} result{searchResults.length === 1 ? "" : "s"} for &ldquo;{search}&rdquo;
            {searchResults.length === 0 && " — try clearing filters or broadening your search."}
          </div>
          {searchGroups.map(([date, events]) => (
            <div key={date} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, fontFamily: "'Space Mono', monospace",
                  letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--sb-ink)",
                }}>
                  {shortDateLabel(date)}
                </span>
                <span style={{ fontSize: 10, color: "var(--sb-light)", fontFamily: "'Space Mono', monospace" }}>
                  {events.length} event{events.length === 1 ? "" : "s"}
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--sb-border-light)" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {events.map((event) => <UpcomingEventCard key={event.id} event={event} recurring={recurringFor(event)} />)}
              </div>
            </div>
          ))}
        </div>
      ) : showWeekendOnly ? (
        /* Weekend mode — both Sat + Sun grouped together */
        <div>
          <div style={{ marginBottom: 14, fontSize: 12, color: "var(--sb-muted)", fontFamily: "'Space Mono', monospace" }}>
            This weekend · {shortDateLabel(weekendSat)} – {shortDateLabel(weekendSun)}
            {weekendGroups.length === 0 && " — nothing matches your filters."}
          </div>
          {weekendGroups.map(([date, events]) => (
            <div key={date} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, fontFamily: "'Space Mono', monospace",
                  letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--sb-ink)",
                }}>
                  {shortDateLabel(date)}
                </span>
                <span style={{ fontSize: 10, color: "var(--sb-light)", fontFamily: "'Space Mono', monospace" }}>
                  {events.length} event{events.length === 1 ? "" : "s"}
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--sb-border-light)" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {events.map((event) => <UpcomingEventCard key={event.id} event={event} recurring={recurringFor(event)} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Single-day view */
        <div>
          {/* Day events */}
          {dayEvents.length === 0 ? (
            <div className="sb-empty">
              <div className="sb-empty-title">Nothing on the calendar</div>
              <div className="sb-empty-sub">
                Try a different day, fewer filters, or search for something specific.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dayEvents.map((event) => <UpcomingEventCard key={event.id} event={event} recurring={recurringFor(event)} />)}
            </div>
          )}
        </div>
      )}

      {/* Exhibits — gallery shows that run for many days, no specific clock time */}
      {filteredOngoing.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid var(--sb-border)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sb-muted)" }}>
              Exhibits
            </span>
            <span style={{ fontSize: 10, color: "var(--sb-light)", fontFamily: "'Space Mono', monospace" }}>
              {filteredOngoing.length} on view
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredOngoing.map((event) => <UpcomingEventCard key={event.id} event={event} recurring={recurringFor(event)} />)}
          </div>
        </div>
      )}

      {/* Sun & UV — sunrise/sunset, daylight, peak UV; helps frame outdoor plans */}
      <SunUvCard />

      {/* Coast Watch — tides + Pacific water temp for HMB/coastal day trips */}
      <CoastCard />

      {/* Freeway Pulse — live travel times so readers can decide whether to head out */}
      <FreewayPulseCard />

      {/* Lane Closures — scheduled overnight construction work, paired with Pulse */}
      <LaneClosuresCard />
    </>
  );
}
