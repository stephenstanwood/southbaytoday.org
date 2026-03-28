import {
  TRANSIT_AGENCIES,
  ROAD_PROJECTS,
  TRANSIT_MILESTONES,
  TRANSIT_PULSE,
  QUICK_LINKS,
  STATUS_CONFIG,
  type TransitAgency,
  type RoadProject,
  type TransitMilestone,
} from "../../../data/south-bay/transit-data";

// ── Service status badge ─────────────────────────────────────────────────────

function StatusBadge({ agency }: { agency: TransitAgency }) {
  const cfg = STATUS_CONFIG[agency.status];
  return (
    <span className="transit-status-badge" style={{ color: cfg.color, background: cfg.bg }}>
      <span
        className="transit-status-dot"
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}

// ── Impact badge ─────────────────────────────────────────────────────────────

function ImpactBadge({ impact }: { impact: RoadProject["impact"] }) {
  const map = {
    low:      { label: "Low Impact",      color: "#065F46", bg: "#D1FAE5" },
    moderate: { label: "Moderate Impact", color: "#92400E", bg: "#FEF3C7" },
    high:     { label: "High Impact",     color: "#991B1B", bg: "#FEE2E2" },
  };
  const cfg = map[impact];
  return (
    <span className="transit-impact-badge" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

// ── Milestone status dot ─────────────────────────────────────────────────────

function MilestoneDot({ status }: { status: TransitMilestone["status"] }) {
  const colors = {
    completed:   "#10B981",
    "in-progress": "#F59E0B",
    upcoming:    "#9CA3AF",
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: colors[status],
        flexShrink: 0,
        marginTop: 5,
      }}
    />
  );
}

// ── Agency card ──────────────────────────────────────────────────────────────

function AgencyCard({ agency }: { agency: TransitAgency }) {
  const hasAlerts = agency.alerts.length > 0;
  return (
    <article className="transit-agency-card">
      {/* Header */}
      <div className="transit-agency-header">
        <div className="transit-agency-title-row">
          <span className="transit-agency-emoji">{agency.emoji}</span>
          <div>
            <h2 className="transit-agency-name">{agency.name}</h2>
            <p className="transit-agency-description">{agency.description}</p>
          </div>
        </div>
        <StatusBadge agency={agency} />
      </div>

      {/* Status note */}
      <div className="transit-status-note">{agency.statusNote}</div>

      {/* Key routes */}
      {agency.keyRoutes && (
        <div className="transit-routes">
          {agency.keyRoutes.map((r) => (
            <span key={r} className="transit-route-pill">{r}</span>
          ))}
        </div>
      )}

      {/* Alerts */}
      {hasAlerts && (
        <div className="transit-alerts">
          {agency.alerts.map((alert) => (
            <div key={alert.id} className="transit-alert">
              <div className="transit-alert-summary">{alert.summary}</div>
              {alert.detail && (
                <div className="transit-alert-detail">{alert.detail}</div>
              )}
              <div className="transit-alert-meta">
                {alert.affectedRoutes && (
                  <span className="transit-alert-routes">{alert.affectedRoutes}</span>
                )}
                {alert.endDate && (
                  <span className="transit-alert-date">Through {alert.endDate}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Links */}
      <div className="transit-agency-links">
        <a href={agency.url} target="_blank" rel="noopener noreferrer" className="transit-link">
          {agency.shortName} website ↗
        </a>
        {agency.realtimeUrl && (
          <a href={agency.realtimeUrl} target="_blank" rel="noopener noreferrer" className="transit-link transit-link--primary">
            Real-time departures ↗
          </a>
        )}
      </div>
    </article>
  );
}

// ── Road project card ────────────────────────────────────────────────────────

function RoadCard({ project }: { project: RoadProject }) {
  const typeLabel: Record<RoadProject["type"], string> = {
    "construction":    "Construction",
    "closure":         "Road Closure",
    "lane-reduction":  "Lane Reduction",
    "improvement":     "Improvement",
  };
  return (
    <article className="transit-road-card">
      <div className="transit-road-header">
        <div>
          <div className="transit-road-highway">{project.highway}</div>
          <div className="transit-road-type">{typeLabel[project.type]}</div>
        </div>
        <ImpactBadge impact={project.impact} />
      </div>
      <h3 className="transit-road-title">{project.title}</h3>
      <div className="transit-road-cities">
        📍 {project.cities.join(" · ")}
      </div>
      <p className="transit-road-description">{project.description}</p>
      {project.schedule && (
        <div className="transit-road-schedule">🗓 {project.schedule}</div>
      )}
    </article>
  );
}

// ── Milestone row ────────────────────────────────────────────────────────────

function MilestoneRow({ milestone }: { milestone: TransitMilestone }) {
  const statusLabel: Record<TransitMilestone["status"], string> = {
    completed: "Done",
    "in-progress": "In Progress",
    upcoming: "Upcoming",
  };
  return (
    <div className="transit-milestone-row">
      <MilestoneDot status={milestone.status} />
      <div className="transit-milestone-content">
        <div className="transit-milestone-project">{milestone.projectName}</div>
        <div className="transit-milestone-milestone">{milestone.milestone}</div>
        {milestone.note && (
          <div className="transit-milestone-note">{milestone.note}</div>
        )}
      </div>
      <div className="transit-milestone-right">
        <div className="transit-milestone-date">{milestone.date}</div>
        <div
          className="transit-milestone-status"
          style={{
            color: milestone.status === "completed" ? "#10B981" :
                   milestone.status === "in-progress" ? "#F59E0B" : "#9CA3AF"
          }}
        >
          {statusLabel[milestone.status]}
        </div>
      </div>
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function TransitView() {
  const alertCount = TRANSIT_AGENCIES.reduce((n, a) => n + a.alerts.length, 0);
  const activeAlerts = TRANSIT_AGENCIES.filter(
    (a) => a.status === "minor-delays" || a.status === "major-disruption"
  ).length;

  return (
    <div className="transit-view">

      {/* Header */}
      <div className="transit-header">
        <div className="transit-header-eyebrow">South Bay / Transit & Roads</div>
        <h1 className="transit-header-title">Getting Around</h1>
        <p className="transit-header-subtitle">
          Service status, alerts, and road projects for the South Bay — Caltrain, VTA, BART, ACE, and key highways.
        </p>
        <div className="transit-header-note">
          Static snapshot updated March 2026. For live departures, use the real-time links on each card.
        </div>
      </div>

      {/* Pulse stats */}
      <div className="transit-pulse">
        {TRANSIT_PULSE.map((item) => (
          <div key={item.label} className="transit-pulse-item">
            <div className="transit-pulse-value">{item.value}</div>
            <div className="transit-pulse-label">{item.label}</div>
            <div className="transit-pulse-note">{item.note}</div>
          </div>
        ))}
      </div>

      {/* System-wide alert banner if any agency has disruptions */}
      {activeAlerts > 0 && (
        <div className="transit-banner transit-banner--warning">
          <span className="transit-banner-icon">⚠️</span>
          <span>
            {activeAlerts} {activeAlerts === 1 ? "agency" : "agencies"} reporting delays or disruptions.
            See details below.
          </span>
        </div>
      )}

      {/* ── Section: Transit Agencies ── */}
      <div className="transit-section-header">
        <span className="transit-section-title">Transit Agencies</span>
        <span className="transit-section-count">{TRANSIT_AGENCIES.length} covered</span>
      </div>

      <div className="transit-agencies-grid">
        {TRANSIT_AGENCIES.map((agency) => (
          <AgencyCard key={agency.id} agency={agency} />
        ))}
      </div>

      {/* ── Section: Road Projects ── */}
      <div className="transit-section-header" style={{ marginTop: 40 }}>
        <span className="transit-section-title">Active Road Projects</span>
        <span className="transit-section-count">{ROAD_PROJECTS.length} projects</span>
      </div>

      <div className="transit-roads-grid">
        {ROAD_PROJECTS.map((project) => (
          <RoadCard key={project.id} project={project} />
        ))}
      </div>

      {/* ── Section: Project Milestones ── */}
      <div className="transit-section-header" style={{ marginTop: 40 }}>
        <span className="transit-section-title">Transit Project Timeline</span>
        <span className="transit-section-count">Key milestones</span>
      </div>

      <div className="transit-milestones">
        {TRANSIT_MILESTONES.map((m) => (
          <MilestoneRow key={m.id} milestone={m} />
        ))}
      </div>

      {/* ── Section: Quick Links ── */}
      <div className="transit-section-header" style={{ marginTop: 40 }}>
        <span className="transit-section-title">Live Tools</span>
        <span className="transit-section-count">Real-time resources</span>
      </div>

      <div className="transit-quicklinks">
        {QUICK_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="transit-quicklink"
          >
            <div className="transit-quicklink-label">{link.label}</div>
            <div className="transit-quicklink-desc">{link.description}</div>
            <div className="transit-quicklink-arrow">↗</div>
          </a>
        ))}
      </div>

      {/* Footer */}
      <div className="transit-footer-note">
        South Bay Signal transit data is a static snapshot curated from public sources including Caltrain, VTA, BART, ACE, and Caltrans.
        For real-time departures and live incident data, use the links above. Always check agency sites before travel.
      </div>

    </div>
  );
}
