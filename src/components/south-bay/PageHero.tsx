import type { CSSProperties, ReactNode } from "react";

interface PageHeroStat {
  value: ReactNode;
  label: string;
  note?: ReactNode;
}

interface PageHeroProps {
  eyebrow: string;
  title: string;
  description: ReactNode;
  note?: ReactNode;
  stats?: PageHeroStat[];
  headingId?: string;
}

export default function PageHero({
  eyebrow,
  title,
  description,
  note,
  stats = [],
  headingId,
}: PageHeroProps) {
  const resolvedHeadingId = headingId ?? `sb-page-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-heading`;
  const statsStyle = {
    "--sb-page-stat-count": Math.max(stats.length, 1),
  } as CSSProperties;

  return (
    <section className="sb-page-hero" aria-labelledby={resolvedHeadingId}>
      <div className="sb-page-hero-copy">
        <div className="sb-page-kicker">{eyebrow}</div>
        <h1 id={resolvedHeadingId} className="sb-page-title">{title}</h1>
        <p className="sb-page-subtitle">{description}</p>
        {note ? <div className="sb-page-note">{note}</div> : null}
      </div>

      {stats.length > 0 ? (
        <div className="sb-page-stats" style={statsStyle} aria-label={`${title} data summary`}>
          {stats.map((stat) => (
            <div key={stat.label} className="sb-page-stat">
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
              {stat.note ? <p>{stat.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
