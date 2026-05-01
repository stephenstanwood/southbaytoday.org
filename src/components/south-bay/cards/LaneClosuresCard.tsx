import laneClosuresJson from "../../../data/south-bay/lane-closures.json";

interface Closure {
  id: string;
  route: string;
  direction: string; // "NB" / "SB" / "EB" / "WB" / "Both"
  city: string;
  county: string;
  location: string;
  endLocation: string;
  lanesClosed: string;
  lanesText: string;
  totalLanes: number;
  type: string; // "Lane" / "Full" / "Alternating Lanes" / etc.
  isFull: boolean;
  work: string;
  duration: string;
  delay: number | null;
  facility: string;
  startEpoch: number;
  endEpoch: number;
  start: string; // "YYYY-MM-DD HH:MM" — local PT
  end: string;
}

interface LaneClosures {
  generatedAt: string;
  source: string;
  sourceUrl: string;
  windowHours: number;
  stats: { total: number; full: number; activeNow: number };
  closures: Closure[];
  error?: string;
}

const data = laneClosuresJson as LaneClosures;

// Reuse the Freeway Pulse shield palette so the two cards visually agree.
function routeBadge(route: string): { label: string; bg: string; fg: string } {
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
    "84":  { bg: "#1F2937", fg: "#fff" },
    "92":  { bg: "#1F2937", fg: "#fff" },
    "82":  { bg: "#374151", fg: "#fff" },
    "35":  { bg: "#374151", fg: "#fff" },
  };
  const colors = map[num] ?? { bg: "#1F2937", fg: "#fff" };
  return { label: num, ...colors };
}

// Caltrans data is local PT with no timezone marker. Treat as PT.
function parsePT(local: string): number {
  if (!local) return NaN;
  const iso = local.replace(" ", "T") + ":00-07:00";
  return new Date(iso).getTime();
}

function fmtClock(local: string): string {
  if (!local) return "";
  const t = local.split(" ")[1] ?? "";
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return "";
  let hr = parseInt(m[1], 10);
  const min = m[2];
  const ampm = hr >= 12 ? "PM" : "AM";
  if (hr === 0) hr = 12;
  if (hr > 12) hr -= 12;
  return min === "00" ? `${hr}${ampm}` : `${hr}:${min}${ampm}`;
}

// "Tonight 9PM–5AM", "Now until 8PM", "Fri 9PM–5AM Sat" etc. — humanize the
// time band so a reader doesn't have to parse a YYYY-MM-DD HH:MM string.
function timeBand(c: Closure, nowMs: number): string {
  const startMs = parsePT(c.start);
  const endMs = parsePT(c.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return c.start;

  const isActive = startMs <= nowMs && endMs > nowMs;
  const startLabel = fmtClock(c.start);
  const endLabel = fmtClock(c.end);

  if (isActive) return `Now until ${endLabel}`;

  const startDay = new Date(startMs).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  });
  const endDay = new Date(endMs).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  });
  const todayDay = new Date(nowMs).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  });

  // Determine "tonight" — closure starts today after 4PM, ends tomorrow before noon.
  const startHour = new Date(startMs).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
  });
  const sH = parseInt(startHour, 10);
  const isOvernight = sH >= 16 && startDay !== endDay;

  if (startDay === todayDay && isOvernight) {
    return `Tonight ${startLabel}–${endLabel}`;
  }
  if (startDay === todayDay) {
    return `Today ${startLabel}–${endLabel}`;
  }
  if (startDay !== endDay) {
    return `${startDay} ${startLabel}–${endLabel} ${endDay}`;
  }
  return `${startDay} ${startLabel}–${endLabel}`;
}

// Caltrans location text is messy: "Route 280" is the freeway itself (mainline
// segment) which adds nothing useful — fall back to a friendlier "near {city}"
// when that's all we have. Same for empty location.
function locLabel(c: Closure): string {
  const loc = (c.location || "").trim();
  if (!loc || /^Route \d+$/i.test(loc)) return `near ${c.city}`;
  return `${loc}, ${c.city}`;
}

// "Lane" is too cryptic on its own. Phrase it conversationally so the reader
// doesn't have to translate.
function typeLabel(c: Closure): string {
  if (c.isFull) {
    if (/On Ramp/i.test(c.facility)) return "On-ramp closed";
    if (/Off Ramp/i.test(c.facility)) return "Off-ramp closed";
    if (/Connector/i.test(c.facility)) return "Connector closed";
    return "Full closure";
  }
  if (/Alternating/i.test(c.type)) return `Alternating · ${c.lanesText}`;
  return c.lanesText;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function LaneClosuresCard() {
  if (data.error) return null;
  if (!data.closures || data.closures.length === 0) return null;

  const nowMs = Date.now();
  const moreCount = Math.max(0, data.stats.total - data.closures.length);
  const updated = data.generatedAt ? timeAgo(data.generatedAt) : "";

  return (
    <section className="lane-closures">
      <header className="lane-closures-head">
        <div>
          <h2 className="lane-closures-h2">Lane Closures</h2>
          <p className="lane-closures-sub">
            Scheduled closures on South Bay freeways · Next 36 hours
            {updated ? <> · Updated {updated}</> : null}
          </p>
        </div>
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="lane-closures-source"
        >
          Caltrans D4 →
        </a>
      </header>

      <ul className="lane-closures-list">
        {data.closures.map((c) => {
          const badge = routeBadge(c.route);
          const startMs = parsePT(c.start);
          const isActive = startMs <= nowMs && parsePT(c.end) > nowMs;
          return (
            <li
              key={c.id}
              className={`lane-row${c.isFull ? " lane-row-full" : ""}${isActive ? " lane-row-active" : ""}`}
            >
              <span
                className="lane-shield"
                style={{ background: badge.bg, color: badge.fg }}
                aria-label={`Route ${badge.label}`}
              >
                {badge.label}
              </span>
              <div className="lane-body">
                <div className="lane-line1">
                  <span className="lane-direction">{c.direction}</span>
                  <span className="lane-loc">{locLabel(c)}</span>
                  {isActive && <span className="lane-active-pill">Active now</span>}
                </div>
                <div className="lane-line2">
                  <span className={`lane-type-pill${c.isFull ? " lane-type-full" : ""}`}>
                    {typeLabel(c)}
                  </span>
                  <span className="lane-time">{timeBand(c, nowMs)}</span>
                </div>
                <div className="lane-work">{c.work}</div>
              </div>
            </li>
          );
        })}
      </ul>

      {moreCount > 0 && (
        <p className="lane-closures-more">
          + {moreCount} more {moreCount === 1 ? "closure" : "closures"} in the next 36 hours.{" "}
          <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">
            See full list ↗
          </a>
        </p>
      )}

      <LaneClosuresStyles />
    </section>
  );
}

function LaneClosuresStyles() {
  return (
    <style>{`
      .lane-closures {
        font-family: 'Inter', sans-serif;
        margin-top: 36px;
        padding-top: 28px;
        border-top: 1px solid #eee;
      }
      .lane-closures-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }
      .lane-closures-h2 {
        font-size: 26px;
        font-weight: 900;
        margin: 0;
        letter-spacing: -1px;
        color: #000;
        line-height: 1.05;
      }
      .lane-closures-sub {
        font-size: 13px;
        color: #666;
        margin: 4px 0 0;
        font-weight: 500;
      }
      .lane-closures-source {
        flex-shrink: 0;
        font-size: 11px;
        color: #1e3a8a;
        text-decoration: none;
        font-weight: 600;
        font-family: 'Space Mono', monospace;
        letter-spacing: 0.04em;
        white-space: nowrap;
      }
      .lane-closures-source:hover { text-decoration: underline; }

      .lane-closures-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .lane-row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        background: #fff;
        border: 1.5px solid #e5e7eb;
        border-radius: 10px;
        padding: 12px 14px;
      }
      .lane-row-full {
        border-color: #FCA5A5;
        background: #FEF2F2;
      }
      .lane-row-active {
        border-color: #F59E0B;
        background: #FFFBEB;
      }
      .lane-row-active.lane-row-full {
        border-color: #DC2626;
        background: #FEF2F2;
      }

      .lane-shield {
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
        margin-top: 1px;
      }

      .lane-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .lane-line1 {
        display: flex;
        align-items: baseline;
        gap: 8px;
        flex-wrap: wrap;
      }
      .lane-direction {
        font-size: 13px;
        font-weight: 800;
        color: #111;
        letter-spacing: 0.04em;
      }
      .lane-loc {
        font-size: 13px;
        color: #1f2937;
        font-weight: 500;
      }
      .lane-active-pill {
        flex-shrink: 0;
        font-size: 9px;
        font-weight: 800;
        font-family: 'Space Mono', monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: #DC2626;
        color: #fff;
        padding: 2px 6px;
        border-radius: 3px;
      }

      .lane-line2 {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .lane-type-pill {
        font-size: 10px;
        font-weight: 800;
        font-family: 'Space Mono', monospace;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: #F3F4F6;
        color: #1F2937;
        padding: 2px 7px;
        border-radius: 3px;
      }
      .lane-type-full {
        background: #DC2626;
        color: #fff;
      }
      .lane-time {
        font-size: 12px;
        font-weight: 600;
        color: #374151;
        font-family: 'Space Mono', monospace;
      }

      .lane-work {
        font-size: 11px;
        color: #6b7280;
        font-weight: 500;
        font-style: italic;
      }

      .lane-closures-more {
        font-size: 12px;
        color: #6b7280;
        margin: 14px 0 0;
        font-weight: 500;
      }
      .lane-closures-more a {
        color: #1e3a8a;
        font-weight: 600;
        text-decoration: none;
      }
      .lane-closures-more a:hover { text-decoration: underline; }
    `}</style>
  );
}
