import freewayPulseJson from "../../../data/south-bay/freeway-pulse.json";

interface Destination {
  to: string;
  minutes: number;
}

interface Sign {
  route: string;
  direction: string;
  near: string;
  city: string;
  destinations: Destination[];
  alert: string | null;
  updatedAt: string | null;
}

interface FreewayPulse {
  generatedAt: string;
  source: string;
  sourceUrl: string;
  signs: Sign[];
  stats: {
    totalSigns: number;
    alerts: number;
  };
  error?: string;
}

const data = freewayPulseJson as FreewayPulse;

// Drop signs that are stale relative to the snapshot. Caltrans CMS messages
// typically refresh every minute or two; if our generator hasn't run in a
// while the data is still useful but the per-sign updatedAt is what actually
// reflects "live now." Two hours is generous.
const MAX_STALE_MS = 2 * 60 * 60 * 1000;

function routeBadge(route: string): { label: string; bg: string; fg: string } {
  // Match the typical Caltrans shield color cues so each route is recognizable
  // at a glance.
  const num = route.replace(/^\D+-/, "");
  const map: Record<string, { bg: string; fg: string }> = {
    "101": { bg: "#1E3A8A", fg: "#fff" },
    "280": { bg: "#0F766E", fg: "#fff" },
    "680": { bg: "#7E22CE", fg: "#fff" },
    "880": { bg: "#B45309", fg: "#fff" },
    "85":  { bg: "#0369A1", fg: "#fff" },
    "17":  { bg: "#15803D", fg: "#fff" },
    "87":  { bg: "#475569", fg: "#fff" },
    "237": { bg: "#9333EA", fg: "#fff" },
  };
  const colors = map[num] ?? { bg: "#1F2937", fg: "#fff" };
  return { label: num, ...colors };
}

function directionLabel(dir: string): string {
  if (!dir) return "";
  const d = dir.charAt(0).toUpperCase();
  return `${d}B`; // "North" -> "NB"
}

function relativeAge(iso: string | null): string {
  if (!iso) return "";
  // Caltrans times come back as local PT (no zone marker). Treat as PT.
  const d = new Date(iso.includes("T") ? `${iso}-07:00` : iso);
  const ms = Date.now() - d.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function FreewayPulseCard() {
  if (data.error) return null;

  const fresh = data.signs.filter((s) => {
    if (!s.updatedAt) return true;
    const t = new Date(s.updatedAt.includes("T") ? `${s.updatedAt}-07:00` : s.updatedAt).getTime();
    if (!Number.isFinite(t)) return true;
    return Date.now() - t < MAX_STALE_MS;
  });

  if (fresh.length === 0) return null;

  const generated = data.generatedAt
    ? new Date(data.generatedAt).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <section className="freeway-pulse">
      <header className="freeway-pulse-head">
        <div>
          <h2 className="freeway-pulse-h2">Freeway Pulse</h2>
          <p className="freeway-pulse-sub">
            Live travel times from Caltrans message signs across Santa Clara County
            {generated ? <> · Snapshot {generated} PT</> : null}
          </p>
        </div>
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="freeway-pulse-source"
        >
          Caltrans D4 →
        </a>
      </header>

      <div className="freeway-pulse-grid">
        {fresh.map((sign) => {
          const badge = routeBadge(sign.route);
          const dir = directionLabel(sign.direction);
          const age = relativeAge(sign.updatedAt);
          return (
            <div key={`${sign.route}-${sign.direction}`} className={`freeway-row${sign.alert ? " freeway-row-alert" : ""}`}>
              <div className="freeway-row-head">
                <span
                  className="freeway-shield"
                  style={{ background: badge.bg, color: badge.fg }}
                  aria-label={`Route ${badge.label}`}
                >
                  {badge.label}
                </span>
                <div className="freeway-row-headtext">
                  <span className="freeway-row-direction">{dir}</span>
                  {sign.near && (
                    <span className="freeway-row-near">
                      from {sign.near}{sign.city ? `, ${sign.city}` : ""}
                    </span>
                  )}
                </div>
                {age && <span className="freeway-row-age">{age}</span>}
              </div>

              {sign.alert ? (
                <div className="freeway-row-alert-text">⚠ {sign.alert}</div>
              ) : (
                <div className="freeway-row-dests">
                  {sign.destinations.map((d, i) => (
                    <div key={i} className="freeway-dest">
                      <span className="freeway-dest-to">{d.to}</span>
                      <span className="freeway-dest-min">{d.minutes}<span className="freeway-dest-unit">min</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="freeway-pulse-note">
        Sourced from Caltrans dynamic message signs · Updates every cycle ·
        Direction reflects the sign's posted travel times
      </p>

      <FreewayPulseStyles />
    </section>
  );
}

function FreewayPulseStyles() {
  return (
    <style>{`
      .freeway-pulse {
        font-family: 'Inter', sans-serif;
        margin-top: 36px;
        padding-top: 28px;
        border-top: 1px solid #eee;
      }
      .freeway-pulse-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }
      .freeway-pulse-h2 {
        font-size: 26px;
        font-weight: 900;
        margin: 0;
        letter-spacing: -1px;
        color: #000;
        line-height: 1.05;
      }
      .freeway-pulse-sub {
        font-size: 13px;
        color: #666;
        margin: 4px 0 0;
        font-weight: 500;
      }
      .freeway-pulse-source {
        flex-shrink: 0;
        font-size: 11px;
        color: #1e3a8a;
        text-decoration: none;
        font-weight: 600;
        font-family: 'Space Mono', monospace;
        letter-spacing: 0.04em;
        white-space: nowrap;
      }
      .freeway-pulse-source:hover { text-decoration: underline; }

      .freeway-pulse-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 10px;
      }

      .freeway-row {
        background: #fff;
        border: 1.5px solid #e5e7eb;
        border-radius: 10px;
        padding: 12px 14px;
      }
      .freeway-row-alert {
        border-color: #FCA5A5;
        background: #FEF2F2;
      }

      .freeway-row-head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
      }
      .freeway-shield {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 38px;
        height: 28px;
        padding: 0 8px;
        border-radius: 6px;
        font-family: 'Space Mono', monospace;
        font-weight: 800;
        font-size: 14px;
        letter-spacing: 0.02em;
      }
      .freeway-row-headtext {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .freeway-row-direction {
        font-size: 13px;
        font-weight: 800;
        color: #111;
        letter-spacing: 0.04em;
      }
      .freeway-row-near {
        font-size: 11px;
        color: #6b7280;
        font-weight: 500;
        line-height: 1.2;
      }
      .freeway-row-age {
        flex-shrink: 0;
        font-size: 10px;
        color: #9ca3af;
        font-family: 'Space Mono', monospace;
        white-space: nowrap;
      }

      .freeway-row-dests {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .freeway-dest {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        padding: 4px 0;
        border-bottom: 1px dashed #f3f4f6;
      }
      .freeway-dest:last-child { border-bottom: none; }
      .freeway-dest-to {
        font-size: 13px;
        color: #1f2937;
        font-weight: 500;
      }
      .freeway-dest-min {
        font-size: 16px;
        font-weight: 700;
        color: #111;
        font-family: 'Space Mono', monospace;
      }
      .freeway-dest-unit {
        font-size: 10px;
        font-weight: 500;
        color: #9ca3af;
        margin-left: 3px;
        font-family: 'Inter', sans-serif;
      }

      .freeway-row-alert-text {
        font-size: 13px;
        color: #991b1b;
        font-weight: 600;
        line-height: 1.4;
      }

      .freeway-pulse-note {
        font-size: 11px;
        color: #9ca3af;
        margin: 12px 0 0;
        font-weight: 500;
        text-align: center;
      }
    `}</style>
  );
}
