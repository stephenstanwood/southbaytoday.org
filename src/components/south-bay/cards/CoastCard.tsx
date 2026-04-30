import { useState, useEffect } from "react";

// NOAA CO-OPS APIs — public domain, no key required, CORS-enabled.
// Tides: Pillar Point Harbor (Half Moon Bay) — closest open-coast
// station to the South Bay (~35 min from San Jose).
// Water temp: Point Reyes (closest open-ocean station with active
// water-temperature sensor; HMB-area surface temp tracks within ~2°F).
const TIDE_STATION = "9414131"; // Pillar Point, Half Moon Bay
const WATER_TEMP_STATION = "9415020"; // Point Reyes (open ocean)
const TIDE_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

interface TidePred {
  iso: string;        // YYYY-MM-DD HH:MM (lst_ldt)
  ts: number;         // epoch ms (parsed from iso, treated as Pacific local)
  height: number;     // feet
  type: "H" | "L";    // High or Low
}

interface DayTides {
  dateISO: string;    // YYYY-MM-DD
  tides: TidePred[];
}

function fmtTime(iso: string): string {
  const m = iso.match(/(\d{2}):(\d{2})/);
  if (!m) return "";
  let hr = parseInt(m[1], 10);
  const min = m[2];
  const ampm = hr >= 12 ? "PM" : "AM";
  if (hr === 0) hr = 12;
  else if (hr > 12) hr -= 12;
  return `${hr}:${min} ${ampm}`;
}

function ymdRange(daysAhead: number): { begin: string; end: string } {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).replace(/-/g, "");
  const today = new Date();
  const future = new Date(today.getTime() + daysAhead * 86400000);
  return { begin: fmt(today), end: fmt(future) };
}

function ptTodayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

// Parse "YYYY-MM-DD HH:MM" interpreted as a Pacific wall-clock time and
// return UTC epoch ms — handles PST/PDT without hard-coded offsets.
function parsePacificWallClock(s: string): number {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return Date.now();
  const [, y, mo, d, hh, mm] = m.map(Number) as unknown as number[];
  // Treat the wall-clock as if it were UTC, then ask the Pacific zone what
  // wall-clock that UTC instant resolves to — the difference is the offset.
  const utcGuess = Date.UTC(y!, mo! - 1, d!, hh!, mm!);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcGuess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const seenLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  // utcGuess - seenLocal == offset Pacific is ahead/behind; correct utcGuess
  // by that offset so it represents the requested Pacific wall-clock.
  return utcGuess + (utcGuess - seenLocal);
}

function dayLabel(iso: string): string {
  const todayISO = ptTodayISO();
  if (iso === todayISO) return "Today";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomISO = tomorrow.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  if (iso === tomISO) return "Tomorrow";
  return dt.toLocaleDateString("en-US", { weekday: "short" });
}

function tempColor(f: number): { bg: string; text: string; vibe: string } {
  if (f < 55) return { bg: "#eff6ff", text: "#1d4ed8", vibe: "Wetsuit weather" };
  if (f < 60) return { bg: "#ecfeff", text: "#0e7490", vibe: "Bracingly cold" };
  if (f < 65) return { bg: "#f0fdfa", text: "#0f766e", vibe: "Cool — wetsuit recommended" };
  if (f < 70) return { bg: "#f0fdf4", text: "#15803d", vibe: "Mild for the Pacific" };
  return { bg: "#fff7ed", text: "#c2410c", vibe: "Warm (rare)" };
}

export default function CoastCard() {
  const [tideDays, setTideDays] = useState<DayTides[] | null>(null);
  const [waterF, setWaterF] = useState<number | null>(null);
  const [waterAt, setWaterAt] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const { begin, end } = ymdRange(3);
    const tideUrl =
      `${TIDE_BASE}?product=predictions&application=southbaytoday` +
      `&station=${TIDE_STATION}&begin_date=${begin}&end_date=${end}` +
      `&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&format=json`;
    const tempUrl =
      `${TIDE_BASE}?product=water_temperature&application=southbaytoday` +
      `&station=${WATER_TEMP_STATION}&date=latest&time_zone=lst_ldt` +
      `&units=english&format=json`;

    Promise.all([
      fetch(tideUrl).then((r) => r.json()).catch(() => null),
      fetch(tempUrl).then((r) => r.json()).catch(() => null),
    ]).then(([tideJson, tempJson]) => {
      const preds = tideJson?.predictions;
      if (!Array.isArray(preds) || preds.length === 0) {
        setError(true);
        return;
      }
      const all: TidePred[] = preds.map((p: { t: string; v: string; type: string }) => {
        // "2026-04-30 11:12" comes back as Pacific local (lst_ldt). To compare
        // against Date.now() correctly across PST/PDT, parse via the same
        // wall-clock string in the Pacific zone.
        return {
          iso: p.t,
          ts: parsePacificWallClock(p.t),
          height: parseFloat(p.v),
          type: p.type === "H" ? "H" : "L",
        };
      });
      const grouped = new Map<string, TidePred[]>();
      for (const t of all) {
        const dateISO = t.iso.split(" ")[0]!;
        if (!grouped.has(dateISO)) grouped.set(dateISO, []);
        grouped.get(dateISO)!.push(t);
      }
      const days: DayTides[] = [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateISO, tides]) => ({ dateISO, tides }));
      setTideDays(days);

      const tempData = tempJson?.data?.[0];
      if (tempData?.v) {
        setWaterF(parseFloat(tempData.v));
        setWaterAt(tempData.t ?? null);
      }
    });
  }, []);

  if (error) return null;

  const todayISO = ptTodayISO();
  const today = tideDays?.find((d) => d.dateISO === todayISO) ?? tideDays?.[0];
  const upcoming = (tideDays ?? []).filter((d) => d.dateISO !== today?.dateISO).slice(0, 3);

  const nowMs = Date.now();
  const nextTide = today?.tides.find((t) => t.ts > nowMs);

  return (
    <section
      style={{
        background: "white",
        border: "1.5px solid #E5E7EB",
        borderRadius: 2,
        padding: "20px 24px",
        marginBottom: 24,
        fontFamily: "var(--sb-sans, system-ui, sans-serif)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 18,
              fontWeight: 700,
              color: "#1A1A1A",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Coast Watch
          </h2>
          <div style={{ fontSize: 11, color: "#6B7280", fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
            Half Moon Bay · Pillar Point Harbor
          </div>
        </div>
        <a
          href="https://tidesandcurrents.noaa.gov/stationhome.html?id=9414131"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "'Inter', sans-serif", textDecoration: "none" }}
        >
          NOAA ↗
        </a>
      </div>

      {!tideDays && (
        <div style={{ color: "#9ca3af", fontSize: 12, padding: "8px 0" }}>
          Loading tide data…
        </div>
      )}

      {today && (
        <>
          {/* Next tide hero + water temp */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: waterF !== null ? "1.4fr 1fr" : "1fr",
              gap: 10,
              marginBottom: 12,
            }}
          >
            {nextTide && (
              <div
                style={{
                  background: nextTide.type === "H" ? "#eff6ff" : "#fefce8",
                  border: `1px solid ${nextTide.type === "H" ? "#bfdbfe" : "#fde68a"}`,
                  borderRadius: 6,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontFamily: "'Space Mono', monospace",
                    marginBottom: 4,
                  }}
                >
                  Next {nextTide.type === "H" ? "high" : "low"} tide
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: nextTide.type === "H" ? "#1d4ed8" : "#a16207",
                    fontFamily: "'Space Mono', monospace",
                    lineHeight: 1.05,
                  }}
                >
                  {fmtTime(nextTide.iso)}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3, fontFamily: "'Inter', sans-serif" }}>
                  {nextTide.height.toFixed(1)} ft · {nextTide.type === "H" ? "good for kayak/launch" : "tidepools, beachcomb"}
                </div>
              </div>
            )}
            {waterF !== null && (
              <WaterTempStat fahrenheit={waterF} updatedAt={waterAt} />
            )}
          </div>

          {/* Today's tide chart */}
          <div
            style={{
              border: "1px solid #f3f4f6",
              borderRadius: 6,
              padding: "10px 12px",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontFamily: "'Space Mono', monospace",
                marginBottom: 8,
              }}
            >
              {dayLabel(today.dateISO)} — {today.tides.length} tides
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${today.tides.length}, 1fr)`,
                gap: 8,
              }}
            >
              {today.tides.map((t) => {
                const isPast = t.ts < nowMs;
                const isHigh = t.type === "H";
                return (
                  <div
                    key={t.iso}
                    style={{
                      background: isPast ? "#f9fafb" : isHigh ? "#eff6ff" : "#fefce8",
                      border: "1px solid",
                      borderColor: isPast ? "#f3f4f6" : isHigh ? "#dbeafe" : "#fef3c7",
                      borderRadius: 4,
                      padding: "6px 4px",
                      textAlign: "center",
                      opacity: isPast ? 0.55 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: isHigh ? "#1d4ed8" : "#a16207",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontFamily: "'Space Mono', monospace",
                      }}
                    >
                      {isHigh ? "High" : "Low"}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#1f2937",
                        fontFamily: "'Space Mono', monospace",
                        lineHeight: 1.1,
                        marginTop: 2,
                      }}
                    >
                      {fmtTime(t.iso)}
                    </div>
                    <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
                      {t.height.toFixed(1)} ft
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upcoming days */}
          {upcoming.length > 0 && (
            <div
              style={{
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
                  fontFamily: "'Space Mono', monospace",
                  marginBottom: 6,
                }}
              >
                Tides ahead
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${upcoming.length}, 1fr)`, gap: 6 }}>
                {upcoming.map((d) => {
                  const lows = d.tides.filter((t) => t.type === "L");
                  const highs = d.tides.filter((t) => t.type === "H");
                  const lowestLow = lows.reduce<TidePred | null>(
                    (acc, t) => (!acc || t.height < acc.height ? t : acc),
                    null,
                  );
                  const highestHigh = highs.reduce<TidePred | null>(
                    (acc, t) => (!acc || t.height > acc.height ? t : acc),
                    null,
                  );
                  return (
                    <div
                      key={d.dateISO}
                      style={{
                        background: "#fafaf9",
                        border: "1px solid #f3f4f6",
                        borderRadius: 4,
                        padding: "6px 8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "#6b7280",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          fontWeight: 600,
                          fontFamily: "'Inter', sans-serif",
                          marginBottom: 4,
                        }}
                      >
                        {dayLabel(d.dateISO)}
                      </div>
                      {lowestLow && (
                        <div style={{ fontSize: 11, color: "#a16207", fontFamily: "'Space Mono', monospace" }}>
                          ↓ {fmtTime(lowestLow.iso)}
                        </div>
                      )}
                      {highestHigh && (
                        <div style={{ fontSize: 11, color: "#1d4ed8", fontFamily: "'Space Mono', monospace" }}>
                          ↑ {fmtTime(highestHigh.iso)}
                        </div>
                      )}
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
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <span>~35 min from San Jose via I-280 + Hwy 92</span>
            <span>Heights MLLW</span>
          </div>
        </>
      )}
    </section>
  );
}

function WaterTempStat({ fahrenheit, updatedAt }: { fahrenheit: number; updatedAt: string | null }) {
  const cfg = tempColor(fahrenheit);
  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.text}33`,
        borderRadius: 6,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontFamily: "'Space Mono', monospace",
          marginBottom: 4,
        }}
      >
        Pacific water temp
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: cfg.text,
          fontFamily: "'Space Mono', monospace",
          lineHeight: 1.05,
        }}
      >
        {fahrenheit.toFixed(1)}°F
      </div>
      <div style={{ fontSize: 11, color: cfg.text, marginTop: 3, fontFamily: "'Inter', sans-serif" }}>
        {cfg.vibe}
      </div>
      {updatedAt && (
        <div
          style={{
            fontSize: 9,
            color: "#9ca3af",
            marginTop: 4,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Pt. Reyes · {fmtTime(updatedAt)}
        </div>
      )}
    </div>
  );
}
