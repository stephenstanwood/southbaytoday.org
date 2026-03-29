import { useState, useEffect } from "react";

// USGS Earthquake API — no key required, public domain government data
// Coverage: South Bay + surrounding Bay Area, M1.5+, last 7 days

const USGS_URL =
  "https://earthquake.usgs.gov/fdsnws/event/1/query" +
  "?format=geojson" +
  "&minmagnitude=1.5" +
  "&minlatitude=36.7" +
  "&maxlatitude=38.0" +
  "&minlongitude=-122.6" +
  "&maxlongitude=-121.4" +
  "&orderby=time" +
  "&limit=30";

interface Quake {
  id: string;
  mag: number;
  place: string;
  time: number; // ms epoch
  depth: number; // km
  lat: number;
  lon: number;
  url: string;
}

function getMagConfig(mag: number): { label: string; color: string; bg: string; textColor: string } {
  if (mag >= 4.0) return { label: "Major", color: "#dc2626", bg: "#fef2f2", textColor: "#dc2626" };
  if (mag >= 3.0) return { label: "Notable", color: "#ea580c", bg: "#fff7ed", textColor: "#ea580c" };
  if (mag >= 2.5) return { label: "Moderate", color: "#d97706", bg: "#fffbeb", textColor: "#b45309" };
  if (mag >= 2.0) return { label: "Minor", color: "#78716c", bg: "#fafaf9", textColor: "#57534e" };
  return { label: "Micro", color: "#a8a29e", bg: "#fafaf9", textColor: "#a8a29e" };
}

function timeAgo(ms: number): string {
  const diffMs = Date.now() - ms;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function cleanPlace(place: string): string {
  // "3 km ESE of San Ramon, CA" → keep as-is but trim state suffix for known Bay Area places
  return place.replace(/, CA$/, "");
}

export default function QuakeWatchCard() {
  const [quakes, setQuakes] = useState<Quake[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const url = USGS_URL + `&starttime=${weekAgo}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const features: Quake[] = (d.features ?? []).map((f: any) => ({
          id: f.id,
          mag: f.properties.mag,
          place: f.properties.place ?? "Bay Area",
          time: f.properties.time,
          depth: f.geometry.coordinates[2],
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          url: f.properties.url,
        }));
        setQuakes(features);
      })
      .catch(() => setError(true));
  }, []);

  if (error) return null; // silent fail — don't break the page

  const loading = quakes === null;
  const total = quakes?.length ?? 0;
  const notable = (quakes ?? []).filter((q) => q.mag >= 2.5);
  const strongest = quakes?.reduce((a, b) => (a.mag > b.mag ? a : b), quakes[0]);
  const last24h = (quakes ?? []).filter((q) => Date.now() - q.time < 24 * 60 * 60 * 1000);

  // Show top 8 events, ordered by time (newest first)
  const displayList = (quakes ?? []).slice(0, 8);

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
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>📡</span>
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
            Quake Watch
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: "#9ca3af",
            fontFamily: "var(--sb-mono, monospace)",
          }}
        >
          Bay Area · M1.5+ · 7 days
        </span>
      </div>

      {loading && (
        <div style={{ color: "#9ca3af", fontSize: 12, padding: "8px 0" }}>
          Loading seismic activity…
        </div>
      )}

      {!loading && total === 0 && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 13,
            color: "#15803d",
          }}
        >
          ✓ No earthquakes M1.5+ in the Bay Area in the past 7 days.
        </div>
      )}

      {!loading && total > 0 && (
        <>
          {/* ── Summary strip ── */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <StatChip
              value={String(total)}
              label="total quakes"
              color="#6b7280"
              bg="#f9fafb"
            />
            {last24h.length > 0 && (
              <StatChip
                value={String(last24h.length)}
                label="past 24h"
                color="#d97706"
                bg="#fffbeb"
              />
            )}
            {strongest && (
              <StatChip
                value={`M${strongest.mag.toFixed(1)}`}
                label="strongest"
                color={getMagConfig(strongest.mag).textColor}
                bg={getMagConfig(strongest.mag).bg}
              />
            )}
            {notable.length > 0 && (
              <StatChip
                value={String(notable.length)}
                label="M2.5+"
                color="#ea580c"
                bg="#fff7ed"
              />
            )}
          </div>

          {/* ── Quake list ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {displayList.map((q) => {
              const cfg = getMagConfig(q.mag);
              return (
                <a
                  key={q.id}
                  href={q.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 10px",
                      background: cfg.bg,
                      borderRadius: 6,
                      border: `1px solid ${cfg.color}22`,
                      cursor: "pointer",
                    }}
                  >
                    {/* Mag badge */}
                    <div
                      style={{
                        minWidth: 40,
                        textAlign: "center",
                        fontFamily: "var(--sb-mono, monospace)",
                        fontSize: 14,
                        fontWeight: 700,
                        color: cfg.textColor,
                        lineHeight: 1,
                      }}
                    >
                      {q.mag.toFixed(1)}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#1f2937",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {cleanPlace(q.place)}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#6b7280",
                          marginTop: 1,
                        }}
                      >
                        {q.depth.toFixed(1)} km deep
                      </div>
                    </div>

                    {/* Time */}
                    <div
                      style={{
                        fontSize: 11,
                        color: "#9ca3af",
                        fontFamily: "var(--sb-mono, monospace)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {timeAgo(q.time)}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>

          {/* ── Footer ── */}
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
            <span>Source: USGS Earthquake Hazards Program</span>
            <a
              href="https://earthquake.usgs.gov/earthquakes/map/?extent=36.7,-122.6&extent=38.0,-121.4"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#9ca3af", textDecoration: "underline" }}
            >
              USGS Map →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function StatChip({
  value,
  label,
  color,
  bg,
}: {
  value: string;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${color}33`,
        borderRadius: 6,
        padding: "5px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minWidth: 56,
      }}
    >
      <span
        style={{
          fontSize: 18,
          fontWeight: 800,
          color,
          fontFamily: "var(--sb-mono, monospace)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
    </div>
  );
}
