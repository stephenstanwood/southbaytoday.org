// ---------------------------------------------------------------------------
// Just Opened — a quick-glance strip of new restaurants/grocers that just
// passed final health inspection. Pulls from scc-food-openings.json and
// surfaces the most recent 4 on the Today tab so a resident sees "what's
// new in town" without clicking through to the Food tab.
// ---------------------------------------------------------------------------

import sccFoodOpeningsJson from "../../../data/south-bay/scc-food-openings.json";
import type { Tab } from "../../../lib/south-bay/types";

interface Item {
  id: string;
  name: string;
  address: string | null;
  cityId: string | null;
  cityName: string;
  date: string | null;
  status: "opened" | "coming-soon";
  blurb?: string | null;
}

interface Data {
  generatedAt: string;
  opened: Item[];
  comingSoon: Item[];
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

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Props {
  onNavigate: (tab: Tab) => void;
}

export default function JustOpenedTeaser({ onNavigate }: Props) {
  const data = sccFoodOpeningsJson as Data;
  const opened = (data?.opened ?? [])
    .filter((it) => it.date)
    .slice()
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 4);
  if (opened.length === 0) return null;

  const totalCount = (data.opened?.length ?? 0) + (data.comingSoon?.length ?? 0);

  return (
    <section
      aria-label="Just Opened"
      style={{
        marginTop: 36,
        paddingTop: 28,
        borderTop: "1px solid #eee",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: -1, color: "#000", lineHeight: 1.05 }}>
          Just Opened
        </h2>
        <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0", fontWeight: 500 }}>
          Restaurants and grocers that just passed final health inspection
        </p>
      </header>

      <div className="jo-list">
        {opened.map((item) => {
          const cityKey = item.cityId ?? "";
          const cityLabel = CITY_DISPLAY[cityKey] ?? item.cityName;
          const accent = CITY_ACCENT[cityKey] ?? "#16a34a";
          return (
            <div key={item.id} className="jo-row">
              <div className="jo-dot" style={{ background: accent }} />
              <div className="jo-body">
                <div className="jo-top">
                  <span className="jo-name">{item.name}</span>
                  <span className="jo-city" style={{ color: accent, background: accent + "15" }}>
                    {cityLabel}
                  </span>
                  {item.date && <span className="jo-date">{fmtDate(item.date)}</span>}
                </div>
                {item.blurb && <div className="jo-blurb">{item.blurb}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => onNavigate("food")}
          className="jo-more"
        >
          See all {totalCount} new + coming soon →
        </button>
      </div>

      <style>{`
        .jo-list {
          display: flex;
          flex-direction: column;
          gap: 0;
          background: #fff;
          border: 1px solid #e8e8e8;
          border-radius: 10px;
          overflow: hidden;
        }
        .jo-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid #f1f1f1;
        }
        .jo-row:last-child { border-bottom: none; }
        .jo-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 6px;
        }
        .jo-body { flex: 1; min-width: 0; }
        .jo-top {
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
        }
        .jo-name {
          font-size: 14px;
          font-weight: 700;
          color: #000;
        }
        .jo-city {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 2px 7px;
          border-radius: 999px;
          line-height: 1.4;
          white-space: nowrap;
        }
        .jo-date {
          font-size: 11px;
          color: #888;
          font-family: 'Space Mono', monospace;
          margin-left: auto;
          white-space: nowrap;
        }
        .jo-blurb {
          font-size: 12px;
          color: #555;
          line-height: 1.45;
          margin-top: 3px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .jo-more {
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
        .jo-more:hover { background: #000; color: #fff; }
        @media (max-width: 760px) {
          .jo-name { font-size: 13px; }
          .jo-date { margin-left: 0; }
        }
      `}</style>
    </section>
  );
}
