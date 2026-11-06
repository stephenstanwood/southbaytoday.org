// Stable, readable URLs for event detail pages: "<date>-<title-slug>", with a
// deterministic "-2"/"-3" suffix when two same-day events share a title (e.g.
// storytimes at different branches). Sourced performances on one production
// page use curtain order, preserving a matinee URL when an evening is restored.
// Title copy-edits change the slug — rare
// and acceptable for short-lived listing pages; ids stay out of URLs because
// upstream id shapes vary by source.

export interface SluggableEvent {
  id?: string | null;
  title?: string | null;
  date?: string | null;
  time?: string | null;
  url?: string | null;
  occurrenceEvidence?: {
    kind?: string;
    sourceUrl?: string;
    date?: string;
    time?: string;
  };
}

function sourcedPerformanceMinute(event: SluggableEvent): number | null {
  const evidence = event.occurrenceEvidence;
  if (!event.url || !evidence?.kind?.startsWith("first-party")
    || evidence.sourceUrl !== event.url || evidence.date !== event.date
    || evidence.time !== event.time) return null;
  const clock = /^(1[0-2]|[1-9]):([0-5]\d) (AM|PM)$/.exec(event.time || "");
  return clock ? (Number(clock[1]) % 12 + (clock[3] === "PM" ? 12 : 0)) * 60 + Number(clock[2]) : null;
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Assign every event a unique slug. Collision suffixes are assigned after an
 * id sort, except that separately sourced performances sharing one production
 * page sort by curtain time. Feed order never changes the result.
 */
export function buildEventSlugs<T extends SluggableEvent>(events: T[]): Map<string, T> {
  const eligible = events
    .filter((e) => e.title && e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .slice()
    .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));

  const groups = new Map<string, number[]>();
  eligible.forEach((e, index) => {
    const base = `${e.date}-${slugifyTitle(e.title as string)}`;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(index);
  });
  for (const indices of groups.values()) {
    const events = indices.map((index) => eligible[index]);
    if (events.length > 1 && events.every((e) => e.url === events[0].url
      && sourcedPerformanceMinute(e) !== null)
      && new Set(events.map(sourcedPerformanceMinute)).size === events.length) {
      events.sort((a, b) => sourcedPerformanceMinute(a)! - sourcedPerformanceMinute(b)!);
      indices.forEach((index, order) => { eligible[index] = events[order]; });
    }
  }

  const bySlug = new Map<string, T>();
  for (const e of eligible) {
    const base = `${e.date}-${slugifyTitle(e.title as string)}`;
    if (!base || base === e.date) continue; // title slugged to nothing
    let slug = base;
    let n = 2;
    while (bySlug.has(slug)) {
      slug = `${base}-${n}`;
      n += 1;
    }
    bySlug.set(slug, e);
  }
  return bySlug;
}

/** slug for one event, consistent with buildEventSlugs (no collision suffix). */
export function eventSlugBase(e: SluggableEvent): string | null {
  if (!e.title || !e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return null;
  const t = slugifyTitle(e.title);
  return t ? `${e.date}-${t}` : null;
}
