import realEstateJson from "../../../data/south-bay/real-estate.json";
import type { City } from "../../../lib/south-bay/types";

interface CityData {
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

interface RealEstateData {
  cities: CityData[];
  generatedAt: string;
  source: string;
  sourceUrl: string;
  attribution: string;
}

const data = realEstateJson as RealEstateData;

function formatPrice(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

function formatYoy(n: number | null): { label: string; up: boolean | null } {
  if (n == null) return { label: "—", up: null };
  const pct = (n * 100).toFixed(1);
  return { label: `${n >= 0 ? "+" : ""}${pct}%`, up: n >= 0 };
}

function formatPeriod(isoDate: string): string {
  // e.g. "2026-02-28" → "Feb 2026"
  const d = new Date(isoDate + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

interface Props {
  homeCity: City | null;
}

export default function RealEstateCard({ homeCity }: Props) {
  const { cities, sourceUrl, attribution } = data;
  if (!cities || cities.length === 0) return null;

  // Sort: home city first, then alphabetical
  const sorted = [...cities].sort((a, b) => {
    const aHome = homeCity && a.cityId === homeCity ? -1 : 0;
    const bHome = homeCity && b.cityId === homeCity ? -1 : 0;
    if (aHome !== bHome) return aHome - bHome;
    return a.city.localeCompare(b.city);
  });

  const latestPeriod = cities[0]?.periodEnd ? formatPeriod(cities[0].periodEnd) : "";

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Header */}
      <div className="sb-section-header" style={{ marginBottom: 12 }}>
        <span className="sb-section-title" style={{ fontSize: 15 }}>
          🏡 Housing Market
        </span>
        {latestPeriod && (
          <span style={{ fontSize: 11, color: "var(--sb-muted)", fontWeight: 500 }}>
            {latestPeriod}
          </span>
        )}
        <div className="sb-section-line" />
      </div>

      {/* Table */}
      <div style={{
        border: "1.5px solid var(--sb-border-light)",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
      }}>
        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 110px 90px 60px",
          padding: "6px 14px",
          background: "var(--sb-bg)",
          borderBottom: "1px solid var(--sb-border-light)",
        }}>
          {["City", "Median Sale", "vs. Last Year", "Days"].map((h) => (
            <span key={h} style={{
              fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono', monospace",
              letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sb-muted)",
            }}>
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {sorted.map((c, i) => {
          const yoy = formatYoy(c.medianSalePriceYoy);
          const isHome = homeCity && c.cityId === homeCity;
          const isVolatile = c.medianSalePriceYoy != null && Math.abs(c.medianSalePriceYoy) > 0.4;

          return (
            <div
              key={c.cityId}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 90px 60px",
                padding: "8px 14px",
                borderBottom: i < sorted.length - 1 ? "1px solid var(--sb-border-light)" : "none",
                background: isHome ? "var(--sb-accent-light)" : "transparent",
                alignItems: "center",
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: isHome ? 700 : 500,
                color: "var(--sb-ink)",
              }}>
                {c.city}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 600, color: "var(--sb-ink)",
                fontVariantNumeric: "tabular-nums",
              }}>
                {formatPrice(c.medianSalePrice)}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                {yoy.up !== null && (
                  <span style={{ fontSize: 10 }}>{yoy.up ? "▲" : "▼"}</span>
                )}
                <span style={{
                  fontSize: 12,
                  color: yoy.up === null
                    ? "var(--sb-muted)"
                    : yoy.up ? "#15803D" : "#DC2626",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {yoy.label}
                  {isVolatile && (
                    <span
                      title="Low transaction volume — may not be statistically significant"
                      style={{ marginLeft: 3, opacity: 0.5, fontSize: 10, cursor: "help" }}
                    >
                      *
                    </span>
                  )}
                </span>
              </div>
              <span style={{
                fontSize: 12, color: "var(--sb-muted)",
                fontVariantNumeric: "tabular-nums",
              }}>
                {c.medianDaysOnMarket != null ? `${c.medianDaysOnMarket}d` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 6, fontSize: 10, color: "var(--sb-light)" }}>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          Redfin Data Center
        </a>
        {" · All Residential · * = low volume, use caution"}
      </div>
    </div>
  );
}
