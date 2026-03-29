// ── 2026 Elections Card ──────────────────────────────────────────────────────
// Shows countdown to CA Primary, voter registration deadlines, and key races.
// Displayed on the Government tab.

const PRIMARY_DATE = new Date("2026-06-02T07:00:00-07:00"); // CA Primary, polls open 7am
const GENERAL_DATE = new Date("2026-11-03T07:00:00-08:00");  // General Election
const REG_DEADLINE = new Date("2026-05-18T23:59:59-07:00");   // Online/mail reg deadline
const VBM_DEADLINE = new Date("2026-05-26T23:59:59-07:00");   // Vote-by-mail request deadline
const EARLY_VOTE_START = new Date("2026-05-09T00:00:00-07:00"); // Vote centers open

interface KeyDate {
  label: string;
  sublabel: string;
  isoDate: string;
  accentColor: string;
  urgent: boolean; // highlight if <30 days away
}

const KEY_DATES: KeyDate[] = [
  {
    label: "Voter Reg Deadline",
    sublabel: "Online / mail-in",
    isoDate: "2026-05-18",
    accentColor: "#1d4ed8",
    urgent: true,
  },
  {
    label: "Vote-by-Mail Cutoff",
    sublabel: "Request deadline",
    isoDate: "2026-05-26",
    accentColor: "#1d4ed8",
    urgent: true,
  },
  {
    label: "Early Voting Opens",
    sublabel: "Vote centers + drop boxes",
    isoDate: "2026-05-09",
    accentColor: "#065f46",
    urgent: false,
  },
  {
    label: "CA Primary Election",
    sublabel: "All registered voters",
    isoDate: "2026-06-02",
    accentColor: "#c0392b",
    urgent: true,
  },
  {
    label: "General Election",
    sublabel: "November statewide",
    isoDate: "2026-11-03",
    accentColor: "#7c3aed",
    urgent: false,
  },
];

const KEY_RACES = [
  {
    race: "California Governor",
    note: "Open seat — Newsom term-limited",
    emoji: "🏛️",
  },
  {
    race: "US Senate — California",
    note: "Alex Padilla (D) on ballot",
    emoji: "🇺🇸",
  },
  {
    race: "State Assembly & Senate",
    note: "Multiple South Bay districts",
    emoji: "📋",
  },
  {
    race: "SCC Board of Supervisors",
    note: "Santa Clara County seats",
    emoji: "🏙️",
  },
  {
    race: "City Council Races",
    note: "San Jose, Sunnyvale, Mountain View + more",
    emoji: "🗳️",
  },
];

function daysUntil(isoDate: string): number {
  const now = new Date();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const diff = Math.ceil((target.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ElectionsCard() {
  const now = new Date();
  const primaryDays = daysUntil("2026-06-02");
  const generalDays = daysUntil("2026-11-03");

  // Don't show if both elections are past
  if (primaryDays < -7 && generalDays < -7) return null;

  // Show general-election-focused messaging after primary
  const pastPrimary = primaryDays < -7;
  const focusDate = pastPrimary ? "2026-11-03" : "2026-06-02";
  const focusDays = pastPrimary ? generalDays : primaryDays;
  const focusLabel = pastPrimary ? "General Election" : "CA Primary";

  // Sort dates: show upcoming only, sorted ascending
  const upcomingDates = KEY_DATES
    .filter((kd) => daysUntil(kd.isoDate) >= 0)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
    .slice(0, 4);

  return (
    <div
      style={{
        border: "1px solid var(--sb-border-light)",
        borderTop: "3px solid #1d4ed8",
        borderRadius: "var(--sb-radius)",
        padding: "16px 16px 14px",
        marginBottom: 20,
        background: "var(--sb-card)",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15 }}>🗳️</span>
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "'Space Mono', monospace",
                color: "var(--sb-ink)",
                letterSpacing: "0.02em",
              }}
            >
              2026 Elections
            </h3>
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--sb-muted)" }}>
            Santa Clara County · California
          </p>
        </div>

        {/* Headline countdown */}
        <div
          style={{
            textAlign: "right",
            flexShrink: 0,
            background: focusDays <= 30 ? "#fef2f2" : "#f0f9ff",
            border: `1px solid ${focusDays <= 30 ? "#fecaca" : "#bae6fd"}`,
            borderRadius: 4,
            padding: "6px 10px",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "'Space Mono', monospace",
              color: focusDays <= 30 ? "#c0392b" : "#1d4ed8",
              lineHeight: 1,
            }}
          >
            {focusDays}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sb-muted)", marginTop: 2 }}>
            days to {focusLabel}
          </div>
        </div>
      </div>

      {/* ── Key dates ── */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--sb-muted)",
            marginBottom: 8,
            fontFamily: "'Space Mono', monospace",
          }}
        >
          Key Dates
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {upcomingDates.map((kd) => {
            const days = daysUntil(kd.isoDate);
            const isNear = days <= 14;
            return (
              <div
                key={kd.isoDate}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 3,
                  background: isNear ? "#fef9ec" : "transparent",
                  border: isNear ? "1px solid #fde68a" : "1px solid transparent",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--sb-ink)" }}>
                    {kd.label}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--sb-muted)" }}>
                    {kd.sublabel} · {formatDateLabel(kd.isoDate)}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: "'Space Mono', monospace",
                    color: kd.accentColor,
                    flexShrink: 0,
                  }}
                >
                  {days === 0
                    ? "Today"
                    : days === 1
                    ? "Tomorrow"
                    : `${days}d`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Key races ── */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--sb-muted)",
            marginBottom: 8,
            fontFamily: "'Space Mono', monospace",
          }}
        >
          On the Ballot
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 6,
          }}
        >
          {KEY_RACES.map((r) => (
            <div
              key={r.race}
              style={{
                padding: "6px 8px",
                border: "1px solid var(--sb-border-light)",
                borderRadius: 3,
                display: "flex",
                gap: 7,
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 13, marginTop: 1, flexShrink: 0 }}>{r.emoji}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--sb-ink)", lineHeight: 1.3 }}>
                  {r.race}
                </div>
                <div style={{ fontSize: 10, color: "var(--sb-muted)", lineHeight: 1.3, marginTop: 1 }}>
                  {r.note}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA links ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <a
          href="https://sccvote.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 10px",
            fontSize: 11,
            fontWeight: 600,
            color: "#fff",
            background: "#1d4ed8",
            borderRadius: 3,
            textDecoration: "none",
            fontFamily: "'Space Mono', monospace",
          }}
        >
          Check Your Registration →
        </a>
        <a
          href="https://sccvote.org/find-polling-place"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 10px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--sb-ink)",
            background: "transparent",
            border: "1px solid var(--sb-border)",
            borderRadius: 3,
            textDecoration: "none",
            fontFamily: "'Space Mono', monospace",
          }}
        >
          Find Your Polling Place
        </a>
        <span style={{ fontSize: 10, color: "var(--sb-muted)", marginLeft: "auto" }}>
          SCC Registrar of Voters · sccvote.org
        </span>
      </div>
    </div>
  );
}
