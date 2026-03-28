import type { City } from "../../../lib/south-bay/types";

export interface BlotterEntry {
  date: string;
  time: string;
  type: string;
  location: string;
  priority?: string | number;
}

export interface CityBlotter {
  city: City;
  cityName: string;
  entries: BlotterEntry[];
  source: string;
  sourceUrl: string;
  generatedAt: string;
}

interface Props {
  blotter: CityBlotter;
}

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  theft: { bg: "#FEF2F2", fg: "#991B1B" },
  burglary: { bg: "#FEF2F2", fg: "#991B1B" },
  robbery: { bg: "#FEF2F2", fg: "#991B1B" },
  vandalism: { bg: "#FFF7ED", fg: "#92400E" },
  disturbance: { bg: "#FFF7ED", fg: "#92400E" },
  trespass: { bg: "#FFF7ED", fg: "#92400E" },
  assault: { bg: "#FEF2F2", fg: "#991B1B" },
  fraud: { bg: "#F5F3FF", fg: "#5B21B6" },
  traffic: { bg: "#F0FDF4", fg: "#166534" },
  dui: { bg: "#FEF2F2", fg: "#991B1B" },
  noise: { bg: "#EFF6FF", fg: "#1E40AF" },
  "missing person": { bg: "#FFF7ED", fg: "#92400E" },
  other: { bg: "#F3F4F6", fg: "#374151" },
};

function typeColor(type: string) {
  const key = type.toLowerCase();
  for (const [k, v] of Object.entries(TYPE_COLORS)) {
    if (key.includes(k)) return v;
  }
  return TYPE_COLORS.other;
}

export default function BlotterCard({ blotter }: Props) {
  if (blotter.entries.length === 0) return null;

  return (
    <div
      style={{
        border: "1.5px solid var(--sb-border-light)",
        borderRadius: "var(--sb-radius-lg, 6px)",
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--sb-card)",
          borderBottom: "1px solid var(--sb-border-light)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--sb-ink)" }}>
            {blotter.cityName}
          </span>
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: "var(--sb-light)",
              fontFamily: "'Space Mono', monospace",
            }}
          >
            {blotter.entries.length} recent calls
          </span>
        </div>
        <a
          href={blotter.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: "var(--sb-accent)", textDecoration: "none" }}
        >
          {blotter.source} →
        </a>
      </div>

      {/* Entries */}
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {blotter.entries.map((entry, i) => {
          const colors = typeColor(entry.type);
          return (
            <div
              key={i}
              style={{
                padding: "8px 14px",
                borderBottom: i < blotter.entries.length - 1 ? "1px solid var(--sb-border-light)" : "none",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                fontSize: 12,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "'Space Mono', monospace",
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: colors.bg,
                  color: colors.fg,
                  whiteSpace: "nowrap",
                  minWidth: 60,
                  textAlign: "center",
                }}
              >
                {entry.type}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "var(--sb-ink)" }}>{entry.location}</span>
                <span
                  style={{
                    marginLeft: 8,
                    color: "var(--sb-light)",
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 10,
                  }}
                >
                  {entry.date} {entry.time}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
