// ── 2026 Elections Card ──────────────────────────────────────────────────────
// Countdown to CA Primary, voter deadlines, and the actual races + candidates
// on the South Bay ballot.

import { useState } from "react";
import { RACES, GOV_POLLING_NOTE, PARTY_COLOR, type Race } from "../../../data/south-bay/elections-2026";

interface KeyDate {
  label: string;
  sublabel: string;
  isoDate: string;
  accentColor: string;
}

const KEY_DATES: KeyDate[] = [
  { label: "Voter Reg Deadline",   sublabel: "Online / mail-in",         isoDate: "2026-05-18", accentColor: "#1d4ed8" },
  { label: "Vote-by-Mail Cutoff",  sublabel: "Request deadline",          isoDate: "2026-05-26", accentColor: "#1d4ed8" },
  { label: "Early Voting Opens",   sublabel: "Vote centers + drop boxes", isoDate: "2026-05-09", accentColor: "#065f46" },
  { label: "CA Primary Election",  sublabel: "All registered voters",     isoDate: "2026-06-02", accentColor: "#c0392b" },
  { label: "General Election",     sublabel: "November statewide",        isoDate: "2026-11-03", accentColor: "#7c3aed" },
];

function daysUntil(isoDate: string): number {
  const now = new Date();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  return Math.ceil((target.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PartyChip({ party }: { party: Race["candidates"][number]["party"] }) {
  const c = PARTY_COLOR[party];
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      padding: "1px 5px",
      borderRadius: 3,
      background: c.bg,
      color: c.fg,
      letterSpacing: "0.04em",
      flexShrink: 0,
    }}>
      {party}
    </span>
  );
}

function RaceRow({ race }: { race: Race }) {
  const [expanded, setExpanded] = useState(false);
  const hasCandidates = race.candidates.length > 0;

  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid var(--sb-border-light)",
        borderRadius: 4,
        background: race.unopposed ? "#fafafa" : "#fff",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        disabled={!hasCandidates}
        style={{
          all: "unset",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          width: "100%",
          cursor: hasCandidates ? "pointer" : "default",
        }}
      >
        <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>{race.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--sb-ink)" }}>
              {race.race}
            </span>
            {race.unopposed && (
              <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Unopposed
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--sb-muted)", lineHeight: 1.4, marginTop: 2 }}>
            {race.summary}
          </div>
        </div>
        {hasCandidates && (
          <span style={{ fontSize: 11, color: "var(--sb-muted)", marginTop: 2, flexShrink: 0 }}>
            {expanded ? "▴" : `▾ ${race.candidates.length}`}
          </span>
        )}
      </button>

      {expanded && hasCandidates && (
        <div style={{ marginTop: 10, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 5 }}>
          {race.candidates.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11 }}>
              <PartyChip party={c.party} />
              <span style={{ fontWeight: 600, color: "var(--sb-ink)" }}>{c.name}</span>
              {c.incumbent && (
                <span style={{ fontSize: 9, color: "#065f46", fontWeight: 700, padding: "1px 4px", background: "#d1fae5", borderRadius: 2, marginTop: 1 }}>
                  INC
                </span>
              )}
              {c.note && (
                <span style={{ color: "var(--sb-muted)", lineHeight: 1.4 }}>— {c.note}</span>
              )}
            </div>
          ))}
          {race.id === "ca-governor" && (
            <div style={{ marginTop: 6, padding: "6px 8px", background: "#fef9ec", border: "1px solid #fde68a", borderRadius: 3, fontSize: 10, color: "#78350f", lineHeight: 1.5 }}>
              <strong>Polls:</strong> {GOV_POLLING_NOTE}
            </div>
          )}
          <a
            href={race.infoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 10,
              color: "var(--sb-accent)",
              textDecoration: "none",
              fontWeight: 600,
              marginTop: 4,
              alignSelf: "flex-start",
            }}
          >
            Race details →
          </a>
        </div>
      )}
    </div>
  );
}

export default function ElectionsCard() {
  const primaryDays = daysUntil("2026-06-02");
  const generalDays = daysUntil("2026-11-03");

  // Don't show if both elections are past
  if (primaryDays < -7 && generalDays < -7) return null;

  const pastPrimary = primaryDays < -7;
  const focusDays = pastPrimary ? generalDays : primaryDays;
  const focusLabel = pastPrimary ? "General Election" : "CA Primary";

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
                  {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Races on the ballot ── */}
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
          On Your Ballot · {RACES.length} races
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {RACES.map((r) => (
            <RaceRow key={r.id} race={r} />
          ))}
        </div>
        <p style={{ fontSize: 10, color: "var(--sb-muted)", marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
          Tap any race to see candidates. US Senate isn't on the 2026 ballot — Padilla next runs in 2028.
        </p>
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
          SCC Registrar · sccvote.org
        </span>
      </div>
    </div>
  );
}
