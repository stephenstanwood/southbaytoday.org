// ---------------------------------------------------------------------------
// Around the South Bay — council news teaser for the Today tab.
// Pulls the 4 most-recent items from around-town.json (Stoa-sourced civic
// actions) and shows them with city-colored badges so a resident sees what
// their city government is doing without clicking through to the Gov tab.
// ---------------------------------------------------------------------------

import aroundTownJson from "../../../data/south-bay/around-town.json";
import type { Tab } from "../../../lib/south-bay/types";

interface Item {
  id: string;
  cityId: string;
  cityName: string;
  date: string;
  headline: string;
  summary: string;
  sourceUrl?: string | null;
  source?: string;
}

interface Data {
  items: Item[];
  generatedAt: string;
}

const CITY_DISPLAY: Record<string, string> = {
  "san-jose": "San José",
  "mountain-view": "Mountain View",
  "sunnyvale": "Sunnyvale",
  "santa-clara": "Santa Clara",
  "cupertino": "Cupertino",
  "milpitas": "Milpitas",
  "campbell": "Campbell",
  "saratoga": "Saratoga",
  "los-gatos": "Los Gatos",
  "los-altos": "Los Altos",
  "palo-alto": "Palo Alto",
};

const CITY_ACCENT: Record<string, string> = {
  "san-jose":      "#be123c",
  "mountain-view": "#0369a1",
  "sunnyvale":     "#0891b2",
  "santa-clara":   "#b45309",
  "cupertino":     "#6d28d9",
  "campbell":      "#1d4ed8",
  "milpitas":      "#4d7c0f",
  "los-gatos":     "#b45309",
  "palo-alto":     "#1d4ed8",
  "saratoga":      "#065F46",
  "los-altos":     "#7c3aed",
};

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Props {
  onNavigate: (tab: Tab) => void;
}

export default function AroundTownTeaser({ onNavigate }: Props) {
  const data = aroundTownJson as Data;
  const items = (data?.items ?? [])
    .filter((it) => it.headline && it.cityId)
    .slice(0, 4);
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Around the South Bay"
      style={{
        marginTop: 36,
        paddingTop: 28,
        borderTop: "1px solid #eee",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: -1, color: "#000", lineHeight: 1.05 }}>
          Around the South Bay
        </h2>
        <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0", fontWeight: 500 }}>
          What city councils are voting on this week
        </p>
      </header>

      <div className="at-list">
        {items.map((item) => {
          const cityKey = item.cityId;
          const cityLabel = CITY_DISPLAY[cityKey] ?? item.cityName;
          const accent = CITY_ACCENT[cityKey] ?? "#475569";
          const inner = (
            <>
              <div className="at-top">
                <span className="at-city" style={{ color: accent, background: accent + "15" }}>
                  {cityLabel}
                </span>
                <span className="at-date">{fmtDate(item.date)}</span>
              </div>
              <div className="at-headline">{item.headline}</div>
              {item.summary && <div className="at-summary">{item.summary}</div>}
            </>
          );
          return (
            <div key={item.id} className="at-row" style={{ borderLeftColor: accent }}>
              {item.sourceUrl ? (
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="at-link">
                  {inner}
                </a>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => onNavigate("government")}
          className="at-more"
        >
          More civic news →
        </button>
      </div>

      <style>{`
        .at-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .at-row {
          background: #fff;
          border: 1px solid #e8e8e8;
          border-left: 3px solid #475569;
          border-radius: 8px;
          padding: 12px 14px;
        }
        .at-link {
          color: inherit;
          text-decoration: none;
          display: block;
        }
        .at-link:hover .at-headline { text-decoration: underline; }
        .at-top {
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 4px;
        }
        .at-city {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 2px 7px;
          border-radius: 999px;
          line-height: 1.4;
          white-space: nowrap;
        }
        .at-date {
          font-size: 11px;
          color: #888;
          font-family: 'Space Mono', monospace;
          margin-left: auto;
          white-space: nowrap;
        }
        .at-headline {
          font-size: 14px;
          font-weight: 700;
          color: #000;
          line-height: 1.35;
          margin-bottom: 3px;
        }
        .at-summary {
          font-size: 12px;
          color: #555;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .at-more {
          font-family: 'Inter', sans-serif;
          font-size: 12px;
          font-weight: 800;
          padding: 6px 14px;
          border-radius: 999px;
          border: 2px solid #000;
          background: #fff;
          color: #000;
          cursor: pointer;
          letter-spacing: 0.3px;
        }
        .at-more:hover { background: #000; color: #fff; }
        @media (max-width: 760px) {
          .at-date { margin-left: 0; }
        }
      `}</style>
    </section>
  );
}
