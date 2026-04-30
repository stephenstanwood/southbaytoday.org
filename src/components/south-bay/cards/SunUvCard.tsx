import { useState, useEffect } from "react";

// Open-Meteo Forecast API — no key required, free tier
// San Jose anchor for the South Bay; sunrise/sunset varies <1 min across cities
const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=37.3382&longitude=-121.8863" +
  "&daily=sunrise,sunset,uv_index_max,daylight_duration" +
  "&timezone=America%2FLos_Angeles" +
  "&forecast_days=4";

interface DayInfo {
  date: string;          // YYYY-MM-DD
  sunrise: string;       // ISO datetime in local TZ
  sunset: string;        // ISO datetime in local TZ
  uvMax: number;
  daylightSec: number;
}

function formatTime(iso: string): string {
  // Open-Meteo returns "2026-04-30T06:23" (no seconds, no TZ offset, already local)
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return "";
  let hr = parseInt(m[1], 10);
  const min = m[2];
  const ampm = hr >= 12 ? "PM" : "AM";
  if (hr === 0) hr = 12;
  else if (hr > 12) hr -= 12;
  return `${hr}:${min} ${ampm}`;
}

function formatDuration(sec: number): string {
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

function dayLabel(iso: string, isToday: boolean): string {
  if (isToday) return "Today";
  // Parse YYYY-MM-DD as local date
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, (mo ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("en-US", { weekday: "short" });
}

function getUvConfig(uv: number): { label: string; color: string; bg: string; text: string; advice: string } {
  if (uv >= 11) return { label: "Extreme",  color: "#7c3aed", bg: "#f5f3ff", text: "#6d28d9", advice: "Avoid sun mid-day. Cover up, SPF 50+, sunglasses." };
  if (uv >= 8)  return { label: "Very High", color: "#dc2626", bg: "#fef2f2", text: "#b91c1c", advice: "Limit mid-day sun. SPF 30+ and reapply every 90 min outdoors." };
  if (uv >= 6)  return { label: "High",      color: "#ea580c", bg: "#fff7ed", text: "#c2410c", advice: "Wear a hat and SPF 30+ if outside 10 a.m. – 4 p.m." };
  if (uv >= 3)  return { label: "Moderate",  color: "#d97706", bg: "#fffbeb", text: "#92400e", advice: "Sunscreen recommended for extended outdoor time." };
  return            { label: "Low",       color: "#16a34a", bg: "#f0fdf4", text: "#15803d", advice: "Sun protection only needed for sensitive skin." };
}

function ptTodayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export default function SunUvCard() {
  const [days, setDays] = useState<DayInfo[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(OPEN_METEO_URL)
      .then((r) => r.json())
      .then((d) => {
        const time: string[] = d?.daily?.time ?? [];
        const sunrise: string[] = d?.daily?.sunrise ?? [];
        const sunset: string[] = d?.daily?.sunset ?? [];
        const uvMax: number[] = d?.daily?.uv_index_max ?? [];
        const daylight: number[] = d?.daily?.daylight_duration ?? [];
        if (!time.length) {
          setError(true);
          return;
        }
        setDays(
          time.map((date, i) => ({
            date,
            sunrise: sunrise[i] ?? "",
            sunset: sunset[i] ?? "",
            uvMax: Number(uvMax[i] ?? 0),
            daylightSec: Number(daylight[i] ?? 0),
          })),
        );
      })
      .catch(() => setError(true));
  }, []);

  if (error) return null; // silent fail

  const todayISO = ptTodayISO();
  const today = days?.find((d) => d.date === todayISO) ?? days?.[0];
  const upcoming = (days ?? []).filter((d) => d.date !== today?.date).slice(0, 3);

  // Day-over-day daylight delta — "is the day getting longer?"
  const yesterdayDaylight: number | null = (() => {
    if (!today) return null;
    const idx = (days ?? []).findIndex((d) => d.date === today.date);
    if (idx <= 0) return null;
    return days?.[idx - 1].daylightSec ?? null;
  })();
  const tomorrowDaylight = upcoming[0]?.daylightSec ?? null;
  const trendSec = today && tomorrowDaylight !== null ? tomorrowDaylight - today.daylightSec : null;
  const trendMin = trendSec !== null ? Math.round(trendSec / 60) : null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1.5px solid #e5e7eb",
        borderRadius: 8,
        padding: "16px 18px",
        marginBottom: 16,
        fontFamily: "var(--sb-sans, system-ui, sans-serif)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>☀️</span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#1f2937",
              fontFamily: "var(--sb-mono, 'Space Mono', monospace)",
            }}
          >
            Sun &amp; UV
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: "#9ca3af",
            fontFamily: "var(--sb-mono, monospace)",
          }}
        >
          South Bay · 4-day
        </span>
      </div>

      {!today && (
        <div style={{ color: "#9ca3af", fontSize: 12, padding: "8px 0" }}>
          Loading sunlight data…
        </div>
      )}

      {today && (
        <>
          {/* Today's sunrise/sunset hero */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <SunStat
              icon="🌅"
              label="Sunrise"
              value={formatTime(today.sunrise)}
              color="#d97706"
              bg="#fffbeb"
            />
            <SunStat
              icon="🌇"
              label="Sunset"
              value={formatTime(today.sunset)}
              color="#c2410c"
              bg="#fff7ed"
            />
            <SunStat
              icon="⏱"
              label="Daylight"
              value={formatDuration(today.daylightSec)}
              color="#0369a1"
              bg="#f0f9ff"
              sublabel={
                trendMin !== null && trendMin !== 0
                  ? `${trendMin > 0 ? "+" : ""}${trendMin} min vs tmrw`
                  : undefined
              }
            />
          </div>

          {/* UV index callout */}
          <UvCallout uv={today.uvMax} />

          {/* Upcoming days strip */}
          {upcoming.length > 0 && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid #f3f4f6",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: "var(--sb-mono, monospace)",
                  marginBottom: 6,
                }}
              >
                Sunset ahead
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${upcoming.length}, 1fr)`,
                  gap: 6,
                }}
              >
                {upcoming.map((d) => {
                  const cfg = getUvConfig(d.uvMax);
                  return (
                    <div
                      key={d.date}
                      style={{
                        background: "#f9fafb",
                        border: "1px solid #f3f4f6",
                        borderRadius: 6,
                        padding: "6px 8px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "#6b7280",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: 2,
                        }}
                      >
                        {dayLabel(d.date, false)}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1f2937",
                          fontFamily: "var(--sb-mono, monospace)",
                          lineHeight: 1.1,
                        }}
                      >
                        {formatTime(d.sunset)}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: cfg.text,
                          marginTop: 3,
                          fontWeight: 600,
                        }}
                      >
                        UV {Math.round(d.uvMax)} · {cfg.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              marginTop: 10,
              fontSize: 10,
              color: "#9ca3af",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Source: Open-Meteo · NOAA</span>
            <a
              href="https://open-meteo.com/en/docs"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#9ca3af", textDecoration: "underline" }}
            >
              Open-Meteo →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function SunStat({
  icon,
  label,
  value,
  color,
  bg,
  sublabel,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  bg: string;
  sublabel?: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${color}33`,
        borderRadius: 6,
        padding: "8px 10px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color,
          fontFamily: "var(--sb-mono, monospace)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sublabel && (
        <div
          style={{
            fontSize: 9,
            color: "#9ca3af",
            marginTop: 2,
            fontFamily: "var(--sb-mono, monospace)",
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}

function UvCallout({ uv }: { uv: number }) {
  const cfg = getUvConfig(uv);
  const rounded = Math.round(uv);
  const pct = Math.min(100, (uv / 11) * 100);
  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.color}33`,
        borderRadius: 6,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: cfg.text,
              fontFamily: "var(--sb-mono, monospace)",
              lineHeight: 1,
            }}
          >
            UV {rounded}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: cfg.text,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {cfg.label}
          </span>
        </div>
        <span style={{ fontSize: 10, color: "#9ca3af" }}>peak today</span>
      </div>

      {/* UV bar */}
      <div style={{ position: "relative", height: 5, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to right, #16a34a 0%, #d97706 27%, #ea580c 54%, #dc2626 73%, #7c3aed 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "white",
            left: `${pct}%`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -1,
            left: `calc(${pct}% - 1px)`,
            width: 2,
            height: 7,
            background: "#111",
            borderRadius: 1,
          }}
        />
      </div>

      <div
        style={{
          fontSize: 12,
          color: cfg.text,
          lineHeight: 1.4,
        }}
      >
        {cfg.advice}
      </div>
    </div>
  );
}
