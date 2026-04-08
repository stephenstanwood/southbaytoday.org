// ---------------------------------------------------------------------------
// Around the South Bay — civic actions from public records
// ---------------------------------------------------------------------------

import aroundTownJson from "../../../data/south-bay/around-town.json";
import { getCityName } from "../../../lib/south-bay/cities";
import type { City } from "../../../lib/south-bay/types";

type AroundTownItem = {
  id?: string;
  headline: string;
  summary: string;
  cityId: string;
  cityName: string;
  source: string;
  sourceUrl?: string;
  date: string;
};

const CITY_ACCENT: Record<string, string> = {
  "san-jose": "#1e3a8a", campbell: "#7c2d12", "los-gatos": "#065f46",
  saratoga: "#6b21a8", cupertino: "#0e7490", sunnyvale: "#b45309",
  "mountain-view": "#9a3412", "palo-alto": "#166534", "santa-clara": "#1d4ed8",
  "los-altos": "#854d0e", milpitas: "#991b1b",
};

export default function AroundTown() {
  const items = (aroundTownJson as { items: AroundTownItem[] }).items;
  if (!items?.length) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{
          fontFamily: "var(--sb-serif)", fontWeight: 800, fontSize: 18,
          color: "var(--sb-ink)", margin: 0,
        }}>
          Around the South Bay
        </h2>
        <span style={{
          fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.12em", textTransform: "uppercase" as const,
          color: "var(--sb-light)",
        }}>
          from public records
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {items.map((item, i) => {
          const accent = CITY_ACCENT[item.cityId] ?? "var(--sb-primary)";
          const dateFormatted = new Date(item.date + "T12:00:00").toLocaleDateString("en-US", {
            month: "short", day: "numeric",
          });
          return (
            <div key={item.id ?? i} style={{
              padding: "14px 0",
              borderBottom: i < items.length - 1 ? "1px solid var(--sb-border-light)" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3,
                  background: accent + "18", color: accent, letterSpacing: "0.04em",
                }}>
                  {item.cityName.toUpperCase()}
                </span>
                {item.source && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2,
                    background: item.source === "permit" ? "#92400e18" : item.source === "planning" ? "#06522818" : "#1e3a8a18",
                    color: item.source === "permit" ? "#92400e" : item.source === "planning" ? "#065228" : "#1e3a8a",
                    letterSpacing: "0.06em", fontFamily: "'Space Mono', monospace",
                  }}>
                    {item.source.toUpperCase()}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "var(--sb-muted)", fontFamily: "'Space Mono', monospace" }}>
                  {dateFormatted}
                </span>
              </div>
              <div style={{ fontFamily: "var(--sb-serif)", fontWeight: 700, fontSize: 14, color: "var(--sb-ink)", lineHeight: 1.35, marginBottom: 4 }}>
                {item.headline}
              </div>
              <div style={{ fontSize: 12, color: "var(--sb-muted)", lineHeight: 1.55 }}>
                {item.summary}{" "}
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: accent, textDecoration: "none", fontWeight: 600 }}
                  >
                    Source →
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
