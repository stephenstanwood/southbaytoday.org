// ---------------------------------------------------------------------------
// WeekendPicksCard — surfaces this weekend's AI-curated picks on the Today tab
// ---------------------------------------------------------------------------
// Renders only when today (PT) falls inside the weekend-picks window. Drops
// picks that have already ended and shows free/paid + venue + "why" reason.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import weekendPicksJson from "../../../data/south-bay/weekend-picks.json";
import { getCityName } from "../../../lib/south-bay/cities";
import type { City } from "../../../lib/south-bay/types";

interface Pick {
  id: string;
  title: string;
  date: string;
  displayDate?: string;
  time?: string | null;
  endTime?: string | null;
  city: string;
  venue?: string | null;
  cost?: string | null;
  url: string;
  category?: string | null;
  why?: string | null;
}

interface WeekendPicksData {
  weekendLabel: string;
  weekendStart: string;
  weekendEnd: string;
  generatedAt: string;
  picks: Pick[];
}

const DATA = weekendPicksJson as WeekendPicksData;

const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  arts:        { color: "#7B2FBE", bg: "#F5EFFC" },
  music:       { color: "#1A5AFF", bg: "#EFF4FF" },
  food:        { color: "#E8531D", bg: "#FFF1EB" },
  family:      { color: "#06D6A0", bg: "#E8FAF4" },
  community:   { color: "#0F766E", bg: "#E6F6F4" },
  outdoor:     { color: "#15803D", bg: "#EBF7EE" },
  education:   { color: "#B45309", bg: "#FEF3DB" },
  market:      { color: "#C2410C", bg: "#FEEEDB" },
  default:     { color: "#1A1A1A", bg: "#F0EFEC" },
};

function parseStartMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function parseEndMinutes(end: string | null | undefined): number | null {
  return parseStartMinutes(end);
}

function getTodayISOInPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

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

function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "";
  if (!end) return start;
  // Strip AM/PM from start when it matches end's period — "2:00–3:30 PM"
  const sm = start.trim().match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/i);
  const em = end.trim().match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/i);
  if (sm && em && sm[2].toUpperCase() === em[2].toUpperCase()) {
    return `${sm[1]}–${em[1]} ${em[2].toUpperCase()}`;
  }
  return `${start}–${end}`;
}

export default function WeekendPicksCard() {
  const [todayISO, setTodayISO] = useState<string>(() => getTodayISOInPT());
  const [nowMinutes, setNowMinutes] = useState<number>(() => getNowMinutesPT());

  // Day rollover + minute tick so picks fade out when their end time passes.
  useEffect(() => {
    const id = setInterval(() => {
      setTodayISO((prev) => {
        const next = getTodayISOInPT();
        return prev === next ? prev : next;
      });
      setNowMinutes(getNowMinutesPT());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Only render during the weekend window the data was generated for.
  if (todayISO < DATA.weekendStart || todayISO > DATA.weekendEnd) return null;

  const visible = DATA.picks
    .filter((p) => p.date >= todayISO)
    .filter((p) => {
      if (p.date !== todayISO) return true;
      const end = parseEndMinutes(p.endTime);
      // No end time → keep visible until midnight. Otherwise hide once it passes.
      return end === null ? true : end > nowMinutes;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const sa = parseStartMinutes(a.time) ?? 9999;
      const sb = parseStartMinutes(b.time) ?? 9999;
      return sa - sb;
    });

  if (visible.length === 0) return null;

  return (
    <section
      style={{
        background: "#fff",
        border: "1.5px solid var(--sb-border-light)",
        borderRadius: 8,
        padding: "16px 16px 6px",
        marginBottom: 18,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "'Space Mono', monospace",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--sb-accent)",
              marginBottom: 2,
            }}
          >
            Weekend Picks
          </div>
          <h2
            style={{
              fontFamily: "var(--sb-serif)",
              fontSize: 22,
              fontWeight: 800,
              margin: 0,
              color: "var(--sb-ink)",
              letterSpacing: "-0.01em",
            }}
          >
            What's worth your weekend
          </h2>
        </div>
        <span style={{ fontSize: 11, color: "var(--sb-muted)" }}>{DATA.weekendLabel}</span>
      </header>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" }}>
        {visible.map((pick) => {
          const accent = CATEGORY_COLORS[pick.category ?? "default"] ?? CATEGORY_COLORS.default;
          const cityName = getCityName(pick.city as City);
          const venueLine = [pick.venue, cityName].filter(Boolean).join(" · ");
          const timeLabel = formatTimeRange(pick.time, pick.endTime);
          const isToday = pick.date === todayISO;
          const dateLabel = isToday ? "TODAY" : (pick.displayDate ?? pick.date);
          const isFree = (pick.cost ?? "").toLowerCase() === "free";

          return (
            <li key={pick.id}>
              <a
                href={pick.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 0",
                  borderTop: "1px solid var(--sb-border-light)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ minWidth: 64, flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "'Space Mono', monospace",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: isToday ? "var(--sb-accent)" : "var(--sb-muted)",
                      lineHeight: 1.3,
                    }}
                  >
                    {dateLabel}
                  </div>
                  {timeLabel && (
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "'Space Mono', monospace",
                        color: "var(--sb-muted)",
                        marginTop: 2,
                        lineHeight: 1.3,
                      }}
                    >
                      {timeLabel}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2, flexWrap: "wrap" }}>
                    {pick.category && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          fontFamily: "'Space Mono', monospace",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: accent.color,
                          background: accent.bg,
                          padding: "1px 6px",
                          borderRadius: 3,
                        }}
                      >
                        {pick.category}
                      </span>
                    )}
                    {isFree && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          fontFamily: "'Space Mono', monospace",
                          letterSpacing: "0.04em",
                          color: "#15803D",
                          background: "#EBF7EE",
                          border: "1px solid #BBF7D0",
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        FREE
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--sb-ink)",
                      lineHeight: 1.3,
                      marginBottom: 2,
                    }}
                  >
                    {pick.title}
                  </div>
                  {venueLine && (
                    <div style={{ fontSize: 11, color: "var(--sb-muted)", marginBottom: 3 }}>
                      {venueLine}
                    </div>
                  )}
                  {pick.why && (
                    <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.45 }}>
                      {pick.why}
                    </div>
                  )}
                </div>
              </a>
            </li>
          );
        })}
      </ul>

      <div
        style={{
          fontSize: 10,
          color: "var(--sb-muted)",
          fontStyle: "italic",
          padding: "8px 0 4px",
          textAlign: "right",
        }}
      >
        AI-curated from this weekend's events · Tap a pick to open
      </div>
    </section>
  );
}
