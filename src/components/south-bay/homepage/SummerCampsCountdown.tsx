// ---------------------------------------------------------------------------
// Summer Camps Countdown — registration teaser, surfaced on the Today tab.
// ---------------------------------------------------------------------------
// Pulls from camps-data.ts and shows featured programs with city color,
// type tag, age range, and week count. Headline counts down to the first
// session start (SUMMER_WEEKS[0]) so parents know how much runway is left
// to register. Visual vocabulary matches CityHallThisWeek / JustOpened so
// the home tab stays one voice. Hides itself once camp season is well
// underway so the strip retires cleanly come mid-summer.
// ---------------------------------------------------------------------------

import { CAMPS, SUMMER_WEEKS, type Camp, type CampType } from "../../../data/south-bay/camps-data";

const CITY_LABEL: Record<string, string> = {
  "san-jose": "San José",
  "santa-clara": "Santa Clara",
  "sunnyvale": "Sunnyvale",
  "mountain-view": "Mountain View",
  "palo-alto": "Palo Alto",
  "los-altos": "Los Altos",
  "cupertino": "Cupertino",
  "campbell": "Campbell",
  "saratoga": "Saratoga",
  "los-gatos": "Los Gatos",
  "milpitas": "Milpitas",
  "multi": "Multi-city",
};

// Same palette as CityHallThisWeek / JustOpened so the home tab reads as
// one consistent map.
const CITY_ACCENT: Record<string, string> = {
  "campbell":      "#1d4ed8",
  "los-gatos":     "#b45309",
  "saratoga":      "#065F46",
  "cupertino":     "#6d28d9",
  "sunnyvale":     "#0891b2",
  "mountain-view": "#0369a1",
  "san-jose":      "#be123c",
  "santa-clara":   "#b45309",
  "palo-alto":     "#1d4ed8",
  "milpitas":      "#4d7c0f",
  "los-altos":     "#7c3aed",
  "multi":         "#1A1A1A",
};

const TYPE_LABEL: Record<CampType, string> = {
  general:   "GENERAL",
  sports:    "SPORTS",
  arts:      "ARTS",
  stem:      "STEM",
  nature:    "NATURE",
  specialty: "SPECIALTY",
  academic:  "ACADEMIC",
};

const TYPE_ACCENT: Record<CampType, string> = {
  general:   "#1A1A1A",
  sports:    "#b45309",
  arts:      "#be123c",
  stem:      "#1d4ed8",
  nature:    "#15803d",
  specialty: "#6d28d9",
  academic:  "#0891b2",
};

const MAX_ROWS = 5;

function daysBetween(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(fromIso + "T00:00:00");
  const toMs = Date.parse(toIso + "T00:00:00");
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function ageRange(camp: Camp): string {
  if (camp.ageMin === camp.ageMax) return `Age ${camp.ageMin}`;
  return `Ages ${camp.ageMin}–${camp.ageMax}`;
}

/** Pick featured camps but spread across cities so the card doesn't read
 *  like five San Jose programs in a row. Falls back to non-featured camps
 *  if we don't have enough featured variety. */
function pickHighlights(): Camp[] {
  const featured = CAMPS.filter((c) => c.featured);
  const seenCity = new Set<string>();
  const picks: Camp[] = [];
  for (const c of featured) {
    if (seenCity.has(c.cityId)) continue;
    seenCity.add(c.cityId);
    picks.push(c);
    if (picks.length >= MAX_ROWS) break;
  }
  if (picks.length < MAX_ROWS) {
    for (const c of featured) {
      if (picks.includes(c)) continue;
      picks.push(c);
      if (picks.length >= MAX_ROWS) break;
    }
  }
  if (picks.length < MAX_ROWS) {
    for (const c of CAMPS) {
      if (picks.includes(c)) continue;
      picks.push(c);
      if (picks.length >= MAX_ROWS) break;
    }
  }
  return picks;
}

interface Props {
  /** Hook for the "see all" link — opens the Camps tab. */
  onSeeAll?: () => void;
}

export default function SummerCampsCountdown({ onSeeAll }: Props) {
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const firstStart = SUMMER_WEEKS[0]?.startDate;
  if (!firstStart) return null;

  const daysToStart = daysBetween(todayIso, firstStart);
  // Hide once camp season is well underway — by week 3 most families are
  // either booked or improvising. Lets the card retire without manual edits.
  if (daysToStart < -14) return null;

  const cityCount = new Set(
    CAMPS.map((c) => c.cityId).filter((id) => id && id !== "multi"),
  ).size;

  const highlights = pickHighlights();
  if (highlights.length === 0) return null;

  const headline = (() => {
    if (daysToStart > 1) return `${daysToStart} days until the first session (${formatDate(firstStart)})`;
    if (daysToStart === 1) return `First session starts tomorrow (${formatDate(firstStart)})`;
    if (daysToStart === 0) return `First session starts today`;
    return `Camp season is underway — late spots still open`;
  })();

  const handleSeeAll = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onSeeAll) {
      e.preventDefault();
      onSeeAll();
    }
  };

  return (
    <section
      aria-label="Summer Camps"
      style={{
        marginTop: 36,
        paddingTop: 28,
        borderTop: "1px solid #eee",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: -1, color: "#000", lineHeight: 1.05 }}>
          Summer Camps
        </h2>
        <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0", fontWeight: 500 }}>
          {headline} · {CAMPS.length} programs across {cityCount} cities
        </p>
      </header>

      <ul className="sc-list">
        {highlights.map((camp) => {
          const accent = CITY_ACCENT[camp.cityId] ?? "#1A1A1A";
          const cityLabel = CITY_LABEL[camp.cityId] ?? camp.cityName;
          const typeLabel = TYPE_LABEL[camp.type];
          const typeColor = TYPE_ACCENT[camp.type];
          const weekCount = camp.weeks.length;
          return (
            <li key={camp.id} className="sc-row" style={{ borderLeftColor: accent }}>
              <a
                href={camp.registerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sc-link"
              >
                <div className="sc-meta">
                  <span className="sc-city" style={{ color: accent }}>{cityLabel}</span>
                  <span className="sc-dot">·</span>
                  <span className="sc-tag" style={{ color: typeColor }}>{typeLabel}</span>
                  <span className="sc-dot">·</span>
                  <span className="sc-age">{ageRange(camp)}</span>
                  <span className="sc-dot">·</span>
                  <span className="sc-weeks">{weekCount} wk{weekCount === 1 ? "" : "s"}</span>
                </div>
                <div className="sc-title">{camp.name}</div>
              </a>
            </li>
          );
        })}
      </ul>

      {onSeeAll && (
        <a href="/camps" onClick={handleSeeAll} className="sc-cta">
          See all camps →
        </a>
      )}

      <style>{`
        .sc-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sc-row {
          background: #fff;
          border: 1px solid #eee;
          border-left: 4px solid #1A1A1A;
          border-radius: 8px;
          overflow: hidden;
          transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
        }
        .sc-row:hover {
          transform: translateX(2px);
          box-shadow: 0 2px 6px rgba(0,0,0,0.06);
        }
        .sc-link {
          display: block;
          padding: 10px 14px;
          text-decoration: none;
          color: inherit;
        }
        .sc-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          font-family: 'Space Mono', monospace;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }
        .sc-city { font-weight: 800; }
        .sc-dot { color: #bbb; }
        .sc-tag { font-weight: 800; }
        .sc-age { color: #555; }
        .sc-weeks { color: #555; }
        .sc-title {
          font-size: 14px;
          font-weight: 700;
          color: #1A1A1A;
          line-height: 1.35;
        }
        .sc-cta {
          display: inline-block;
          margin-top: 12px;
          font-size: 12px;
          font-weight: 800;
          font-family: 'Space Mono', monospace;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #1A1A1A;
          text-decoration: none;
          border-bottom: 2px solid #1A1A1A;
          padding-bottom: 1px;
        }
        .sc-cta:hover {
          color: #15803d;
          border-color: #15803d;
        }
      `}</style>
    </section>
  );
}
