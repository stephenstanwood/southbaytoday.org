import { useState, useMemo } from "react";
import {
  DEV_PROJECTS,
  DEV_PULSE,
  STATUS_CONFIG,
  CATEGORY_LABELS,
  type DevStatus,
  type DevCategory,
} from "../../../data/south-bay/development-data";

// ── Filters config ──────────────────────────────────────────────────────────

const STATUS_FILTERS: { id: DevStatus | "all"; label: string }[] = [
  { id: "all",                label: "All"               },
  { id: "under-construction", label: "Under Construction" },
  { id: "approved",           label: "Approved"          },
  { id: "opening-soon",       label: "Opening Soon"      },
  { id: "completed",          label: "Completed"         },
  { id: "proposed",           label: "Proposed"          },
  { id: "on-hold",            label: "On Hold"           },
];

const CATEGORY_FILTERS: { id: DevCategory | "all"; label: string }[] = [
  { id: "all",         label: "All"         },
  { id: "transit",     label: "Transit"     },
  { id: "tech-campus", label: "Tech Campus" },
  { id: "mixed-use",   label: "Mixed-Use"   },
  { id: "housing",     label: "Housing"     },
  { id: "retail",      label: "Retail"      },
  { id: "civic",       label: "Civic"       },
];

// Status sort order (active projects first)
const STATUS_ORDER: Record<DevStatus, number> = {
  "under-construction": 0,
  "opening-soon":       1,
  approved:             2,
  proposed:             3,
  "on-hold":            4,
  completed:            5,
};

// ── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DevStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="dev-status-badge"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

// ── Category tag ────────────────────────────────────────────────────────────

function CategoryTag({ category }: { category: DevCategory }) {
  return (
    <span className="dev-category-tag">{CATEGORY_LABELS[category]}</span>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export default function DevelopmentView() {
  const [statusFilter, setStatusFilter] = useState<DevStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<DevCategory | "all">("all");

  const filtered = useMemo(() => {
    return DEV_PROJECTS.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      return true;
    }).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [statusFilter, categoryFilter]);

  const activeCount = DEV_PROJECTS.filter(
    (p) => p.status === "under-construction" || p.status === "approved"
  ).length;

  return (
    <div className="dev-view">

      {/* Header */}
      <div className="dev-header">
        <div className="dev-header-eyebrow">South Bay / Development</div>
        <h1 className="dev-header-title">What's Being Built</h1>
        <p className="dev-header-subtitle">
          Major projects proposed, approved, and under construction across the South Bay — from transit infrastructure to tech campuses to new neighborhoods.
        </p>
        <div className="dev-header-note">
          Data curated from public records and news reports as of March 2026. Details may have changed. {activeCount} projects actively in development.
        </div>
      </div>

      {/* Pulse stats */}
      <div className="dev-pulse">
        {DEV_PULSE.map((item) => (
          <div key={item.label} className="dev-pulse-item">
            <div className="dev-pulse-value">{item.value}</div>
            <div className="dev-pulse-label">{item.label}</div>
            <div className="dev-pulse-note">{item.note}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="dev-filters-wrap">
        {/* Status filter */}
        <div className="dev-filter-row">
          <span className="dev-filter-label">Status</span>
          <div className="dev-filter-pills">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                className={`dev-filter-pill${statusFilter === f.id ? " dev-filter-pill--active" : ""}`}
                onClick={() => setStatusFilter(f.id as DevStatus | "all")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category filter */}
        <div className="dev-filter-row">
          <span className="dev-filter-label">Type</span>
          <div className="dev-filter-pills">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.id}
                className={`dev-filter-pill${categoryFilter === f.id ? " dev-filter-pill--active" : ""}`}
                onClick={() => setCategoryFilter(f.id as DevCategory | "all")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Project count */}
      <div className="dev-results-count">
        {filtered.length} {filtered.length === 1 ? "project" : "projects"}
        {statusFilter !== "all" || categoryFilter !== "all" ? " (filtered)" : ""}
      </div>

      {/* Projects list */}
      {filtered.length === 0 ? (
        <div className="dev-empty">
          <div className="dev-empty-icon">🏗️</div>
          <div>No projects match these filters.</div>
        </div>
      ) : (
        <div className="dev-list">
          {filtered.map((project) => (
            <article key={project.id} className="dev-card">
              {/* Card header row */}
              <div className="dev-card-meta">
                <StatusBadge status={project.status} />
                <CategoryTag category={project.category} />
                {project.featured && (
                  <span className="dev-featured-badge">★ Signature Project</span>
                )}
              </div>

              {/* Title + city */}
              <h2 className="dev-card-title">{project.name}</h2>
              <div className="dev-card-location">📍 {project.city}</div>

              {/* Description */}
              <p className="dev-card-description">{project.description}</p>

              {/* Details row */}
              <div className="dev-card-details">
                {project.scale && (
                  <div className="dev-detail">
                    <span className="dev-detail-label">Scale</span>
                    <span className="dev-detail-value">{project.scale}</span>
                  </div>
                )}
                {project.developer && (
                  <div className="dev-detail">
                    <span className="dev-detail-label">Developer</span>
                    <span className="dev-detail-value">{project.developer}</span>
                  </div>
                )}
                {project.timeline && (
                  <div className="dev-detail">
                    <span className="dev-detail-label">Timeline</span>
                    <span className="dev-detail-value">{project.timeline}</span>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Footer note */}
      <div className="dev-footer-note">
        South Bay Signal tracks major publicly-announced development projects. Data is curated from city records, planning documents, and published news. Not all projects are included — focus is on notable, large-scale, or high-public-interest developments.
      </div>

    </div>
  );
}
