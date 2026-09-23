import { useState, useMemo, useEffect, useRef } from "react";
import type { City } from "../../../lib/south-bay/types";
import {
  EVENT_CATEGORIES,
  type EventCategory,
} from "../../../data/south-bay/events-data";
import {
  holidayOn,
  matchesHolidayTheme,
  NAMED_HOLIDAYS,
} from "../../../lib/south-bay/holidays";
import { buildGoogleCalendarUrl } from "../../../lib/south-bay/calendarLink";
import { isVirtualEvent, registrationLabel, requiresAttendanceConfirmation } from "../../../lib/south-bay/eventFilters.mjs";
import { cleanDisplayCopy, cleanDisplayName } from "../../../lib/south-bay/displayText.mjs";
import PageHero from "../PageHero";

const CITIES: { id: City; name: string }[] = [
  { id: "san-jose", name: "San José" },
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
  { id: "santa-cruz", name: "Santa Cruz" },
];

const CITY_LABELS: Record<string, string> = {
  "san-jose": "San José", "campbell": "Campbell", "los-gatos": "Los Gatos",
  "saratoga": "Saratoga", "cupertino": "Cupertino", "santa-clara": "Santa Clara",
  "sunnyvale": "Sunnyvale", "mountain-view": "Mountain View", "palo-alto": "Palo Alto",
  "milpitas": "Milpitas", "los-altos": "Los Altos", "santa-cruz": "Santa Cruz",
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
  virtual?: boolean;
  registration?: "none" | "required" | "appointment-only" | "full" | "closed" | null;
  registrationClosesBy?: string | null;
  sourceAudiences?: string[];
  attendanceNote?: string;
  attendanceStatus?: string;
  blurb?: string;
  image?: string | null;
  photoRef?: string | null;
  firstSeenAt?: string;
}

interface FeedState {
  events: UpcomingEvent[];
  /** "near" = the 14-day slice from /upcoming-events-near; "full" = everything. */
  stage: "near" | "full";
  /** Last date the near slice covers (its `window.through`); null for the full feed. */
  through: string | null;
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

// Newly-scraped events get a "JUST ADDED" badge for this many hours after
// their first sighting (tracked in event-first-seen-cache.json at ingest).
// Long enough that someone checking once a day will still catch it; short
// enough that it doesn't become wallpaper.
const JUST_ADDED_WINDOW_HOURS = 72;
function isJustAdded(firstSeenAt: string | null | undefined): boolean {
  if (!firstSeenAt) return false;
  const ts = new Date(firstSeenAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return (Date.now() - ts) <= JUST_ADDED_WINDOW_HOURS * 3600_000;
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

// Live PT minutes — re-renders the page each minute so "starts in N min"
// pills stay accurate when a tab is left open.
function ptMinutesNow(): number {
  const n = new Date();
  const nPT = new Date(n.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return nPT.getHours() * 60 + nPT.getMinutes();
}
function useNowMinutes(): number {
  const [mins, setMins] = useState<number>(() => ptMinutesNow());
  useEffect(() => {
    const id = setInterval(() => setMins(ptMinutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  return mins;
}

// Kicker badge tones — colors live in events.css (.sb-event-badge--<tone>).
type BadgeTone = "free" | "low" | "paid" | "kids" | "virtual" | "reg" | "live" | "soon" | "later" | "new";

// Urgency pill — only fires for events on today's date.
// • In progress → "HAPPENING NOW" (coral, pulsing)
// • Starts in 0–15 min → "STARTS IN N MIN" (rust, urgent)
// • Starts in 16–60 min → "STARTS IN N MIN" (amber, soon)
type UrgencyTag = { label: string; tone: BadgeTone; pulse: boolean };
function urgencyPill(
  date: string,
  time: string | null,
  endTime: string | null,
  todayIso: string,
  nowMins: number,
): UrgencyTag | null {
  if (date !== todayIso) return null;
  if (!time) return null;
  const start = parseTimeToMinutes(time);
  if (start === null) return null;
  const end = endTime ? parseTimeToMinutes(endTime) : null;
  // In-progress?
  if (start <= nowMins) {
    const stillRunning = end !== null ? nowMins < end : (nowMins - start) <= FUZZY_DURATION_MIN;
    if (!stillRunning) return null;
    return { label: "HAPPENING NOW", tone: "live", pulse: true };
  }
  const delta = start - nowMins;
  if (delta > 60) return null;
  const label = delta <= 1 ? "STARTING NOW" : `STARTS IN ${delta} MIN`;
  if (delta <= 15) {
    return { label, tone: "soon", pulse: false };
  }
  return { label, tone: "later", pulse: false };
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

// Returns null when the source never told us the price. This used to fall
// through to "$$" for anything that wasn't "free" or "low", which meant ~300
// events — volunteer workdays, city-newsletter listings, most Meetup rows —
// wore a paid badge built out of a null. An unknown price is not a price;
// show nothing and let the reader open the listing.
function costBadge(
  cost: string | null | undefined,
): { label: string; tone: BadgeTone } | null {
  if (cost === "free") return { label: "FREE", tone: "free" };
  if (cost === "low") return { label: "$", tone: "low" };
  if (cost === "paid") return { label: "$$", tone: "paid" };
  return null;
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

function eventTextBlob(event: UpcomingEvent): string {
  return `${event.title || ""} ${event.blurb || ""} ${event.description || ""} ${event.venue || ""}`.toLowerCase();
}

function isOngoingExhibitEvent(event: UpcomingEvent): boolean {
  const text = eventTextBlob(event);
  if (/\b(yoga|pilates|meditation|mindfulness|workshop|training|class|course|rounds?|speaker series|guest speaker|worship|service|volunteer|volunteering|al-anon|qualtrics|upstander|storytime)\b/.test(text)) {
    return false;
  }
  return /\b(exhibit|exhibition|showcase|installation|on view|gallery|art\s+show|book display|map exhibit|sculpture walk|works by|mfa thesis|archive room|collection|artist|artwork|sculpture|painting|photography|printmaker|contemporary art|art and architecture)\b/.test(text);
}

function normalizedEventCategory(event: UpcomingEvent): string {
  const text = eventTextBlob(event);
  if (isOngoingExhibitEvent(event)) return "arts";
  if (/\b(yoga|pilates|meditation|mindfulness|wellness|al-anon|worship|volunteer|volunteering)\b/.test(text)) return "community";
  if (/\b(guest speaker|speaker series|lecture|symposium|workshop|training|class|course|rounds?|seminar|qualtrics|research|science|reading)\b/.test(text)) return "education";
  if (/\b(concert|carillon|recital|choir|orchestra|jazz|music)\b/.test(String(event.title || "").toLowerCase())) return "music";
  return event.category || "community";
}

function normalizeEventForDisplay(event: UpcomingEvent): UpcomingEvent {
  const category = normalizedEventCategory(event);
  return category === event.category ? event : { ...event, category };
}

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
  todayIso,
  nowMins,
}: {
  event: UpcomingEvent;
  showDate?: boolean;
  recurring?: RecurringInfo | null;
  todayIso: string;
  nowMins: number;
}) {
  const badge = costBadge(event.cost);
  // Community/government events are always free, so the FREE badge adds nothing.
  const showBadge = badge !== null && !(event.cost === "free" && event.category === "community");
  const accent = CATEGORY_ACCENT[event.category] ?? CATEGORY_ACCENT.community;
  const photo = eventPhotoUrl(event, 240, 240);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const body = cleanDisplayCopy((event.blurb && event.blurb.trim()) ? event.blurb : event.description);
  const urgency = urgencyPill(event.date, event.time, event.endTime, todayIso, nowMins);
  const title = cleanDisplayName(meetingDisplayTitle(event.title, event.city));
  const venue = cleanDisplayName(event.venue);
  const virtual = isVirtualEvent(event);
  const regLabel = registrationLabel(event);
  const timeLabel = event.time ? formatTimeRange(event.time, event.endTime, event.category === "sports") : null;
  const dateChip = showDate && event.displayDate ? event.displayDate : null;
  const hasWhen = Boolean(dateChip || timeLabel || recurring);

  return (
    <article
      className="sb-event-card"
      style={{
        "--event-accent": accent.color,
        "--event-accent-bg": accent.bg,
      } as React.CSSProperties}
    >
      <div className="sb-event-card-media">
        {photo && !photoFailed ? (
          <img
            className={`sb-event-card-photo${photoLoaded ? " is-loaded" : ""}`}
            src={photo}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setPhotoLoaded(true)}
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className="sb-event-card-fallback" aria-hidden="true">
            {accent.emoji}
          </span>
        )}
      </div>

      <div className="sb-event-card-body">
        <div className="sb-event-card-head">
          <div className="sb-event-card-kicker">
            <span className="sb-event-card-category">{accent.label}</span>
            {showBadge && (
              <span className={`sb-event-badge sb-event-badge--${badge.tone}`}>{badge.label}</span>
            )}
            {event.kidFriendly && (
              <span className="sb-event-badge sb-event-badge--kids">Kids</span>
            )}
            {virtual && (
              <span
                className="sb-event-badge sb-event-badge--virtual"
                title="Online only — there is no in-person location"
              >
                Virtual
              </span>
            )}
            {regLabel && (
              <span
                className="sb-event-badge sb-event-badge--reg"
                title={
                  event.registration === "closed"
                    ? "Registration has ended — sign-ups are no longer possible for this event"
                    : event.registration === "full"
                      ? "All seats are taken — check the event page for a waitlist"
                      : "You cannot just turn up — this event needs a booking or registration in advance"
                }
              >
                {regLabel}
              </span>
            )}
            {urgency && (
              <span className={`sb-event-badge sb-event-badge--${urgency.tone}${urgency.pulse ? " is-pulsing" : ""}`}>
                {urgency.label}
              </span>
            )}
            {!urgency && isJustAdded(event.firstSeenAt) && (
              <span
                className="sb-event-badge sb-event-badge--new"
                title="Added to South Bay Today in the last 72 hours"
              >
                New
              </span>
            )}
          </div>

          <h3 className="sb-event-card-title">
            {event.url ? (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {title}
              </a>
            ) : title}
          </h3>

          <div className="sb-event-card-meta">
            {hasWhen && (
              <span className="sb-event-card-when">
                {dateChip && <span className="sb-event-date-chip">{dateChip}</span>}
                {timeLabel && <span className="sb-event-card-time">{timeLabel}</span>}
                {recurring && (
                  <span
                    className="sb-event-recurring"
                    title={`${recurring.count} upcoming dates in this series`}
                  >
                    {recurring.label}
                  </span>
                )}
              </span>
            )}
            {/* An online-only event has no city to go to — printing one next to a
                campus venue is what made the 2026-08-05 CRC meeting read as a
                place. Show "Online" and the host instead. */}
            <span className="sb-event-card-where">
              {virtual ? (
                <>
                  Online
                  {venue && <><span className="sb-event-sep" aria-hidden="true">·</span>{venue}</>}
                </>
              ) : venue ? (
                <>
                  {venue}
                  <span className="sb-event-sep" aria-hidden="true">·</span>
                  {cityLabel(event.city)}
                </>
              ) : (
                cityLabel(event.city)
              )}
            </span>
          </div>
        </div>

        {body && (
          <p className="sb-event-card-copy">
            {body}
          </p>
        )}
        {event.attendanceNote && (
          <p className="sb-event-card-note">{event.attendanceNote}</p>
        )}

        <div className="sb-event-card-actions">
          {event.date && event.city && !requiresAttendanceConfirmation(event) && (
            <MakeItADayButton eventId={event.id} city={event.city} date={event.date} />
          )}
          <DirectionsButton event={event} />
          <AddToCalendarButton event={event} />
        </div>
      </div>
    </article>
  );
}

// ── Loading skeletons ──────────────────────────────────────────────────────
// Shaped like the real card (thumb, kicker, title, meta, copy, actions) so the
// list doesn't jump when the feed lands. Server-rendered: the build-time HTML
// ships these instead of a spinner.

function EventCardSkeleton() {
  return (
    <div className="sb-event-card sb-event-card--skeleton" aria-hidden="true">
      <div className="sb-event-card-media">
        <span className="sb-skeleton sb-event-skel-thumb" />
      </div>
      <div className="sb-event-card-body">
        <span className="sb-skeleton sb-event-skel-line sb-event-skel-line--kicker" />
        <span className="sb-skeleton sb-event-skel-line sb-event-skel-line--title" />
        <span className="sb-skeleton sb-event-skel-line sb-event-skel-line--meta" />
        <span className="sb-skeleton sb-event-skel-line sb-event-skel-line--copy" />
        <span className="sb-event-skel-actions">
          <span className="sb-skeleton" />
          <span className="sb-skeleton" />
          <span className="sb-skeleton" />
        </span>
      </div>
    </div>
  );
}

function EventListSkeleton({ count = 4, label = "Loading events" }: { count?: number; label?: string }) {
  return (
    <div className="sb-events-list sb-events-list--loading" role="status">
      <span className="sb-events-visually-hidden">{label}…</span>
      {Array.from({ length: count }, (_, i) => <EventCardSkeleton key={i} />)}
    </div>
  );
}

/** Inline shimmer that stands in for a number that hasn't loaded yet. */
function CountSkeleton({ className = "" }: { className?: string }) {
  return <span className={`sb-skeleton sb-events-count-skel ${className}`.trim()} aria-hidden="true" />;
}

/** Hero-stat placeholder: reserves the number's line box, reads as "Loading". */
const STAT_SKELETON = (
  <>
    <span className="sb-skeleton sb-events-stat-skel" aria-hidden="true" />
    <span className="sb-events-visually-hidden">Loading</span>
  </>
);

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
      className="sb-btn sb-btn--quiet sb-event-action"
      title="Add to Google Calendar"
    >
      Calendar
    </a>
  );
}

// ── "Directions" button ────────────────────────────────────────────────────
// Most events have venue + city (1286/1304 as of cycle 120). Build a Google
// Maps search URL from whatever location bits we have. Skipping virtual events
// and the rare event with no venue/address keeps map results from landing on
// nonsense. Same compact pill style as Add to calendar so the actions read
// as a related set.

function buildEventMapsUrl(event: UpcomingEvent): string | null {
  // Flag first, text second — the flag catches source-declared virtual events
  // whose title and blurb never say so.
  if (isVirtualEvent(event)) return null;
  const cityName = event.city ? cityLabel(event.city) : "";
  // Prefer venue + address + city when available — most specific.
  // Some scrapers stuff the address into the venue field; if address starts
  // with venue (or vice versa) drop the venue to avoid "1234 Main St 1234
  // Main St" duplicates that confuse Maps' search ranking.
  let parts: string[];
  if (event.venue && event.address) {
    const v = event.venue.toLowerCase().trim();
    const a = event.address.toLowerCase().trim();
    if (a.startsWith(v) || v.startsWith(a)) {
      parts = [event.address, cityName, "CA"];
    } else {
      parts = [event.venue, event.address, cityName, "CA"];
    }
  } else {
    parts = [event.venue || "", event.address || "", cityName, "CA"];
  }
  const filtered = parts.filter((s) => s && s.trim().length > 0);
  if (filtered.length === 0) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(filtered.join(", "))}`;
}

function DirectionsButton({ event }: { event: UpcomingEvent }) {
  const url = buildEventMapsUrl(event);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="sb-btn sb-btn--quiet sb-event-action"
      title="Open in Google Maps"
    >
      Directions
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
          scope: "regional",
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
          city: planData.city || city,
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
      type="button"
      onClick={handleClick}
      disabled={state === "loading"}
      aria-busy={state === "loading" || undefined}
      className={`sb-btn sb-btn--quiet sb-event-action${state === "done" ? " sb-event-action--done" : ""}`}
    >
      {state === "loading" ? "Building…" : state === "done" ? "Plan ready" : "Plan day"}
    </button>
  );
}

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
  // Just added = events whose firstSeenAt is within the last 72 hours.
  // Gives repeat visitors a way to scan only what's new since their last
  // visit instead of re-reading the same list.
  const [showJustAddedOnly, setShowJustAddedOnly] = useState(false);
  // Active themed-holiday filter for a holiday that has theme keywords (e.g.
  // Mother's Day → narrows that day's view to mom-themed picks instead of
  // every event on Sunday). Auto-cleared when the user navigates to a
  // different date so it doesn't sneakily filter unrelated days.
  // Set from the `?holiday=` deep-link param after mount
  // (/events?city=X&date=Y&holiday=Z).
  const [activeThemedHolidayId, setActiveThemedHolidayId] = useState<string | null>(null);

  const todayIso = todayPT();
  const tomorrowIso = addDays(todayIso, 1);
  const [weekendSat, weekendSun] = useMemo(() => thisWeekendDates(todayIso), [todayIso]);

  // Day selection — defaults to today; a `?date=YYYY-MM-DD` deep link is
  // applied after mount (below) so the first render matches the server HTML.
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  // ── Feed loading ──
  // Two-stage load. The 14-day near feed (~40% of the payload) paints the
  // rail, the day list, and everything else inside its window right away. The
  // full feed (~2.5 MB decompressed) follows as soon as the near slice has
  // painted, or immediately when something needs it (search, a deep-linked
  // date). Until it lands, anything that aggregates the whole feed — the
  // Upcoming and Exhibits stats, Kids/Free/New and category/area counts,
  // series badges, search — shows a loading state instead of a number that
  // would jump, and a date past the near window shows skeleton rows rather
  // than "nothing on the calendar". Every list the near slice can answer
  // (dates inside its window, Tonight, Live now, Weekend) is identical in
  // both feeds, so nothing reshuffles when the full feed swaps in.
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [nearSettled, setNearSettled] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const [wantFullFeed, setWantFullFeed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d > todayIso) {
      setSelectedDate(d);
      // We can't know yet whether that date falls inside the near window.
      setWantFullFeed(true);
    }
    const h = params.get("holiday");
    if (h && NAMED_HOLIDAYS.some((x) => x.id === h)) setActiveThemedHolidayId(h);
    // Mount-only: deep links are read once, like the old state initializers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Near feed always loads — it's what paints the first real list. Only
    // apply it if nothing has landed yet (a full-feed response always wins).
    let cancelled = false;
    fetch("/api/south-bay/upcoming-events-near")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setFeed((prev) => prev ?? {
          events: Array.isArray(d.events) ? d.events : [],
          stage: "near",
          through: typeof d.window?.through === "string" ? d.window.through : null,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setNearSettled(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!wantFullFeed) return;
    let cancelled = false;
    fetch("/api/south-bay/upcoming-events")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        setFeed({ events: Array.isArray(d?.events) ? d.events : [], stage: "full", through: null });
      })
      .catch(() => {
        // Keep whatever the near feed painted; it becomes the final answer.
        if (!cancelled) setFullFailed(true);
      });
    return () => { cancelled = true; };
  }, [wantFullFeed]);

  useEffect(() => {
    // Prefetch the full feed once the near slice has painted (on the next
    // idle beat), with a 3s backstop if the near request is slow to settle.
    if (wantFullFeed) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (nearSettled && w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setWantFullFeed(true), { timeout: 1200 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setWantFullFeed(true), nearSettled ? 250 : 3000);
    return () => window.clearTimeout(id);
  }, [wantFullFeed, nearSettled]);

  // Whole-feed answers are final: the full feed landed, or it failed and the
  // near slice is all we'll get.
  const feedComplete = feed !== null && (feed.stage === "full" || fullFailed);
  // Last date the loaded slice can vouch for while the full feed is pending.
  const nearThrough = feed !== null && !feedComplete
    ? (feed.through ?? addDays(todayIso, 14))
    : null;
  const loadFailed = feed === null && nearSettled && fullFailed;
  const isLoadingEvents = feed === null && !loadFailed;

  const allEvents = useMemo(
    () => (feed?.events ?? []).map(normalizeEventForDisplay),
    [feed],
  );
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
    () => allEvents.filter((e) => e.ongoing && !e.time && isOngoingExhibitEvent(e)),
    [allEvents],
  );

  // Build the recurring-series map once across the full upcoming set so cards
  // can show "Every Tue" / "Recurring" badges without each one re-walking.
  // Series detection needs the whole feed — a 14-day slice sees two or three
  // dates of a weekly fixture and would mislabel or miss it — so badges wait
  // for the full feed rather than change label when it lands.
  const recurringMap = useMemo(
    () => (feedComplete ? computeRecurringMap(upcomingEvents) : null),
    [feedComplete, upcomingEvents],
  );
  const recurringFor = (e: UpcomingEvent): RecurringInfo | null =>
    recurringMap?.get(recurringKey(e.title, e.venue)) ?? null;

  // Live ticker so "Starts in N min" / "Happening now" pills stay accurate
  // when a tab is left open. Updates every 60s.
  const nowMins = useNowMinutes();

  const allCities = selectedCities.size === CITIES.length;

  // Search overrides single-day view
  const isSearching = search.trim().length > 0;
  const searchQ = search.trim().toLowerCase();

  const TONIGHT_FROM_MIN = 17 * 60; // 5 PM

  // The holiday object backing the active themed filter, plus its ISO date
  // for the current year. Recomputed when the active id changes; null when
  // no filter is set or the id no longer resolves.
  const themedHoliday = useMemo(() => {
    if (!activeThemedHolidayId) return null;
    const h = NAMED_HOLIDAYS.find((x) => x.id === activeThemedHolidayId);
    if (!h) return null;
    const iso = h.computeIso(Number(todayIso.slice(0, 4)));
    return { holiday: h, iso };
  }, [activeThemedHolidayId, todayIso]);

  const matchesActiveThemedHoliday = (e: UpcomingEvent): boolean => {
    if (!themedHoliday) return true;
    // Only narrow the view on the holiday date itself — events on other
    // dates pass through unaffected.
    if (e.date !== themedHoliday.iso) return true;
    const lower = `${e.title} ${e.blurb ?? ""} ${e.description ?? ""} ${e.venue ?? ""}`.toLowerCase();
    return matchesHolidayTheme(themedHoliday.holiday, lower);
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
    if (showJustAddedOnly && !isJustAdded(e.firstSeenAt)) return false;
    if (!matchesActiveThemedHoliday(e)) return false;
    if (isSearching) {
      if (!e.title.toLowerCase().includes(searchQ) &&
          !(e.blurb || "").toLowerCase().includes(searchQ) &&
          !(e.description || "").toLowerCase().includes(searchQ) &&
          !(e.city || "").toLowerCase().includes(searchQ) &&
          !(e.venue || "").toLowerCase().includes(searchQ)) return false;
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
  }, [upcomingEvents, selectedDate, selectedCities, category, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, showLiveNowOnly, showJustAddedOnly, weekendSat, weekendSun, todayIso, isSearching]);

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
  }, [upcomingEvents, search, selectedCities, category, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, showJustAddedOnly, weekendSat, weekendSun, todayIso, isSearching]);

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
  }, [upcomingEvents, showWeekendOnly, weekendSat, weekendSun, isSearching, selectedCities, category, showKidsOnly, showFreeOnly, showTonightOnly, todayIso]);

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
  }, [upcomingEvents, selectedCities, category, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, showLiveNowOnly, showJustAddedOnly, weekendSat, weekendSun, todayIso, search]);

  // While only the near slice is loaded, a snap target past its window can't
  // be known yet — hold the current date (showing skeleton rows) until the
  // full feed answers, instead of snapping somewhere the full feed disagrees.
  const clampPending = feed !== null
    && !feedComplete
    && !datesWithEvents.includes(selectedDate)
    && !datesWithEvents.some((d) => d >= selectedDate);

  // Auto-clamp selected date if it's no longer in datesWithEvents (e.g. user changed filters)
  useEffect(() => {
    if (isSearching) return;
    // Nothing to clamp against until a feed has landed — clamping an empty
    // list used to throw away `?date=` deep links before any data arrived.
    if (feed === null || clampPending) return;
    if (datesWithEvents.length === 0) {
      if (selectedDate !== todayIso) setSelectedDate(todayIso);
      return;
    }
    if (!datesWithEvents.includes(selectedDate)) {
      // Snap to the nearest future date that has events
      const nextDate = datesWithEvents.find((d) => d >= selectedDate) ?? datesWithEvents[0];
      setSelectedDate(nextDate);
    }
  }, [datesWithEvents, selectedDate, todayIso, isSearching, feed, clampPending]);

  // Auto-clear the themed-holiday filter when the user moves off the holiday
  // date or starts a search. The filter is intentionally tied to that one
  // date — silently filtering unrelated days would be surprising.
  useEffect(() => {
    if (!themedHoliday) return;
    if (isSearching || selectedDate !== themedHoliday.iso) {
      setActiveThemedHolidayId(null);
    }
  }, [themedHoliday, selectedDate, isSearching]);

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
      if (isSearching) {
        if (!e.title.toLowerCase().includes(searchQ) &&
            !(e.blurb || "").toLowerCase().includes(searchQ) &&
            !(e.description || "").toLowerCase().includes(searchQ) &&
            !(e.city || "").toLowerCase().includes(searchQ) &&
            !(e.venue || "").toLowerCase().includes(searchQ)) continue;
      }
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
    counts["all"] = Object.values(counts).reduce((a, b) => a + b, 0);
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, selectedCities, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, showLiveNowOnly, showJustAddedOnly, weekendSat, weekendSun, todayIso, isSearching, searchQ]);

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
      if (isSearching) {
        if (!e.title.toLowerCase().includes(searchQ) &&
            !(e.blurb || "").toLowerCase().includes(searchQ) &&
            !(e.description || "").toLowerCase().includes(searchQ) &&
            !(e.city || "").toLowerCase().includes(searchQ) &&
            !(e.venue || "").toLowerCase().includes(searchQ)) continue;
      }
      counts[e.city] = (counts[e.city] || 0) + 1;
      total++;
    }
    return { perCity: counts, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, category, showKidsOnly, showFreeOnly, showTonightOnly, showWeekendOnly, showLiveNowOnly, showJustAddedOnly, weekendSat, weekendSun, todayIso, isSearching, searchQ]);

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
    let kids = 0, free = 0, tonight = 0, weekend = 0, live = 0, justAdded = 0;
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
            !(e.city || "").toLowerCase().includes(searchQ) &&
            !(e.venue || "").toLowerCase().includes(searchQ)) continue;
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
      if (isJustAdded(e.firstSeenAt)) justAdded++;
    }
    return { kids, free, tonight, weekend, live, justAdded };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, allCities, selectedCities, category, weekendSat, weekendSun, todayIso, isSearching, searchQ]);

  // Per-date counts for the 7-day strip — same filter logic as datesWithEvents
  // but tallied per day so each pill in the strip can show how busy that day is.
  // Tonight/Weekend toggles are intentionally NOT applied here: the strip is
  // hidden in those modes anyway, and we want pure city/category/kids/free/
  // search filtering so the numbers stay consistent with what the user sees
  // when they tap a date pill.
  //
  // Unlike dayEvents (which hides today's already-started events so the list
  // reads as "what's still ahead"), this count intentionally does NOT apply
  // hasNotStarted — it's the full day's total, matching what the static
  // /events/[date] page and the "Today" hero stat report. That keeps the
  // pill's number legible as "how many things are on the calendar today"
  // even when some have already started; hasNotStarted still governs which
  // events actually render in the list below (see dayEvents).
  const eventCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of upcomingEvents) {
      if (e.date < todayIso) continue;
      if (!allCities && !selectedCities.has(e.city as City)) continue;
      if (category !== "all" && e.category !== category) continue;
      if (showKidsOnly && !e.kidFriendly) continue;
      if (showFreeOnly && e.cost !== "free") continue;
      if (isSearching) {
        if (!e.title.toLowerCase().includes(searchQ) &&
            !(e.blurb || "").toLowerCase().includes(searchQ) &&
            !(e.description || "").toLowerCase().includes(searchQ) &&
            !(e.city || "").toLowerCase().includes(searchQ) &&
            !(e.venue || "").toLowerCase().includes(searchQ)) continue;
      }
      counts[e.date] = (counts[e.date] || 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingEvents, allCities, selectedCities, category, showKidsOnly, showFreeOnly, todayIso, isSearching, searchQ]);

  // Prev/next date buttons
  const prevDate = !isSearching && datesWithEvents.length > 0
    ? [...datesWithEvents].reverse().find((d) => d < selectedDate) ?? null
    : null;
  const nextDate = !isSearching && datesWithEvents.length > 0
    ? datesWithEvents.find((d) => d > selectedDate) ?? null
    : null;

  const dayLbl = dayLabel(selectedDate, todayIso, tomorrowIso);
  const selectedCityNames = Array.from(selectedCities).map(cityLabel).sort();
  const citySummary = allCities
    ? "All cities"
    : selectedCities.size === 0
      ? "No cities"
      : selectedCities.size === 1
        ? selectedCityNames[0]
        : `${selectedCities.size} cities`;
  const activeFilterCount = [
    category !== "all",
    showKidsOnly,
    showFreeOnly,
    showTonightOnly,
    showWeekendOnly,
    showLiveNowOnly,
    showJustAddedOnly,
    !!activeThemedHolidayId,
    !allCities,
  ].filter(Boolean).length;
  const visibleEventCount = isSearching
    ? searchResults.length
    : showWeekendOnly
      ? weekendGroups.reduce((sum, [, events]) => sum + events.length, 0)
      : dayEvents.length;

  // What the list area can show right now. Search spans every date, so it
  // needs the full feed; the weekend and the rail's days sit inside the near
  // window; a date past that window waits for the full feed.
  const searchPending = isSearching && !feedComplete && !loadFailed;
  const dayPending = !loadFailed && (
    isLoadingEvents || clampPending || (nearThrough !== null && selectedDate > nearThrough)
  );
  const listPending = isSearching ? searchPending : showWeekendOnly ? isLoadingEvents : dayPending;

  const modeTitle = isSearching
    ? "Search results"
    : showWeekendOnly
      ? "This weekend"
      : showTonightOnly
        ? "Tonight"
        : showLiveNowOnly
          ? "Live now"
          : titleCaseWord(dayLbl.primary);
  const eventsLabel = (n: number) => `${n.toLocaleString("en-US")} event${n === 1 ? "" : "s"}`;
  const modeSubtitle: React.ReactNode = isSearching
    ? searchPending
      ? "Searching the full calendar…"
      : (
        <>
          <strong>{searchResults.length.toLocaleString("en-US")} result{searchResults.length === 1 ? "" : "s"}</strong>
          {" for "}&ldquo;{search.trim()}&rdquo;
        </>
      )
    : showWeekendOnly
      ? `${shortDateLabel(weekendSat)} to ${shortDateLabel(weekendSun)}`
      : (
        <>
          {dayLbl.secondary}
          <span className="sb-events-mode-sep" aria-hidden="true">·</span>
          {listPending
            ? <><CountSkeleton className="sb-events-inline-skel" /><span className="sb-events-visually-hidden">Loading</span></>
            : <strong>{eventsLabel(visibleEventCount)}</strong>}
        </>
      );

  // Hero numbers. Upcoming counts today onward (the served feed keeps a
  // one-day grace window for paging back, which isn't "upcoming").
  const upcomingCount = useMemo(
    () => upcomingEvents.reduce((n, e) => (e.date >= todayIso ? n + 1 : n), 0),
    [upcomingEvents, todayIso],
  );
  const statValue = (ready: boolean, n: number): React.ReactNode =>
    loadFailed ? "—" : ready ? n.toLocaleString("en-US") : STAT_SKELETON;

  // Keep the selected day in view when the rail scrolls sideways (phones).
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth + 1) return;
    const pill = rail.querySelector<HTMLElement>(".sb-events-date-pill.is-active");
    if (!pill) return;
    const left = Math.max(0, pill.offsetLeft - (rail.clientWidth - pill.offsetWidth) / 2);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }, [selectedDate, isSearching, showWeekendOnly, showTonightOnly]);

  const chooseDate = (iso: string) => {
    setSelectedDate(iso);
    setActiveThemedHolidayId(null);
    if (iso !== todayIso) setShowLiveNowOnly(false);
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setShowKidsOnly(false);
    setShowFreeOnly(false);
    setShowTonightOnly(false);
    setShowWeekendOnly(false);
    setShowLiveNowOnly(false);
    setShowJustAddedOnly(false);
    setActiveThemedHolidayId(null);
    if (!allCities) onToggleAllCities();
  };

  const clearAction = activeFilterCount > 0 || isSearching ? (
    <button type="button" className="sb-btn sb-btn--quiet sb-events-empty-action" onClick={clearFilters}>
      Clear filters
    </button>
  ) : null;

  const renderCards = (events: UpcomingEvent[]) => (
    <div className="sb-events-list">
      {events.map((event) => (
        <UpcomingEventCard
          key={event.id}
          event={event}
          recurring={recurringFor(event)}
          todayIso={todayIso}
          nowMins={nowMins}
        />
      ))}
    </div>
  );

  const renderGroups = (groups: [string, UpcomingEvent[]][]) => groups.map(([date, events]) => (
    <div key={date} className="sb-events-group">
      <div className="sb-events-group-header">
        <h2 className="sb-events-group-title">{shortDateLabel(date)}</h2>
        <span className="sb-events-group-count">{eventsLabel(events.length)}</span>
      </div>
      {renderCards(events)}
    </div>
  ));

  return (
    <div className="sb-events-page">
      <PageHero
        headingId="events-heading"
        eyebrow="South Bay / Calendar"
        title="Events"
        description="Concerts, library programs, markets, games, talks, festivals, and neighborhood things worth putting on the calendar."
        stats={[
          { value: statValue(feedComplete, upcomingCount), label: "Upcoming" },
          { value: statValue(feed !== null, eventCountByDate[todayIso] ?? 0), label: "Today" },
          { value: statValue(feedComplete, ongoingEvents.length), label: "Exhibits" },
        ]}
      />

      <section className="sb-events-controls" aria-label="Find events">
        <div className="sb-events-nowline">
          <button
            type="button"
            onClick={() => prevDate && chooseDate(prevDate)}
            disabled={!prevDate || isSearching || showWeekendOnly}
            aria-label="Previous day"
            className="sb-events-day-arrow"
          >
            <span aria-hidden="true">&larr;</span>
          </button>
          <div className="sb-events-nowline-text" aria-live="polite">
            <h2 className="sb-events-mode-title">{modeTitle}</h2>
            <p className="sb-events-mode-subtitle">{modeSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => nextDate && chooseDate(nextDate)}
            disabled={!nextDate || isSearching || showWeekendOnly}
            aria-label="Next day"
            className="sb-events-day-arrow"
          >
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>

        {!isSearching && !showWeekendOnly && !showTonightOnly && (
          <div className="sb-events-date-rail" role="tablist" aria-label="Pick a day" ref={railRef}>
            {Array.from({ length: 7 }, (_, i) => addDays(todayIso, i)).map((iso) => {
              const active = iso === selectedDate;
              const count = eventCountByDate[iso] ?? 0;
              // Unknown until a feed lands — don't grey every day out meanwhile.
              const empty = !isLoadingEvents && count === 0;
              const d = new Date(iso + "T12:00:00");
              const wkd = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
              const dayNum = d.getDate();
              const isToday = iso === todayIso;
              const holiday = holidayOn(iso);
              const ariaLabel = isLoadingEvents
                ? `${wkd} ${dayNum}${holiday ? `, ${holiday.label}` : ""}`
                : `${wkd} ${dayNum}, ${count} event${count === 1 ? "" : "s"}${holiday ? `, ${holiday.label}` : ""}`;
              return (
                <button
                  key={iso}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={ariaLabel}
                  title={holiday ? holiday.label : undefined}
                  disabled={empty && !active}
                  onClick={() => chooseDate(iso)}
                  className={`sb-events-date-pill${active ? " is-active" : ""}${empty ? " is-empty" : ""}${isToday ? " is-today" : ""}`}
                >
                  {holiday && <span className="sb-events-date-holiday" aria-hidden="true">{holiday.emoji}</span>}
                  <span className="sb-events-date-weekday">{isToday ? "TODAY" : wkd}</span>
                  <span className="sb-events-date-number">{dayNum}</span>
                  {isLoadingEvents
                    ? <CountSkeleton className="sb-events-date-count sb-events-date-count--skel" />
                    : <span className="sb-events-date-count">{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="sb-events-toolrow">
          <label className="sb-events-field sb-events-search">
            <span className="sb-events-field-label">Search</span>
            <input
              type="search"
              placeholder="Event, venue, or city"
              aria-label="Search events by name, venue, or city"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setWantFullFeed(true)}
            />
          </label>

          <label className="sb-events-field sb-events-select-wrap">
            <span className="sb-events-field-label">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as EventCategory | "all")}
              className="sb-events-select"
            >
              {EVENT_CATEGORIES.map((cat) => {
                const count = categoryCounts[cat.id] ?? 0;
                const label = cat.id === "all" ? "All" : cat.label;
                return (
                  <option key={cat.id} value={cat.id}>
                    {label}{feedComplete && count > 0 ? ` (${count.toLocaleString("en-US")})` : ""}
                  </option>
                );
              })}
            </select>
          </label>

          <details className="sb-events-refine">
            <summary className="sb-events-field">
              <span className="sb-events-field-label">Area</span>
              <span className="sb-events-refine-value">{citySummary}</span>
            </summary>
            <div className="sb-events-city-panel">
              <button
                type="button"
                onClick={onToggleAllCities}
                aria-pressed={allCities}
                className={`sb-events-city-chip${allCities ? " is-active" : ""}`}
              >
                All cities
                {feedComplete && cityCounts.total > 0 && (
                  <span className="sb-events-chip-count">{cityCounts.total.toLocaleString("en-US")}</span>
                )}
              </button>
              {CITIES.map((c) => {
                const inSelection = selectedCities.has(c.id);
                const count = cityCounts.perCity[c.id] ?? 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggleCity(c.id)}
                    aria-pressed={inSelection}
                    className={`sb-events-city-chip${inSelection ? " is-active" : ""}`}
                  >
                    {c.name}
                    {feedComplete && count > 0 && (
                      <span className="sb-events-chip-count">{count.toLocaleString("en-US")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </details>
        </div>

        <div className="sb-events-toggle-row" role="group" aria-label="Quick filters">
          <button
            type="button"
            aria-pressed={showKidsOnly}
            onClick={() => setShowKidsOnly((v) => !v)}
            className={`sb-events-toggle${showKidsOnly ? " is-active" : ""}`}
          >
            Kids <ToggleCount value={pillCounts.kids} ready={feedComplete} />
          </button>
          <button
            type="button"
            aria-pressed={showFreeOnly}
            onClick={() => setShowFreeOnly((v) => !v)}
            className={`sb-events-toggle${showFreeOnly ? " is-active" : ""}`}
            style={{ "--toggle-accent": "#15803D" } as React.CSSProperties}
          >
            Free <ToggleCount value={pillCounts.free} ready={feedComplete} />
          </button>
          {pillCounts.live > 0 && (
            <button
              type="button"
              aria-pressed={showLiveNowOnly}
              onClick={() => {
                const next = !showLiveNowOnly;
                setShowLiveNowOnly(next);
                if (next) {
                  chooseDate(todayIso);
                  setShowTonightOnly(false);
                  setShowWeekendOnly(false);
                }
              }}
              className={`sb-events-toggle sb-events-toggle--live${showLiveNowOnly ? " is-active" : ""}`}
              style={{ "--toggle-accent": "#BE185D" } as React.CSSProperties}
            >
              Live now <ToggleCount value={pillCounts.live} ready />
            </button>
          )}
          <button
            type="button"
            aria-pressed={showTonightOnly}
            onClick={() => {
              const next = !showTonightOnly;
              setShowTonightOnly(next);
              if (next) {
                chooseDate(todayIso);
                setShowWeekendOnly(false);
                setShowLiveNowOnly(false);
              }
            }}
            className={`sb-events-toggle${showTonightOnly ? " is-active" : ""}`}
            style={{ "--toggle-accent": "#6D28D9" } as React.CSSProperties}
          >
            Tonight <ToggleCount value={pillCounts.tonight} ready={feed !== null} />
          </button>
          <button
            type="button"
            aria-pressed={showWeekendOnly}
            onClick={() => {
              const next = !showWeekendOnly;
              setShowWeekendOnly(next);
              if (next) {
                setShowTonightOnly(false);
                setShowLiveNowOnly(false);
              }
            }}
            className={`sb-events-toggle${showWeekendOnly ? " is-active" : ""}`}
            style={{ "--toggle-accent": "#C2410C" } as React.CSSProperties}
          >
            Weekend <ToggleCount value={pillCounts.weekend} ready={feed !== null} />
          </button>
          {pillCounts.justAdded > 0 && (
            <button
              type="button"
              aria-pressed={showJustAddedOnly}
              onClick={() => setShowJustAddedOnly((v) => !v)}
              className={`sb-events-toggle${showJustAddedOnly ? " is-active" : ""}`}
              style={{ "--toggle-accent": "#0E7490" } as React.CSSProperties}
            >
              New <ToggleCount value={pillCounts.justAdded} ready={feedComplete} />
            </button>
          )}
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className="sb-events-clear">
              Clear all <span className="sb-events-toggle-count">{activeFilterCount}</span>
            </button>
          )}
        </div>
      </section>

      {loadFailed ? (
        <section className="sb-events-results">
          <div className="sb-empty sb-events-empty" role="status">
            <div className="sb-empty-title">Events didn&rsquo;t load</div>
            <div className="sb-empty-sub">Check your connection, then refresh the page to try again.</div>
          </div>
        </section>
      ) : isSearching ? (
        <section className="sb-events-results" aria-label="Search results">
          {searchPending ? (
            <EventListSkeleton label="Searching events" />
          ) : searchResults.length === 0 ? (
            <div className="sb-empty sb-events-empty">
              <div className="sb-empty-title">No matches for &ldquo;{search.trim()}&rdquo;</div>
              <div className="sb-empty-sub">Try a broader search or clear a filter.</div>
              {clearAction}
            </div>
          ) : renderGroups(searchGroups)}
        </section>
      ) : showWeekendOnly ? (
        <section className="sb-events-results" aria-label="This weekend">
          {isLoadingEvents ? (
            <EventListSkeleton />
          ) : weekendGroups.length === 0 ? (
            <div className="sb-empty sb-events-empty">
              <div className="sb-empty-title">Nothing matches</div>
              <div className="sb-empty-sub">Try clearing a filter or searching the full calendar.</div>
              {clearAction}
            </div>
          ) : renderGroups(weekendGroups)}
        </section>
      ) : (
        <section className="sb-events-results" aria-label={`${modeTitle} events`}>
          {themedHoliday && selectedDate === themedHoliday.iso && (
            <div
              className="sb-events-active-note"
              style={{
                "--note-bg": themedHoliday.holiday.bg,
                "--note-color": themedHoliday.holiday.color,
              } as React.CSSProperties}
            >
              <span aria-hidden="true">{themedHoliday.holiday.emoji}</span>
              <span className="sb-events-active-note-text">
                Showing {themedHoliday.holiday.label} picks only
              </span>
              <button type="button" onClick={() => setActiveThemedHolidayId(null)}>Show all</button>
            </div>
          )}

          {dayPending ? (
            <EventListSkeleton />
          ) : dayEvents.length === 0 ? (
            <div className="sb-empty sb-events-empty">
              <div className="sb-empty-title">Nothing on the calendar</div>
              <div className="sb-empty-sub">
                Try a different day, fewer filters, or search for something specific.
              </div>
              {clearAction}
            </div>
          ) : renderCards(dayEvents)}
        </section>
      )}

      {/* Exhibits are dated by their first showing, which can sit past the
          near window — list them once the full feed has landed. */}
      {feedComplete && filteredOngoing.length > 0 && (
        <section className="sb-events-exhibits" aria-labelledby="events-exhibits-heading">
          <div className="sb-events-group-header sb-events-group-header--section">
            <h2 id="events-exhibits-heading" className="sb-events-group-title">Exhibits</h2>
            <span className="sb-events-group-count">{filteredOngoing.length.toLocaleString("en-US")} on view</span>
          </div>
          {renderCards(filteredOngoing)}
        </section>
      )}
    </div>
  );
}

/** Count badge on a quick-filter pill: shimmer until the number is final. */
function ToggleCount({ value, ready }: { value: number; ready: boolean }) {
  if (!ready) return <CountSkeleton className="sb-events-toggle-count sb-events-toggle-count--skel" />;
  if (value <= 0) return null;
  return <span className="sb-events-toggle-count">{value.toLocaleString("en-US")}</span>;
}

/** "TOMORROW" → "Tomorrow" for the serif day title. */
function titleCaseWord(word: string): string {
  return word ? word[0] + word.slice(1).toLowerCase() : word;
}
