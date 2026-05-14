// ---------------------------------------------------------------------------
// Weekend Ahead — surfaces curated weekend picks on the homepage
// ---------------------------------------------------------------------------
// The weekend-picks generator produces 4-6 AI-curated picks for the upcoming
// Sat/Sun, but they only appear in the Events tab strip on Fri-Sun. That's
// four weekdays of curated content sitting idle while residents are most
// likely planning. This card surfaces them on the homepage from Tue → Sun.
// ---------------------------------------------------------------------------

import weekendPicksJson from "../../../data/south-bay/weekend-picks.json";

const CITY_LABELS: Record<string, string> = {
  "san-jose": "San Jose",
  "campbell": "Campbell",
  "los-gatos": "Los Gatos",
  "saratoga": "Saratoga",
  "cupertino": "Cupertino",
  "santa-clara": "Santa Clara",
  "sunnyvale": "Sunnyvale",
  "mountain-view": "Mountain View",
  "palo-alto": "Palo Alto",
  "milpitas": "Milpitas",
  "los-altos": "Los Altos",
};

interface WeekendPick {
  id: string;
  title: string;
  date: string;
  displayDate: string;
  time: string | null;
  endTime?: string | null;
  city: string;
  venue: string;
  cost: string;
  url: string;
  category: string;
  why: string;
  photoRef?: string | null;
  image?: string | null;
}

function todayPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function pickPhoto(p: WeekendPick): string | null {
  if (p.image) return p.image;
  if (p.photoRef) return `/api/place-photo?ref=${encodeURIComponent(p.photoRef)}&w=320&h=320`;
  return null;
}

export default function WeekendAheadCard({ onNavigate }: { onNavigate: (tab: "events") => void }) {
  const data = weekendPicksJson as {
    generatedAt?: string;
    weekendStart: string;
    weekendEnd: string;
    weekendLabel: string;
    picks: WeekendPick[];
  };

  const todayIso = todayPT();
  const todayDow = new Date(todayIso + "T12:00:00").getDay();

  // Hide on Sat/Sun — by then weekend events should be flowing into the
  // bucket grid plans, and a "Weekend Ahead" tease has nothing to add.
  if (todayDow === 6 || todayDow === 0) return null;

  // Staleness guard — if the generator hasn't run in over a week, hide.
  if (data.generatedAt) {
    const ageDays = (Date.now() - new Date(data.generatedAt).getTime()) / 86_400_000;
    if (ageDays > 8) return null;
  }

  // Top 2 Sat picks, then top 2 Sun picks — Claude's emission order is the
  // editorial ranking, so a simple per-day slice is enough.
  const upcoming = data.picks.filter((p) => p.date >= todayIso);
  const sats = upcoming.filter((p) => new Date(p.date + "T12:00:00").getDay() === 6).slice(0, 2);
  const suns = upcoming.filter((p) => new Date(p.date + "T12:00:00").getDay() === 0).slice(0, 2);
  const visible = [...sats, ...suns];
  if (visible.length < 2) return null;

  const heading = "The Weekend Ahead";

  return (
    <section
      aria-label="Weekend ahead"
      style={{
        marginTop: 28,
        paddingTop: 24,
        borderTop: "1px solid #eee",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <header style={{ marginBottom: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: -1, color: "#000", lineHeight: 1.05 }}>
            {heading}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("events")}
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 900,
            padding: "6px 12px",
            borderRadius: 14,
            border: "2px solid #000",
            background: "#fff",
            color: "#000",
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          All events →
        </button>
      </header>

      <div className="wa-grid">
        {visible.map((p) => {
          const photo = pickPhoto(p);
          const cityName = CITY_LABELS[p.city] ?? p.city;
          const dayBadge =
            p.date === todayIso
              ? "Today"
              : p.date === addDays(todayIso, 1)
                ? "Tomorrow"
                : new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
          return (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="wa-tile"
              style={{
                background: photo
                  ? `#000 url(${photo}) center/cover no-repeat`
                  : "linear-gradient(135deg, #fb923c 0%, #c2410c 100%)",
              }}
              title={p.why}
            >
              <div className="wa-shade" />
              <div className="wa-top">
                <span className="wa-badge wa-badge-day">{dayBadge}</span>
                {p.cost === "free" && <span className="wa-badge wa-badge-free">FREE</span>}
              </div>
              <div className="wa-bottom">
                <div className="wa-title">{p.title}</div>
                <div className="wa-meta">
                  <span>{cityName}</span>
                  {p.time && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{p.time}</span>
                    </>
                  )}
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <style>{`
        .wa-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .wa-tile {
          position: relative;
          display: block;
          aspect-ratio: 1 / 1;
          border-radius: 14px;
          overflow: hidden;
          text-decoration: none;
          color: #fff;
          transition: transform 0.18s ease-out, box-shadow 0.18s ease-out;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          cursor: pointer;
        }
        .wa-tile:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 8px 20px rgba(0,0,0,0.18);
        }
        .wa-shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 30%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.85) 100%);
          pointer-events: none;
        }
        .wa-top {
          position: absolute;
          top: 8px;
          left: 8px;
          right: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          z-index: 2;
        }
        .wa-badge {
          padding: 4px 8px;
          border-radius: 999px;
          line-height: 1;
          white-space: nowrap;
        }
        .wa-badge-day {
          background: rgba(255,255,255,0.95);
          color: #c2410c;
        }
        .wa-badge-free {
          background: #15803d;
          color: #fff;
        }
        .wa-bottom {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 10px;
          z-index: 2;
        }
        .wa-title {
          font-size: 14px;
          font-weight: 800;
          line-height: 1.2;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin-bottom: 4px;
        }
        .wa-meta {
          display: flex;
          gap: 6px;
          font-size: 10px;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
          text-shadow: 0 1px 1px rgba(0,0,0,0.4);
        }
        @media (max-width: 760px) {
          .wa-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
          .wa-title {
            font-size: 13px;
          }
        }
      `}</style>
    </section>
  );
}
